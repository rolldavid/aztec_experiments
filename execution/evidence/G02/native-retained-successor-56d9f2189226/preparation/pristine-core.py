"""Closed development operator successor. No authority until every binding is reviewed.

Based on the existing operator09 exclusive journal/AWS CLI workflow. Fixed one
upload, one LT/Fleet and one owned cleanup; uncertain actions are reconcile-only.
This file is preparation, not a launch grant. No module-level provider calls.
"""
import base64,datetime,hashlib,json,os,pathlib,re,stat,subprocess,urllib.request,uuid
ROOT=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments')
OWN=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-controls')
PRIVATE_PARENT=pathlib.Path('/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private')
ACCOUNT='052665140763'
BUCKET='anonymous-message-board-testnet-backups-nvdhcyurtoga'
BINARY_SHA='fa4b12adaefd5684b53b802346b9fe839ab3d6a4a829a5ea4efd6bd200e0829f'
BINARY_BYTES=44698432
BINARY_VERSION='6.0.0-rc.6'
BINARY_KEY='releases/native-bb-'+BINARY_SHA+'/bb'
BINARY_OBJECT_VERSION='GODU5XvItcwYTvFkDmb9sRJA50HHLSqL'
BINARY=OWN/'node_modules/@aztec-foundation/bb.js/build/amd64-linux/bb'
AMI='ami-0fa5967347d08d2df'
# Populated only after exact source, complete cost reservation, private payload
# and each operation's independent review. An empty mapping cannot perform I/O.
BINDINGS={'budgetStop': None, 'campaign': 'native-version-20261013-56d9f2189226', 'commissioningStop': None, 'controlSourceSha256': '802f142df2aead47e7adbf084aaa649918deab8f0c9afd82f51ab7c5b7fbdc84', 'createdAt': None, 'cumulativeBoundUsd': 235.28, 'latestLaunch': None, 'launchGrantSha256': None, 'operatorReviewSha256': None, 'payloadBytes': None, 'payloadReviewSha256': None, 'payloadSha256': None, 'preparationGrantSha256': None, 'securityGroup': 'sg-076e39ea1d8dbf8d0', 'sourceSha256': '31cd1316b908c46148015f5a0ce46deaf8f5fca26f0dd0b85891f24db1494535', 'subnets': ['subnet-aa91f4ce', 'subnet-a705ce88'], 'workerSha256': '151d21ad85d85b37b02ae8589607b8787e06a6f6977d0fb1a7d9d1756d814878'}
BINDING_KEYS={'campaign','sourceSha256','operatorReviewSha256','preparationGrantSha256','launchGrantSha256','payloadReviewSha256','payloadSha256','payloadBytes','controlSourceSha256','workerSha256','createdAt','budgetStop','commissioningStop','latestLaunch','securityGroup','subnets','cumulativeBoundUsd'}

def digest(path):
 h=hashlib.sha256()
 with pathlib.Path(path).open('rb') as file:
  while block:=file.read(1024*1024):h.update(block)
 return h.hexdigest()

