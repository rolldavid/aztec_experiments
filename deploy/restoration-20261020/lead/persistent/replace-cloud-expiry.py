import subprocess,json,pathlib,datetime
P=pathlib.Path(__file__).resolve().parent
AWS=['/usr/local/bin/aws','--profile','message-board-deploy','--region','us-east-1']
HOSTS=['i-0a9b5b9ba55815cda','i-0a7d9957f2b3d7f19']
FLEET='fleet-f51f0f40-7b4c-42c2-afde-b94b2e5dedd8'
def read(args):
 r=subprocess.run(AWS+args,capture_output=True,text=True,check=True)
 return json.loads(r.stdout) if r.stdout.strip() else {}
def apply(name,args):
 intent=P/(name+'-intent.json');result=P/(name+'-result.json')
 with intent.open('x') as f:json.dump({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'args':args},f)
 r=subprocess.run(AWS+args,capture_output=True,text=True)
 result.write_text(json.dumps({'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr},indent=2))
 if r.returncode:raise RuntimeError(name+': reconcile saved result; never replay blindly')
 return json.loads(r.stdout) if r.stdout.strip() else {}
# Created by lead only after reading both actual native-control outcomes.
confirmation=json.loads((P/'native-persistent-confirmation.json').read_text())
assert confirmation['verifiedInstances']==HOSTS and confirmation['monthlyBudgetUsd']==1500
assert confirmation['nativeExpiryRemoved'] is True
fleets=read(['ec2','describe-fleets','--fleet-ids',FLEET])['Fleets'];assert len(fleets)==1
assert fleets[0]['Type']=='request' and fleets[0]['FleetState']=='active'
instances=read(['ec2','describe-fleet-instances','--fleet-id',FLEET])['ActiveInstances'];assert [i['InstanceId'] for i in instances]==HOSTS[:1]
(P/'core-fleet-before.json').write_text(json.dumps(fleets,indent=2))
expected={'rolling-core-restore-20261020-core':{'InstanceIds':[HOSTS[0]]},'rolling-bok-restore-20261020-shutdown':{'InstanceIds':[HOSTS[1]]},'rolling-core-restore-20261020-endpoints':{'VpcEndpointIds':['vpce-073682b5fca1c98be','vpce-0ce0780db34669ea7']}}
for name,target in expected.items():
 actual=read(['scheduler','get-schedule','--name',name]);assert json.loads(actual['Target']['Input'])==target and actual['GroupName']=='default'
 assert actual==json.loads((P/(name+'-before.json')).read_text())
# Preserve disks/account journals if native emergency containment powers off.
for instance in HOSTS:
 apply(instance+'-stop-behavior',['ec2','modify-instance-attribute','--instance-id',instance,'--instance-initiated-shutdown-behavior','Value=stop'])
 apply(instance+'-termination-protection',['ec2','modify-instance-attribute','--instance-id',instance,'--disable-api-termination','Value=true'])
for name in expected:apply(name+'-delete',['scheduler','delete-schedule','--name',name,'--group-name','default'])
r=apply('core-fleet-remove-expiry',['ec2','delete-fleets','--fleet-ids',FLEET,'--no-terminate-instances'])
assert not r['UnsuccessfulFleetDeletions'] and r['SuccessfulFleetDeletions'][0]['CurrentFleetState']=='deleted_running'
for instance,key,value in [(HOSTS[0],'ShutdownAt','2026-10-20T14:46:12Z'),(HOSTS[1],'BudgetStop','2026-10-21T06:42:00Z')]:
 apply(instance+'-retire-expiry-tag',['ec2','delete-tags','--resources',instance,'--tags','Key='+key+',Value='+value])
 apply(instance+'-persistent-tags',['ec2','create-tags','--resources',instance,'--tags','Key=HostingMode,Value=persistent','Key=MonthlyBudgetUSD,Value=1500'])
state=read(['ec2','describe-instances','--instance-ids',*HOSTS]);observed={i['InstanceId']:i['State']['Name'] for r in state['Reservations'] for i in r['Instances']};assert observed=={i:'running' for i in HOSTS}
for reservation in state['Reservations']:
 for item in reservation['Instances']:
  tags={t['Key']:t['Value'] for t in item['Tags']}
  assert tags.get('HostingMode')=='persistent' and tags.get('MonthlyBudgetUSD')=='1500'
  assert 'ShutdownAt' not in tags and 'BudgetStop' not in tags
for instance in HOSTS:
 assert read(['ec2','describe-instance-attribute','--instance-id',instance,'--attribute','instanceInitiatedShutdownBehavior'])['InstanceInitiatedShutdownBehavior']['Value']=='stop'
 assert read(['ec2','describe-instance-attribute','--instance-id',instance,'--attribute','disableApiTermination'])['DisableApiTermination']['Value'] is True
left=read(['scheduler','list-schedules'])['Schedules'];assert not set(expected)&{s['Name'] for s in left}
fleet=read(['ec2','describe-fleets','--fleet-ids',FLEET])['Fleets'][0];assert fleet['FleetState']=='deleted_running'
result={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'instances':observed,'deletedSchedules':list(expected),'fleetState':fleet['FleetState'],'instancesTerminated':False,'guestShutdown':'stop','apiTerminationProtection':True,'monthlyBudgetUsd':1500}
(P/'cloud-persistent-readback.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
