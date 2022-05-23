import { BigNumber } from '@ethersproject/bignumber';
import { AssetType, L2ToL1EventResult } from '../hooks/arbTokenBridge.types';
export interface NodeDataResult {
    afterSendCount: string;
    timestampCreated: string;
    blockCreatedAt: string;
    id: string;
}
interface GetTokenWithdrawalsResult {
    l2ToL1Event: L2ToL1EventResult;
    otherData: {
        value: BigNumber;
        tokenAddress: string;
        type: AssetType;
    };
}
export declare const getNodes: (networkID: string, minAfterSendCount?: number, offset?: number) => Promise<NodeDataResult[]>;
export declare const getLatestOutboxEntryIndex: (networkID: string) => Promise<number>;
export declare const getETHWithdrawals: (callerAddress: string, fromBlock: number, toBlock: number, networkID: string) => Promise<L2ToL1EventResult[]>;
export declare const messageHasExecuted: (path: BigNumber, batchNumber: BigNumber, networkID: string) => Promise<boolean>;
export declare const getTokenWithdrawals: (sender: string, fromBlock: number, toBlock: number, l1NetworkID: string) => Promise<GetTokenWithdrawalsResult[]>;
export declare const getBuiltInsGraphLatestBlockNumber: (l1NetworkID: string) => Promise<any>;
export declare const getL2GatewayGraphLatestBlockNumber: (l1NetworkID: string) => Promise<any>;
export {};
