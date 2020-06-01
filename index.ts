import chalk from 'chalk'
import clear from 'clear'
import Table from 'cli-table'
import * as figlet from 'figlet'
import inquirer from 'inquirer'

import { ethers } from 'ethers'
import { Zero, AddressZero } from 'ethers/constants'
import { serializeTransaction, UnsignedTransaction } from 'ethers/utils'
import * as ledger from './ledger'

import { removeHexPrefix } from './utils'

import * as gnosis from './gnosis'

import * as keep from './keep'

function abbreviatedAddress(address : string) : string {
  return `${address.substr(0, 5)}...${address.slice(-3)}`
}

function ethereumAddressQuestion(name : string, message : string) {
  return {
    name,
    message,
    validate: (value: string) => {
      try {
        ethers.utils.getAddress(value)
        return true
      } catch (e) {
        return 'Enter a valid Ethereum address'
      }
    }
  }
}

function formattedSafeDetails(safe : gnosis.Safe, details : gnosis.SafeDetails,
  extended = false) : string {
  let table = new Table()
  table.push(
    { address: safe.address },
    { threshold: `${details.threshold}/${details.owners.length}` },
  )

  if (!extended) {
    table.push({ owners: details.owners.map(abbreviatedAddress).join(', ') })
  } else {
    let toEntry = (d : string, i : number) => {
      let key = `owner ${i + 1}`
      let obj : any = {}
      obj[key] = d
      return obj
    }
    table.push(...details.owners.map(toEntry))
  }

  return table.toString()
}

async function getFormattedSafeDetails(safe: gnosis.Safe, extended = false) : Promise<string> {
  let details = await safe.getDetails()
  return formattedSafeDetails(safe, details, extended)
}

async function getSafeFromUser(provider: ethers.providers.Provider)
  : Promise<gnosis.Safe | null> {
  let safe : gnosis.Safe
  let safeDetails

  while (true) {
    let answers = await inquirer.prompt([
      {
        name: 'useSafe',
        message: 'Use a Gnosis Safe?',
        type: 'confirm'
      },
      {
        ...ethereumAddressQuestion('safeAddress', 'Gnosis Safe address:'),
        when: (answers) => answers.useSafe,
      }
    ])

    if (!answers.useSafe) {
      return null
    }

    safe = await gnosis.Safe.fromSolidity(answers.safeAddress as string, provider)

    let newAnswers = (await inquirer.prompt([{
      name: 'confirmed',
      message: async (newAnswers) => {
        try {
          let detailsTable = await getFormattedSafeDetails(safe, false)

          return `\n${detailsTable}\n\nDoes this look right?`
        } catch (e) {
          return "That doesn't look like a Gnosis Safe, are you sure?"
        }
      },
      type: 'confirm'
    }]))

    if (newAnswers.confirmed && safe !== null) {
      return safe
    }
  }
}

async function getFormattedGrantDetails(grant: keep.ManagedGrant) : Promise<string> {
  let details = await grant.getDetails()
  let table = new Table()
  table.push(
    { address: grant.address },
    { id: details.id },
    { grantee: details.grantee },
    { manager:  details.manager },
  )
  return table.toString()
}

async function getGrantFromUser(provider: ethers.providers.Provider)
  : Promise<keep.ManagedGrant> {
  let grant : keep.ManagedGrant
  let safeDetails

  while (true) {
    let answers = await inquirer.prompt([
      {
        name: 'useManagedGrant',
        message: 'Use a managed grant?',
        type: 'confirm'
      },
      {
        ...ethereumAddressQuestion('grantAddress', 'Managed grant address:'),
        when: (answers) => answers.useManagedGrant,
      },
      {
        name: 'grantId',
        type: 'number',
        message: 'Grant ID:',
        validate: (value: string) => !isNaN(parseInt(value)),
        when: (answers) => !answers.useManagedGrant,
      }
    ])

    grant = await keep.ManagedGrant.fromSolidity(answers.grantAddress as string, provider)

    let newAnswers = (await inquirer.prompt([{
      name: 'confirmed',
      message: async (newAnswers) => {
        try {
          let detailsTable = await getFormattedGrantDetails(grant)

          return `\n${detailsTable}\n\nDoes this look right?`
        } catch (e) {
          return "That doesn't look like a keep.ManagedGrant, are you sure?"
        }
      },
      type: 'confirm'
    }]))

    if (newAnswers.confirmed) {
      return grant
    }
  }
}

