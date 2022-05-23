import { Signer } from '@ethersproject/abstract-signer';
import { L1Network, L2Network } from '@arbitrum/sdk';
import { ArbTokenBridge } from './arbTokenBridge.types';
export declare const wait: (ms?: number) => Promise<unknown>;
declare type L1Params = {
    signer: Signer;
} & {
    network: L1Network;
};
declare type L2Params = {
    signer: Signer;
} & {
    network: L2Network;
};
export interface TokenBridgeParams {
    walletAddress: string;
    l1: L1Params;
    l2: L2Params;
}
export declare const useArbTokenBridge: (params: TokenBridgeParams, autoLoadCache?: boolean) => ArbTokenBridge;
export {};
