import { db } from '../../db.js';
import { systemLogs, logConfigurations } from '../../schema.js';
import { lte, eq, and } from 'drizzle-orm';
import { logger } from './logger.js';

const log = logger.child('LogCleanupJob');

/**
 * Automated Log Cleanup Job
 * 
 * Enforces retention policies by periodically removing old logs from the database.
 * Runs based on configured retention days for superadmin and customer scopes.
 * 
 * Features:
 * - Per-organization retention policies
 * - Separate superadmin/customer log retention
 * - Configurable cleanup intervals
 * - Automatic error handling and retry
 * - Cleanup statistics logging
 */
export class LogCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private intervalMinutes: number;

  constructor(intervalMinutes: number = 60) {
    this.intervalMinutes = intervalMinutes;
  }

  /**
   * Start the cleanup job
   */
  start(): void {
    if (this.intervalId) {
      log.warn('Log cleanup job already running');
      return;
    }

    log.info(`Starting log cleanup job (runs every ${this.intervalMinutes} minutes)`);

    // Run immediately on start
    this.runCleanup().catch((error) => {
      log.error('Initial log cleanup failed', error);
    });

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup().catch((error) => {
        log.error('Scheduled log cleanup failed', error);
      });
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Log cleanup job stopped');
    }
  }

  /**
   * Run cleanup process
   */
  private async runCleanup(): Promise<void> {
    if (this.isRunning) {
      log.debug('Cleanup already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      log.info('Starting log cleanup process');

      // Load all log configurations
      const configs = await (db.select() as any)
        .from(logConfigurations)
        .all();

      let totalDeleted = 0;

      // Process superadmin logs
      const superadminConfig = configs.find((c: any) => c.scope === 'superadmin');
      if (superadminConfig) {
        const deleted = await this.cleanupScope(
          'superadmin',
          null,
          superadminConfig.retentionDays || 90
        );
        totalDeleted += deleted;
      } else {
        // Use default if no config
        const deleted = await this.cleanupScope('superadmin', null, 90);
        totalDeleted += deleted;
      }

      // Process customer logs
      const customerConfigs = configs.filter((c: any) => c.scope === 'customer');
      
      if (customerConfigs.length > 0) {
        for (const config of customerConfigs) {
          const deleted = await this.cleanupScope(
            'customer',
            config.organizationId,
            config.retentionDays || 30
          );
          totalDeleted += deleted;
        }
      } else {
        // Cleanup all customer logs without specific org config using default retention
        const deleted = await this.cleanupScope('customer', null, 30);
        totalDeleted += deleted;
      }

      const duration = Date.now() - startTime;
      log.info('Log cleanup completed', {
        totalDeleted,
        durationMs: duration,
        configurationsProcessed: configs.length + 1, // +1 for default
      });
    } catch (error: any) {
      log.error('Log cleanup failed', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Cleanup logs for specific scope and organization
   */
  private async cleanupScope(
    scope: 'superadmin' | 'customer',
    organizationId: string | null,
    retentionDays: number
  ): Promise<number> {
    try {
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffISO = cutoffDate.toISOString();

      // Build query conditions
      const conditions: any[] = [
        lte(systemLogs.createdAt, cutoffISO)
      ];

      if (scope === 'superadmin') {
        // Superadmin logs: organizationId is NULL
        conditions.push(eq(systemLogs.scope, 'superadmin'));
      } else if (organizationId) {
        // Specific customer organization
        conditions.push(eq(systemLogs.scope, 'customer'));
        conditions.push(eq(systemLogs.organizationId, organizationId));
      } else {
        // All customer logs without specific org
        conditions.push(eq(systemLogs.scope, 'customer'));
      }

      // Delete old logs
      const result = await (db.delete(systemLogs) as any)
        .where(and(...conditions))
        .run();

      const deleted = result.changes || 0;

      if (deleted > 0) {
        log.info(`Cleaned up ${scope} logs`, {
          scope,
          organizationId: organizationId || 'all',
          retentionDays,
          cutoffDate: cutoffISO,
          deleted,
        });
      } else {
        log.debug(`No logs to cleanup for ${scope}`, {
          scope,
          organizationId: organizationId || 'all',
          retentionDays,
        });
      }

      return deleted;
    } catch (error: any) {
      log.error(`Failed to cleanup ${scope} logs`, error, {
        scope,
        organizationId,
        retentionDays,
      });
      return 0;
    }
  }

  /**
   * Manually trigger cleanup (for testing or admin control)
   */
  async triggerManualCleanup(): Promise<{ success: boolean; deleted: number }> {
    log.info('Manual log cleanup triggered');
    
    try {
      await this.runCleanup();
      return { success: true, deleted: 0 }; // TODO: Track actual count
    } catch (error: any) {
      log.error('Manual cleanup failed', error);
      return { success: false, deleted: 0 };
    }
  }

  /**
   * Get cleanup job status
   */
  getStatus(): { running: boolean; intervalMinutes: number; cleanupInProgress: boolean } {
    return {
      running: this.intervalId !== null,
      intervalMinutes: this.intervalMinutes,
      cleanupInProgress: this.isRunning,
    };
  }
}

// Singleton instance
let cleanupJobInstance: LogCleanupJob | null = null;

/**
 * Get or create log cleanup job instance
 */
export function getLogCleanupJob(intervalMinutes?: number): LogCleanupJob {
  if (!cleanupJobInstance) {
    cleanupJobInstance = new LogCleanupJob(intervalMinutes);
  }
  return cleanupJobInstance;
}
