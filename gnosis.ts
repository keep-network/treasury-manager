import { ethers } from 'ethers'
import { BigNumber, UnsignedTransaction } from 'ethers/utils'
import { AddressZero, Zero } from 'ethers/constants'

import GnosisSafeJSON from './artifacts/gnosis/GnosisSafe.json'
import { GnosisSafe as _GnosisSafe } from './typechain/GnosisSafe'

export interface SafeDetails {
  owners: string[],
  threshold: BigNumber,
  nonce: BigNumber,
}

export class Safe extends _GnosisSafe {
  static fromSolidity(address: string, provider: ethers.providers.Provider)
    : Safe {
    let wallet = ethers.Wallet.createRandom().connect(provider)
    let abi = JSON.stringify(GnosisSafeJSON)

    return (ethers.ContractFactory.fromSolidity(abi)
      .connect(wallet).attach(address)) as Safe
  }

  getDetails() : Promise<SafeDetails> {
    return Promise.all([
      this.nonce(),
      this.getOwners(),
      this.getThreshold(),
    ]).then((values) => ({
      nonce: values[0],
      owners: values[1],
      threshold: values[2]
    }))
  }

  getExternalExecTransactionTx(toAddress: string, value: BigNumber, data: any,
    safeTxGas: BigNumber, gasPrice: BigNumber, signatures: string[])
    : UnsignedTransaction {
      // loosely validate signatures
      signatures.forEach((s) => {
        if (!s.match(/^(0x)?[0-9a-zA-Z]{130}$/)) {
          throw ("All signatures should be 130-character hex strings with " +
            `an optional "0x" prefix. Got ${s}`)
        }
      })

      const iface = this.interface
      const sigData = `0x${signatures.map((s) => s.replace(/^0x/, '')).join('')}`
      const newData = iface.functions.execTransaction.encode(
        [toAddress, value, data, 0, safeTxGas, safeTxGas, gasPrice, AddressZero,
          AddressZero, sigData])
      return {
        data: newData,
        to: this.address,
        value: Zero,
        gasLimit: Zero,
        gasPrice: Zero,
        nonce: 0,
        chainId: 1
      }
    }
}
