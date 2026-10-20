import pathlib,socket,ipaddress,json,hashlib,subprocess
p=pathlib.Path('/var/lib/rolling-bootstrap-private/dedicated-bok-effective')
unit=pathlib.Path('/etc/systemd/system/rolling-bok-testnet.service').read_text()
assert 'IPAddressDeny=169.254.169.254/32 fd00:ec2::254/128' in unit
hosts=['d30njln0kead8n.cloudfront.net','ethereum-sepolia-rpc.publicnode.com','api.venice.ai','api.github.com','github.com']
resolved={}
for host in hosts:
 values=sorted({x[4][0] for x in socket.getaddrinfo(host,443,family=socket.AF_INET,type=socket.SOCK_STREAM)})
 assert values and all(ipaddress.ip_address(x).is_global for x in values)
 resolved[host]=values
body='127.0.0.1 localhost\n::1 localhost ip6-localhost ip6-loopback\n'+''.join(ip+' '+host+'\n' for host,ips in resolved.items() for ip in ips)
allow='IPAddressAllow=localhost 127.0.0.53 '+' '.join(sorted({ip for ips in resolved.values() for ip in ips}))
unit='\n'.join(allow if l.startswith('IPAddressAllow=') else l for l in unit.splitlines())+'\n'
unit=unit.replace('ProtectSystem=strict','ProtectSystem=strict\nBindReadOnlyPaths=/etc/rolling-bok-testnet/resolved-hosts:/etc/hosts')
(p/'resolved-hosts').write_text(body);(p/'rolling-bok-testnet-resolved.service').write_text(unit)
subprocess.run(['systemd-analyze','verify',str(p/'rolling-bok-testnet-resolved.service')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print(json.dumps({'resolved':resolved,'hostsSha256':hashlib.sha256(body.encode()).hexdigest(),'unitSha256':hashlib.sha256(unit.encode()).hexdigest(),'metadataDenied':True,'scope':'service-only host mapping for declared peers, originalTLSnames'}))
