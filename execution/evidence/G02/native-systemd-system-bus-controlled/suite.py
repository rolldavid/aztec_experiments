import importlib.util,pathlib,sys,unittest
D=pathlib.Path(__file__).resolve().parent.parent/'native-systemd-linux-helpers-v2/system-bus'
suite=unittest.TestSuite()
for index,name in enumerate(('test-setup-cleanup.py','test-system-bus.py')):
 spec=importlib.util.spec_from_file_location('local_fixture_'+str(index),D/name)
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
if suite.countTestCases()!=25:raise ValueError('Exact test inventory changed')
result=unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() and not result.skipped else 1)
