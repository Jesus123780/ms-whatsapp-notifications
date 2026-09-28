import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { ExcelContactReader } from '../../src/infrastructure/spreadsheet/ExcelContactReader';

const TEST_DIR = path.resolve('./tests/fixtures');
const VALID_FILE = path.join(TEST_DIR, 'test_contacts.xlsx');
const NO_PHONE_COLUMN_FILE = path.join(TEST_DIR, 'no_phone_column.xlsx');
const EMPTY_ROWS_FILE = path.join(TEST_DIR, 'empty_rows.xlsx');

describe('ExcelContactReader', () => {
  const reader = new ExcelContactReader();

  beforeAll(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Create valid test file
    const wb1 = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['NOMBRE', 'TELEFONO'],
      ['Adrian Ortiz', '304-3222471'],
      ['Samuel Bowie', '321-9020883'],
      ['Keider Castro', '321-6653901'],
    ]);
    XLSX.utils.book_append_sheet(wb1, ws1, 'Hoja1');
    XLSX.writeFile(wb1, VALID_FILE);

    // Create file without TELEFONO column
    const wb2 = XLSX.utils.book_new();
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['NOMBRE', 'EMAIL'],
      ['Adrian', 'adrian@test.com'],
    ]);
    XLSX.utils.book_append_sheet(wb2, ws2, 'Hoja1');
    XLSX.writeFile(wb2, NO_PHONE_COLUMN_FILE);

    // Create file with empty rows
    const wb3 = XLSX.utils.book_new();
    const ws3 = XLSX.utils.aoa_to_sheet([
      ['NOMBRE', 'TELEFONO'],
      ['Adrian Ortiz', '304-3222471'],
      ['', ''],
      ['Samuel Bowie', '321-9020883'],
      ['Empty Phone', ''],
    ]);
    XLSX.utils.book_append_sheet(wb3, ws3, 'Hoja1');
    XLSX.writeFile(wb3, EMPTY_ROWS_FILE);
  });

  afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should read contacts from valid Excel file', () => {
    const contacts = reader.read(VALID_FILE);
    expect(contacts).toHaveLength(3);
    expect(contacts[0]!.name).toBe('Adrian Ortiz');
    expect(contacts[0]!.phone).toBe('304-3222471');
  });

  it('should throw when TELEFONO column is missing', () => {
    expect(() => reader.read(NO_PHONE_COLUMN_FILE)).toThrow('No se encontró la columna TELEFONO');
  });

  it('should skip rows with empty phone', () => {
    const contacts = reader.read(EMPTY_ROWS_FILE);
    expect(contacts).toHaveLength(2);
  });

  it('should return spreadsheet info', () => {
    const info = reader.getInfo(VALID_FILE);
    expect(info.fileName).toBe('test_contacts.xlsx');
    expect(info.sheetName).toBe('Hoja1');
    expect(info.columns).toContain('NOMBRE');
    expect(info.columns).toContain('TELEFONO');
    expect(info.totalRows).toBe(3);
  });

  it('should throw when file does not exist', () => {
    expect(() => reader.read('/nonexistent/file.xlsx')).toThrow();
  });
});
