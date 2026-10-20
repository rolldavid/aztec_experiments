"""Fixed public paths only; invoked only after host PID1 systemd barrier."""
import json,os,stat,sys
def read_receipt(name):
 limits={'preflight.json':1024,'regression.json':16384}
 if type(name) is not str or name not in limits:return {'status':'invalid-request'}
 fd=None
 try:
  fd=os.open('/run/'+name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_size>limits[name]:return {'status':'invalid-file'}
  data=os.read(fd,limits[name]+1);after=os.fstat(fd)
  if len(data)>limits[name] or len(data)!=before.st_size or (before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_ino,after.st_size,after.st_mtime_ns):return {'status':'invalid-file'}
  record=json.loads(data)
  if type(record) is not dict:return {'status':'invalid-record'}
  return {'status':'read','record':record}
 except FileNotFoundError:return {'status':'missing'}
 except Exception:return {'status':'invalid-record'}
 finally:
  if fd is not None:os.close(fd)
if __name__=='__main__':
 result=read_receipt(sys.argv[1] if len(sys.argv)==2 else None)
 # Limits apply to emitted bytes as well as input: re-encoding can expand JSON.
 data=json.dumps(result,separators=(',',':')).encode()
 if len(data)>17408:data=b'{"status":"invalid-record"}'
 sys.stdout.buffer.write(data)
