import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Server, Play, Pause, Activity, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function QueueConfiguration() {
  const { toast } = useToast();
  const [concurrency, setConcurrency] = useState(5);

  // Fetch queue configuration
  const { data: queueConfig, isLoading } = useQuery<{
    backend: string;
    workerEnabled: boolean;
    concurrency: number;
  }>({
    queryKey: ["/api/queue/config"],
    refetchInterval: false,
  });

  // Sync slider with fetched concurrency value
  const currentConcurrency = queueConfig?.concurrency || 5;
  if (concurrency === 5 && currentConcurrency !== 5) {
    setConcurrency(currentConcurrency);
  }

  // Toggle worker mutation
  const toggleWorkerMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/worker/toggle", { enabled });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/worker/status"] });
      toast({
        title: "Worker Updated",
        description: "Queue worker status changed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update worker",
        variant: "destructive",
      });
    },
  });

  // Update concurrency mutation
  const updateConcurrencyMutation = useMutation({
    mutationFn: async (newConcurrency: number) => {
      const res = await apiRequest("POST", "/api/worker/concurrency", { concurrency: newConcurrency });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue/config"] });
      // Set restart flag for configuration changes
      localStorage.setItem("app_needs_restart", "true");
      toast({
        title: "Concurrency Updated",
        description: `Worker concurrency set to ${concurrency}. Restart recommended.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update concurrency",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading configuration...</div>
        </CardContent>
      </Card>
    );
  }

  const backend = queueConfig?.backend || "inmemory";
  const workerEnabled = queueConfig?.workerEnabled || false;
  const currentConcurrency = queueConfig?.concurrency || 5;

  const getBackendBadge = (backend: string) => {
    switch (backend.toLowerCase()) {
      case "inmemory":
        return <Badge variant="outline">InMemory</Badge>;
      case "rabbitmq":
        return <Badge variant="default">RabbitMQ</Badge>;
      case "kafka":
        return <Badge variant="secondary">Kafka</Badge>;
      default:
        return <Badge>{backend}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Queue Backend Configuration</AlertTitle>
        <AlertDescription>
          Manage message queue settings for processing transformation flows. Backend changes require application restart.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Server className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Queue Backend</CardTitle>
                <CardDescription>Current message queue provider</CardDescription>
              </div>
            </div>
            {getBackendBadge(backend)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className={backend === "inmemory" ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">InMemory</CardTitle>
                <CardDescription className="text-xs">Fast, no persistence</CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  Best for development and testing. Data lost on restart.
                </p>
              </CardContent>
            </Card>

            <Card className={backend === "rabbitmq" ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">RabbitMQ</CardTitle>
                <CardDescription className="text-xs">Reliable, persistent</CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  Production-ready with message persistence and delivery guarantees.
                </p>
              </CardContent>
            </Card>

            <Card className={backend === "kafka" ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Kafka</CardTitle>
                <CardDescription className="text-xs">High throughput, scalable</CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  Enterprise-grade for high-volume data streaming.
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Activity className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <CardTitle>Queue Worker</CardTitle>
                <CardDescription>Process messages from the queue</CardDescription>
              </div>
            </div>
            <Badge variant={workerEnabled ? "default" : "outline"}>
              {workerEnabled ? "Running" : "Stopped"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Worker Status</Label>
              <p className="text-sm text-muted-foreground">
                {workerEnabled 
                  ? "Worker is actively processing messages" 
                  : "Worker is paused, messages will queue"}
              </p>
            </div>
            <Button
              variant={workerEnabled ? "outline" : "default"}
              onClick={() => toggleWorkerMutation.mutate(!workerEnabled)}
              disabled={toggleWorkerMutation.isPending}
              data-testid="button-toggle-worker"
            >
              {workerEnabled ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="concurrency">Worker Concurrency</Label>
              <Badge variant="outline">{currentConcurrency} concurrent jobs</Badge>
            </div>
            <Slider
              id="concurrency"
              min={1}
              max={20}
              step={1}
              value={[concurrency]}
              onValueChange={(value) => setConcurrency(value[0])}
              className="w-full"
              data-testid="slider-concurrency"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 (Low)</span>
              <span>10 (Medium)</span>
              <span>20 (High)</span>
            </div>
            {concurrency !== currentConcurrency && (
              <Button
                size="sm"
                onClick={() => updateConcurrencyMutation.mutate(concurrency)}
                disabled={updateConcurrencyMutation.isPending}
                data-testid="button-apply-concurrency"
              >
                Apply Changes
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
