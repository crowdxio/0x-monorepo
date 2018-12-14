"""Test zero_ex.order_utils.get_order_info()."""

from copy import copy

from web3 import Web3

from zero_ex.order_utils import (
    _Constants,
    get_order_info,
    generate_order_hash_hex,
)


def test_get_order_info__happy_path():
    """Test that get_order_info() works as expected."""
    order = {
        "makerAddress": "0x0000000000000000000000000000000000000000",
        "takerAddress": "0x0000000000000000000000000000000000000000",
        "feeRecipientAddress": "0x0000000000000000000000000000000000000000",
        "senderAddress": "0x0000000000000000000000000000000000000000",
        "makerAssetAmount": 1000000000000000000,
        "takerAssetAmount": 1000000000000000000,
        "makerFee": 0,
        "takerFee": 0,
        "expirationTimeSeconds": 12345,
        "salt": 12345,
        "makerAssetData": (b"\x00") * 20,
        "takerAssetData": (b"\x00") * 20,
    }

    order_status, order_hash, order_taker_asset_filled_amount = get_order_info(
        Web3.HTTPProvider("http://127.0.0.1:8545"), order
    )

    assert isinstance(order_status, int)
    assert order_status == 4
    assert isinstance(order_hash, bytes)
    order2 = copy(order)
    order2["takerAssetData"] = "0x" + order2["takerAssetData"].hex()
    order2["makerAssetData"] = "0x" + order2["makerAssetData"].hex()
    order2["exchangeAddress"] = _Constants.network_to_exchange_addr["50"]
    assert order_hash.hex() == generate_order_hash_hex(order2)
    assert isinstance(order_taker_asset_filled_amount, int)
    assert order_taker_asset_filled_amount == 0
