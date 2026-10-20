"""Prepared controlled doubles only. No provider or service calls."""
import base64,datetime,hashlib,json,pathlib,runpy,tempfile,unittest
from unittest.mock import patch
PATH=pathlib.Path(__file__).with_name('native-version-operator-2707-core.py')

def fixture():
 ns={};exec(compile(PATH.read_text(),str(PATH),'exec'),ns)
 b={k:'a'*64 for k in ns['BINDING_KEYS']}
 b.update(campaign='native-version-20261013-abcdef012345',createdAt='2026-10-13T12:00:00Z',budgetStop='2026-10-13T12:45:00Z',commissioningStop='2026-10-13T12:30:00Z',latestLaunch='2026-10-13T12:10:00Z',payloadBytes=8,securityGroup='sg-0123456789abcdef0',subnets=['subnet-12345678'],cumulativeBoundUsd=215.28)
 ns['now']=lambda:datetime.datetime(2026,10,13,12,1,tzinfo=datetime.timezone.utc)
 return ns,b

def receipt(ns,b):
 row={'bytes':0,'sha256':hashlib.sha256(b'').hexdigest(),'truncated':False}
 return {'schemaVersion':1,'mode':'native-version-only','passed':True,'nodeStartupQualified':False,'proofJobs':0,'binarySha256':ns['BINARY_SHA'],'binaryBytes':ns['BINARY_BYTES'],'expectedVersion':ns['BINARY_VERSION'],'controlSourceSha256':b['controlSourceSha256'],'workerSha256':b['workerSha256'],'budgetStop':b['budgetStop'],'commissioningStop':b['commissioningStop'],'guestPreflight':{'status':'passed','architecture':'x86_64','libc':{'status':'observed','major':2,'minor':39},'loaderAvailable':True,'os':{'status':'observed','ubuntu2404':True},'cpu':{'status':'observed','processors':2,'vendor':'amd','flags':{k:True for k in ('sse4_2','avx','avx2','avx512f','bmi2','adx')}}},'stage':'complete','controlsVerified':True,'resultStatus':'observed','outcome':'passed',
 'state':{'status':'observed','ActiveState':'inactive','SubState':'dead','Result':'success','ExecMainCode':1,'ExecMainStatus':0,'ExecMainStartTimestampMonotonic':123},
 'result':{'schemaVersion':1,'started':True,'timeout':False,'reaped':True,'returnCode':0,'versionMatches':True,'stdout':dict(row),'stderr':dict(row)}}

