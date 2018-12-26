import {
	artifacts as protocolArtifacts,
	ERC20Wrapper,
	ERC721Wrapper,
	ExchangeContract,
	ExchangeWrapper,
} from '@0x/contracts-protocol';
import {
	chaiSetup,
	constants,
	ContractName,
	ERC20BalancesByOwner,
	expectContractCreationFailedAsync,
	expectTransactionFailedAsync,
	OrderFactory,
	provider,
	sendTransactionResult,
	txDefaults,
	web3Wrapper,
} from '@0x/contracts-test-utils';
import {
	artifacts as tokenArtifacts,
	DummyERC20TokenContract,
	DummyERC721TokenContract,
	WETH9Contract,
} from '@0x/contracts-tokens';
import {BlockchainLifecycle} from '@0x/dev-utils';
import {assetDataUtils} from '@0x/order-utils';
import {RevertReason, SignedOrder} from '@0x/types';
import {BigNumber} from '@0x/utils';
import {Web3Wrapper} from '@0x/web3-wrapper';
import * as chai from 'chai';
import {TransactionReceiptWithDecodedLogs} from 'ethereum-types';

import {ForwarderContract} from '../../generated-wrappers/forwarder';
import {artifacts} from '../../src/artifacts';

import {ForwarderWrapper} from '../utils/forwarder_wrapper';

chaiSetup.configure();
const expect = chai.expect;
const blockchainLifecycle = new BlockchainLifecycle(web3Wrapper);
const DECIMALS_DEFAULT = 18;
const MAX_WETH_FILL_PERCENTAGE = 95;

