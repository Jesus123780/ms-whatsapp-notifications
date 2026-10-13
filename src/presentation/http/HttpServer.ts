import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import { QrObserverPort, WhatsAppClientStatus } from '../../domain/ports/QrObserverPort';
import { WhatsAppClientPort } from '../../domain/ports/WhatsAppClientPort';
import { PhoneNumber } from '../../domain/value-objects/PhoneNumber';
import { MessageJob, MessageJobStatus } from '../../domain/entities/MessageJob';
import { Campaign } from '../../domain/entities/Campaign';
import { MessageJobRepository } from '../../domain/ports/MessageJobRepository';
import { CampaignRepository } from '../../domain/ports/CampaignRepository';
import { Logger } from '../../infrastructure/logger/Logger';
import { sleep, randomDelay } from '../../shared/utils/delay';
import { ValidationError } from '../../shared/errors';
import xlsx from 'xlsx';
import { WhatsAppMessageDirection, WhatsAppMessageStatsService } from '../../application/services/WhatsAppMessageStatsService';

export interface HttpServerOptions {
  port: number;
  corsOrigin: string;
  minDelayMs: number;
  maxDelayMs: number;
  maxMessagesPerRun: number;
}

export interface HttpServerDependencies {
  getWhatsAppClient: () => WhatsAppClientPort | null;
  messageJobRepo: MessageJobRepository;
  campaignRepo: CampaignRepository;
}

