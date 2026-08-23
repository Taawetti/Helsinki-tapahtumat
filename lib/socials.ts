// Some-linkkien normalisointi OSM-tageista. Mitattu 24.8.2026: 54/479 uudesta
// paikasta kantaa instagram/facebook-tagia, ja muodot vaihtelevat villisti —
// täysi URL, pelkkä käyttäjänimi ("borealhki"), @-alkuinen ("@antinkaffe-
// liiteri"), m.facebook-osoite, profile.php?id=… ja pelkkä numero-id.
// Moni pikkupaikka pitää IG:tä kotisivunaan (omistajan huomio: "usealla
// paikalla on ig sivu mutta ei kotisivua") — osa kirjaa sen website-tagiin,
// joten myös se luokitellaan.

/** '@handle', 'handle' tai URL → täysi Instagram-osoite, tai undefined. */
export function normalizeInstagram(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  const v = raw.trim()
  if (!v) return undefined
  if (/instagram\.com/i.test(v)) {
    const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
    if (m) return `https://www.instagram.com/${m[1]}/`
    return v.startsWith('http') ? v : `https://${v}`
  }
  const handle = v.replace(/^@/, '')
  if (!/^[A-Za-z0-9._]+$/.test(handle)) return undefined
  return `https://www.instagram.com/${handle}/`
}

/** '@handle', 'handle', numero-id tai URL → täysi Facebook-osoite. */
export function normalizeFacebook(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  const v = raw.trim()
  if (!v) return undefined
  if (/facebook\.com/i.test(v)) {
    // m.facebook → www; muuten osoite sellaisenaan (profile.php?id=… on validi)
    const url = v.startsWith('http') ? v : `https://${v}`
    return url.replace(/\/\/m\.facebook\.com/i, '//www.facebook.com')
  }
  const handle = v.replace(/^@/, '')
  if (!/^[A-Za-z0-9.]+$/.test(handle)) return undefined
  return `https://www.facebook.com/${handle}`
}

/**
 * Luokittelee website-arvon: Instagram-/Facebook-osoite EI ole kotisivu vaan
 * some-linkki (mitattu: Walk Cyclen website-tagi on instagram.com-osoite).
 */
export function splitWebsite(www: string | undefined | null): {
  www?: string
  instagram?: string
  facebook?: string
} {
  if (!www?.trim()) return {}
  const v = www.trim()
  if (/instagram\.com/i.test(v)) return { instagram: normalizeInstagram(v) }
  if (/facebook\.com/i.test(v)) return { facebook: normalizeFacebook(v) }
  return { www: v }
}
