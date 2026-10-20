import hashlib,pathlib,runpy,sys
p=pathlib.Path(__file__).with_name('native-version-operator-ddf00d729a91-core.py')
if hashlib.sha256(p.read_bytes()).hexdigest()!='fb9bdfd0edd7636f0632fa6e0a88cdb2d3f167e6293e2225c1ecce62e8b296a0':raise SystemExit('Operator source mismatch')
ns=runpy.run_path(str(p))
sys.exit(ns['main']('launch'))
