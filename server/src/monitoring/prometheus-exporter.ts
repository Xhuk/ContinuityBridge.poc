/**
 * Prometheus Metrics Exporter
 * Exposes application metrics in Prometheus format
 */

import { Router, type Request, type Response } from "express";
import { metricsCollector } from "../core/metrics.js";
import { getHealthMonitor } from "../core/health-monitor.js";
import { getSchedulerDaemon } from "../schedulers/scheduler-daemon.js";
import { getPollerDaemon } from "../schedulers/poller-daemon.js";
import os from "os";

const router = Router();

/**
 * Format metrics in Prometheus exposition format
 * See: https://prometheus.io/docs/instrumenting/exposition_formats/
 */
function formatPrometheusMetrics(): string {
  const metrics: string[] = [];
  const snapshot = metricsCollector.getSnapshot();
  const healthMonitor = getHealthMonitor();
  const healthStatus = healthMonitor.getHealthStatus();

  // Application Info
  metrics.push('# HELP continuitybridge_info Application information');
  metrics.push('# TYPE continuitybridge_info gauge');
  metrics.push(`continuitybridge_info{version="${process.env.npm_package_version || 'unknown'}"} 1`);

  // HTTP Request Metrics
  metrics.push('# HELP continuitybridge_http_requests_total Total number of HTTP requests');
  metrics.push('# TYPE continuitybridge_http_requests_total counter');
  metrics.push(`continuitybridge_http_requests_total ${snapshot.totalProcessed}`);

  metrics.push('# HELP continuitybridge_http_errors_total Total number of HTTP errors');
  metrics.push('# TYPE continuitybridge_http_errors_total counter');
  metrics.push(`continuitybridge_http_errors_total ${snapshot.errors}`);

  // Latency Metrics
  metrics.push('# HELP continuitybridge_http_request_duration_milliseconds HTTP request latency');
  metrics.push('# TYPE continuitybridge_http_request_duration_milliseconds summary');
  metrics.push(`continuitybridge_http_request_duration_milliseconds{quantile="0.95"} ${snapshot.p95LatencyMs}`);
  metrics.push(`continuitybridge_http_request_duration_milliseconds_sum ${snapshot.avgLatencyMs * snapshot.totalProcessed}`);
  metrics.push(`continuitybridge_http_request_duration_milliseconds_count ${snapshot.totalProcessed}`);

  // Throughput
  metrics.push('# HELP continuitybridge_throughput_requests_per_second Requests per second');
  metrics.push('# TYPE continuitybridge_throughput_requests_per_second gauge');
  metrics.push(`continuitybridge_throughput_requests_per_second ${snapshot.tps}`);

  // Queue Depth
  metrics.push('# HELP continuitybridge_queue_depth Queue depth');
  metrics.push('# TYPE continuitybridge_queue_depth gauge');
  metrics.push(`continuitybridge_queue_depth{queue="inbound"} ${snapshot.inDepth}`);
  metrics.push(`continuitybridge_queue_depth{queue="outbound"} ${snapshot.outDepth}`);

  // Health Status Metrics
  const statusValue = healthStatus.status === 'healthy' ? 1 : healthStatus.status === 'warning' ? 0.5 : 0;
  metrics.push('# HELP continuitybridge_health_status Application health status (1=healthy, 0.5=warning, 0=critical)');
  metrics.push('# TYPE continuitybridge_health_status gauge');
  metrics.push(`continuitybridge_health_status ${statusValue}`);

  metrics.push('# HELP continuitybridge_error_rate_per_minute Error rate per minute');
  metrics.push('# TYPE continuitybridge_error_rate_per_minute gauge');
  metrics.push(`continuitybridge_error_rate_per_minute ${healthStatus.metrics.errorRate}`);

  metrics.push('# HELP continuitybridge_memory_usage_percent Memory usage percentage');
  metrics.push('# TYPE continuitybridge_memory_usage_percent gauge');
  metrics.push(`continuitybridge_memory_usage_percent ${healthStatus.metrics.memoryUsage}`);

  // Daemon Metrics
  const schedulerDaemon = getSchedulerDaemon();
  const pollerDaemon = getPollerDaemon();
  
  metrics.push('# HELP continuitybridge_daemon_running Daemon running status (1=running, 0=stopped)');
  metrics.push('# TYPE continuitybridge_daemon_running gauge');
  metrics.push(`continuitybridge_daemon_running{daemon="scheduler"} ${schedulerDaemon.isRunning() ? 1 : 0}`);
  metrics.push(`continuitybridge_daemon_running{daemon="poller"} ${pollerDaemon.isRunning() ? 1 : 0}`);

  metrics.push('# HELP continuitybridge_daemon_uptime_seconds Daemon uptime in seconds');
  metrics.push('# TYPE continuitybridge_daemon_uptime_seconds gauge');
  metrics.push(`continuitybridge_daemon_uptime_seconds{daemon="scheduler"} ${schedulerDaemon.getUptime()}`);
  metrics.push(`continuitybridge_daemon_uptime_seconds{daemon="poller"} ${pollerDaemon.getUptime()}`);

  // Scheduler Job Metrics
  const schedulerStats = schedulerDaemon.getStats();
  metrics.push('# HELP continuitybridge_scheduler_jobs_total Total scheduler jobs executed');
  metrics.push('# TYPE continuitybridge_scheduler_jobs_total counter');
  metrics.push(`continuitybridge_scheduler_jobs_total{status="completed"} ${schedulerStats.completedJobs}`);
  metrics.push(`continuitybridge_scheduler_jobs_total{status="failed"} ${schedulerStats.failedJobs}`);

  // System Metrics
  const memUsage = process.memoryUsage();
  metrics.push('# HELP continuitybridge_process_memory_bytes Process memory usage');
  metrics.push('# TYPE continuitybridge_process_memory_bytes gauge');
  metrics.push(`continuitybridge_process_memory_bytes{type="heap_used"} ${memUsage.heapUsed}`);
  metrics.push(`continuitybridge_process_memory_bytes{type="heap_total"} ${memUsage.heapTotal}`);
  metrics.push(`continuitybridge_process_memory_bytes{type="rss"} ${memUsage.rss}`);
  metrics.push(`continuitybridge_process_memory_bytes{type="external"} ${memUsage.external}`);

  metrics.push('# HELP continuitybridge_process_cpu_usage_percent Process CPU usage percentage');
  metrics.push('# TYPE continuitybridge_process_cpu_usage_percent gauge');
  const cpuUsage = process.cpuUsage();
  const totalCpuTime = cpuUsage.user + cpuUsage.system;
  const cpuPercent = (totalCpuTime / 1000000 / os.uptime()) * 100;
  metrics.push(`continuitybridge_process_cpu_usage_percent ${cpuPercent.toFixed(2)}`);

  metrics.push('# HELP continuitybridge_process_uptime_seconds Process uptime in seconds');
  metrics.push('# TYPE continuitybridge_process_uptime_seconds gauge');
  metrics.push(`continuitybridge_process_uptime_seconds ${process.uptime()}`);

  // System Load Average
  const loadAvg = os.loadavg();
  metrics.push('# HELP continuitybridge_system_load_average System load average');
  metrics.push('# TYPE continuitybridge_system_load_average gauge');
  metrics.push(`continuitybridge_system_load_average{period="1m"} ${loadAvg[0]}`);
  metrics.push(`continuitybridge_system_load_average{period="5m"} ${loadAvg[1]}`);
  metrics.push(`continuitybridge_system_load_average{period="15m"} ${loadAvg[2]}`);

  // System Memory
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  metrics.push('# HELP continuitybridge_system_memory_bytes System memory');
  metrics.push('# TYPE continuitybridge_system_memory_bytes gauge');
  metrics.push(`continuitybridge_system_memory_bytes{type="total"} ${totalMem}`);
  metrics.push(`continuitybridge_system_memory_bytes{type="free"} ${freeMem}`);
  metrics.push(`continuitybridge_system_memory_bytes{type="used"} ${totalMem - freeMem}`);

  return metrics.join('\n') + '\n';
}

/**
 * GET /metrics
 * Prometheus-compatible metrics endpoint
 */
router.get("/metrics", (req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(formatPrometheusMetrics());
});

/**
 * GET /health (Prometheus health check)
 * Returns 200 if healthy, 503 if degraded/critical
 */
router.get("/health", (req: Request, res: Response) => {
  const healthMonitor = getHealthMonitor();
  const healthStatus = healthMonitor.getHealthStatus();

  const statusCode = healthStatus.status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status: healthStatus.status,
    timestamp: healthStatus.timestamp,
    uptime: healthStatus.uptime,
    issues: healthStatus.issues,
  });
});

export default router;
