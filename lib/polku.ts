// usePathname():n normalisointi.
//
// VERCEL + JUURIREITTI (löydetty 4.11.2026): tuotannossa etusivun
// esirenderöinti (ISR) saa reitin kanonisena polkuna "/index" — näkyy
// flight-payloadissa c:["","index"] — jolloin usePathname() palauttaa
// palvelimella "/index", mutta selain lukee osoiterivin "/" ja hydraatio
// vertaa eri polkuja. Footer valitsi palvelimella laskeutumissivujen täyden
// linkkivalikon ja selaimessa kevyen brändirivin → React #418 ja KOKO puu
// renderöitiin uudelleen jokaisella etusivun latauksella. Dev-palvelimella
// polku on "/" eikä vika toistu — siksi se pysyi piilossa.
export function normalisoiPolku(p: string | null): string | null {
  return p === '/index' ? '/' : p
}
