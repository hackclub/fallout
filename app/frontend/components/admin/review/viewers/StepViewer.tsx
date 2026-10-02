import { useEffect, useState } from 'react'
import * as THREE from 'three'
import occtScriptUrl from 'occt-import-js/dist/occt-import-js.js?url'
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url'
import stepWorkerUrl from './stepWorker.ts?worker&url'
import { fetchRepoBuffer } from '@/lib/repoFetch'
import { ModelScene, PART_MATERIAL, ViewerSpinner } from './ModelViewer'

let worker: Promise<Worker> | null = null
let nextId = 0
const pending = new Map<number, { resolve: (m: StepWorkerMesh[]) => void; reject: (e: Error) => void }>()

// Classic workers must be same-origin. In development vite_ruby serves assets from another port, so
// the worker source is fetched (CORS-allowed), its root-relative importScripts() calls are pointed
// back at the Vite origin, and the result is booted from a Blob. Production is same-origin + bundled.
async function createWorker(): Promise<Worker> {
  const url = new URL(stepWorkerUrl, import.meta.url)
  if (url.origin === location.origin) return new Worker(url)
  url.searchParams.set('type', 'classic')
  const source = await (await fetch(url)).text()
  const absolute = source
    .replace(/\bexport\s*\{\s*\};?/g, '')
    .replace(/importScripts\(\s*(["'])\//g, (_, q: string) => `importScripts(${q}${url.origin}/`)
  return new Worker(URL.createObjectURL(new Blob([absolute], { type: 'text/javascript' })))
}

// One shared worker: OpenCascade's wasm is ~7 MB, so it's initialised once and reused across files.
function getWorker(): Promise<Worker> {
  if (worker) return worker
  worker = createWorker().then((w) => {
    w.onmessage = (e: MessageEvent<StepWorkerResponse>) => {
      const req = pending.get(e.data.id)
      if (!req) return
      pending.delete(e.data.id)
      if (e.data.ok) req.resolve(e.data.meshes)
      else req.reject(new Error(e.data.error))
    }
    w.onerror = (e) => {
      for (const req of pending.values()) req.reject(new Error(e.message || 'STEP worker crashed'))
      pending.clear()
      w.terminate()
      worker = null
    }
    // Absolute URLs: inside a Blob-booted worker, relative paths would resolve against blob:.
    const init: StepWorkerRequest = {
      type: 'init',
      scriptUrl: new URL(occtScriptUrl, import.meta.url).href,
      wasmUrl: new URL(occtWasmUrl, import.meta.url).href,
    }
    w.postMessage(init)
    return w
  })
  worker.catch(() => {
    worker = null
  })
  return worker
}

async function parseStep(buffer: ArrayBuffer): Promise<StepWorkerMesh[]> {
  const w = await getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const req: StepWorkerRequest = { type: 'parse', id, buffer }
    w.postMessage(req, [buffer])
  })
}

function buildGroup(meshes: StepWorkerMesh[]): THREE.Group {
  const group = new THREE.Group()
  for (const m of meshes) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(m.position, 3))
    if (m.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3))
    else geometry.computeVertexNormals()
    if (m.index) geometry.setIndex(new THREE.BufferAttribute(m.index, 1))
    const material = m.color ? PART_MATERIAL.clone() : PART_MATERIAL
    if (m.color) material.color = new THREE.Color(m.color[0], m.color[1], m.color[2])
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = m.name
    group.add(mesh)
  }
  return group
}

export default function StepViewer({ url, dark }: { url: string; dark: boolean }) {
  const [object, setObject] = useState<THREE.Group | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('Downloading…')

  useEffect(() => {
    let cancelled = false
    setObject(null)
    setError(null)
    setStage('Downloading…')
    fetchRepoBuffer(url)
      .then((buf) => {
        if (cancelled) return null
        setStage('Tessellating with OpenCascade…')
        return parseStep(buf.slice(0))
      })
      .then((meshes) => {
        if (cancelled || !meshes) return
        if (meshes.length === 0) throw new Error('No solids found in this STEP file')
        setObject(buildGroup(meshes))
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [url])

  if (error) return <p className="p-6 text-sm text-muted-foreground">Couldn't render this STEP file ({error}).</p>
  if (!object) return <ViewerSpinner label={stage} />
  return <ModelScene object={object} dark={dark} />
}
