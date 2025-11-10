/**
 * File-based logger to avoid interfering with OpenCode UI
 * Logs to /tmp/agent-monitor.log
 */

import { appendFileSync } from 'node:fs';

const LOG_FILE = '/tmp/agent-monitor.log';

function formatLogEntry(level: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  return `[${timestamp}] [${level}] ${message}\n`;
}

function writeLog(level: string, ...args: unknown[]): void {
  try {
    const entry = formatLogEntry(level, ...args);
    appendFileSync(LOG_FILE, entry, 'utf8');
  } catch (_error) {
    // Silently fail if we can't write to log - don't interfere with plugin
  }
}

export const logger = {
  log: (...args: unknown[]) => writeLog('INFO', ...args),
  info: (...args: unknown[]) => writeLog('INFO', ...args),
  warn: (...args: unknown[]) => writeLog('WARN', ...args),
  error: (...args: unknown[]) => writeLog('ERROR', ...args),
  debug: (...args: unknown[]) => writeLog('DEBUG', ...args),
};
