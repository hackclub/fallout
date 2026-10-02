// Vendored from hackclub/hardware-unified-review-tool (src/utils). Pure parsing — keep edits minimal so it can be re-synced.
export type EasyEdaDocumentKind = 'schematic' | 'pcb' | 'library' | 'project' | 'unknown'

export interface EasyEdaJsonInspection {
  isEasyEda: boolean
  documentKind: EasyEdaDocumentKind
  topLevelKeys: string[]
  hints: string[]
}

export interface EasyEdaArchiveEntryInspection {
  name: string
  size: number
  compressedSize: number
  compression: 'stored' | 'deflate' | 'unsupported'
  isEasyEdaJson: boolean
  easyEdaDocumentKind: EasyEdaDocumentKind | null
}

export interface EasyEdaArchiveInspection {
  entries: EasyEdaArchiveEntryInspection[]
  skippedJsonEntries: number
  unsupportedEntries: number
}

export interface EasyEdaArchiveJsonDocument {
  name: string
  text: string
  value: unknown
  inspection: EasyEdaJsonInspection
}

interface ParsedJsonContent {
  value: unknown
  text: string
}

interface ZipEntry {
  name: string
  flags: number
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
  dataOffset: number
}

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_UTF8_FLAG = 0x0800
const ZIP_ENCRYPTED_FLAG = 0x0001
const MAX_ARCHIVE_JSON_SCAN_ENTRIES = 24
const MAX_ARCHIVE_JSON_SCAN_SIZE = 8 * 1024 * 1024

export function tryParseJsonContent(content: ArrayBuffer): ParsedJsonContent | null {
  const bytes = new Uint8Array(content)
  let cursor = 0

  while (cursor < bytes.length) {
    if (isWhitespaceByte(bytes[cursor])) {
      cursor += 1
      continue
    }

    // Some non-zip EasyEDA Pro files include a UTF-8 BOM prefix.
    if (
      cursor + 2 < bytes.length &&
      bytes[cursor] === 0xef &&
      bytes[cursor + 1] === 0xbb &&
      bytes[cursor + 2] === 0xbf
    ) {
      cursor += 3
      continue
    }

    break
  }

  if (cursor >= bytes.length) {
    return null
  }

  const firstToken = bytes[cursor]
  if (firstToken !== 0x7b && firstToken !== 0x5b) {
    return null
  }

  const text = new TextDecoder().decode(content)
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (trimmed.length === 0) {
    return null
  }

  try {
    return {
      value: JSON.parse(trimmed) as unknown,
      text: trimmed,
    }
  } catch {
    return null
  }
}

