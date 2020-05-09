import { ethers } from 'ethers'
import { BigNumber } from 'ethers/utils'

import ManagedGrantJSON from './artifacts/keep-network/ManagedGrant.json'
import { ManagedGrant } from './typechain/ManagedGrant'

import { removeHexPrefix } from './utils'

export function getManagedGrant(address : string, provider : ethers.providers.Provider) {
  let wallet = ethers.Wallet.createRandom().connect(provider)
  let abi = JSON.stringify(ManagedGrantJSON)

  return (ethers.ContractFactory.fromSolidity(abi)
    .connect(wallet).attach(address) as ManagedGrant)
}

export function getStakingTx(grant : ManagedGrant, stakingContract : string,
    amount : ethers.utils.BigNumber, operator : string, beneficiary : string,
    authorizer : string) {
  const iface = grant.interface

  const delegationData =
    '0x' +
    Buffer.concat([
      Buffer.from(removeHexPrefix(beneficiary), 'hex'),
      Buffer.from(removeHexPrefix(operator), 'hex'),
      Buffer.from(removeHexPrefix(authorizer), 'hex'),
    ]).toString('hex')

  const data = iface.functions.stake.encode(
    [stakingContract, amount, delegationData])

  const zero = ethers.utils.bigNumberify(0)
  return {
    data: data,
    to: grant.address,
    value: zero,
    gasLimit: zero,
    gasPrice: zero,
    nonce: 0
  }
}

export function keepToWei(numberTokens: number | string): BigNumber {
  return ethers.utils.parseEther(numberTokens.toString())
}
