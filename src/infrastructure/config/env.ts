import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export enum SendMode {
  MEDIA_WITH_CAPTION = 'MEDIA_WITH_CAPTION',
  TEXT_THEN_IMAGE = 'TEXT_THEN_IMAGE',
}

export interface AppConfig {
  nodeEnv: string;
  whatsappClientId: string;
  excelPath: string;
  campaignImagePath: string;
  enableBulkSend: boolean;
  testMode: boolean;
  testPhone: string;
  testName: string;
  maxMessagesPerRun: number;
  minDelayBetweenMessagesMs: number;
  maxDelayBetweenMessagesMs: number;
  testSendDelayMs: number;
  delayBetweenTextAndImageMs: number;
  sendMode: SendMode;
  maxRetries: number;
  httpPort: number;
  corsOrigin: string;
}

function getEnvString(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  return raw.toLowerCase() === 'true';
}

function getEnvSendMode(key: string, defaultValue: SendMode): SendMode {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const validModes: string[] = [SendMode.MEDIA_WITH_CAPTION, SendMode.TEXT_THEN_IMAGE];
  if (validModes.includes(raw)) {
    return raw as SendMode;
  }
  throw new Error(`Environment variable ${key} must be MEDIA_WITH_CAPTION or TEXT_THEN_IMAGE`);
}

export function loadConfig(): AppConfig {
  return {
    nodeEnv: getEnvString('NODE_ENV', 'development'),
    whatsappClientId: getEnvString('WHATSAPP_CLIENT_ID', 'il-salone-sender'),
    excelPath: path.resolve(getEnvString('EXCEL_PATH', './base_de_datos_clientes.xlsx')),
    campaignImagePath: path.resolve(
      getEnvString('CAMPAIGN_IMAGE_PATH', './assets/il-salone-sorteo.png'),
    ),
    enableBulkSend: getEnvBoolean('ENABLE_BULK_SEND', false),
    testMode: getEnvBoolean('TEST_MODE', true),
    testPhone: getEnvString('TEST_PHONE', '573024585004'),
    testName: getEnvString('TEST_NAME', 'Odalis'),
    maxMessagesPerRun: getEnvNumber('MAX_MESSAGES_PER_RUN', 50),
    minDelayBetweenMessagesMs: getEnvNumber('MIN_DELAY_BETWEEN_MESSAGES_MS', 5000),
    maxDelayBetweenMessagesMs: getEnvNumber('MAX_DELAY_BETWEEN_MESSAGES_MS', 10000),
    testSendDelayMs: getEnvNumber('TEST_SEND_DELAY_MS', 3000),
    delayBetweenTextAndImageMs: getEnvNumber('DELAY_BETWEEN_TEXT_AND_IMAGE_MS', 5000),
    sendMode: getEnvSendMode('SEND_MODE', SendMode.MEDIA_WITH_CAPTION),
    maxRetries: getEnvNumber('MAX_RETRIES', 2),
    httpPort: getEnvNumber('HTTP_PORT', 3001),
    corsOrigin: getEnvString('CORS_ORIGIN', 'http://localhost:3000'),
  };
}
