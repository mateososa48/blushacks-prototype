'use client';
import dynamic from 'next/dynamic';
import { VideoPanel } from '@/components/VideoPanel';
import { useGeminiLive } from '@/lib/useGeminiLive';

// ssr: false prevents "window is not defined" crash — Three.js is browser-only
const EmotionCanvas = dynamic(() => import('@/components/EmotionCanvas'), { ssr: false });

export default function Page() {
  const { connected, error, emotionState, videoStream, audioStream, start, stop } =
    useGeminiLive();

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
          error={error}
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
