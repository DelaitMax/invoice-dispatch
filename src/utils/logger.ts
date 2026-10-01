import pino from "pino";
import { env } from "@/config/env";

type LogMeta = Record<string, unknown>;

export interface Logger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
  child(bindings: LogMeta): Logger;
}

const pinoLogger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ["req.headers.authorization", "req.headers['x-api-key']", "*.apiKey", "*.MAILGUN_API_KEY", "*.password"],
    censor: "[redacted]",
  },
  ...(env.LOG_PRETTY
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});

function wrap(instance: pino.Logger): Logger {
  return {
    info: (message, meta) => instance.info(meta ?? {}, message),
    warn: (message, meta) => instance.warn(meta ?? {}, message),
    error: (message, meta) => instance.error(meta ?? {}, message),
    debug: (message, meta) => instance.debug(meta ?? {}, message),
    child: (bindings) => wrap(instance.child(bindings)),
  };
}

export const logger: Logger = wrap(pinoLogger);
