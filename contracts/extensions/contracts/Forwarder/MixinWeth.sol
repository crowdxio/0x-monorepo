/*

  Copyright 2018 ZeroEx Intl.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

*/

pragma solidity 0.4.24;

import "@0x/contracts-libs/contracts/libs/LibMath.sol";
import "./libs/LibConstants.sol";
import "./mixins/MWeth.sol";


contract MixinWeth is
    LibMath,
    LibConstants,
    MWeth
{
    /// @dev Default payabale function, this allows us to withdraw WETH
    function ()
        public
        payable
    {
        require(
            msg.sender == address(ETHER_TOKEN),
            "DEFAULT_FUNCTION_WETH_CONTRACT_ONLY"
        );
    }

    /// @dev Converts message call's ETH value into WETH.
    function convertEthToWeth()
        internal
    {
        require(
            msg.value > 0,
            "INVALID_MSG_VALUE"
        );
        ETHER_TOKEN.deposit.value(msg.value)();
    }

    /// @dev Transfers feePercentage of WETH spent on primary orders to feeRecipient.
    ///      Refunds any excess ETH to msg.sender.
    /// @param wethSoldExcludingFeeOrders Amount of WETH sold when filling primary orders.
    /// @param platformFeePercentage Percentage of WETH sold will be payed to the fee recipient (crowd platoform)
    /// @param platformFeeRecipient Address that will receive ETH when orders are filled.
    /// @param creativeFeeRecipient Address that will receive ETH when orders are filled.
    function transferEthFeeAndRefund(
        uint256 wethSoldExcludingFeeOrders,
        uint256 platformFeePercentage,
        address platformFeeRecipient,
        address creativeFeeRecipient
    )
    internal
    {
        // Ensure feePercentage is less than 10%.
        require(
            platformFeePercentage <= MAX_FEE_PERCENTAGE_CROWDX,
            "FEE_PERCENTAGE_TOO_LARGE"
        );

        // Ensure that no extra WETH owned by this contract has been sold.
        require(
            wethSoldExcludingFeeOrders <= msg.value,
            "OVERSOLD_WETH"
        );

        // Calculate amount of WETH that hasn't been sold.
        uint256 wethRemaining = safeSub(msg.value, wethSoldExcludingFeeOrders);

        // Calculate ETH fee to pay to feeRecipient.
        uint256 ethFeePlatform = getPartialAmountFloor(
            platformFeePercentage,
            PERCENTAGE_DENOMINATOR,
            wethSoldExcludingFeeOrders
        );

        uint256 ethFeeCreative = getPartialAmountFloor(
            WETH_FILL_PERCENTAGE_CREATIVE_CROWDX,
            PERCENTAGE_DENOMINATOR,
            wethSoldExcludingFeeOrders
        );

        uint256 totalFees = safeAdd(ethFeePlatform, ethFeeCreative);

        // Ensure fee is less than amount of WETH remaining.
        require(
            totalFees <= wethRemaining,
            "INSUFFICIENT_ETH_REMAINING"
        );

        // Do nothing if no WETH remaining
        if (wethRemaining > 0) {
            // Convert remaining WETH to ETH
            ETHER_TOKEN.withdraw(wethRemaining);

            // Pay ETH to feeRecipient
            if (ethFeePlatform > 0) {
                platformFeeRecipient.transfer(ethFeePlatform);
            }

            if (ethFeeCreative > 0) {
                creativeFeeRecipient.transfer(ethFeeCreative);
            }

            // Refund remaining ETH to msg.sender.
            uint256 ethRefund = safeSub(wethRemaining, totalFees);
            if (ethRefund > 0) {
                msg.sender.transfer(ethRefund);
            }
        }
    }
}
