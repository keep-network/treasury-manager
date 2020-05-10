import { ethers } from 'ethers'
import { BigNumber, UnsignedTransaction, Signature } from 'ethers/utils'

import * as keep from './keep'
import * as gnosis from './gnosis'
import * as ledger from './ledger'

const mattsGrant = '0x306309f9d105f34132db0bfb3ce3f5b0245cd386'
const luongoWallet = '0x461aa63A98e6f8BdAa19CA3f2258670E794FFF34'
const stakingContract = '0x6d1140a8c8e6fac242652f0a5a8171b898c67600'

// 15x minimum stake
const amountToStake = keep.keepToWei('1500000')
const authorizer = '0x9eEf87f4C08d8934cB2a3309dF4deC5635338115'
const operator = '0xe73a3571DA4c7d7AC251bdB700dbe3bc2017CE5a'
const beneficiary = '0xbAdA1DbD06B5Fe24082b71D6BBca604E72036FB3'
const zeroAddress = '0x0000000000000000000000000000000000000000'

const provider = ethers.getDefaultProvider()
const grant = keep.getManagedGrant(mattsGrant, provider)
const safe = gnosis.getSafe(luongoWallet, provider)

Promise.all([
  grant.grantId(),
  safe.nonce()
]).then(async (values : any[]) => {
  const [grantId, nonce] = values

  console.log(`Grant ID: ${grantId}`)
  console.log(`Safe nonce: ${nonce}`)
  console.log(`Gas price: ${await provider.getGasPrice()}`)

  const txRequest = {
    ...keep.getStakingTx(grant, stakingContract, amountToStake, operator, beneficiary, authorizer),
    nonce: nonce,
    gasLimit: ethers.utils.bigNumberify('1400000'),
    gasPrice: ethers.utils.bigNumberify('11000000000'),
  }

  const serialized = ethers.utils.serializeTransaction(txRequest)

  console.log(`Staking TX: ${JSON.stringify(txRequest)}`)
  console.log(`Serialized TX: ${serialized}`)

  const txHash = await safe.getTransactionHash(
    txRequest.to || '', 0, txRequest.data || '', 0, 0, 0, 0, zeroAddress, zeroAddress, txRequest.nonce
  )

  console.log(`Safe TX hash: ${txHash}`)

  const ethApp = await ledger.initializeEthApp()

  console.log("Requesting data signature via Ledger...")

  const dataSig = await ledger.signPersonalMessage(ethApp, txHash)

  const joinedDataSig = ethers.utils.joinSignature(dataSig)

  console.log('Signature from Ledger: ', joinedDataSig)

  let dataSignatures = [
    //'0x73ab541db2b3ea9da4a40c9a91a4c3b4faf61eb8f1f387b662db9a27917636440a475dbb007fb6f8f58b75d1cb821a17258c3b590ce15a540e30c76913989d0100',
    //'0xf7def7b606549c3d0a4ac19f0fda14e7f09c130994172b2414bcd323131f5550323dfe1ff34c52077221c23a38fd52724f059d68fefa98134718b4d1edba801a01',
    joinedDataSig,
    '0x81a971f651037f4c67c02c743da0f133df30dc7dff7a236b076358051caa650d76b9b487df4d70eb6dd66d29201c9c24a0cf37a557fc53b07afb35ef372705371c',
  ]

  let unsignedExecTx = {
    ...gnosis.getExternalExecTransactionTx(safe,
      txRequest.to || '', 0, txRequest.data || '', 0, 0, dataSignatures),
    nonce: 18,
    gasLimit: ethers.utils.bigNumberify('2053087'),
    gasPrice: ethers.utils.bigNumberify('11000000000')
  }

  console.log(`Final Safe TX: ${JSON.stringify(unsignedExecTx)}`)

  console.log('Requesting transaction signature via Ledger...')

  let signedTx = ledger.signTransaction(ethApp, unsignedExecTx)

  console.log('Signed TX: ', signedTx)

  console.log('Broadcasting transaction...')

  await provider.sendTransaction(signedTx).catch((e) =>
    console.error(`Error sending transaction: ${e.transactionHash}`)).then(
    (tx) => console.log(`Succeeded sending tx! ${tx}`)
  )
})
