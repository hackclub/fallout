import { useState, useEffect, useRef, Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Center, Environment } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import * as THREE from 'three'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import bash from 'highlight.js/lib/languages/bash'
import yaml from 'highlight.js/lib/languages/yaml'
import ini from 'highlight.js/lib/languages/ini'
import sql from 'highlight.js/lib/languages/sql'
import makefile from 'highlight.js/lib/languages/makefile'
import markdownLang from 'highlight.js/lib/languages/markdown'
import lua from 'highlight.js/lib/languages/lua'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import { FileIcon, ExternalLinkIcon, DownloadIcon, Loader2Icon, XIcon } from 'lucide-react'
import { Button } from '@/components/admin/ui/button'

hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rb', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('go', go)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', cpp)
hljs.registerLanguage('h', cpp)
hljs.registerLanguage('java', java)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('zsh', bash)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('toml', ini)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('makefile', makefile)
hljs.registerLanguage('markdown', markdownLang)
hljs.registerLanguage('md', markdownLang)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('php', php)
hljs.registerLanguage('plaintext', plaintext)

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp']
const PDF_EXTENSIONS = ['pdf']
const CODE_EXTENSIONS = [
  'js',
  'ts',
  'tsx',
  'jsx',
  'json',
  'rb',
  'py',
  'rs',
  'go',
  'c',
  'cpp',
  'h',
  'hpp',
  'java',
  'kt',
  'swift',
  'sh',
  'bash',
  'zsh',
  'yml',
  'yaml',
  'toml',
  'ini',
  'cfg',
  'xml',
  'html',
  'css',
  'scss',
  'less',
  'sql',
  'graphql',
  'proto',
  'dockerfile',
  'cmake',
  'lua',
  'zig',
  'nim',
  'ex',
  'exs',
  'erl',
  'hs',
  'ml',
  'clj',
  'r',
  'jl',
  'pl',
  'pm',
  'php',
  'vue',
  'svelte',
  'astro',
]
const TEXT_FILES = [
  'license',
  'changelog',
  'contributing',
  'makefile',
  'dockerfile',
  'gemfile',
  'rakefile',
  'procfile',
  '.gitignore',
  '.gitkeep',
  '.env',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
  '.rubocop.yml',
]
const CSV_EXTENSIONS = ['csv']
const TEXT_EXTENSIONS = ['txt', 'log', 'env', 'lock']
const MARKDOWN_EXTENSIONS = ['md', 'mdx']
const MODEL_3D_EXTENSIONS = ['stl', 'obj', 'gltf', 'glb', 'ply', '3mf']
const STEP_EXTENSIONS = ['step', 'stp', 'iges', 'igs']
const GERBER_EXTENSIONS = ['gbr', 'gtl', 'gbl', 'gts', 'gbs', 'gto', 'gbo', 'gko', 'drl', 'gm1']
const KICAD_EXTENSIONS = ['kicad_pcb', 'kicad_sch', 'kicad_pro']

function getFileExtension(path: string): string {
  const name = path.split('/').pop() || ''
  const kicadMatch = name.match(/\.(kicad_\w+)$/)
  if (kicadMatch) return kicadMatch[1]
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return name.slice(dotIndex + 1).toLowerCase()
}

function getFileName(path: string): string {
  return path.split('/').pop() || path
}

type FileCategory =
  | 'image'
  | 'pdf'
  | 'code'
  | 'text'
  | 'csv'
  | 'markdown'
  | 'binary'
  | 'model3d'
  | 'step'
  | 'gerber'
  | 'kicad'

function categorizeFile(path: string): FileCategory {
  const ext = getFileExtension(path)
  const name = getFileName(path).toLowerCase()

  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (PDF_EXTENSIONS.includes(ext)) return 'pdf'
  if (MARKDOWN_EXTENSIONS.includes(ext)) return 'markdown'
  if (name === 'readme') return 'markdown'
  if (MODEL_3D_EXTENSIONS.includes(ext)) return 'model3d'
  if (STEP_EXTENSIONS.includes(ext)) return 'step'
  if (GERBER_EXTENSIONS.includes(ext)) return 'gerber'
  if (KICAD_EXTENSIONS.includes(ext)) return 'kicad'
  if (CSV_EXTENSIONS.includes(ext)) return 'csv'
  if (CODE_EXTENSIONS.includes(ext)) return 'code'
  if (TEXT_EXTENSIONS.includes(ext)) return 'text'
  if (TEXT_FILES.includes(name)) return 'text'
  return 'binary'
}

