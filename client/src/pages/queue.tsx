import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorkerStatus, Metrics } from "@shared/schema";

export default function Queue() {
  const { toast } = useToast();

  const { data: workerStatus } = useQuery<WorkerStatus>({
    queryKey: ["/api/worker/status"],
    refetchInterval: 2000,
  });

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    refetchInterval: 2000,
  });

  const toggleWorkerMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/worker/toggle", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worker/status"] });
      toast({
        title: "Worker updated",
        description: `Worker ${workerStatus?.enabled ? "stopped" : "started"} successfully`,
      });
    },
  });

  const updateConcurrencyMutation = useMutation({
    mutationFn: async (concurrency: number) => {
      return apiRequest("POST", "/api/worker/concurrency", { concurrency });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worker/status"] });
      toast({
        title: "Concurrency updated",
        description: "Worker concurrency has been updated",
      });
    },
  });

  const handleToggleWorker = () => {
    toggleWorkerMutation.mutate(!workerStatus?.enabled);
  };

  const handleConcurrencyChange = (delta: number) => {
    const currentConcurrency = workerStatus?.concurrency || 1;
    const newConcurrency = Math.max(1, Math.min(100, currentConcurrency + delta));
    updateConcurrencyMutation.mutate(newConcurrency);
  };

  return (
    <div className="px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-queue">
          Queue & Worker
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage worker processes and queue configuration
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border rounded-lg">
          <h2 className="text-lg font-medium mb-4">Worker Controls</h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="worker-toggle" className="text-sm font-medium">
                  Worker Status
                </Label>
                <div className="text-xs text-muted-foreground">
                  {workerStatus?.enabled ? "Running" : "Stopped"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {workerStatus?.enabled && (
                  <Badge
                    variant="default"
                    className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full animate-pulse"
                  >
                    Active
                  </Badge>
                )}
                <Switch
                  id="worker-toggle"
                  checked={workerStatus?.enabled || false}
                  onCheckedChange={handleToggleWorker}
                  data-testid="switch-worker-toggle"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Concurrency Level</Label>
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleConcurrencyChange(-1)}
                  disabled={!workerStatus?.enabled || (workerStatus?.concurrency || 1) <= 1}
                  data-testid="button-decrease-concurrency"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center">
                  <div className="text-2xl font-bold" data-testid="text-concurrency">
                    {workerStatus?.concurrency || 1}
                  </div>
                  <div className="text-xs text-muted-foreground">workers</div>
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleConcurrencyChange(1)}
                  disabled={!workerStatus?.enabled || (workerStatus?.concurrency || 1) >= 100}
                  data-testid="button-increase-concurrency"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Messages Processed</span>
                <span className="font-medium" data-testid="text-messages-processed">
                  {workerStatus?.messagesProcessed || 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Throughput</span>
                <span className="font-medium" data-testid="text-throughput">
                  {workerStatus?.currentThroughput?.toFixed(2) || "0.00"} msg/s
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 border rounded-lg">
          <h2 className="text-lg font-medium mb-4">Queue Depth</h2>
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium">Inbound Queue</div>
                  <div className="text-xs text-muted-foreground">Items awaiting processing</div>
                </div>
                <div className="text-2xl font-bold" data-testid="text-inbound-depth">
                  {metrics?.inDepth || 0}
                </div>
              </div>
              <div className="w-full bg-secondary rounded-full h-3">
                <div
                  className="bg-primary h-3 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((metrics?.inDepth || 0) / 100, 1) * 100}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground text-right">
                {Math.min((metrics?.inDepth || 0) / 100, 1) * 100}% capacity
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium">Outbound Queue</div>
                  <div className="text-xs text-muted-foreground">Items being dispatched</div>
                </div>
                <div className="text-2xl font-bold" data-testid="text-outbound-depth">
                  {metrics?.outDepth || 0}
                </div>
              </div>
              <div className="w-full bg-secondary rounded-full h-3">
                <div
                  className="bg-chart-2 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((metrics?.outDepth || 0) / 100, 1) * 100}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground text-right">
                {Math.min((metrics?.outDepth || 0) / 100, 1) * 100}% capacity
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="text-xs text-muted-foreground mb-2">Queue Health</div>
              {(metrics?.inDepth || 0) > 80 || (metrics?.outDepth || 0) > 80 ? (
                <Badge variant="destructive" className="rounded-full">
                  High Load
                </Badge>
              ) : (
                <Badge
                  variant="default"
                  className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full"
                >
                  Healthy
                </Badge>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 border rounded-lg">
        <h2 className="text-lg font-medium mb-4">Queue Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-2">Total Processed</div>
            <div className="text-3xl font-bold">{metrics?.totalProcessed || 0}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-2">Average Latency</div>
            <div className="text-3xl font-bold">
              {metrics?.avgLatencyMs?.toFixed(2) || "0.00"}
              <span className="text-lg text-muted-foreground ml-1">ms</span>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-2">Error Rate</div>
            <div className="text-3xl font-bold">
              {metrics?.errors || 0}
              <span className="text-lg text-muted-foreground ml-1">errors</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
