import hashlib,pathlib,runpy,sys
p=pathlib.Path(__file__).with_name('native-version-operator-2707-core.py')
if hashlib.sha256(p.read_bytes()).hexdigest()!='c57321f2e37252a68f243fd9bed314beffda9ef21bf8fc8524e02f832de3c107':raise SystemExit('Operator source mismatch')
ns=runpy.run_path(str(p))
sys.exit(ns['main']('observe'))
