import type { LatencyRecord, MetricsSnapshot } from "./types.js";

export class MetricsCollector {
  private latencies: LatencyRecord[] = [];
  private requestCounts: number[] = [];
  private errors: number = 0;
  private totalProcessed: number = 0;
  private inboundDepth: number = 0;
  private outboundDepth: number = 0;
  private windowSizeMs: number = 60000; // 1 minute window

  recordLatency(latencyMs: number): void {
    this.latencies.push({
      value: latencyMs,
      timestamp: Date.now(),
    });
    this.cleanOldRecords();
  }

  recordRequest(): void {
    this.requestCounts.push(Date.now());
    this.totalProcessed++;
    this.cleanOldRecords();
  }

  recordError(): void {
    this.errors++;
  }

  setQueueDepth(inbound: number, outbound: number): void {
    this.inboundDepth = inbound;
    this.outboundDepth = outbound;
  }

  private cleanOldRecords(): void {
    const cutoffTime = Date.now() - this.windowSizeMs;
    this.latencies = this.latencies.filter((r) => r.timestamp > cutoffTime);
    this.requestCounts = this.requestCounts.filter((t) => t > cutoffTime);
  }

  getSnapshot(): MetricsSnapshot {
    this.cleanOldRecords();

    const avgLatencyMs =
      this.latencies.length > 0
        ? this.latencies.reduce((sum, r) => sum + r.value, 0) / this.latencies.length
        : 0;

    const p95LatencyMs = this.calculatePercentile(95);
    const tps = this.requestCounts.length / (this.windowSizeMs / 1000);

    return {
      avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
      p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
      tps: Number(tps.toFixed(2)),
      inDepth: this.inboundDepth,
      outDepth: this.outboundDepth,
      errors: this.errors,
      totalProcessed: this.totalProcessed,
      lastUpdated: new Date().toISOString(),
    };
  }

  private calculatePercentile(percentile: number): number {
    if (this.latencies.length === 0) return 0;

    const sorted = [...this.latencies].sort((a, b) => a.value - b.value);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)]?.value || 0;
  }

  getHistoryDataPoints(count: number = 20): any[] {
    const points: any[] = [];
    const now = Date.now();
    const intervalMs = this.windowSizeMs / count;

    for (let i = count - 1; i >= 0; i--) {
      const endTime = now - i * intervalMs;
      const startTime = endTime - intervalMs;

      const periodLatencies = this.latencies.filter(
        (r) => r.timestamp >= startTime && r.timestamp < endTime
      );
      const periodRequests = this.requestCounts.filter(
        (t) => t >= startTime && t < endTime
      );

      const avgLatency =
        periodLatencies.length > 0
          ? periodLatencies.reduce((sum, r) => sum + r.value, 0) / periodLatencies.length
          : 0;

      const tps = periodRequests.length / (intervalMs / 1000);

      points.push({
        timestamp: new Date(endTime).toLocaleTimeString(),
        avgLatency: Number(avgLatency.toFixed(2)),
        tps: Number(tps.toFixed(2)),
        errors: 0,
      });
    }

    return points;
  }
}

export const metricsCollector = new MetricsCollector();
