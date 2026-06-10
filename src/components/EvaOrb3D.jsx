import React, { useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

function lerp(a, b, t) { return a + (b - a) * t }
function easeOutQuart(x) { return 1 - Math.pow(1 - x, 4) }

const PALETTE = {
  idle:      { core: '#00d4ff', emissive: '#003366', ring: '#00d4ff', distort: 0.22, speed: 1.6 },
  listening: { core: '#4dffa0', emissive: '#004422', ring: '#4dffa0', distort: 0.42, speed: 3.2 },
  speaking:  { core: '#a06aff', emissive: '#220055', ring: '#7c4dff', distort: 0.55, speed: 2.8 },
  loading:   { core: '#ffc840', emissive: '#441800', ring: '#ffc840', distort: 0.12, speed: 6.0 },
}

// ─── Particle shell: assembles from scattered points into a sphere ───────────

function ParticleShell({ statusRef, bootPhaseRef }) {
  const pointsRef   = useRef()
  const assemblyRef = useRef(0)
  const COUNT  = 2200
  const RADIUS = 1.55

  const { startPos, targetPos, buf } = useMemo(() => {
    const start  = new Float32Array(COUNT * 3)
    const target = new Float32Array(COUNT * 3)
    const b      = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      // Fibonacci sphere for even coverage
      const phi   = Math.acos(1 - 2 * (i + 0.5) / COUNT)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      const R     = RADIUS + (Math.random() - 0.5) * 0.18
      target[i*3]   = Math.sin(phi) * Math.cos(theta) * R
      target[i*3+1] = Math.cos(phi) * R
      target[i*3+2] = Math.sin(phi) * Math.sin(theta) * R
      // Start: scattered across a large sphere
      const dist = 7 + Math.random() * 9
      const sp   = Math.random() * Math.PI
      const st   = Math.random() * Math.PI * 2
      start[i*3]   = Math.sin(sp) * Math.cos(st) * dist
      start[i*3+1] = Math.cos(sp) * dist
      start[i*3+2] = Math.sin(sp) * Math.sin(st) * dist
      b[i*3] = start[i*3]; b[i*3+1] = start[i*3+1]; b[i*3+2] = start[i*3+2]
    }
    return { startPos: start, targetPos: target, buf: b }
  }, [])

  useFrame((state, dt) => {
    if (!pointsRef.current) return
    if (bootPhaseRef.current >= 1 && assemblyRef.current < 1) {
      assemblyRef.current = Math.min(1, assemblyRef.current + dt * 0.52)
    }
    const t    = easeOutQuart(assemblyRef.current)
    const time = state.clock.elapsedTime
    const s    = statusRef.current
    const dAmp = t * (s === 'listening' ? 0.07 : s === 'speaking' ? 0.045 : 0.018)
    const rotS = s === 'listening' ? 0.006 : s === 'speaking' ? 0.004 : 0.0014
    pointsRef.current.rotation.y += rotS * dt * 60
    pointsRef.current.rotation.x += rotS * 0.28 * dt * 60

    const arr = pointsRef.current.geometry.attributes.position.array
    for (let i = 0; i < COUNT; i++) {
      const tx = lerp(startPos[i*3],   targetPos[i*3],   t)
      const ty = lerp(startPos[i*3+1], targetPos[i*3+1], t)
      const tz = lerp(startPos[i*3+2], targetPos[i*3+2], t)
      arr[i*3]   = tx + Math.sin(time * 0.85 + i * 0.007) * dAmp
      arr[i*3+1] = ty + Math.cos(time * 0.65 + i * 0.011) * dAmp
      arr[i*3+2] = tz + Math.sin(time * 1.05 + i * 0.009) * dAmp
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true

    const mat = pointsRef.current.material
    if (mat) {
      if (s === 'speaking') {
        mat.opacity = 0.55 + Math.sin(time * 7.5) * 0.22
        mat.size    = 0.013 + Math.sin(time * 7.5) * 0.004
        mat.color.set('#b0a0ff')
      } else if (s === 'listening') {
        mat.opacity = 0.82
        mat.size    = 0.015
        mat.color.set('#4dffa0')
      } else {
        mat.opacity = 0.55 + Math.sin(time * 1.4) * 0.08
        mat.size    = 0.012
        mat.color.set('#00d4ff')
      }
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buf, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#00d4ff"
        size={0.012}
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}

// ─── Distort core sphere ─────────────────────────────────────────────────────

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
    mat.distort = THREE.MathUtils.lerp(mat.distort, p.distort, dt * 2.5)
    mat.speed   = THREE.MathUtils.lerp(mat.speed,   p.speed,   dt * 2.5)
  })
  return (
    <mesh>
      <sphereGeometry args={[1.05, 64, 64]} />
      <MeshDistortMaterial
        ref={matRef}
        color={PALETTE.idle.core}
        emissive={PALETTE.idle.emissive}
        emissiveIntensity={0.9}
        roughness={0.04}
        metalness={0.5}
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
      <sphereGeometry args={[1.38, 32, 32]} />
      <meshBasicMaterial color={PALETTE.idle.core} transparent opacity={0.05} side={THREE.BackSide} toneMapped={false} />
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
    const s = statusRef.current
    const mul = s === 'listening' ? 2.8 : s === 'speaking' ? 2.2 : 1
    ref.current.rotation.z += dt * dir * mul
  })
  return (
    <mesh ref={ref} rotation={[tiltX, 0, tiltZ]}>
      <torusGeometry args={[radius, tubeR, 6, 160]} />
      <meshBasicMaterial color={PALETTE.idle.ring} transparent opacity={0.5} toneMapped={false} />
    </mesh>
  )
}

