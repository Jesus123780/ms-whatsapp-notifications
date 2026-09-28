import { ValidationError } from '../../shared/errors';

const COLOMBIA_CODE = '57';
const COLOMBIAN_NUMBER_LENGTH = 10;
const VALID_COLOMBIAN_PREFIXES = ['3']; // Colombian mobile numbers start with 3

export class PhoneNumber {
  private readonly normalized: string;

  private constructor(normalized: string) {
    this.normalized = normalized;
  }

  static create(raw: string): PhoneNumber {
    const cleaned = PhoneNumber.clean(raw);
    const normalized = PhoneNumber.normalize(cleaned);
    PhoneNumber.validate(normalized);
    return new PhoneNumber(normalized);
  }

  private static clean(raw: string): string {
    // Remove all non-numeric characters
    return raw.replace(/[^0-9]/g, '');
  }

  private static normalize(cleaned: string): string {
    // If already starts with 57 and has correct total length (12 digits)
    if (cleaned.startsWith(COLOMBIA_CODE) && cleaned.length === 12) {
      return cleaned;
    }

    // If it's a 10-digit Colombian number
    if (cleaned.length === COLOMBIAN_NUMBER_LENGTH) {
      return `${COLOMBIA_CODE}${cleaned}`;
    }

    // If it starts with country code but was parsed differently
    if (cleaned.length === 12 && cleaned.startsWith(COLOMBIA_CODE)) {
      return cleaned;
    }

    return cleaned;
  }

  private static validate(normalized: string): void {
    if (normalized.length !== 12) {
      throw new ValidationError(
        `Número de teléfono inválido: debe tener 12 dígitos (57 + 10 dígitos), recibido: ${normalized.length} dígitos`,
      );
    }

    if (!normalized.startsWith(COLOMBIA_CODE)) {
      throw new ValidationError(
        `Número de teléfono inválido: debe iniciar con ${COLOMBIA_CODE}`,
      );
    }

    const localNumber = normalized.substring(2);
    const startsWithValidPrefix = VALID_COLOMBIAN_PREFIXES.some((prefix) =>
      localNumber.startsWith(prefix),
    );

    if (!startsWithValidPrefix) {
      throw new ValidationError(
        `Número de teléfono inválido: el número local debe iniciar con 3 (móvil colombiano)`,
      );
    }
  }

  get value(): string {
    return this.normalized;
  }

  get chatId(): string {
    return `${this.normalized}@c.us`;
  }

  get formatted(): string {
    return `+${this.normalized}`;
  }

  equals(other: PhoneNumber): boolean {
    return this.normalized === other.normalized;
  }
}
