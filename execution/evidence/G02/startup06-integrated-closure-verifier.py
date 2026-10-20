import pathlib,json,hashlib,subprocess,ast,os
OWN=pathlib.Path.cwd();ROOT=OWN.parent/'aztec_experiments';c=json.loads((OWN/'prover/rolling-artifacts.json').read_text())
paths=['prover','deploy/prover/bootstrap.py','deploy/prover/startup-stages.mjs','scripts/toolchain.mjs','shared/remote-prover-wire.mjs','shared/trusted-private-node.mjs','toolchain.json','package.json','package-lock.json','crs-manifest.json','apps/src/billboard/billboard_artifact.json','apps/src/billboard/private_fee_artifact.json','plugins/adapter_artifact.json']+[x['path'] for x in c['artifacts']]+list(c['inputs'])
files=set()
for base in [OWN,ROOT]:
 for rel in paths:
  p=base/rel
  if p.is_dir():files.update(x.relative_to(base).as_posix() for x in p.rglob('*') if x.is_file() and x.name!='.DS_Store' and not x.name.startswith('._'))
  else:files.add(rel)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
diff=[]
for rel in sorted(files):
 a=sha(OWN/rel) if (OWN/rel).is_file() else None;b=sha(ROOT/rel) if (ROOT/rel).is_file() else None
 if a!=b:diff.append({'path':rel,'candidateSha256':a,'rootSha256':b})
print(json.dumps({'sourceDifferences':diff},indent=2))
assert set(v['path'] for v in diff)<=set()
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()=='c06235f83603e904dbc86cb9cad59dc2b8981584'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()=='04f41a280ff7eb8d64c9f0333bf0e6924b6b536f'
assert not subprocess.check_output(['git','status','--short'],text=True).strip()
r={'schemaVersion':1,'source':'c06235f83603e904dbc86cb9cad59dc2b8981584','comparedRoot':'04f41a280ff7eb8d64c9f0333bf0e6924b6b536f','sourceFiles':len(files),'differences':diff,'allPackageClosureBytesMatchIntegratedRoot':True,'nodeModulesSameResolvedDirectory':(OWN/'node_modules').resolve()==(ROOT/'node_modules').resolve(),'noRootIntegrationClaim':True}
assert r['nodeModulesSameResolvedDirectory']
p=OWN/'execution/evidence/G02/startup06-integrated-source-comparison.json';p.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
