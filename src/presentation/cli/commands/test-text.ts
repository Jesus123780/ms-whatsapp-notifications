/**
 * Diagnostic test: sends a plain text message to the test contact.
 * Logs all WhatsApp internal IDs, client state, ACK status.
 * Usage: npm run send:test:text
 */
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';

dotenv.config();

const TEST_PHONE = process.env.TEST_PHONE ?? '573024585004';
const TEST_NAME = process.env.TEST_NAME ?? 'Odalis';
const CLIENT_ID = process.env.WHATSAPP_CLIENT_ID ?? 'il-salone-sender';

const TEST_MESSAGE = 'PRUEBA WHATSAPP - IL SALONE';

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function header(title: string): void {
  console.log('');
  console.log('========================================');
  console.log(title);
  console.log('========================================');
  console.log('');
}

function separator(): void {
  console.log('----------------------------------------');
}

async function main(): Promise<void> {
  header('DIAGNÓSTICO WHATSAPP - ENVÍO TEXTO');

  log(`Node: ${process.version}`);
  log(`whatsapp-web.js: 1.34.7`);
  log(`Puppeteer: 24.38.0`);
  log(`OS: ${process.platform} ${process.arch}`);
  log(`Test phone: ${TEST_PHONE}`);
  log(`Test name: ${TEST_NAME}`);
  log(`Client ID: ${CLIENT_ID}`);
  separator();

  // Initialize client
  log('Inicializando WhatsApp...');

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID }),
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

  // ACK tracking (for future use)
  client.on('message_ack', (msg: any, ack: any) => {
    console.log(`  [ACK EVENT] msgId=${msg?.id?._serialized} ack=${ack}`);
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout 120s')), 120000);

    client.on('qr', (qr: string) => {
      log('Escanea el QR:');
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => log('✓ Autenticado'));

    client.on('ready', () => {
      clearTimeout(timeout);
      log('✓ WhatsApp READY');
      resolve();
    });

    client.on('auth_failure', (msg: string) => {
      clearTimeout(timeout);
      reject(new Error(`Auth failure: ${msg}`));
    });

    void client.initialize();
  });

  separator();

  // 1. Client info
  log('INFORMACIÓN DEL CLIENTE:');
  const info = client.info;
  log(`  WID: ${info?.wid?._serialized ?? 'N/A'}`);
  log(`  Platform: ${info?.platform ?? 'N/A'}`);
  log(`  Pushname: ${info?.pushname ?? 'N/A'}`);
  separator();

  // 2. Client state
  const state = await client.getState();
  log(`WhatsApp State: ${state}`);
  if (state !== 'CONNECTED') {
    log('✗ ERROR: Cliente no está CONNECTED. No se puede enviar.');
    await client.destroy();
    process.exit(1);
  }
  log('✓ Estado: CONNECTED');
  separator();

  // 3. getNumberId - usando el formato EXACTO que funciona en monitoring-grafana
  log('RESOLUCIÓN DE NÚMERO:');
  log(`  Número solicitado: ${TEST_PHONE}`);

  // IMPORTANTE: En monitoring-grafana, getNumberId recibe el formato completo con @c.us
  const chatIdCus = `${TEST_PHONE}@c.us`;
  log(`  Formato para getNumberId: ${chatIdCus}`);

  const numberId = await client.getNumberId(chatIdCus);
  log(`  Resultado getNumberId: ${JSON.stringify(numberId)}`);

  if (!numberId) {
    log('✗ ERROR: El número no está registrado en WhatsApp');
    await client.destroy();
    process.exit(1);
  }

  log(`  numberId.user: ${numberId.user}`);
  log(`  numberId.server: ${numberId.server}`);
  log(`  numberId._serialized: ${numberId._serialized}`);
  // 4. Chat ID resolution info
  const chatIdFromNumberId = numberId._serialized;

  log('CHAT IDs DISPONIBLES:');
  log(`  Formato @c.us (como monitoring-grafana): ${chatIdCus}`);
  log(`  Formato numberId._serialized: ${chatIdFromNumberId}`);
  separator();

  // 5. Try to get chat (diagnostic only - monitoring-grafana does NOT do this)
  log('RESOLUCIÓN DE CHAT (diagnóstico):');

  try {
    const chatCus = await client.getChatById(chatIdCus);
    log(`  Chat @c.us resuelto: ✓`);
    log(`    id._serialized: ${chatCus.id._serialized}`);
    log(`    name: ${chatCus.name ?? '(sin nombre)'}`);
    log(`    isGroup: ${chatCus.isGroup}`);
  } catch (e) {
    log(`  Chat @c.us: ✗ No resuelto (${(e as Error).message})`);
    log(`  NOTA: monitoring-grafana NO usa getChatById - envía directamente a chat_id`);
  }

  separator();
  log(`ENVIARÁ A: ${chatIdCus} (mismo patrón que monitoring-grafana)`);
  separator();

  // 6. Confirmation
  log(`¿Enviar "${TEST_MESSAGE}" a ${TEST_NAME} (${chatIdCus})?`);
  log('Escribe ENVIAR:');

  const confirmed = await new Promise<boolean>((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  > ', (answer: string) => {
      rl.close();
      resolve(answer.trim() === 'ENVIAR');
    });
  });

  if (!confirmed) {
    log('Cancelado.');
    await client.destroy();
    process.exit(0);
  }

  // 7. Send - Using direct page evaluation as workaround for smba accounts
  separator();
  log('ENVIANDO MENSAJE...');
  log(`  chatId: ${chatIdCus}`);
  log(`  message: ${TEST_MESSAGE}`);
  log('');

  log('--- DIAGNÓSTICO PRE-ENVÍO ---');
  const preState = await client.getState();
  log(`  client.getState(): ${preState}`);
  log(`  client.info?.wid?._serialized: ${client.info?.wid?._serialized}`);
  log(`  client.info?.platform: ${client.info?.platform}`);
  log('');

  log('--- EJECUTANDO sendMessage() ---');
  let result: any;
  try {
    result = await client.sendMessage(chatIdCus, TEST_MESSAGE);
  } catch (sendErr: any) {
    log(`  sendMessage THREW: ${sendErr?.message ?? sendErr}`);
  }

  log('');
  log('--- DIAGNÓSTICO POST-ENVÍO ---');
  log(`  typeof result: ${typeof result}`);
  log(`  result === undefined: ${result === undefined}`);

  if (result !== null && result !== undefined) {
    log(`  ✓ sendMessage retornó un objeto`);
    log(`  result.id?._serialized: ${result?.id?._serialized}`);
    log(`  result.from: ${result?.from}`);
    log(`  result.to: ${result?.to}`);
    log(`  result.ack: ${result?.ack}`);
    log(`  result.body: ${result?.body?.substring?.(0, 50)}`);
    log('');
    log('  ✓ MENSAJE ENVIADO CORRECTAMENTE');
  } else {
    log('  sendMessage retornó undefined');
    log('');
    log('  Intentando envío via evaluación directa de página (workaround smba)...');
    log('');

    // Workaround: Use page.evaluate to call WWebJS send directly
    try {
      const page = (client as any).pupPage;
      if (!page) {
        log('  ✗ No se pudo acceder a pupPage');
        await client.destroy();
        process.exit(1);
      }

      const sendResult = await page.evaluate(async (chatId: string, msg: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const WWebJS = (globalThis as any).WWebJS;
        const chat = await WWebJS.getChat(chatId);
        if (!chat) return { error: 'Chat not found via WWebJS.getChat' };
        const result = await chat.sendMessage(msg);
        if (!result) return { error: 'sendMessage returned falsy' };
        return {
          success: true,
          id: result.id?._serialized ?? result.id?.id ?? 'unknown',
          from: result.id?.remote ?? 'unknown',
          ack: result.ack ?? 0
        };
      }, chatIdCus, TEST_MESSAGE);

      log(`  Resultado evaluación directa: ${JSON.stringify(sendResult)}`);

      if (sendResult?.success) {
        log('');
        log(`  ✓ MENSAJE ENVIADO VIA EVALUACIÓN DIRECTA`);
        log(`  Message ID: ${sendResult.id}`);
      } else if (sendResult?.error) {
        log(`  ✗ Error: ${sendResult.error}`);
        log('');
        log('  DIAGNÓSTICO FINAL:');
        log('  El problema es a nivel de protocolo WhatsApp Web.');
        log('  La cuenta smba (Business) no puede iniciar conversaciones via whatsapp-web.js.');
        log('  Solución: envía manualmente un "Hola" desde tu WhatsApp a +57 302 4585004');
        log('  para crear el chat, y luego vuelve a ejecutar este script.');
      }
    } catch (evalErr: any) {
      log(`  ✗ Error en evaluación directa: ${evalErr?.message}`);
    }
  }

  separator();
  log('Cerrando...');
  await client.destroy();
  log('✓ Finalizado');
  process.exit(0);
}

main().catch((err) => {
  console.error('ERROR FATAL:', err);
  process.exit(1);
});
