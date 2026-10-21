// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;
import {PluginPortal} from "./PluginPortal.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@oz/utils/ReentrancyGuard.sol";
interface BokWrappedEth is IERC20 { function deposit() external payable; function withdraw(uint256) external; }
interface BokSwapRouter {
    struct ExactOutputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }
    function exactOutputSingle(ExactOutputSingleParams calldata) external payable returns(uint256);
}
/// @notice Buy and bridge an exact amount of Bok credit with one Ethereum payment.
/// @dev Fixed portal/token/exchange; no administrator, arbitrary calls or retained payment balance.
contract BokCreditRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    PluginPortal public immutable bokPortal;
    IERC20 public immutable bokToken;
    BokWrappedEth public immutable weth;
    BokSwapRouter public immutable swapRouter;
    uint256 public immutable chainId;
    struct Purchase { bytes32 commitment; uint128 amount; bytes32 secretHash; uint24 poolFee; uint256 deadline; }
    event CreditPurchased(address indexed payer, bytes32 indexed commitment, uint128 amount,
        bytes32 secretHash, bytes32 key, uint256 index, uint256 spentWei, uint256 refundWei);
    constructor(address portal_,address weth_,address swap_) {
        require(portal_.code.length>0 && weth_.code.length>0 && swap_.code.length>0,"Invalid scope");
        bokPortal=PluginPortal(portal_); bokToken=bokPortal.token();
        require(bokPortal.chainId()==block.chainid && address(bokToken).code.length>0 && address(bokToken)!=weth_,"Invalid token/chain");
        weth=BokWrappedEth(weth_); swapRouter=BokSwapRouter(swap_); chainId=block.chainid;
    }
    function buyCredit(Purchase calldata p) external payable nonReentrant returns(bytes32 key,uint256 index) {
        require(block.chainid==chainId && block.timestamp<=p.deadline,"Invalid chain/deadline");
        require(msg.value>0 && p.amount>0 && (p.poolFee==100 || p.poolFee==500 || p.poolFee==3000 || p.poolFee==10000),"Invalid purchase");
        uint256 ethBefore=address(this).balance-msg.value;
        uint256 wrappedBefore=weth.balanceOf(address(this));
        uint256 tokenBefore=bokToken.balanceOf(address(this));
        weth.deposit{value:msg.value}();
        IERC20(address(weth)).forceApprove(address(swapRouter),msg.value);
        uint256 spent=swapRouter.exactOutputSingle(BokSwapRouter.ExactOutputSingleParams(address(weth),address(bokToken),p.poolFee,address(this),p.amount,msg.value,0));
        IERC20(address(weth)).forceApprove(address(swapRouter),0);
        require(spent>0 && spent<=msg.value && weth.balanceOf(address(this))==wrappedBefore+msg.value-spent
            && bokToken.balanceOf(address(this))==tokenBefore+p.amount,"Swap balance mismatch");
        bokToken.forceApprove(address(bokPortal),p.amount);
        (key,index)=bokPortal.deposit(p.commitment,p.amount,p.secretHash);
        bokToken.forceApprove(address(bokPortal),0);
        require(bokToken.balanceOf(address(this))==tokenBefore,"Credit debit mismatch");
        uint256 refund=msg.value-spent;
        if(refund>0) { weth.withdraw(refund); (bool ok,)=msg.sender.call{value:refund}(""); require(ok,"Refund rejected"); }
        require(address(this).balance==ethBefore && weth.balanceOf(address(this))==wrappedBefore,"Retained payment");
        emit CreditPurchased(msg.sender,p.commitment,p.amount,p.secretHash,key,index,spent,refund);
    }
    receive() external payable { require(msg.sender==address(weth),"Unsolicited ETH"); }
}