export function analyzeEasyEdaJson(value: unknown, filename: string): EasyEdaJsonInspection {
  const record = asRecord(value)
  const topLevelKeys = record ? Object.keys(record) : []
  const lowerKeys = new Set(topLevelKeys.map((key) => key.toLowerCase()))
  const hints: string[] = []
  const filenameLower = filename.toLowerCase()
  const baseName = filenameLower.split('/').pop() ?? filenameLower
  const isEsch = baseName.endsWith('.esch')
  const isEpcb = baseName.endsWith('.epcb')
  const isProProjectJson = baseName === 'project.json'
  const isProManifestJson = baseName === 'manifest.json'

  const head = asRecord(record?.head)
  if (head) {
    hints.push('head')
  }

  const hasCanvas = typeof record?.canvas === 'string' || typeof record?.canvas === 'object'
  if (hasCanvas) {
    hints.push('canvas')
  }

  const hasShape = Array.isArray(record?.shape) || typeof record?.shape === 'string'
  if (hasShape) {
    hints.push('shape')
  }

  if (lowerKeys.has('doctype') || typeof head?.docType !== 'undefined') {
    hints.push('docType')
  }

  if (lowerKeys.has('editorversion') || typeof head?.editorVersion === 'string') {
    hints.push('editorVersion')
  }

  const kindScores: Record<EasyEdaDocumentKind, number> = {
    schematic: 0,
    pcb: 0,
    library: 0,
    project: 0,
    unknown: 0,
  }

  if (
    hasAnyKey(lowerKeys, [
      'schematic',
      'schematics',
      'sheet',
      'sheets',
      'netlabel',
      'netlabels',
      'wires',
      'junctions',
    ]) ||
    /(?:^|[._-])(sch|schematic)(?:[._-]|$)/.test(filenameLower)
  ) {
    kindScores.schematic += 2
  }

  if (
    hasAnyKey(lowerKeys, [
      'pcb',
      'board',
      'boards',
      'layers',
      'routerrule',
      'tracks',
      'vias',
      'copperarea',
      'copperareas',
    ]) ||
    /(?:^|[._-])(pcb|board)(?:[._-]|$)/.test(filenameLower)
  ) {
    kindScores.pcb += 2
  }

  if (
    hasAnyKey(lowerKeys, [
      'library',
      'libraries',
      'lib',
      'symbol',
      'symbols',
      'footprint',
      'footprints',
      'packages',
      'components',
      'models',
    ]) ||
    /(?:^|[._-])(lib|library|symbol|footprint)(?:[._-]|$)/.test(filenameLower)
  ) {
    kindScores.library += 2
  }

  if (
    hasAnyKey(lowerKeys, ['project', 'documents', 'docs', 'schematics', 'pcbs']) ||
    /(?:^|[._-])(project|pro)(?:[._-]|$)/.test(filenameLower)
  ) {
    kindScores.project += 2
  }

  if (head && hasCanvas && hasShape) {
    kindScores.schematic += 1
    kindScores.pcb += 1
  }

  // EasyEDA Pro filename signatures (.esch / .epcb / project.json / manifest.json)
  if (isEsch) {
    kindScores.schematic += 4
    hints.push('epro:.esch')
  }
  if (isEpcb) {
    kindScores.pcb += 4
    hints.push('epro:.epcb')
  }
  if (isProProjectJson) {
    kindScores.project += 4
    hints.push('epro:project.json')
  }
  if (isProManifestJson) {
    kindScores.project += 3
    hints.push('epro:manifest.json')
  }

  const normalizedDocType = normalizeDocType(record, head)
  if (normalizedDocType === 'schematic') {
    kindScores.schematic += 2
  } else if (normalizedDocType === 'pcb') {
    kindScores.pcb += 2
  } else if (normalizedDocType === 'library') {
    kindScores.library += 2
  } else if (normalizedDocType === 'project') {
    kindScores.project += 2
  }

  const documentKind = selectBestDocumentKind(kindScores)
  const likelyByStructure = head !== null && hasCanvas && hasShape
  const likelyByKeywords =
    hasAnyKey(lowerKeys, [
      'canvas',
      'shape',
      'doctype',
      'editorversion',
      'routerrule',
      'layers',
      'schematics',
      'pcbs',
    ]) || /easyeda|(?:^|[._-])(sch|schematic|pcb|lib|project|epro)(?:[._-]|$)/.test(filenameLower)
  const likelyByProSignature = isEsch || isEpcb || isProProjectJson || isProManifestJson

  return {
    isEasyEda: likelyByStructure || likelyByKeywords || likelyByProSignature || documentKind !== 'unknown',
    documentKind,
    topLevelKeys,
    hints,
  }
}

export async function inspectEasyEdaArchive(content: ArrayBuffer): Promise<EasyEdaArchiveInspection> {
  const entries = parseZipEntries(content)
  const contentBytes = new Uint8Array(content)
  const entrySummaries: EasyEdaArchiveEntryInspection[] = []
  let unsupportedEntries = 0
  let skippedJsonEntries = 0

  const jsonCandidates = entries.filter((entry) => !entry.name.endsWith('/') && hasInspectableJsonExtension(entry.name))

  const rankedJsonCandidates = [...jsonCandidates].sort((a, b) => {
    return rankEasyEdaName(b.name) - rankEasyEdaName(a.name)
  })

  const selectedJsonCandidates = new Set(
    rankedJsonCandidates.slice(0, MAX_ARCHIVE_JSON_SCAN_ENTRIES).map((entry) => entry.localHeaderOffset),
  )

  for (const entry of entries) {
    const compression = mapCompressionMethod(entry.method)
    if (compression === 'unsupported') {
      unsupportedEntries += 1
    }

    let isEasyEdaJson = false
    let easyEdaDocumentKind: EasyEdaDocumentKind | null = null

    const shouldInspectJson =
      selectedJsonCandidates.has(entry.localHeaderOffset) && hasInspectableJsonExtension(entry.name)

    if (shouldInspectJson) {
      if (
        compression === 'unsupported' ||
        entry.uncompressedSize > MAX_ARCHIVE_JSON_SCAN_SIZE ||
        entry.uncompressedSize < 0
      ) {
        skippedJsonEntries += 1
      } else {
        try {
          const entryData = await extractZipEntryData(contentBytes, entry)
          const parsed = tryParseJsonContent(toArrayBuffer(entryData))
          if (parsed) {
            const inspection = analyzeEasyEdaJson(parsed.value, entry.name)
            isEasyEdaJson = inspection.isEasyEda
            easyEdaDocumentKind = inspection.isEasyEda ? inspection.documentKind : null
          }
        } catch {
          skippedJsonEntries += 1
        }
      }
    }

    entrySummaries.push({
      name: entry.name,
      size: entry.uncompressedSize,
      compressedSize: entry.compressedSize,
      compression,
      isEasyEdaJson,
      easyEdaDocumentKind,
    })
  }

  return {
    entries: entrySummaries,
    skippedJsonEntries,
    unsupportedEntries,
  }
}

