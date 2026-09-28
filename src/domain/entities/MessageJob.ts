export enum MessageJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
  NOT_REGISTERED = 'NOT_REGISTERED',
}

export interface MessageJobProps {
  id?: number;
  campaignId: number;
  name: string;
  phoneOriginal: string;
  phoneNormalized: string;
  chatId: string;
  status: MessageJobStatus;
  errorMessage?: string;
  messageType: string;
  sentAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class MessageJob {
  readonly id?: number;
  readonly campaignId: number;
  readonly name: string;
  readonly phoneOriginal: string;
  readonly phoneNormalized: string;
  readonly chatId: string;
  private _status: MessageJobStatus;
  private _errorMessage?: string;
  readonly messageType: string;
  private _sentAt?: Date;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: MessageJobProps) {
    this.id = props.id;
    this.campaignId = props.campaignId;
    this.name = props.name;
    this.phoneOriginal = props.phoneOriginal;
    this.phoneNormalized = props.phoneNormalized;
    this.chatId = props.chatId;
    this._status = props.status;
    this._errorMessage = props.errorMessage;
    this.messageType = props.messageType;
    this._sentAt = props.sentAt;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  get status(): MessageJobStatus {
    return this._status;
  }

  get errorMessage(): string | undefined {
    return this._errorMessage;
  }

  get sentAt(): Date | undefined {
    return this._sentAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  markAsSent(): void {
    this._status = MessageJobStatus.SENT;
    this._sentAt = new Date();
    this._updatedAt = new Date();
  }

  markAsFailed(errorMessage: string): void {
    this._status = MessageJobStatus.FAILED;
    this._errorMessage = errorMessage;
    this._updatedAt = new Date();
  }

  markAsNotRegistered(): void {
    this._status = MessageJobStatus.NOT_REGISTERED;
    this._updatedAt = new Date();
  }

  markAsSkipped(reason?: string): void {
    this._status = MessageJobStatus.SKIPPED;
    this._errorMessage = reason;
    this._updatedAt = new Date();
  }

  markAsProcessing(): void {
    this._status = MessageJobStatus.PROCESSING;
    this._updatedAt = new Date();
  }
}
