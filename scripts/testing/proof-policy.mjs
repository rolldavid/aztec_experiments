import {BBBundlePrivateKernelProver} from '@aztec-labs/bb-prover/client/bundle';
// Test-only selection; PXE proverEnabled owns the native disabled mode.
import {routedKernelProverClass} from '../../shared/routed-kernel-prover.mjs';
import {createRemoteProverClient} from '../../shared/remote-prover-client.mjs';
import {WASMSimulator} from '@aztec-labs/simulator/client';
const RoutedKernelProver=routedKernelProverClass(BBBundlePrivateKernelProver);
export function applicationProofsEnabled(){const mode=process.env.BOARD_TEST_PROOFS??'disabled';if(!['real','disabled'].includes(mode))throw Error('Invalid BOARD_TEST_PROOFS');return mode==='real';}
export function applicationProver(options,remote){
 if(!applicationProofsEnabled()||!remote)return options;
 return new RoutedKernelProver(new WASMSimulator(),options,{transport:createRemoteProverClient({...remote,proofsEnabled:true,pollMs:100})});
}
