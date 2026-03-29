'use client';
import { useState, useRef, useCallback } from 'react';
import type { EmotionState } from './types';
import { VideoCapture } from './videoCapture';
import { AudioCapture } from './audioCapture';
import { parseEmotionResponse } from './parseEmotionResponse';

const GEMINI_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-2.0-flash-live-001';

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
  const [error, setError] = useState<string | null>(null);
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
      setError('Missing API key — set NEXT_PUBLIC_GEMINI_API_KEY in .env.local');
      return;
    }

    setError(null);
    const ws = new WebSocket(`${GEMINI_WS_URL}?key=${apiKey}`);
    wsRef.current = ws;
    textBufferRef.current = '';

    ws.onopen = () => {
      console.log('[Gemini] WebSocket opened, sending setup...');
      ws.send(JSON.stringify({
        setup: {
          model: MODEL,
          generationConfig: {
            responseModalities: 'text',
          },
          systemInstruction: {
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

      console.log('[Gemini] message:', JSON.stringify(data).slice(0, 120));

      // Session ready — start media capture
      if (data.setupComplete !== undefined) {
        console.log('[Gemini] setupComplete — starting media');
        setConnected(true);

        try {
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
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(`Camera/mic access failed: ${msg}`);
          ws.close();
        }
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
      console.error('[Gemini] WebSocket error', err);
      setError('WebSocket connection failed — check console for details');
    };

    ws.onclose = (evt) => {
      console.log(`[Gemini] WebSocket closed: code=${evt.code} reason=${evt.reason}`);
      setConnected(false);
      if (evt.code !== 1000 && evt.code !== 1001) {
        setError(`Connection closed (code ${evt.code})${evt.reason ? ': ' + evt.reason : ''}`);
      }
    };
  }, [sendMessage]);

  const stop = useCallback(() => {
    videoCaptureRef.current?.stop();
    audioCaptureRef.current?.stop();
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setError(null);
    setVideoStream(null);
    setAudioStream(null);
    setEmotionState(DEFAULT_STATE);
  }, []);

  return { connected, error, emotionState, videoStream, audioStream, start, stop };
}