def instant(value):
 if type(value) is not str or not re.fullmatch(r'20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z',value):raise ValueError('TIME')
 return datetime.datetime.strptime(value,'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)

def now():return datetime.datetime.now(datetime.timezone.utc)

def require_bindings(bindings,operation='launch'):
 if type(bindings) is not dict or set(bindings)!=BINDING_KEYS:raise ValueError('UNBOUND')
 future={'launchGrantSha256','payloadReviewSha256','payloadSha256','payloadBytes','controlSourceSha256','workerSha256','createdAt','budgetStop','commissioningStop','latestLaunch','securityGroup','subnets'}
 for key in BINDING_KEYS:
  if operation=='upload' and key in future and bindings[key] is None:continue
  if key.endswith('Sha256') and (type(bindings[key]) is not str or not re.fullmatch('[a-f0-9]{64}',bindings[key])):raise ValueError('UNBOUND')
 if type(bindings['campaign']) is not str or not re.fullmatch(r'native-version-[0-9]{8}-[a-f0-9]{12}',bindings['campaign']):raise ValueError('CAMPAIGN')
 if operation=='upload':return dict(bindings)
 start=instant(bindings['createdAt'])
 if instant(bindings['budgetStop'])!=start+datetime.timedelta(minutes=45) or instant(bindings['commissioningStop'])!=start+datetime.timedelta(minutes=30) or instant(bindings['latestLaunch'])!=start+datetime.timedelta(minutes=10):raise ValueError('DEADLINE')
 if type(bindings['payloadBytes']) is not int or not 1<=bindings['payloadBytes']<=16384:raise ValueError('PAYLOAD')
 if type(bindings['cumulativeBoundUsd']) not in (int,float) or not 215.28<=bindings['cumulativeBoundUsd']<=300:raise ValueError('BUDGET')
 if type(bindings['securityGroup']) is not str or not re.fullmatch('sg-[a-f0-9]{8,17}',bindings['securityGroup']):raise ValueError('GROUP')
 if type(bindings['subnets']) is not list or not 1<=len(bindings['subnets'])<=2 or len(set(bindings['subnets']))!=len(bindings['subnets']) or any(type(v) is not str or not re.fullmatch('subnet-[a-f0-9]{8,17}',v) for v in bindings['subnets']):raise ValueError('SUBNET')
 return dict(bindings)

def private_root(bindings):
 path=PRIVATE_PARENT/bindings['campaign']
 if path.resolve()!=path or not path.is_dir() or stat.S_IMODE(path.stat().st_mode)!=0o700 or path.stat().st_uid!=os.getuid():raise ValueError('PRIVATE_DIRECTORY')
 return path

def read_private(path,limit=32768):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  info=os.fstat(fd)
  if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o600 or info.st_uid!=os.getuid() or info.st_size>limit:raise ValueError('PRIVATE_FILE')
  with os.fdopen(fd,'rb',closefd=False) as file:data=file.read(limit+1)
  if len(data)>limit:raise ValueError('SIZE')
  return data
 finally:os.close(fd)

def save(path,value):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as file:json.dump(value,file,separators=(',',':'));file.flush();os.fsync(file.fileno())
 fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)

def aws(args,region='us-east-1',timeout=30):
 result=subprocess.run(['/usr/local/bin/aws',*args,'--profile','message-board-deploy','--region',region,'--no-cli-pager','--output','json'],capture_output=True,timeout=timeout,env={**os.environ,'AWS_MAX_ATTEMPTS':'1','AWS_RETRY_MODE':'standard'})
 if result.returncode:raise RuntimeError('AWS_UNAVAILABLE')
 return json.loads(result.stdout)

def plugin_idle():
 with urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=5) as response:
  body=response.read(16385)
  if response.status!=200 or len(body)>16384:raise ValueError('PLUGIN')
 health=json.loads(body)
 if type(health) is not dict or health.get('status') not in ('ready','degraded') or type(health.get('active')) is not int or health['active']!=0:raise ValueError('PLUGIN')
 return {'status':health['status'],'active':0,'diagnosticOnly':True}

def authorize(bindings,operation):
 b=require_bindings(bindings,operation);private=private_root(b)
 names={'upload':('preparation-grant.json','preparationGrantSha256'),'launch':('launch-grant.json','launchGrantSha256'),'observe':('launch-grant.json','launchGrantSha256'),'cleanup':('launch-grant.json','launchGrantSha256')}
 name,pin=names[operation]
 if digest(private/name)!=b[pin] or digest(private/'operator-review.json')!=b['operatorReviewSha256']:raise ValueError('AUTHORITY')
 grant=json.loads(read_private(private/name))
 if grant.get('campaign')!=b['campaign'] or grant.get('reservedUsd')!=10 or grant.get('cumulativeBoundUsd')!=b['cumulativeBoundUsd']:raise ValueError('RESERVATION')
 if operation in ('upload','launch'):
  if type(b['cumulativeBoundUsd']) not in (int,float) or not 215.28<=b['cumulativeBoundUsd']<=300:raise ValueError('BUDGET')
  if digest(OWN/'deploy/prover/bootstrap.py')!=b['sourceSha256']:raise ValueError('SOURCE')
  ledger=json.loads((ROOT/'execution/infrastructure-ledger.json').read_text())
  if ledger['conservative_committed_and_reserved_usd']!=b['cumulativeBoundUsd']:raise ValueError('LEDGER')
 if operation=='launch' and now()>=instant(b['latestLaunch']):raise ValueError('STALE')
 return b,private

def preflight(b,call=aws,idle=plugin_idle):
 if call(['sts','get-caller-identity'])['Account']!=ACCOUNT:raise ValueError('IDENTITY')
 if any(x!='terminated' for x in call(['ec2','describe-instances','--query','Reservations[].Instances[].State.Name'])):raise ValueError('OVERLAP')
 if call(['ec2','describe-volumes','--query','Volumes[].VolumeId']):raise ValueError('VOLUMES')
 if any(x!='deleted' for x in call(['ec2','describe-fleets','--query','Fleets[].FleetState'])):raise ValueError('FLEETS')
 return {'identityVerified':True,'instances':0,'volumes':0,'activeFleets':0,'plugin':idle()}

