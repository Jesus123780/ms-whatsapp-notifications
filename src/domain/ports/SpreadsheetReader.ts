export interface RawContact {
  name: string;
  phone: string;
}

export interface SpreadsheetInfo {
  fileName: string;
  sheetName: string;
  columns: string[];
  totalRows: number;
}

export interface SpreadsheetReader {
  read(filePath: string): RawContact[];
  getInfo(filePath: string): SpreadsheetInfo;
}