function getRawUrl(githubBase: string, branch: string, filePath: string): string {
  const match = githubBase.match(/github\.com\/([^/]+\/[^/]+)/)
  if (!match) return ''
  return `https://raw.githubusercontent.com/${match[1]}/${branch}/${filePath}`
}

function getGithubUrl(githubBase: string, branch: string, filePath: string): string {
  return `${githubBase}/blob/${branch}/${filePath}`
}

function useRawText(url: string) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(false)
    setContent(null)
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.text()
      })
      .then(setContent)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [url])

  return { content, error, loading }
}

// --- Preview components ---

function ImagePreview({ url }: { url: string }) {
  const [error, setError] = useState(false)
  if (error)
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Failed to load image</div>
    )
  return (
    <div className="flex items-center justify-center p-4 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] rounded">
      <img src={url} alt="Preview" className="max-w-full max-h-[60vh] object-contain" onError={() => setError(true)} />
    </div>
  )
}

function PdfPreview({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const response = await fetch(url)
        if (!response.ok) throw new Error()
        const buffer = await response.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
        if (cancelled) return
        setNumPages(pdf.numPages)
        const page = await pdf.getPage(currentPage)
        if (cancelled) return
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    render()
    return () => {
      cancelled = true
    }
  }, [url, currentPage])

  if (error) return <ErrorMessage />

  return (
    <div className="flex flex-col items-center gap-2">
      {loading && <LoadingSpinner />}
      <canvas
        ref={canvasRef}
        className="max-w-full rounded border border-border"
        style={{ display: loading ? 'none' : 'block' }}
      />
      {numPages > 1 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-2 py-0.5 rounded border border-border hover:bg-muted disabled:opacity-40"
          >
            ‹
          </button>
          <span>
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage === numPages}
            className="px-2 py-0.5 rounded border border-border hover:bg-muted disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}

function MarkdownPreview({ url }: { url: string }) {
  const { content, error, loading } = useRawText(url)

  if (loading) return <LoadingSpinner />
  if (error || content === null) return <ErrorMessage />
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none p-4 overflow-y-auto max-h-[60vh] [&_img]:max-w-full [&_img]:rounded [&_a]:text-blue-500 [&_a]:underline [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:rounded [&_code]:text-xs [&_table]:w-full [&_th]:text-left [&_th]:py-1 [&_td]:py-1 [&_tr]:border-b [&_tr]:border-border">
      <Markdown key={url} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content}
      </Markdown>
    </div>
  )
}

function CodePreview({ url, filePath }: { url: string; filePath: string }) {
  const { content: rawContent, error, loading } = useRawText(url)
  const codeRef = useRef<HTMLElement>(null)
  const ext = getFileExtension(filePath)

  const content = useMemo(() => {
    if (!rawContent) return null
    const lines = rawContent.split('\n')
    return lines.length > 500
      ? lines.slice(0, 500).join('\n') + `\n\n... (${lines.length - 500} more lines)`
      : rawContent
  }, [rawContent])

  useEffect(() => {
    if (content && codeRef.current) {
      const lang = hljs.getLanguage(ext) ? ext : 'plaintext'
      try {
        const result = hljs.highlight(content, { language: lang })
        codeRef.current.innerHTML = result.value
      } catch {
        codeRef.current.textContent = content
      }
    }
  }, [content, ext])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage />

  return (
    <div className="overflow-auto max-h-[60vh] rounded">
      <pre className="p-4 text-xs leading-relaxed font-mono m-0 bg-transparent">
        <code ref={codeRef} className="!bg-transparent" style={{ background: 'transparent' }} />
      </pre>
    </div>
  )
}

