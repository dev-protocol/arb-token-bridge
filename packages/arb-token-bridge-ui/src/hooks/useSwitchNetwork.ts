import { L1Network, L2Network } from '@arbitrum/sdk'
import { useWallet } from '@arbitrum/use-wallet'
import { BigNumber, utils } from 'ethers'
import { useLatest } from 'react-use'

function toHexChainId(chainId: number) {
  return utils.hexValue(BigNumber.from(chainId))
}

function toRequestParams(network: L1Network | L2Network) {
  return {
    chainId: toHexChainId(network.chainID),
    chainName: network.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [network.rpcURL],
    blockExplorerUrls: [network.explorerUrl]
  }
}

export function useSwitchNetwork() {
  const { provider: library, network } = useWallet()
  const latestNetwork = useLatest(network)

  const metamask = library?.provider
  const isSupported = (metamask && metamask.isMetaMask) || false

  async function switchNetwork(network: L1Network | L2Network) {
    function handleSwitchNetworkNotSupported() {
      // No `wallet_switchEthereumChain` support
      console.log(
        `Not sure if current provider supports "wallet_switchEthereumChain".`
      )
      alert(
        `Make sure your wallet is connected to ${network.name} when you are signing your transaction.`
      )
    }

    if (!isSupported) {
      return handleSwitchNetworkNotSupported()
    }

    const chainId = network.chainID
    console.log('Attempting to switch to chain', chainId)

    try {
      console.log('calling metamask.request')

      // @ts-ignore
      await metamask.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: toHexChainId(chainId) }]
      })

      while (latestNetwork.current?.chainId !== network.chainID) {
        await new Promise(r => setTimeout(r, 100))
      }

      await new Promise(r => setTimeout(r, 3000))
    } catch (err: any) {
      if (err.code === 4902) {
        console.log(`Network ${chainId} not yet added to MetaMask; adding now.`)

        // @ts-ignore
        await metamask.request({
          method: 'wallet_addEthereumChain',
          params: [toRequestParams(network)]
        })
      } else {
        throw new Error(err)
      }
    }
  }

  return switchNetwork
}
