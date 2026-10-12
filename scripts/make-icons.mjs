import sharp from 'sharp'
import { readFileSync } from 'node:fs'
const svg = readFileSync('public/favicon.svg')
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#f97316"/><g transform="translate(51 51) scale(0.8)">
<path d="M256 104 408 236h-40v150H144V236h-40Z" fill="#fff"/>
<path d="M256 214a46 46 0 0 1 46 46c0 34-46 82-46 82s-46-48-46-82a46 46 0 0 1 46-46Z" fill="#0f172a"/>
<circle cx="256" cy="260" r="16" fill="#fff"/></g></svg>`)
await sharp(svg).resize(192).png().toFile('public/pwa-192.png')
await sharp(svg).resize(512).png().toFile('public/pwa-512.png')
await sharp(svg).resize(180).png().toFile('public/apple-touch-icon.png')
await sharp(maskable).resize(512).png().toFile('public/pwa-maskable-512.png')
console.log('icons ok')
