"""Pure AST assembly from the frozen source; no import/execute of bootstrap."""
import ast,hashlib,json,pathlib
D=pathlib.Path(__file__).resolve().parent;W=D.parents[3]
P=W/'deploy/prover/bootstrap.py';expected='31cd1316b908c46148015f5a0ce46deaf8f5fca26f0dd0b85891f24db1494535'
if hashlib.sha256(P.read_bytes()).hexdigest()!=expected:raise ValueError('Frozen source changed')
constants={}
for n in ast.parse(P.read_text()).body:
 if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('HOST','NATIVE_HOST','NATIVE_CAPTURE'):constants[n.targets[0].id]=ast.literal_eval(n.value)
selected=[];bindings={}
for container,names in [('HOST',('run','write','read_bounded_json')),('NATIVE_HOST',('native_ordering','native_retain_execution','native_state','native_result','native_classify'))]:
 source=constants[container];nodes={n.name:n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef)}
 for name in names:
  text=ast.get_source_segment(source,nodes[name]);selected.append(text);bindings[name]=hashlib.sha256(text.encode()).hexdigest()
unit_nodes=[n for n in ast.walk(ast.parse(constants['NATIVE_HOST'])) if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='unit']
if len(unit_nodes)!=1:raise ValueError('Unit assignment ambiguity')
unit=ast.literal_eval(unit_nodes[0].value)
capture=constants['NATIVE_CAPTURE']
# Each fixture gets a separate immutable intent/result StateDirectory. Actual
# worker body/capture and actual classifier remain source-bound; only fixed
# public workload arguments, timeout and output path are substituted explicitly.
source='import hashlib,json,os,pathlib,re,stat,subprocess,time\nNATIVE_UNIT="rolling-native-version.service"\n'+ '\n\n'.join(selected)+'\nCAPTURE='+repr(capture)+'\nUNIT='+repr(unit)+'\nSOURCE_FUNCTION_HASHES='+repr(bindings)+'\n'
(D/'native-subset.py').write_text(source)
with (D/'offline-source-bindings.json').open('x') as f:json.dump({'bootstrapSha256':expected,'functions':bindings,'captureSha256':hashlib.sha256(capture.encode()).hexdigest(),'unitSha256':hashlib.sha256(unit.encode()).hexdigest(),'subsetSha256':hashlib.sha256(source.encode()).hexdigest(),'actualLinuxExecution':False},f,indent=2);f.write('\n')
