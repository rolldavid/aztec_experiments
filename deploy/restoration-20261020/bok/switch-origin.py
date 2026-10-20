import boto3,json,pathlib,datetime,copy
from botocore.config import Config
p=pathlib.Path(__file__).resolve().parent
r=json.loads((p/'readiness-result.json').read_text());assert r['Status']=='Success';ready=json.loads(r['StandardOutputContent']);assert ready['health']['status']=='ready' and ready['health']['active']==0
assert all(v['originalMatches'] for v in ready['artifacts'].values()) and len(ready['artifacts'])==2
assert all(v['hashUnchanged'] and v['finished'] for v in ready['journals'].values())
c=boto3.Session(profile_name='message-board-deploy').client('cloudfront',config=Config(retries={'total_max_attempts':1}));id=json.loads((p/'origin-created.json').read_text())['VpcOrigin']['Id'];origin=c.get_vpc_origin(Id=id);assert origin['VpcOrigin']['Status']=='Deployed';endpoint=origin['VpcOrigin']['VpcOriginEndpointConfig'];assert endpoint['Arn']=='arn:aws:ec2:us-east-1:052665140763:instance/i-0a7d9957f2b3d7f19' and endpoint['HTTPPort']==8809 and endpoint['OriginProtocolPolicy']=='http-only'
r=c.get_distribution_config(Id='E1M12FHGQ0S5ST');before=r['DistributionConfig'];after=copy.deepcopy(before);assert len(after['Origins']['Items'])==1 and after['Origins']['Items'][0]['Id']=='bok-artifacts'
o=after['Origins']['Items'][0];assert 'S3OriginConfig' in o
o.pop('S3OriginConfig');o['OriginAccessControlId']='';o['DomainName']='ip-172-31-45-95.ec2.internal';o['OriginPath']='';o['VpcOriginConfig']={'VpcOriginId':id,'OriginReadTimeout':30,'OriginKeepaliveTimeout':5};after['Comment']='Original Bok accepted artifacts restored with scoped private origin'
# Preserve viewer restrictions and use the existing private-origin request policy.
after['DefaultCacheBehavior']['OriginRequestPolicyId']='b689b0a8-53d0-40ab-baf2-68738e2966ac'
intent=p/'origin-switch-intent.json';assert not intent.exists();intent.write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'etag':r['ETag'],'before':before,'after':after},indent=2)+'\n')
r=c.update_distribution(Id='E1M12FHGQ0S5ST',IfMatch=r['ETag'],DistributionConfig=after);(p/'origin-switch-result.json').write_text(json.dumps(r,indent=2,default=str)+'\n');print(json.dumps({'distribution':'E1M12FHGQ0S5ST','status':r['Distribution']['Status'],'origin':id,'staticArchiveRetained':True}))
