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
pragma experimental ABIEncoderV2;

import "./libs/LibConstants.sol";
import "./mixins/MWeth.sol";
import "./mixins/MAssets.sol";
import "./mixins/MExchangeWrapper.sol";
import "./interfaces/IForwarderCore.sol";
import "@0x/contracts-utils/contracts/utils/LibBytes/LibBytes.sol";
import "@0x/contracts-libs/contracts/libs/LibOrder.sol";
import "@0x/contracts-libs/contracts/libs/LibFillResults.sol";
import "@0x/contracts-libs/contracts/libs/LibMath.sol";


contract MixinForwarderCore is
    LibFillResults,
    LibMath,
    LibConstants,
    MWeth,
    MAssets,
    MExchangeWrapper,
    IForwarderCore
{
    using LibBytes for bytes;

    /// @dev Constructor approves ERC20 proxy to transfer ZRX and WETH on this contract's behalf.
    constructor ()
        public
    {
        address proxyAddressERC20 = EXCHANGE.getAssetProxy(ERC20_DATA_ID);
        address proxyAddressERC721 = EXCHANGE.getAssetProxy(ERC721_DATA_ID);
        require(
            proxyAddressERC20 != address(0),
            "UNREGISTERED_ASSET_PROXY"
        );
        require(
            proxyAddressERC721 != address(0),
            "UNREGISTERED_ASSET_PROXY"
        );

        ETHER_TOKEN.approve(proxyAddressERC20, MAX_UINT);
    }

    /// @dev Purchases as much of orders' makerAssets as possible by selling up to 95% of transaction's ETH value.
    ///      Any ZRX required to pay fees for primary orders will automatically be purchased by this contract.
    ///      5% of ETH value is reserved for paying fees to order feeRecipients (in ZRX) and forwarding contract feeRecipient (in ETH).
    ///      Any ETH not spent will be refunded to sender.
    /// @param orders Array of order specifications used containing desired makerAsset and WETH as takerAsset.
    /// @param signatures Proofs that orders have been created by makers.
    /// @param feeOrders Array of order specifications containing ZRX as makerAsset and WETH as takerAsset. Used to purchase ZRX for primary order fees.
    /// @param feeSignatures Proofs that feeOrders have been created by makers.
    /// @param feePercentage Percentage of WETH sold that will payed as fee to forwarding contract feeRecipient.
    /// @param feeRecipient Address that will receive ETH when orders are filled.
    /// @return Amounts filled and fees paid by maker and taker for both sets of orders.
    function marketSellOrdersWithEth(
        LibOrder.Order[] memory orders,
        bytes[] memory signatures,
        LibOrder.Order[] memory feeOrders,
        bytes[] memory feeSignatures,
        uint256  feePercentage,
        address feeRecipient
    )
        public
        payable
        returns (
            FillResults memory orderFillResults,
            FillResults memory feeOrderFillResults
        )
    {
        require(feeOrders.length == 0,
            "FEE_ORDERS_ARRAY_NOT_EMPTY"
        );

        require(feeRecipient != address(0),
            "FEE_RECIPIENT_NOT_SUPPLIED"
        );

        // Parse the assetProxyId. We do not use `LibBytes.readBytes4` for gas efficiency reasons.
        bytes4 assetProxyId;
        bytes memory assetData = orders[0].makerAssetData;
        assembly {
            assetProxyId := and(mload(
            add(assetData, 32)),
            0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }

        require(assetProxyId == ERC721_DATA_ID,
            "ASSET_ID_OTHER_THAN_ERC721"
        );

        // Convert ETH to WETH.
        convertEthToWeth();

        uint256 wethSellAmount;
        uint256 makerAssetAmountPurchased;
        {
            // 10% of WETH is reserved for filling paying feeRecipient (the crowdx exchange).
            wethSellAmount = getPartialAmountFloor(
                MAX_WETH_FILL_PERCENTAGE_CROWDX,
                PERCENTAGE_DENOMINATOR,
                msg.value
            );
            // Market sell 90% of WETH.
            // ZRX fees are payed with this contract's balance.
            orderFillResults = marketSellWeth(
                orders,
                wethSellAmount,
                signatures
            );

            makerAssetAmountPurchased = orderFillResults.makerAssetFilledAmount;
        }

        // Transfer feePercentage of total ETH spent on primary orders to feeRecipient.
        // Refund remaining ETH to msg.sender.
        address feeRecipientCreative = orders[0].feeRecipientAddress;
        transferEthFeeAndRefund(
            orderFillResults.takerAssetFilledAmount,
            feePercentage,
            feeRecipient,
            feeRecipientCreative
        );

        // Transfer purchased assets to msg.sender.
        transferAssetToSender(orders[0].makerAssetData, makerAssetAmountPurchased);
    }

    /// @dev Attempt to purchase makerAssetFillAmount of makerAsset by selling ETH provided with transaction.
    ///      Any ZRX required to pay fees for primary orders will automatically be purchased by this contract.
    ///      Any ETH not spent will be refunded to sender.
    /// @param orders Array of order speciefications used containing desired makerAsset and WETH as takerAsset.
    /// @param makerAssetFillAmount Desired amount of makerAsset to purchase.
    /// @param signatures Proofs that orders have been created by makers.
    /// @param feeOrders Array of order specifications containing ZRX as makerAsset and WETH as takerAsset. Used to purchase ZRX for primary order fees.
    /// @param feeSignatures Proofs that feeOrders have been created by makers.
    /// @param feePercentage Percentage of WETH sold that will payed as fee to forwarding contract feeRecipient.
    /// @param feeRecipient Address that will receive ETH when orders are filled.
    /// @return Amounts filled and fees paid by maker and taker for both sets of orders.
    function marketBuyOrdersWithEth(
        LibOrder.Order[] memory orders,
        uint256 makerAssetFillAmount,
        bytes[] memory signatures,
        LibOrder.Order[] memory feeOrders,
        bytes[] memory feeSignatures,
        uint256  feePercentage,
        address feeRecipient
    )
        public
        payable
        returns (
            FillResults memory orderFillResults,
            FillResults memory feeOrderFillResults
        )
    {
        require(feeOrders.length == 0,
            "FEE_ORDERS_ARRAY_NOT_EMPTY"
        );

        require(feeRecipient != address(0),
            "FEE_RECIPIENT_NOT_SUPPLIED"
        );

        // Parse the assetProxyId. We do not use `LibBytes.readBytes4` for gas efficiency reasons.
        bytes4 assetProxyId;
        bytes memory assetData = orders[0].makerAssetData;
        assembly {
            assetProxyId := and(mload(
            add(assetData, 32)),
            0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }

        require(assetProxyId == ERC721_DATA_ID,
            "ASSET_ID_OTHER_THAN_ERC721"
        );

        // Convert ETH to WETH.
        convertEthToWeth();

        uint256 makerAssetAmountPurchased;
        {
            // Attemp to purchase desired amount of makerAsset.
            orderFillResults = marketBuyExactAmountWithWeth(
                orders,
                makerAssetFillAmount,
                signatures
            );

            makerAssetAmountPurchased = orderFillResults.makerAssetFilledAmount;
        }

        // Transfer feePercentage of total ETH spent on primary orders to feeRecipient.
        // Refund remaining ETH to msg.sender.
        address feeRecipientCreative = orders[0].feeRecipientAddress;
        transferEthFeeAndRefund(
            orderFillResults.takerAssetFilledAmount,
            feePercentage,
            feeRecipient,
            feeRecipientCreative
        );

        // Transfer purchased assets to msg.sender.
        transferAssetToSender(orders[0].makerAssetData, makerAssetAmountPurchased);
    }
}
