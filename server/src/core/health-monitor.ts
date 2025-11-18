import { logger } from "./logger.js";
import { emailService } from "../notifications/index.js";
import { metricsCollector } from "./metrics.js";
import type { ScheduledTask } from "node-cron";
import cron from "node-cron";

const log = logger.child("HealthMonitor");

interface HealthThresholds {
  errorRatePerMinute: number;
  p95LatencyMs: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
}

interface AlertConfig {
  enabled: boolean;
  emailRecipients: string[];
  checkIntervalMinutes: number;
  thresholds: HealthThresholds;
}

/**
 * System Health Monitor
 * Monitors system metrics and sends alerts when thresholds are exceeded
 */
export class HealthMonitor {
  private config: AlertConfig;
  private cronJob: ScheduledTask | null = null;
  private lastAlertTimestamps: Map<string, number> = new Map();
  private alertCooldownMs = 15 * 60 * 1000; // 15 minutes between same alert type

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      emailRecipients: config.emailRecipients ?? [],
      checkIntervalMinutes: config.checkIntervalMinutes ?? 5,
      thresholds: {
        errorRatePerMinute: 10,
        p95LatencyMs: 5000,
        memoryUsagePercent: 85,
        diskUsagePercent: 90,
        ...config.thresholds,
      },
    };
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (!this.config.enabled) {
      log.info("Health monitoring disabled");
      return;
    }

    if (this.cronJob) {
      log.warn("Health monitor already running");
      return;
    }

    // Run every N minutes
    const cronExpression = `*/${this.config.checkIntervalMinutes} * * * *`;
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.checkHealth();
    });

    log.info("Health monitor started", {
      intervalMinutes: this.config.checkIntervalMinutes,
      recipients: this.config.emailRecipients.length,
      thresholds: this.config.thresholds,
    });
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      log.info("Health monitor stopped");
    }
  }

  /**
   * Check system health and send alerts if needed
   */
  private async checkHealth(): Promise<void> {
    try {
      const metrics = metricsCollector.getSnapshot();
      const issues: string[] = [];

      // Check error rate
      const errorRate = metrics.errors / (this.config.checkIntervalMinutes || 1);
      if (errorRate > this.config.thresholds.errorRatePerMinute) {
        issues.push(
          `🚨 High error rate: ${errorRate.toFixed(2)} errors/min (threshold: ${this.config.thresholds.errorRatePerMinute})`
        );
      }

      // Check P95 latency
      if (metrics.p95LatencyMs > this.config.thresholds.p95LatencyMs) {
        issues.push(
          `⚠️ High P95 latency: ${metrics.p95LatencyMs.toFixed(0)}ms (threshold: ${this.config.thresholds.p95LatencyMs}ms)`
        );
      }

      // Check memory usage
      const memUsage = process.memoryUsage();
      const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      if (memUsagePercent > this.config.thresholds.memoryUsagePercent) {
        issues.push(
          `💾 High memory usage: ${memUsagePercent.toFixed(1)}% (threshold: ${this.config.thresholds.memoryUsagePercent}%)`
        );
      }

      // Check disk usage (if available)
      try {
        const diskUsage = await this.checkDiskUsage();
        if (diskUsage && diskUsage.percent > this.config.thresholds.diskUsagePercent) {
          issues.push(
            `💿 High disk usage: ${diskUsage.percent.toFixed(1)}% (threshold: ${this.config.thresholds.diskUsagePercent}%)`
          );
        }
      } catch (error) {
        log.debug("Disk usage check failed (non-critical)", { error });
      }

      // Send alert if issues found
      if (issues.length > 0) {
        await this.sendAlert(issues, metrics);
      }

    } catch (error: any) {
      log.error("Health check failed", { error: error.message });
    }
  }

  /**
   * Send alert email
   */
  private async sendAlert(issues: string[], metrics: any): Promise<void> {
    const alertType = "system_health";
    
    // Check cooldown
    const lastAlert = this.lastAlertTimestamps.get(alertType) || 0;
    if (Date.now() - lastAlert < this.alertCooldownMs) {
      log.debug("Alert suppressed (cooldown period)", { alertType });
      return;
    }

    if (this.config.emailRecipients.length === 0) {
      log.warn("No email recipients configured for health alerts");
      return;
    }

    const subject = `🚨 ContinuityBridge Health Alert - ${issues.length} Issue(s) Detected`;
    const body = `
<h2>System Health Alert</h2>
<p><strong>Time:</strong> ${new Date().toISOString()}</p>

<h3>Issues Detected:</h3>
<ul>
${issues.map(issue => `  <li>${issue}</li>`).join('\n')}
</ul>

<h3>Current Metrics:</h3>
<ul>
  <li><strong>Average Latency:</strong> ${metrics.avgLatencyMs.toFixed(2)}ms</li>
  <li><strong>P95 Latency:</strong> ${metrics.p95LatencyMs.toFixed(2)}ms</li>
  <li><strong>Throughput:</strong> ${metrics.tps.toFixed(2)} req/s</li>
  <li><strong>Errors:</strong> ${metrics.errors}</li>
  <li><strong>Total Processed:</strong> ${metrics.totalProcessed}</li>
</ul>

<h3>Memory Usage:</h3>
<ul>
  <li><strong>Heap Used:</strong> ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</li>
  <li><strong>Heap Total:</strong> ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB</li>
  <li><strong>RSS:</strong> ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB</li>
</ul>

<p><em>This is an automated alert from ContinuityBridge Health Monitor.</em></p>
`;

    try {
      for (const recipient of this.config.emailRecipients) {
        await emailService.sendEmail({
          to: recipient,
          subject,
          html: body,
          text: issues.join('\n'),
        });
      }

      this.lastAlertTimestamps.set(alertType, Date.now());
      log.info("Health alert sent", {
        issues: issues.length,
        recipients: this.config.emailRecipients.length,
      });
    } catch (error: any) {
      log.error("Failed to send health alert", { error: error.message });
    }
  }

  /**
   * Check disk usage (Node.js 18+)
   */
  private async checkDiskUsage(): Promise<{ percent: number; used: number; total: number } | null> {
    try {
      // Only works on Linux/Unix
      const { execSync } = await import('child_process');
      const output = execSync("df -h / | tail -1 | awk '{print $5}'").toString().trim();
      const percent = parseInt(output.replace('%', ''));
      
      return {
        percent,
        used: 0, // Would need additional parsing
        total: 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      thresholds: {
        ...this.config.thresholds,
        ...config.thresholds,
      },
    };

    log.info("Health monitor configuration updated", this.config);
  }
}

// Singleton instance
let healthMonitorInstance: HealthMonitor | null = null;

export function getHealthMonitor(config?: Partial<AlertConfig>): HealthMonitor {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new HealthMonitor(config);
  }
  return healthMonitorInstance;
}
