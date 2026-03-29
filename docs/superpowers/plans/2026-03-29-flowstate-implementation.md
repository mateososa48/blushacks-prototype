# FlowState Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a split-screen web app where Gemini 2.5 Flash Live analyzes webcam + mic in real time and drives a continuous GPU-accelerated particle art canvas that morphs based on emotion.

**Architecture:** Next.js 15 App Router (client-side only, no SSR for the interactive parts). Direct client WebSocket to Gemini Live API — no backend proxy needed. React Three Fiber renders an 8,000-particle Points mesh with a custom GLSL ShaderMaterial; uniforms (color, speed, shapeF) are lerped every frame toward the target emotion config.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Three.js, @react-three/fiber, @react-three/drei, Gemini 2.5 Flash Live API (raw WebSocket), WebRTC getUserMedia, Web Audio API

---

## File Map

```
blushacks-prototype/
├── app/
│   ├── layout.tsx                  CREATE — root layout, Inter font, dark bg
│   ├── page.tsx                    CREATE — split layout, wires VideoPanel + EmotionCanvas
│   └── globals.css                 CREATE — minimal resets
├── components/
│   ├── VideoPanel.tsx              CREATE — webcam video, mic level bar, transcript, start/stop btn
│   ├── EmotionCanvas.tsx           CREATE — R3F <Canvas> wrapper + emotion label overlay
│   └── EmotionScene.tsx            CREATE — 8k-particle Points mesh with shader, useFrame animation
├── lib/
│   ├── types.ts                    CREATE — EmotionType, EmotionState, EmotionConfig interfaces
│   ├── emotionMap.ts               CREATE — EMOTION_MAP constant + getEmotionConfig() + computeShapeF()
│   ├── parseEmotionResponse.ts     CREATE — parses raw Gemini text → EmotionState | null
│   ├── shaders.ts                  CREATE — VERTEX_SHADER + FRAGMENT_SHADER as TS string constants
│   ├── videoCapture.ts             CREATE — getUserMedia video → 1fps JPEG base64 callback
│   ├── audioCapture.ts             CREATE — getUserMedia audio → PCM 16kHz base64 chunks callback
│   └── useGeminiLive.ts            CREATE — WebSocket hook, orchestrates capture, emits emotionState
├── __tests__/
│   ├── emotionMap.test.ts          CREATE — unit tests for getEmotionConfig + computeShapeF
│   └── parseEmotionResponse.test.ts CREATE — unit tests for JSON parsing + edge cases
├── next.config.ts                  CREATE — transpilePackages: ['three']
├── .env.local                      CREATE — NEXT_PUBLIC_GEMINI_API_KEY=
└── package.json                    SCAFFOLD — via create-next-app
```

---

## Task 1: Project Scaffold

**Files:**
- Create: all files via `create-next-app` + manual installs

- [ ] **Step 1: Scaffold Next.js 15 project**

Run inside `/Users/mateososaalbrecht/blushacks-prototype`:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --import-alias "@/*" --yes
```
Expected: project files created, `npm run dev` works, shows default Next.js page.

- [ ] **Step 2: Install Three.js + R3F + testing**

```bash
npm install three @react-three/fiber @react-three/drei
npm install --save-dev @types/three vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Configure vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

Create `vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write next.config.ts**

Replace the generated `next.config.ts` entirely:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['three'],
};

export default nextConfig;
```

- [ ] **Step 5: Create .env.local**

```bash
echo "NEXT_PUBLIC_GEMINI_API_KEY=your_key_here" > .env.local
```
Replace `your_key_here` with your actual Gemini API key from https://aistudio.google.com/apikey.

- [ ] **Step 6: Create GitHub repo and push**

```bash
gh repo create blushacks-prototype --public --source=. --remote=origin --push
```
If `gh` is not installed: `brew install gh && gh auth login` first.

- [ ] **Step 7: Commit scaffold**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 + R3F + vitest"
git push
```

---

## Task 2: Types + Emotion Map

**Files:**
- Create: `lib/types.ts`
- Create: `lib/emotionMap.ts`
- Create: `__tests__/emotionMap.test.ts`

- [ ] **Step 1: Create lib/types.ts**

```typescript
export type EmotionType =
  | 'calm'
  | 'happy'
  | 'excited'
  | 'sad'
  | 'anxious'
  | 'angry'
  | 'focused'
  | 'neutral';

