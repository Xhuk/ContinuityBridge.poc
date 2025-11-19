/**
 * Advanced Throttling Configuration Page
 * Allows Founder/Consultant/Customer Admin to configure rate limiting and batch processing
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Gauge, 
  Server, 
  Database, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  Save,
  RotateCcw,
} from "lucide-react";

interface ThrottlingConfig {
  id: string;
  organizationId: string;
  workerConcurrency: number;
  httpRequestsPerSecond: number;
  httpMaxConcurrent: number;
  csvBatchSize: number;
  csvProcessingDelay: number;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  queuePollInterval: number;
  deadLetterAfterRetries: number;
  enabled: boolean;
  requiresRestart: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface RestartStatus {
  restartPending: boolean;
  canAutoRestart: boolean;
  restartCommand: string | null;
  pendingRestart: {
    requestedBy: string;
    requestedAt: string;
    reason: string;
    status: string;
  } | null;
}

export default function AdvancedThrottlingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [config, setConfig] = useState<Partial<ThrottlingConfig>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current configuration
  const { data: currentConfig, isLoading } = useQuery<ThrottlingConfig>({
    queryKey: ["/api/throttling/config"],
    refetchInterval: 10000, // Refresh every 10s
  });

  // Fetch restart status
  const { data: restartStatus } = useQuery<RestartStatus>({
    queryKey: ["/api/system/restart/status"],
    refetchInterval: 5000, // Refresh every 5s
  });

  // Initialize config when data loads
  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
  }, [currentConfig]);

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<ThrottlingConfig>) => {
      const res = await apiRequest("PUT", "/api/throttling/config", updates);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/throttling/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/restart/status"] });
      
      setHasChanges(false);
      
      if (data.requiresRestart) {
        toast({
          title: "Configuration Updated",
          description: "⚠️ System restart required for changes to take effect",
          variant: "default",
        });
      } else {
        toast({
          title: "Configuration Updated",
          description: "✅ Changes applied successfully",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Request restart mutation
  const requestRestartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/system/restart/request", {
        reason: "Throttling configuration change",
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/restart/status"] });
      toast({
        title: "Restart Requested",
        description: "System restart has been scheduled",
      });
    },
  });

  // Execute restart mutation
  const executeRestartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/system/restart/execute", {});
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "System Restarting",
          description: "The application will be back online shortly...",
        });
      } else {
        toast({
          title: "Manual Restart Required",
          description: data.message,
          variant: "default",
        });
      }
    },
  });

  // Clear restart mutation
  const clearRestartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/system/restart/clear", {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/restart/status"] });
      toast({
        title: "Restart Cleared",
        description: "Pending restart has been cancelled",
      });
    },
  });

  const handleSaveChanges = () => {
    updateConfigMutation.mutate(config);
  };

  const handleResetToDefault = () => {
    if (currentConfig) {
      setConfig(currentConfig);
      setHasChanges(false);
    }
  };

  const updateField = <K extends keyof ThrottlingConfig>(
    field: K,
    value: ThrottlingConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="px-6 py-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Advanced Throttling Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Configure rate limiting, batch processing, and retry strategies for your organization
        </p>
      </div>

      {/* Restart Warning Banner */}
      {restartStatus?.restartPending && (
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <strong>System Restart Pending</strong>
              <p className="text-sm mt-1">
                Configuration changes require a restart. Requested by{" "}
                {restartStatus.pendingRestart?.requestedBy}
              </p>
            </div>
            <div className="flex gap-2">
              {restartStatus.canAutoRestart && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => executeRestartMutation.mutate()}
                  disabled={executeRestartMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Restart Now
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => clearRestartMutation.mutate()}
              >
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Worker Configuration */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Server className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Worker Configuration</h2>
          <Badge variant="outline" className="ml-auto">
            Requires Restart
          </Badge>
        </div>
        <Separator className="mb-4" />

        <div className="space-y-6">
          <div>
            <Label htmlFor="workerConcurrency">
              Worker Concurrency (Parallel Jobs)
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Number of messages processed simultaneously. Higher values increase throughput
              but consume more resources.
            </p>
            <Slider
              id="workerConcurrency"
              min={1}
              max={100}
              step={1}
              value={[config.workerConcurrency || 3]}
              onValueChange={(value) => updateField("workerConcurrency", value[0])}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>1 (Low)</span>
              <span className="font-medium text-primary">
                {config.workerConcurrency || 3} workers
              </span>
              <span>100 (High)</span>
            </div>
          </div>

          <div>
            <Label htmlFor="queuePollInterval">Queue Poll Interval (ms)</Label>
            <p className="text-sm text-muted-foreground mb-3">
              How frequently the worker checks for new messages. Lower values reduce
              latency but increase CPU usage.
            </p>
            <Input
              id="queuePollInterval"
              type="number"
              min={100}
              max={10000}
              step={100}
              value={config.queuePollInterval || 1000}
              onChange={(e) =>
                updateField("queuePollInterval", parseInt(e.target.value))
              }
            />
          </div>
        </div>
      </Card>

      {/* HTTP Throttling */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">HTTP Request Throttling</h2>
        </div>
        <Separator className="mb-4" />

        <div className="space-y-6">
          <div>
            <Label htmlFor="httpRequestsPerSecond">
              Requests Per Second (Rate Limit)
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Maximum HTTP requests per second to external APIs. Prevents overwhelming
              downstream systems (Caso 3).
            </p>
            <Slider
              id="httpRequestsPerSecond"
              min={1}
              max={1000}
              step={10}
              value={[config.httpRequestsPerSecond || 50]}
              onValueChange={(value) => updateField("httpRequestsPerSecond", value[0])}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>1 req/s</span>
              <span className="font-medium text-primary">
                {config.httpRequestsPerSecond || 50} req/s
              </span>
              <span>1000 req/s</span>
            </div>
          </div>

          <div>
            <Label htmlFor="httpMaxConcurrent">
              Max Concurrent HTTP Requests
            </Label>
            <Input
              id="httpMaxConcurrent"
              type="number"
              min={1}
              max={100}
              value={config.httpMaxConcurrent || 10}
              onChange={(e) =>
                updateField("httpMaxConcurrent", parseInt(e.target.value))
              }
            />
          </div>
        </div>
      </Card>

      {/* CSV/Batch Processing */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">CSV/Batch Processing (Caso 3)</h2>
        </div>
        <Separator className="mb-4" />

        <div className="space-y-6">
          <div>
            <Label htmlFor="csvBatchSize">CSV Batch Size (Rows)</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Number of CSV rows processed in each batch. Smaller batches reduce
              memory usage but may decrease throughput.
            </p>
            <Input
              id="csvBatchSize"
              type="number"
              min={1}
              max={10000}
              value={config.csvBatchSize || 100}
              onChange={(e) =>
                updateField("csvBatchSize", parseInt(e.target.value))
              }
            />
          </div>

          <div>
            <Label htmlFor="csvProcessingDelay">
              Batch Processing Delay (ms)
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Delay between processing batches. Use to throttle load on target
              systems (e.g., Shopify API rate limits).
            </p>
            <Input
              id="csvProcessingDelay"
              type="number"
              min={0}
              max={5000}
              step={100}
              value={config.csvProcessingDelay || 0}
              onChange={(e) =>
                updateField("csvProcessingDelay", parseInt(e.target.value))
              }
            />
          </div>
        </div>
      </Card>

      {/* Retry Configuration */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Retry Strategy</h2>
        </div>
        <Separator className="mb-4" />

        <div className="space-y-6">
          <div>
            <Label htmlFor="maxRetries">Max Retries</Label>
            <Input
              id="maxRetries"
              type="number"
              min={0}
              max={10}
              value={config.maxRetries || 3}
              onChange={(e) => updateField("maxRetries", parseInt(e.target.value))}
            />
          </div>

          <div>
            <Label htmlFor="retryDelayMs">Initial Retry Delay (ms)</Label>
            <Input
              id="retryDelayMs"
              type="number"
              min={100}
              max={30000}
              step={100}
              value={config.retryDelayMs || 1000}
              onChange={(e) =>
                updateField("retryDelayMs", parseInt(e.target.value))
              }
            />
          </div>

          <div>
            <Label htmlFor="retryBackoffMultiplier">
              Backoff Multiplier (Exponential)
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Each retry waits: delay × multiplier^attempt. Example: 1s → 2s → 4s → 8s
            </p>
            <Input
              id="retryBackoffMultiplier"
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={config.retryBackoffMultiplier || 2}
              onChange={(e) =>
                updateField("retryBackoffMultiplier", parseFloat(e.target.value))
              }
            />
          </div>

          <div>
            <Label htmlFor="deadLetterAfterRetries">
              Dead Letter After Retries
            </Label>
            <Input
              id="deadLetterAfterRetries"
              type="number"
              min={1}
              max={20}
              value={config.deadLetterAfterRetries || 5}
              onChange={(e) =>
                updateField("deadLetterAfterRetries", parseInt(e.target.value))
              }
            />
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {hasChanges ? (
            <>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>Unsaved changes</span>
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>All changes saved</span>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleResetToDefault}
            disabled={!hasChanges}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSaveChanges}
            disabled={!hasChanges || updateConfigMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {updateConfigMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* System Status */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span>
              <strong>Restart Available:</strong>{" "}
              {restartStatus?.canAutoRestart ? "✅ Yes" : "❌ Manual required"}
            </span>
            {restartStatus?.restartCommand && (
              <span className="text-muted-foreground">
                Command: <code className="text-xs">{restartStatus.restartCommand}</code>
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
