import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Server,
  Database,
  Network,
  Shield,
  Save,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Copy,
  ExternalLink,
  Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface ClusterConfig {
  id?: string;
  organizationId: string;
  enabled: boolean;
  
  // App Server Configuration
  appServerHost: string;
  appServerPort: number;
  appReplicas: number;
  
  // DB Server Configuration
  dbServerHost: string;
  dbServerPort: number;
  redisServerPort: number;
  
  // Network Configuration
  privateNetwork: boolean;
  sslEnabled: boolean;
  
  // Resource Limits
  appServerCpuLimit: string;
  appServerMemoryLimit: string;
  dbServerCpuLimit: string;
  dbServerMemoryLimit: string;
  
  createdAt?: string;
  updatedAt?: string;
}

export default function ClusterConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [config, setConfig] = useState<Partial<ClusterConfig>>({
    enabled: false,
    appServerHost: "10.0.1.10",
    appServerPort: 5000,
    appReplicas: 2,
    dbServerHost: "10.0.1.20",
    dbServerPort: 5432,
    redisServerPort: 6379,
    privateNetwork: true,
    sslEnabled: true,
    appServerCpuLimit: "2.0",
    appServerMemoryLimit: "4G",
    dbServerCpuLimit: "4.0",
    dbServerMemoryLimit: "8G",
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current configuration
  const { data: currentConfig, isLoading } = useQuery<ClusterConfig>({
    queryKey: ["/api/cluster/config"],
  });

  // Initialize config when data loads
  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
  }, [currentConfig]);

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<ClusterConfig>) => {
      const res = await apiRequest("PUT", "/api/cluster/config", updates);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cluster/config"] });
      setHasChanges(false);
      toast({
        title: "Cluster Configuration Updated",
        description: "✅ Configuration saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Generate deployment files mutation
  const generateFilesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cluster/generate-files", config);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Deployment Files Generated",
        description: `✅ Files ready for download: ${data.files.join(", ")}`,
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

  const updateField = <K extends keyof ClusterConfig>(
    field: K,
    value: ClusterConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to Clipboard",
      description: `${label} copied`,
    });
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
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Cluster Deployment Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Configure distributed architecture: 1 App Server (Stateless) + 1 DB Server (Stateful)
        </p>
      </div>

      {/* Enable/Disable Cluster Mode */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Cluster Mode</h2>
              {config.enabled && (
                <Badge variant="default">Active</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Enable distributed deployment with separate application and database servers
            </p>
          </div>
          <Switch
            checked={config.enabled || false}
            onCheckedChange={(checked) => updateField("enabled", checked)}
          />
        </div>
      </Card>

      {config.enabled && (
        <>
          {/* Architecture Overview */}
          <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
            <Info className="h-5 w-5 text-blue-600" />
            <AlertDescription>
              <strong>Perfil C - Cluster Architecture</strong>
              <div className="mt-2 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span><strong>Server A (App):</strong> Stateless application containers - Scalable horizontally</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span><strong>Server B (DB):</strong> PostgreSQL + Valkey/Redis - Persistent storage</span>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="servers" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="servers">Servers</TabsTrigger>
              <TabsTrigger value="network">Network & Security</TabsTrigger>
              <TabsTrigger value="instructions">Setup Instructions</TabsTrigger>
            </TabsList>

            {/* Server Configuration Tab */}
            <TabsContent value="servers" className="space-y-6">
              {/* App Server Configuration */}
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Server className="h-5 w-5 text-green-600" />
                  <h2 className="text-xl font-semibold">Server A - Application Server</h2>
                  <Badge variant="outline" className="ml-auto">Stateless</Badge>
                </div>
                <Separator className="mb-4" />

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="appServerHost">Server A IP/Hostname</Label>
                      <Input
                        id="appServerHost"
                        value={config.appServerHost || ""}
                        onChange={(e) => updateField("appServerHost", e.target.value)}
                        placeholder="10.0.1.10 or app.yourdomain.com"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Private IP or internal hostname
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="appServerPort">Application Port</Label>
                      <Input
                        id="appServerPort"
                        type="number"
                        value={config.appServerPort || 5000}
                        onChange={(e) => updateField("appServerPort", parseInt(e.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="appReplicas">Number of Replicas (Horizontal Scaling)</Label>
                    <Input
                      id="appReplicas"
                      type="number"
                      min={1}
                      max={10}
                      value={config.appReplicas || 2}
                      onChange={(e) => updateField("appReplicas", parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Number of app instances to run (requires load balancer)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="appServerCpuLimit">CPU Limit</Label>
                      <Input
                        id="appServerCpuLimit"
                        value={config.appServerCpuLimit || "2.0"}
                        onChange={(e) => updateField("appServerCpuLimit", e.target.value)}
                        placeholder="2.0 (cores)"
                      />
                    </div>

                    <div>
                      <Label htmlFor="appServerMemoryLimit">Memory Limit</Label>
                      <Input
                        id="appServerMemoryLimit"
                        value={config.appServerMemoryLimit || "4G"}
                        onChange={(e) => updateField("appServerMemoryLimit", e.target.value)}
                        placeholder="4G"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* DB Server Configuration */}
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="h-5 w-5 text-blue-600" />
                  <h2 className="text-xl font-semibold">Server B - Database Server</h2>
                  <Badge variant="outline" className="ml-auto">Stateful</Badge>
                </div>
                <Separator className="mb-4" />

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="dbServerHost">Server B IP/Hostname</Label>
                      <Input
                        id="dbServerHost"
                        value={config.dbServerHost || ""}
                        onChange={(e) => updateField("dbServerHost", e.target.value)}
                        placeholder="10.0.1.20 or db.yourdomain.com"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Private IP or internal hostname
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="dbServerPort">PostgreSQL Port</Label>
                      <Input
                        id="dbServerPort"
                        type="number"
                        value={config.dbServerPort || 5432}
                        onChange={(e) => updateField("dbServerPort", parseInt(e.target.value))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="redisServerPort">Valkey/Redis Port</Label>
                      <Input
                        id="redisServerPort"
                        type="number"
                        value={config.redisServerPort || 6379}
                        onChange={(e) => updateField("redisServerPort", parseInt(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="dbServerCpuLimit">CPU Limit</Label>
                      <Input
                        id="dbServerCpuLimit"
                        value={config.dbServerCpuLimit || "4.0"}
                        onChange={(e) => updateField("dbServerCpuLimit", e.target.value)}
                        placeholder="4.0 (cores)"
                      />
                    </div>

                    <div>
                      <Label htmlFor="dbServerMemoryLimit">Memory Limit</Label>
                      <Input
                        id="dbServerMemoryLimit"
                        value={config.dbServerMemoryLimit || "8G"}
                        onChange={(e) => updateField("dbServerMemoryLimit", e.target.value)}
                        placeholder="8G"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Network & Security Tab */}
            <TabsContent value="network" className="space-y-6">
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Network & Security Configuration</h2>
                </div>
                <Separator className="mb-4" />

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Private Network</Label>
                      <p className="text-sm text-muted-foreground">
                        Use private network/VPC between servers (Recommended)
                      </p>
                    </div>
                    <Switch
                      checked={config.privateNetwork || false}
                      onCheckedChange={(checked) => updateField("privateNetwork", checked)}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>SSL/TLS Encryption</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable SSL for database connections between servers
                      </p>
                    </div>
                    <Switch
                      checked={config.sslEnabled || false}
                      onCheckedChange={(checked) => updateField("sslEnabled", checked)}
                    />
                  </div>

                  <Separator />

                  <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <AlertDescription>
                      <strong>Required Firewall Rules</strong>
                      <div className="mt-2 space-y-2 text-sm font-mono">
                        <div>
                          <strong>Server A → Server B:</strong>
                          <ul className="list-disc list-inside ml-4 mt-1">
                            <li>Allow TCP {config.dbServerPort || 5432} (PostgreSQL)</li>
                            <li>Allow TCP {config.redisServerPort || 6379} (Valkey/Redis)</li>
                          </ul>
                        </div>
                        <div className="mt-2">
                          <strong>Server B → Server A:</strong>
                          <ul className="list-disc list-inside ml-4 mt-1">
                            <li>No inbound connections required</li>
                          </ul>
                        </div>
                        <div className="mt-2">
                          <strong>Internet → Server A:</strong>
                          <ul className="list-disc list-inside ml-4 mt-1">
                            <li>Allow TCP 80 (HTTP)</li>
                            <li>Allow TCP 443 (HTTPS)</li>
                          </ul>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>

                  <Card className="p-4 bg-muted/50">
                    <h3 className="font-semibold mb-3">Test Network Connectivity</h3>
                    <div className="space-y-2 text-sm font-mono">
                      <div className="flex items-center justify-between">
                        <span>From Server A, test PostgreSQL:</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(
                            `telnet ${config.dbServerHost} ${config.dbServerPort}`,
                            "PostgreSQL test command"
                          )}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <code className="block bg-background p-2 rounded">
                        telnet {config.dbServerHost} {config.dbServerPort}
                      </code>

                      <div className="flex items-center justify-between mt-3">
                        <span>From Server A, test Valkey:</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(
                            `telnet ${config.dbServerHost} ${config.redisServerPort}`,
                            "Valkey test command"
                          )}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <code className="block bg-background p-2 rounded">
                        telnet {config.dbServerHost} {config.redisServerPort}
                      </code>
                    </div>
                  </Card>
                </div>
              </Card>
            </TabsContent>

            {/* Setup Instructions Tab */}
            <TabsContent value="instructions" className="space-y-6">
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Deployment Instructions</h2>
                <Separator className="mb-6" />

                <div className="space-y-6">
                  {/* Server B Setup */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="default" className="bg-blue-600">Step 1</Badge>
                      <h3 className="font-semibold">Setup Server B (Database Server)</h3>
                    </div>
                    
                    <div className="ml-16 space-y-3">
                      <div>
                        <Label>1.1. Install Docker on Server B</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          curl -fsSL https://get.docker.com | sh
                        </code>
                      </div>

                      <div>
                        <Label>1.2. Create data directories</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          mkdir -p /var/lib/continuitybridge/postgres<br />
                          mkdir -p /var/lib/continuitybridge/valkey
                        </code>
                      </div>

                      <div>
                        <Label>1.3. Deploy database services</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          cd /opt/continuitybridge<br />
                          docker-compose -f docker-compose.cluster.yml up -d postgres valkey
                        </code>
                      </div>

                      <div>
                        <Label>1.4. Verify services are running</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          docker-compose -f docker-compose.cluster.yml ps
                        </code>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Server A Setup */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="default" className="bg-green-600">Step 2</Badge>
                      <h3 className="font-semibold">Setup Server A (Application Server)</h3>
                    </div>
                    
                    <div className="ml-16 space-y-3">
                      <div>
                        <Label>2.1. Install Docker on Server A</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          curl -fsSL https://get.docker.com | sh
                        </code>
                      </div>

                      <div>
                        <Label>2.2. Configure environment</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          cd /opt/continuitybridge<br />
                          cp .env.cluster .env<br />
                          nano .env  # Update DB_SERVER_HOST={config.dbServerHost}
                        </code>
                      </div>

                      <div>
                        <Label>2.3. Deploy application</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          docker-compose -f docker-compose.cluster.yml up -d app
                        </code>
                      </div>

                      <div>
                        <Label>2.4. Check application logs</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          docker-compose -f docker-compose.cluster.yml logs -f app
                        </code>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Network Configuration */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="default" className="bg-purple-600">Step 3</Badge>
                      <h3 className="font-semibold">Configure Network & Firewall</h3>
                    </div>
                    
                    <div className="ml-16 space-y-3">
                      <div>
                        <Label>3.1. On Server B, allow connections from Server A</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          sudo ufw allow from {config.appServerHost} to any port {config.dbServerPort}<br />
                          sudo ufw allow from {config.appServerHost} to any port {config.redisServerPort}
                        </code>
                      </div>

                      <div>
                        <Label>3.2. On Server A, allow HTTP/HTTPS from internet</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          sudo ufw allow 80/tcp<br />
                          sudo ufw allow 443/tcp
                        </code>
                      </div>

                      <div>
                        <Label>3.3. Test connectivity from Server A</Label>
                        <code className="block bg-muted p-3 rounded mt-2 text-sm">
                          telnet {config.dbServerHost} {config.dbServerPort}<br />
                          telnet {config.dbServerHost} {config.redisServerPort}
                        </code>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Scaling */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline">Optional</Badge>
                      <h3 className="font-semibold">Horizontal Scaling (Server A)</h3>
                    </div>
                    
                    <div className="ml-16 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Scale to {config.appReplicas} replicas for high availability:
                      </p>
                      <code className="block bg-muted p-3 rounded mt-2 text-sm">
                        docker-compose -f docker-compose.cluster.yml up -d --scale app={config.appReplicas}
                      </code>
                      <p className="text-sm text-yellow-600">
                        ⚠️ Requires nginx or haproxy load balancer in front of app instances
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Download Configuration Files */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Download Deployment Files</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Generate and download cluster deployment configuration files
                </p>
                <Button
                  onClick={() => generateFilesMutation.mutate()}
                  disabled={generateFilesMutation.isPending || !config.enabled}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {generateFilesMutation.isPending ? "Generating..." : "Generate & Download Files"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Includes: docker-compose.cluster.yml, .env.cluster, deploy-cluster.sh
                </p>
              </Card>
            </TabsContent>
          </Tabs>

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
                {updateConfigMutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