def upload_once(b,p,call=aws):
 if (p/'upload-send-intent.json').exists():raise ValueError('RECONCILE_ONLY')
 if BINARY.stat().st_size!=BINARY_BYTES or digest(BINARY)!=BINARY_SHA:raise ValueError('BINARY')
 preflight(b,call)
 existing=call(['s3api','list-objects-v2','--bucket',BUCKET,'--prefix',BINARY_KEY,'--expected-bucket-owner',ACCOUNT,'--query','Contents[].Key'],'eu-west-2')
 if existing:raise ValueError('EXISTING_OBJECT_RECONCILE_ONLY')
 checksum=base64.b64encode(bytes.fromhex(BINARY_SHA)).decode()
 save(p/'upload-send-intent.json',{'operation':'PutObject','attemptsAllowed':1,'key':BINARY_KEY,'sha256':BINARY_SHA,'bytes':BINARY_BYTES,'ifNoneMatch':'*','sourceSha256':b['sourceSha256'],'campaign':b['campaign'],'unknownOutcome':'reconcile-only'})
 result=call(['s3api','put-object','--bucket',BUCKET,'--key',BINARY_KEY,'--body',str(BINARY),'--if-none-match','*','--checksum-sha256',checksum,'--server-side-encryption','AES256','--content-type','application/octet-stream','--expected-bucket-owner',ACCOUNT],'eu-west-2',120)
 # Raw response remains private. Unknown/failed validation never re-sends.
 save(p/'upload-response.json',result)
 version=result.get('VersionId')
 if type(version) is not str or not re.fullmatch('[A-Za-z0-9_.-]{1,1024}',version):raise ValueError('VERSION')
 head=call(['s3api','head-object','--bucket',BUCKET,'--key',BINARY_KEY,'--version-id',version,'--checksum-mode','ENABLED','--expected-bucket-owner',ACCOUNT],'eu-west-2')
 if head['ContentLength']!=BINARY_BYTES or head['ChecksumSHA256']!=checksum or head['ServerSideEncryption']!='AES256':raise ValueError('OBJECT')
 save(p/'object-reference.json',{'bucket':BUCKET,'key':BINARY_KEY,'versionId':version,'sha256':BINARY_SHA,'bytes':BINARY_BYTES})
 return {'passed':True,'objectVerified':True,'computeCreated':False}

def verify_existing_binary(call=aws):
 # This successor reuses one previously acknowledged immutable object version.
 # HEAD is read-only and has no fallback, upload, or second attempt.
 head=call(['s3api','head-object','--bucket',BUCKET,'--key',BINARY_KEY,
            '--version-id',BINARY_OBJECT_VERSION,'--checksum-mode','ENABLED',
            '--expected-bucket-owner',ACCOUNT],'eu-west-2')
 expected={'VersionId':BINARY_OBJECT_VERSION,'ContentLength':BINARY_BYTES,
           'ChecksumSHA256':base64.b64encode(bytes.fromhex(BINARY_SHA)).decode(),
           'ServerSideEncryption':'AES256'}
 if type(head) is not dict or any(type(head.get(key)) is not type(value) or head.get(key)!=value for key,value in expected.items()):raise ValueError('EXISTING_BINARY_MISMATCH')
 return {'bucket':BUCKET,'key':BINARY_KEY,'versionId':BINARY_OBJECT_VERSION,
         'sha256':BINARY_SHA,'bytes':BINARY_BYTES,'encrypted':True,'verifiedBy':'versioned-head'}

