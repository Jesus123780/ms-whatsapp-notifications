import { Contact } from '../entities/Contact';
import { PhoneNumber } from '../value-objects/PhoneNumber';
import { RawContact } from '../ports/SpreadsheetReader';

export interface NormalizationResult {
  validContacts: Contact[];
  invalidCount: number;
  duplicatesRemoved: number;
  totalRaw: number;
}

export class PhoneNormalizer {
  normalize(rawContacts: RawContact[]): NormalizationResult {
    const validContacts: Contact[] = [];
    const seenPhones = new Set<string>();
    let invalidCount = 0;
    let duplicatesRemoved = 0;

    for (const raw of rawContacts) {
      if (!raw.phone || raw.phone.trim() === '') {
        invalidCount++;
        continue;
      }

      try {
        const phoneNumber = PhoneNumber.create(raw.phone);

        if (seenPhones.has(phoneNumber.value)) {
          duplicatesRemoved++;
          continue;
        }

        seenPhones.add(phoneNumber.value);
        validContacts.push(
          new Contact({
            name: raw.name || 'Sin nombre',
            phoneOriginal: raw.phone,
            phoneNumber,
          }),
        );
      } catch {
        invalidCount++;
      }
    }

    return {
      validContacts,
      invalidCount,
      duplicatesRemoved,
      totalRaw: rawContacts.length,
    };
  }
}
