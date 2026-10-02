export type VideoSource =
  | { kind: 'file'; key: string; url: string; src: string; provider: string }
  | { kind: 'embed'; key: string; url: string; src: string; provider: string; vertical?: boolean }
  | { kind: 'link'; key: string; url: string; provider: string }

const VIDEO_FILE_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg)$/i
const YT_ID = /^[\w-]{11}$/

function parseStart(value: string | null): number | null {
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || !m[0]) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

function youtube(u: URL, host: string): VideoSource | null {
  let id: string | null = null
  let vertical = false
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] ?? null
  } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const [, first, second] = u.pathname.split('/')
    if (first === 'watch') id = u.searchParams.get('v')
    else if (first === 'shorts') {
      id = second ?? null
      vertical = true
    } else if (first === 'embed' || first === 'live' || first === 'v') id = second ?? null
  } else {
    return null
  }
  if (!id || !YT_ID.test(id)) return null
  const start = parseStart(u.searchParams.get('t') ?? u.searchParams.get('start'))
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' })
  if (start) params.set('start', String(start))
  return {
    kind: 'embed',
    key: `youtube:${id}`,
    url: u.href,
    src: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
    provider: 'YouTube',
    vertical,
  }
}

function vimeo(u: URL, host: string): VideoSource | null {
  if (!host.endsWith('vimeo.com')) return null
  const parts = u.pathname.split('/').filter(Boolean)
  const idx = parts.findIndex((p) => /^\d+$/.test(p))
  if (idx < 0) return null
  const id = parts[idx]
  const hash = u.searchParams.get('h') ?? (parts[idx + 1] && /^[\da-f]+$/i.test(parts[idx + 1]) ? parts[idx + 1] : null)
  const src = `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`
  return { kind: 'embed', key: `vimeo:${id}`, url: u.href, src, provider: 'Vimeo' }
}

function loom(u: URL, host: string): VideoSource | null {
  if (!host.endsWith('loom.com')) return null
  const m = u.pathname.match(/^\/(?:share|embed)\/([\da-f]+)/i)
  if (!m) return null
  return {
    kind: 'embed',
    key: `loom:${m[1]}`,
    url: u.href,
    src: `https://www.loom.com/embed/${m[1]}`,
    provider: 'Loom',
  }
}

function googleDrive(u: URL, host: string): VideoSource | null {
  if (host !== 'drive.google.com') return null
  const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id')
  if (!id) return null
  return {
    kind: 'embed',
    key: `drive:${id}`,
    url: u.href,
    src: `https://drive.google.com/file/d/${id}/preview`,
    provider: 'Google Drive',
  }
}

function streamable(u: URL, host: string): VideoSource | null {
  if (!host.endsWith('streamable.com')) return null
  const id = u.pathname.match(/^\/(?:e\/)?(\w+)/)?.[1]
  if (!id) return null
  return {
    kind: 'embed',
    key: `streamable:${id}`,
    url: u.href,
    src: `https://streamable.com/e/${id}`,
    provider: 'Streamable',
  }
}

const PARSERS = [youtube, vimeo, loom, googleDrive, streamable]

/** Resolves a demo URL to an embeddable player; `key` identifies the underlying video so duplicate links collapse. */
export function parseVideoUrl(raw: string): VideoSource | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '')

  for (const parse of PARSERS) {
    const source = parse(u, host)
    if (source) return source
  }

  const bare = `${host}${u.pathname.replace(/\/$/, '')}`
  if (VIDEO_FILE_EXT.test(u.pathname)) {
    return { kind: 'file', key: `file:${bare}${u.search}`, url: u.href, src: u.href, provider: host }
  }
  return { kind: 'link', key: `link:${bare}${u.search}`, url: u.href, provider: host }
}
