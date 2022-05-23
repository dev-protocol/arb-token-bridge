import { AssetType, TransactionActions } from './arbTokenBridge.types';
import { L1ToL2MessageStatus } from '@arbitrum/sdk';
export declare type TxnStatus = 'pending' | 'success' | 'failure' | 'confirmed';
/** @interface
 * Transaction
 * @alias Transaction
 * @description Bridge transaction data with up to date status.
 */
export declare type TxnType = 'deposit' | 'deposit-l1' | 'deposit-l2' | 'withdraw' | 'outbox' | 'approve' | 'deposit-l2-auto-redeem' | 'deposit-l2-ticket-created' | 'approve-l2';
export declare const txnTypeToLayer: (txnType: TxnType) => 1 | 2;
export interface L1ToL2MessageData {
    status: L1ToL2MessageStatus;
    retryableCreationTxID: string;
    l2TxID?: string;
    fetchingUpdate: boolean;
}
declare type TransactionBase = {
    type: TxnType;
    status: TxnStatus;
    value: string | null;
    txID?: string;
    assetName: string;
    assetType: AssetType;
    sender: string;
    blockNumber?: number;
    l1NetworkID: string;
    timestampResolved?: string;
    timestampCreated?: string;
    seqNum?: number;
    l1ToL2MsgData?: L1ToL2MessageData;
};
export interface Transaction extends TransactionBase {
    txID: string;
}
export interface NewTransaction extends TransactionBase {
    status: 'pending';
}
export interface FailedTransaction extends TransactionBase {
    status: 'failure';
}
export interface DepositTransaction extends Transaction {
    l1ToL2MsgData: L1ToL2MessageData;
    type: 'deposit' | 'deposit-l1';
}
declare const useTransactions: () => [Transaction[], TransactionActions];
export default useTransactions;
