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
