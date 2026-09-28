import { PhoneNumber } from '../value-objects/PhoneNumber';

export interface ContactProps {
  name: string;
  phoneOriginal: string;
  phoneNumber: PhoneNumber;
}

export class Contact {
  readonly name: string;
  readonly phoneOriginal: string;
  readonly phoneNumber: PhoneNumber;

  constructor(props: ContactProps) {
    this.name = props.name;
    this.phoneOriginal = props.phoneOriginal;
    this.phoneNumber = props.phoneNumber;
  }

  get normalizedPhone(): string {
    return this.phoneNumber.value;
  }

  get chatId(): string {
    return this.phoneNumber.chatId;
  }
}
