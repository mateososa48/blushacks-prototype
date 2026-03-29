'use client';
import { Canvas } from '@react-three/fiber';
import { EmotionScene } from './EmotionScene';
import { getEmotionConfig } from '@/lib/emotionMap';
import type { EmotionState } from '@/lib/types';

interface EmotionCanvasProps {
  emotionState: EmotionState;
}

function EmotionCanvas({ emotionState }: EmotionCanvasProps) {
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
          <div
            className="text-sm font-medium opacity-50"
            style={{ color: getEmotionConfig(emotionState.secondaryEmotion).color }}
          >
            {getEmotionConfig(emotionState.secondaryEmotion).label}
          </div>
        </div>
      )}
    </div>
  );
}

export default EmotionCanvas;