async function signMessageWithLedger(message : string) : Promise<string> {

  const ethApp = await ledger.initializeEthApp()

  const sig = await ledger.signPersonalMessage(ethApp, message)

  return ethers.utils.joinSignature(sig).replace(/1b$/, '1f').replace(/1c$/, '20')
}

async function signTxWithLedger(tx : UnsignedTransaction) : Promise<string> {

  const ethApp = await ledger.initializeEthApp()

  return await ledger.signTransaction(ethApp, tx)
}

async function signMessage(message : string, address? : string) : Promise<string> {
  console.log(`Message to be signed: ${chalk.cyan(message)}`)

  let signature// : Signature

  while (true) {
    let answers = await inquirer.prompt([
      {
        name: 'useLedger',
        type: 'confirm',
        message: 'Would you like to sign with an attached Ledger?'
      },
      {
        name: 'manuallySignedMessage',
        when: (answers) => !answers.useLedger,
        message: (answers) => `Signature:`,
      }
    ])

    if (answers.useLedger) {
      signature = await signMessageWithLedger(message)
    } else {
      signature = answers.manuallySignedMessage
    }

    let recoveredAddress = ethers.utils.verifyMessage(message, signature)

    let newAnswers = await inquirer.prompt([
      {
        name: 'confirmSignature',
        message: (`Signature appears to be from address ${recoveredAddress}.` +
                  ` Is that correct?`),
        type: 'confirmed'
      }
    ])

    if (newAnswers.confirmSignature) {
      return signature
    }
  }
}

async function signTx(tx : UnsignedTransaction, address? : string) : Promise<string> {
  console.log(`Tx to be signed: ${chalk.cyan(JSON.stringify(tx, null, 2))}`)
  console.log(`Serialized tx: ${chalk.cyan(serializeTransaction(tx))}`)

  let signature

  let answers = await inquirer.prompt([
    {
      name: 'useLedger',
      type: 'confirm',
      message: 'Would you like to sign with an attached Ledger?'
    },
    {
      name: 'manuallySignedTx',
      when: (answers) => !answers.useLedger,
      message: (answers) => `Signature:`,
    }
  ])

  if (answers.useLedger) {
    signature = await signTxWithLedger(tx)
  } else {
    signature = answers.manuallySignedTx
  }

  return signature
}

async function prepareSafeTransaction(tx : UnsignedTransaction,
  safe : gnosis.Safe) : Promise<UnsignedTransaction> {

  console.log('Preparing safe transaction...\n')

  let details = await safe.getDetails()

  const txHash = await safe.getTransactionHash(tx.to || '', Zero, tx.data || '',
    Zero, Zero, Zero, Zero, AddressZero, AddressZero, details.nonce)

  console.log(`Transaction will require ${details.threshold} signatures.\n\n`)

  let signatures : string[] = []
  let i = 0

  while (i < details.threshold.toNumber()) {
    console.log(`Signature ${i + 1}...`)

    let candidate = await signMessage(txHash)
    let recoveredAddress = ethers.utils.verifyMessage(txHash, candidate)

    if (true) {//details.owners.includes(recoveredAddress)) {
      signatures.push(candidate)
      i += 1
    } else {
      console.log(chalk.red(`Hmm, that doesn't appear to be from an owner account.`))
    }
  }

  // safes require signatures to be in owner order
  signatures.sort((s) =>
    details.owners.indexOf(ethers.utils.verifyMessage(txHash, s)))

  return safe.getExternalExecTransactionTx(
    tx.to || '', Zero, tx.data || '', Zero, Zero, signatures)
}

async function signAndBroadcast(tx : UnsignedTransaction) : Promise<string | null> {

  let answers = await inquirer.prompt([
    {
      name: 'sign',
      type: 'confirm',
      message: 'Would you like to sign now?'
    },
    {
      name: 'broadcast',
      type: 'confirm',
      message: 'Would you like to broadcast the signed transaction?',
      when: (answers) => answers.sign
    }
  ])

  if (answers.sign) {
  }
  return null
}

