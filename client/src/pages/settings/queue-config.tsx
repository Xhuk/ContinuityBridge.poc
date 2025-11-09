import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Server, 
  Play, 
  Pause, 
  Activity, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle,
  ExternalLink,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

type QueueBackend = "inmemory" | "rabbitmq" | "kafka";

export default function QueueConfiguration() {
  const { toast } = useToast();
  const [concurrency, setConcurrency] = useState(5);
  
  // Backend selection state
  const [selectedBackend, setSelectedBackend] = useState<QueueBackend | null>(null);
  const [selectedSecretId, setSelectedSecretId] = useState<string>("");
  const [connectionTested, setConnectionTested] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [showRiskDialog, setShowRiskDialog] = useState(false);

  // Fetch queue configuration
  const { data: queueConfig, isLoading } = useQuery<{
    backend: string;
    workerEnabled: boolean;
    concurrency: number;
  }>({
    queryKey: ["/api/queue/config"],
    refetchInterval: false,
  });

  // Sync slider with fetched concurrency value on mount
  useEffect(() => {
    if (queueConfig?.concurrency) {
      setConcurrency(queueConfig.concurrency);
    }
  }, [queueConfig?.concurrency]);

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

  // Fetch secrets for backend configuration
  const { data: secrets } = useQuery<Array<{
    id: string;
    label: string;
    integrationType: string;
  }>>({
    queryKey: ["/api/secrets"],
    enabled: selectedBackend !== null && selectedBackend !== "inmemory",
  });

  // Filter secrets by selected backend (map lowercase backend to capitalized integration type)
  const integrationTypeMap: Record<string, string> = {
    rabbitmq: "RabbitMQ",
    kafka: "Kafka",
  };
  
  const filteredSecrets = secrets?.filter(s => 
    selectedBackend && s.integrationType === integrationTypeMap[selectedBackend]
  ) || [];

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/queue/test-connection", {
        backend: selectedBackend,
        secretId: selectedSecretId,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setConnectionTested(true);
      setTestResult({ success: true, message: data.message });
      toast({
        title: "Connection Successful",
        description: data.message || `Successfully connected to ${selectedBackend?.toUpperCase()}`,
      });
    },
    onError: (error: any) => {
      setConnectionTested(false);
      setTestResult({ success: false, message: error.message });
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to queue backend",
        variant: "destructive",
      });
    },
  });

  // Save backend configuration mutation
  const saveBackendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/queue/change-backend", {
        backend: selectedBackend,
        secretId: selectedSecretId || null,
        immediate: true,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue/config"] });
      setShowRiskDialog(false);
      setSelectedBackend(null);
      setConnectionTested(false);
      setTestResult(null);
      localStorage.setItem("app_needs_restart", "true");
      toast({
        title: "Backend Configured",
        description: data.message || "Queue backend configuration saved. Restart to apply.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save backend configuration",
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

  const currentBackend = queueConfig?.backend || "inmemory";
  const workerEnabled = queueConfig?.workerEnabled || false;
  const currentConcurrency = queueConfig?.concurrency || 5;

  const handleCardSelect = (backend: QueueBackend) => {
    if (selectedBackend === backend) {
      // Deselect if clicking the same card
      setSelectedBackend(null);
      setSelectedSecretId("");
      setConnectionTested(false);
      setTestResult(null);
    } else {
      setSelectedBackend(backend);
      setSelectedSecretId("");
      setConnectionTested(false);
      setTestResult(null);
    }
  };

  const handleApplyChanges = () => {
    // Validate before showing risk dialog
    if (selectedBackend === "inmemory") {
      // InMemory doesn't need connection test
      setShowRiskDialog(true);
    } else if (!selectedSecretId) {
      toast({
        title: "Credentials Required",
        description: `Please select ${selectedBackend?.toUpperCase()} credentials from the vault`,
        variant: "destructive",
      });
    } else if (!connectionTested || !testResult?.success) {
      toast({
        title: "Connection Test Required",
        description: "Please test the connection successfully before applying changes",
        variant: "destructive",
      });
    } else {
      setShowRiskDialog(true);
    }
  };

  const renderBackendCard = (
    backend: QueueBackend,
    title: string,
    description: string,
    recommendation?: { name: string; url: string }
  ) => {
    const isCurrent = currentBackend === backend;
    const isSelected = selectedBackend === backend;
    const isExpanded = isSelected;

    return (
      <Card 
        className={`cursor-pointer transition-all ${
          isCurrent ? "border-primary ring-2 ring-primary/20" : 
          isSelected ? "border-blue-500 ring-2 ring-blue-500/20" : 
          "hover-elevate"
        }`}
        onClick={() => handleCardSelect(backend)}
        data-testid={`card-backend-${backend}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-base">{title}</CardTitle>
                {isCurrent && (
                  <Badge variant="default" className="text-xs">Current</Badge>
                )}
                {isSelected && !isCurrent && (
                  <Badge variant="secondary" className="text-xs">Selected</Badge>
                )}
              </div>
              <CardDescription className="text-sm">{description}</CardDescription>
              {recommendation && (
                <a
                  href={recommendation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Recommended: {recommendation.name}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="space-y-4 pt-4 border-t">
            {backend !== "inmemory" && (
              <>
                <div className="space-y-3">
                  <Label htmlFor={`secret-${backend}`}>
                    {backend.toUpperCase()} Credentials
                  </Label>
                  <Select
                    value={selectedSecretId}
                    onValueChange={(value) => {
                      setSelectedSecretId(value);
                      setConnectionTested(false);
                      setTestResult(null);
                    }}
                  >
                    <SelectTrigger id={`secret-${backend}`} data-testid="select-secret">
                      <SelectValue placeholder="Select credentials from vault" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSecrets.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          No {backend.toUpperCase()} credentials in vault
                        </div>
                      ) : (
                        filteredSecrets.map((secret) => (
                          <SelectItem key={secret.id} value={secret.id}>
                            {secret.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Add credentials in the <strong>Secrets Vault</strong> tab first
                  </p>
                </div>

                {testResult && (
                  <Alert variant={testResult.success ? "default" : "destructive"}>
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>
                      {testResult.success ? "Connection Test Passed" : "Connection Test Failed"}
                    </AlertTitle>
                    <AlertDescription className="text-xs">
                      {testResult.message}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    testConnectionMutation.mutate();
                  }}
                  disabled={testConnectionMutation.isPending || !selectedSecretId}
                  data-testid="button-test-connection"
                  className="w-full"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${testConnectionMutation.isPending ? "animate-spin" : ""}`} />
                  {testConnectionMutation.isPending ? "Testing..." : "Test Connection"}
                </Button>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedBackend(null);
                  setSelectedSecretId("");
                  setConnectionTested(false);
                  setTestResult(null);
                }}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleApplyChanges();
                }}
                disabled={backend === currentBackend}
                data-testid="button-apply-changes"
                className="flex-1"
              >
                Apply Changes
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Queue Backend Configuration</AlertTitle>
        <AlertDescription>
          Select a queue backend below to configure. Changes require application restart.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <Label className="text-base">Select Queue Backend</Label>
        <div className="grid gap-4 md:grid-cols-3">
          {renderBackendCard(
            "inmemory",
            "InMemory",
            "Fast, no persistence. Best for development and testing. Data lost on restart.",
            undefined
          )}
          {renderBackendCard(
            "rabbitmq",
            "RabbitMQ",
            "Reliable, persistent. Production-ready with message persistence and delivery guarantees.",
            { name: "CloudAMQP", url: "https://www.cloudamqp.com/" }
          )}
          {renderBackendCard(
            "kafka",
            "Kafka",
            "High throughput, scalable. Enterprise-grade for high-volume data streaming.",
            { name: "Confluent Cloud", url: "https://www.confluent.io/confluent-cloud/" }
          )}
        </div>
      </div>

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

      <AlertDialog open={showRiskDialog} onOpenChange={setShowRiskDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </div>
              <AlertDialogTitle>Confirm Queue Backend Change</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-3">
              <div className="text-sm text-muted-foreground">
                You are about to change the queue backend from{" "}
                <Badge variant="outline" className="mx-1">{currentBackend}</Badge>
                to
                <Badge variant="outline" className="mx-1">{selectedBackend}</Badge>.
              </div>
              
              <Alert variant="destructive" className="border-orange-500/50 bg-orange-500/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-sm">Important Warnings</AlertTitle>
                <AlertDescription className="space-y-2 text-xs">
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Application restart required</strong> - The server must be restarted for changes to take effect</li>
                    <li><strong>Potential message loss</strong> - In-flight messages in the current queue may be lost if not using persistent storage</li>
                    <li><strong>Previous backend saved</strong> - Your current <Badge variant="outline" className="text-xs mx-1">{currentBackend}</Badge> configuration will be saved for rollback if needed</li>
                    <li><strong>Worker will be interrupted</strong> - Any currently processing jobs will be terminated during restart</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="text-sm text-muted-foreground">
                Do you want to proceed with this change?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-risk">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => saveBackendMutation.mutate()}
              disabled={saveBackendMutation.isPending}
              data-testid="button-confirm-risk"
              className="bg-orange-500 hover:bg-orange-600"
            >
              {saveBackendMutation.isPending ? "Applying..." : "Yes, Apply Changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
