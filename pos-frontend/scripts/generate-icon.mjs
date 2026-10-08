// One-off generator for the native app icon + splash source images
// (resources/icon.png, resources/splash.png), rasterized from inline SVG
// with @capacitor/assets's own `sharp` dependency — no external design tool
// available in this environment. Run once with `node scripts/generate-icon.mjs`;
// re-run only if the brand mark changes. `npx capacitor-assets generate`
// then derives every platform-specific icon/splash size from these two files.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const resourcesDir = fileURLToPath(new URL('../resources/', import.meta.url))
mkdirSync(resourcesDir, { recursive: true })

const ICON_SIZE = 1024
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#182140"/>
      <stop offset="100%" stop-color="#0a0f1c"/>
    </linearGradient>
    <linearGradient id="chip" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1776ff"/>
      <stop offset="100%" stop-color="#0b4fc4"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect x="176" y="256" width="672" height="512" rx="56" fill="url(#chip)"/>
  <rect x="176" y="256" width="672" height="120" rx="56" fill="#ffffff" fill-opacity="0.14"/>
  <circle cx="248" cy="316" r="14" fill="#ffffff" fill-opacity="0.85"/>
  <circle cx="296" cy="316" r="14" fill="#ffffff" fill-opacity="0.55"/>
  <rect x="232" y="416" width="272" height="272" rx="24" fill="#ffffff" fill-opacity="0.92"/>
  <text x="368" y="600" font-family="Arial, sans-serif" font-size="220" font-weight="700" fill="#0b4fc4" text-anchor="middle">X</text>
  <rect x="552" y="416" width="240" height="52" rx="12" fill="#ffffff" fill-opacity="0.85"/>
  <rect x="552" y="492" width="240" height="52" rx="12" fill="#ffffff" fill-opacity="0.6"/>
  <rect x="552" y="568" width="164" height="52" rx="12" fill="#ffffff" fill-opacity="0.6"/>
  <rect x="392" y="748" width="240" height="40" rx="20" fill="#ffffff" fill-opacity="0.18"/>
</svg>`

const SPLASH_SIZE = 2732
const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH_SIZE}" height="${SPLASH_SIZE}" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#0a0f1c"/>
  <g transform="translate(1050,1050)">
    <rect width="632" height="632" rx="120" fill="url(#chip2)"/>
    <defs>
      <linearGradient id="chip2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1776ff"/>
        <stop offset="100%" stop-color="#0b4fc4"/>
      </linearGradient>
    </defs>
    <text x="316" y="420" font-family="Arial, sans-serif" font-size="360" font-weight="700" fill="#ffffff" text-anchor="middle">X</text>
  </g>
</svg>`

await sharp(Buffer.from(iconSvg)).png().toFile(`${resourcesDir}icon.png`)
await sharp(Buffer.from(splashSvg)).png().toFile(`${resourcesDir}splash.png`)
console.log('Wrote resources/icon.png and resources/splash.png')
