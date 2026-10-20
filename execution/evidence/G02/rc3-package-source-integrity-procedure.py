# Read package archives as data only; no install, import, extraction outside evidence, or package scripts.
import urllib.request,json,hashlib,base64,tarfile,io,time,pathlib
E=pathlib.Path(__file__).parent;start=time.monotonic();out={'schemaVersion':1,'readOnlyPackageData':True,'installed':False,'evaluated':False,'packages':{}}
selection={'constants':['dest/constants.gen.js'],'noir-protocol-circuits-types':['dest/vk_tree.js','dest/artifacts/vks/tree.js','dest/entrypoint/vk-tree.js'],'protocol-contracts':['dest/protocol_contract_data.js','dest/genesis_data.js'],'aztec':['dest/cli/cmds/standby.js','dest/cli/cmds/start_node.js'],'pxe':['dest/pxe.js','dest/contract_class_service/contract_class_service.js','dest/contract_class_service.js','dest/note_processor/produce_note_daos.js'],'aztec.js':['dest/wallet/base_wallet.js','dest/contract/contract_function_interaction.js']}
for package,paths in selection.items():
 row={};out['packages'][package]=row
 try:
  u=f'https://registry.npmjs.org/@aztec-labs/{package}/6.0.0-rc.3';row['metadataUrl']=u
  with urllib.request.urlopen(u,timeout=10) as r:metadata=r.read(262145);assert len(metadata)<=262144;d=json.loads(metadata)
  row['metadataSha256']=hashlib.sha256(metadata).hexdigest();row['version']=d['version'];row['dependencies']=d.get('dependencies',{});row['engines']=d.get('engines');row['dist']=d['dist'];url=d['dist']['tarball'];assert url.startswith(f'https://registry.npmjs.org/@aztec-labs/{package}/-/')
  with urllib.request.urlopen(url,timeout=15) as r:b=r.read(33554433);assert len(b)<=33554432
  assert 'sha512-'+base64.b64encode(hashlib.sha512(b).digest()).decode()==d['dist']['integrity'];assert hashlib.sha1(b).hexdigest()==d['dist']['shasum'];row['registryIntegrityVerified']=True;row['compressedBytes']=len(b);row['archiveSha256']=hashlib.sha256(b).hexdigest();row['files']={}
  with tarfile.open(fileobj=io.BytesIO(b),mode='r|gz') as t:
   count=0;size=0
   for member in t:
    count+=1;size+=member.size;assert count<1000 and size<=150000000
    name=member.name.removeprefix('package/')
    if name in paths:
     assert member.isfile() and member.size<=1048576;data=t.extractfile(member).read();assert len(data)==member.size;safe=E/('rc3-registry-'+package+'-'+name.replace('/','_')+'.txt');safe.write_bytes(data);row['files'][name]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'evidence':safe.name}
  row['requestedPathsMissing']=[p for p in paths if p not in row['files']]
 except Exception as error:row['failureCategory']=type(error).__name__
 print(json.dumps({'package':package,'integrityVerified':row.get('registryIntegrityVerified',False),'compressedBytes':row.get('compressedBytes'),'files':row.get('files',{}),'failureCategory':row.get('failureCategory')}),flush=True)
out['elapsedSeconds']=round(time.monotonic()-start,3);p=E/'rc3-registry-source-integrity.json';p.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'report':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'elapsedSeconds':out['elapsedSeconds']}))
