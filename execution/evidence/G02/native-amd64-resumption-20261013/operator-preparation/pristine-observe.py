import hashlib,pathlib,runpy,sys
p=pathlib.Path(__file__).with_name('native-version-operator-2707-core.py')
if hashlib.sha256(p.read_bytes()).hexdigest()!='97b3ea096852089bd1c4963b6c7bab07193bfa585a2f3f3e1ce3258559cb34da':raise SystemExit('Operator source mismatch')
ns=runpy.run_path(str(p))
sys.exit(ns['main']('observe'))
