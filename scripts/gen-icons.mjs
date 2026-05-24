import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const out = join(__dirname, '../public')

// Purple-to-pink gradient "M" icon as SVG, then rasterise with sharp
function makeSvg(size) {
  const r = size * 0.18   // corner radius
  const pad = size * 0.15
  const fontSize = size * 0.52
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <clipPath id="clip"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></clipPath>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#g)"/>
  <text
    x="50%" y="50%"
    dominant-baseline="central"
    text-anchor="middle"
    font-family="system-ui,-apple-system,sans-serif"
    font-weight="900"
    font-size="${fontSize}"
    fill="white"
    letter-spacing="-2"
  >M</text>
</svg>`
}

for (const size of [192, 512]) {
  const svg = Buffer.from(makeSvg(size))
  await sharp(svg).png().toFile(join(out, `icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}

// Also generate apple-touch-icon at 180x180
const svg180 = Buffer.from(makeSvg(180))
await sharp(svg180).png().toFile(join(out, 'icon-180.png'))
console.log('✓ icon-180.png')
