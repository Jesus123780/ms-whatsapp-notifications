export class Logger {
  private static readonly SEPARATOR = '========================================';
  private static readonly HALF_SEP = '----------------------------------------';

  static header(title: string): void {
    console.log('');
    console.log(Logger.SEPARATOR);
    console.log(title);
    console.log(Logger.SEPARATOR);
    console.log('');
  }

  static section(title: string): void {
    console.log('');
    console.log(Logger.HALF_SEP);
    console.log(title);
    console.log(Logger.HALF_SEP);
    console.log('');
  }

  static success(message: string): void {
    console.log(`  ✓ ${message}`);
  }

  static error(message: string): void {
    console.error(`  ✗ ${message}`);
  }

  static warn(message: string): void {
    console.log(`  ⚠️ ${message}`);
  }

  static info(message: string): void {
    console.log(`  ${message}`);
  }

  static blank(): void {
    console.log('');
  }

  static progress(current: number, total: number, message: string): void {
    console.log(`  [${current}/${total}] ${message}`);
  }

  static separator(): void {
    console.log(Logger.SEPARATOR);
  }
}
