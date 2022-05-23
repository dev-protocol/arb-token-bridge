var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';
import { BigNumber } from '@ethersproject/bignumber';
import { AssetType } from '../hooks/arbTokenBridge.types';
import axios from 'axios';
import { utils } from 'ethers';
const apolloL1Mainnetlient = new ApolloClient({
    uri: 'https://api.thegraph.com/subgraphs/name/fredlacs/arb-bridge-eth',
    cache: new InMemoryCache()
});
const apolloL2Mainnetlient = new ApolloClient({
    uri: 'https://api.thegraph.com/subgraphs/name/fredlacs/arb-builtins',
    cache: new InMemoryCache()
});
const apolloL1RinkebyClient = new ApolloClient({
    uri: 'https://api.thegraph.com/subgraphs/name/fredlacs/arb-bridge-eth-rinkeby',
    cache: new InMemoryCache()
});
const apolloL2RinkebyClient = new ApolloClient({
    uri: 'https://api.thegraph.com/subgraphs/name/fredlacs/arb-builtins-rinkeby',
    cache: new InMemoryCache()
});
const apolloL2GatewaysRinkebyClient = new ApolloClient({
    uri: 'https://api.thegraph.com/subgraphs/name/fredlacs/layer2-token-gateway-rinkeby',
    cache: new InMemoryCache()
});
const apolloL2GatewaysClient = new ApolloClient({
    uri: 'https://api.thegraph.com/subgraphs/name/fredlacs/layer2-token-gateway',
    cache: new InMemoryCache()
});
const networkIDAndLayerToClient = (networkID, layer) => {
    switch (networkID) {
        case '1':
            return layer === 1 ? apolloL1Mainnetlient : apolloL2Mainnetlient;
        case '4':
            return layer === 1 ? apolloL1RinkebyClient : apolloL2RinkebyClient;
        default:
            throw new Error('Unsupported network');
    }
};
export const getNodes = (networkID, minAfterSendCount = 0, offset = 0) => __awaiter(void 0, void 0, void 0, function* () {
    const client = networkIDAndLayerToClient(networkID, 1);
    const res = yield client.query({
        query: gql `
    {
      nodes(
        orderBy: afterSendCount
        orderDirection: asc
        where:{ afterSendCount_gte: ${minAfterSendCount}}
        first: 1000,
        skip: ${offset}

      ){
        afterSendCount,
        timestampCreated,
        blockCreatedAt,
        id
      }
    }
    `
    });
    const nodes = res.data.nodes;
    if (nodes.length === 0) {
        return nodes;
    }
    else {
        return nodes.concat(yield getNodes(networkID, minAfterSendCount, offset + nodes.length));
    }
});
export const getLatestOutboxEntryIndex = (networkID) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const client = networkIDAndLayerToClient(networkID, 1);
    const res = yield client.query({
        query: gql `
      {
        outboxEntries(
          orderBy: outboxEntryIndex
          orderDirection: desc
          first: 1
        ) {
          outboxEntryIndex
        }
      }
    `
    });
    return (_b = (_a = res.data.outboxEntries) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.outboxEntryIndex;
});
export const getETHWithdrawals = (callerAddress, fromBlock, toBlock, networkID) => __awaiter(void 0, void 0, void 0, function* () {
    const client = networkIDAndLayerToClient(networkID, 2);
    const res = yield client.query({
        query: gql `{
      l2ToL1Transactions(
        where: {caller:"${callerAddress}", data: "0x", arbBlockNum_gte: ${fromBlock}, arbBlockNum_lt:${toBlock}}
        orderBy: timestamp
        orderDirection: desc
        ) {
        destination,
        timestamp,
        data,
        caller,
        id,
        uniqueId,
        batchNumber,
        indexInBatch,
        arbBlockNum,
        ethBlockNum,
        callvalue,
      }
    }`
    });
    return res.data.l2ToL1Transactions.map((eventData) => {
        const { destination, timestamp, data, caller, uniqueId, batchNumber, indexInBatch, arbBlockNum, ethBlockNum, callvalue } = eventData;
        return {
            destination,
            timestamp,
            data,
            caller,
            uniqueId: BigNumber.from(uniqueId),
            batchNumber: BigNumber.from(batchNumber),
            indexInBatch: BigNumber.from(indexInBatch),
            arbBlockNum: BigNumber.from(arbBlockNum),
            ethBlockNum: BigNumber.from(ethBlockNum),
            callvalue: BigNumber.from(callvalue)
        };
    });
});
export const messageHasExecuted = (path, batchNumber, networkID) => __awaiter(void 0, void 0, void 0, function* () {
    const client = networkIDAndLayerToClient(networkID, 1);
    const batchHexString = utils.hexStripZeros(batchNumber.toHexString());
    const res = yield client.query({
        query: gql `{
      outboxOutputs(where: {path:${path.toNumber()}, outboxEntry:"${batchHexString}", spent:true }) {
        id,
      }
    }`
    });
    return res.data.outboxOutputs.length > 0;
});
export const getTokenWithdrawals = (sender, fromBlock, toBlock, l1NetworkID) => __awaiter(void 0, void 0, void 0, function* () {
    const client = ((l1NetworkID) => {
        switch (l1NetworkID) {
            case '1':
                return apolloL2GatewaysClient;
            case '4':
                return apolloL2GatewaysRinkebyClient;
            default:
                throw new Error('Unsupported network');
        }
    })(l1NetworkID);
    const res = yield client.query({
        query: gql `{
      withdrawals(
        where: { from:"${sender}", l2BlockNum_gte: ${fromBlock}, l2BlockNum_lt: ${toBlock}}
        orderBy: l2BlockNum
        orderDirection: desc
      ) {
        l2ToL1Event {
          id,
          caller,
          destination,
          batchNumber,
          indexInBatch,
          arbBlockNum,
          ethBlockNum,
          timestamp,
          callvalue,
          data
        },
        amount
      }
    }
    `
    });
    return res.data.withdrawals.map((eventData) => {
        const { amount: value, l2ToL1Event: { id, caller, destination, batchNumber, indexInBatch, arbBlockNum, ethBlockNum, timestamp, callvalue, data } } = eventData;
        const l2ToL1Event = {
            destination,
            timestamp,
            data,
            caller,
            uniqueId: BigNumber.from(id),
            batchNumber: BigNumber.from(batchNumber),
            indexInBatch: BigNumber.from(indexInBatch),
            arbBlockNum: BigNumber.from(arbBlockNum),
            ethBlockNum: BigNumber.from(ethBlockNum),
            callvalue: BigNumber.from(callvalue)
        };
        const tokenAddress = utils.hexDataSlice(data, 16, 36);
        return {
            l2ToL1Event,
            otherData: {
                value: BigNumber.from(value),
                tokenAddress,
                type: AssetType.ERC20
            }
        };
    });
});
const getLatestIndexedBlockNumber = (subgraphName) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield axios.post('https://api.thegraph.com/index-node/graphql', {
            query: `{ indexingStatusForCurrentVersion(subgraphName: "${subgraphName}") {  chains { network latestBlock { number }  } } }`
        });
        return res.data.data.indexingStatusForCurrentVersion.chains[0].latestBlock
            .number;
    }
    catch (err) {
        console.warn('Error getting graph status:', err);
        return 0;
    }
});
export const getBuiltInsGraphLatestBlockNumber = (l1NetworkID) => {
    const subgraphName = ((l1NetworkID) => {
        switch (l1NetworkID) {
            case '1':
                return 'fredlacs/arb-builtins';
            case '4':
                return 'fredlacs/arb-builtins-rinkeby';
            default:
                throw new Error('Unsupported netwowk');
        }
    })(l1NetworkID);
    return getLatestIndexedBlockNumber(subgraphName);
};
export const getL2GatewayGraphLatestBlockNumber = (l1NetworkID) => {
    const subgraphName = ((l1NetworkID) => {
        switch (l1NetworkID) {
            case '1':
                return 'fredlacs/layer2-token-gateway';
            case '4':
                return 'fredlacs/layer2-token-gateway-rinkeby';
            default:
                throw new Error('Unsupported netwowk');
        }
    })(l1NetworkID);
    return getLatestIndexedBlockNumber(subgraphName);
};
