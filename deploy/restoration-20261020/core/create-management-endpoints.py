# Existing two-interface-endpoint procedure, no workloads or credentials.
import boto3,json,pathlib,uuid,os
os.umask(0o077)
p=pathlib.Path(__file__).parent;s=boto3.Session(profile_name='message-board-deploy',region_name='us-east-1');e=s.client('ec2')
assert s.client('sts').get_caller_identity()['Account']=='052665140763'
assert not e.describe_vpc_endpoints(Filters=[{'Name':'vpc-id','Values':['vpc-4585113d']}])['VpcEndpoints'],'Reconcile existing endpoints before dispatch'
for service in ['ssm','ssmmessages']:
 intent=p/('endpoint-'+service+'-intent.json')
 token=str(uuid.uuid4());args={'VpcId':'vpc-4585113d','ServiceName':'com.amazonaws.us-east-1.'+service,'VpcEndpointType':'Interface','SubnetIds':['subnet-b414d8e9'],'SecurityGroupIds':['sg-0d34a3cd51e6e2223'],'PrivateDnsEnabled':True,'ClientToken':token,'TagSpecifications':[{'ResourceType':'vpc-endpoint','Tags':[{'Key':'Task','Value':'G12-restore-service-20261020'},{'Key':'ShutdownAt','Value':'2026-10-21T06:47:00Z'}]}]}
 with intent.open('x') as f:json.dump(args,f);f.flush();os.fsync(f.fileno())
 result=e.create_vpc_endpoint(**args);(p/('endpoint-'+service+'-result.json')).write_text(json.dumps(result,default=str));print(service,result['VpcEndpoint']['VpcEndpointId'],flush=True)
