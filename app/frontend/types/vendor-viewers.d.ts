/// <reference types="vite/client" />

declare module 'whats-that-gerber' {
  export interface GerberLayerInfo {
    type: string | null
    side: string | null
  }
  export default function whatsThatGerber(filenames: string[]): Record<string, GerberLayerInfo>
}

// occt-import-js is loaded into a classic worker via importScripts; this is the shape we use.
interface OcctMesh {
  name?: string
  color?: [number, number, number]
  attributes?: { position?: { array: ArrayLike<number> }; normal?: { array: ArrayLike<number> } }
  index?: { array: ArrayLike<number> }
}
interface OcctResult {
  success: boolean
  meshes?: OcctMesh[]
}
interface OcctInstance {
  ReadStepFile(buffer: Uint8Array, params?: Record<string, unknown> | null): OcctResult
}

// STEP worker protocol. Ambient (not exported) so stepWorker.ts stays import-free: any import makes
// Vite's dev transform append `export {}`, which a classic worker can't parse.
interface StepWorkerMesh {
  name: string
  color: [number, number, number] | null
  position: Float32Array
  normal: Float32Array | null
  index: Uint32Array | null
}

type StepWorkerRequest =
  | { type: 'init'; scriptUrl: string; wasmUrl: string }
  | { type: 'parse'; id: number; buffer: ArrayBuffer }
type StepWorkerResponse = { id: number; ok: true; meshes: StepWorkerMesh[] } | { id: number; ok: false; error: string }
