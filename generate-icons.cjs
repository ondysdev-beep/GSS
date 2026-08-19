const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

// CRC32 for PNG chunks
function crc32(buf) {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crcBuf])
}

function createPNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8; ihdrData[9] = 6 // 8-bit RGBA

  const scanline = Buffer.alloc(1 + size * 4)
  scanline[0] = 0 // filter: None
  for (let x = 0; x < size; x++) {
    scanline[1 + x * 4] = r
    scanline[1 + x * 4 + 1] = g
    scanline[1 + x * 4 + 2] = b
    scanline[1 + x * 4 + 3] = 255 // alpha: fully opaque
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => scanline))
  const compressed = zlib.deflateSync(raw)

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ])
}

// ICO format: embed PNG directly (Vista+ compatible)
function createICO(pngBuffers) {
  const count = pngBuffers.length
  const headerSize = 6 + count * 16
  const header = Buffer.alloc(headerSize)

  header.writeUInt16LE(0, 0)   // reserved
  header.writeUInt16LE(1, 2)   // type: ICO
  header.writeUInt16LE(count, 4) // count

  let offset = headerSize
  pngBuffers.forEach((png, i) => {
    const entry = 6 + i * 16
    header[entry] = 0       // width (0 = 256)
    header[entry + 1] = 0   // height (0 = 256)
    header[entry + 2] = 0   // color count
    header[entry + 3] = 0   // reserved
    header.writeUInt16LE(1, entry + 4)  // planes
    header.writeUInt16LE(32, entry + 6) // bit count
    header.writeUInt32LE(png.length, entry + 8)  // size
    header.writeUInt32LE(offset, entry + 12)      // offset
    offset += png.length
  })

  return Buffer.concat([header, ...pngBuffers])
}

const iconsDir = path.join(__dirname, 'src-tauri', 'icons')
fs.mkdirSync(iconsDir, { recursive: true })

// GSS dark background color
const R = 45, G = 45, B = 48

const png32  = createPNG(32,  R, G, B)
const png128 = createPNG(128, R, G, B)
const png256 = createPNG(256, R, G, B)

fs.writeFileSync(path.join(iconsDir, '32x32.png'),      png32)
fs.writeFileSync(path.join(iconsDir, '128x128.png'),    png128)
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), png256)
fs.writeFileSync(path.join(iconsDir, 'icon.png'),       png256)
fs.writeFileSync(path.join(iconsDir, 'icon.ico'),       createICO([png256]))

console.log('All icons generated successfully!')