def launch_once(b,p,call=aws):
 if any((p/name).exists() for name in ('lt-intent.json','fleet-intent.json')):raise ValueError('RECONCILE_ONLY')
 if now()>=instant(b['latestLaunch']):raise ValueError('STALE')
 if digest(p/'payload-review.json')!=b['payloadReviewSha256']:raise ValueError('PAYLOAD_REVIEW')
 body=read_private(p/'user-data.gz',16384)
 if len(body)!=b['payloadBytes'] or hashlib.sha256(body).hexdigest()!=b['payloadSha256']:raise ValueError('PAYLOAD')
 config=json.loads(read_private(p/'bootstrap.json'))
 if any(config[k]!=b[k] for k in ('createdAt','budgetStop','commissioningStop')) or config['mode']!='native-version-only' or config['binarySha256']!=BINARY_SHA or config['binaryBytes']!=BINARY_BYTES or config['expectedVersion']!=BINARY_VERSION:raise ValueError('CONFIG')
 preflight(b,call)
 save(p/'binary-reuse-readback.json',verify_existing_binary(call))
 sg=call(['ec2','describe-security-groups','--group-ids',b['securityGroup']])['SecurityGroups']
 if len(sg)!=1 or sg[0]['GroupId']!=b['securityGroup'] or sg[0]['IpPermissions']!=[]:raise ValueError('INGRESS')
 hardware=call(['ec2','describe-instance-types','--instance-types','m7a.large'])['InstanceTypes']
 if len(hardware)!=1 or hardware[0]['InstanceType']!='m7a.large' or hardware[0]['VCpuInfo']['DefaultVCpus']!=2 or hardware[0]['VCpuInfo']['DefaultCores']!=2 or hardware[0]['MemoryInfo']['SizeInMiB']!=8192 or hardware[0]['ProcessorInfo']['SupportedArchitectures']!=['x86_64']:raise ValueError('HARDWARE')
 save(p/'hardware-readback.json',{'instanceType':'m7a.large','vcpus':2,'cores':2,'memoryMiB':8192,'architecture':'x86_64','hostLibcAndCpuFlags':'not observed by EC2 API'})
 image=call(['ec2','describe-images','--image-ids',AMI])['Images']
 if len(image)!=1 or image[0]['OwnerId']!='099720109477' or image[0]['Architecture']!='x86_64' or image[0]['State']!='available' or image[0]['RootDeviceType']!='ebs' or image[0]['RootDeviceName']!='/dev/sda1':raise ValueError('AMI')
 template={'ImageId':AMI,'InstanceType':'m7a.large','InstanceInitiatedShutdownBehavior':'terminate','MetadataOptions':{'HttpTokens':'required','HttpEndpoint':'enabled','HttpPutResponseHopLimit':1},'NetworkInterfaces':[{'DeviceIndex':0,'AssociatePublicIpAddress':True,'DeleteOnTermination':True,'Groups':[b['securityGroup']]}],
  'BlockDeviceMappings':[{'DeviceName':'/dev/sda1','Ebs':{'VolumeSize':40,'VolumeType':'gp3','Iops':3000,'Throughput':125,'Encrypted':True,'DeleteOnTermination':True}}],'UserData':base64.b64encode(body).decode(),
  'TagSpecifications':[{'ResourceType':kind,'Tags':[{'Key':'Name','Value':b['campaign']},{'Key':'Task','Value':'G02-native-version'}]} for kind in ('instance','volume')]}
 save(p/'lt-data.json',template);token=str(uuid.uuid4())
 save(p/'lt-intent.json',{'operation':'CreateLaunchTemplate','name':b['campaign'],'clientToken':token,'inputSha256':digest(p/'lt-data.json'),'attemptsAllowed':1,'unknownOutcome':'reconcile-only'})
 result=call(['ec2','create-launch-template','--launch-template-name',b['campaign'],'--client-token',token,'--launch-template-data','file://'+str(p/'lt-data.json')]);save(p/'lt-response.json',result)
 lt=result['LaunchTemplate'];identifier=lt['LaunchTemplateId'];version=str(lt['LatestVersionNumber'])
 if lt['LaunchTemplateName']!=b['campaign'] or not re.fullmatch('lt-[a-f0-9]{8,17}',identifier) or version!='1':raise ValueError('TEMPLATE')
 actual=call(['ec2','describe-launch-template-versions','--launch-template-id',identifier,'--versions',version])['LaunchTemplateVersions'][0]['LaunchTemplateData']
 if any(actual.get(k)!=v for k,v in template.items()) or actual.get('IamInstanceProfile') or actual.get('KeyName'):raise ValueError('TEMPLATE_READBACK')
 if now()>=instant(b['latestLaunch']):raise ValueError('STALE')
 request={'Type':'request','ClientToken':str(uuid.uuid4()),'TargetCapacitySpecification':{'TotalTargetCapacity':1,'OnDemandTargetCapacity':1,'SpotTargetCapacity':0,'DefaultTargetCapacityType':'on-demand'},'OnDemandOptions':{'AllocationStrategy':'lowest-price'},'LaunchTemplateConfigs':[{'LaunchTemplateSpecification':{'LaunchTemplateId':identifier,'Version':version},'Overrides':[{'SubnetId':s} for s in b['subnets']]}],'ValidUntil':b['budgetStop'],'TerminateInstancesWithExpiration':True,'TagSpecifications':[{'ResourceType':'fleet','Tags':[{'Key':'Name','Value':b['campaign']},{'Key':'Task','Value':'G02-native-version'}]}]}
 save(p/'fleet-request.json',request);save(p/'fleet-intent.json',{'operation':'CreateFleet','clientToken':request['ClientToken'],'requestSha256':digest(p/'fleet-request.json'),'attemptsAllowed':1,'unknownOutcome':'reconcile-only'})
 result=call(['ec2','create-fleet','--cli-input-json','file://'+str(p/'fleet-request.json')],timeout=60);save(p/'fleet-response.json',result)
 identifier=result['FleetId']
 if type(identifier) is not str or not re.fullmatch('fleet-[a-f0-9-]{36}',identifier):raise ValueError('FLEET_ID')
 fleet=call(['ec2','describe-fleets','--fleet-ids',identifier])['Fleets'][0]
 if fleet['Type']!='request' or fleet['TerminateInstancesWithExpiration'] is not True or instant(fleet['ValidUntil'].replace('+00:00','Z'))!=instant(b['budgetStop']):raise ValueError('CLOUD_CONTROLS')
 save(p/'cloud-controls.json',{'fleetId':identifier,'budgetStop':b['budgetStop'],'terminateWithExpiration':True,'hostControls':'pending actual receipt'})
 return {'passed':True,'fleetId':identifier,'budgetStop':b['budgetStop'],'hostControls':'pending actual receipt'}

