import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js'
import { LoaderIcon } from 'lucide-react'
import { fileExt } from '@/lib/repoFileKinds'

export const PART_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, metalness: 0.1, roughness: 0.55 })

async function loadObject(url: string, path: string): Promise<THREE.Object3D> {
  switch (fileExt(path)) {
    case 'stl': {
      const geometry = await new STLLoader().loadAsync(url)
      geometry.computeVertexNormals()
      return new THREE.Mesh(geometry, PART_MATERIAL)
    }
    case 'ply': {
      const geometry = await new PLYLoader().loadAsync(url)
      geometry.computeVertexNormals()
      return new THREE.Mesh(geometry, PART_MATERIAL)
    }
    case 'obj':
      return new OBJLoader().loadAsync(url)
    case '3mf':
      return new ThreeMFLoader().loadAsync(url)
    default: {
      const gltf = await new GLTFLoader().loadAsync(url)
      return gltf.scene
    }
  }
}

export function ViewerSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <LoaderIcon className="size-5 animate-spin" />
      {label && <p className="text-xs">{label}</p>}
    </div>
  )
}

/** Shared lit scene with orbit controls, used by every 3D kind (mesh formats and STEP). */
export function ModelScene({ object, dark }: { object: THREE.Object3D; dark: boolean }) {
  return (
    <Canvas
      camera={{ position: [3, 2.5, 3], fov: 45 }}
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true }} // lets reviewers right-click → copy/save the rendered view
      className="h-full w-full"
    >
      <color attach="background" args={[dark ? '#18181b' : '#f4f4f5']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 5]} intensity={1.1} />
      <directionalLight position={[-5, 3, -5]} intensity={0.4} />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.3}>
          <Center>
            <primitive object={object} />
          </Center>
        </Bounds>
      </Suspense>
      <Grid
        infiniteGrid
        fadeDistance={40}
        cellColor={dark ? '#3f3f46' : '#d4d4d8'}
        sectionColor={dark ? '#52525b' : '#a1a1aa'}
        position={[0, -0.001, 0]}
      />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}

export default function ModelViewer({ url, path, dark }: { url: string; path: string; dark: boolean }) {
  const [object, setObject] = useState<THREE.Object3D | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setObject(null)
    setError(null)
    loadObject(url, path).then(
      (obj) => !cancelled && setObject(obj),
      (e: Error) => !cancelled && setError(e.message || 'Failed to load model'),
    )
    return () => {
      cancelled = true
    }
  }, [url, path])

  if (error) return <p className="p-6 text-sm text-muted-foreground">Couldn't render this model ({error}).</p>
  if (!object) return <ViewerSpinner />
  return <ModelScene object={object} dark={dark} />
}
