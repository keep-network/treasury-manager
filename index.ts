import chalk from 'chalk'
import clear from 'clear'
import Table from 'cli-table'
import * as figlet from 'figlet'
import inquirer from 'inquirer'

import { ethers } from 'ethers'
import { Zero, AddressZero } from 'ethers/constants'
import { UnsignedTransaction } from 'ethers/utils'
import * as ledger from './ledger'

import { removeHexPrefix } from './utils'

import * as gnosis from './gnosis'
import { GnosisSafe } from './typechain/GnosisSafe'

import * as keep from './keep'
import { ManagedGrant } from './typechain/ManagedGrant'

function abbreviatedAddress(address : string) : string {
  return `${address.substr(0, 5)}...${address.slice(-3)}`
}

function formattedSafeDetails(safe : GnosisSafe, details : gnosis.SafeDetails,
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

async function getFormattedSafeDetails(safe: GnosisSafe, extended = false) : Promise<string> {
  let details = await gnosis.getDetails(safe)
  return formattedSafeDetails(safe, details, extended)
}

async function getSafeFromUser(provider: ethers.providers.Provider)
  : Promise<GnosisSafe | null> {
  let safe : GnosisSafe
  let safeDetails

  while (true) {
    let answers = await inquirer.prompt([{
      name: 'useSafe',
      message: 'Use a Gnosis Safe?',
      type: 'confirm'
    }, {
      name: 'safeAddress',
      message: 'Gnosis Safe address:',
      validate: (value: string) => {
        try {
          ethers.utils.getAddress(value)
          return true
        } catch (e) {
          return 'Enter a valid Ethereum address'
        }
      },
      when: (answers) => answers.useSafe,
    }])

    if (!answers.useSafe) {
      return null
    }

    safe = await gnosis.getSafe(answers.safeAddress, provider)

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

async function getFormattedGrantDetails(grant: ManagedGrant) : Promise<string> {
  let details = await keep.getDetails(grant)
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
  : Promise<ManagedGrant> {
  let grant : ManagedGrant
  let safeDetails

  while (true) {
    let answers = await inquirer.prompt([{
      name: 'useManagedGrant',
      message: 'Use a managed grant?',
      type: 'confirm'
    }, {
      name: 'grantAddress',
      message: 'Managed grant address:',
      validate: (value: string) => {
        try {
          ethers.utils.getAddress(value)
          return true
        } catch (e) {
          return 'Enter a valid Ethereum address'
        }
      },
      when: (answers) => answers.useManagedGrant,
    },{
      name: 'grantId',
      type: 'number',
      message: 'Grant ID:',
      validate: (value: string) => !isNaN(parseInt(value)),
      when: (answers) => !answers.useManagedGrant,
    }])

    grant = await keep.getManagedGrant(answers.grantAddress, provider)

    let newAnswers = (await inquirer.prompt([{
      name: 'confirmed',
      message: async (newAnswers) => {
        try {
          let detailsTable = await getFormattedGrantDetails(grant)

          return `\n${detailsTable}\n\nDoes this look right?`
        } catch (e) {
          return "That doesn't look like a ManagedGrant, are you sure?"
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

  const dataSig = await ledger.signPersonalMessage(ethApp, message)

  return ethers.utils.joinSignature(dataSig).replace(/1b$/, '1f').replace(/1c$/, '20')
}

async function signMessage(message : string, address? : string) {// : Promise<string> {
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

async function prepareSafeTransaction(tx : UnsignedTransaction,
  safe : GnosisSafe) : Promise<UnsignedTransaction> {
  let details = await gnosis.getDetails(safe)

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


  return gnosis.getExternalExecTransactionTx(
    safe, tx.to || '', Zero, tx.data || '', Zero, Zero, signatures)
}

async function withdrawFromGrant(grant : ManagedGrant, safe : GnosisSafe) {
  console.log(`Preparing tx to withdraw from grant ${chalk.cyan(grant.address)}...`)
  let tx = keep.getWithdrawalTx(grant)

  console.log(`${chalk.bold('Withdrawal TX:')}: ${JSON.stringify(tx, null, 2)}\n`)

  let safeTx = await prepareSafeTransaction(tx, safe)

  console.log(`${chalk.bold('Safe TX')}: ${JSON.stringify(safeTx, null, 2)}\n`)

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
        {
          name:'Create a grant',
          value:'create-grant',
        },
        {
          name:'Revoke a grant',
          value:'revoke-grant',
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
      case 'withdraw-grant':
        if (safe !== null) {
          let grant = await getGrantFromUser(provider)
          await withdrawFromGrant(grant, safe)
        }
        break
    }

    if (answers.choice === 'exit') {
      break
    }
  }

}

main()
