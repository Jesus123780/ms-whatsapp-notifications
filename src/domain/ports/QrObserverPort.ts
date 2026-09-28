export type WhatsAppClientStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_pending'
  | 'authenticated'
  | 'ready';

export interface QrObserverPort {
  onQrReceived(qr: string): void;
  onStatusChanged(status: WhatsAppClientStatus): void;
}