def guest_projection(g):
 # Closed guest facts only; raw host strings never become public evidence.
 if type(g) is not dict:raise ValueError('GUEST')
 if g=={'status':'not-observed'}:return False
 if set(g)!={'status','architecture','libc','loaderAvailable','os','cpu'} or g['status'] not in ('passed','failed') or g['architecture'] not in ('unavailable','other','x86_64') or type(g['loaderAvailable']) is not bool:raise ValueError('GUEST')
 libc=g['libc'];os_facts=g['os'];cpu=g['cpu']
 for row in (libc,os_facts,cpu):
  if type(row) is not dict:raise ValueError('GUEST_OBJECT')
 if libc.get('status')=='observed':
  if set(libc)!={'status','major','minor'} or any(type(libc[k]) is not int or not 0<=libc[k]<=999 for k in ('major','minor')):raise ValueError('GUEST_LIBC')
 elif set(libc)!={'status'} or libc['status'] not in ('transport-error','projection-error'):raise ValueError('GUEST_LIBC')
 if os_facts.get('status')=='observed':
  if set(os_facts)!={'status','ubuntu2404'} or type(os_facts['ubuntu2404']) is not bool:raise ValueError('GUEST_OS')
 elif set(os_facts)!={'status'} or os_facts['status'] not in ('unavailable','projection-error'):raise ValueError('GUEST_OS')
 if cpu.get('status')=='observed':
  if set(cpu)!={'status','processors','vendor','flags'} or type(cpu['processors']) is not int or not 1<=cpu['processors']<=8 or cpu['vendor'] not in ('amd','intel','mixed','other'):raise ValueError('GUEST_CPU')
  flags=cpu['flags']
  if type(flags) is not dict or set(flags)!={'sse4_2','avx','avx2','avx512f','bmi2','adx'} or any(type(v) is not bool for v in flags.values()):raise ValueError('GUEST_FLAGS')
 elif set(cpu)!={'status'} or cpu['status'] not in ('unavailable','projection-error'):raise ValueError('GUEST_CPU')
 passed=(g['architecture']=='x86_64' and libc['status']=='observed' and (libc['major'],libc['minor'])>=(2,34) and g['loaderAvailable'] and os_facts.get('ubuntu2404') is True and cpu.get('processors')==2 and cpu.get('vendor')=='amd')
 if (g['status']=='passed')!=passed:raise ValueError('GUEST_PASS')
 return passed

