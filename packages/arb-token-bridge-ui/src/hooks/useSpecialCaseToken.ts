import { useMemo } from 'react'

interface Token {
  l1Address: string
  l2Address: string
}

function lowercase(token: Token): Token {
  return {
    l1Address: token.l1Address.toLowerCase(),
    l2Address: token.l2Address.toLowerCase()
  }
}

export const DEPOSIT_DISABLED: Token[] = [
  {
    l1Address: '0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3',
    l2Address: '0xB20A02dfFb172C474BC4bDa3fD6f4eE70C04daf2'
  },
  {
    l1Address: '0xB4A3B0Faf0Ab53df58001804DdA5Bfc6a3D59008',
    l2Address: '0xe5a5Efe7ec8cdFA5F031D5159839A3b5E11B2e0F'
  },
  {
    l1Address: '0x0e192d382a36de7011f795acc4391cd302003606',
    l2Address: '0x488cc08935458403a0458e45E20c0159c8AB2c92'
  },
  {
    l1Address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    l2Address: ''
  },
  {
    l1Address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    l2Address: ''
  },
  {
    l1Address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    l2Address: ''
  },
  {
    l1Address: '0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D',
    l2Address: '0x3E06AF0fBB92D1f6e5c6008fcec81130D0cC65a3'
  },
  {
    l1Address: '0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6',
    l2Address: '0xe018c7a3d175fb0fe15d70da2c874d3ca16313ec'
  },
  {
    l1Address: '0x10010078a54396F62c96dF8532dc2B4847d47ED3',
    l2Address: '0x626195b5a8b5f865E3516201D6ac30ee1B46A6e9'
  }
].map(lowercase)

export const L2_APPROVAL_REQUIRED = [
  {
    l1Address: '0x58b6A8A3302369DAEc383334672404Ee733aB239',
    l2Address: '0x289ba1701C2F088cf0faf8B3705246331cB8A839'
  }
].map(lowercase)

export function useSpecialCaseToken(erc20L1Address?: string) {
  const isDepositDisabled = useMemo(() => {
    if (!erc20L1Address) {
      return false
    }

    const l1Addresses = DEPOSIT_DISABLED.map(token => token.l1Address)
    return l1Addresses.includes(erc20L1Address.toLowerCase())
  }, [erc20L1Address])

  const isL2ApprovalRequired = useMemo(() => {
    if (!erc20L1Address) {
      return false
    }

    const l1Addresses = L2_APPROVAL_REQUIRED.map(token => token.l1Address)
    return l1Addresses.includes(erc20L1Address.toLowerCase())
  }, [erc20L1Address])

  return { isDepositDisabled, isL2ApprovalRequired }
}
