import { describe, it, expect } from 'vitest';
import { getEmotionConfig, computeShapeF } from '@/lib/emotionMap';

describe('getEmotionConfig', () => {
  it('returns correct color for calm', () => {
    expect(getEmotionConfig('calm').color).toBe('#4DD9AC');
  });

  it('returns neutral config for unknown emotion string', () => {
    expect(getEmotionConfig('unknown').label).toBe('Neutral');
  });

  it('returns correct speed for angry (high)', () => {
    expect(getEmotionConfig('angry').speed).toBeGreaterThan(1.0);
  });

  it('returns correct speed for calm (low)', () => {
    expect(getEmotionConfig('calm').speed).toBeLessThan(0.5);
  });
});

describe('computeShapeF', () => {
  it('returns near-zero for low intensity (fluid)', () => {
    expect(computeShapeF(0.5, 0.2)).toBeLessThan(0.3);
  });

  it('returns near-1 for high intensity with geometric emotion', () => {
    expect(computeShapeF(1.0, 0.9)).toBeGreaterThan(0.9);
  });

  it('clamps between 0 and 1', () => {
    const val = computeShapeF(1.0, 1.5);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});
