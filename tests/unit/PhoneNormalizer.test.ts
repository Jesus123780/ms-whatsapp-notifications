import { describe, it, expect } from 'vitest';
import { PhoneNormalizer } from '../../src/domain/services/PhoneNormalizer';

describe('PhoneNormalizer', () => {
  const normalizer = new PhoneNormalizer();

  it('should normalize valid contacts', () => {
    const result = normalizer.normalize([
      { name: 'Adrian Ortiz', phone: '304-3222471' },
      { name: 'Samuel Bowie', phone: '321-9020883' },
    ]);

    expect(result.validContacts).toHaveLength(2);
    expect(result.validContacts[0]!.normalizedPhone).toBe('573043222471');
    expect(result.validContacts[1]!.normalizedPhone).toBe('573219020883');
    expect(result.invalidCount).toBe(0);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('should remove duplicates', () => {
    const result = normalizer.normalize([
      { name: 'Adrian', phone: '304-3222471' },
      { name: 'Adrian Dup', phone: '3043222471' },
    ]);

    expect(result.validContacts).toHaveLength(1);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('should skip empty phone numbers', () => {
    const result = normalizer.normalize([
      { name: 'Valid', phone: '304-3222471' },
      { name: 'Empty', phone: '' },
      { name: 'Spaces', phone: '   ' },
    ]);

    expect(result.validContacts).toHaveLength(1);
    expect(result.invalidCount).toBe(2);
  });

  it('should count invalid numbers', () => {
    const result = normalizer.normalize([
      { name: 'Valid', phone: '304-3222471' },
      { name: 'Invalid', phone: '123' },
    ]);

    expect(result.validContacts).toHaveLength(1);
    expect(result.invalidCount).toBe(1);
  });

  it('should track total raw count', () => {
    const result = normalizer.normalize([
      { name: 'A', phone: '304-3222471' },
      { name: 'B', phone: '321-9020883' },
      { name: 'C', phone: '' },
    ]);

    expect(result.totalRaw).toBe(3);
  });

  it('should assign default name when missing', () => {
    const result = normalizer.normalize([{ name: '', phone: '304-3222471' }]);

    expect(result.validContacts[0]!.name).toBe('Sin nombre');
  });
});
