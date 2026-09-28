import { describe, it, expect } from 'vitest';
import { PhoneNumber } from '../../src/domain/value-objects/PhoneNumber';

describe('PhoneNumber', () => {
  describe('create - normalización de teléfonos colombianos', () => {
    it('should normalize a 10-digit Colombian number', () => {
      const phone = PhoneNumber.create('3043222471');
      expect(phone.value).toBe('573043222471');
    });

    it('should remove hyphens and normalize', () => {
      const phone = PhoneNumber.create('304-3222471');
      expect(phone.value).toBe('573043222471');
    });

    it('should remove spaces and normalize', () => {
      const phone = PhoneNumber.create('302 4585004');
      expect(phone.value).toBe('573024585004');
    });

    it('should handle +57 prefix with spaces', () => {
      const phone = PhoneNumber.create('+57 302 4585004');
      expect(phone.value).toBe('573024585004');
    });

    it('should not duplicate 57 if already present', () => {
      const phone = PhoneNumber.create('573024585004');
      expect(phone.value).toBe('573024585004');
    });

    it('should remove parentheses', () => {
      const phone = PhoneNumber.create('(302)4585004');
      expect(phone.value).toBe('573024585004');
    });

    it('should handle complex formatting', () => {
      const phone = PhoneNumber.create('+57 (321) 902-0883');
      expect(phone.value).toBe('573219020883');
    });
  });

  describe('create - rechazar números inválidos', () => {
    it('should reject numbers with too few digits', () => {
      expect(() => PhoneNumber.create('123456')).toThrow();
    });

    it('should reject numbers that do not start with 3', () => {
      expect(() => PhoneNumber.create('5712345678')).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => PhoneNumber.create('')).toThrow();
    });

    it('should reject non-numeric characters only', () => {
      expect(() => PhoneNumber.create('abcdefghij')).toThrow();
    });
  });

  describe('chatId', () => {
    it('should return proper WhatsApp chat ID format', () => {
      const phone = PhoneNumber.create('3043222471');
      expect(phone.chatId).toBe('573043222471@c.us');
    });
  });

  describe('formatted', () => {
    it('should return phone with + prefix', () => {
      const phone = PhoneNumber.create('3043222471');
      expect(phone.formatted).toBe('+573043222471');
    });
  });

  describe('equals', () => {
    it('should be equal when normalized values match', () => {
      const phone1 = PhoneNumber.create('304-3222471');
      const phone2 = PhoneNumber.create('3043222471');
      expect(phone1.equals(phone2)).toBe(true);
    });

    it('should not be equal for different numbers', () => {
      const phone1 = PhoneNumber.create('3043222471');
      const phone2 = PhoneNumber.create('3219020883');
      expect(phone1.equals(phone2)).toBe(false);
    });
  });
});
