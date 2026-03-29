import { describe, it, expect } from 'vitest';
import { parseEmotionResponse } from '@/lib/parseEmotionResponse';

describe('parseEmotionResponse', () => {
  it('parses a valid emotion JSON string', () => {
    const result = parseEmotionResponse(
      '{"emotion":"calm","intensity":0.3,"secondaryEmotion":null,"transcript":"hello"}'
    );
    expect(result).toEqual({
      emotion: 'calm',
      intensity: 0.3,
      secondaryEmotion: null,
      transcript: 'hello',
    });
  });

  it('extracts JSON embedded in surrounding text', () => {
    const result = parseEmotionResponse(
      'Sure! {"emotion":"happy","intensity":0.7,"secondaryEmotion":"excited","transcript":"yes"} done.'
    );
    expect(result?.emotion).toBe('happy');
    expect(result?.intensity).toBe(0.7);
  });

  it('returns null for plain text with no JSON', () => {
    expect(parseEmotionResponse('I am analyzing...')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseEmotionResponse('{bad json}')).toBeNull();
  });

  it('clamps intensity to 0–1', () => {
    const result = parseEmotionResponse(
      '{"emotion":"angry","intensity":1.5,"secondaryEmotion":null,"transcript":""}'
    );
    expect(result?.intensity).toBe(1);
  });

  it('falls back to neutral for unknown emotion', () => {
    const result = parseEmotionResponse(
      '{"emotion":"bored","intensity":0.5,"secondaryEmotion":null,"transcript":""}'
    );
    expect(result?.emotion).toBe('neutral');
  });
});
