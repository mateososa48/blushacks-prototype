'use client';
import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { EmotionState } from './types';
import { VideoCapture } from './videoCapture';
import { parseEmotionResponse } from './parseEmotionResponse';

const MODEL = 'gemini-1.5-flash';

const PROMPT =
  'Analyze the facial expression in this image. ' +
  'Respond with a single JSON object only (no markdown, no explanation): ' +
  '{"emotion":"<calm|happy|excited|sad|anxious|angry|focused|neutral>","intensity":<0.0-1.0>,"secondaryEmotion":"<emotion or null>","transcript":""}';

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

  const videoCaptureRef = useRef<VideoCapture | null>(null);
  const latestFrameRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);
  const busyRef = useRef(false);

  const start = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      setError('Missing API key — set NEXT_PUBLIC_GEMINI_API_KEY in .env.local');
      return;
    }

    setError(null);
    aiRef.current = new GoogleGenAI({ apiKey });

    try {
      // Camera
      const videoCapture = new VideoCapture();
      videoCaptureRef.current = videoCapture;
      const vStream = await videoCapture.start((base64Jpeg) => {
        latestFrameRef.current = base64Jpeg;
      });
      setVideoStream(vStream);

      // Mic (for the level meter UI only)
      const aStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = aStream;
      setAudioStream(aStream);

      setConnected(true);

      // Browser speech recognition for transcript
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          let t = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            t += event.results[i][0].transcript;
          }
          setEmotionState((prev) => ({ ...prev, transcript: t }));
        };
        recognition.onerror = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      }

      // Poll Gemini Vision every 2s with the latest frame
      pollIntervalRef.current = setInterval(async () => {
        const frame = latestFrameRef.current;
        if (!frame || !aiRef.current || busyRef.current) return;
        busyRef.current = true;
        try {
          const result = await aiRef.current.models.generateContent({
            model: MODEL,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: PROMPT },
                  { inlineData: { data: frame, mimeType: 'image/jpeg' } },
                ],
              },
            ],
          });
          const text = result.text ?? '';
          console.log('[Gemini] raw:', text.slice(0, 200));
          const parsed = parseEmotionResponse(text);
          console.log('[Gemini] parsed:', parsed);
          if (parsed) {
            setEmotionState((prev) => ({ ...parsed, transcript: prev.transcript }));
          }
        } catch (e) {
          console.error('[Gemini] generateContent error', e);
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          busyRef.current = false;
        }
      }, 4000);
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
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    videoCaptureRef.current?.stop();
    videoCaptureRef.current = null;
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
    latestFrameRef.current = null;
    busyRef.current = false;
    setConnected(false);
    setError(null);
    setVideoStream(null);
    setAudioStream(null);
    setEmotionState(DEFAULT_STATE);
  }, []);

  return { connected, error, emotionState, videoStream, audioStream, start, stop };
}