async function withdrawFromGrant(safe : gnosis.Safe, provider : ethers.providers.Provider) {

  let grant = await getGrantFromUser(provider)

  console.log(`Preparing tx to withdraw from grant ${chalk.cyan(grant.address)}...`)
  let tx = grant.getWithdrawalTx()

  console.log(`${chalk.bold('Withdrawal TX:')}: ${JSON.stringify(tx, null, 2)}\n`)

  let safeTx = await prepareSafeTransaction(tx, safe)

  await signAndBroadcast(safeTx)
}

async function stakeFromGrant(safe : gnosis.Safe, provider : ethers.providers.Provider) {
  let grant = await getGrantFromUser(provider)

  let answers : {
    stakingContract : string,
    amount : number,
    operator : string,
    authorizer : string,
    beneficiary : string,
    confirmDetails: boolean,
  }

  while (true) {
    answers = await inquirer.prompt([
      ethereumAddressQuestion('stakingContract', 'Staking contract address:'),
      {
        name: 'amount',
        message: 'Amount of KEEP (min 100k):',
        type: 'number',
        validate: (n : number) => (n >= 100000 ?
          true : 'Must stake at >=100k KEEP'),
      },
      ethereumAddressQuestion(
        'operator', 'Operator address. This is the staking node:'),
      ethereumAddressQuestion('authorizer', 'Authorizer address. ' +
        'If you\'re unsure, use the owner address or another you control:'),
      ethereumAddressQuestion(
        'beneficiary', 'Beneficiary address - where rewards will be sent:'),
    ])

    let table = new Table()
    table.push(
      { stakingContract: answers.stakingContract },
      { amount: `${answers.amount} KEEP` },
      { operator: answers.operator },
      { authorizer: answers.authorizer },
      { beneficiary: answers.beneficiary },
    )

    let newAnswers = await inquirer.prompt([
      {
        name: 'confirmDetails',
        type: 'confirm',
        message: `${table.toString()} \n\nDoes this look right? (Y/n):`
      }
    ])

    if (answers.confirmDetails) {
      break
    }
  }

  console.log(`Preparing tx to stake from grant ${chalk.cyan(grant.address)}...`)
  const tx = grant.getStakingTx(answers.stakingContract,
    keep.keepToWei(answers.amount), answers.operator, answers.authorizer,
    answers.beneficiary)

  console.log(`${chalk.bold('Staking TX:')}: ${JSON.stringify(tx, null, 2)}\n`)

  const safeTx = await prepareSafeTransaction(tx, safe)

  console.log(`${chalk.bold('Safe TX')}:\n`)

  await signAndBroadcast(safeTx)
}

const main = async () => {
  clear()

  console.log(chalk.green(figlet.textSync('KEEP')))

  const provider = ethers.getDefaultProvider()

  let safe = await getSafeFromUser(provider)

  while (true) {

    let answers = await inquirer.prompt([{
      name: 'choice',
      message: 'Use a Gnosis Safe?',
      type: 'list',
      choices: [
        {
          name:'Transfer KEEP tokens',
          value:'transfer',
        },
        {
          name:'Stake',
          value:'stake',
        },
        {
          name:'Unstake',
          value:'unstake',
        },
        new inquirer.Separator(),
        {
          name:'Create a grant',
          value:'create-grant',
        },
        {
          name:'Revoke a grant',
          value:'revoke-grant',
        },
        {
          name:'Reassign a grant',
          value:'reassign-grant',
        },
        new inquirer.Separator(),
        {
          name:'Stake from a grant',
          value:'stake-grant',
        },
        {
          name:'Withdraw from a grant',
          value:'withdraw-grant',
        },
        new inquirer.Separator(),
        {
          name:'Exit',
          value:'exit',
        },
        new inquirer.Separator(),
      ]
    }])

    switch (answers.choice) {
      case 'stake-grant':
        if (safe !== null) {
          await stakeFromGrant(safe, provider)
        }
        break
      case 'withdraw-grant':
        if (safe !== null) {
          await withdrawFromGrant(safe, provider)
        }
        break
    }

    if (answers.choice === 'exit') {
      break
    }
  }
}

main()
