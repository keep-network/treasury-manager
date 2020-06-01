import { ethers } from 'ethers'
import { AddressZero, Zero } from 'ethers/constants'
import { BigNumber } from 'ethers/utils'

import ManagedGrantJSON from './artifacts/keep-network/ManagedGrant.json'
import { ManagedGrant as _ManagedGrant } from './typechain/ManagedGrant'
import KeepTokenJSON from './artifacts/keep-network/KeepToken.json'
import { KeepToken } from './typechain/KeepToken'

import { removeHexPrefix } from './utils'

export const KEEP_MAINNET_TOKEN_ADDRESS = '0x85eee30c52b0b379b046fb0f85f4f3dc3009afec'

const txTemplate = {
  to: AddressZero,
  value: Zero,
  gasLimit: Zero,
  gasPrice: Zero,
  nonce: 0,
}

export class ManagedGrant extends _ManagedGrant {
  static fromSolidity(address : string, provider : ethers.providers.Provider) : ManagedGrant {
    let wallet = ethers.Wallet.createRandom().connect(provider)
    let abi = JSON.stringify(ManagedGrantJSON)

    return (ethers.ContractFactory.fromSolidity(abi)
      .connect(wallet).attach(address) as ManagedGrant)
  }

  getCancelStakingTx(operator : string) {
    const data = this.interface.functions.cancelStake.encode([operator])
    return {
      ...txTemplate,
      data: data,
      to: this.address,
    }
  }

  getWithdrawalTx() {
    const iface = this.interface
    const data = iface.functions.withdraw.encode([])
    return {
      ...txTemplate,
      data: data,
      to: this.address,
    }
  }

  getStakingTx(stakingContract : string, amount : ethers.utils.BigNumber,
    operator : string, beneficiary : string, authorizer : string) {
    const iface = this.interface

    const delegationData =
      '0x' +
      Buffer.concat([
        Buffer.from(removeHexPrefix(beneficiary), 'hex'),
        Buffer.from(removeHexPrefix(operator), 'hex'),
        Buffer.from(removeHexPrefix(authorizer), 'hex'),
      ]).toString('hex')

    const data = iface.functions.stake.encode(
      [stakingContract, amount, delegationData])

    return {
      ...txTemplate,
      data: data,
      to: this.address,
    }
  }

  getDetails() {
    return Promise.all([
      this.grantId(),
      this.grantManager(),
      this.grantee(),
    ]).then((values) => ({
      id: values[0],
      manager: values[1],
      grantee: values[2],
    }))
  }
}

export function getCancelStakingTx(grant : ManagedGrant, operator : string) {
  const data = grant.interface.functions.cancelStake.encode([operator])

  return {
    data: data,
    to: grant.address,
    value: Zero,
    gasLimit: Zero,
    gasPrice: Zero,
    nonce: 0
  }
}

export function getKeepToken(provider : ethers.providers.Provider) : KeepToken {
  let wallet = ethers.Wallet.createRandom().connect(provider)
  let abi = JSON.stringify(KeepTokenJSON)

  return (ethers.ContractFactory.fromSolidity(abi)
    .connect(wallet).attach(KEEP_MAINNET_TOKEN_ADDRESS) as KeepToken)
}

export function getTransferTokenTx(token : KeepToken,
  recipient : string, amount : ethers.utils.BigNumber) {

  const data = token.interface.functions.transfer.encode([recipient, amount])

  return {
    data: data,
    to: token.address,
    value: Zero,
    gasLimit: Zero,
    gasPrice: Zero,
    nonce: 0
  }
}

export function keepToWei(numberTokens: number | string): BigNumber {
  return ethers.utils.parseEther(numberTokens.toString())
}
