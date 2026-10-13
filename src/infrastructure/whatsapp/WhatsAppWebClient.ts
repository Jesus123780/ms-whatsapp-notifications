import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { WhatsAppClientPort, WhatsAppContact } from '../../domain/ports/WhatsAppClientPort';
import {
  QrObserverPort,
  WhatsAppClientStatus,
  WhatsAppMessageDirection,
} from '../../domain/ports/QrObserverPort';
import { WhatsAppError } from '../../shared/errors';
import { Logger } from '../logger/Logger';

export interface WhatsAppWebClientOptions {
  clientId: string;
  qrObservers?: QrObserverPort[];
}

export class WhatsAppWebClient implements WhatsAppClientPort {
  private client: Client;
  private ready = false;
  private readonly clientId: string;
  private readonly qrObservers: QrObserverPort[];

  constructor(options: WhatsAppWebClientOptions) {
    this.clientId = options.clientId;
    this.qrObservers = options.qrObservers ?? [];
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: options.clientId,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });
  }

  async initialize(): Promise<void> {
    this.cleanStaleLock();
    this.notifyStatus('connecting');

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new WhatsAppError('Timeout esperando que WhatsApp se inicialice (120s)'));
      }, 120_000);

      this.client.on('qr', (qr: string) => {
        Logger.header('WHATSAPP LOGIN');
        Logger.info('Escanea el siguiente código QR con WhatsApp:');
        Logger.blank();
        qrcode.generate(qr, { small: true });
        Logger.blank();
        this.notifyStatus('qr_pending');
        this.notifyQr(qr);
      });

      this.client.on('authenticated', () => {
        Logger.success('WhatsApp autenticado');
        this.notifyStatus('authenticated');
      });

      this.client.on('auth_failure', (msg: string) => {
        clearTimeout(timeout);
        this.notifyStatus('disconnected');
        reject(new WhatsAppError(`Error de autenticación: ${msg}`));
      });

      this.client.on('ready', () => {
        clearTimeout(timeout);
        this.ready = true;
        Logger.success('WhatsApp Client READY');
        this.notifyStatus('ready');
        resolve();
      });

      this.client.on('disconnected', (reason: string) => {
        this.ready = false;
        Logger.warn(`WhatsApp desconectado: ${reason}`);
        if (reason === 'LOGOUT') {
          this.clearSessionData();
        }
        this.notifyStatus('disconnected');
      });

      // Mensajes entrantes (recibidos de otros contactos).
      this.client.on('message', (message: Message) => {
        if (message.fromMe) return;
        this.notifyMessageActivity('incoming');
      });

      // Mensajes salientes (incluye los enviados desde el teléfono vinculado
      // y los enviados por la API vía sendText/sendMedia).
      this.client.on('message_create', (message: Message) => {
        if (!message.fromMe) return;
        this.notifyMessageActivity('outgoing');
      });

      void this.client.initialize().catch((err: Error) => {
        clearTimeout(timeout);
        reject(new WhatsAppError(`Error inicializando WhatsApp: ${err.message}`));
      });
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  private cleanStaleLock(): void {
    const sessionDir = path.resolve(`.wwebjs_auth/session-${this.clientId}`);
    const lockFile = path.join(sessionDir, 'SingletonLock');

    if (fs.existsSync(lockFile)) {
      Logger.warn('Se encontró un lock de sesión anterior. Eliminando...');
      try {
        fs.unlinkSync(lockFile);
      } catch {
        // Ignore if can't remove - Puppeteer will handle it
      }
    }
  }

  private clearSessionData(): void {
    const sessionDir = path.resolve(`.wwebjs_auth/session-${this.clientId}`);
    if (fs.existsSync(sessionDir)) {
      Logger.info('Eliminando datos de sesión (LOGOUT)...');
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        Logger.success('Datos de sesión eliminados');
      } catch {
        Logger.warn('No se pudieron eliminar los datos de sesión');
      }
    }
  }

  async getNumberId(phone: string): Promise<WhatsAppContact | null> {
    if (!this.ready) {
      throw new WhatsAppError('WhatsApp client no está listo');
    }

    const result = await this.client.getNumberId(phone);
    if (!result) return null;

    return {
      user: result.user,
      server: result.server,
    };
  }

  async sendText(chatId: string, message: string): Promise<void> {
    if (!this.ready) {
      throw new WhatsAppError('WhatsApp client no está listo');
    }

    await this.client.sendMessage(chatId, message);
  }

  async sendMedia(chatId: string, mediaPath: string, caption?: string): Promise<void> {
    if (!this.ready) {
      throw new WhatsAppError('WhatsApp client no está listo');
    }

    const media = MessageMedia.fromFilePath(mediaPath);
    await this.client.sendMessage(chatId, media, {
      caption: caption ?? '',
    });
  }

  async destroy(): Promise<void> {
    this.ready = false;
    this.notifyStatus('disconnected');
    try {
      await this.client.destroy();
    } catch {
      // Ignore if already destroyed
    }
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.clientId,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });
  }

  private notifyQr(qr: string): void {
    for (const observer of this.qrObservers) {
      observer.onQrReceived(qr);
    }
  }

  private notifyStatus(status: WhatsAppClientStatus): void {
    for (const observer of this.qrObservers) {
      observer.onStatusChanged(status);
    }
  }

  private notifyMessageActivity(direction: WhatsAppMessageDirection): void {
    for (const observer of this.qrObservers) {
      observer.onMessageActivity?.(direction);
    }
  }
}
