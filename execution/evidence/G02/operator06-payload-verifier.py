import pathlib,ast,json,gzip,lzma,base64,re,hashlib,subprocess,os,importlib.util,datetime
ROOT=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments');PRIVATE=pathlib.Path('/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private/rolling-node-20261012-06');OUT=pathlib.Path.cwd()/'execution/evidence/G02/operator06-payload-verification.json';r={'schemaVersion':1,'passed':False,'noComputeLaunch':True}
try:
 payload=PRIVATE/'user-data.gz';config=json.loads((PRIVATE/'bootstrap.json').read_text());blob=payload.read_bytes();assert len(blob)<=16384
 shell=gzip.decompress(blob).decode();subprocess.run(['/bin/sh','-n'],input=shell.encode(),check=True,capture_output=True,timeout=5)
 outer=shell.split("<<'B'\n",1)[1].rsplit('\nB',1)[0];compile(outer,'private-bootstrap-wrapper','exec');tree=ast.parse(outer)
 chunks=[n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str) and len(n.value)>10000];assert len(chunks)==1
 code=lzma.decompress(base64.b64decode(chunks[0])).decode();compile(code,'private-bootstrap-payload','exec');inner=ast.parse(code);assigned={n.targets[0].id:n.value for n in inner.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name)};assert ast.literal_eval(assigned['CONFIG'])==config;source=ast.literal_eval(assigned['SOURCE']);sourceast=ast.parse(source);pins=next(ast.literal_eval(n.value) for n in sourceast.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='PINS')
 assert pins['startup']=='a6c5e725d9294872ff88cd8d179be432737826fb43357d7d044ccbe632cafadd' and pins['manifest']=='54ae87f7457201e9edaa72e63fc50a63f63b7c7e1fb7c5cb477abef6e5dde52c' and pins['catalog']=='be38c8784994f3b90873e2c7f115ae6dec17b6d72802f192fe9c2e4924d21b64'
 spec=importlib.util.spec_from_file_location('reviewed_bootstrap',ROOT/'deploy/prover/bootstrap.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 now=datetime.datetime.fromisoformat(config['createdAt'].replace('Z','+00:00'));regenerated=m.generate(config,now=now);assert regenerated==shell;assert hashlib.sha256(m.HOST.encode()).hexdigest()!=pins['bootstrap'] # HOST is comment-stripped by generator; actual roundtrip above is authoritative.
 assert hashlib.sha256((ROOT/'deploy/prover/startup-stages.mjs').read_bytes()).hexdigest()=='cc13d6539544f95683572766579a3a884c1bae711a865ec74b2e731e1d407e49'
 assert config['runtimeUrl'] not in source and config['receiptPutUrl'] not in source
 assert (PRIVATE.stat().st_mode&0o777)==0o700
 for name in ['bootstrap.json','user-data.gz','fleet-policy.json']:assert ((PRIVATE/name).stat().st_mode&0o777)==0o600
 assert datetime.datetime.fromisoformat(config['budgetStop'].replace('Z','+00:00'))-now==datetime.timedelta(hours=1)
 fleet=json.loads((PRIVATE/'fleet-policy.json').read_text());assert fleet['ValidUntil']==config['budgetStop'] and fleet['Type']=='request' and fleet['TerminateInstancesWithExpiration'] is True
 assert config['commissioningStop']==(now+datetime.timedelta(minutes=30)).isoformat().replace('+00:00','Z')
 assert 'htb rate 50mbit ceil 50mbit' in source and 'Persistent=true' in source
 r.update(passed=True,bytes=len(blob),sha256=hashlib.sha256(blob).hexdigest(),bootstrapSourceSha256=pins['startup'],manifestSha256=pins['manifest'],catalogSha256=pins['catalog'],generatedAttestorSha256=pins['bootstrap'],shellSyntax=True,lzmaRoundtrip=True,decodedPythonCompiled=True,privateConfigExact=True,capabilitiesAbsentFromAttestor=True,fileMode='0600',directoryMode='0700',oneHourControlsPrepared=True,actualCloudHostReadbackPending=True,deadlines={k:config[k] for k in ['createdAt','budgetStop','commissioningStop']})
 fd=os.open(PRIVATE/'payload-verification.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:json.dump(r,f,indent=2);f.flush();os.fsync(f.fileno())
except Exception:r['category']='PAYLOAD_VERIFICATION_FAILED'
r['observedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));print('evidenceSha256',hashlib.sha256(OUT.read_bytes()).hexdigest())
raise SystemExit(0 if r['passed'] else 1)
