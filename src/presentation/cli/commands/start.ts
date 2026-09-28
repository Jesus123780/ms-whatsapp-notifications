import { loadConfig } from '../../../infrastructure/config/env';
import { WhatsAppWebClient } from '../../../infrastructure/whatsapp/WhatsAppWebClient';
import { Logger } from '../../../infrastructure/logger/Logger';
import { APP_NAME } from '../../../shared/constants/messages';

async function main(): Promise<void> {
  const config = loadConfig();

  Logger.header(APP_NAME);
  Logger.info('Modo: WhatsApp Login');
  Logger.blank();

  const whatsAppClient = new WhatsAppWebClient({
    clientId: config.whatsappClientId,
  });

  Logger.info('Inicializando WhatsApp...');
  await whatsAppClient.initialize();

  Logger.blank();
  Logger.success('Sesión activa. Puedes cerrar con Ctrl+C.');
  Logger.info('La sesión quedará guardada para futuros usos.');

  // Keep process alive
  process.on('SIGINT', () => {
    Logger.blank();
    Logger.info('Cerrando sesión...');
    void whatsAppClient.destroy().then(() => {
      Logger.success('Sesión cerrada correctamente');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  Logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
