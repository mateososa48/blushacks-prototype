'use client';
import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, type Session } from '@google/genai';
import type { EmotionState } from './types';
import { VideoCapture } from './videoCapture';
import { AudioCapture } from './audioCapture';
import { parseEmotionResponse } from './parseEmotionResponse';

const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const SYSTEM_PROMPT =
  "You are a real-time emotion detection system. Analyze the user's facial expression from video frames and voice tone from audio. " +
  'After each analysis, respond with a single JSON object only (no markdown, no explanation): ' +
  '{"emotion":"<calm|happy|excited|sad|anxious|angry|focused|neutral>","intensity":<0.0-1.0>,"secondaryEmotion":"<emotion or null>","transcript":"<latest words spoken, empty string if silent>"}';

const DEFAULT_STATE: EmotionState = {
  emotion: 'neutral',
  intensity: 0.3,
  secondaryEmotion: null,
  transcript: '',
};

export function useGeminiLive() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emotionState, setEmotionState] = useState<EmotionState>(DEFAULT_STATE);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const videoCaptureRef = useRef<VideoCapture | null>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const textBufferRef = useRef<string>('');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      setError('Missing API key — set NEXT_PUBLIC_GEMINI_API_KEY in .env.local');
      return;
    }

    setError(null);
    textBufferRef.current = '';

    try {
      const ai = new GoogleGenAI({ apiKey });

      const session = await ai.live.connect({
        model: MODEL,
        callbacks: {
          onopen() {
            console.log('[Gemini] session open');
          },
          onmessage(msg) {
            // Text parts (if any)
            const parts = msg.serverContent?.modelTurn?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (typeof part.text === 'string') {
                  textBufferRef.current += part.text;
                }
              }
            }

            // Audio output transcription — correct field per SDK types
            const outTranscript = msg.serverContent?.outputTranscription?.text;
            if (typeof outTranscript === 'string' && outTranscript) {
              console.log('[Gemini] outputTranscription:', outTranscript);
              textBufferRef.current += outTranscript;
            }

            // Log full message on turn complete so we can inspect structure
            if (msg.serverContent?.turnComplete) {
              console.log('[Gemini] turnComplete, buffer:', textBufferRef.current.slice(0, 200));
              const parsed = parseEmotionResponse(textBufferRef.current);
              if (parsed) setEmotionState(parsed);
              textBufferRef.current = '';
            }
          },
          onerror(e) {
            console.error('[Gemini] error', e);
            setError('WebSocket error — check console');
          },
          onclose(e) {
            console.log('[Gemini] closed', e);
            setConnected(false);
            if (e.code !== 1000 && e.code !== 1001) {
              setError(`Connection closed (code ${e.code})${e.reason ? ': ' + e.reason : ''}`);
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        },
      });

      sessionRef.current = session;
      setConnected(true);

      // Start camera
      const videoCapture = new VideoCapture();
      videoCaptureRef.current = videoCapture;
      const vStream = await videoCapture.start((base64Jpeg) => {
        sessionRef.current?.sendRealtimeInput({
          video: { data: base64Jpeg, mimeType: 'image/jpeg' },
        });
      });
      setVideoStream(vStream);

      // Start mic
      const audioCapture = new AudioCapture();
      audioCaptureRef.current = audioCapture;
      const aStream = await audioCapture.start((base64Pcm) => {
        sessionRef.current?.sendRealtimeInput({
          audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' },
        });
      });
      setAudioStream(aStream);

      // Poll every 3s — native audio model only responds when prompted
      pollIntervalRef.current = setInterval(() => {
        sessionRef.current?.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: 'analyze' }] }],
          turnComplete: true,
        });
      }, 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Gemini] start failed', e);
      setError(msg);
    }
  }, []);

  const stop = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    videoCaptureRef.current?.stop();
    audioCaptureRef.current?.stop();
    sessionRef.current?.close();
    sessionRef.current = null;
    setConnected(false);
    setError(null);
    setVideoStream(null);
    setAudioStream(null);
    setEmotionState(DEFAULT_STATE);
  }, []);

  return { connected, error, emotionState, videoStream, audioStream, start, stop };
}
