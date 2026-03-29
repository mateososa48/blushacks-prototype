'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VERTEX_SHADER, FRAGMENT_SHADER } from '@/lib/shaders';
import { getEmotionConfig, computeShapeF } from '@/lib/emotionMap';
import type { EmotionState } from '@/lib/types';

const PARTICLE_COUNT = 8_000;

interface EmotionSceneProps {
  emotionState: EmotionState;
}

export function EmotionScene({ emotionState }: EmotionSceneProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);
  const currentColor = useRef(new THREE.Color('#BDC3C7'));
  const targetColor = useRef(new THREE.Color('#BDC3C7'));

  // Build buffer geometry with custom attributes once
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // Required dummy position attribute (actual positions computed in vertex shader)
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3),
    );

    const angles = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      angles[i] = Math.random() * Math.PI * 2;
      // sqrt for uniform disk distribution (avoids clustering at center)
      radii[i] = Math.sqrt(Math.random());
      phases[i] = Math.random() * Math.PI * 2;
    }

    geo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    geo.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    return geo;
  }, []);

  useFrame((state) => {
    if (!matRef.current) return;

    const config = getEmotionConfig(emotionState.emotion);
    const targetShapeF = computeShapeF(config.shapeF, emotionState.intensity);

    // Lerp all uniforms toward target (~800ms at 60fps with factor 0.02)
    targetColor.current.set(config.color);
    currentColor.current.lerp(targetColor.current, 0.02);

    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uColor.value.copy(currentColor.current);
    u.uShapeF.value += (targetShapeF - u.uShapeF.value) * 0.02;
    u.uSpeed.value += (config.speed - u.uSpeed.value) * 0.02;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        uniforms={{
          uTime:   { value: 0 },
          uColor:  { value: new THREE.Color('#BDC3C7') },
          uShapeF: { value: 0 },
          uSpeed:  { value: 0.2 },
        }}
      />
    </points>
  );
}