function StlModel({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)

  useEffect(() => {
    const loader = new STLLoader()
    loader.load(url, (geo) => {
      geo.computeVertexNormals()
      geo.center()
      const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) geo.scale(2 / maxDim, 2 / maxDim, 2 / maxDim)
      setGeometry(geo)
    })
  }, [url])

  if (!geometry) return null
  return (
    <Center>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#8b9dc3" metalness={0.3} roughness={0.6} />
      </mesh>
    </Center>
  )
}

function ObjModel({ url }: { url: string }) {
  const [obj, setObj] = useState<THREE.Group | null>(null)

  useEffect(() => {
    const loader = new OBJLoader()
    loader.load(url, (group) => {
      const box = new THREE.Box3().setFromObject(group)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) group.scale.setScalar(2 / maxDim)
      group.position.sub(center.multiplyScalar(2 / maxDim))
      setObj(group)
    })
  }, [url])

  if (!obj) return null
  return <primitive object={obj} />
}

function GltfModel({ url }: { url: string }) {
  const [scene, setScene] = useState<THREE.Group | null>(null)

  useEffect(() => {
    const loader = new GLTFLoader()
    loader.load(url, (gltf) => {
      const group = gltf.scene
      const box = new THREE.Box3().setFromObject(group)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) group.scale.setScalar(2 / maxDim)
      group.position.sub(center.multiplyScalar(2 / maxDim))
      setScene(group)
    })
  }, [url])

  if (!scene) return null
  return <primitive object={scene} />
}

function PlyModel({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)

  useEffect(() => {
    const loader = new PLYLoader()
    loader.load(url, (geo) => {
      geo.computeVertexNormals()
      geo.center()
      const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) geo.scale(2 / maxDim, 2 / maxDim, 2 / maxDim)
      setGeometry(geo)
    })
  }, [url])

  if (!geometry) return null
  return (
    <Center>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#8b9dc3"
          metalness={0.3}
          roughness={0.6}
          vertexColors={geometry.hasAttribute('color')}
        />
      </mesh>
    </Center>
  )
}

function ThreeMfModel({ url }: { url: string }) {
  const [object, setObject] = useState<THREE.Group | null>(null)

  useEffect(() => {
    const loader = new ThreeMFLoader()
    loader.load(url, (group) => {
      const box = new THREE.Box3().setFromObject(group)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) group.scale.setScalar(2 / maxDim)
      group.position.sub(center.multiplyScalar(2 / maxDim))
      setObject(group)
    })
  }, [url])

  if (!object) return null
  return <primitive object={object} />
}

function StepModel({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const occtImportJs = await import('occt-import-js')
        const initFn =
          typeof occtImportJs === 'function'
            ? occtImportJs
            : (occtImportJs as { default: (opts: unknown) => Promise<unknown> }).default
        const occt = (await initFn({ locateFile: () => '/occt-import-js.wasm' })) as {
          ReadStepFile: (
            data: Uint8Array,
            opts: null,
          ) => {
            success: boolean
            meshes: { attributes: { position: { array: number[] } }; index?: { array: number[] } }[]
          }
        }
        const response = await fetch(url)
        if (!response.ok) throw new Error()
        const buffer = await response.arrayBuffer()
        const result = occt.ReadStepFile(new Uint8Array(buffer), null)
        if (!result.success || result.meshes.length === 0) {
          setLoadError(true)
          return
        }
        const mergedGeo = new THREE.BufferGeometry()
        const positions: number[] = []
        const indices: number[] = []
        let offset = 0
        for (const mesh of result.meshes) {
          for (let i = 0; i < mesh.attributes.position.array.length; i++) {
            positions.push(mesh.attributes.position.array[i])
          }
          if (mesh.index) {
            for (let i = 0; i < mesh.index.array.length; i++) {
              indices.push(mesh.index.array[i] + offset)
            }
          }
          offset += mesh.attributes.position.array.length / 3
        }
        mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        if (indices.length > 0) mergedGeo.setIndex(indices)
        mergedGeo.computeVertexNormals()
        mergedGeo.center()
        const box = new THREE.Box3().setFromBufferAttribute(mergedGeo.attributes.position as THREE.BufferAttribute)
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        if (maxDim > 0) mergedGeo.scale(2 / maxDim, 2 / maxDim, 2 / maxDim)
        if (!cancelled) setGeometry(mergedGeo)
      } catch {
        if (!cancelled) setLoadError(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [url])

  if (loadError) return null
  if (!geometry) return null
  return (
    <Center>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#a0aec0" metalness={0.4} roughness={0.5} />
      </mesh>
    </Center>
  )
}

function Model3dPreview({ url, filePath }: { url: string; filePath: string }) {
  const ext = getFileExtension(filePath)
  const [loadError, setLoadError] = useState(false)

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
        <p>Failed to load 3D model.</p>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer" download>
            <DownloadIcon className="size-3.5 mr-1" />
            Download
          </a>
        </Button>
      </div>
    )
  }

  return (
    <div className="h-[60vh] rounded overflow-hidden border border-border">
      <Canvas camera={{ position: [3, 3, 3], fov: 50 }} onError={() => setLoadError(true)}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <directionalLight position={[-3, -3, 2]} intensity={0.3} />
        <Suspense fallback={null}>
          <Environment preset="studio" />
          {ext === 'stl' && <StlModel url={url} />}
          {ext === 'obj' && <ObjModel url={url} />}
          {(ext === 'gltf' || ext === 'glb') && <GltfModel url={url} />}
          {ext === 'ply' && <PlyModel url={url} />}
          {ext === '3mf' && <ThreeMfModel url={url} />}
          {STEP_EXTENSIONS.includes(ext) && <StepModel url={url} />}
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.1} />
        <gridHelper args={[10, 10, '#444', '#333']} />
      </Canvas>
      <div className="text-[10px] text-muted-foreground text-center py-1">Drag to rotate · Scroll to zoom</div>
    </div>
  )
}