export async function extractPrimaryEasyEdaArchiveJsonDocument(
  content: ArrayBuffer,
): Promise<EasyEdaArchiveJsonDocument | null> {
  const entries = parseZipEntries(content)
  const contentBytes = new Uint8Array(content)

  const jsonCandidates = entries
    .filter((entry) => !entry.name.endsWith('/') && hasInspectableJsonExtension(entry.name))
    .sort((a, b) => rankEasyEdaName(b.name) - rankEasyEdaName(a.name))
    .slice(0, MAX_ARCHIVE_JSON_SCAN_ENTRIES)

  let fallback: EasyEdaArchiveJsonDocument | null = null

  for (const entry of jsonCandidates) {
    const compression = mapCompressionMethod(entry.method)
    if (
      compression === 'unsupported' ||
      entry.uncompressedSize > MAX_ARCHIVE_JSON_SCAN_SIZE ||
      entry.uncompressedSize < 0
    ) {
      continue
    }

    try {
      const entryData = await extractZipEntryData(contentBytes, entry)
      const parsed = tryParseJsonContent(toArrayBuffer(entryData))
      if (!parsed) continue

      const inspection = analyzeEasyEdaJson(parsed.value, entry.name)
      const candidate: EasyEdaArchiveJsonDocument = {
        name: entry.name,
        text: parsed.text,
        value: parsed.value,
        inspection,
      }

      if (!fallback) {
        fallback = candidate
      }

      if (inspection.isEasyEda) {
        return candidate
      }
    } catch {
      // Ignore malformed archive entries and continue scanning.
    }
  }

  return fallback
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function hasAnyKey(keys: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => keys.has(candidate))
}

function selectBestDocumentKind(scores: Record<EasyEdaDocumentKind, number>): EasyEdaDocumentKind {
  const candidates: EasyEdaDocumentKind[] = ['project', 'pcb', 'schematic', 'library']
  let selected: EasyEdaDocumentKind = 'unknown'
  let bestScore = 0

  for (const kind of candidates) {
    const score = scores[kind]
    if (score > bestScore) {
      bestScore = score
      selected = kind
    }
  }

  return selected
}

function normalizeDocType(
  record: Record<string, unknown> | null,
  head: Record<string, unknown> | null,
): EasyEdaDocumentKind | null {
  const rawDocType = head?.docType ?? record?.docType
  if (typeof rawDocType !== 'string' && typeof rawDocType !== 'number') {
    return null
  }

  const normalized = String(rawDocType).toLowerCase()
  if (normalized.includes('schematic') || normalized === 'sch') {
    return 'schematic'
  }
  if (normalized.includes('pcb') || normalized.includes('board')) {
    return 'pcb'
  }
  if (normalized.includes('lib') || normalized.includes('symbol')) {
    return 'library'
  }
  if (normalized.includes('project') || normalized.includes('pro')) {
    return 'project'
  }
  return null
}

export type EasyEdaZipEntry = ZipEntry

export function parseEasyEdaZipEntries(content: ArrayBuffer): ZipEntry[] {
  return parseZipEntries(content)
}

export async function readEasyEdaZipEntry(archiveBytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  return extractZipEntryData(archiveBytes, entry)
}

