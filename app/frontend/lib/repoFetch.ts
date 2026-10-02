// Shared fetch cache for the repo viewer — every viewer reads raw.githubusercontent.com through here.

const LFS_POINTER = 'version https://git-lfs.github.com/spec'
const bufferCache = new Map<string, Promise<ArrayBuffer>>()

export function fetchRepoBuffer(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  let p = bufferCache.get(url)
  if (!p) {
    p = fetch(url, { signal }).then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return res.arrayBuffer()
    })
    bufferCache.set(url, p)
    p.catch(() => bufferCache.delete(url))
  }
  return p
}

export async function fetchRepoText(url: string, signal?: AbortSignal): Promise<string> {
  return new TextDecoder().decode(await fetchRepoBuffer(url, signal))
}

export function isLfsPointer(text: string): boolean {
  return text.startsWith(LFS_POINTER)
}

export function looksBinary(text: string): boolean {
  return text.includes('\u0000')
}
