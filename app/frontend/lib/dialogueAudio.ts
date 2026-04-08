const AUDIO_BASE = '/dialogueaudio'
const LETTER_VOLUME = 0.1
const EFFECT_VOLUME = 0.7
const URL_VOLUME = 0.5

const LETTER_FILES = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
  'sh',
  'th',
  'space',
  'thonk1',
  'thonk2',
  'thonk3',
]

let audioContext: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
const urlBuffers = new Map<string, AudioBuffer>()
const activeSources = new Set<AudioBufferSourceNode>()
let preloadPromise: Promise<void> | null = null

function getContext(): AudioContext {
  if (!audioContext) audioContext = new AudioContext()
  return audioContext
}

async function decodeFile(ctx: AudioContext, name: string): Promise<void> {
  const response = await fetch(`${AUDIO_BASE}/${name}.wav`)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  buffers.set(name, audioBuffer)
}

export function preload(): Promise<void> {
  if (preloadPromise) return preloadPromise
  const ctx = getContext()
  preloadPromise = Promise.all(LETTER_FILES.map((name) => decodeFile(ctx, name))).then(() => {})
  return preloadPromise
}

function playBuffer(buffer: AudioBuffer, detuneCents: number, volume: number, onEnded?: () => void): void {
  const ctx = getContext()
  if (ctx.state === 'suspended') ctx.resume()

  const source = ctx.createBufferSource()
  const gainNode = ctx.createGain()
  source.buffer = buffer
  source.detune.value = detuneCents // pitch shift only — playbackRate stays 1.0 (no speed change)
  gainNode.gain.value = volume
  source.connect(gainNode)
  gainNode.connect(ctx.destination)
  activeSources.add(source)
  source.onended = () => {
    activeSources.delete(source)
    onEnded?.()
  }
  source.start()
}

export function playLetter(char: string, nextChar?: string): { consumed: number } {
  const lower = char.toLowerCase()
  const nextLower = nextChar?.toLowerCase()
  const detune = 3000 + (Math.random() - 0.5) * 400

  if (lower === 's' && nextLower === 'h') {
    const buf = buffers.get('sh')
    if (buf) playBuffer(buf, detune, LETTER_VOLUME)
    return { consumed: 2 }
  }
  if (lower === 't' && nextLower === 'h') {
    const buf = buffers.get('th')
    if (buf) playBuffer(buf, detune, LETTER_VOLUME)
    return { consumed: 2 }
  }

  if (/[a-z]/.test(lower)) {
    const buf = buffers.get(lower)
    if (buf) playBuffer(buf, detune, LETTER_VOLUME)
    return { consumed: 1 }
  }

  const spaceBuf = buffers.get('space')
  if (spaceBuf) playBuffer(spaceBuf, 3000, LETTER_VOLUME)
  return { consumed: 1 }
}

export function playThonk(): void {
  const index = Math.floor(Math.random() * 3) + 1
  const buf = buffers.get(`thonk${index}`)
  if (buf) playBuffer(buf, 1200, EFFECT_VOLUME) // 1 octave up
}

// Fetch, decode (cached), and play an arbitrary audio file with pitch shift only
export async function playUrl(
  url: string,
  detuneCents: number,
  onEnded?: () => void,
  volume: number = URL_VOLUME,
): Promise<void> {
  const ctx = getContext()
  if (ctx.state === 'suspended') ctx.resume()

  let buffer = urlBuffers.get(url)
  if (!buffer) {
    const res = await fetch(url)
    const ab = await res.arrayBuffer()
    buffer = await ctx.decodeAudioData(ab)
    urlBuffers.set(url, buffer)
  }

  playBuffer(buffer, detuneCents, volume, onEnded)
}

export function stopAll(): void {
  for (const source of activeSources) {
    try {
      source.stop()
    } catch {}
  }
  activeSources.clear()
}
