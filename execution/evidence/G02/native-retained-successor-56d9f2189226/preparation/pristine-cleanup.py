import hashlib,pathlib,runpy,sys
p=pathlib.Path(__file__).with_name('native-version-operator-56d9f2189226-core.py')
if hashlib.sha256(p.read_bytes()).hexdigest()!='75e020f72e9f37676de7ef8832bc7ed6c7428327fb6ec31eb6e7c571af05d57a':raise SystemExit('Operator source mismatch')
ns=runpy.run_path(str(p))
sys.exit(ns['main']('cleanup'))
