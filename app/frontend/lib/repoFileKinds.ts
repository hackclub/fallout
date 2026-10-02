// File classification for the in-review repo viewer. Every kind here renders in-browser.

export type RepoFileKind =
  | 'markdown'
  | 'code'
  | 'image'
  | 'csv'
  | 'pdf'
  | 'model'
  | 'step'
  | 'kicad'
  | 'gerber'
  | 'gerber_zip'
  | 'easyeda'
  | 'binary'

const MODEL = new Set(['stl', 'obj', 'gltf', 'glb', 'ply', '3mf'])
const STEP = new Set(['step', 'stp'])
const KICAD = new Set(['kicad_sch', 'kicad_pcb', 'kicad_pro'])
const EASYEDA = new Set(['epro', 'eproproject', 'esch', 'epcb'])
const GERBER = new Set([
  'gbr',
  'ger',
  'gtl',
  'gbl',
  'gts',
  'gbs',
  'gto',
  'gbo',
  'gtp',
  'gbp',
  'gm1',
  'gm2',
  'gko',
  'drl',
  'xln',
])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const CSV = new Set(['csv', 'tsv'])
const MARKDOWN = new Set(['md', 'markdown', 'mdx'])
const BINARY = new Set([
  'gz',
  'tar',
  '7z',
  'rar',
  'bin',
  'hex',
  'elf',
  'exe',
  'dll',
  'so',
  'uf2',
  'wasm',
  'f3d',
  'f3z',
  'sldprt',
  'sldasm',
  'ipt',
  'iam',
  'fcstd',
  'blend',
  'skp',
  '3dm',
  'mp4',
  'mov',
  'webm',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'psd',
  'ai',
  'sketch',
  'fig',
  'xlsx',
  'xls',
  'docx',
  'doc',
  'pptx',
  'kicad_sym',
  'kicad_mod',
  'kicad_dru',
  'kicad_wks',
  'lib',
  'dcm',
  'pretty',
])
const GERBER_ZIP_HINT = /gerber|gbr|fab|production|manufactur|jlc|pcbway|plot|cam/i

// highlight.js language by extension; unknown extensions fall back to auto-detect.
const CODE_LANG: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  php: 'php',
  lua: 'lua',
  dart: 'dart',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  ino: 'cpp',
  cs: 'csharp',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',
  env: 'bash',
  json: 'json',
  xml: 'xml',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  vue: 'xml',
  svelte: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  diff: 'diff',
  patch: 'diff',
  makefile: 'makefile',
  mk: 'makefile',
  cmake: 'cmake',
  dockerfile: 'dockerfile',
  txt: 'plaintext',
  log: 'plaintext',
  gcode: 'plaintext',
  nc: 'plaintext',
  scad: 'c',
}

export function fileName(path: string): string {
  return path.split('/').pop() ?? ''
}

export function fileExt(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : name.toLowerCase()
}

export function fileKind(path: string): RepoFileKind {
  const ext = fileExt(path)
  if (MARKDOWN.has(ext)) return 'markdown'
  if (IMAGE.has(ext)) return 'image'
  if (CSV.has(ext)) return 'csv'
  if (ext === 'pdf') return 'pdf'
  if (MODEL.has(ext)) return 'model'
  if (STEP.has(ext)) return 'step'
  if (KICAD.has(ext)) return 'kicad'
  if (EASYEDA.has(ext)) return 'easyeda'
  if (GERBER.has(ext)) return 'gerber'
  if (ext === 'zip') return GERBER_ZIP_HINT.test(path) ? 'gerber_zip' : 'binary'
  if (BINARY.has(ext)) return 'binary'
  return 'code'
}

export function codeLanguage(path: string): string | null {
  const name = fileName(path).toLowerCase()
  if (name === 'makefile' || name === 'dockerfile' || name === 'cmakelists.txt')
    return CODE_LANG[name.split('.')[0]] ?? null
  return CODE_LANG[fileExt(path)] ?? null
}

export const KIND_LABEL: Record<RepoFileKind, string> = {
  markdown: 'Markdown',
  code: 'Text',
  image: 'Image',
  csv: 'Table',
  pdf: 'PDF',
  model: '3D model',
  step: 'STEP model',
  kicad: 'KiCad',
  gerber: 'Gerber',
  gerber_zip: 'Gerber archive',
  easyeda: 'EasyEDA',
  binary: 'Binary',
}

export function isReadme(path: string): boolean {
  return /^readme(\.(md|markdown|mdx|txt))?$/i.test(fileName(path))
}

// "Pinned" view: the files a reviewer actually judges — READMEs, datasheets/zines, BOMs,
// and every CAD/PCB/Gerber source. Mirrors HURT's signal-file rule.
export function isSignalPath(path: string): boolean {
  const kind = fileKind(path)
  switch (kind) {
    case 'pdf':
    case 'csv':
    case 'kicad':
    case 'gerber':
    case 'gerber_zip':
    case 'model':
    case 'step':
    case 'easyeda':
      return true
    case 'markdown':
      return isReadme(path)
    default:
      return false
  }
}
