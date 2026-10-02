// Classic (non-module) worker: occt-import-js is a UMD/Emscripten bundle, so it's pulled in with
// importScripts and the wasm is located via the URL Vite hands us at init time.

const MESH_PARAMS = { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.003, angularDeflection: 0.5 }

const scope = self as unknown as {
  importScripts: (...urls: string[]) => void
  occtimportjs?: (opts: { locateFile: (path: string) => string }) => Promise<OcctInstance>
  postMessage: (msg: StepWorkerResponse, transfer?: Transferable[]) => void
  onmessage: ((e: MessageEvent<StepWorkerRequest>) => void) | null
}

let occt: Promise<OcctInstance> | null = null

function init(scriptUrl: string, wasmUrl: string) {
  if (occt) return occt
  occt = (async () => {
    scope.importScripts(scriptUrl)
    if (typeof scope.occtimportjs !== 'function') throw new Error('occt-import-js failed to load')
    return scope.occtimportjs({ locateFile: (p) => (p.endsWith('.wasm') ? wasmUrl : p) })
  })()
  return occt
}

scope.onmessage = async (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    init(msg.scriptUrl, msg.wasmUrl).catch(() => {})
    return
  }
  try {
    if (!occt) throw new Error('STEP worker not initialised')
    const instance = await occt
    const bytes = new Uint8Array(msg.buffer)
    let result: OcctResult
    try {
      result = instance.ReadStepFile(bytes, MESH_PARAMS)
    } catch {
      result = instance.ReadStepFile(bytes, null)
    }
    if (!result?.success) throw new Error('OpenCascade could not read this STEP file')

    const transfer: Transferable[] = []
    const meshes: StepWorkerMesh[] = (result.meshes ?? []).flatMap((m, i) => {
      const pos = m.attributes?.position?.array
      if (!pos || pos.length === 0) return []
      const position = pos instanceof Float32Array ? pos : new Float32Array(pos)
      const nrm = m.attributes?.normal?.array
      const normal = nrm ? (nrm instanceof Float32Array ? nrm : new Float32Array(nrm)) : null
      const idx = m.index?.array
      const index = idx ? (idx instanceof Uint32Array ? idx : new Uint32Array(idx)) : null
      transfer.push(position.buffer)
      if (normal) transfer.push(normal.buffer)
      if (index) transfer.push(index.buffer)
      return [
        { name: m.name || `Part ${i + 1}`, color: Array.isArray(m.color) ? m.color : null, position, normal, index },
      ]
    })
    scope.postMessage({ id: msg.id, ok: true, meshes }, transfer)
  } catch (err) {
    scope.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
