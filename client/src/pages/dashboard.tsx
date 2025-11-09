import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Activity, Clock, Zap, AlertCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Metrics, ChartDataPoint, Event } from "@shared/schema";

function MetricCard({
  title,
  value,
  unit,
  trend,
  trendValue,
  icon: Icon,
  testId,
}: {
  title: string;
  value: number | string;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon: React.ElementType;
  testId: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-green-600 dark:text-green-400"
      : trend === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <Card className="p-6 border rounded-lg" data-testid={testId}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-normal text-muted-foreground">{title}</span>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <div className="text-4xl font-bold text-foreground" data-testid={`${testId}-value`}>
          {value}
          {unit && <span className="text-lg text-muted-foreground ml-1">{unit}</span>}
        </div>
        {trendValue && (
          <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
            <TrendIcon className="h-4 w-4" />
            <span>{trendValue}</span>
            <span className="text-xs text-muted-foreground ml-1">vs. last 5m</span>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: metrics, isLoading: metricsLoading } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    refetchInterval: 5000,
  });

  const { data: chartData } = useQuery<ChartDataPoint[]>({
    queryKey: ["/api/metrics/history"],
    refetchInterval: 5000,
  });

  const { data: recentEvents } = useQuery<Event[]>({
    queryKey: ["/api/events/recent"],
    refetchInterval: 5000,
  });

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading metrics...</div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-dashboard">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Real-time metrics and system performance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          title="Average Latency"
          value={metrics?.avgLatencyMs?.toFixed(2) || "0"}
          unit="ms"
          trend="neutral"
          icon={Clock}
          testId="card-avg-latency"
        />
        <MetricCard
          title="P95 Latency"
          value={metrics?.p95LatencyMs?.toFixed(2) || "0"}
          unit="ms"
          trend="neutral"
          icon={Activity}
          testId="card-p95-latency"
        />
        <MetricCard
          title="Throughput (TPS)"
          value={metrics?.tps?.toFixed(2) || "0"}
          unit="req/s"
          trend="up"
          trendValue="+12%"
          icon={Zap}
          testId="card-tps"
        />
        <MetricCard
          title="Errors"
          value={metrics?.errors || 0}
          trend={metrics?.errors && metrics.errors > 0 ? "up" : "neutral"}
          icon={AlertCircle}
          testId="card-errors"
        />
      </div>

      {chartData && chartData.length > 0 && (
        <Card className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Performance Trends</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="timestamp"
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avgLatency"
                  stroke="hsl(var(--chart-1))"
                  name="Avg Latency (ms)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="tps"
                  stroke="hsl(var(--chart-2))"
                  name="TPS"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="p-6 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Queue Depth</h2>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Inbound Queue</span>
              <span className="text-sm font-medium" data-testid="text-queue-in-depth">
                {metrics?.inDepth || 0} messages
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((metrics?.inDepth || 0) / 100, 1) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Outbound Queue</span>
              <span className="text-sm font-medium" data-testid="text-queue-out-depth">
                {metrics?.outDepth || 0} messages
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-chart-2 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((metrics?.outDepth || 0) / 100, 1) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      {recentEvents && recentEvents.length > 0 && (
        <Card className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {recentEvents.slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between py-2 border-b last:border-b-0"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium font-mono">{event.traceId}</div>
                  <div className="text-xs text-muted-foreground">
                    SKU: {event.sku} → {event.warehouse}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
