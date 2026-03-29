# FlowState — Design Spec
*Hackathon: BluShacks | Date: 2026-03-29*

## Problem

Communication between people with different neurological profiles is hard. Autistic individuals often struggle to decode others' emotions (and express their own) through conventional verbal/social cues. Existing tools either require verbal articulation or rely on neurotypical norms.

**FlowState** translates emotions into a real-time, rule-based visual art flow — a consistent visual language anyone can learn to read.

---

## Product Overview

A split-screen web app:
- **Left 1/3**: Live webcam feed + microphone activity + real-time speech transcript
- **Right 2/3**: A continuously evolving abstract art canvas driven by detected emotion

The art is always moving. Emotions change its color, shape, speed, and geometry — but the canvas never pauses or resets. It flows.

---

## Target Users

Primary: Autistic individuals (both helping them decode others' emotions and express their own non-verbally)
Secondary: Anyone who struggles with emotional expression or reading social cues

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| 3D/Visual | Three.js + React Three Fiber (R3F) |
| Animation | Custom GLSL shaders + R3F `useFrame` |
| Emotion AI | Gemini 2.5 Flash Live API |
| Connection | WebSocket (client-direct to Gemini) |
| Media | WebRTC `getUserMedia` (video + audio) |
| Deployment | Vercel (auto-deploy from GitHub) |

---

## Architecture

```
Browser (Next.js on Vercel)
├── VideoPanel (left 1/3)
│   ├── <video> element — getUserMedia webcam stream
│   ├── Mic level indicator (Web Audio API analyser)
│   └── Transcript box (rolling, latest text on top)
│
├── EmotionCanvas (right 2/3)
│   └── R3F <Canvas>
│       ├── EmotionScene
│       │   ├── Instanced particle mesh (50k particles)
│       │   ├── GLSL vertex shader (position morphing)
│       │   └── GLSL fragment shader (color + fluid distortion)
│       └── EmotionOverlay (text: current emotion + intensity)
│
└── useGeminiLive (hook — background WebSocket)
    ├── Input: 1fps JPEG frames (base64) + raw PCM 16kHz audio
    ├── Output: { emotion, intensity, secondaryEmotion?, transcript }
    └── Updates React state → drives EmotionCanvas + transcript
```

**API key handling**: `NEXT_PUBLIC_GEMINI_API_KEY` in Vercel environment variables. This is the intended pattern for browser-direct Gemini connections (analogous to Google Maps API keys).

---

## Emotion → Visual Mapping

8 core emotions, each with a distinct visual signature:

| Emotion | Primary Color | Shape Tendency | Movement | Shader |
|---------|--------------|----------------|----------|--------|
| calm | `#4DD9AC` teal | Large slow circles | Gentle undulation | Fluid wave |
| happy | `#FFD166` gold | Medium bubbles | Float upward | Bloom glow |
| excited | `#FF6B9D` pink | Fast spirals | Centrifugal scatter | Radial burst |
| sad | `#4A4E8F` indigo | Droplets | Slow falling | Rain blur |
| anxious | `#FF6348` orange | Small shards | Jitter/tremor | Edge distortion |
| angry | `#C0392B` crimson | Triangles/spikes | Explosive burst | Heat shimmer |
| focused | `#9B59B6` violet | Grid dots | Steady pulse | Grid ripple |
| neutral | `#BDC3C7` gray | Ambient drifters | Slow drift | Noise |

**Fluid ↔ Geometric transition rule**:
- `intensity < 0.4` → fully fluid (smooth, rounded)
- `intensity > 0.7` → fully geometric (hard edges, sharp)
- `0.4–0.7` → lerp between (live morphing)

**Transition duration**: 800ms interpolation on all properties (color, particle speed, shape factor) via `THREE.Color.lerp` + custom `lerp()` on float uniforms.

---

## Component File Structure

```
blushacks-prototype/
├── app/
│   ├── page.tsx                   # Root: session state, split layout
│   ├── layout.tsx                 # Font, global styles
│   └── globals.css
├── components/
│   ├── VideoPanel.tsx             # Webcam + mic bar + transcript
│   ├── EmotionCanvas.tsx          # R3F <Canvas> + camera/lights
│   └── EmotionScene.tsx           # Particles + shaders, reads emotion state
├── lib/
│   ├── useGeminiLive.ts           # WebSocket hook → emotion events
│   ├── audioCapture.ts            # getUserMedia audio → PCM chunks
│   ├── videoCapture.ts            # getUserMedia video → 1fps JPEG base64
│   └── emotionMap.ts              # emotion string → { color, speed, shapeF... }
├── shaders/
│   ├── emotion.vert               # Particle position morphing
│   └── emotion.frag               # Color + fluid distortion
├── .env.local                     # NEXT_PUBLIC_GEMINI_API_KEY=...
└── package.json
```

---

## UI Design

**Color**: Near-black background `#0A0A0F`, frosted glass panels (`backdrop-blur`, `bg-white/5`), no hard borders — soft shadows only.

**Typography**: Clean sans-serif (`Inter` or system). Transcript text small and muted. Emotion label large and prominent in the canvas corner.

**Layout**:
```
┌──────────────────────────────────────────────────────┐
│  FlowState                              [●] Live      │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│  ┌──────┐    │                                       │
│  │WEBCAM│    │         EMOTION CANVAS (R3F)          │
│  └──────┘    │                                       │
│              │   · ✦ · ≋≋≋ · ✦ · ≋≋≋≋≋ · ✦ ·       │
│  🎤 ██░░░    │                                       │
│              │   emotion: CALM       intensity: 0.3  │
│  ┌────────┐  │                                       │
│  │transcript│ │                                       │
│  └────────┘  │                                       │
│ [Start]      │                                       │
└──────────────┴───────────────────────────────────────┘
```

---

## Gemini Live API Details

**Model**: `gemini-2.5-flash-native-audio-preview-12-2025`
**Protocol**: WebSocket — `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`

**System prompt** (sent in `setup` message):
> "You are a real-time emotion detection system. Analyze the user's facial expression from video frames and voice tone from audio. Respond with JSON only: { emotion: string (calm|happy|excited|sad|anxious|angry|focused|neutral), intensity: number (0-1), secondaryEmotion: string|null, transcript: string }. Update continuously as the user's state changes."

**Input cadence**:
- Video: 1 JPEG frame/sec (canvas snapshot → base64)
- Audio: continuous PCM 16kHz chunks via AudioWorklet

**Response**: Parsed JSON emitted as React state updates

---

## Deployment Plan

1. GitHub public repo under user's account
2. Vercel: connect repo via Vercel dashboard → auto-deploy on `main` push
3. Environment variable `NEXT_PUBLIC_GEMINI_API_KEY` set in Vercel dashboard
4. Custom domain optional (Vercel default domain sufficient for hackathon)

---

## Verification / Testing Checklist

- [ ] Webcam feed renders in left panel on localhost
- [ ] Mic level bar animates with voice
- [ ] WebSocket connects to Gemini Live, session starts without error
- [ ] Emotion JSON parsed correctly from Gemini response
- [ ] Three.js canvas renders at 60fps (Chrome DevTools performance)
- [ ] Particles change color + speed when `emotionState` changes
- [ ] Fluid ↔ geometric morph works at high/low intensity
- [ ] Transcript updates in real time
- [ ] Vercel deploy succeeds, webcam works on HTTPS URL
- [ ] API key not exposed in page source (confirm NEXT_PUBLIC_ pattern is acceptable for Gemini)