def receipt_projection(raw,b):
 # Exact closed schema: no arbitrary string value survives into evidence.
 if type(raw) is not bytes or len(raw)>8192:raise ValueError('RECEIPT_SIZE')
 def pairs(items):
  d={}
  for k,v in items:
   if k in d:raise ValueError('DUPLICATE')
   d[k]=v
  return d
 r=json.loads(raw,object_pairs_hook=pairs)
 required={'schemaVersion','mode','passed','nodeStartupQualified','proofJobs','binarySha256','binaryBytes','expectedVersion','controlSourceSha256','workerSha256','budgetStop','commissioningStop','stage','state','resultStatus','outcome','guestPreflight'}
 if type(r) is not dict or not required<=set(r) or set(r)-required-{'controlsVerified','result'}:raise ValueError('RECEIPT_SHAPE')
 constants={'schemaVersion':1,'mode':'native-version-only','nodeStartupQualified':False,'proofJobs':0,'binarySha256':BINARY_SHA,'binaryBytes':BINARY_BYTES,'expectedVersion':BINARY_VERSION,'controlSourceSha256':b['controlSourceSha256'],'workerSha256':b['workerSha256'],'budgetStop':b['budgetStop'],'commissioningStop':b['commissioningStop']}
 if any(type(r[k]) is not type(v) or r[k]!=v for k,v in constants.items()):raise ValueError('RECEIPT_BINDING')
 if type(r['passed']) is not bool or r['stage'] not in ('host-preflight','controls','guest-preflight','download','version','complete') or r['resultStatus'] not in ('not-observed','observed','absent','invalid-or-unreadable') or r['outcome'] not in ('started','timeout','nonzero','signal','oom','state-unreadable','passed','unqualified','precondition-or-io-failure'):raise ValueError('RECEIPT_FIELDS')
 if 'controlsVerified' in r and r['controlsVerified'] is not True:raise ValueError('CONTROLS')
 guest_passed=guest_projection(r['guestPreflight'])
 if r['stage'] in ('download','version','complete') and not guest_passed:raise ValueError('GUEST_STAGE')
 state=r['state']
 if type(state) is not dict:raise ValueError('STATE')
 if state.get('status') in ('not-observed','transport-error','projection-error'):
  if set(state)!={'status'}:raise ValueError('STATE')
 else:
  keys={'status','ActiveState','SubState','Result','ExecMainCode','ExecMainStatus','ExecMainStartTimestampMonotonic'}
  if set(state)!=keys or state['status']!='observed' or state['ActiveState'] not in ('active','inactive','failed','activating','deactivating') or state['SubState'] not in ('running','dead','failed','start','stop','stop-sigterm','stop-sigkill','exited') or state['Result'] not in ('success','exit-code','signal','core-dump','timeout','oom-kill','resources','start-limit-hit','protocol'):raise ValueError('STATE')
  for k,maximum in [('ExecMainCode',6),('ExecMainStatus',255),('ExecMainStartTimestampMonotonic',2**63-1)]:
   if type(state[k]) is not int or not 0<=state[k]<=maximum:raise ValueError('STATE_NUMBER')
 result=r.get('result')
 if result is not None:
  if type(result) is not dict or set(result)!={'schemaVersion','started','timeout','reaped','returnCode','stdout','stderr','versionMatches'} or type(result['schemaVersion']) is not int or result['schemaVersion']!=1:raise ValueError('RESULT')
  if any(type(result[k]) is not bool for k in ('started','timeout','reaped','versionMatches')):raise ValueError('RESULT_FLAG')
  if result['returnCode'] is not None and (type(result['returnCode']) is not int or not -255<=result['returnCode']<=255):raise ValueError('RESULT_CODE')
  for k in ('stdout','stderr'):
   row=result[k]
   if type(row) is not dict or set(row)!={'bytes','sha256','truncated'} or type(row['bytes']) is not int or not 0<=row['bytes']<=2**53-1 or type(row['sha256']) is not str or not re.fullmatch('[a-f0-9]{64}',row['sha256']) or type(row['truncated']) is not bool or row['truncated']!=(row['bytes']>8192):raise ValueError('OUTPUT')
 if (r['resultStatus']=='observed')!=(result is not None):raise ValueError('RESULT_PRESENCE')
 passed=(guest_passed and state.get('status')=='observed' and state['ActiveState']=='inactive' and state['Result']=='success' and state['ExecMainCode']==1 and state['ExecMainStatus']==0 and state['ExecMainStartTimestampMonotonic']>0 and result is not None and result['started'] and result['reaped'] and not result['timeout'] and result['returnCode']==0 and result['versionMatches'] and not result['stdout']['truncated'] and not result['stderr']['truncated'] and r.get('controlsVerified') is True and r['stage']=='complete')
 if r['passed']!=passed or (r['outcome']=='passed')!=passed:raise ValueError('PASS_INVARIANT')
 return r

