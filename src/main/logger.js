const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

let LOG_DIR;
let LOG_FILE;

if (process.env.NODE_ENV !== 'test') {
  try {
    const userDataPath = app.getPath('userData');
    LOG_DIR = path.join(userDataPath, 'logs');
    fs.ensureDirSync(LOG_DIR);
    LOG_FILE = path.join(LOG_DIR, `app-${new Date().toISOString().split('T')[0]}.log`);
  } catch (error) {
    console.error('Failed to initialize logger:', error);
  }
}

function log(level, message, error = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `${timestamp} [${level.toUpperCase()}] - ${message}`;
  if (error) {
    logMessage += `\n${error.stack || error.toString()}`;
  }
  console.log(logMessage);
  if (LOG_FILE) {
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
  }
}

const logger = {
  info: (message) => log('info', message),
  warn: (message) => log('warn', message),
  error: (message, error) => log('error', message, error),
};

process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION', error);
});

module.exports = logger;
