'use client';
import { useRef, useEffect, useState } from 'react';

interface VideoPanelProps {
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  transcript: string;
  connected: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}

export function VideoPanel({
  videoStream,
  audioStream,
  transcript,
  connected,
  error,
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
      setMicLevel(Math.min(avg / 80, 1));
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
          className="w-full h-full object-cover scale-x-[-1]"
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
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm5.3 9c0 3-2.54 5.1-5.3 5.1S6.7 13 6.7 10H5c0 3.41 2.72 6.23 6 6.72V20h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
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
          <p className="text-white/60 text-sm leading-relaxed font-mono">{transcript}</p>
        ) : (
          <p className="text-white/20 text-sm font-mono italic">
            {connected ? 'listening...' : 'start a session to begin'}
          </p>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
          <p className="text-red-400 text-xs font-mono leading-relaxed">{error}</p>
        </div>
      )}

      {/* Start / Stop button */}
      <button
        onClick={connected ? onStop : handleStart}
        disabled={starting}
        className={[
          'w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200',
          connected
            ? 'bg-white/10 text-white/70 hover:bg-white/15 active:bg-white/5'
            : 'bg-[#4DD9AC] text-[#0A0A0F] hover:brightness-110 active:brightness-90',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        {starting ? 'Starting...' : connected ? 'Stop Session' : 'Start Session'}
      </button>
    </div>
  );
}