export interface EmotionState {
  emotion: EmotionType;
  intensity: number;       // 0–1
  secondaryEmotion: EmotionType | null;
  transcript: string;
}

export interface EmotionConfig {
  color: string;           // hex
  speed: number;           // base particle speed multiplier (0.1–2.0)
  shapeF: number;          // base shape factor (0=fluid, 1=geometric)
  label: string;
}
```

- [ ] **Step 2: Write failing tests for emotionMap**

Create `__tests__/emotionMap.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getEmotionConfig, computeShapeF } from '@/lib/emotionMap';

describe('getEmotionConfig', () => {
  it('returns correct color for calm', () => {
    expect(getEmotionConfig('calm').color).toBe('#4DD9AC');
  });

  it('returns neutral config for unknown emotion string', () => {
    expect(getEmotionConfig('unknown').label).toBe('Neutral');
  });

  it('returns correct speed for angry (high)', () => {
    expect(getEmotionConfig('angry').speed).toBeGreaterThan(1.0);
  });

  it('returns correct speed for calm (low)', () => {
    expect(getEmotionConfig('calm').speed).toBeLessThan(0.5);
  });
});

describe('computeShapeF', () => {
  it('returns near-zero for low intensity (fluid)', () => {
    expect(computeShapeF(0.5, 0.2)).toBeLessThan(0.3);
  });

  it('returns near-1 for high intensity with geometric emotion', () => {
    expect(computeShapeF(1.0, 0.9)).toBeGreaterThan(0.9);
  });

  it('clamps between 0 and 1', () => {
    const val = computeShapeF(1.0, 1.5);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npm test
```
Expected: FAIL — "Cannot find module '@/lib/emotionMap'"

- [ ] **Step 4: Create lib/emotionMap.ts**

```typescript
import type { EmotionType, EmotionConfig } from './types';

export const EMOTION_MAP: Record<EmotionType, EmotionConfig> = {
  calm:    { color: '#4DD9AC', speed: 0.15, shapeF: 0.0, label: 'Calm' },
  happy:   { color: '#FFD166', speed: 0.40, shapeF: 0.1, label: 'Happy' },
  excited: { color: '#FF6B9D', speed: 1.20, shapeF: 0.3, label: 'Excited' },
  sad:     { color: '#4A4E8F', speed: 0.10, shapeF: 0.1, label: 'Sad' },
  anxious: { color: '#FF6348', speed: 1.50, shapeF: 0.7, label: 'Anxious' },
  angry:   { color: '#C0392B', speed: 1.80, shapeF: 1.0, label: 'Angry' },
  focused: { color: '#9B59B6', speed: 0.50, shapeF: 0.6, label: 'Focused' },
  neutral: { color: '#BDC3C7', speed: 0.20, shapeF: 0.0, label: 'Neutral' },
};

export function getEmotionConfig(emotion: string): EmotionConfig {
  return EMOTION_MAP[emotion as EmotionType] ?? EMOTION_MAP.neutral;
}

/**
 * Applies the intensity-based fluid↔geometric transition rule.
 * intensity < 0.4  → scales shapeF down (more fluid)
 * intensity > 0.7  → scales shapeF up toward 1.0 (more geometric)
 * intensity 0.4–0.7 → returns baseShapeF as-is
 */
export function computeShapeF(baseShapeF: number, intensity: number): number {
  const clamped = Math.min(1, Math.max(0, intensity));
  if (clamped < 0.4) {
    return baseShapeF * (clamped / 0.4);
  }
  if (clamped > 0.7) {
    return baseShapeF + (1 - baseShapeF) * ((clamped - 0.7) / 0.3);
  }
  return baseShapeF;
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test
```
Expected: PASS — 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/emotionMap.ts __tests__/emotionMap.test.ts vitest.config.ts vitest.setup.ts package.json
git commit -m "feat: emotion types + map + computeShapeF"
git push
```

---

## Task 3: Parse Emotion Response

**Files:**
- Create: `lib/parseEmotionResponse.ts`
- Create: `__tests__/parseEmotionResponse.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/parseEmotionResponse.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseEmotionResponse } from '@/lib/parseEmotionResponse';

describe('parseEmotionResponse', () => {
  it('parses a valid emotion JSON string', () => {
    const result = parseEmotionResponse(
      '{"emotion":"calm","intensity":0.3,"secondaryEmotion":null,"transcript":"hello"}'
    );
    expect(result).toEqual({
      emotion: 'calm',
      intensity: 0.3,
      secondaryEmotion: null,
      transcript: 'hello',
    });
  });

  it('extracts JSON embedded in surrounding text', () => {
    const result = parseEmotionResponse(
      'Sure! {"emotion":"happy","intensity":0.7,"secondaryEmotion":"excited","transcript":"yes"} done.'
    );
    expect(result?.emotion).toBe('happy');
    expect(result?.intensity).toBe(0.7);
  });

  it('returns null for plain text with no JSON', () => {
    expect(parseEmotionResponse('I am analyzing...')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseEmotionResponse('{bad json}')).toBeNull();
  });

  it('clamps intensity to 0–1', () => {
    const result = parseEmotionResponse(
      '{"emotion":"angry","intensity":1.5,"secondaryEmotion":null,"transcript":""}'
    );
    expect(result?.intensity).toBe(1);
  });

  it('falls back to neutral for unknown emotion', () => {
    const result = parseEmotionResponse(
      '{"emotion":"bored","intensity":0.5,"secondaryEmotion":null,"transcript":""}'
    );
    expect(result?.emotion).toBe('neutral');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```
Expected: FAIL — "Cannot find module '@/lib/parseEmotionResponse'"

- [ ] **Step 3: Create lib/parseEmotionResponse.ts**

```typescript
import type { EmotionState, EmotionType } from './types';

const VALID_EMOTIONS: EmotionType[] = [
  'calm', 'happy', 'excited', 'sad', 'anxious', 'angry', 'focused', 'neutral',
];

function isEmotionType(s: unknown): s is EmotionType {
  return typeof s === 'string' && VALID_EMOTIONS.includes(s as EmotionType);
}

export function parseEmotionResponse(text: string): EmotionState | null {
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[0]);
    return {
      emotion: isEmotionType(raw.emotion) ? raw.emotion : 'neutral',
      intensity: typeof raw.intensity === 'number'
        ? Math.min(1, Math.max(0, raw.intensity))
        : 0.5,
      secondaryEmotion: isEmotionType(raw.secondaryEmotion) ? raw.secondaryEmotion : null,
      transcript: typeof raw.transcript === 'string' ? raw.transcript : '',
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```
Expected: PASS — all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/parseEmotionResponse.ts __tests__/parseEmotionResponse.test.ts
git commit -m "feat: parseEmotionResponse + full test coverage"
git push
```

---

## Task 4: GLSL Shaders

**Files:**
- Create: `lib/shaders.ts`

- [ ] **Step 1: Create lib/shaders.ts**

```typescript
export const VERTEX_SHADER = /* glsl */ `
  attribute float aAngle;
  attribute float aRadius;
  attribute float aPhase;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uShapeF;

  varying float vRadius;

  #define PI 3.14159265358979
  #define TAU 6.28318530717959

  void main() {
    float t = uTime * uSpeed + aPhase;

    // Radius with gentle pulsing
    float r = aRadius * 4.0 + sin(t * 0.5 + aPhase * 2.0) * 0.25;

    // Fluid angle: smooth continuous drift
    float fluidAngle = aAngle + t * 0.25 + sin(t * 0.18 + aPhase) * 0.5;

    // Geometric angle: snap to 3-fold symmetry (triangle)
    float snappedAngle = round(fluidAngle / (TAU / 3.0)) * (TAU / 3.0);

    float angle = mix(fluidAngle, snappedAngle, uShapeF);

    float x = r * cos(angle);
    float y = r * sin(angle);
    float z = sin(t * 0.35 + aPhase * 3.0) * 0.6;

    vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Larger near center, smaller at edges; perspective scale
    float baseSize = mix(6.0, 2.0, aRadius);
    gl_PointSize = baseSize * (250.0 / -mvPosition.z);

    vRadius = aRadius;
  }
`;

export const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;

  varying float vRadius;

  void main() {
    // Discard outside circle boundary
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;

    // Soft falloff: bright core, fading edge
    float alpha = (1.0 - smoothstep(0.15, 0.5, dist)) * mix(0.85, 0.25, vRadius);

    // Slightly brighter at particle center
    vec3 color = uColor * (1.0 + (0.5 - dist) * 0.5);

    gl_FragColor = vec4(color, alpha);
  }
`;
```

- [ ] **Step 2: Commit**

```bash
git add lib/shaders.ts
git commit -m "feat: GLSL shaders for emotion particles"
git push
```

---

## Task 5: Video Capture

**Files:**
- Create: `lib/videoCapture.ts`

- [ ] **Step 1: Create lib/videoCapture.ts**

```typescript
export class VideoCapture {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Starts webcam capture. Returns the MediaStream (for display in a <video> element). */
  async start(onFrame: (base64Jpeg: string) => void): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });

    this.videoEl = document.createElement('video');
    this.videoEl.srcObject = this.stream;
    this.videoEl.muted = true;
    this.videoEl.setAttribute('playsinline', '');
    await this.videoEl.play();

    // Send 1 frame per second to Gemini
    this.intervalId = setInterval(() => {
      if (!this.videoEl || this.videoEl.readyState < 2) return;
      this.ctx.drawImage(this.videoEl, 0, 0, 640, 480);
      const base64 = this.canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      onFrame(base64);
    }, 1000);

    return this.stream;
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.videoEl = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/videoCapture.ts
git commit -m "feat: VideoCapture — 1fps JPEG frames for Gemini"
git push
```

---

## Task 6: Audio Capture

**Files:**
- Create: `lib/audioCapture.ts`

- [ ] **Step 1: Create lib/audioCapture.ts**

```typescript
export class AudioCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  /** Starts microphone capture. Returns the MediaStream (for mic level meter). */
  async start(onChunk: (base64Pcm: string) => void): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      video: false,
    });

    // AudioContext at 16kHz for Gemini PCM input
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // ScriptProcessorNode: 4096 samples = ~256ms at 16kHz
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const floats = e.inputBuffer.getChannelData(0);
      // Convert float32 [-1, 1] → int16 PCM
      const pcm16 = new Int16Array(floats.length);
      for (let i = 0; i < floats.length; i++) {
        const s = Math.max(-1, Math.min(1, floats[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
      onChunk(base64);
    };

    this.source.connect(this.processor);
    // Must connect to destination to keep the audio graph alive (even though output is silent)
    this.processor.connect(this.audioContext.destination);

    return this.stream;
  }

  stop(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.audioContext?.close();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.audioContext = null;
    this.processor = null;
    this.source = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/audioCapture.ts
git commit -m "feat: AudioCapture — PCM 16kHz chunks for Gemini"
git push
```

---

## Task 7: Gemini Live WebSocket Hook

**Files:**
- Create: `lib/useGeminiLive.ts`

- [ ] **Step 1: Create lib/useGeminiLive.ts**

```typescript
'use client';
import { useState, useRef, useCallback } from 'react';
import type { EmotionState } from './types';
import { VideoCapture } from './videoCapture';
import { AudioCapture } from './audioCapture';
import { parseEmotionResponse } from './parseEmotionResponse';

const GEMINI_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

const SYSTEM_PROMPT =
  'You are a real-time emotion detection system. Analyze the user\'s facial expression from video frames and voice tone from audio. ' +
  'After analyzing each video frame, respond IMMEDIATELY with a single JSON object only (no markdown, no explanation): ' +
  '{"emotion":"<calm|happy|excited|sad|anxious|angry|focused|neutral>","intensity":<0.0-1.0>,"secondaryEmotion":"<emotion or null>","transcript":"<latest words spoken, empty string if silent>"}';

const DEFAULT_STATE: EmotionState = {
  emotion: 'neutral',
  intensity: 0.3,
  secondaryEmotion: null,
  transcript: '',
};

export function useGeminiLive() {
  const [connected, setConnected] = useState(false);
  const [emotionState, setEmotionState] = useState<EmotionState>(DEFAULT_STATE);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const videoCaptureRef = useRef<VideoCapture | null>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const textBufferRef = useRef<string>('');

  const sendMessage = useCallback((payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const start = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.error('NEXT_PUBLIC_GEMINI_API_KEY is not set');
      return;
    }

    // Open WebSocket
    const ws = new WebSocket(`${GEMINI_WS_URL}?key=${apiKey}`);
    wsRef.current = ws;
    textBufferRef.current = '';

    ws.onopen = () => {
      // Send setup message
      ws.send(JSON.stringify({
        setup: {
          model: MODEL,
          generationConfig: {
            responseModalities: ['TEXT'],
            temperature: 0.1,
          },
          systemInstruction: {
            role: 'user',
            parts: [{ text: SYSTEM_PROMPT }],
          },
        },
      }));
    };

    ws.onmessage = async (event) => {
      let data: Record<string, unknown>;
      try {
        const text = event.data instanceof Blob
          ? await event.data.text()
          : event.data;
        data = JSON.parse(text);
      } catch {
        return;
      }

      // Session ready — start media capture
      if (data.setupComplete !== undefined) {
        setConnected(true);

        const videoCapture = new VideoCapture();
        videoCaptureRef.current = videoCapture;
        const vStream = await videoCapture.start((base64Jpeg) => {
          sendMessage({
            realtimeInput: {
              mediaChunks: [{ mimeType: 'image/jpeg', data: base64Jpeg }],
            },
          });
        });
        setVideoStream(vStream);

        const audioCapture = new AudioCapture();
        audioCaptureRef.current = audioCapture;
        const aStream = await audioCapture.start((base64Pcm) => {
          sendMessage({
            realtimeInput: {
              mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: base64Pcm }],
            },
          });
        });
        setAudioStream(aStream);
        return;
      }

      // Accumulate model text
      const parts = (data as any)?.serverContent?.modelTurn?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part.text === 'string') {
            textBufferRef.current += part.text;
          }
        }
      }

      // Parse when Gemini finishes its turn
      const turnComplete = (data as any)?.serverContent?.turnComplete;
      if (turnComplete === true) {
        const parsed = parseEmotionResponse(textBufferRef.current);
        if (parsed) setEmotionState(parsed);
        textBufferRef.current = '';
      }
    };

    ws.onerror = (err) => {
      console.error('Gemini WebSocket error', err);
    };

    ws.onclose = () => {
      setConnected(false);
    };
  }, [sendMessage]);

  const stop = useCallback(() => {
    videoCaptureRef.current?.stop();
    audioCaptureRef.current?.stop();
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setVideoStream(null);
    setAudioStream(null);
    setEmotionState(DEFAULT_STATE);
  }, []);

  return { connected, emotionState, videoStream, audioStream, start, stop };
}
```

- [ ] **Step 2: Manual smoke test (browser)**

At this point `npm run dev` should compile without errors. Open Chrome DevTools console. The hook won't run until the UI is wired (Task 11), but check for TypeScript errors with:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/useGeminiLive.ts
git commit -m "feat: useGeminiLive WebSocket hook with video+audio capture"
git push
```

---

## Task 8: EmotionScene (R3F Particles)

**Files:**
- Create: `components/EmotionScene.tsx`

- [ ] **Step 1: Create components/EmotionScene.tsx**

```typescript
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

    // Lerp all uniforms toward target (0.02 ≈ 800ms at 60fps)
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
```

- [ ] **Step 2: Commit**

```bash
git add components/EmotionScene.tsx
git commit -m "feat: EmotionScene — 8k instanced particles with GLSL shader"
git push
```

---

## Task 9: EmotionCanvas (R3F Canvas Wrapper)

**Files:**
- Create: `components/EmotionCanvas.tsx`

- [ ] **Step 1: Create components/EmotionCanvas.tsx**

Note: This component is exported as `default` (not named) so that Next.js `dynamic()` can SSR-disable it. Three.js requires `window` — without `ssr: false` in page.tsx the Vercel build will crash.

```typescript
'use client';
import { Canvas } from '@react-three/fiber';
import { EmotionScene } from './EmotionScene';
import { getEmotionConfig } from '@/lib/emotionMap';
import type { EmotionState } from '@/lib/types';

interface EmotionCanvasProps {
  emotionState: EmotionState;
}

export function EmotionCanvas({ emotionState }: EmotionCanvasProps) {
  const config = getEmotionConfig(emotionState.emotion);

  return (
    <div className="relative w-full h-full">
      {/* Three.js canvas fills the entire panel */}
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        style={{ background: '#0A0A0F' }}
        gl={{ antialias: true, alpha: false }}
      >
        <EmotionScene emotionState={emotionState} />
      </Canvas>

      {/* Emotion label overlay — bottom-left */}
      <div className="absolute bottom-6 left-6 pointer-events-none select-none">
        <div
          className="text-[10px] uppercase tracking-[0.2em] font-mono mb-1 opacity-50"
          style={{ color: config.color }}
        >
          emotion
        </div>
        <div
          className="text-3xl font-semibold tracking-wide mb-2"
          style={{ color: config.color }}
        >
          {config.label}
        </div>

        {/* Intensity bar */}
        <div className="flex items-center gap-3">
          <div className="h-[3px] w-28 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.round(emotionState.intensity * 100)}%`,
                background: config.color,
              }}
            />
          </div>
          <span className="text-[10px] font-mono opacity-30 text-white">
            {Math.round(emotionState.intensity * 100)}%
          </span>
        </div>
      </div>

      {/* Secondary emotion badge — bottom-right */}
      {emotionState.secondaryEmotion && (
        <div className="absolute bottom-6 right-6 pointer-events-none select-none text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] font-mono opacity-30 text-white mb-1">
            also
          </div>
          <div className="text-sm font-medium opacity-50" style={{ color: getEmotionConfig(emotionState.secondaryEmotion).color }}>
            {getEmotionConfig(emotionState.secondaryEmotion).label}
          </div>
        </div>
      )}
    </div>
  );
}

export default EmotionCanvas;
```

- [ ] **Step 2: Commit**

```bash
git add components/EmotionCanvas.tsx
git commit -m "feat: EmotionCanvas wrapper with emotion label overlay"
git push
```

---

## Task 10: VideoPanel

**Files:**
- Create: `components/VideoPanel.tsx`

- [ ] **Step 1: Create components/VideoPanel.tsx**

```typescript
'use client';
import { useRef, useEffect, useState } from 'react';

interface VideoPanelProps {
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  transcript: string;
  connected: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function VideoPanel({
  videoStream,
  audioStream,
  transcript,
  connected,
  onStart,
  onStop,
}: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [starting, setStarting] = useState(false);

  // Attach video stream to <video> element
  useEffect(() => {
    if (!videoRef.current) return;
    if (videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.srcObject = null;
    }
  }, [videoStream]);

  // Mic level meter using Web Audio AnalyserNode
  useEffect(() => {
    if (!audioStream) {
      setMicLevel(0);
      return;
    }

    let animId: number;
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = audioCtx.createMediaStreamSource(audioStream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length;
      setMicLevel(Math.min(avg / 80, 1)); // 80 ≈ comfortable talking level
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
      audioCtx.close();
    };
  }, [audioStream]);

  const handleStart = async () => {
    setStarting(true);
    await onStart();
    setStarting(false);
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Webcam */}
      <div className="relative rounded-xl overflow-hidden bg-white/5 aspect-video w-full flex-shrink-0">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover scale-x-[-1]" // mirror effect
        />
        {!videoStream && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/20 text-sm font-mono">no camera</div>
          </div>
        )}
      </div>

      {/* Mic level bar */}
      <div className="flex items-center gap-2 px-1">
        <svg className="w-4 h-4 text-white/30 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm5.3 9c0 3-2.54 5.1-5.3 5.1S6.7 13 6.7 10H5c0 3.41 2.72 6.23 6 6.72V20h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
        </svg>
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{
              width: `${micLevel * 100}%`,
              background: micLevel > 0.8 ? '#FF6348' : '#4DD9AC',
            }}
          />
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 rounded-xl bg-white/5 p-3 overflow-y-auto min-h-0">
        <div className="text-[10px] uppercase tracking-widest font-mono text-white/30 mb-2">
          transcript
        </div>
        {transcript ? (
          <p className="text-white/60 text-sm leading-relaxed font-mono">
            {transcript}
          </p>
        ) : (
          <p className="text-white/20 text-sm font-mono italic">
            {connected ? 'listening...' : 'start a session to begin'}
          </p>
        )}
      </div>

      {/* Start / Stop button */}
      <button
        onClick={connected ? onStop : handleStart}
        disabled={starting}
        className={`
          w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200
          ${connected
            ? 'bg-white/10 text-white/70 hover:bg-white/15 active:bg-white/5'
            : 'bg-[#4DD9AC] text-[#0A0A0F] hover:brightness-110 active:brightness-90'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {starting ? 'Starting...' : connected ? 'Stop Session' : 'Start Session'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/VideoPanel.tsx
git commit -m "feat: VideoPanel — webcam, mic level meter, transcript"
git push
```

---

## Task 11: Page Layout (Wire Everything)

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace app/globals.css**

```css
@import "tailwindcss";

* {
  box-sizing: border-box;
}

html, body {
  height: 100%;
  overflow: hidden;
  background: #0A0A0F;
}
```

- [ ] **Step 2: Replace app/layout.tsx**

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FlowState',
  description: 'Real-time emotion visualization',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0A0A0F] text-white`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Replace app/page.tsx**

```typescript
'use client';
import dynamic from 'next/dynamic';
import { VideoPanel } from '@/components/VideoPanel';
import { useGeminiLive } from '@/lib/useGeminiLive';

// ssr: false prevents "window is not defined" crash — Three.js is browser-only
const EmotionCanvas = dynamic(() => import('@/components/EmotionCanvas'), { ssr: false });

export default function Page() {
  const { connected, emotionState, videoStream, audioStream, start, stop } = useGeminiLive();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center px-5 z-10 bg-gradient-to-b from-black/40 to-transparent pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#4DD9AC] opacity-80" />
          <span className="text-sm font-semibold tracking-wider text-white/70 uppercase">
            FlowState
          </span>
        </div>
        {connected && (
          <div className="ml-auto flex items-center gap-1.5 pointer-events-auto">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4DD9AC] animate-pulse" />
            <span className="text-[11px] font-mono text-[#4DD9AC]/70 uppercase tracking-widest">
              Live
            </span>
          </div>
        )}
      </div>

      {/* Left panel — 1/3 */}
      <div
        className="w-1/3 flex-shrink-0 h-full pt-14 border-r border-white/5"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <VideoPanel
          videoStream={videoStream}
          audioStream={audioStream}
          transcript={emotionState.transcript}
          connected={connected}
          onStart={start}
          onStop={stop}
        />
      </div>

      {/* Right panel — 2/3 */}
      <div className="flex-1 h-full">
        <EmotionCanvas emotionState={emotionState} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors (or only minor unused-variable warnings).

- [ ] **Step 5: Run dev server and manually verify**

```bash
npm run dev
```

Open http://localhost:3000. Check:
- [ ] Page loads without white-screen crash
- [ ] Split layout renders (left 1/3 / right 2/3)
- [ ] "Start Session" button is visible
- [ ] Right panel shows dark background (Three.js canvas)
- [ ] Click "Start Session" → browser asks for camera + mic permission
- [ ] After allowing: webcam appears in left panel (mirrored)
- [ ] Mic level bar animates when speaking
- [ ] "Live" indicator appears in header
- [ ] After ~2–5s: particles appear and start moving on the canvas
- [ ] After ~5–10s: emotion label changes from "Neutral" based on detected emotion
- [ ] Speaking excitedly changes color/speed; being quiet returns to calm

- [ ] **Step 6: Run all tests**

```bash
npm test
```
Expected: all 13 tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css app/layout.tsx app/page.tsx
git commit -m "feat: page layout — wire VideoPanel + EmotionCanvas + useGeminiLive"
git push
```

---

## Task 12: Vercel Deploy

- [ ] **Step 1: Go to vercel.com**

Navigate to https://vercel.com → "Add New Project" → "Import Git Repository".

- [ ] **Step 2: Select your repo**

Find `blushacks-prototype` in the list and click Import.

- [ ] **Step 3: Add environment variable**

Before clicking Deploy, go to "Environment Variables" section:
- Key: `NEXT_PUBLIC_GEMINI_API_KEY`
- Value: your Gemini API key
- Environments: Production, Preview, Development (all three)

Click "Add".

- [ ] **Step 4: Deploy**

Click "Deploy". Wait ~2 minutes. Vercel will build and deploy automatically.

- [ ] **Step 5: Verify live deployment**

Open the Vercel URL (e.g., `blushacks-prototype.vercel.app`).
- [ ] Page loads over HTTPS
- [ ] "Start Session" → browser asks camera + mic permission (HTTPS required — ✓)
- [ ] Full flow works same as localhost

- [ ] **Step 6: Any future push to `main` auto-deploys**

```bash
# Future deployments happen automatically — just push:
git push
```

---

## Verification Checklist

From the spec:
- [ ] Webcam feed renders in left panel on localhost
- [ ] Mic level bar animates with voice
- [ ] WebSocket connects to Gemini Live, session starts without error (check DevTools Network tab → WS)
- [ ] Emotion JSON parsed correctly from Gemini response
- [ ] Three.js canvas renders at 60fps (Chrome DevTools → Performance → frame rate)
- [ ] Particles change color + speed when `emotionState` changes
- [ ] Fluid ↔ geometric morph: at high intensity (speak intensely) particles snap toward triangular; at low intensity they drift in circles
- [ ] Transcript updates in real time
- [ ] Vercel deploy succeeds, webcam works on HTTPS URL
