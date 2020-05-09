import { ethers } from 'ethers'

export const zero = ethers.utils.bigNumberify(0)
export const zeroAddress = '0x0000000000000000000000000000000000000000'

export function removeHexPrefix(s: string): string {
  return s.replace(/^0x/, '')
}
