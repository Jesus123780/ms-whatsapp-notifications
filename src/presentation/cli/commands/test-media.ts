/**
 * Diagnostic test: sends an image (no caption) to the test contact.
 * Usage: npm run send:test:media
 */
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const TEST_PHONE = process.env.TEST_PHONE ?? '573024585004';
const TEST_NAME = process.env.TEST_NAME ?? 'Odalis';
const CLIENT_ID = process.env.WHATSAPP_CLIENT_ID ?? 'il-salone-sender';
const IMAGE_PATH = path.resolve(process.env.CAMPAIGN_IMAGE_PATH ?? './assets/il-salone-sorteo.png');
const ACK_TIMEOUT_MS = 20000;

function ackLabel(ack: number): string {
  switch (ack) {
    case -1: return 'ERROR';
    case 0: return 'PENDING';
    case 1: return 'SERVER';
    case 2: return 'DEVICE';
    case 3: return 'READ';
    case 4: return 'PLAYED';
    default: return `UNKNOWN(${ack})`;
  }
}

function log(msg: string): void { console.log(`  ${msg}`); }
function header(t: string): void { console.log(`\n========================================\n${t}\n========================================\n`); }
function sep(): void { console.log('----------------------------------------'); }

async function main(): Promise<void> {
  header('DIAGNÓSTICO WHATSAPP - ENVÍO MEDIA');

  // Validate image
  if (!fs.existsSync(IMAGE_PATH)) {
    log(`✗ Imagen no encontrada: ${IMAGE_PATH}`);
    process.exit(1);
  }
  const stats = fs.statSync(IMAGE_PATH);
  log(`Imagen: ${IMAGE_PATH}`);
  log(`Tamaño: ${(stats.size / 1024).toFixed(0)} KB`);
  sep();

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu'],
    },
  });

  const ackMap = new Map<string, number>();
  client.on('message_ack', (msg, ack) => {
    ackMap.set(msg?.id?._serialized ?? '', ack);
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout 120s')), 120000);
    client.on('qr', (qr: string) => { log('Escanea QR:'); qrcode.generate(qr, { small: true }); });
    client.on('authenticated', () => log('✓ Autenticado'));
    client.on('ready', () => { clearTimeout(timeout); log('✓ READY'); resolve(); });
    client.on('auth_failure', (msg: string) => { clearTimeout(timeout); reject(new Error(msg)); });
    void client.initialize();
  });

  sep();
  const state = await client.getState();
  log(`State: ${state}`);
  if (state !== 'CONNECTED') { log('✗ No CONNECTED'); await client.destroy(); process.exit(1); }

  const numberId = await client.getNumberId(TEST_PHONE);
  if (!numberId) { log('✗ Número no registrado'); await client.destroy(); process.exit(1); }
  log(`numberId._serialized: ${numberId._serialized}`);

  const chatId = `${TEST_PHONE}@c.us`;
  log(`Chat ID para envío: ${chatId}`);
  sep();

  log(`¿Enviar imagen a ${TEST_NAME} (${chatId})? Escribe ENVIAR:`);
  const ok = await new Promise<boolean>((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  > ', (a: string) => { rl.close(); resolve(a.trim() === 'ENVIAR'); });
  });
  if (!ok) { log('Cancelado.'); await client.destroy(); process.exit(0); }

  sep();
  log('Enviando imagen...');
  const media = MessageMedia.fromFilePath(IMAGE_PATH);
  log(`  mimetype: ${media.mimetype}`);
  log(`  data size: ${(media.data.length / 1024).toFixed(0)} KB (base64)`);

  const sent = await client.sendMessage(chatId, media);
  if (!sent) { log('✗ sendMessage retornó undefined'); await client.destroy(); process.exit(1); }

  const msgId = sent.id?._serialized ?? 'UNKNOWN';
  log(`  Message ID: ${msgId}`);
  log(`  ACK inmediato: ${ackLabel(sent.ack ?? 0)}`);
  sep();

  log(`Esperando ACK (${ACK_TIMEOUT_MS / 1000}s)...`);
  const finalAck = await new Promise<number>((resolve) => {
    const iv = setInterval(() => { const a = ackMap.get(msgId); if (a && a >= 1) { clearInterval(iv); clearTimeout(to); resolve(a); } }, 500);
    const to = setTimeout(() => { clearInterval(iv); resolve(ackMap.get(msgId) ?? 0); }, ACK_TIMEOUT_MS);
  });

  header('RESULTADO');
  log(`Message ID: ${msgId}`);
  log(`ACK: ${ackLabel(finalAck)}`);
  if (finalAck >= 2) log('✓ Imagen entregada al dispositivo');
  else if (finalAck >= 1) log('✓ Imagen aceptada por servidor WhatsApp');
  else log('⚠️ No se confirmó entrega');

  await client.destroy();
  log('✓ Finalizado');
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
