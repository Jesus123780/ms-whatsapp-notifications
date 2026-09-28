import * as XLSX from 'xlsx';
import path from 'path';
import { SpreadsheetReader, RawContact, SpreadsheetInfo } from '../../domain/ports/SpreadsheetReader';
import { SpreadsheetError } from '../../shared/errors';

const REQUIRED_COLUMN = 'TELEFONO';
const NAME_COLUMN = 'NOMBRE';

type SheetRow = Record<string, string | number | boolean | null | undefined>;

export class ExcelContactReader implements SpreadsheetReader {
  read(filePath: string): RawContact[] {
    const workbook = this.loadWorkbook(filePath);
    const sheet = this.getFirstSheet(workbook);
    const data = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' });

    if (data.length === 0) {
      throw new SpreadsheetError('El archivo Excel no contiene datos');
    }

    // Validate column exists
    const firstRow = data[0];
    if (!firstRow) {
      throw new SpreadsheetError('El archivo Excel no contiene datos');
    }

    const headers = Object.keys(firstRow);
    const phoneColumn = headers.find(
      (h) => h.trim().toUpperCase() === REQUIRED_COLUMN,
    );

    if (!phoneColumn) {
      throw new SpreadsheetError(
        `No se encontró la columna ${REQUIRED_COLUMN} en el archivo Excel. Columnas encontradas: ${headers.join(', ')}`,
      );
    }

    const nameColumn = headers.find(
      (h) => h.trim().toUpperCase() === NAME_COLUMN,
    );

    const contacts: RawContact[] = [];

    for (const row of data) {
      const phoneValue = row[phoneColumn];
      const phone = phoneValue != null ? String(phoneValue).trim() : '';
      if (!phone) continue;

      let name = 'Sin nombre';
      if (nameColumn) {
        const nameValue = row[nameColumn];
        name = nameValue != null ? String(nameValue).trim() : 'Sin nombre';
      }

      contacts.push({ name, phone });
    }

    return contacts;
  }

  getInfo(filePath: string): SpreadsheetInfo {
    const workbook = this.loadWorkbook(filePath);
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new SpreadsheetError('El archivo Excel no tiene hojas');
    }

    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new SpreadsheetError('No se pudo leer la hoja del Excel');
    }

    const data = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' });
    const firstRow = data[0];
    const headers = firstRow ? Object.keys(firstRow) : [];
    const relevantHeaders = headers.filter((h) => !h.startsWith('__EMPTY'));

    return {
      fileName: path.basename(filePath),
      sheetName,
      columns: relevantHeaders,
      totalRows: data.length,
    };
  }

  private loadWorkbook(filePath: string): XLSX.WorkBook {
    try {
      return XLSX.readFile(filePath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new SpreadsheetError(`No se pudo leer el archivo Excel: ${msg}`);
    }
  }

  private getFirstSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new SpreadsheetError('El archivo Excel no tiene hojas');
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new SpreadsheetError('No se pudo acceder a la primera hoja');
    }
    return sheet;
  }
}
