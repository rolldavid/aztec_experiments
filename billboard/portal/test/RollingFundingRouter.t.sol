// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;
import {RollingFundingRouter,FundingSwapRouter} from "../src/RollingFundingRouter.sol";
import {BillboardPortal} from "../src/BillboardPortal.sol";
import {PluginPortal} from "../src/PluginPortal.sol";
import {AccountingRollup} from "./PortalArtifactRegression.t.sol";
import {ERC20} from "@oz/token/ERC20/ERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
interface FundingVm {function deal(address,uint256) external;function addr(uint256) external returns(address);function sign(uint256,bytes32) external returns(uint8,bytes32,bytes32);function prank(address) external;function expectRevert() external;function warp(uint256) external;function chainId(uint256) external;}
// Labelled reserve/accounting doubles. Mint provisions only test DEX reserves;
// production has no mint path. No live liquidity or rollup proof qualification.
contract FundingToken is ERC20 {constructor() ERC20("Fixture","FIX"){} function seed(address a,uint256 n) external {_mint(a,n);} }
contract FundingWrapped is ERC20 {
 constructor() ERC20("Fixture Wrapped","WETH"){} function deposit() external payable {_mint(msg.sender,msg.value);}
 function withdraw(uint256 n) external {_burn(msg.sender,n);(bool ok,)=msg.sender.call{value:n}("");require(ok);}
}
contract FundingDex {
 bool public fail; bool public lie; function configure(bool f,bool l) external {fail=f;lie=l;}
 function exactOutputSingle(FundingSwapRouter.ExactOutputSingleParams calldata p) external payable returns(uint256 n){
 require(!fail,"No liquidity"); n=p.amountOut*10; require(n<=p.amountInMaximum,"Slippage");
 IERC20(p.tokenIn).transferFrom(msg.sender,address(this),n);IERC20(p.tokenOut).transfer(p.recipient,p.amountOut-(lie?1:0)); }
}
contract FundingFeeBridge {
 IERC20 public immutable UNDERLYING; address public immutable ROLLUP; uint256 public constant VERSION=1;
 bool public fail; bytes32 public recipient; uint256 public amount;
 constructor(address t,address r){UNDERLYING=IERC20(t);ROLLUP=r;} function setFail(bool f) external {fail=f;}
 function depositToAztecPublic(bytes32 to,uint256 n,bytes32) external returns(bytes32,uint256){require(!fail,"Fee bridge failed");UNDERLYING.transferFrom(msg.sender,address(this),n);recipient=to;amount+=n;return(bytes32(n),1);}
}
contract FundingConsentAccount {
 bytes32 public allowed;bool public rejectRefund;
 function configure(bytes32 digest,bool reject) external {allowed=digest;rejectRefund=reject;}
 function isValidSignature(bytes32 digest,bytes calldata) external view returns(bytes4){return digest==allowed?bytes4(0x1626ba7e):bytes4(0xffffffff);}
 function fund(RollingFundingRouter r,RollingFundingRouter.Plan calldata p) external payable {r.fund{value:msg.value}(p,hex"01");}
 receive() external payable {require(!rejectRefund);}
}
contract FundingForce {constructor(address payable a) payable {selfdestruct(a);}}
contract RollingFundingRouterTest {
 FundingVm constant vm=FundingVm(address(uint160(uint256(keccak256("hevm cheat code")))));
 AccountingRollup rollup; BillboardPortal portal;PluginPortal bok;FundingFeeBridge fee;FundingWrapped weth;FundingDex dex;
 FundingToken feeToken;FundingToken usdc;RollingFundingRouter router;address alice;uint256 constant KEY=123;
 function setUp() public {
 alice=vm.addr(KEY);rollup=new AccountingRollup();portal=new BillboardPortal(address(rollup),bytes32(uint256(1)),1,1 ether,2 ether,bytes32(uint256(2)));
 portal.activate(0,0,0,new bytes32[](0));feeToken=new FundingToken();usdc=new FundingToken();weth=new FundingWrapped();dex=new FundingDex();
 fee=new FundingFeeBridge(address(feeToken),address(rollup));bok=new PluginPortal(address(rollup),bytes32(uint256(4)),1,address(usdc));bok.activate(0,0,0,new bytes32[](0));
 router=new RollingFundingRouter(address(portal),address(fee),address(bok),address(weth),address(dex),bytes32(uint256(3)));
 feeToken.seed(address(dex),10000);usdc.seed(address(dex),10000);vm.deal(alice,10 ether);vm.deal(address(this),10 ether);
 }
 function plan(address who) private view returns(RollingFundingRouter.Plan memory p){p=RollingFundingRouter.Plan(who,1 ether,bytes32(uint256(11)),RollingFundingRouter.Swap(100,5000,3000),bytes32(uint256(12)),RollingFundingRouter.Swap(200,5000,500),bytes32(uint256(13)),bytes32(uint256(14)),0,block.timestamp+60);}
 function sign(RollingFundingRouter.Plan memory p) private returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(KEY,portal.depositForDigest(p.beneficiary,address(router),p.collateral,p.collateralSecretHash,p.nonce,p.deadline));return abi.encodePacked(r,s,v);}
 function submit(RollingFundingRouter.Plan memory p) private {bytes memory signature=sign(p);vm.prank(alice);router.fund{value:1 ether+10000}(p,signature);}
 function reject(RollingFundingRouter.Plan memory p) private {bytes memory signature=sign(p);vm.expectRevert();vm.prank(alice);router.fund{value:1 ether+10000}(p,signature);}
 function empty() private view {require(portal.getDeposit(alice)==0 && portal.depositNonces(alice)==0,"Collateral not reverted");require(fee.amount()==0 && usdc.balanceOf(address(bok))==0,"Token legs not reverted");require(address(router).balance==0 && weth.balanceOf(address(router))==0,"Principal retained");require(feeToken.balanceOf(address(dex))==10000 && usdc.balanceOf(address(dex))==10000,"Swap not reverted");}
 function testExactThreeDepositsRefundAndZeroApprovals() public {
 submit(plan(alice));require(portal.getDeposit(alice)==1 ether && portal.getDeposit(address(router))==0,"Wrong owner");require(alice.balance==9 ether-3000,"Wrong exact cost/refund");require(fee.amount()==100 && fee.recipient()==bytes32(uint256(3)),"Wrong private FPC");require(usdc.balanceOf(address(bok))==200,"Wrong Bok allocation");
 require(address(router).balance==0 && weth.balanceOf(address(router))==0 && feeToken.balanceOf(address(router))==0 && usdc.balanceOf(address(router))==0,"Retained principal");require(weth.allowance(address(router),address(dex))==0 && feeToken.allowance(address(router),address(fee))==0 && usdc.allowance(address(router),address(bok))==0,"Retained approval"); }
 function testLastLegFailureRevertsAllSwapsDepositNonceAndFee() public {RollingFundingRouter.Plan memory p=plan(alice);p.bokCommitment=bytes32(0);reject(p);empty();}
 function testFeeLegFailureRollsBackCollateralAndSwaps() public {fee.setFail(true);reject(plan(alice));empty();}
 function testUnavailableLiquidityRejectsWithoutPrincipal() public {dex.configure(true,false);reject(plan(alice));empty();}
 function testMisreportedSwapOutputCannotSpendDonatedTokens() public {feeToken.seed(address(router),20);dex.configure(false,true);reject(plan(alice));empty();require(feeToken.balanceOf(address(router))==20);}
 function testSlippageCapRollsBack() public {RollingFundingRouter.Plan memory p=plan(alice);p.fee.maxEth=999;p.bok.maxEth=9001;reject(p);empty();}
 function testCannotStealBeneficiaryOrReplayConsent() public {RollingFundingRouter.Plan memory p=plan(alice);bytes memory signature=sign(p);vm.expectRevert();router.fund{value:1 ether+10000}(p,signature);submit(p);vm.expectRevert();vm.prank(alice);router.fund{value:1 ether+10000}(p,signature);require(portal.depositNonces(alice)==1);}
 function testExpiredConsentAndChangedChainFail() public {RollingFundingRouter.Plan memory p=plan(alice);bytes memory signature=sign(p);vm.warp(p.deadline+1);vm.expectRevert();vm.prank(alice);router.fund{value:1 ether+10000}(p,signature);empty();p=plan(alice);signature=sign(p);vm.chainId(block.chainid+1);vm.expectRevert();vm.prank(alice);router.fund{value:1 ether+10000}(p,signature);empty();}
 function testDonationRemainsSurplusAndCannotBeRefundedToUser() public {new FundingForce{value:123}(payable(address(router)));submit(plan(alice));require(address(router).balance==123 && alice.balance==9 ether-3000);}
 function testContractBeneficiaryConsentAndRejectedRefundAtomicity() public {FundingConsentAccount account=new FundingConsentAccount();RollingFundingRouter.Plan memory p=plan(address(account));account.configure(portal.depositForDigest(address(account),address(router),p.collateral,p.collateralSecretHash,0,p.deadline),true);vm.expectRevert();account.fund{value:1 ether+10000}(router,p);require(portal.getDeposit(address(account))==0 && portal.depositNonces(address(account))==0);empty();account.configure(portal.depositForDigest(address(account),address(router),p.collateral,p.collateralSecretHash,0,p.deadline),false);account.fund{value:1 ether+10000}(router,p);require(portal.getDeposit(address(account))==1 ether && address(account).balance==7000);}
}
