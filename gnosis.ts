import { ethers } from 'ethers'
import { BigNumber, UnsignedTransaction } from 'ethers/utils'

import GnosisSafeJSON from './artifacts/gnosis/GnosisSafe.json'
import { GnosisSafe } from './typechain/GnosisSafe'

import { zeroAddress, zero } from './utils'

export function getSafe(address: string,
    provider: ethers.providers.Provider): GnosisSafe {
  let wallet = ethers.Wallet.createRandom().connect(provider)
  let abi = JSON.stringify(GnosisSafeJSON)

  return (ethers.ContractFactory.fromSolidity(abi)
    .connect(wallet).attach(address)) as GnosisSafe
}

export function getDetails(safe: GnosisSafe) {
  return Promise.all([
    safe.nonce(),
    safe.getOwners(),
    safe.getThreshold(),
  ]).then((values) => ({
    nonce: values[0],
    owners: values[1],
    threshold: values[2]
  }))
}

export function getExternalExecTransactionTx(safe: GnosisSafe,
    toAddress: string, value: BigNumber, data: any, safeTxGas: BigNumber,
    gasPrice: BigNumber, signatures: string[]): UnsignedTransaction {
  // loosely validate signatures
  signatures.forEach((s) => {
    if (!s.match(/^(0x)?[0-9a-zA-Z]{130}$/)) {
      throw ("All signatures should be 130-character hex strings with " +
             `an optional "0x" prefix. Got ${s}`)
    }
  })

  const iface = safe.interface
  const sigData = `0x${signatures.map((s) => s.replace(/^0x/, '')).join('')}`
  const newData = iface.functions.execTransaction.encode(
    [toAddress, value, data, 0, safeTxGas, safeTxGas, gasPrice, zeroAddress,
     zeroAddress, sigData])
  return {
    data: newData,
    to: safe.address,
    value: zero,
    gasLimit: zero,
    gasPrice: zero,
    nonce: 0,
    chainId: 1
  }
}