function GerberPreview({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
      <p>Gerber preview requires opening the file directly.</p>
      <Button variant="outline" size="sm" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer" download>
          <DownloadIcon className="size-3.5 mr-1" />
          Download
        </a>
      </Button>
    </div>
  )
}

function CsvPreview({ url }: { url: string }) {
  const { content, error, loading } = useRawText(url)

  const rows = useMemo(() => {
    if (!content) return []
    return content
      .trim()
      .split('\n')
      .slice(0, 200)
      .map((line) => {
        // Simple CSV parse: handle quoted fields
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') {
            inQuotes = !inQuotes
          } else if (ch === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += ch
          }
        }
        result.push(current.trim())
        return result
      })
  }, [content])

  if (loading) return <LoadingSpinner />
  if (error || !content) return <ErrorMessage />
  if (rows.length === 0) return <div className="text-xs text-muted-foreground p-4">Empty file</div>

  const headers = rows[0]
  const dataRows = rows.slice(1)

  return (
    <div className="overflow-auto max-h-[60vh] text-xs">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-2 py-1.5 font-medium border-b border-border whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              {headers.map((_, ci) => (
                <td key={ci} className="px-2 py-1 text-muted-foreground">
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {content.trim().split('\n').length > 200 && (
        <p className="text-[10px] text-muted-foreground text-center py-2">Showing first 200 rows</p>
      )}
    </div>
  )
}

function BinaryPlaceholder({ filePath, size, rawUrl }: { filePath: string; size?: number | null; rawUrl: string }) {
  const ext = getFileExtension(filePath)
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
      <div className="size-12 rounded-lg bg-muted/50 flex items-center justify-center">
        {ext ? <span className="text-sm font-mono font-bold">.{ext}</span> : <FileIcon className="size-6" />}
      </div>
      <div className="text-center text-xs">
        <p className="font-medium text-foreground">{getFileName(filePath)}</p>
        {size != null && <p className="mt-1">{formatFileSize(size)}</p>}
        <p className="mt-1">No preview available.</p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <a href={rawUrl} target="_blank" rel="noopener noreferrer" download>
          <DownloadIcon className="size-3.5 mr-1" />
          Download
        </a>
      </Button>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function ErrorMessage() {
  return <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Failed to load file</div>
}

function GerberZipPreview({ filePath, gerberZipFilesPath }: { filePath: string; gerberZipFilesPath: string }) {
  const [stackup, setStackup] = useState<{ top: string; bottom: string } | null>(null)
  const [side, setSide] = useState<'top' | 'bottom'>('top')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch(`${gerberZipFilesPath}?path=${encodeURIComponent(filePath)}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json() as Promise<{ top?: string; bottom?: string; error?: string }>
      })
      .then((data) => {
        if (data.error || !data.top) throw new Error()
        setStackup({ top: data.top, bottom: data.bottom ?? data.top })
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [filePath, gerberZipFilesPath])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage />
  if (!stackup) return <ErrorMessage />

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 px-1">
        {(['top', 'bottom'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`text-[10px] px-3 py-0.5 rounded border transition-colors capitalize ${side === s ? 'bg-muted border-border font-medium' : 'border-transparent hover:bg-muted/50 text-muted-foreground'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="overflow-auto max-h-[60vh] flex items-center justify-center p-4 bg-black rounded">
        <div
          className="[&_svg]:max-w-full [&_svg]:max-h-[55vh] [&_svg]:w-auto [&_svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: side === 'top' ? stackup.top : stackup.bottom }}
        />
      </div>
    </div>
  )
}

function KiCadPreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const script = document.getElementById('kicanvas-script')
    if (script) {
      setLoaded(true)
      return
    }
    const el = document.createElement('script')
    el.id = 'kicanvas-script'
    el.type = 'module'
    el.src = 'https://kicanvas.org/kicanvas/kicanvas.js'
    el.onload = () => setLoaded(true)
    el.onerror = () => setError(true)
    document.head.appendChild(el)
  }, [])

  if (error)
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
        <p>KiCanvas failed to load.</p>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer" download>
            <DownloadIcon className="size-3.5 mr-1" />
            Download
          </a>
        </Button>
      </div>
    )

  if (!loaded) return <LoadingSpinner />

  return (
    <div ref={containerRef} className="h-[60vh] rounded overflow-hidden border border-border bg-background">
      {/* @ts-expect-error kicanvas custom element */}
      <kicanvas-embed src={url} controls="full" style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export default function FilePreviewPanel({
  filePath,
  fileSize,
  githubBase,
  branch,
  gerberZipFilesPath,
  onClose,
}: {
  filePath: string
  fileSize?: number | null
  githubBase: string
  branch: string
  gerberZipFilesPath?: string
  onClose: () => void
}) {
  const category = categorizeFile(filePath)
  const rawUrl = getRawUrl(githubBase, branch, filePath)
  const githubUrl = getGithubUrl(githubBase, branch, filePath)
  const fileName = getFileName(filePath)
  const folderPath = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : null

  function renderPreview() {
    switch (category) {
      case 'image':
        return <ImagePreview url={rawUrl} />
      case 'pdf':
        return <PdfPreview url={rawUrl} />
      case 'markdown':
        return <MarkdownPreview url={rawUrl} />
      case 'code':
      case 'text':
        return <CodePreview url={rawUrl} filePath={filePath} />
      case 'kicad':
        return <KiCadPreview url={rawUrl} />
      case 'model3d':
      case 'step':
        return <Model3dPreview url={rawUrl} filePath={filePath} />
      case 'csv':
        return <CsvPreview url={rawUrl} />
      case 'gerber':
        return <GerberPreview url={rawUrl} />
      default:
        if (getFileExtension(filePath) === 'zip' && gerberZipFilesPath)
          return <GerberZipPreview filePath={filePath} gerberZipFilesPath={gerberZipFilesPath} />
        return <BinaryPlaceholder filePath={filePath} size={fileSize} rawUrl={rawUrl} />
    }
  }

  return (
    <div className="flex flex-col h-full border-l border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{fileName}</p>
          {folderPath && <p className="text-[10px] text-muted-foreground truncate font-mono">{folderPath}/</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {fileSize != null && <span className="text-[10px] text-muted-foreground">{formatFileSize(fileSize)}</span>}
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" title="Open on GitHub">
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={rawUrl} target="_blank" rel="noopener noreferrer" download title="Download">
              <DownloadIcon className="size-3.5" />
            </a>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close preview">
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-2">{renderPreview()}</div>
    </div>
  )
}
