import hashlib,pathlib,runpy,sys
p=pathlib.Path(__file__).with_name('native-version-operator-ddf00d729a91-core.py')
if hashlib.sha256(p.read_bytes()).hexdigest()!='9652631606e8414b3965c330419be62c6a85ee55b1415f29cc9cc443689cd321':raise SystemExit('Operator source mismatch')
ns=runpy.run_path(str(p))
sys.exit(ns['main']('launch'))
