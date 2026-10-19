#!/usr/bin/env python3
"""Stage current public Bok artifacts for a compute-independent CloudFront origin.

Input is the trusted service's catalog, never a generated application's manifest.
This command does not change DNS, bucket policy, or the active distribution.
"""
import argparse
import hashlib
import json
import re
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request


def sha(data):
    return hashlib.sha256(data).hexdigest()


def hexadecimal(value, size):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{%d}' % size, value)


def public_routes(catalog):
    """Only latest enabled revisions; directory index aliases need no edge code."""
    assert catalog['schema'] == 1 and isinstance(catalog['threads'], dict)
    assert len(catalog['threads']) <= 128
    routes = {}
    for thread_id, thread in catalog['threads'].items():
        assert hexadecimal(thread_id, 64) and type(thread['disabled']) is bool
        if thread['disabled']:
            continue
        revision = thread['latest']
        assert hexadecimal(revision, 40)
        meta = thread['revisions'][revision]
        binding = meta['binding']
        assert binding['id'] == thread_id and binding['revision'] == revision
        assert binding['repositoryId'] == thread['repositoryId']
        assert binding['threadId'] == thread['threadId']
        identity = json.dumps([thread['repositoryId'], thread['threadId']], separators=(',', ':'))
        assert sha(identity.encode()) == thread_id
        assert hexadecimal(binding['sourceArchiveSha256'], 64)
        manifest = meta['manifest']
        assert 0 < len(manifest) <= 256
        assert any(f['path'] == 'index.html' for f in manifest)
        for entry in manifest:
            name = entry['path']
            assert isinstance(name, str) and len(name) <= 240
            parts = name.split('/')
            assert all(re.fullmatch(r'[A-Za-z0-9.][A-Za-z0-9_.-]*', p)
                       and p not in ('.', '..') for p in parts)
            assert hexadecimal(entry['sha256'], 64)
            assert type(entry['bytes']) is int and 0 <= entry['bytes'] <= 1048576
            paths = [f't/{thread_id}/latest/{name}', f't/{thread_id}/r/{revision}/files/{name}']
            if name == 'index.html':
                paths.append(f't/{thread_id}/latest/')
            for route in paths:
                assert route not in routes
                routes[route] = dict(sha256=entry['sha256'], bytes=entry['bytes'], revision=revision)
        for route in [f't/{thread_id}/source.json', f't/{thread_id}/r/{revision}/source.json']:
            assert route not in routes
            routes[route] = dict(sha256=binding['sourceArchiveSha256'], bytes=None, revision=revision)
    assert routes, 'No accepted public artifact to retain'
    return routes


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Artifact origin redirected')


def stage(catalog, origin, bucket, prefix, s3):
    parsed = urlsplit(origin)
    assert parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password
    assert parsed.path in ('', '/') and not parsed.query and not parsed.fragment
    assert re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', bucket)
    assert re.fullmatch(r'published/[a-zA-Z0-9-]{1,80}', prefix)
    routes = public_routes(catalog)
    opener = build_opener(NoRedirect)
    # Read and authenticate every public byte before writing any destination.
    bodies = {}
    total = 0
    for route, item in routes.items():
        with opener.open(Request(origin.rstrip('/') + '/' + route), timeout=30) as response:
            assert response.status == 200
            assert response.headers.get('X-Source-Revision') == item['revision']
            body = response.read(14 * 1024 * 1024 + 1)
            assert len(body) <= 14 * 1024 * 1024 and sha(body) == item['sha256']
            assert item['bytes'] is None or len(body) == item['bytes']
            content_type = response.headers.get('Content-Type')
            assert content_type and '\n' not in content_type and '\r' not in content_type
            headers = {'ContentType': content_type, 'CacheControl': 'no-store'}
            if route.endswith('/source.json'):
                headers['ContentDisposition'] = 'attachment; filename="source-' + item['revision'] + '.json"'
            bodies[route] = (body, headers)
            total += len(body)
            assert total <= 256 * 1024 * 1024
    inventory = []
    for route, (body, headers) in bodies.items():
        key = prefix + '/' + route
        item = routes[route]
        # Conditional creation prevents replacing a different snapshot on retry.
        try:
            s3.put_object(Bucket=bucket, Key=key, Body=body, IfNoneMatch='*',
                          ServerSideEncryption='AES256',
                          Metadata={'sha256': item['sha256'], 'source-revision': item['revision']}, **headers)
        except s3.exceptions.ClientError as error:
            if error.response['Error']['Code'] not in ('PreconditionFailed', '412'):
                raise
        observed = s3.get_object(Bucket=bucket, Key=key)
        with observed['Body'] as stream:
            stored = stream.read(len(body) + 1)
        assert stored == body
        assert observed['Metadata'] == {'sha256': item['sha256'], 'source-revision': item['revision']}
        assert all(observed.get(k) == v for k, v in headers.items())
        assert observed['ServerSideEncryption'] == 'AES256'
        inventory.append({'route': '/' + route, 'key': key, **item, 'bytes': len(body)})
    return {'schema': 1, 'bucket': bucket, 'prefix': prefix, 'catalogSha256': sha(json.dumps(catalog, sort_keys=True).encode()),
            'objects': inventory, 'bytes': total, 'distributionChanged': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('catalog', 'origin', 'bucket', 'prefix', 'output'):
        parser.add_argument('--' + flag, required=True)
    parser.add_argument('--profile', default='message-board-deploy')
    parser.add_argument('--region', default='us-east-1')
    args = parser.parse_args()
    from pathlib import Path
    import boto3
    raw = Path(args.catalog).read_bytes()
    assert len(raw) <= 8 * 1024 * 1024
    result = stage(json.loads(raw), args.origin, args.bucket, args.prefix,
                   boto3.Session(profile_name=args.profile, region_name=args.region).client('s3'))
    with open(args.output, 'x') as target:
        json.dump(result, target, indent=2)
    print(json.dumps({'objects': len(result['objects']), 'bytes': result['bytes'], 'distributionChanged': False}))


if __name__ == '__main__':
    main()
