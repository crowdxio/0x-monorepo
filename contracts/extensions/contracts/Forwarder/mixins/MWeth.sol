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


contract MWeth {

    /// @dev Converts message call's ETH value into WETH.
    function convertEthToWeth()
        internal;

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
    internal;
}
