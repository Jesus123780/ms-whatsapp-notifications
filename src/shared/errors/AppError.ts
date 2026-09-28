export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class WhatsAppError extends AppError {
  constructor(message: string) {
    super(message, 'WHATSAPP_ERROR');
    this.name = 'WhatsAppError';
  }
}

export class SpreadsheetError extends AppError {
  constructor(message: string) {
    super(message, 'SPREADSHEET_ERROR');
    this.name = 'SpreadsheetError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}
