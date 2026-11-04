'use client'

import { usePathname } from 'next/navigation'
import { normalisoiPolku } from '@/lib/polku'

/** usePathname(), mutta Vercelin esirenderöinnin "/index" luetaan "/":na —
 *  ks. lib/polku. Käytä tätä aina kun polkua verrataan etusivuun. */
export function usePolku(): string {
  return normalisoiPolku(usePathname()) ?? '/'
}
