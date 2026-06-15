import loglevel, { LogLevelDesc } from 'loglevel';

const level = (process.env.LOG_LEVEL as LogLevelDesc) || 'info';

export function getLogger(name: string) {
  const logger = loglevel.getLogger(name);
  logger.setLevel(level);
  return logger;
}

export function getCommonLogger() {
  const logger = loglevel.getLogger('Common');
  logger.setLevel(level);
  return {
    debug: (...args: unknown[]) => logger.debug(...args),
    info: (...args: unknown[]) => logger.info(...args),
    warn: (...args: unknown[]) => logger.warn(...args),
    error: (...args: unknown[]) => logger.error(...args),
    setLevel: (lvl: LogLevelDesc) => logger.setLevel(lvl),
  };
}
