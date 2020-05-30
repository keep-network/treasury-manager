import chalk from 'chalk'
import clear from 'clear'
import Table from 'cli-table'
import * as figlet from 'figlet'
import inquirer from 'inquirer'

import { ethers } from 'ethers'

import * as gnosis from './gnosis'
import { GnosisSafe } from './typechain/GnosisSafe'

function abbreviatedAddress(address : string) : string {
  return `${address.substr(0, 5)}...${address.slice(-3)}`
}

async function getFormattedSafeDetails(safe: GnosisSafe) : Promise<string> {
  let details = await gnosis.getDetails(safe)
  let table = new Table()
  table.push(
    { address: safe.address },
    { threshold: `${details.threshold}/${details.owners.length}` },
    { owners:  details.owners.map(abbreviatedAddress).join(', ') },
  )
  return table.toString()
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
          let detailsTable = await getFormattedSafeDetails(safe)

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

const main = async () => {
  clear()

  console.log(chalk.green(figlet.textSync('KEEP')))

  const provider = ethers.getDefaultProvider()

  let safe = await getSafeFromUser(provider)
}

main()