export class HttpServer implements QrObserverPort {
  private app: Application;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private currentQr: string | null = null;
  private currentStatus: WhatsAppClientStatus = 'disconnected';
  private readonly port: number;
  private readonly options: HttpServerOptions;
  private deps: HttpServerDependencies | null = null;
  private campaignRunning = false;
  private upload: multer.Multer;
  private readonly messageStats = new WhatsAppMessageStatsService();
  constructor(options: HttpServerOptions) {
    this.port = options.port;
    this.options = options;
    this.app = express();

    this.app.use(cors({ origin: options.corsOrigin }));
    this.app.use(express.json());

    const uploadDir = path.resolve('./data/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    this.upload = multer({ dest: uploadDir });
    this.registerRoutes();
  }

  onMessageActivity(direction: WhatsAppMessageDirection): void {
    const stats = this.messageStats.record(direction);

    this.broadcast({
      event: 'messages:stats',
      stats,
    });
  }

  setDependencies(deps: HttpServerDependencies): void {
    this.deps = deps;
  }

  onQrReceived(qr: string): void {
    this.currentQr = qr;
    this.broadcast({ event: 'qr', qr, status: this.currentStatus });
  }

  onStatusChanged(status: WhatsAppClientStatus): void {
    this.currentStatus = status;
    if (status === 'ready' || status === 'authenticated') {
      this.currentQr = null;
    }
    this.broadcast({ event: 'status', status, qr: this.currentQr });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(this.app);

      this.wss = new WebSocketServer({ server: this.server });
      this.wss.on('connection', (ws: WebSocket) => {
        ws.send(
          JSON.stringify({
            event: 'status',
            status: this.currentStatus,
            qr: this.currentQr,
          }),
        );

        ws.send(
          JSON.stringify({
            event: 'messages:stats',
            stats: this.messageStats.getSnapshot(),
          }),
        );
      });

      this.server.listen(this.port, () => {
        Logger.success(`HTTP Server escuchando en http://localhost:${this.port}`);
        Logger.info('Endpoints disponibles:');
        Logger.info(`  GET  http://localhost:${this.port}/api/qr`);
        Logger.info(`  GET  http://localhost:${this.port}/api/status`);
        Logger.info(`  POST http://localhost:${this.port}/api/send`);
        Logger.info(`  POST http://localhost:${this.port}/api/campaign`);
        Logger.info(`  WS   ws://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close();
      }
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  broadcast(data: object): void {
    if (!this.wss) return;
    const message = JSON.stringify(data);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  private getClient(): WhatsAppClientPort | null {
    if (!this.deps) return null;
    return this.deps.getWhatsAppClient();
  }

  private registerRoutes(): void {
    // GET /api/qr
    this.app.get('/api/qr', (_req: Request, res: Response) => {
      if (this.currentStatus === 'ready') {
        res.json({ status: 'ready', qr: null, message: 'Ya autenticado, no se requiere QR' });
        return;
      }
      if (!this.currentQr) {
        res.json({ status: this.currentStatus, qr: null, message: 'QR no disponible aún' });
        return;
      }
      res.json({ status: this.currentStatus, qr: this.currentQr });
    });

    // GET /api/status
    this.app.get('/api/status', (_req: Request, res: Response) => {
      res.json({ status: this.currentStatus, campaignRunning: this.campaignRunning });
    });

    // POST /api/send — Send single message
    this.app.post('/api/send', (req: Request, res: Response) => {
      void this.handleSend(req, res);
    });

    // POST /api/campaign — Upload CSV/Excel and process in batches
    this.app.post('/api/campaign', this.upload.single('file'), (req: Request, res: Response) => {
      void this.handleCampaign(req, res);
    });

    // GET /api/messages/stats
    this.app.get('/api/messages/stats', (_req: Request, res: Response) => {
      res.json(this.messageStats.getSnapshot());
    });
  }

  private async handleSend(req: Request, res: Response): Promise<void> {
    const { phone, message } = req.body as { phone?: string; message?: string };

    if (!phone || !message) {
      res.status(400).json({ error: 'Se requieren los campos: phone, message' });
      return;
    }

    const client = this.getClient();
    if (!client || !client.isReady()) {
      res.status(503).json({ error: 'WhatsApp no está conectado' });
      return;
    }

    try {
      const phoneNumber = PhoneNumber.create(phone);
      const numberId = await client.getNumberId(phoneNumber.value);

      if (!numberId) {
        res.status(404).json({ error: 'Número no registrado en WhatsApp', phone: phoneNumber.formatted });
        return;
      }

      await client.sendText(phoneNumber.chatId, message);
      res.json({ success: true, phone: phoneNumber.formatted, message: 'Mensaje enviado' });
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: msg });
    }
  }

  private async handleCampaign(req: Request, res: Response): Promise<void> {
    if (this.campaignRunning) {
      res.status(409).json({ error: 'Ya hay una campaña en ejecución' });
      return;
    }

    const { message } = req.body as { message?: string };
    if (!message) {
      res.status(400).json({ error: 'Se requiere el campo: message' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Se requiere un archivo CSV o Excel (campo: file)' });
      return;
    }

    const client = this.getClient();
    if (!client || !client.isReady()) {
      this.cleanUploadedFile(req.file.path);
      res.status(503).json({ error: 'WhatsApp no está conectado' });
      return;
    }

    if (!this.deps) {
      this.cleanUploadedFile(req.file.path);
      res.status(500).json({ error: 'Dependencias no configuradas' });
      return;
    }

    // Parse contacts from file
    let contacts: Array<{ name: string; phone: string }>;
    try {
      contacts = this.parseContactsFile(req.file.path, req.file.originalname);
    } catch (error) {
      this.cleanUploadedFile(req.file.path);
      const msg = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: `Error procesando archivo: ${msg}` });
      return;
    }

    if (contacts.length === 0) {
      this.cleanUploadedFile(req.file.path);
      res.status(400).json({ error: 'El archivo no contiene contactos válidos' });
      return;
    }

    // Create campaign in DB
    const campaignName = `campaign-${Date.now()}`;
    const campaign = this.deps.campaignRepo.save(
      new Campaign({
        name: campaignName,
        message,
        imagePath: '',
      }),
    );

    const campaignId = campaign.id as number;

    // Respond immediately with campaign info
    res.status(202).json({
      success: true,
      campaignId,
      campaignName,
      totalContacts: contacts.length,
      message: 'Campaña creada. Procesando en background. Monitorea por WebSocket.',
    });

    // Process in background
    this.campaignRunning = true;
    this.processCampaignInBackground(contacts, campaignId, message, client, req.file.path);
  }

  private processCampaignInBackground(
    contacts: Array<{ name: string; phone: string }>,
    campaignId: number,
    message: string,
    client: WhatsAppClientPort,
    filePath: string,
  ): void {
    void (async () => {
      const result = { total: contacts.length, sent: 0, failed: 0, notRegistered: 0, skipped: 0 };
      const limit = this.options.maxMessagesPerRun;
      const batch = limit > 0 ? contacts.slice(0, limit) : contacts;

      this.broadcast({ event: 'campaign:start', campaignId, total: batch.length });

      for (let i = 0; i < batch.length; i++) {
        const contact = batch[i];
        if (!contact) continue;

        if (!client.isReady()) {
          this.broadcast({ event: 'campaign:error', campaignId, message: 'WhatsApp desconectado durante el envío' });
          break;
        }

        // Normalize phone
        let phoneNumber: PhoneNumber;
        try {
          phoneNumber = PhoneNumber.create(contact.phone);
        } catch {
          result.failed++;
          this.broadcast({ event: 'campaign:progress', campaignId, index: i + 1, total: batch.length, name: contact.name, status: 'invalid_phone' });
          continue;
        }

        // Idempotency check
        if (this.deps) {
          const existing = this.deps.messageJobRepo.findByCampaignAndPhone(campaignId, phoneNumber.value);
          if (existing && existing.status === MessageJobStatus.SENT) {
            result.skipped++;
            this.broadcast({ event: 'campaign:progress', campaignId, index: i + 1, total: batch.length, name: contact.name, status: 'skipped' });
            continue;
          }
        }

        // Create job
        const job = new MessageJob({
          campaignId,
          name: contact.name,
          phoneOriginal: contact.phone,
          phoneNormalized: phoneNumber.value,
          chatId: phoneNumber.chatId,
          status: MessageJobStatus.PROCESSING,
          messageType: 'TEXT',
        });

        const savedJob = this.deps ? this.deps.messageJobRepo.save(job) : job;

        // Validate number on WhatsApp
        try {
          const numberId = await client.getNumberId(phoneNumber.value);
          if (!numberId) {
            savedJob.markAsNotRegistered();
            if (this.deps) this.deps.messageJobRepo.update(savedJob);
            result.notRegistered++;
            this.broadcast({ event: 'campaign:progress', campaignId, index: i + 1, total: batch.length, name: contact.name, status: 'not_registered' });
            continue;
          }
        } catch {
          savedJob.markAsFailed('Error validando número');
          if (this.deps) this.deps.messageJobRepo.update(savedJob);
          result.failed++;
          this.broadcast({ event: 'campaign:progress', campaignId, index: i + 1, total: batch.length, name: contact.name, status: 'failed' });
          continue;
        }

        // Send message
        try {
          await client.sendText(phoneNumber.chatId, message);
          savedJob.markAsSent();
          if (this.deps) this.deps.messageJobRepo.update(savedJob);
          result.sent++;
          this.broadcast({ event: 'campaign:progress', campaignId, index: i + 1, total: batch.length, name: contact.name, status: 'sent' });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          savedJob.markAsFailed(errorMsg);
          if (this.deps) this.deps.messageJobRepo.update(savedJob);
          result.failed++;
          this.broadcast({ event: 'campaign:progress', campaignId, index: i + 1, total: batch.length, name: contact.name, status: 'failed' });
        }

        // Delay between messages (safe anti-detection)
        if (i < batch.length - 1) {
          const delay = randomDelay(this.options.minDelayMs, this.options.maxDelayMs);
          await sleep(delay);
        }
      }

      this.campaignRunning = false;
      this.broadcast({ event: 'campaign:complete', campaignId, result });
      this.cleanUploadedFile(filePath);
    })();
  }

  private parseContactsFile(filePath: string, _originalName: string): Array<{ name: string; phone: string }> {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Archivo vacío');

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error('Hoja vacía');

    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const contacts: Array<{ name: string; phone: string }> = [];

    for (const row of rows) {
      const name = String(row['name'] ?? row['nombre'] ?? row['contact_name'] ?? row['Name'] ?? '').trim();
      const phone = String(row['number'] ?? row['phone'] ?? row['telefono'] ?? row['Number'] ?? row['contact_number'] ?? '').trim();

      if (phone) {
        contacts.push({ name: name || 'Sin nombre', phone });
      }
    }

    return contacts;
  }

  private cleanUploadedFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
