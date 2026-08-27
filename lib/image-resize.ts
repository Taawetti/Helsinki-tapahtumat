// Kuvan pienennys selaimessa ennen lähetystä.
//
// MIKSI. Puhelimen kamerakuva on tyypillisesti 3–8 Mt. Base64-koodattuna se
// kasvaa vielä kolmanneksella, ja koko möykky menisi yhtenä JSON-pyyntönä.
// Mobiiliyhteydellä lähetys kestäisi kymmeniä sekunteja, ja ilmoittaja luulisi
// lomakkeen jumittuneen — eli hän lähtisi pois kesken kaiken.
//
// Pienennys tehdään ASIAKKAALLA eikä palvelimella, jotta iso tiedosto ei
// koskaan lähde verkkoon. Palvelin tarkistaa koon silti uudestaan: selainta ei
// voi luottaa, koska pyyntö voidaan väärentää.

const MAX_SIVU = 1600
const LAATU = 0.85

/** Pienentää kuvan ja palauttaa data-URLin. Heittää jos tiedosto ei ole kuva. */
export async function pienennaKuva(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('ei kuva'))
      i.src = url
    })

    const suurin = Math.max(img.width, img.height)
    const kerroin = suurin > MAX_SIVU ? MAX_SIVU / suurin : 1
    const w = Math.round(img.width * kerroin)
    const h = Math.round(img.height * kerroin)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas ei käytettävissä')
    ctx.drawImage(img, 0, 0, w, h)

    // JPEG eikä PNG: valokuvasta PNG olisi moninkertainen koko. Läpinäkyvyyttä
    // ei tarvita tapahtumakuvassa.
    return canvas.toDataURL('image/jpeg', LAATU)
  } finally {
    URL.revokeObjectURL(url)
  }
}