def owned_fleet(b,p,call=aws):
 response=json.loads(read_private(p/'fleet-response.json'));identifier=response['FleetId']
 if type(identifier) is not str or not re.fullmatch('fleet-[a-f0-9-]{36}',identifier):raise ValueError('FLEET')
 request=json.loads(read_private(p/'fleet-request.json'));intent=json.loads(read_private(p/'fleet-intent.json'))
 if digest(p/'fleet-request.json')!=intent['requestSha256'] or request['ClientToken']!=intent['clientToken'] or request['ValidUntil']!=b['budgetStop']:raise ValueError('OWNERSHIP')
 fleet=call(['ec2','describe-fleets','--fleet-ids',identifier])['Fleets'][0]
 if fleet['ClientToken']!=request['ClientToken'] or fleet['Type']!='request' or fleet['TerminateInstancesWithExpiration'] is not True or instant(fleet['ValidUntil'].replace('+00:00','Z'))!=instant(b['budgetStop']):raise ValueError('OWNERSHIP')
 return identifier,fleet

def resource_snapshot(b,call=aws):
 rows=call(['ec2','describe-instances','--filters','Name=tag:Name,Values='+b['campaign']])['Reservations']
 instances=[]
 for reservation in rows:
  for row in reservation['Instances']:
   if len(instances)>=2 or not re.fullmatch('i-[a-f0-9]{8,17}',row['InstanceId']) or row['State']['Name'] not in ('pending','running','stopping','stopped','shutting-down','terminated'):raise ValueError('INSTANCE')
   volumes=[];mapping=row.get('BlockDeviceMappings')
   root_mapping=(type(mapping) is list and len(mapping)==1 and type(mapping[0]) is dict and mapping[0].get('DeviceName')=='/dev/sda1')
   if root_mapping:
    v=mapping[0].get('Ebs')
    root_mapping=(type(v) is dict and type(v.get('VolumeId')) is str and re.fullmatch('vol-[a-f0-9]{8,17}',v['VolumeId']) is not None and type(v.get('DeleteOnTermination')) is bool)
    if root_mapping:volumes.append({'id':v['VolumeId'],'deleteOnTermination':v['DeleteOnTermination']})
   controls=(root_mapping and row.get('InstanceType')=='m7a.large' and row.get('ImageId')==AMI and not row.get('IamInstanceProfile') and not row.get('KeyName') and row.get('MetadataOptions',{}).get('HttpTokens')=='required' and {x['GroupId'] for x in row.get('SecurityGroups',[])}=={b['securityGroup']} and volumes[0]['deleteOnTermination'])
   shutdown=None if row['State']['Name']=='terminated' else call(['ec2','describe-instance-attribute','--instance-id',row['InstanceId'],'--attribute','instanceInitiatedShutdownBehavior'])['InstanceInitiatedShutdownBehavior']['Value']
   controls=bool(controls and shutdown=='terminate')
   instances.append({'id':row['InstanceId'],'state':row['State']['Name'],'controlsVerified':controls,'rootMappingVerified':root_mapping,'shutdownReadback':'not-applicable-terminated' if shutdown is None else 'verified' if shutdown=='terminate' else 'mismatch','volumes':volumes})
 rows=call(['ec2','describe-volumes','--filters','Name=tag:Name,Values='+b['campaign']])['Volumes'];volumes=[]
 for v in rows:
  if len(volumes)>=2 or not re.fullmatch('vol-[a-f0-9]{8,17}',v['VolumeId']) or v['State'] not in ('creating','available','in-use','deleting','deleted','error'):raise ValueError('VOLUME')
  volumes.append({'id':v['VolumeId'],'state':v['State'],'controlsVerified':v.get('Encrypted') is True and v.get('Size')==40 and v.get('VolumeType')=='gp3' and v.get('Iops')==3000 and v.get('Throughput')==125})
 # A syntactically valid mapping is not enough: bind the one root volume to
 # its independent observed encryption/size/type record before verifying controls.
 by_id={v['id']:v for v in volumes}
 if len(by_id)!=len(volumes):raise ValueError('DUPLICATE_VOLUME')
 for instance in instances:
  root=instance['volumes'][0] if len(instance['volumes'])==1 else None
  bound=by_id.get(root['id']) if root else None
  instance['rootVolumeObserved']=bound is not None
  instance['controlsVerified']=bool(instance['controlsVerified'] and bound is not None and bound['controlsVerified'])
 return {'instances':instances,'volumes':volumes,'instancesTerminated':all(x['state']=='terminated' for x in instances),'volumesAbsent':not volumes}