describe(ContractName.Forwarder, () => {
	let makerAddress: string;
	let owner: string;
	let takerAddress: string;
	let feeRecipientPlatform: string;
	let feeRecipientCreative: string;
	let defaultMakerAssetAddress: string;
	let zrxAssetData: string;
	let wethAssetData: string;

	let weth: DummyERC20TokenContract;
	let zrxToken: DummyERC20TokenContract;
	let erc20TokenA: DummyERC20TokenContract;
	let erc721Token: DummyERC721TokenContract;
	let forwarderContract: ForwarderContract;
	let wethContract: WETH9Contract;
	let forwarderWrapper: ForwarderWrapper;
	let exchangeWrapper: ExchangeWrapper;

	let orderWithoutFee: SignedOrder;
	let orderWithFee: SignedOrder;
	let feeOrder: SignedOrder;
	let orderFactory: OrderFactory;
	let erc20Wrapper: ERC20Wrapper;
	let erc20Balances: ERC20BalancesByOwner;
	let tx: TransactionReceiptWithDecodedLogs;

	let erc721MakerAssetIds: BigNumber[];
	let takerEthBalanceBefore: BigNumber;
	let creativeEthBalanceBefore: BigNumber;
	let feePercentage: BigNumber;
	let gasPrice: BigNumber;

	before(async () => {
		await blockchainLifecycle.startAsync();
		const accounts = await web3Wrapper.getAvailableAddressesAsync();
		const usedAddresses = ([owner, makerAddress, takerAddress, feeRecipientPlatform, feeRecipientCreative] = accounts);

		const txHash = await web3Wrapper.sendTransactionAsync({from: accounts[0], to: accounts[0], value: 0});
		const transaction = await web3Wrapper.getTransactionByHashAsync(txHash);
		gasPrice = new BigNumber(transaction.gasPrice);

		const erc721Wrapper = new ERC721Wrapper(provider, usedAddresses, owner);
		erc20Wrapper = new ERC20Wrapper(provider, usedAddresses, owner);

		const numDummyErc20ToDeploy = 3;
		[erc20TokenA, zrxToken] = await erc20Wrapper.deployDummyTokensAsync(
			numDummyErc20ToDeploy,
			constants.DUMMY_TOKEN_DECIMALS,
		);
		const erc20Proxy = await erc20Wrapper.deployProxyAsync();
		await erc20Wrapper.setBalancesAndAllowancesAsync();

		[erc721Token] = await erc721Wrapper.deployDummyTokensAsync();
		const erc721Proxy = await erc721Wrapper.deployProxyAsync();
		await erc721Wrapper.setBalancesAndAllowancesAsync();
		const erc721Balances = await erc721Wrapper.getBalancesAsync();
		erc721MakerAssetIds = erc721Balances[makerAddress][erc721Token.address];

		wethContract = await WETH9Contract.deployFrom0xArtifactAsync(tokenArtifacts.WETH9, provider, txDefaults);
		weth = new DummyERC20TokenContract(wethContract.abi, wethContract.address, provider);
		erc20Wrapper.addDummyTokenContract(weth);

		wethAssetData = assetDataUtils.encodeERC20AssetData(wethContract.address);
		zrxAssetData = assetDataUtils.encodeERC20AssetData(zrxToken.address);
		const exchangeInstance = await ExchangeContract.deployFrom0xArtifactAsync(
			protocolArtifacts.Exchange,
			provider,
			txDefaults,
			zrxAssetData,
		);
		exchangeWrapper = new ExchangeWrapper(exchangeInstance, provider);
		await exchangeWrapper.registerAssetProxyAsync(erc20Proxy.address, owner);
		await exchangeWrapper.registerAssetProxyAsync(erc721Proxy.address, owner);

		await erc20Proxy.addAuthorizedAddress.sendTransactionAsync(exchangeInstance.address, {
			from: owner,
		});
		await erc721Proxy.addAuthorizedAddress.sendTransactionAsync(exchangeInstance.address, {
			from: owner,
		});

		defaultMakerAssetAddress = erc20TokenA.address;
		const defaultTakerAssetAddress = wethContract.address;
		const defaultOrderParams = {
			exchangeAddress: exchangeInstance.address,
			makerAddress,
			feeRecipientAddress: feeRecipientCreative,
			makerAssetData: assetDataUtils.encodeERC20AssetData(defaultMakerAssetAddress),
			takerAssetData: assetDataUtils.encodeERC20AssetData(defaultTakerAssetAddress),
			makerAssetAmount: Web3Wrapper.toBaseUnitAmount(new BigNumber(1), DECIMALS_DEFAULT),
			takerAssetAmount: Web3Wrapper.toBaseUnitAmount(new BigNumber(10), DECIMALS_DEFAULT),
			makerFee: Web3Wrapper.toBaseUnitAmount(new BigNumber(1), DECIMALS_DEFAULT),
			takerFee: Web3Wrapper.toBaseUnitAmount(new BigNumber(0), DECIMALS_DEFAULT),
		};
		const privateKey = constants.TESTRPC_PRIVATE_KEYS[accounts.indexOf(makerAddress)];
		orderFactory = new OrderFactory(privateKey, defaultOrderParams);

		const forwarderInstance = await ForwarderContract.deployFrom0xArtifactAsync(
			artifacts.Forwarder,
			provider,
			txDefaults,
			exchangeInstance.address,
			zrxAssetData,
			wethAssetData,
		);
		forwarderContract = new ForwarderContract(forwarderInstance.abi, forwarderInstance.address, provider);
		forwarderWrapper = new ForwarderWrapper(forwarderContract, provider);
		const zrxDepositAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(10000), 18);
		await web3Wrapper.awaitTransactionSuccessAsync(
			await zrxToken.transfer.sendTransactionAsync(forwarderContract.address, zrxDepositAmount),
		);
		erc20Wrapper.addTokenOwnerAddress(forwarderInstance.address);
	});
	after(async () => {
		await blockchainLifecycle.revertAsync();
	});
	beforeEach(async () => {
		await blockchainLifecycle.startAsync();
		erc20Balances = await erc20Wrapper.getBalancesAsync();
		takerEthBalanceBefore = await web3Wrapper.getBalanceInWeiAsync(takerAddress);
		creativeEthBalanceBefore = await web3Wrapper.getBalanceInWeiAsync(feeRecipientCreative);
		orderWithoutFee = await orderFactory.newSignedOrderAsync();
		feeOrder = await orderFactory.newSignedOrderAsync({
			makerAssetData: assetDataUtils.encodeERC20AssetData(zrxToken.address),
			takerFee: Web3Wrapper.toBaseUnitAmount(new BigNumber(1), DECIMALS_DEFAULT),
		});
		orderWithFee = await orderFactory.newSignedOrderAsync({
			takerFee: Web3Wrapper.toBaseUnitAmount(new BigNumber(1), DECIMALS_DEFAULT),
		});
	});
	afterEach(async () => {
		await blockchainLifecycle.revertAsync();
	});

	describe('constructor', () => {
		it('should revert if assetProxy is unregistered', async () => {
			const exchangeInstance = await ExchangeContract.deployFrom0xArtifactAsync(
				protocolArtifacts.Exchange,
				provider,
				txDefaults,
				zrxAssetData,
			);
			return expectContractCreationFailedAsync(
				(ForwarderContract.deployFrom0xArtifactAsync(
					artifacts.Forwarder,
					provider,
					txDefaults,
					exchangeInstance.address,
					zrxAssetData,
					wethAssetData,
				) as any) as sendTransactionResult,
				RevertReason.UnregisteredAssetProxy,
			);
		});
	});
	describe('marketBuyOrdersWithEth', () => {
		it('should buy an ERC721 asset from a single order', async () => {
			const makerAssetId = erc721MakerAssetIds[0];
			orderWithoutFee = await orderFactory.newSignedOrderAsync({
				feeRecipientAddress: feeRecipientCreative,
				makerFee: Web3Wrapper.toBaseUnitAmount(new BigNumber(0), DECIMALS_DEFAULT),
				takerFee: Web3Wrapper.toBaseUnitAmount(new BigNumber(0), DECIMALS_DEFAULT),
				makerAssetAmount: new BigNumber(1),
				makerAssetData: assetDataUtils.encodeERC721AssetData(erc721Token.address, makerAssetId),

			});
			const orders = [orderWithoutFee];
			const feeOrders: SignedOrder[] = [];
			const makerAssetFillAmount = new BigNumber(1);
			const extraFeePercentageCrowdx = 10;
			const ethValue = orderWithFee.takerAssetAmount.add(orderWithFee.takerAssetAmount.dividedToIntegerBy(extraFeePercentageCrowdx));

			const platformFeePercentage = 1;
			const creativeFeePercentage = 9;
			feePercentage = ForwarderWrapper.getPercentageOfValue(constants.PERCENTAGE_DENOMINATOR, platformFeePercentage);
			const platformEthBalanceBefore = await web3Wrapper.getBalanceInWeiAsync(feeRecipientPlatform);

			tx = await forwarderWrapper.marketBuyOrdersWithEthAsync(
				orders,
				feeOrders,
				makerAssetFillAmount,
				{
					from: takerAddress,
					value: ethValue,
				},
				{feePercentage, feeRecipient: feeRecipientPlatform},
			);

			const takerEthBalanceAfter = await web3Wrapper.getBalanceInWeiAsync(takerAddress);
			const creativeEthBalanceAfter = await web3Wrapper.getBalanceInWeiAsync(feeRecipientCreative);
			const platformEthBalanceAfter = await web3Wrapper.getBalanceInWeiAsync(feeRecipientPlatform);
			const forwarderEthBalance = await web3Wrapper.getBalanceInWeiAsync(forwarderContract.address);
			const newOwner = await erc721Token.ownerOf.callAsync(makerAssetId);
			const newBalances = await erc20Wrapper.getBalancesAsync();

			const primaryTakerAssetFillAmount = orderWithFee.takerAssetAmount.add(orderWithFee.takerAssetAmount.dividedToIntegerBy(100).mul(platformFeePercentage + creativeFeePercentage));

			const totalEthSpent = primaryTakerAssetFillAmount.plus(gasPrice.times(tx.gasUsed));
			expect(newOwner).to.be.bignumber.equal(takerAddress);
			expect(takerEthBalanceAfter).to.be.bignumber.equal(takerEthBalanceBefore.minus(totalEthSpent));
			expect(platformEthBalanceAfter).to.be.bignumber.equal((platformEthBalanceBefore.plus(orderWithFee.takerAssetAmount.div(100).mul(platformFeePercentage))).mul(orders.length));
			expect(creativeEthBalanceAfter).to.be.bignumber.equal((creativeEthBalanceBefore.plus(orderWithFee.takerAssetAmount.div(100).mul(creativeFeePercentage))).mul(orders.length));

			const primaryTakerAssetFillAmountWithoutFees = ethValue.mul(100).div(extraFeePercentageCrowdx + 100);
			expect(newBalances[makerAddress][weth.address]).to.be.bignumber.equal(
				erc20Balances[makerAddress][weth.address].plus(primaryTakerAssetFillAmountWithoutFees),
			);

			expect(newBalances[forwarderContract.address][weth.address]).to.be.bignumber.equal(constants.ZERO_AMOUNT);

			expect(newBalances[forwarderContract.address][defaultMakerAssetAddress]).to.be.bignumber.equal(
				constants.ZERO_AMOUNT,
			);

			expect(forwarderEthBalance).to.be.bignumber.equal(constants.ZERO_AMOUNT);
		});
	});
	/*
	describe('marketSellOrdersWithEth', () => {
		it('should fill a single order', async () => {
			const makerAssetId = erc721MakerAssetIds[0];
			orderWithoutFee = await orderFactory.newSignedOrderAsync({
				makerAssetAmount: new BigNumber(1),
				makerAssetData: assetDataUtils.encodeERC721AssetData(erc721Token.address, makerAssetId),
				feeRecipientAddress: feeRecipientCreative,
				makerFee: Web3Wrapper.toBaseUnitAmount(new BigNumber(0), DECIMALS_DEFAULT),
				takerFee: Web3Wrapper.toBaseUnitAmount(new BigNumber(0), DECIMALS_DEFAULT),

			});
			const orders = [orderWithoutFee];
			const feeOrders: SignedOrder[] = [];
			const extraFeePercentageCrowdx = 10;
			const ethValue = orderWithFee.takerAssetAmount.add(orderWithFee.takerAssetAmount.dividedToIntegerBy(extraFeePercentageCrowdx));

			const platformFeePercentage = 1;
			const creativeFeePercentage = 9;
			feePercentage = ForwarderWrapper.getPercentageOfValue(constants.PERCENTAGE_DENOMINATOR, platformFeePercentage);
			const platformEthBalanceBefore = await web3Wrapper.getBalanceInWeiAsync(feeRecipientPlatform);

			tx = await forwarderWrapper.marketSellOrdersWithEthAsync(
				orders,
				feeOrders,
				{
					from: takerAddress,
					value: ethValue,
				},
				{feePercentage, feeRecipient: feeRecipientPlatform},
			);

			const takerEthBalanceAfter = await web3Wrapper.getBalanceInWeiAsync(takerAddress);
			const forwarderEthBalance = await web3Wrapper.getBalanceInWeiAsync(forwarderContract.address);
			const newBalances = await erc20Wrapper.getBalancesAsync();

			const primaryTakerAssetFillAmount = ForwarderWrapper.getPercentageOfValue(
				ethValue,
				MAX_WETH_FILL_PERCENTAGE,
			);
			const makerAssetFillAmount = primaryTakerAssetFillAmount
				.times(orderWithoutFee.makerAssetAmount)
				.dividedToIntegerBy(orderWithoutFee.takerAssetAmount);
			const totalEthSpent = primaryTakerAssetFillAmount.plus(gasPrice.times(tx.gasUsed));

			expect(takerEthBalanceAfter).to.be.bignumber.equal(takerEthBalanceBefore.minus(totalEthSpent));
			expect(newBalances[makerAddress][defaultMakerAssetAddress]).to.be.bignumber.equal(
				erc20Balances[makerAddress][defaultMakerAssetAddress].minus(makerAssetFillAmount),
			);
			expect(newBalances[takerAddress][defaultMakerAssetAddress]).to.be.bignumber.equal(
				erc20Balances[takerAddress][defaultMakerAssetAddress].plus(makerAssetFillAmount),
			);
			expect(newBalances[makerAddress][weth.address]).to.be.bignumber.equal(
				erc20Balances[makerAddress][weth.address].plus(primaryTakerAssetFillAmount),
			);
			expect(newBalances[forwarderContract.address][weth.address]).to.be.bignumber.equal(constants.ZERO_AMOUNT);
			expect(newBalances[forwarderContract.address][defaultMakerAssetAddress]).to.be.bignumber.equal(
				constants.ZERO_AMOUNT,
			);
			expect(forwarderEthBalance).to.be.bignumber.equal(constants.ZERO_AMOUNT);
		});
	}); */
});
// tslint:disable:max-file-line-count
// tslint:enable:no-unnecessary-type-assertion
