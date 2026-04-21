// scripts/generate-favicon.js
// Emits two assets, with no npm dependencies:
//   public/icon-192.png   — 192×192 PWA/Apple-touch icon
//   public/favicon.ico    — ICO wrapper around a 32×32 PNG (supported by all
//                           modern browsers; Windows Vista+)
//
// Design: doddl-purple (#3D157D) rounded-square background with a white
// lowercase "d" mark — ring-shaped bowl on the left + vertical stem on the
// right. Anti-aliased via 2× supersampling (render at 2× and box-downsample).
//
// Run: node scripts/generate-favicon.js

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// ── Brand ──────────────────────────────────────────────────────────────────
const PURPLE = { r: 0x3D, g: 0x15, b: 0x7D }
const WHITE  = { r: 0xFF, g: 0xFF, b: 0xFF }

// ── Shape primitives (return "coverage" in [0,1] for AA) ───────────────────
// For a supersampled rasteriser we just need a hard inside/outside test —
// the 2× box-downsample handles the AA.
function insideRoundedRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false
  if (x >= r && x < w - r) return true
  if (y >= r && y < h - r) return true
  const cx = x < r ? r : w - 1 - r
  const cy = y < r ? r : h - 1 - r
  const dx = x - cx, dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function insideCircleRing(x, y, cx, cy, outerR, innerR) {
  const dx = x - cx, dy = y - cy
  const d2 = dx * dx + dy * dy
  return d2 <= outerR * outerR && d2 >= innerR * innerR
}

function insideRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x < x1 && y >= y0 && y < y1
}

// Draw the icon at size N into an RGBA Buffer (row-major, 4 bytes/px).
// Scale-invariant geometry: every dimension is derived from N.
function renderIcon(N) {
  // Render at 2× then downsample for anti-aliasing
  const S = N * 2
  const buf = Buffer.alloc(S * S * 4)

  // Background rounded square: edge-to-edge
  const bgR = Math.round(S * 0.16)

  // "d" mark geometry (proportions relative to S=384 at N=192):
  // Padding ~14% on each side; bowl on the left, stem on the right.
  const pad      = Math.round(S * 0.14)
  const stemW    = Math.round(S * 0.11)
  const stemX0   = Math.round(S * 0.60)
  const stemX1   = stemX0 + stemW
  const stemY0   = pad
  const stemY1   = S - pad
  const bowlCx   = Math.round(S * 0.42)
  const bowlCy   = Math.round(S * 0.62)
  const bowlOR   = Math.round(S * 0.20)
  const bowlIR   = Math.round(S * 0.11)

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const idx = (y * S + x) * 4
      const inBg = insideRoundedRect(x, y, S, S, bgR)
      if (!inBg) {
        // Transparent outside the rounded square
        buf[idx] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0; buf[idx + 3] = 0
        continue
      }
      const inStem = insideRect(x, y, stemX0, stemY0, stemX1, stemY1)
      const inBowl = insideCircleRing(x, y, bowlCx, bowlCy, bowlOR, bowlIR)
      const inMark = inStem || inBowl
      const c = inMark ? WHITE : PURPLE
      buf[idx] = c.r; buf[idx + 1] = c.g; buf[idx + 2] = c.b; buf[idx + 3] = 255
    }
  }

  // 2×2 box downsample S×S → N×N
  const out = Buffer.alloc(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const si = ((y * 2 + dy) * S + (x * 2 + dx)) * 4
          r += buf[si]; g += buf[si + 1]; b += buf[si + 2]; a += buf[si + 3]
        }
      }
      const oi = (y * N + x) * 4
      out[oi]     = (r >> 2)
      out[oi + 1] = (g >> 2)
      out[oi + 2] = (b >> 2)
      out[oi + 3] = (a >> 2)
    }
  }
  return out
}

// ── PNG encoder ────────────────────────────────────────────────────────────
// Minimal PNG writer for RGBA (color type 6), 8-bit, no interlace, filter=0.

// CRC-32 table (bit-reversed polynomial 0xEDB88320)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(rgba, width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width,  0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8]  = 8    // bit depth
  ihdr[9]  = 6    // color type: RGBA
  ihdr[10] = 0    // compression
  ihdr[11] = 0    // filter
  ihdr[12] = 0    // interlace

  // Prepend filter byte (0 = None) to each scanline
  const stride = width * 4
  const filtered = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0
    rgba.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idatData = zlib.deflateSync(filtered, { level: 9 })

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── ICO wrapper (single PNG entry at size W×H) ─────────────────────────────
function encodeICO(pngBuf, size) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)       // reserved
  dir.writeUInt16LE(1, 2)       // type: 1 = icon
  dir.writeUInt16LE(1, 4)       // count

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size  // width  (0 = 256)
  entry[1] = size >= 256 ? 0 : size  // height (0 = 256)
  entry[2] = 0                       // colors in palette (0 = no palette)
  entry[3] = 0                       // reserved
  entry.writeUInt16LE(1, 4)          // planes
  entry.writeUInt16LE(32, 6)         // bpp
  entry.writeUInt32LE(pngBuf.length, 8)
  entry.writeUInt32LE(6 + 16, 12)    // offset (directory + this entry)

  return Buffer.concat([dir, entry, pngBuf])
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  const publicDir = path.join(process.cwd(), 'public')
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })

  const rgba192 = renderIcon(192)
  const png192  = encodePNG(rgba192, 192, 192)
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png192)
  console.log(`wrote public/icon-192.png  (${png192.length} bytes)`)

  const rgba32 = renderIcon(32)
  const png32  = encodePNG(rgba32, 32, 32)
  const ico    = encodeICO(png32, 32)
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico)
  console.log(`wrote public/favicon.ico   (${ico.length} bytes)`)
}

main()
