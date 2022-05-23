var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useCallback, useEffect, useState, useMemo } from 'react';
import { constants, utils } from 'ethers';
import { useLocalStorage } from '@rehooks/local-storage';
import { MaxUint256 } from '@ethersproject/constants';
import { EthBridger, Erc20Bridger, MultiCaller, L1ToL2MessageStatus, L2ToL1Message, L2ToL1MessageReader, L2TransactionReceipt } from '@arbitrum/sdk';
import { getOutboxAddr } from '@arbitrum/sdk/dist/lib/dataEntities/networks';
import { ERC20__factory } from '@arbitrum/sdk/dist/lib/abi/factories/ERC20__factory';
import { StandardArbERC20__factory } from '@arbitrum/sdk/dist/lib/abi/factories/StandardArbERC20__factory';
import useTransactions from './useTransactions';
import { AssetType, TokenType, OutgoingMessageState } from './arbTokenBridge.types';
import { getLatestOutboxEntryIndex, messageHasExecuted, getETHWithdrawals, getTokenWithdrawals as getTokenWithdrawalsGraph, getL2GatewayGraphLatestBlockNumber, getBuiltInsGraphLatestBlockNumber } from '../util/graph';
const { Zero } = constants;
export const wait = (ms = 0) => {
    return new Promise(res => setTimeout(res, ms));
};
const addressToSymbol = {};
const addressToDecimals = {};
class TokenDisabledError extends Error {
    constructor(msg) {
        super(msg);
        this.name = 'TokenDisabledError';
    }
}
function getDefaultTokenName(address) {
    const lowercased = address.toLowerCase();
    return (lowercased.substring(0, 5) +
        '...' +
        lowercased.substring(lowercased.length - 3));
}
function getDefaultTokenSymbol(address) {
    const lowercased = address.toLowerCase();
    return (lowercased.substring(0, 5) +
        '...' +
        lowercased.substring(lowercased.length - 3));
}
function assertSignersHaveProviders(params) {
    if (typeof params.l1.signer === 'undefined') {
        throw new Error(`No Provider found for L1 Signer`);
    }
    if (typeof params.l2.signer === 'undefined') {
        throw new Error(`No Provider found for L2 Signer`);
    }
}
export const useArbTokenBridge = (params, autoLoadCache = true) => {
    assertSignersHaveProviders(params);
    const { walletAddress, l1, l2 } = params;
    const defaultBalance = {
        balance: null,
        arbChainBalance: null
    };
    const [ethBalances, setEthBalances] = useState(defaultBalance);
    const [bridgeTokens, setBridgeTokens] = useState({});
    const balanceIsEmpty = (balance) => balance['balance'] === defaultBalance['balance'] &&
        balance['arbChainBalance'] === defaultBalance['arbChainBalance'];
    const [erc20Balances, setErc20Balances] = useState({});
    const [erc721Balances, setErc721Balances] = useState({});
    const defaultTokenList = [];
    const tokenBlackList = [];
    const [ERC20Cache, setERC20Cache, clearERC20Cache] = useLocalStorage('ERC20Cache', []);
    const [ERC721Cache, setERC721Cache, clearERC721Cache] = useLocalStorage('ERC721Cache', []);
    const [executedMessagesCache, setExecutedMessagesCache, clearExecutedMessagesCache] = useLocalStorage('executedMessagesCache', {});
    const [pendingWithdrawalsMap, setPendingWithdrawalMap] = useState({});
    const [transactions, { addTransaction, addTransactions, setTransactionFailure, clearPendingTransactions, setTransactionConfirmed, setTransactionSuccess, updateTransaction, removeTransaction, addFailedTransaction, fetchAndUpdateL1ToL2MsgStatus }] = useTransactions();
    const l1NetworkID = useMemo(() => String(l1.network.chainID), [l1.network]);
    const ethBridger = useMemo(() => new EthBridger(l2.network), [l2.network]);
    const erc20Bridger = useMemo(() => new Erc20Bridger(l2.network), [l2.network]);
    /**
     * Retrieves data about an ERC-20 token using its L1 address. Throws if fails to retrieve balance or allowance.
     * @param erc20L1Address
     * @returns
     */
    function getL1TokenData(erc20L1Address) {
        return __awaiter(this, void 0, void 0, function* () {
            const l1GatewayAddress = yield erc20Bridger.getL1GatewayAddress(erc20L1Address, l1.signer.provider);
            const contract = ERC20__factory.connect(erc20L1Address, l1.signer);
            const multiCaller = yield MultiCaller.fromProvider(l1.signer.provider);
            const [tokenData] = yield multiCaller.getTokenData([erc20L1Address], {
                name: true,
                symbol: true,
                balanceOf: { account: walletAddress },
                allowance: { owner: walletAddress, spender: l1GatewayAddress },
                decimals: true
            });
            if (typeof tokenData.balance === 'undefined') {
                throw new Error(`No balance method available`);
            }
            if (typeof tokenData.allowance === 'undefined') {
                throw new Error(`No allowance method available`);
            }
            return {
                name: tokenData.name || getDefaultTokenName(erc20L1Address),
                symbol: tokenData.symbol || getDefaultTokenSymbol(erc20L1Address),
                balance: tokenData.balance,
                allowance: tokenData.allowance,
                decimals: tokenData.decimals || 0,
                contract
            };
        });
    }
    /**
     * Retrieves data about an ERC-20 token using its L2 address. Throws if fails to retrieve balance.
     * @param erc20L2Address
     * @returns
     */
    function getL2TokenData(erc20L2Address) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = StandardArbERC20__factory.connect(erc20L2Address, l2.signer);
            const multiCaller = yield MultiCaller.fromProvider(l2.signer.provider);
            const [tokenData] = yield multiCaller.getTokenData([erc20L2Address], {
                balanceOf: { account: walletAddress }
            });
            if (typeof tokenData.balance === 'undefined') {
                throw new Error(`No balance method available`);
            }
            return {
                balance: tokenData.balance,
                contract
            };
        });
    }
    function getL2GatewayAddress(erc20L1Address) {
        return __awaiter(this, void 0, void 0, function* () {
            return erc20Bridger.getL2GatewayAddress(erc20L1Address, l2.signer.provider);
        });
    }
    /**
     * Retrieves the L1 address of an ERC-20 token using its L2 address.
     * @param erc20L2Address
     * @returns
     */
    function getL1ERC20Address(erc20L2Address) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield erc20Bridger.getL1ERC20Address(erc20L2Address, l2.signer.provider);
            }
            catch (error) {
                return null;
            }
        });
    }
    /**
     * Retrieves the L2 address of an ERC-20 token using its L1 address.
     * @param erc20L1Address
     * @returns
     */
    function getL2ERC20Address(erc20L1Address) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield erc20Bridger.getL2ERC20Address(erc20L1Address, l1.signer.provider);
        });
    }
    /**
     * Retrieves data about whether an ERC-20 token is disabled on the router.
     * @param erc20L1Address
     * @returns
     */
    function l1TokenIsDisabled(erc20L1Address) {
        return __awaiter(this, void 0, void 0, function* () {
            return erc20Bridger.l1TokenIsDisabled(erc20L1Address, l1.signer.provider);
        });
    }
    const depositEth = (amount) => __awaiter(void 0, void 0, void 0, function* () {
        const tx = yield ethBridger.deposit({
            l1Signer: l1.signer,
            l2Provider: l2.signer.provider,
            amount
        });
        addTransaction({
            type: 'deposit-l1',
            status: 'pending',
            value: utils.formatEther(amount),
            txID: tx.hash,
            assetName: 'ETH',
            assetType: AssetType.ETH,
            sender: walletAddress,
            l1NetworkID
        });
        const receipt = yield tx.wait();
        const l1ToL2Msg = yield receipt.getL1ToL2Message(l2.signer);
        const seqNum = l1ToL2Msg.messageNumber;
        const l1ToL2MsgData = {
            fetchingUpdate: false,
            status: L1ToL2MessageStatus.NOT_YET_CREATED,
            retryableCreationTxID: l1ToL2Msg.retryableCreationId,
            l2TxID: undefined
        };
        updateTransaction(receipt, tx, seqNum.toNumber(), l1ToL2MsgData);
        updateEthBalances();
    });
    function withdrawEth(amount) {
        return __awaiter(this, void 0, void 0, function* () {
            const tx = yield ethBridger.withdraw({ l2Signer: l2.signer, amount });
            try {
                addTransaction({
                    type: 'withdraw',
                    status: 'pending',
                    value: utils.formatEther(amount),
                    txID: tx.hash,
                    assetName: 'ETH',
                    assetType: AssetType.ETH,
                    sender: walletAddress,
                    blockNumber: tx.blockNumber || 0,
                    l1NetworkID
                });
                const receipt = yield tx.wait();
                updateTransaction(receipt, tx);
                updateEthBalances();
                const l2ToL1Events = receipt.getL2ToL1Events();
                if (l2ToL1Events.length === 1) {
                    const l2ToL1EventResult = l2ToL1Events[0];
                    console.info('withdraw event data:', l2ToL1EventResult);
                    const id = l2ToL1EventResult.uniqueId.toString();
                    const outgoingMessageState = OutgoingMessageState.NOT_FOUND;
                    const l2ToL1EventResultPlus = Object.assign(Object.assign({}, l2ToL1EventResult), { type: AssetType.ETH, value: amount, outgoingMessageState, symbol: 'ETH', decimals: 18, nodeBlockDeadline: 'NODE_NOT_CREATED' });
                    setPendingWithdrawalMap(oldPendingWithdrawalsMap => {
                        return Object.assign(Object.assign({}, oldPendingWithdrawalsMap), { [id]: l2ToL1EventResultPlus });
                    });
                }
                return receipt;
            }
            catch (e) {
                console.error('withdrawEth err', e);
            }
        });
    }
    const approveToken = (erc20L1Address) => __awaiter(void 0, void 0, void 0, function* () {
        const tx = yield erc20Bridger.approveToken({
            l1Signer: l1.signer,
            erc20L1Address
        });
        const tokenData = yield getL1TokenData(erc20L1Address);
        addTransaction({
            type: 'approve',
            status: 'pending',
            value: null,
            txID: tx.hash,
            assetName: tokenData.symbol,
            assetType: AssetType.ERC20,
            sender: walletAddress,
            l1NetworkID
        });
        const receipt = yield tx.wait();
        updateTransaction(receipt, tx);
        updateTokenData(erc20L1Address);
    });
    const approveTokenL2 = (erc20L1Address) => __awaiter(void 0, void 0, void 0, function* () {
        const bridgeToken = bridgeTokens[erc20L1Address];
        if (!bridgeToken)
            throw new Error('Bridge token not found');
        const { l2Address } = bridgeToken;
        if (!l2Address)
            throw new Error('L2 address not found');
        const gatewayAddress = yield getL2GatewayAddress(erc20L1Address);
        const contract = yield ERC20__factory.connect(l2Address, l2.signer);
        const tx = yield contract.functions.approve(gatewayAddress, MaxUint256);
        const tokenData = yield getL1TokenData(erc20L1Address);
        addTransaction({
            type: 'approve-l2',
            status: 'pending',
            value: null,
            txID: tx.hash,
            assetName: tokenData.symbol,
            assetType: AssetType.ERC20,
            sender: walletAddress,
            blockNumber: tx.blockNumber || 0,
            l1NetworkID: l1.network.chainID.toString()
        });
        const receipt = yield tx.wait();
        updateTransaction(receipt, tx);
        updateTokenData(erc20L1Address);
    });
    function depositToken(erc20L1Address, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            const { symbol, decimals } = yield getL1TokenData(erc20L1Address);
            const tx = yield erc20Bridger.deposit({
                l1Signer: l1.signer,
                l2Provider: l2.signer.provider,
                erc20L1Address,
                amount
            });
            addTransaction({
                type: 'deposit-l1',
                status: 'pending',
                value: utils.formatUnits(amount, decimals),
                txID: tx.hash,
                assetName: symbol,
                assetType: AssetType.ERC20,
                sender: walletAddress,
                l1NetworkID
            });
            const receipt = yield tx.wait();
            const l1ToL2Msg = yield receipt.getL1ToL2Message(l2.signer);
            const seqNum = l1ToL2Msg.messageNumber;
            const l1ToL2MsgData = {
                fetchingUpdate: false,
                status: L1ToL2MessageStatus.NOT_YET_CREATED,
                retryableCreationTxID: l1ToL2Msg.retryableCreationId,
                l2TxID: undefined
            };
            updateTransaction(receipt, tx, seqNum.toNumber(), l1ToL2MsgData);
            updateTokenData(erc20L1Address);
            return receipt;
        });
    }
    function withdrawToken(erc20l1Address, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            const bridgeToken = bridgeTokens[erc20l1Address];
            const { symbol, decimals } = yield (() => __awaiter(this, void 0, void 0, function* () {
                if (bridgeToken) {
                    const { symbol, decimals } = bridgeToken;
                    return { symbol, decimals };
                }
                const { symbol, decimals } = yield getL1TokenData(erc20l1Address);
                addToken(erc20l1Address);
                return { symbol, decimals };
            }))();
            const tx = yield erc20Bridger.withdraw({
                l2Signer: l2.signer,
                erc20l1Address,
                amount
            });
            addTransaction({
                type: 'withdraw',
                status: 'pending',
                value: utils.formatUnits(amount, decimals),
                txID: tx.hash,
                assetName: symbol,
                assetType: AssetType.ERC20,
                sender: yield l2.signer.getAddress(),
                blockNumber: tx.blockNumber || 0,
                l1NetworkID
            });
            try {
                const receipt = yield tx.wait();
                updateTransaction(receipt, tx);
                const l2ToL1Events = receipt.getL2ToL1Events();
                if (l2ToL1Events.length === 1) {
                    const l2ToL1EventDataResult = l2ToL1Events[0];
                    const id = l2ToL1EventDataResult.uniqueId.toString();
                    const outgoingMessageState = OutgoingMessageState.NOT_FOUND;
                    const l2ToL1EventDataResultPlus = Object.assign(Object.assign({}, l2ToL1EventDataResult), { type: AssetType.ERC20, tokenAddress: erc20l1Address, value: amount, outgoingMessageState, symbol: symbol, decimals: decimals, nodeBlockDeadline: 'NODE_NOT_CREATED' });
                    setPendingWithdrawalMap(oldPendingWithdrawalsMap => {
                        return Object.assign(Object.assign({}, oldPendingWithdrawalsMap), { [id]: l2ToL1EventDataResultPlus });
                    });
                }
                updateTokenData(erc20l1Address);
                return receipt;
            }
            catch (err) {
                console.warn('withdraw token err', err);
            }
        });
    }
    const removeTokensFromList = (listID) => {
        setBridgeTokens(prevBridgeTokens => {
            const newBridgeTokens = Object.assign({}, prevBridgeTokens);
            for (let address in bridgeTokens) {
                const token = bridgeTokens[address];
                if (!token)
                    continue;
                if (token.listID === listID) {
                    delete newBridgeTokens[address];
                }
            }
            return newBridgeTokens;
        });
    };
    const addTokensFromList = (arbTokenList, listID) => __awaiter(void 0, void 0, void 0, function* () {
        const l1ChainID = l1.network.chainID;
        const l2ChainID = l2.network.chainID;
        const bridgeTokensToAdd = {};
        const candidateUnbridgedTokensToAdd = [];
        for (const tokenData of arbTokenList.tokens) {
            const { address, name, symbol, extensions, decimals, logoURI, chainId } = tokenData;
            if (![l1ChainID, l2ChainID].includes(chainId)) {
                continue;
            }
            const bridgeInfo = (() => {
                const isExtensions = (obj) => {
                    if (!obj)
                        return false;
                    if (!obj['bridgeInfo'])
                        return false;
                    return Object.keys(obj['bridgeInfo'])
                        .map(key => obj['bridgeInfo'][key])
                        .every(e => e &&
                        'tokenAddress' in e &&
                        'originBridgeAddress' in e &&
                        'destBridgeAddress' in e);
                };
                if (!isExtensions(extensions)) {
                    return null;
                }
                else {
                    return extensions.bridgeInfo;
                }
            })();
            if (bridgeInfo) {
                const l1Address = bridgeInfo[l1NetworkID].tokenAddress;
                bridgeTokensToAdd[l1Address] = {
                    name,
                    type: TokenType.ERC20,
                    symbol,
                    address: l1Address,
                    l2Address: address,
                    decimals,
                    logoURI,
                    listID
                };
            }
            // save potentially unbridged L1 tokens:
            // stopgap: giant lists (i.e., CMC list) currently severaly hurts page performace, so for now we only add the bridged tokens
            else if (arbTokenList.tokens.length < 1000) {
                const l1Address = address;
                candidateUnbridgedTokensToAdd.push({
                    name,
                    type: TokenType.ERC20,
                    symbol,
                    address: l1Address,
                    decimals,
                    logoURI,
                    listID
                });
            }
        }
        // add L1 tokens only if they aren't already bridged (i.e., if they haven't already beed added as L2 arb-tokens to the list)
        const l1AddressesOfBridgedTokens = new Set(Object.keys(bridgeTokensToAdd).map(l1Address => l1Address.toLowerCase() /* lists should have the checksummed case anyway, but just in case (pun unintended) */));
        for (let l1TokenData of candidateUnbridgedTokensToAdd) {
            if (!l1AddressesOfBridgedTokens.has(l1TokenData.address.toLowerCase())) {
                bridgeTokensToAdd[l1TokenData.address] = l1TokenData;
            }
        }
        setBridgeTokens(oldBridgeTokens => {
            const newBridgeTokens = Object.assign(Object.assign({}, oldBridgeTokens), bridgeTokensToAdd);
            updateTokenBalances(newBridgeTokens);
            return newBridgeTokens;
        });
    });
    function addToken(erc20L1orL2Address) {
        return __awaiter(this, void 0, void 0, function* () {
            let l1Address;
            let l2Address;
            let l1TokenBalance = null;
            let l2TokenBalance = null;
            const maybeL1Address = yield getL1ERC20Address(erc20L1orL2Address);
            if (maybeL1Address) {
                // looks like l2 address was provided
                l1Address = maybeL1Address;
                l2Address = erc20L1orL2Address;
            }
            else {
                // looks like l1 address was provided
                l1Address = erc20L1orL2Address;
                l2Address = yield getL2ERC20Address(l1Address);
            }
            const bridgeTokensToAdd = {};
            const { name, symbol, balance, decimals } = yield getL1TokenData(l1Address);
            l1TokenBalance = balance;
            try {
                // check if token is deployed at l2 address; if not this will throw
                const { balance } = yield getL2TokenData(l2Address);
                l2TokenBalance = balance;
            }
            catch (error) {
                console.info(`no L2 token for ${l1Address} (which is fine)`);
                l2Address = undefined;
            }
            const isDisabled = yield l1TokenIsDisabled(l1Address);
            if (isDisabled) {
                throw new TokenDisabledError('Token currently disabled');
            }
            bridgeTokensToAdd[l1Address] = {
                name,
                type: TokenType.ERC20,
                symbol,
                address: l1Address,
                l2Address,
                decimals
            };
            setBridgeTokens(oldBridgeTokens => {
                return Object.assign(Object.assign({}, oldBridgeTokens), bridgeTokensToAdd);
            });
            setErc20Balances(oldBridgeBalances => {
                const newBal = {
                    [l1Address]: {
                        balance: l1TokenBalance,
                        arbChainBalance: l2TokenBalance
                    }
                };
                return Object.assign(Object.assign({}, oldBridgeBalances), newBal);
            });
            return l1Address;
        });
    }
    const expireCache = () => {
        clearERC20Cache();
        clearERC721Cache();
    };
    useEffect(() => {
        const tokensToAdd = [
            ...new Set([...defaultTokenList].map(t => t.toLocaleLowerCase()))
        ].filter(tokenAddress => !tokenBlackList.includes(tokenAddress));
        if (autoLoadCache) {
            Promise.all(tokensToAdd.map(address => {
                return addToken(address).catch(err => {
                    console.warn(`invalid cache entry erc20 ${address}`);
                    console.warn(err);
                });
            })).then(values => {
                setERC20Cache(values.filter((val) => !!val));
            });
        }
    }, []);
    function updateEthBalances() {
        return __awaiter(this, void 0, void 0, function* () {
            const l1Balance = yield l1.signer.getBalance();
            const l2Balance = yield l2.signer.getBalance();
            setEthBalances({
                balance: l1Balance,
                arbChainBalance: l2Balance
            });
        });
    }
    const updateTokenData = useCallback((l1Address) => __awaiter(void 0, void 0, void 0, function* () {
        const bridgeToken = bridgeTokens[l1Address];
        if (!bridgeToken) {
            return;
        }
        const { l2Address } = bridgeToken;
        const l1Data = yield getL1TokenData(l1Address);
        const l2Data = (l2Address && (yield getL2TokenData(l2Address))) || undefined;
        const erc20TokenBalance = {
            balance: l1Data.balance,
            arbChainBalance: (l2Data === null || l2Data === void 0 ? void 0 : l2Data.balance) || Zero
        };
        setErc20Balances(oldErc20Balances => (Object.assign(Object.assign({}, oldErc20Balances), { [l1Address]: erc20TokenBalance })));
        const newBridgeTokens = { [l1Address]: bridgeToken };
        setBridgeTokens(oldBridgeTokens => {
            return Object.assign(Object.assign({}, oldBridgeTokens), newBridgeTokens);
        });
    }), [setErc20Balances, bridgeTokens, setBridgeTokens]);
    const updateTokenBalances = (bridgeTokens) => __awaiter(void 0, void 0, void 0, function* () {
        const l1MultiCaller = yield MultiCaller.fromProvider(l1.signer.provider);
        const l2MultiCaller = yield MultiCaller.fromProvider(l2.signer.provider);
        const l1Addresses = Object.keys(bridgeTokens);
        const l1AddressesBalances = yield l1MultiCaller.getTokenData(l1Addresses, {
            balanceOf: { account: walletAddress }
        });
        const l1Balances = l1Addresses.map((address, index) => ({
            tokenAddr: address,
            balance: l1AddressesBalances[index].balance
        }));
        const l2Addresses = l1Addresses
            .map(l1Address => {
            return bridgeTokens[l1Address].l2Address;
        })
            .filter((val) => !!val);
        const l2AddressesBalances = yield l2MultiCaller.getTokenData(l2Addresses, {
            balanceOf: { account: walletAddress }
        });
        const l2Balances = l2Addresses.map((address, index) => ({
            tokenAddr: address,
            balance: l2AddressesBalances[index].balance
        }));
        const l2AddressToBalanceMap = l2Balances.reduce((acc, l1Address) => {
            const { tokenAddr, balance } = l1Address;
            return Object.assign(Object.assign({}, acc), { [tokenAddr]: balance });
        }, {});
        setErc20Balances(oldERC20Balances => {
            const newERC20Balances = l1Balances.reduce((acc, { tokenAddr: l1TokenAddress, balance: l1Balance }) => {
                const l2Address = bridgeTokens[l1TokenAddress]
                    .l2Address;
                return Object.assign(Object.assign({}, acc), { [l1TokenAddress]: {
                        balance: l1Balance,
                        arbChainBalance: l2Address
                            ? l2AddressToBalanceMap[l2Address]
                            : undefined
                    } });
            }, {});
            return Object.assign(Object.assign({}, oldERC20Balances), newERC20Balances);
        });
    });
    function triggerOutboxToken(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!pendingWithdrawalsMap[id]) {
                throw new Error('Outbox message not found');
            }
            const { batchNumber, indexInBatch, tokenAddress, value } = pendingWithdrawalsMap[id];
            const proofInfo = yield L2ToL1MessageReader.tryGetProof(l2.signer.provider, batchNumber, indexInBatch);
            if (!proofInfo) {
                throw new Error('No proof found');
            }
            const outboxAddress = getOutboxAddr(l2.network, batchNumber);
            const messageWriter = L2ToL1Message.fromBatchNumber(l1.signer, outboxAddress, batchNumber, indexInBatch);
            const res = yield messageWriter.execute(proofInfo);
            const { symbol, decimals } = yield getL1TokenData(tokenAddress);
            addTransaction({
                status: 'pending',
                type: 'outbox',
                value: utils.formatUnits(value, decimals),
                assetName: symbol,
                assetType: AssetType.ERC20,
                sender: walletAddress,
                txID: res.hash,
                l1NetworkID
            });
            try {
                const rec = yield res.wait();
                if (rec.status === 1) {
                    setTransactionSuccess(rec.transactionHash);
                    setPendingWithdrawalMap(oldPendingWithdrawalsMap => {
                        const newPendingWithdrawalsMap = Object.assign({}, oldPendingWithdrawalsMap);
                        delete newPendingWithdrawalsMap[id];
                        return newPendingWithdrawalsMap;
                    });
                    addToExecutedMessagesCache(batchNumber, indexInBatch);
                }
                else {
                    setTransactionFailure(rec.transactionHash);
                }
                return rec;
            }
            catch (err) {
                console.warn('WARNING: token outbox execute failed:', err);
            }
        });
    }
    function triggerOutboxEth(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!pendingWithdrawalsMap[id]) {
                throw new Error('Outbox message not found');
            }
            const { batchNumber, indexInBatch, value } = pendingWithdrawalsMap[id];
            const proofInfo = yield L2ToL1MessageReader.tryGetProof(l2.signer.provider, batchNumber, indexInBatch);
            if (!proofInfo) {
                throw new Error('No proof found');
            }
            const outboxAddress = getOutboxAddr(l2.network, batchNumber);
            const messageWriter = L2ToL1Message.fromBatchNumber(l1.signer, outboxAddress, batchNumber, indexInBatch);
            const res = yield messageWriter.execute(proofInfo);
            addTransaction({
                status: 'pending',
                type: 'outbox',
                value: utils.formatEther(value),
                assetName: 'ETH',
                assetType: AssetType.ETH,
                sender: walletAddress,
                txID: res.hash,
                l1NetworkID
            });
            try {
                const rec = yield res.wait();
                if (rec.status === 1) {
                    setTransactionSuccess(rec.transactionHash);
                    setPendingWithdrawalMap(oldPendingWithdrawalsMap => {
                        const newPendingWithdrawalsMap = Object.assign({}, oldPendingWithdrawalsMap);
                        delete newPendingWithdrawalsMap[id];
                        return newPendingWithdrawalsMap;
                    });
                    addToExecutedMessagesCache(batchNumber, indexInBatch);
                }
                else {
                    setTransactionFailure(rec.transactionHash);
                }
                return rec;
            }
            catch (err) {
                console.warn('WARNING: ETH outbox execute failed:', err);
            }
        });
    }
    const getTokenSymbol = (_l1Address) => __awaiter(void 0, void 0, void 0, function* () {
        const l1Address = _l1Address.toLocaleLowerCase();
        if (addressToSymbol[l1Address]) {
            return addressToSymbol[l1Address];
        }
        try {
            const { symbol } = yield getL1TokenData(l1Address);
            addressToSymbol[l1Address] = symbol;
            return symbol;
        }
        catch (err) {
            console.warn('could not get token symbol', err);
            return '???';
        }
    });
    const getTokenDecimals = (_l1Address) => __awaiter(void 0, void 0, void 0, function* () {
        const l1Address = _l1Address.toLocaleLowerCase();
        if (addressToDecimals[l1Address]) {
            return addressToDecimals[l1Address];
        }
        try {
            const { decimals } = yield getL1TokenData(l1Address);
            addressToDecimals[l1Address] = decimals;
            return decimals;
        }
        catch (err) {
            console.warn('could not get token decimals', err);
            return 18;
        }
    });
    const getEthWithdrawalsV2 = (filter) => __awaiter(void 0, void 0, void 0, function* () {
        const startBlock = (filter && filter.fromBlock && +filter.fromBlock.toString()) || 0;
        const latestGraphBlockNumber = yield getBuiltInsGraphLatestBlockNumber(l1NetworkID);
        const pivotBlock = Math.max(latestGraphBlockNumber, startBlock);
        console.log(`*** L2 gateway graph block number: ${latestGraphBlockNumber} ***`);
        const oldEthWithdrawals = yield getETHWithdrawals(walletAddress, startBlock, pivotBlock, l1NetworkID);
        const recentEthWithdrawals = yield L2ToL1MessageReader.getL2ToL1MessageLogs(l2.signer.provider, {
            fromBlock: pivotBlock,
            toBlock: 'latest'
        }, undefined, walletAddress);
        const ethWithdrawals = [...oldEthWithdrawals, ...recentEthWithdrawals];
        const lastOutboxEntryIndexDec = yield getLatestOutboxEntryIndex(l1NetworkID);
        console.log(`*** Last Outbox Entry Batch Number: ${lastOutboxEntryIndexDec} ***`);
        function toEventResultPlus(event) {
            return __awaiter(this, void 0, void 0, function* () {
                const { batchNumber, indexInBatch, callvalue } = event;
                const outgoingMessageState = batchNumber.toNumber() > lastOutboxEntryIndexDec
                    ? OutgoingMessageState.UNCONFIRMED
                    : yield getOutgoingMessageStateV2(batchNumber, indexInBatch);
                return Object.assign(Object.assign({}, event), { type: AssetType.ETH, value: callvalue, symbol: 'ETH', outgoingMessageState, decimals: 18 });
            });
        }
        return yield Promise.all(ethWithdrawals.map(toEventResultPlus));
    });
    const getTokenWithdrawalsV2 = (gatewayAddresses, filter) => __awaiter(void 0, void 0, void 0, function* () {
        const latestGraphBlockNumber = yield getL2GatewayGraphLatestBlockNumber(l1NetworkID);
        console.log(`*** L2 gateway graph block number: ${latestGraphBlockNumber} ***`);
        const startBlock = (filter && filter.fromBlock && +filter.fromBlock.toString()) || 0;
        const pivotBlock = Math.max(latestGraphBlockNumber, startBlock);
        const results = yield getTokenWithdrawalsGraph(walletAddress, startBlock, pivotBlock, l1NetworkID);
        const symbols = yield Promise.all(results.map(resultData => getTokenSymbol(resultData.otherData.tokenAddress)));
        const decimals = yield Promise.all(results.map(resultData => getTokenDecimals(resultData.otherData.tokenAddress)));
        const outgoingMessageStates = yield Promise.all(results.map(withdrawEventData => {
            const { batchNumber, indexInBatch } = withdrawEventData.l2ToL1Event;
            return getOutgoingMessageState(batchNumber, indexInBatch);
        }));
        const oldTokenWithdrawals = results.map((resultsData, i) => (Object.assign(Object.assign(Object.assign({}, resultsData.l2ToL1Event), resultsData.otherData), { outgoingMessageState: outgoingMessageStates[i], symbol: symbols[i], decimals: decimals[i] })));
        const recentTokenWithdrawals = yield getTokenWithdrawals(gatewayAddresses, {
            fromBlock: pivotBlock
        });
        return [...oldTokenWithdrawals, ...recentTokenWithdrawals];
    });
    const getTokenWithdrawals = (gatewayAddresses, filter) => __awaiter(void 0, void 0, void 0, function* () {
        const t = new Date().getTime();
        const latestGraphBlockNumber = yield getL2GatewayGraphLatestBlockNumber(l1NetworkID);
        const startBlock = (filter && filter.fromBlock && +filter.fromBlock.toString()) || 0;
        const pivotBlock = Math.max(latestGraphBlockNumber, startBlock);
        const gatewayWithdrawalsResultsNested = yield Promise.all(gatewayAddresses.map(gatewayAddress => erc20Bridger.getL2WithdrawalEvents(l2.signer.provider, gatewayAddress, { fromBlock: pivotBlock, toBlock: 'latest' }, undefined, walletAddress)));
        console.log(`*** got token gateway event data in ${(new Date().getTime() - t) / 1000} seconds *** `);
        const gatewayWithdrawalsResults = gatewayWithdrawalsResultsNested.flat();
        const symbols = yield Promise.all(gatewayWithdrawalsResults.map(withdrawEventData => getTokenSymbol(withdrawEventData.l1Token)));
        const decimals = yield Promise.all(gatewayWithdrawalsResults.map(withdrawEventData => getTokenDecimals(withdrawEventData.l1Token)));
        const l2Txns = yield Promise.all(gatewayWithdrawalsResults.map(withdrawEventData => l2.signer.provider.getTransactionReceipt(withdrawEventData.txHash)));
        const outgoingMessageStates = yield Promise.all(l2Txns.map(txReceipt => {
            const l2TxReceipt = new L2TransactionReceipt(txReceipt);
            // TODO: length != 1
            const [{ batchNumber, indexInBatch }] = l2TxReceipt.getL2ToL1Events();
            return getOutgoingMessageState(batchNumber, indexInBatch);
        }));
        return gatewayWithdrawalsResults.map((withdrawEventData, i) => {
            const l2TxReceipt = new L2TransactionReceipt(l2Txns[i]);
            // TODO: length != 1
            const [{ caller, destination, uniqueId, batchNumber, indexInBatch, arbBlockNum, ethBlockNum, timestamp, callvalue, data }] = l2TxReceipt.getL2ToL1Events();
            const eventDataPlus = {
                caller,
                destination,
                uniqueId,
                batchNumber,
                indexInBatch,
                arbBlockNum,
                ethBlockNum,
                timestamp,
                callvalue,
                data,
                type: AssetType.ERC20,
                value: withdrawEventData._amount,
                tokenAddress: withdrawEventData.l1Token,
                outgoingMessageState: outgoingMessageStates[i],
                symbol: symbols[i],
                decimals: decimals[i]
            };
            return eventDataPlus;
        });
    });
    function attachNodeBlockDeadlineToEvent(withdrawal) {
        return __awaiter(this, void 0, void 0, function* () {
            if (withdrawal.outgoingMessageState === OutgoingMessageState.EXECUTED ||
                withdrawal.outgoingMessageState === OutgoingMessageState.CONFIRMED) {
                return withdrawal;
            }
            const { batchNumber, indexInBatch } = withdrawal;
            const outboxAddress = getOutboxAddr(l2.network, batchNumber);
            const messageReader = L2ToL1MessageReader.fromBatchNumber(l1.signer, outboxAddress, batchNumber, indexInBatch);
            try {
                const firstExecutableBlock = yield messageReader.getFirstExecutableBlock(l2.signer.provider);
                return Object.assign(Object.assign({}, withdrawal), { nodeBlockDeadline: firstExecutableBlock.toNumber() });
            }
            catch (e) {
                const expectedError = "batch doesn't exist";
                const err = e;
                const actualError = err && (err.message || (err.error && err.error.message));
                if (actualError.includes(expectedError)) {
                    const nodeBlockDeadline = 'NODE_NOT_CREATED';
                    return Object.assign(Object.assign({}, withdrawal), { nodeBlockDeadline });
                }
                else {
                    throw e;
                }
            }
        });
    }
    const setInitialPendingWithdrawals = (gatewayAddresses, filter) => __awaiter(void 0, void 0, void 0, function* () {
        const t = new Date().getTime();
        const pendingWithdrawals = {};
        console.log('*** Getting initial pending withdrawal data ***');
        const l2ToL1Txns = (yield Promise.all([
            getEthWithdrawalsV2(filter),
            getTokenWithdrawalsV2(gatewayAddresses, filter)
        ]))
            .flat()
            .sort((msgA, msgB) => +msgA.timestamp - +msgB.timestamp);
        console.log(`*** done getting pending withdrawals, took ${Math.round(new Date().getTime() - t) / 1000} seconds`);
        const l2ToL1TxnsWithDeadlines = yield Promise.all(l2ToL1Txns.map(attachNodeBlockDeadlineToEvent));
        for (const event of l2ToL1TxnsWithDeadlines) {
            pendingWithdrawals[event.uniqueId.toString()] = event;
        }
        setPendingWithdrawalMap(pendingWithdrawals);
    });
    // call after we've confirmed the outbox entry has been created
    function getOutgoingMessageStateV2(batchNumber, indexInBatch) {
        return __awaiter(this, void 0, void 0, function* () {
            if (executedMessagesCache[hashOutgoingMessage(batchNumber, indexInBatch, l1NetworkID)]) {
                return OutgoingMessageState.EXECUTED;
            }
            const proofData = yield L2ToL1MessageReader.tryGetProof(l2.signer.provider, batchNumber, indexInBatch);
            // this should never occur
            if (!proofData) {
                return OutgoingMessageState.UNCONFIRMED;
            }
            const { path } = proofData;
            const res = yield messageHasExecuted(path, batchNumber, l1NetworkID);
            if (res) {
                addToExecutedMessagesCache(batchNumber, indexInBatch);
                return OutgoingMessageState.EXECUTED;
            }
            else {
                return OutgoingMessageState.CONFIRMED;
            }
        });
    }
    function getOutgoingMessageState(batchNumber, indexInBatch) {
        return __awaiter(this, void 0, void 0, function* () {
            if (executedMessagesCache[hashOutgoingMessage(batchNumber, indexInBatch, l1NetworkID)]) {
                return OutgoingMessageState.EXECUTED;
            }
            const outboxAddress = getOutboxAddr(l2.network, batchNumber);
            const messageReader = new L2ToL1MessageReader(l1.signer.provider, outboxAddress, batchNumber, indexInBatch);
            const proofInfo = yield messageReader.tryGetProof(l2.signer.provider);
            return yield messageReader.status(proofInfo);
        });
    }
    function addToExecutedMessagesCache(batchNumber, indexInBatch) {
        const _executedMessagesCache = Object.assign({}, executedMessagesCache);
        _executedMessagesCache[hashOutgoingMessage(batchNumber, indexInBatch, l1NetworkID)] = true;
        setExecutedMessagesCache(_executedMessagesCache);
    }
    const hashOutgoingMessage = (batchNumber, indexInBatch, _l1NetworkID) => {
        return `${batchNumber.toString()},${indexInBatch.toString()},${_l1NetworkID}`;
    };
    return {
        walletAddress,
        bridgeTokens: bridgeTokens,
        balances: {
            eth: ethBalances,
            erc20: erc20Balances,
            erc721: erc721Balances
        },
        cache: {
            erc20: ERC20Cache,
            erc721: ERC721Cache,
            expire: expireCache
        },
        eth: {
            deposit: depositEth,
            withdraw: withdrawEth,
            triggerOutbox: triggerOutboxEth,
            updateBalances: updateEthBalances
        },
        token: {
            add: addToken,
            addTokensFromList,
            removeTokensFromList,
            updateTokenData,
            approve: approveToken,
            approveL2: approveTokenL2,
            deposit: depositToken,
            withdraw: withdrawToken,
            triggerOutbox: triggerOutboxToken,
            getL1TokenData,
            getL2TokenData,
            getL1ERC20Address,
            getL2ERC20Address,
            getL2GatewayAddress
        },
        transactions: {
            transactions,
            clearPendingTransactions,
            setTransactionConfirmed,
            updateTransaction,
            addTransaction,
            addTransactions,
            fetchAndUpdateL1ToL2MsgStatus
        },
        pendingWithdrawalsMap: pendingWithdrawalsMap,
        setInitialPendingWithdrawals: setInitialPendingWithdrawals
    };
};
