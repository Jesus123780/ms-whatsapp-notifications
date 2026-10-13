export type WhatsAppClientStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_pending'
  | 'authenticated'
  | 'ready';

export type WhatsAppMessageDirection = 'incoming' | 'outgoing'

export interface QrObserverPort {
  onQrReceived(qr: string): void;
  onStatusChanged(status: WhatsAppClientStatus): void;
  onMessageActivity?(
    direction: WhatsAppMessageDirection,
  ): void
}