function Sparks({ statusRef }) {
  const ref     = useRef()
  const angles  = useMemo(() => new Float32Array(80).map(() => Math.random() * Math.PI * 2), [])
  const phases  = useMemo(() => new Float32Array(80).map(() => Math.random() * Math.PI * 2), [])
  const latents = useMemo(() => new Float32Array(80).map(() => (Math.random() - 0.5) * Math.PI), [])
  const buf     = useMemo(() => new Float32Array(80 * 3), [])
  useFrame((state, dt) => {
    if (!ref.current) return
    const s   = statusRef.current
    const spd = s === 'loading' ? 3.2 : s === 'listening' ? 1.9 : s === 'speaking' ? 1.4 : 0.9
    for (let i = 0; i < 80; i++) {
      angles[i] += dt * spd * (0.6 + phases[i] * 0.15)
      const a = angles[i], l = latents[i], t = state.clock.elapsedTime
      const r = 1.62 + Math.sin(t * 1.8 + phases[i]) * 0.2
      buf[i*3]   = r * Math.cos(a) * Math.cos(l)
      buf[i*3+1] = r * Math.sin(l)
      buf[i*3+2] = r * Math.sin(a) * Math.cos(l)
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[buf, 3]} /></bufferGeometry>
      <pointsMaterial size={0.026} color="#00d4ff" transparent opacity={0.7} sizeAttenuation toneMapped={false} />
    </points>
  )
}

function Scene({ statusRef, bootPhaseRef }) {
  return (
    <>
      <ambientLight intensity={0.06} />
      <pointLight position={[4, 4, 5]}   intensity={2.8} color="#00d4ff" />
      <pointLight position={[-4, -3, 4]} intensity={1.2} color="#7c4dff" />
      <SphereCore   statusRef={statusRef} />
      <GlowShell    statusRef={statusRef} />
      <Ring radius={1.75} tubeR={0.005} tiltX={0}           tiltZ={0}          dir={0.42}  statusRef={statusRef} />
      <Ring radius={1.98} tubeR={0.004} tiltX={Math.PI/4}   tiltZ={0}          dir={-0.28} statusRef={statusRef} />
      <Ring radius={2.18} tubeR={0.004} tiltX={Math.PI/2}   tiltZ={Math.PI/5}  dir={0.18}  statusRef={statusRef} />
      <ParticleShell statusRef={statusRef} bootPhaseRef={bootPhaseRef} />
      <Sparks        statusRef={statusRef} />
      <EffectComposer>
        <Bloom luminanceThreshold={0} luminanceSmoothing={0.88} intensity={2.4} />
      </EffectComposer>
    </>
  )
}

export default function EvaOrb3D({ status, bootPhase = 0, mode = 'personal', onClick }) {
  const statusRef    = useRef(status)
  const bootPhaseRef = useRef(bootPhase)
  useEffect(() => { statusRef.current = status },    [status])
  useEffect(() => { bootPhaseRef.current = bootPhase }, [bootPhase])
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  return (
    <div style={{ width: 300, height: 300, cursor: 'pointer', flexShrink: 0 }} onClick={onClick}>
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 44 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.6]}
        style={{ background: 'transparent' }}
      >
        <Scene statusRef={statusRef} bootPhaseRef={bootPhaseRef} />
      </Canvas>
    </div>
  )
}
