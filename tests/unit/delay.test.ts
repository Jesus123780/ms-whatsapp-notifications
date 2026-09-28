import { describe, it, expect } from 'vitest';
import { randomDelay } from '../../src/shared/utils/delay';

describe('randomDelay', () => {
  it('should return a value between min and max', () => {
    for (let i = 0; i < 100; i++) {
      const delay = randomDelay(5000, 10000);
      expect(delay).toBeGreaterThanOrEqual(5000);
      expect(delay).toBeLessThanOrEqual(10000);
    }
  });

  it('should return exact value when min equals max', () => {
    const delay = randomDelay(5000, 5000);
    expect(delay).toBe(5000);
  });
});
