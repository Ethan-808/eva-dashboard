import React, { useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

const PALETTE = {
  idle:      { core: '#00d4ff', emissive: '#004488', ring: '#00d4ff', spark: '#00d4ff', distort: 0.22, speed: 1.6 },
  listening: { core: '#4dffa0', emissive: '#004422', ring: '#4dffa0', spark: '#4dffa0', distort: 0.42, speed: 3.2 },
  speaking:  { core: '#a06aff', emissive: '#220055', ring: '#7c4dff', spark: '#a06aff', distort: 0.55, speed: 2.8 },
  loading:   { core: '#ffc840', emissive: '#441800', ring: '#ffc840', spark: '#ffc840', distort: 0.12, speed: 6.0 },
}

function BackgroundDust() {
  const ref = useRef()
  const positions = useMemo(() => {
    const arr = new Float32Array(500 * 3)
    for (let i = 0; i < 500; i++) {
      const r = 4 + Math.random() * 14
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi) - 6
    }
    return arr
  }, [])

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.018
      ref.current.rotation.x += dt * 0.006
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.012} color="#00d4ff" opacity={0.28} transparent sizeAttenuation />
    </points>
  )
}

function SphereCore({ statusRef }) {
  const matRef = useRef()
  const col = useRef(new THREE.Color(PALETTE.idle.core))
  const tgt = useRef(new THREE.Color(PALETTE.idle.core))

  useFrame((_, dt) => {
    const mat = matRef.current
    if (!mat) return
    const p = PALETTE[statusRef.current] || PALETTE.idle
    tgt.current.set(p.core)
    col.current.lerp(tgt.current, dt * 5)
    mat.color.copy(col.current)
    mat.emissive.set(p.emissive)
    mat.distort  = THREE.MathUtils.lerp(mat.distort,  p.distort, dt * 2.5)
    mat.speed    = THREE.MathUtils.lerp(mat.speed,    p.speed,   dt * 2.5)
  })

  return (
    <mesh>
      <sphereGeometry args={[1.1, 64, 64]} />
      <MeshDistortMaterial
        ref={matRef}
        color={PALETTE.idle.core}
        emissive={PALETTE.idle.emissive}
        emissiveIntensity={0.8}
        roughness={0.05}
        metalness={0.4}
        distort={0.22}
        speed={1.6}
        toneMapped={false}
      />
    </mesh>
  )
}

function GlowShell({ statusRef }) {
  const ref = useRef()
  const col = useRef(new THREE.Color(PALETTE.idle.core))
  const tgt = useRef(new THREE.Color(PALETTE.idle.core))

  useFrame((state, dt) => {
    if (!ref.current) return
    const p = PALETTE[statusRef.current] || PALETTE.idle
    tgt.current.set(p.core)
    col.current.lerp(tgt.current, dt * 5)
    ref.current.material.color.copy(col.current)
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.04
    ref.current.scale.setScalar(pulse)
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1.45, 32, 32]} />
      <meshBasicMaterial
        color={PALETTE.idle.core}
        transparent
        opacity={0.045}
        side={THREE.BackSide}
        toneMapped={false}
      />
    </mesh>
  )
}

function Ring({ radius, tubeR, tiltX, tiltZ, dir, statusRef }) {
  const ref = useRef()
  const col = useRef(new THREE.Color(PALETTE.idle.ring))
  const tgt = useRef(new THREE.Color(PALETTE.idle.ring))

  useFrame((_, dt) => {
    if (!ref.current) return
    const p = PALETTE[statusRef.current] || PALETTE.idle
    tgt.current.set(p.ring)
    col.current.lerp(tgt.current, dt * 5)
    ref.current.material.color.copy(col.current)
    ref.current.rotation.z += dt * dir
  })

  return (
    <mesh ref={ref} rotation={[tiltX, 0, tiltZ]}>
      <torusGeometry args={[radius, tubeR, 6, 160]} />
      <meshBasicMaterial color={PALETTE.idle.ring} transparent opacity={0.55} toneMapped={false} />
    </mesh>
  )
}

function Sparks({ statusRef }) {
  const ref = useRef()
  const angles  = useMemo(() => new Float32Array(80).map(() => Math.random() * Math.PI * 2), [])
  const phases  = useMemo(() => new Float32Array(80).map(() => Math.random() * Math.PI * 2), [])
  const latents = useMemo(() => new Float32Array(80).map(() => (Math.random() - 0.5) * Math.PI), [])
  const buf     = useMemo(() => new Float32Array(80 * 3), [])

  useFrame((state, dt) => {
    if (!ref.current) return
    const s = statusRef.current
    const spd = s === 'loading' ? 3.2 : s === 'listening' ? 1.9 : s === 'speaking' ? 1.4 : 0.9
    for (let i = 0; i < 80; i++) {
      angles[i] += dt * spd * (0.6 + phases[i] * 0.15)
      const a = angles[i]
      const l = latents[i]
      const t = state.clock.elapsedTime
      const r = 1.65 + Math.sin(t * 1.8 + phases[i]) * 0.22
      buf[i * 3]     = r * Math.cos(a) * Math.cos(l)
      buf[i * 3 + 1] = r * Math.sin(l)
      buf[i * 3 + 2] = r * Math.sin(a) * Math.cos(l)
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buf, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.028} color="#00d4ff" transparent opacity={0.75} sizeAttenuation toneMapped={false} />
    </points>
  )
}

function Scene({ statusRef }) {
  return (
    <>
      <BackgroundDust />
      <ambientLight intensity={0.08} />
      <pointLight position={[4, 4, 5]}  intensity={3}   color="#00d4ff" />
      <pointLight position={[-4, -3, 4]} intensity={1.5} color="#7c4dff" />
      <SphereCore   statusRef={statusRef} />
      <GlowShell    statusRef={statusRef} />
      <Ring radius={1.78} tubeR={0.005} tiltX={0}          tiltZ={0}           dir={0.42}  statusRef={statusRef} />
      <Ring radius={2.02} tubeR={0.004} tiltX={Math.PI/4}  tiltZ={0}           dir={-0.28} statusRef={statusRef} />
      <Ring radius={2.22} tubeR={0.004} tiltX={Math.PI/2}  tiltZ={Math.PI/5}   dir={0.18}  statusRef={statusRef} />
      <Sparks       statusRef={statusRef} />
      <EffectComposer>
        <Bloom luminanceThreshold={0} luminanceSmoothing={0.85} intensity={2.2} />
      </EffectComposer>
    </>
  )
}

export default function EvaOrb3D({ status, onClick }) {
  const statusRef = useRef(status)
  useEffect(() => { statusRef.current = status }, [status])

  return (
    <div
      style={{ width: 240, height: 240, cursor: 'pointer', flexShrink: 0 }}
      onClick={onClick}
    >
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 44 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <Scene statusRef={statusRef} />
      </Canvas>
    </div>
  )
}
