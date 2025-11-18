import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Square, 
  RotateCcw,
  Clock,
  Database,
  Mail,
  Cpu,
  HardDrive,
  Zap,
  TrendingUp,
  Server
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface HealthMetrics {
  status: "healthy" | "warning" | "critical";
  timestamp: string;
  uptime: number;
  metrics: {
    errorRate: number;
    p95Latency: number;
    memoryUsage: number;
    diskUsage: number;
  };
  thresholds: {
    errorRatePerMinute: number;
    p95LatencyMs: number;
    memoryUsagePercent: number;
    diskUsagePercent: number;
  };
  issues: string[];
  lastAlert: string | null;
}

interface DaemonStatus {
  name: string;
  type: "scheduler" | "poller" | "log-cleanup" | "health-monitor";
  status: "running" | "stopped" | "error";
  uptime: number;
  lastRun: string | null;
  nextRun: string | null;
  stats?: {
    totalJobs?: number;
    completedJobs?: number;
    failedJobs?: number;
    activePolls?: number;
  };
}

interface SystemHealthResponse {
  health: HealthMetrics;
  daemons: DaemonStatus[];
  permissions: {
    canManageDaemons: boolean;
    canViewHealth: boolean;
  };
}

export default function SystemHealth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDaemon, setSelectedDaemon] = useState<DaemonStatus | null>(null);
  const [actionType, setActionType] = useState<"start" | "stop" | "restart" | null>(null);

  // Fetch system health
  const { data: systemHealth, isLoading } = useQuery<SystemHealthResponse>({
    queryKey: ["/api/admin/system-health"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Daemon control mutation
  const controlDaemonMutation = useMutation({
    mutationFn: async ({ daemonType, action }: { daemonType: string; action: string }) => {
      const response = await fetch(`/api/admin/system-health/daemon/${daemonType}/${action}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${action} daemon`);
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Success",
        description: `Daemon ${variables.action} successful`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-health"] });
      setSelectedDaemon(null);
      setActionType(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setSelectedDaemon(null);
      setActionType(null);
    },
  });

  const handleDaemonAction = (daemon: DaemonStatus, action: "start" | "stop" | "restart") => {
    setSelectedDaemon(daemon);
    setActionType(action);
  };

  const confirmDaemonAction = () => {
    if (selectedDaemon && actionType) {
      controlDaemonMutation.mutate({
        daemonType: selectedDaemon.type,
        action: actionType,
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
      case "running":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case "critical":
      case "error":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "stopped":
        return <Square className="h-5 w-5 text-gray-400" />;
      default:
        return <Activity className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
      case "running":
        return <Badge className="bg-green-600">Running</Badge>;
      case "warning":
        return <Badge className="bg-yellow-600">Warning</Badge>;
      case "critical":
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "stopped":
        return <Badge variant="outline">Stopped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDaemonIcon = (type: string) => {
    switch (type) {
      case "scheduler":
        return <Clock className="h-5 w-5" />;
      case "poller":
        return <TrendingUp className="h-5 w-5" />;
      case "log-cleanup":
        return <Database className="h-5 w-5" />;
      case "health-monitor":
        return <Activity className="h-5 w-5" />;
      default:
        return <Server className="h-5 w-5" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
          <p className="text-sm text-muted-foreground">Loading system health...</p>
        </div>
      </div>
    );
  }

  if (!systemHealth?.permissions.canViewHealth) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <XCircle className="h-12 w-12 mx-auto mb-4 text-red-600" />
          <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
          <p className="text-sm text-muted-foreground">
            You don't have permission to view system health
          </p>
        </div>
      </div>
    );
  }

  const { health, daemons, permissions } = systemHealth;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">System Health</h1>
        <p className="text-muted-foreground">
          Monitor system performance and manage background services
        </p>
      </div>

      {/* Overall Health Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(health.status)}
              <div>
                <CardTitle>System Status</CardTitle>
                <CardDescription>
                  Uptime: {formatUptime(health.uptime)}
                </CardDescription>
              </div>
            </div>
            {getStatusBadge(health.status)}
          </div>
        </CardHeader>
        <CardContent>
          {/* Health Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Error Rate */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Error Rate</span>
              </div>
              <div className="text-2xl font-bold">
                {health.metrics.errorRate.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground ml-1">/min</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Threshold: {health.thresholds.errorRatePerMinute}/min
              </div>
              {health.metrics.errorRate > health.thresholds.errorRatePerMinute && (
                <Badge variant="destructive" className="mt-2">Exceeded</Badge>
              )}
            </div>

            {/* Latency */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">P95 Latency</span>
              </div>
              <div className="text-2xl font-bold">
                {health.metrics.p95Latency.toFixed(0)}
                <span className="text-sm font-normal text-muted-foreground ml-1">ms</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Threshold: {health.thresholds.p95LatencyMs}ms
              </div>
              {health.metrics.p95Latency > health.thresholds.p95LatencyMs && (
                <Badge variant="destructive" className="mt-2">Exceeded</Badge>
              )}
            </div>

            {/* Memory Usage */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Memory Usage</span>
              </div>
              <div className="text-2xl font-bold">
                {health.metrics.memoryUsage.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground ml-1">%</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Threshold: {health.thresholds.memoryUsagePercent}%
              </div>
              {health.metrics.memoryUsage > health.thresholds.memoryUsagePercent && (
                <Badge variant="destructive" className="mt-2">Exceeded</Badge>
              )}
            </div>

            {/* Disk Usage */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Disk Usage</span>
              </div>
              <div className="text-2xl font-bold">
                {health.metrics.diskUsage.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground ml-1">%</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Threshold: {health.thresholds.diskUsagePercent}%
              </div>
              {health.metrics.diskUsage > health.thresholds.diskUsagePercent && (
                <Badge variant="destructive" className="mt-2">Exceeded</Badge>
              )}
            </div>
          </div>

          {/* Active Issues */}
          {health.issues.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <h3 className="font-semibold text-red-900">Active Issues</h3>
              </div>
              <ul className="space-y-1">
                {health.issues.map((issue, idx) => (
                  <li key={idx} className="text-sm text-red-800">• {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Last Alert */}
          {health.lastAlert && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>Last alert sent: {new Date(health.lastAlert).toLocaleString()}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Background Daemons */}
      <Card>
        <CardHeader>
          <CardTitle>Background Services</CardTitle>
          <CardDescription>
            System daemons and scheduled jobs
            {!permissions.canManageDaemons && (
              <span className="ml-2 text-yellow-600">(View only - contact admin to manage)</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {daemons.map((daemon) => (
              <div
                key={daemon.type}
                className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getDaemonIcon(daemon.type)}
                    <div>
                      <h3 className="font-semibold">{daemon.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Type: {daemon.type}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(daemon.status)}
                    {permissions.canManageDaemons && (
                      <div className="flex gap-2">
                        {daemon.status === "stopped" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDaemonAction(daemon, "start")}
                            disabled={controlDaemonMutation.isPending}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Start
                          </Button>
                        )}
                        {daemon.status === "running" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDaemonAction(daemon, "restart")}
                              disabled={controlDaemonMutation.isPending}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Restart
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDaemonAction(daemon, "stop")}
                              disabled={controlDaemonMutation.isPending}
                            >
                              <Square className="h-4 w-4 mr-1" />
                              Stop
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Daemon Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Uptime:</span>
                    <p className="font-medium">{formatUptime(daemon.uptime)}</p>
                  </div>
                  {daemon.lastRun && (
                    <div>
                      <span className="text-muted-foreground">Last Run:</span>
                      <p className="font-medium">
                        {new Date(daemon.lastRun).toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                  {daemon.nextRun && (
                    <div>
                      <span className="text-muted-foreground">Next Run:</span>
                      <p className="font-medium">
                        {new Date(daemon.nextRun).toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                  {daemon.stats && (
                    <div>
                      <span className="text-muted-foreground">Jobs:</span>
                      <p className="font-medium">
                        {daemon.stats.completedJobs || 0} / {daemon.stats.totalJobs || 0}
                        {daemon.stats.failedJobs ? ` (${daemon.stats.failedJobs} failed)` : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={selectedDaemon !== null} onOpenChange={() => setSelectedDaemon(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "start" && "Start Daemon"}
              {actionType === "stop" && "Stop Daemon"}
              {actionType === "restart" && "Restart Daemon"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "start" && (
                <>
                  Are you sure you want to start <strong>{selectedDaemon?.name}</strong>?
                  This will begin processing scheduled jobs.
                </>
              )}
              {actionType === "stop" && (
                <>
                  Are you sure you want to stop <strong>{selectedDaemon?.name}</strong>?
                  <br />
                  <span className="text-red-600 font-semibold">
                    Warning: This may affect system functionality!
                  </span>
                </>
              )}
              {actionType === "restart" && (
                <>
                  Are you sure you want to restart <strong>{selectedDaemon?.name}</strong>?
                  This will briefly interrupt the service.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDaemonAction}>
              {actionType === "start" && "Start"}
              {actionType === "stop" && "Stop"}
              {actionType === "restart" && "Restart"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
