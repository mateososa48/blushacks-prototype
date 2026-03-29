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
