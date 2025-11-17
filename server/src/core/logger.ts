import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { db } from '../../db.js';
import { systemLogs, logConfigurations } from '../../schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

type LogLevel = "debug" | "info" | "warn" | "error";
type LogScope = "superadmin" | "customer";

interface LogContext {
  scope?: LogScope;  // superadmin or customer
  service?: string;
  component?: string;
  flowId?: string;
  flowName?: string;
  runId?: string;
  traceId?: string;
  userId?: string;
  organizationId?: string;
  requestId?: string;
  httpMethod?: string;
  httpPath?: string;
  httpStatus?: number;
  durationMs?: number;
  errorStack?: string;
  errorCode?: string;
  [key: string]: any;
}

interface LogConfig {
  minLevel: LogLevel;
  retentionDays: number;
  fileLoggingEnabled: boolean;
  fileRotationDays: number;
  dbLoggingEnabled: boolean;
  logFlowExecutions: boolean;
  logApiRequests: boolean;
  logAuthEvents: boolean;
  logErrors: boolean;
}

// In-memory cache for log configurations
const configCache = new Map<string, LogConfig>();
let superadminConfig: LogConfig | null = null;

/**
 * Professional Two-Level Logger:
 * - Superadmin: Global system logs (auth, licenses, exports, user management)
 * - Customer: Per-organization logs (flows, integrations, business operations)
 */
class Logger {
  private prefix: string;
  private winston: winston.Logger;
  private superadminWinston: winston.Logger;
  private defaultScope: LogScope;

  constructor(prefix: string = "ContinuityBridge", defaultScope: LogScope = "superadmin") {
    this.prefix = prefix;
    this.defaultScope = defaultScope;

    // Superadmin Winston logger (global)
    this.superadminWinston = this.createWinstonLogger('superadmin');
    
    // Customer Winston logger (default)
    this.winston = this.createWinstonLogger('customer');
    
    // Load configurations on startup
    this.loadConfigurations();
  }

