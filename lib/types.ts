export type EmotionType =
  | 'calm'
  | 'happy'
  | 'excited'
  | 'sad'
  | 'anxious'
  | 'angry'
  | 'focused'
  | 'neutral';

export interface EmotionState {
  emotion: EmotionType;
  intensity: number;       // 0–1
  secondaryEmotion: EmotionType | null;
  transcript: string;
}

export interface EmotionConfig {
  color: string;           // hex
  speed: number;           // base particle speed multiplier (0.1–2.0)
  shapeF: number;          // base shape factor (0=fluid, 1=geometric)
  label: string;
}