def observe_once(b,p,call=aws):
 if call(['sts','get-caller-identity'])['Account']!=ACCOUNT:raise ValueError('IDENTITY')
 identifier,fleet=owned_fleet(b,p,call)
 state=fleet['FleetState']
 if state not in ('submitted','active','deleted','deleted_running','deleted_terminating','modifying'):raise ValueError('FLEET_STATE')
 result={'schemaVersion':1,'fleetId':identifier,'fleetState':state,'resources':resource_snapshot(b,call),'receiptStatus':'unavailable'}
 key='receipts/'+b['campaign']+'/final.json'
 try:
  head=call(['s3api','head-object','--bucket',BUCKET,'--key',key,'--expected-bucket-owner',ACCOUNT],'eu-west-2')
  if type(head['ContentLength']) is not int or not 0<head['ContentLength']<=8192 or type(head.get('VersionId')) is not str or not re.fullmatch('[A-Za-z0-9_.-]{1,1024}',head['VersionId']):raise ValueError('RECEIPT_HEAD')
  # One bounded GET per observation; no mutation replay. Every local capture is
  # separately owned, so a failed read never overwrites a retained earlier file.
  path=p/('receipt-'+uuid.uuid4().hex+'.json')
  fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);os.close(fd)
  call(['s3api','get-object','--bucket',BUCKET,'--key',key,'--version-id',head['VersionId'],'--expected-bucket-owner',ACCOUNT,'--range','bytes=0-8191',str(path)],'eu-west-2')
  raw=read_private(path,8192)
  if len(raw)!=head['ContentLength']:raise ValueError('RECEIPT_LENGTH')
  result.update(receiptStatus='observed',receiptSha256=hashlib.sha256(raw).hexdigest(),receipt=receipt_projection(raw,b))
 except Exception:pass # Preserve independent resource evidence; no private error.
 return result

def cleanup_once(b,p,observation,call=aws):
 if call(['sts','get-caller-identity'])['Account']!=ACCOUNT:raise ValueError('IDENTITY')
 identifier,fleet=owned_fleet(b,p,call)
 receipt=receipt_projection(json.dumps(observation['receipt'],separators=(',',':')).encode(),b) if observation else None
 deadline=now()>=instant(b['budgetStop'])
 terminal=receipt is not None and receipt['outcome']!='started'
 if not terminal and not deadline:raise ValueError('CLEANUP_GATE')
 if fleet['FleetState']=='deleted':return {'alreadyDeleted':True,'resourceAbsencePending':True}
 if (p/'delete-intent.json').exists():raise ValueError('RECONCILE_ONLY')
 save(p/'delete-intent.json',{'operation':'DeleteFleets','fleetId':identifier,'terminateInstances':True,'attemptsAllowed':1,'terminalReceipt':receipt is not None,'deadlineElapsed':deadline})
 result=call(['ec2','delete-fleets','--fleet-ids',identifier,'--terminate-instances']);save(p/'delete-response.json',result)
 success=result.get('SuccessfulFleetDeletions') if type(result) is dict else None
 if type(result) is not dict or set(result)-{'SuccessfulFleetDeletions','UnsuccessfulFleetDeletions'} or result.get('UnsuccessfulFleetDeletions',[])!=[] or type(success) is not list or len(success)!=1 or type(success[0]) is not dict or success[0].get('FleetId')!=identifier:raise ValueError('DELETE_RESULT')
 row=success[0]
 if set(row)-{'FleetId','CurrentFleetState','PreviousFleetState'} or row.get('CurrentFleetState') not in ('deleted','deleted_running','deleted_terminating') or row.get('PreviousFleetState') not in ('submitted','active','modifying','deleted','deleted_running','deleted_terminating'):raise ValueError('DELETE_RESULT')
 return {'deleteAcknowledgedFleetId':identifier,'deleteAcknowledged':True,'resourceAbsencePending':True}

def main(operation):
 # No raw exception, response or configuration is printed. On uncertainty the
 # private durable intent is the reconciliation reference, never a retry signal.
 try:
  b,p=authorize(BINDINGS,operation)
  if operation=='upload':result=upload_once(b,p)
  elif operation=='launch':result=launch_once(b,p)
  elif operation=='observe':
   result=observe_once(b,p)
   if result.get('receiptStatus')=='observed' and result['receipt']['outcome']!='started' and not (p/'terminal-observation.json').exists():save(p/'terminal-observation.json',result)
  elif operation=='cleanup':
   observation=json.loads(read_private(p/'terminal-observation.json')) if (p/'terminal-observation.json').exists() else None
   result=cleanup_once(b,p,observation)
  else:raise ValueError('OPERATION')
  save(p/(operation+'-safe-'+uuid.uuid4().hex+'.json'),result);print(json.dumps(result));return 0
 except Exception:
  print(json.dumps({'passed':False,'category':'OPERATOR_CHECK_FAILED','operation':operation,'reconcileExistingIntentsOnly':True}));return 1
