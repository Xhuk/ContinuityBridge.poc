import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Activity, Clock, Zap, AlertCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Metrics, ChartDataPoint, Event } from "@shared/schema";
import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

function AnimatedCounter({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const nodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!nodeRef.current) return;
    
    gsap.to({ val: displayValue }, {
      val: value,
      duration: 0.8,
      ease: "power2.out",
      onUpdate: function() {
        setDisplayValue(this.targets()[0].val);
      }
    });
  }, [value]);

  return <span ref={nodeRef}>{displayValue.toFixed(decimals)}</span>;
}

function MetricCard({
  title,
  value,
  unit,
  trend,
  trendValue,
  icon: Icon,
  testId,
  index,
}: {
  title: string;
  value: number | string;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon: React.ElementType;
  testId: string;
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-green-600 dark:text-green-400"
      : trend === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  useEffect(() => {
    if (!cardRef.current) return;

    // Entrance animation
    gsap.fromTo(cardRef.current,
      { 
        y: 50,
        opacity: 0,
        scale: 0.95
      },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.6,
        delay: index * 0.1,
        ease: "power3.out"
      }
    );
  }, [index]);

  useEffect(() => {
    if (!iconRef.current) return;

    if (isHovered) {
      gsap.to(iconRef.current, {
        scale: 1.2,
        rotation: 360,
        duration: 0.6,
        ease: "back.out(1.7)"
      });
    } else {
      gsap.to(iconRef.current, {
        scale: 1,
        rotation: 0,
        duration: 0.4,
        ease: "power2.out"
      });
    }
  }, [isHovered]);

  const numericValue = typeof value === 'number' ? value : parseFloat(value);

  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <Card 
        ref={cardRef}
        className="p-6 border rounded-lg hover:shadow-2xl transition-shadow duration-300 relative overflow-hidden group" 
        data-testid={testId}
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="flex items-center justify-between mb-4 relative z-10">
          <motion.span 
            className="text-sm font-normal text-muted-foreground"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 + 0.2 }}
          >
            {title}
          </motion.span>
          <div ref={iconRef}>
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2 relative z-10">
          <div className="text-4xl font-bold text-foreground" data-testid={`${testId}-value`}>
            {!isNaN(numericValue) ? (
              <AnimatedCounter value={numericValue} decimals={typeof value === 'number' && value % 1 !== 0 ? 2 : 0} />
            ) : (
              value
            )}
            {unit && <span className="text-lg text-muted-foreground ml-1">{unit}</span>}
          </div>
          {trendValue && (
            <motion.div 
              className={`flex items-center gap-1 text-sm ${trendColor}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 + 0.4 }}
            >
              <TrendIcon className="h-4 w-4" />
              <span>{trendValue}</span>
              <span className="text-xs text-muted-foreground ml-1">vs. last 5m</span>
            </motion.div>
          )}
        </div>
      </Card>
    </motion.div>
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

  const chartRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate chart section
    if (chartRef.current) {
      gsap.fromTo(chartRef.current,
        { y: 60, opacity: 0 },
        { 
          y: 0, 
          opacity: 1, 
          duration: 0.8, 
          delay: 0.6,
          ease: "power3.out"
        }
      );
    }

    // Animate queue section
    if (queueRef.current) {
      gsap.fromTo(queueRef.current,
        { y: 60, opacity: 0 },
        { 
          y: 0, 
          opacity: 1, 
          duration: 0.8, 
          delay: 0.8,
          ease: "power3.out"
        }
      );
    }

    // Animate activity section
    if (activityRef.current) {
      gsap.fromTo(activityRef.current,
        { y: 60, opacity: 0 },
        { 
          y: 0, 
          opacity: 1, 
          duration: 0.8, 
          delay: 1.0,
          ease: "power3.out"
        }
      );
    }
  }, []);

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div 
          className="text-muted-foreground"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          Loading metrics...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-dashboard">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Real-time metrics and system performance
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          title="Average Latency"
          value={metrics?.avgLatencyMs || 0}
          unit="ms"
          trend="neutral"
          icon={Clock}
          testId="card-avg-latency"
          index={0}
        />
        <MetricCard
          title="P95 Latency"
          value={metrics?.p95LatencyMs || 0}
          unit="ms"
          trend="neutral"
          icon={Activity}
          testId="card-p95-latency"
          index={1}
        />
        <MetricCard
          title="Throughput (TPS)"
          value={metrics?.tps || 0}
          unit="req/s"
          trend="up"
          trendValue="+12%"
          icon={Zap}
          testId="card-tps"
          index={2}
        />
        <MetricCard
          title="Errors"
          value={metrics?.errors || 0}
          trend={metrics?.errors && metrics.errors > 0 ? "up" : "neutral"}
          icon={AlertCircle}
          testId="card-errors"
          index={3}
        />
      </div>

      {chartData && chartData.length > 0 && (
        <Card ref={chartRef} className="p-6 border rounded-lg hover:shadow-xl transition-shadow duration-300">
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

      <Card ref={queueRef} className="p-6 border rounded-lg hover:shadow-xl transition-shadow duration-300">
        <h2 className="text-xl font-semibold mb-4">Queue Depth</h2>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Inbound Queue</span>
              <motion.span 
                className="text-sm font-medium" 
                data-testid="text-queue-in-depth"
                key={metrics?.inDepth}
                initial={{ scale: 1.2, color: "#3b82f6" }}
                animate={{ scale: 1, color: "inherit" }}
                transition={{ duration: 0.3 }}
              >
                {metrics?.inDepth || 0} messages
              </motion.span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <motion.div
                className="bg-primary h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((metrics?.inDepth || 0) / 100, 1) * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Outbound Queue</span>
              <motion.span 
                className="text-sm font-medium" 
                data-testid="text-queue-out-depth"
                key={metrics?.outDepth}
                initial={{ scale: 1.2, color: "#3b82f6" }}
                animate={{ scale: 1, color: "inherit" }}
                transition={{ duration: 0.3 }}
              >
                {metrics?.outDepth || 0} messages
              </motion.span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <motion.div
                className="bg-chart-2 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((metrics?.outDepth || 0) / 100, 1) * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </Card>

      {recentEvents && recentEvents.length > 0 && (
        <Card ref={activityRef} className="p-6 border rounded-lg hover:shadow-xl transition-shadow duration-300">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {recentEvents.slice(0, 5).map((event: Event, index: number) => (
              <motion.div
                key={event.id}
                className="flex items-center justify-between py-2 border-b last:border-b-0 rounded px-2 hover:bg-accent/50 transition-colors duration-200"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2 + index * 0.1, duration: 0.4 }}
                whileHover={{ x: 4, scale: 1.01 }}
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
              </motion.div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