function parseZipEntries(content: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(content)
  const view = new DataView(content)
  const eocdOffset = findEocdOffset(bytes, view)
  if (eocdOffset < 0) {
    throw new Error('Not a ZIP archive')
  }

  const entryCount = view.getUint16(eocdOffset + 10, true)
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true)
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)

  if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported')
  }

  if (centralDirectoryOffset + centralDirectorySize > bytes.length) {
    throw new Error('Invalid ZIP central directory')
  }

  const entries: ZipEntry[] = []
  let cursor = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length) {
      throw new Error('Invalid ZIP entry header')
    }

    const signature = view.getUint32(cursor, true)
    if (signature !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('Invalid ZIP central directory signature')
    }

    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const filenameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localHeaderOffset = view.getUint32(cursor + 42, true)

    const filenameStart = cursor + 46
    const filenameEnd = filenameStart + filenameLength
    if (filenameEnd > bytes.length) {
      throw new Error('Invalid ZIP filename range')
    }

    const name = decodeZipString(bytes.subarray(filenameStart, filenameEnd), (flags & ZIP_UTF8_FLAG) !== 0)
    const dataOffset = findLocalFileDataOffset(view, localHeaderOffset)

    entries.push({
      name,
      flags,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataOffset,
    })

    cursor = filenameEnd + extraLength + commentLength
  }

  return entries
}

function findEocdOffset(bytes: Uint8Array, view: DataView): number {
  const minimumEocdSize = 22
  if (bytes.length < minimumEocdSize) {
    return -1
  }

  const maxCommentLength = 0xffff
  const searchStart = Math.max(0, bytes.length - minimumEocdSize - maxCommentLength)

  for (let cursor = bytes.length - minimumEocdSize; cursor >= searchStart; cursor -= 1) {
    if (view.getUint32(cursor, true) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return cursor
    }
  }

  return -1
}

function findLocalFileDataOffset(view: DataView, localHeaderOffset: number): number {
  if (localHeaderOffset + 30 > view.byteLength) {
    throw new Error('Invalid ZIP local header offset')
  }

  const signature = view.getUint32(localHeaderOffset, true)
  if (signature !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('Invalid ZIP local file header')
  }

  const filenameLength = view.getUint16(localHeaderOffset + 26, true)
  const extraLength = view.getUint16(localHeaderOffset + 28, true)
  return localHeaderOffset + 30 + filenameLength + extraLength
}

function decodeZipString(bytes: Uint8Array, isUtf8: boolean): string {
  if (isUtf8) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

async function extractZipEntryData(archiveBytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if ((entry.flags & ZIP_ENCRYPTED_FLAG) !== 0) {
    throw new Error('Encrypted ZIP entries are not supported')
  }

  const start = entry.dataOffset
  const end = start + entry.compressedSize
  if (start < 0 || end > archiveBytes.length || end < start) {
    throw new Error('ZIP entry data range is invalid')
  }

  const compressed = archiveBytes.slice(start, end)

  if (entry.method === 0) {
    return compressed
  }

  if (entry.method === 8) {
    return inflateDeflateRaw(compressed)
  }

  throw new Error(`Unsupported ZIP compression method: ${entry.method}`)
}

async function inflateDeflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support ZIP decompression')
  }

  const stream = new Blob([toArrayBuffer(compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const decompressedBuffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(decompressedBuffer)
}

function mapCompressionMethod(method: number): 'stored' | 'deflate' | 'unsupported' {
  if (method === 0) return 'stored'
  if (method === 8) return 'deflate'
  return 'unsupported'
}

function rankEasyEdaName(name: string): number {
  const lower = name.toLowerCase()
  let score = 0
  if (lower.includes('easyeda')) score += 5
  if (lower.endsWith('.epcb')) score += 6
  if (lower.endsWith('.esch')) score += 6
  if (lower.endsWith('/project.json') || lower === 'project.json') score += 5
  if (lower.endsWith('/manifest.json') || lower === 'manifest.json') score += 4
  if (/(?:^|[/_-])(sch|schematic)(?:[._/-]|$)/.test(lower)) score += 4
  if (/(?:^|[/_-])(pcb|board)(?:[._/-]|$)/.test(lower)) score += 4
  if (/(?:^|[/_-])(lib|library|symbol|footprint)(?:[._/-]|$)/.test(lower)) score += 3
  if (/(?:^|[/_-])(project|pro)(?:[._/-]|$)/.test(lower)) score += 2
  return score
}

function hasInspectableJsonExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.json') || lower.endsWith('.esch') || lower.endsWith('.epcb')
}

function isWhitespaceByte(value: number): boolean {
  return value === 0x20 || value === 0x0a || value === 0x0d || value === 0x09
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
