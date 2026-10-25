# Generated SDK retention after UI publication

`publish.py` now calls the sibling `prune-inactive-sdk-outputs.py` after successful
readback, the activation receipt, and packet-payload cleanup. There is no timer or
new service. Run publication serially: no other deployment writer may stage or
activate while retention runs.

Future packet producers must copy the repository helper beside `publish.py` and
add this object to `plan.json` before hashing the plan:

```python
helper = root / 'deploy/restoration-20261021/ui/prune-inactive-sdk-outputs.py'
shutil.copyfile(helper, packet / helper.name)
plan['sdkRetention'] = {
    'helperSha256': hashlib.sha256(helper.read_bytes()).hexdigest(),
    'stagedSources': staged_source_paths,
}
```

`staged_source_paths` is the complete list of other prepared/in-progress source
release directories from the existing operator deployment inventory, or `[]` when
none exist. Include any release reserved for an additional rollback. The current
packet's new source, previously configured source, running source, new UI and
previous UI are protected automatically. Include the sibling helper in the packet
archive/transfer's exact member inventory. Do not change already staged packets;
this requirement applies to packets built with the new publisher.

Before any unlink, the helper also protects release paths referenced by local
configuration, effective systemd services, all process command lines/maps/open
files/cwd/executables, and current symlinks. Reference discovery is repeated after
candidate validation. An unexpected access error refuses cleanup.

Only regular `.build/sdk` JS/MJS/WASM files listed as outputs in that release's
SDK manifest can be removed. Old output bytes need not match an obsolete build:
there is no historical repair prerequisite. Manifests, application source,
`node_modules`, native binaries, configs, credentials, static UI/by-hash assets and
entire release directories remain untouched. Unlinking hardlinks never modifies
the surviving file. Reported reclaimable allocation counts an inode only when all
of its links are selected; actual free space is recorded after cleanup.

`sdk-retention-result.json` records cleanup separately. If cleanup refuses after
activation, `activation-result.json` remains the successful publication record and
`sdkRetentionCleaned` is false. Do not reactivate or restart services to retry
cleanup. Resolve the refusal and invoke the helper with a reviewed JSON plan:

```json
{"candidates":["/opt/rolling-app/releases/obsolete-release"],
 "protected":["/opt/rolling-app/releases/current-source",
              "/opt/rolling-app/releases/previous-source"]}
```

`python3 prune-inactive-sdk-outputs.py plan.json` previews only. Add `--apply` for
explicit cleanup. Both modes refresh live references. Keep the existing operating
reserve preflight; this cleanup does not replace it or manage Docker/chain data.

Focused local checks:

```sh
python3 -m unittest discover -s deploy/restoration-20261021/ui -p 'test_*.py'
```
