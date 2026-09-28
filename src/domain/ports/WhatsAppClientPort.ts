export interface WhatsAppContact {
  user: string;
  server: string;
}

export interface WhatsAppClientPort {
  initialize(): Promise<void>;
  isReady(): boolean;
  getNumberId(phone: string): Promise<WhatsAppContact | null>;
  sendText(chatId: string, message: string): Promise<void>;
  sendMedia(chatId: string, mediaPath: string, caption?: string): Promise<void>;
  destroy(): Promise<void>;
}
