import Eth from "@ledgerhq/hw-app-eth"
import Transport from "@ledgerhq/hw-transport-node-hid-singleton"

import { ethers } from 'ethers'
import { Signature, UnsignedTransaction, Transaction } from 'ethers/utils'

import { removeHexPrefix } from './utils'

export const derivationPath = `44'/60'/0'/0/0`

export async function initializeEthApp() {
  const transport = await Transport.open("")
  const ethApp = new Eth(transport)
  const addressDetails = await ethApp.getAddress(derivationPath)
  const ledgerConfig = await ethApp.getAppConfiguration()

  console.log(`ETH Ledger Address: `, addressDetails.address)
  console.log(`ETH Ledger Config: `, ledgerConfig)

  return ethApp
}

export async function signTransaction(ethApp: any, tx: UnsignedTransaction,
    _derivationPath = derivationPath) {
  const serializedTx = ethers.utils.serializeTransaction(tx)
  const sig =  await ethApp.signTransaction(
    _derivationPath, removeHexPrefix(serializedTx))
  const ethersSig = ledgerToEthersSignature(sig)

  return ethers.utils.serializeTransaction(tx, ethersSig)
}

export async function signPersonalMessage(ethApp: any, message: string,
    _derivationPath = derivationPath) {
  const sig = await ethApp.signPersonalMessage(
    _derivationPath, removeHexPrefix(message))

  return ledgerToEthersSignature(sig)
}

export function ledgerToEthersSignature(ledgerSignature: {v: string, s: string, r: string}) : Signature {
  return {
    // Gnosis Safe identifies personal message signatures by a v value that is incremented by 4.
    v: parseInt(ledgerSignature['v']) + 4,
    r: `0x${ledgerSignature['r']}`,
    s: `0x${ledgerSignature['s']}`,
  }
}
