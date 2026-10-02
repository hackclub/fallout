// Minimal ZIP reader for browser-side archives (Gerber bundles). Walks the central directory
// and inflates deflate entries with the native DecompressionStream — no library needed.

export interface ZipEntry {
  name: string
  size: number
  read: () => Promise<Uint8Array>
}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

export function listZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const entries: ZipEntry[] = []

  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return entries

  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)

  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== CENTRAL) break
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLen = view.getUint16(cursor + 28, true)
    const extraLen = view.getUint16(cursor + 30, true)
    const commentLen = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen))
    cursor += 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/') || (method !== 0 && method !== 8)) continue

    entries.push({
      name,
      size,
      read: async () => {
        const localNameLen = view.getUint16(localOffset + 26, true)
        const localExtraLen = view.getUint16(localOffset + 28, true)
        const start = localOffset + 30 + localNameLen + localExtraLen
        const raw = bytes.subarray(start, start + compressedSize)
        if (method === 0) return raw
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
        return new Uint8Array(await new Response(stream).arrayBuffer())
      },
    })
  }
  return entries
}
