type LogLevel = "info" | "warn" | "error" | "debug";

class Logger {
  private prefix: string;

  constructor(prefix: string = "ContinuityBridge") {
    this.prefix = prefix;
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] [${this.prefix}] ${message}${metaStr}`;
  }

  info(message: string, meta?: any): void {
    console.log(this.formatMessage("info", message, meta));
  }

  warn(message: string, meta?: any): void {
    console.warn(this.formatMessage("warn", message, meta));
  }

  error(message: string, error?: any): void {
    console.error(this.formatMessage("error", message, error));
  }

  debug(message: string, meta?: any): void {
    if (process.env.DEBUG) {
      console.debug(this.formatMessage("debug", message, meta));
    }
  }

  child(name: string): Logger {
    return new Logger(`${this.prefix}:${name}`);
  }
}

export const logger = new Logger();
