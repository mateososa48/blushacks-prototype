'use client';
import { useState, useRef, useCallback } from 'react';
import type { EmotionState } from './types';
import { VideoCapture } from './videoCapture';
import { AudioCapture } from './audioCapture';
import { parseEmotionResponse } from './parseEmotionResponse';

const GEMINI_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

const SYSTEM_PROMPT =
  "You are a real-time emotion detection system. Analyze the user's facial expression from video frames and voice tone from audio. " +
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

    const ws = new WebSocket(`${GEMINI_WS_URL}?key=${apiKey}`);
    wsRef.current = ws;
    textBufferRef.current = '';

    ws.onopen = () => {
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
          ? await (event.data as Blob).text()
          : (event.data as string);
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

      // Accumulate model text across streaming chunks
      const serverContent = data.serverContent as Record<string, unknown> | undefined;
      const parts = (serverContent?.modelTurn as Record<string, unknown> | undefined)?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts as Array<Record<string, unknown>>) {
          if (typeof part.text === 'string') {
            textBufferRef.current += part.text;
          }
        }
      }

      // Parse when Gemini finishes its turn
      if (serverContent?.turnComplete === true) {
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