  /**
   * Create Winston logger for specific scope
   */
  private createWinstonLogger(scope: LogScope): winston.Logger {
    const logDir = scope === 'superadmin' ? 'logs/superadmin' : 'logs/customer';
    const level = process.env.LOG_LEVEL || 'info';

    return winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        // Console output
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service, scope: logScope, organizationId, ...meta }) => {
              const scopeTag = logScope === 'customer' && organizationId ? `[${organizationId}]` : `[${logScope || 'system'}]`;
              const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${scopeTag} [${level}] [${service || 'App'}] ${message}${metaStr}`;
            })
          ),
        }),
        
        // File output - daily rotation (scope-specific)
        new DailyRotateFile({
          dirname: logDir,
          filename: `${scope}-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
          format: winston.format.json(),
        }),
        
        // Error file - separate errors (scope-specific)
        new DailyRotateFile({
          dirname: logDir,
          filename: `${scope}-error-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '90d', // Keep errors longer
          format: winston.format.json(),
        }),
      ],
    });
  }

  /**
   * Load log configurations from database
   */
  private async loadConfigurations(): Promise<void> {
    try {
      // Load superadmin config
      const superadminResults = await (db.select() as any)
        .from(logConfigurations)
        .where(eq(logConfigurations.scope, 'superadmin'))
        .limit(1);
      
      const superadminCfg = superadminResults[0];
      
      if (superadminCfg) {
        superadminConfig = this.parseConfig(superadminCfg);
      } else {
        // Default superadmin config
        superadminConfig = {
          minLevel: 'info',
          retentionDays: 90,
          fileLoggingEnabled: true,
          fileRotationDays: 30,
          dbLoggingEnabled: true,
          logFlowExecutions: false,
          logApiRequests: true,
          logAuthEvents: true,
          logErrors: true,
        };
      }

      // Load customer configs
      const customerConfigs = await (db.select() as any)
        .from(logConfigurations)
        .where(eq(logConfigurations.scope, 'customer'));
      
      customerConfigs.forEach((cfg: any) => {
        if (cfg.organizationId) {
          configCache.set(cfg.organizationId, this.parseConfig(cfg));
        }
      });
    } catch (error: any) {
      console.error('[Logger] Failed to load configurations:', error.message);
    }
  }

  /**
   * Parse config from database
   */
  private parseConfig(cfg: any): LogConfig {
    return {
      minLevel: cfg.minLevel || 'info',
      retentionDays: cfg.retentionDays || 30,
      fileLoggingEnabled: cfg.fileLoggingEnabled !== false,
      fileRotationDays: cfg.fileRotationDays || 7,
      dbLoggingEnabled: cfg.dbLoggingEnabled !== false,
      logFlowExecutions: cfg.logFlowExecutions !== false,
      logApiRequests: cfg.logApiRequests !== false,
      logAuthEvents: cfg.logAuthEvents !== false,
      logErrors: cfg.logErrors !== false,
    };
  }

  /**
   * Get config for scope/organization
   */
  private getConfig(scope: LogScope, organizationId?: string): LogConfig {
    if (scope === 'superadmin') {
      return superadminConfig || {
        minLevel: 'info',
        retentionDays: 90,
        fileLoggingEnabled: true,
        fileRotationDays: 30,
        dbLoggingEnabled: true,
        logFlowExecutions: false,
        logApiRequests: true,
        logAuthEvents: true,
        logErrors: true,
      };
    }

    // Customer config
    if (organizationId && configCache.has(organizationId)) {
      return configCache.get(organizationId)!;
    }

    // Default customer config
    return {
      minLevel: 'info',
      retentionDays: 30,
      fileLoggingEnabled: true,
      fileRotationDays: 7,
      dbLoggingEnabled: true,
      logFlowExecutions: true,
      logApiRequests: true,
      logAuthEvents: true,
      logErrors: true,
    };
  }

  /**
   * Check if should log based on config
   */
  private shouldLog(level: LogLevel, context?: LogContext): boolean {
    const scope = context?.scope || this.defaultScope;
    const config = this.getConfig(scope, context?.organizationId);

    // Check min level
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const minLevelIndex = levels.indexOf(config.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    
    if (currentLevelIndex < minLevelIndex) {
      return false;
    }

    // Check specific log types
    if (context?.flowId && !config.logFlowExecutions) return false;
    if (context?.httpMethod && !config.logApiRequests) return false;
    if (level === 'error' && !config.logErrors) return false;

    return true;
  }

  /**
   * Write log to database (async, non-blocking)
   */
  private async writeToDatabase(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): Promise<void> {
    const scope = context?.scope || this.defaultScope;
    const config = this.getConfig(scope, context?.organizationId);
    
    if (!config.dbLoggingEnabled) return;
    if (!this.shouldLog(level, context)) return;

    try {
      const logEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level,
        scope,
        service: this.prefix,
        component: context?.component || null,
        message,
        metadata: context ? JSON.stringify(context) : null,
        flowId: context?.flowId || null,
        flowName: context?.flowName || null,
        runId: context?.runId || null,
        traceId: context?.traceId || null,
        userId: context?.userId || null,
        organizationId: context?.organizationId || null,
        errorStack: context?.errorStack || null,
        errorCode: context?.errorCode || null,
        requestId: context?.requestId || null,
        httpMethod: context?.httpMethod || null,
        httpPath: context?.httpPath || null,
        httpStatus: context?.httpStatus || null,
        durationMs: context?.durationMs || null,
        createdAt: new Date().toISOString(),
      };

      // Non-blocking insert
      (db.insert(systemLogs) as any).values(logEntry).catch((err: any) => {
        console.error('[Logger] Failed to write to database:', err.message);
      });
    } catch (error: any) {
      console.error('[Logger] Database logging error:', error.message);
    }
  }

  /**
   * Write to Winston file logger
   */
  private writeToFile(level: LogLevel, message: string, context?: LogContext): void {
    const scope = context?.scope || this.defaultScope;
    const config = this.getConfig(scope, context?.organizationId);
    
    if (!config.fileLoggingEnabled) return;
    if (!this.shouldLog(level, context)) return;

    const winstonLogger = scope === 'superadmin' ? this.superadminWinston : this.winston;
    const logData = { service: this.prefix, scope, ...context };

    switch (level) {
      case 'debug':
        winstonLogger.debug(message, logData);
        break;
      case 'info':
        winstonLogger.info(message, logData);
        break;
      case 'warn':
        winstonLogger.warn(message, logData);
        break;
      case 'error':
        winstonLogger.error(message, logData);
        break;
    }
  }

  info(message: string, context?: LogContext): void {
    this.writeToFile('info', message, context);
    this.writeToDatabase('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.writeToFile('warn', message, context);
    this.writeToDatabase('warn', message, context);
  }

  error(message: string, error?: any, context?: LogContext): void {
    const errorContext = {
      ...context,
      errorStack: error?.stack || error?.message,
      errorCode: error?.code,
    };
    
    this.writeToFile('error', message, errorContext);
    this.writeToDatabase('error', message, errorContext);
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.DEBUG || process.env.LOG_LEVEL === 'debug') {
      this.writeToFile('debug', message, context);
      this.writeToDatabase('debug', message, context);
    }
  }

  /**
   * Create child logger with nested prefix
   */
  child(name: string, defaultScope?: LogScope): Logger {
    return new Logger(`${this.prefix}:${name}`, defaultScope || this.defaultScope);
  }

  /**
   * Log with performance timing
   */
  timed(message: string, startTime: number, context?: LogContext): void {
    const durationMs = Date.now() - startTime;
    this.info(message, { ...context, durationMs });
  }

  /**
   * Reload configurations (call after updating config in DB)
   */
  async reloadConfigurations(): Promise<void> {
    await this.loadConfigurations();
  }
}

export const logger = new Logger();
export type { LogContext, LogScope, LogConfig };