class NativeOperator(unittest.TestCase):
 def test_unbound_is_no_authority_and_upload_does_not_need_future_payload(self):
  ns,b=fixture()
  with self.assertRaises(ValueError):ns['require_bindings'](None)
  future={'launchGrantSha256','payloadReviewSha256','payloadSha256','payloadBytes','controlSourceSha256','workerSha256','createdAt','budgetStop','commissioningStop','latestLaunch','securityGroup','subnets'}
  prep={k:None if k in future else v for k,v in b.items()}
  self.assertEqual(ns['require_bindings'](prep,'upload'),prep)
  with self.assertRaises(ValueError):ns['require_bindings'](prep,'launch')
  for key,value in [('campaign','../prior'),('budgetStop','2026-10-13T13:00:00Z'),('latestLaunch','2026-10-13T12:11:00Z'),('payloadBytes',16385),('cumulativeBoundUsd',301),('sourceSha256','PRIVATE_SENTINEL')]:
   with self.assertRaises(ValueError):ns['require_bindings']({**b,key:value})
 def test_exclusive_journal_preserves_prior_on_collision(self):
  ns,b=fixture()
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t)/'intent';ns['save'](p,{'first':True});raw=p.read_bytes()
   with self.assertRaises(FileExistsError):ns['save'](p,{'second':True})
   self.assertEqual(p.read_bytes(),raw);self.assertEqual(p.stat().st_mode&0o777,0o600)
 def test_strict_receipt_known_private_fields_and_false_success(self):
  ns,b=fixture();good=receipt(ns,b)
  self.assertEqual(ns['receipt_projection'](json.dumps(good).encode(),b),good)
  for path in [('stage',),('outcome',),('expectedVersion',),('state','Result'),('state','ActiveState'),('result','stdout','sha256')]:
   bad=json.loads(json.dumps(good));row=bad
   for key in path[:-1]:row=row[key]
   row[path[-1]]='PRIVATE_SENTINEL'*1000
   with self.assertRaises(ValueError):ns['receipt_projection'](json.dumps(bad).encode(),b)
  for change in [{'controlSourceSha256':'0'*64},{'controlsVerified':False},{'nodeStartupQualified':True}]:
   with self.assertRaises(ValueError):ns['receipt_projection'](json.dumps({**good,**change}).encode(),b)
  bad=json.loads(json.dumps(good));bad['result']['timeout']=True
  with self.assertRaises(ValueError):ns['receipt_projection'](json.dumps(bad).encode(),b)
  raw=json.dumps(good).encode()
  with self.assertRaises(ValueError):ns['receipt_projection'](b'{"schemaVersion":1,'+raw[1:],b)
  with self.assertRaises(ValueError):ns['receipt_projection'](b'x'*8193,b)
 def test_guest_facts_are_closed_and_required_for_success(self):
  ns,b=fixture();good=receipt(ns,b)
  for path,value in [(('architecture',),'PRIVATE_SENTINEL'),(('libc','major'),True),(('libc','minor'),1000),(('libc','status'),'PRIVATE_SENTINEL'),(('os','ubuntu2404'),'PRIVATE_SENTINEL'),(('cpu','processors'),0),(('cpu','vendor'),'PRIVATE_SENTINEL'),(('cpu','flags','avx2'),'PRIVATE_SENTINEL'),(('extra',),'PRIVATE_SENTINEL')]:
   bad=json.loads(json.dumps(good));row=bad['guestPreflight']
   for k in path[:-1]:row=row[k]
   row[path[-1]]=value
   with self.assertRaises(ValueError):ns['receipt_projection'](json.dumps(bad).encode(),b)
  for path,value in [(('libc','minor'),33),(('cpu','processors'),1),(('cpu','vendor'),'intel'),(('loaderAvailable',),False)]:
   bad=json.loads(json.dumps(good));row=bad['guestPreflight']
   for k in path[:-1]:row=row[k]
   row[path[-1]]=value
   with self.assertRaises(ValueError):ns['receipt_projection'](json.dumps(bad).encode(),b)
   row=bad['guestPreflight'];row['status']='failed'
   with self.assertRaises(ValueError):ns['receipt_projection'](json.dumps(bad).encode(),b)
   bad.update(stage='guest-preflight',passed=False,outcome='precondition-or-io-failure',state={'status':'not-observed'},resultStatus='not-observed');bad.pop('result')
   self.assertEqual(ns['receipt_projection'](json.dumps(bad).encode(),b)['guestPreflight'],row)
  missing=dict(good);missing.pop('guestPreflight')
  with self.assertRaises(ValueError):ns['receipt_projection'](json.dumps(missing).encode(),b)
  early=dict(good);early.update(stage='controls',passed=False,outcome='precondition-or-io-failure',guestPreflight={'status':'not-observed'},state={'status':'not-observed'},resultStatus='not-observed');early.pop('result')
  self.assertFalse(ns['receipt_projection'](json.dumps(early).encode(),b)['passed'])
  early['stage']='version'
  with self.assertRaises(ValueError):ns['receipt_projection'](json.dumps(early).encode(),b)
 def test_state_transport_projection_and_timeout_remain_distinct(self):
  ns,b=fixture()
  for status in ('transport-error','projection-error'):
   r=receipt(ns,b);r.update(passed=False,outcome='state-unreadable');r['state']={'status':status}
   self.assertEqual(ns['receipt_projection'](json.dumps(r).encode(),b)['state']['status'],status)
  r=receipt(ns,b);r.update(passed=False,outcome='timeout');r['result']['timeout']=True;r['result']['returnCode']=-9
  self.assertFalse(ns['receipt_projection'](json.dumps(r).encode(),b)['passed'])
 def prepare_launch(self,ns,b,p):
  payload=b'fixture!';review=b'review';b['payloadSha256']=hashlib.sha256(payload).hexdigest();b['payloadReviewSha256']=hashlib.sha256(review).hexdigest()
  for name,data in [('user-data.gz',payload),('payload-review.json',review)]:
   (p/name).write_bytes(data);(p/name).chmod(0o600)
  ns['save'](p/'bootstrap.json',{'mode':'native-version-only','binarySha256':ns['BINARY_SHA'],'binaryBytes':ns['BINARY_BYTES'],'expectedVersion':ns['BINARY_VERSION'],**{k:b[k] for k in ('createdAt','budgetStop','commissioningStop')}})
  ns['preflight']=lambda *args:None
 def launch_transport(self,ns,b,p,fail=None):
  calls=[]
  def call(args,region='us-east-1',timeout=30):
   calls.append(args)
   if args[1]=='head-object':return {'VersionId':ns['BINARY_OBJECT_VERSION'],'ContentLength':ns['BINARY_BYTES'],'ChecksumSHA256':base64.b64encode(bytes.fromhex(ns['BINARY_SHA'])).decode(),'ServerSideEncryption':'AES256'}
   if args[1]=='describe-security-groups':return {'SecurityGroups':[{'GroupId':b['securityGroup'],'IpPermissions':[{'IpProtocol':'tcp'}] if fail=='ingress' else []}]}
   if args[1]=='describe-instance-types':return {'InstanceTypes':[{'InstanceType':'m7a.large','VCpuInfo':{'DefaultVCpus':2,'DefaultCores':2},'MemoryInfo':{'SizeInMiB':8192},'ProcessorInfo':{'SupportedArchitectures':['x86_64']}}]}
   if args[1]=='describe-images':return {'Images':[{'OwnerId':'099720109477','Architecture':'x86_64','State':'available','RootDeviceType':'ebs','RootDeviceName':'/dev/sda1'}]}
   if args[1]=='create-launch-template':
    self.assertTrue((p/'lt-intent.json').exists())
    if fail=='lt-unknown':raise TimeoutError('PRIVATE_SENTINEL')
    return {'LaunchTemplate':{'LaunchTemplateName':b['campaign'],'LaunchTemplateId':'lt-0123456789abcdef0','LatestVersionNumber':1}}
   if args[1]=='describe-launch-template-versions':return {'LaunchTemplateVersions':[{'LaunchTemplateData':json.loads((p/'lt-data.json').read_text())}]}
   if args[1]=='create-fleet':
    self.assertTrue((p/'fleet-intent.json').exists())
    if fail=='fleet-unknown':raise TimeoutError('PRIVATE_SENTINEL')
    return {'FleetId':'fleet-12345678-1234-1234-1234-123456789abc'}
   if args[1]=='describe-fleets':return {'Fleets':[{'Type':'request','TerminateInstancesWithExpiration':True,'ValidUntil':b['budgetStop']}]}
   raise AssertionError('unexpected fixed fake call')
  return call,calls
 def test_launch_exact_limits_and_intent_before_each_single_mutation(self):
  ns,b=fixture()
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);self.prepare_launch(ns,b,p);call,calls=self.launch_transport(ns,b,p)
   self.assertTrue(ns['launch_once'](b,p,call)['passed'])
   self.assertEqual(calls[0][0:2],['s3api','head-object']);self.assertTrue((p/'binary-reuse-readback.json').is_file());self.assertFalse(any(x[1]=='put-object' for x in calls))
   data=json.loads((p/'lt-data.json').read_text());self.assertEqual(data['InstanceType'],'m7a.large');self.assertEqual(len(data['BlockDeviceMappings']),1)
   self.assertEqual(data['BlockDeviceMappings'][0]['Ebs']['VolumeSize'],40);self.assertNotIn('IamInstanceProfile',data);self.assertNotIn('KeyName',data)
   fleet=json.loads((p/'fleet-request.json').read_text());self.assertEqual(fleet['Type'],'request');self.assertTrue(fleet['TerminateInstancesWithExpiration']);self.assertEqual(fleet['ValidUntil'],b['budgetStop'])
   count=len(calls)
   with self.assertRaisesRegex(ValueError,'RECONCILE_ONLY'):ns['launch_once'](b,p,call)
   self.assertEqual(len(calls),count)
 def test_unknown_launch_never_replayed_and_ingress_never_changed(self):
  for failure in ('lt-unknown','fleet-unknown','ingress'):
   ns,b=fixture()
   with self.subTest(failure=failure),tempfile.TemporaryDirectory() as t:
    p=pathlib.Path(t);self.prepare_launch(ns,b,p);call,calls=self.launch_transport(ns,b,p,failure)
    with self.assertRaises((ValueError,TimeoutError)):ns['launch_once'](b,p,call)
    if failure=='ingress':self.assertFalse((p/'lt-intent.json').exists());self.assertEqual(sum(x[1].startswith('create') for x in calls),0)
    else:
     count=len(calls)
     with self.assertRaisesRegex(ValueError,'RECONCILE_ONLY'):ns['launch_once'](b,p,call)
     self.assertEqual(len(calls),count)
 def test_reused_binary_head_exact_region_owner_version_and_safe_projection(self):
  ns,b=fixture();calls=[]
  def call(args,region='us-east-1',timeout=30):
   calls.append((args,region));self.assertEqual(region,'eu-west-2')
   self.assertEqual(args,['s3api','head-object','--bucket',ns['BUCKET'],'--key',ns['BINARY_KEY'],'--version-id',ns['BINARY_OBJECT_VERSION'],'--checksum-mode','ENABLED','--expected-bucket-owner',ns['ACCOUNT']])
   return {'VersionId':ns['BINARY_OBJECT_VERSION'],'ContentLength':ns['BINARY_BYTES'],'ChecksumSHA256':base64.b64encode(bytes.fromhex(ns['BINARY_SHA'])).decode(),'ServerSideEncryption':'AES256','Metadata':{'secret':'PRIVATE_SENTINEL'}}
  result=ns['verify_existing_binary'](call)
  self.assertEqual(len(calls),1);self.assertEqual(result['versionId'],ns['BINARY_OBJECT_VERSION']);self.assertEqual(result['sha256'],ns['BINARY_SHA']);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(result))
 def test_reuse_missing_or_malformed_head_fails_before_financial_journal_or_call(self):
  ns,b=fixture();good={'VersionId':ns['BINARY_OBJECT_VERSION'],'ContentLength':ns['BINARY_BYTES'],'ChecksumSHA256':base64.b64encode(bytes.fromhex(ns['BINARY_SHA'])).decode(),'ServerSideEncryption':'AES256'}
  cases=[None,[],{},*({k:v for k,v in good.items() if k!=missing} for missing in good),{**good,'VersionId':'different-version'},{**good,'VersionId':7},{**good,'ContentLength':True},{**good,'ContentLength':ns['BINARY_BYTES']-1},{**good,'ChecksumSHA256':'PRIVATE_SENTINEL'},{**good,'ChecksumSHA256':None},{**good,'ServerSideEncryption':'aws:kms'}]
  for head in cases:
   with self.subTest(head=head),tempfile.TemporaryDirectory() as t:
    p=pathlib.Path(t);self.prepare_launch(ns,b,p);calls=[]
    def call(args,*rest):calls.append(args);self.assertEqual(args[0:2],['s3api','head-object']);return head
    with self.assertRaisesRegex(ValueError,'EXISTING_BINARY_MISMATCH'):ns['launch_once'](b,p,call)
    self.assertEqual(len(calls),1);self.assertFalse((p/'lt-intent.json').exists());self.assertFalse((p/'fleet-intent.json').exists());self.assertFalse((p/'binary-reuse-readback.json').exists());self.assertFalse((p/'upload-send-intent.json').exists())
 def test_reuse_timeout_has_no_fallback_or_mutation(self):
  ns,b=fixture();error=TimeoutError('PRIVATE_SENTINEL')
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);self.prepare_launch(ns,b,p);calls=[]
   def call(args,*rest):calls.append(args);raise error
   with self.assertRaises(TimeoutError) as caught:ns['launch_once'](b,p,call)
   self.assertIs(caught.exception,error);self.assertEqual([x[0:2] for x in calls],[['s3api','head-object']])
   self.assertFalse(any((p/x).exists() for x in ['lt-intent.json','fleet-intent.json','upload-send-intent.json','binary-reuse-readback.json']))
 def test_successor_runtime_binding_rejects_old_control_receipt_and_unbound_authority(self):
  ns,b=fixture();actual=ns['BINDINGS']
  self.assertEqual(actual['campaign'],'native-version-20261013-2707fd93cc0e')
  self.assertEqual(actual['controlSourceSha256'],'8dd78da93de6051d5bf542345e48b6de71ebb5dd8a085df1e1e2d469d5367908')
  self.assertEqual(actual['workerSha256'],'151d21ad85d85b37b02ae8589607b8787e06a6f6977d0fb1a7d9d1756d814878')
  for operation in ('launch','observe','cleanup'):
   with self.assertRaises(ValueError):ns['require_bindings'](actual,operation)
  b.update(controlSourceSha256=actual['controlSourceSha256'],workerSha256=actual['workerSha256'])
  good=receipt(ns,b);self.assertTrue(ns['receipt_projection'](json.dumps(good).encode(),b)['passed'])
  good['controlSourceSha256']='db751fe18563a58e6d6399e0dd4bcc29a600efe3987c74dec02e56112e38ce04'
  with self.assertRaisesRegex(ValueError,'RECEIPT_BINDING'):ns['receipt_projection'](json.dumps(good).encode(),b)
 def test_upload_unknown_is_durable_and_no_rebroadcast(self):
  ns,b=fixture()
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);binary=p/'bb';binary.write_bytes(b'fake-public-binary')
   ns.update(BINARY=binary,BINARY_BYTES=binary.stat().st_size,BINARY_SHA=hashlib.sha256(binary.read_bytes()).hexdigest(),preflight=lambda *args:None)
   calls=[]
   def call(args,*rest):
    calls.append(args)
    if args[1]=='list-objects-v2':return []
    self.assertEqual(args[1],'put-object');self.assertTrue((p/'upload-send-intent.json').exists());self.assertIn('--if-none-match',args);raise TimeoutError('PRIVATE_SENTINEL')
   with self.assertRaises(TimeoutError):ns['upload_once'](b,p,call)
   count=len(calls)
   with self.assertRaisesRegex(ValueError,'RECONCILE_ONLY'):ns['upload_once'](b,p,call)
   self.assertEqual(len(calls),count)
 def test_cleanup_gate_one_send_and_readback_still_required(self):
  ns,b=fixture();fleet={'FleetState':'active'};identifier='fleet-12345678-1234-1234-1234-123456789abc'
  ns['owned_fleet']=lambda *args:(identifier,fleet)
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);calls=[]
   def call(args):
    calls.append(args)
    if args[0]=='sts':return {'Account':ns['ACCOUNT']}
    self.assertEqual(args[1],'delete-fleets');self.assertTrue((p/'delete-intent.json').exists());return {'SuccessfulFleetDeletions':[{'FleetId':identifier,'CurrentFleetState':'deleted_terminating','PreviousFleetState':'active'}]}
   with self.assertRaisesRegex(ValueError,'CLEANUP_GATE'):ns['cleanup_once'](b,p,None,call)
   obs={'receipt':receipt(ns,b)};result=ns['cleanup_once'](b,p,obs,call)
   self.assertTrue(result['resourceAbsencePending'])
   with self.assertRaisesRegex(ValueError,'RECONCILE_ONLY'):ns['cleanup_once'](b,p,obs,call)
   self.assertEqual(sum(x[0]=='ec2' for x in calls),1)
   fleet['FleetState']='deleted';self.assertTrue(ns['cleanup_once'](b,p,obs,call)['alreadyDeleted'])
 def test_root_mapping_and_independent_volume_observation_required(self):
  ns,b=fixture();vid='vol-0123456789abcdef0'
  valid={'InstanceId':'i-0123456789abcdef0','State':{'Name':'running'},'InstanceType':'m7a.large','ImageId':ns['AMI'],'MetadataOptions':{'HttpTokens':'required'},'SecurityGroups':[{'GroupId':b['securityGroup']}],'BlockDeviceMappings':[{'DeviceName':'/dev/sda1','Ebs':{'VolumeId':vid,'DeleteOnTermination':True}}]}
  cases=[('valid',valid,True,True),('missing',{k:v for k,v in valid.items() if k!='BlockDeviceMappings'},True,False),('empty',{**valid,'BlockDeviceMappings':[]},True,False),('wrong-root',{**valid,'BlockDeviceMappings':[{'DeviceName':'/dev/sdb','Ebs':{'VolumeId':vid,'DeleteOnTermination':True}}]},True,False),('incomplete',{**valid,'BlockDeviceMappings':[{'DeviceName':'/dev/sda1'}]},True,False),('unobserved-volume',valid,False,False)]
  for label,instance,has_volume,expected in cases:
   with self.subTest(case=label):
    def call(args):
     if args[1]=='describe-instances':return {'Reservations':[{'Instances':[instance]}]}
     if args[1]=='describe-instance-attribute':return {'InstanceInitiatedShutdownBehavior':{'Value':'terminate'}}
     if args[1]=='describe-volumes':return {'Volumes':[{'VolumeId':vid,'State':'in-use','Encrypted':True,'Size':40,'VolumeType':'gp3','Iops':3000,'Throughput':125}] if has_volume else []}
     raise AssertionError('unexpected fake request')
    result=ns['resource_snapshot'](b,call)
    self.assertIs(result['instances'][0]['controlsVerified'],expected)
 def test_malformed_empty_wrong_fleet_delete_ack_is_not_success_or_replayed(self):
  ns,b=fixture();identifier='fleet-12345678-1234-1234-1234-123456789abc';ns['owned_fleet']=lambda *args:(identifier,{'FleetState':'active'})
  good={'FleetId':identifier,'CurrentFleetState':'deleted_terminating','PreviousFleetState':'active'}
  for response in ({},{'SuccessfulFleetDeletions':[]},{'SuccessfulFleetDeletions':None},{'SuccessfulFleetDeletions':[{}]}, {'SuccessfulFleetDeletions':[{**good,'FleetId':'fleet-00000000-0000-0000-0000-000000000000'}]}, {'SuccessfulFleetDeletions':[good,good]}, {'SuccessfulFleetDeletions':[good],'UnsuccessfulFleetDeletions':[{'FleetId':identifier}]}, {'SuccessfulFleetDeletions':[{**good,'CurrentFleetState':'PRIVATE_SENTINEL'}]}):
   with self.subTest(response=response),tempfile.TemporaryDirectory() as t:
    p=pathlib.Path(t);calls=[]
    def call(args):
     if args[0]=='sts':return {'Account':ns['ACCOUNT']}
     calls.append(args);self.assertTrue((p/'delete-intent.json').exists());return response
    with self.assertRaisesRegex(ValueError,'DELETE_RESULT'):ns['cleanup_once'](b,p,{'receipt':receipt(ns,b)},call)
    with self.assertRaisesRegex(ValueError,'RECONCILE_ONLY'):ns['cleanup_once'](b,p,{'receipt':receipt(ns,b)},call)
    self.assertEqual(len(calls),1)
 def test_missing_receipt_preserves_resource_observation(self):
  ns,b=fixture();ns['owned_fleet']=lambda *args:('fleet-12345678-1234-1234-1234-123456789abc',{'FleetState':'active'})
  ns['resource_snapshot']=lambda *args:{'instances':[],'volumes':[],'instancesTerminated':True,'volumesAbsent':True}
  def call(args,*rest):
   if args[0]=='sts':return {'Account':ns['ACCOUNT']}
   raise TimeoutError('PRIVATE_SENTINEL')
  with tempfile.TemporaryDirectory() as t:
   result=ns['observe_once'](b,pathlib.Path(t),call)
   self.assertEqual(result['receiptStatus'],'unavailable');self.assertIn('resources',result);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(result))

if __name__=='__main__':unittest.main(verbosity=2)
