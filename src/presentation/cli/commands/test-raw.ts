/**
 * Raw WhatsApp test - minimal sendMessage diagnostic.
 * No Excel, no SQLite, no Campaign, no Image, no Bulk.
 * Usage: npm run send:test:raw
 */
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';

dotenv.config();

const TARGET = '573024585004';
const MESSAGE = 'PRUEBA WHATSAPP - IL SALONE';
const CLIENT_ID = process.env.WHATSAPP_CLIENT_ID ?? 'il-salone-sender';

async function main(): Promise<void> {
  console.log('========================================');
  console.log('WHATSAPP RAW TEST');
  console.log('========================================');
  console.log('');

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
             '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu'],
    },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout 120s')), 120000);
    client.on('qr', (qr: string) => { console.log('QR:'); qrcode.generate(qr, { small: true }); });
    client.on('authenticated', () => console.log('Authenticated'));
    client.on('ready', () => { clearTimeout(timeout); console.log('READY'); resolve(); });
    client.on('auth_failure', (m: string) => { clearTimeout(timeout); reject(new Error(m)); });
    void client.initialize();
  });

  // State
  const state = await client.getState();
  console.log(`State: ${state}`);
  console.log(`WID: ${client.info?.wid?._serialized}`);
  console.log(`Platform: ${client.info?.platform}`);

  if (state !== 'CONNECTED') {
    console.log('NOT CONNECTED. Aborting.');
    await client.destroy();
    process.exit(1);
  }

  // Get WWeb version
  try {
    const wwebVersion = await client.getWWebVersion();
    console.log(`WhatsApp Web version: ${wwebVersion}`);
  } catch { console.log('WhatsApp Web version: unavailable'); }

  console.log('');

  // Number ID
  console.log(`Target: ${TARGET}`);
  const numberId = await client.getNumberId(TARGET);
  console.log(`Number ID: ${JSON.stringify(numberId)}`);

  if (!numberId) {
    console.log('Number not registered. Aborting.');
    await client.destroy();
    process.exit(1);
  }

  console.log(`  _serialized: ${numberId._serialized}`);
  console.log(`  user: ${numberId.user}`);
  console.log(`  server: ${numberId.server}`);
  console.log('');

  // Use @c.us format (standard for individual chats)
  const chatId = `${TARGET}@c.us`;
  console.log(`Chat ID to use: ${chatId}`);
  console.log('');

  // Send with waitUntilMsgSent option
  console.log('Sending message...');
  console.log(`  chatId: ${chatId}`);
  console.log(`  message: ${MESSAGE}`);
  console.log(`  options: { waitUntilMsgSent: true }`);
  console.log('');

  try {
    const result = await client.sendMessage(chatId, MESSAGE, {
      waitUntilMsgSent: true,
    });

    console.log('--- RESULT ---');
    console.log(`  typeof: ${typeof result}`);
    console.log(`  undefined: ${result === undefined}`);
    console.log(`  null: ${result === null}`);

    if (result) {
      console.log(`  constructor: ${result.constructor?.name}`);
      console.log(`  id._serialized: ${result.id?._serialized}`);
      console.log(`  from: ${result.from}`);
      console.log(`  to: ${result.to}`);
      console.log(`  ack: ${result.ack}`);
      console.log(`  type: ${result.type}`);
      console.log(`  timestamp: ${result.timestamp}`);
      console.log(`  body: ${result.body}`);
      console.log('');
      console.log('✓ MESSAGE SENT SUCCESSFULLY');
      console.log(`  Message ID: ${result.id?._serialized}`);
    } else {
      console.log('');
      console.log('✗ sendMessage() returned undefined/null');
      console.log('');
      console.log('The issue persists. whatsapp-web.js cannot send messages');
      console.log('with the current WhatsApp Web LID system.');
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.log(`ERROR: ${error.message}`);
    console.log(`Stack: ${error.stack?.substring(0, 200)}`);
  }

  console.log('');
  console.log('Closing...');
  await client.destroy();
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
