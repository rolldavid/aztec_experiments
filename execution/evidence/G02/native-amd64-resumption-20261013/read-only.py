"""Bounded projected read-only reconciliation. No CostExplorer or mutation API."""
from pathlib import Path
import subprocess,json,os,datetime,hashlib,urllib.request
D=Path(__file__).resolve().parent
ACCOUNT='052665140763';BIN='fa4b12adaefd5684b53b802346b9fe839ab3d6a4a829a5ea4efd6bd200e0829f';VERSION='GODU5XvItcwYTvFkDmb9sRJA50HHLSqL'
records={}
def call(name,args,query,profile='message-board-deploy',region='us-east-1'):
 before=datetime.datetime.now(datetime.timezone.utc).isoformat()
 row={'startedAt':before,'profile':profile,'region':region,'attempts':1,'available':False}
 try:
  p=subprocess.run(['/usr/local/bin/aws',*args,'--profile',profile,'--region',region,'--query',query,'--output','json','--no-cli-pager','--cli-connect-timeout','3','--cli-read-timeout','5'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10,env={**os.environ,'AWS_MAX_ATTEMPTS':'1','AWS_RETRY_MODE':'standard'})
  row['exitCode']=p.returncode
  if p.returncode or len(p.stdout)>65536:raise ValueError('unavailable')
  value=json.loads(p.stdout);row.update(available=True,observation=value)
 except Exception:row['category']='unavailable'
 row['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();records[name]=row
 return row.get('observation')
for profile in ('message-board-deploy','message-board-sso'):
 value=call(profile,['sts','get-caller-identity'],'{account:Account}',profile)
 if value is None or value.get('account')!=ACCOUNT:break
else:
 call('instances',['ec2','describe-instances'],'Reservations[].Instances[].{id:InstanceId,state:State.Name}')
 call('volumes',['ec2','describe-volumes'],'Volumes[].{id:VolumeId,state:State,size:Size,type:VolumeType}')
 call('fleets',['ec2','describe-fleets'],'Fleets[].{id:FleetId,state:FleetState,terminate:TerminateInstancesWithExpiration}')
 call('zero-ingress-group',['ec2','describe-security-groups','--group-ids','sg-076e39ea1d8dbf8d0'],'SecurityGroups[].{id:GroupId,vpc:VpcId,ingress:length(IpPermissions),egress:length(IpPermissionsEgress)}')
 call('ami',['ec2','describe-images','--image-ids','ami-0fa5967347d08d2df'],'Images[].{id:ImageId,owner:OwnerId,architecture:Architecture,state:State,rootDevice:RootDeviceName}')
 call('binary',['s3api','head-object','--bucket','anonymous-message-board-testnet-backups-nvdhcyurtoga','--key','releases/native-bb-'+BIN+'/bb','--version-id',VERSION,'--checksum-mode','ENABLED','--expected-bucket-owner',ACCOUNT],'{version:VersionId,bytes:ContentLength,checksum:ChecksumSHA256,encryption:ServerSideEncryption}',region='eu-west-2')
try:
 with urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=3) as response:
  b=response.read(16385)
  if response.status!=200 or len(b)>16384:raise ValueError()
  v=json.loads(b)
  if type(v) is not dict or v.get('status') not in ('ready','degraded') or type(v.get('active')) is not int or not 0<=v['active']<=10000:raise ValueError()
  records['plugin']={'available':True,'status':v['status'],'active':v['active'],'lastFailurePresent':bool(v.get('lastFailure')),'readinessClaim':False}
except Exception:records['plugin']={'available':False,'category':'unavailable','readinessClaim':False}
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'mutationCount':0,'costExplorerCalls':0,'records':records}
p=D/'read-only.json'
with p.open('x') as f:json.dump(report,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
print(json.dumps({'receipt':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'recordCount':len(records),'unavailable':[k for k,v in records.items() if not v['available']]}))
