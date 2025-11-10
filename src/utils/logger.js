/**
 * File-based logger to avoid interfering with OpenCode UI
 * Logs to /tmp/agent-monitor.log
 * JavaScript version for use in .js files
 */

const { appendFileSync } = require('node:fs');

const LOG_FILE = '/tmp/agent-monitor.log';

function formatLogEntry(level, ...args) {
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

function writeLog(level, ...args) {
  try {
    const entry = formatLogEntry(level, ...args);
    appendFileSync(LOG_FILE, entry, 'utf8');
  } catch (_error) {
    // Silently fail if we can't write to log - don't interfere with plugin
  }
}

module.exports = {
  logger: {
    log: (...args) => writeLog('INFO', ...args),
    info: (...args) => writeLog('INFO', ...args),
    warn: (...args) => writeLog('WARN', ...args),
    error: (...args) => writeLog('ERROR', ...args),
    debug: (...args) => writeLog('DEBUG', ...args),
  },
};
