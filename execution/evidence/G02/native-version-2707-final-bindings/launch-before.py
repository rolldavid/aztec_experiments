import hashlib,pathlib,runpy,sys
p=pathlib.Path(__file__).with_name('native-version-operator-2707-core.py')
if hashlib.sha256(p.read_bytes()).hexdigest()!='cd3571a5e6db228b2dd055477320d60fc7734a82c8329bfa57da767fc3a60a5f':raise SystemExit('Operator source mismatch')
ns=runpy.run_path(str(p))
sys.exit(ns['main']('launch'))
