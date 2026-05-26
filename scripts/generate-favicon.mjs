/**
 * Generates favicon.ico (16/32/48px), icon-192.png, and apple-touch-icon.png
 * from public/buzomed-icon.png using sharp.
 *
 * Usage: node scripts/generate-favicon.mjs
 */

import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')
const src = path.join(publicDir, 'buzomed-icon.png')

// ─── ICO builder ─────────────────────────────────────────────────────────────
// Modern ICO stores PNG-compressed frames (supported since Windows Vista+).
// Each frame is raw PNG bytes embedded in the ICO container.

async function buildIco(sizes) {
  const frames = await Promise.all(
    sizes.map(async (size) => {
      const data = await sharp(src)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
      return { size, data }
    })
  )

  const count = frames.length
  // Header: 6 bytes
  const headerSize = 6
  // Directory: 16 bytes per frame
  const dirSize = 16 * count
  // Image data starts after header + directory
  let offset = headerSize + dirSize

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)     // reserved
  header.writeUInt16LE(1, 2)     // type: 1 = ICO
  header.writeUInt16LE(count, 4) // number of images

  const dirs = frames.map(({ size, data }) => {
    const dir = Buffer.alloc(16)
    dir.writeUInt8(size === 256 ? 0 : size, 0)  // width (0 = 256)
    dir.writeUInt8(size === 256 ? 0 : size, 1)  // height
    dir.writeUInt8(0, 2)                         // color count (0 = >256 colors)
    dir.writeUInt8(0, 3)                         // reserved
    dir.writeUInt16LE(1, 4)                      // planes
    dir.writeUInt16LE(32, 6)                     // bits per pixel
    dir.writeUInt32LE(data.length, 8)            // size of image data
    dir.writeUInt32LE(offset, 12)                // offset of image data
    offset += data.length
    return dir
  })

  return Buffer.concat([header, ...dirs, ...frames.map((f) => f.data)])
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const icoBuffer = await buildIco([16, 32, 48])
// Next.js App Router serves app/favicon.ico (takes precedence over public/)
const appDir = path.join(__dirname, '..', 'app')
await Promise.all([
  fs.writeFile(path.join(publicDir, 'favicon.ico'), icoBuffer),
  fs.writeFile(path.join(appDir, 'favicon.ico'), icoBuffer),
])
console.log(`favicon.ico written (${icoBuffer.length} bytes) → public/ and app/`)

await sharp(src)
  .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(publicDir, 'icon-192.png'))
console.log('icon-192.png written')

await sharp(src)
  .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(publicDir, 'apple-touch-icon.png'))
console.log('apple-touch-icon.png written')
