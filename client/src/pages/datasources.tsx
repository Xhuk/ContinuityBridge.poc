import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Database, Server, TestTube, Download, Trash2, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { DataSourceConfig, SftpConfig, AzureBlobConfig, PullHistory } from "@shared/schema";

export default function DataSources() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<"sftp" | "azureBlob">("sftp");

  const { data: sources = [], isLoading: sourcesLoading } = useQuery<DataSourceConfig[]>({
    queryKey: ["/api/datasources"],
  });

  const { data: history = [] } = useQuery<PullHistory[]>({
    queryKey: ["/api/datasources/history"],
    refetchInterval: 10000,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Data Sources</h1>
            <p className="text-sm text-muted-foreground mt-1">Configure SFTP and Azure Blob sources for XML ingestion</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-source">
                <Plus className="h-4 w-4 mr-2" />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Data Source</DialogTitle>
                <DialogDescription>Configure a new SFTP or Azure Blob data source</DialogDescription>
              </DialogHeader>
              <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as "sftp" | "azureBlob")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="sftp" data-testid="tab-sftp">
                    <Server className="h-4 w-4 mr-2" />
                    SFTP
                  </TabsTrigger>
                  <TabsTrigger value="azureBlob" data-testid="tab-azure">
                    <Cloud className="h-4 w-4 mr-2" />
                    Azure Blob
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="sftp">
                  <SftpForm onSuccess={() => setIsDialogOpen(false)} />
                </TabsContent>
                <TabsContent value="azureBlob">
                  <AzureBlobForm onSuccess={() => setIsDialogOpen(false)} />
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sourcesLoading ? (
            <div className="text-muted-foreground">Loading sources...</div>
          ) : sources.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No data sources configured. Click "Add Source" to get started.
            </div>
          ) : (
            sources.map((source) => (
              <SourceCard key={source.id} source={source} history={history.filter(h => h.sourceId === source.id)} />
            ))
          )}
        </div>

        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4">Recent Pull History</h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-border bg-muted/50">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium">Source</th>
                        <th className="text-left p-3 text-sm font-medium">File</th>
                        <th className="text-left p-3 text-sm font-medium">Items</th>
                        <th className="text-left p-3 text-sm font-medium">Status</th>
                        <th className="text-left p-3 text-sm font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 10).map((h) => (
                        <tr key={h.id} className="border-b border-border last:border-0">
                          <td className="p-3 text-sm">{h.sourceName}</td>
                          <td className="p-3 text-sm font-mono text-xs">{h.fileName}</td>
                          <td className="p-3 text-sm">{h.itemsProcessed}</td>
                          <td className="p-3">
                            <Badge variant={h.status === "success" ? "default" : "destructive"}>
                              {h.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {new Date(h.pulledAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ source, history }: { source: DataSourceConfig; history: PullHistory[] }) {
  const { toast } = useToast();

  const testMutation = useMutation({
    mutationFn: () => apiRequest(`/api/datasources/${source.id}/test`, { method: "POST" }),
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Connection Successful", description: data.message });
      } else {
        toast({ title: "Connection Failed", description: data.error || data.message, variant: "destructive" });
      }
    },
  });

  const pullMutation = useMutation({
    mutationFn: () => apiRequest(`/api/datasources/${source.id}/pull`, { method: "POST" }),
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Pull Successful", description: `Processed ${data.history.itemsProcessed} files` });
        queryClient.invalidateQueries({ queryKey: ["/api/datasources/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/events/recent"] });
      } else {
        toast({ title: "Pull Failed", description: data.error, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/api/datasources/${source.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Source Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/datasources"] });
    },
  });

  const lastPull = history[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {source.type === "sftp" ? <Server className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
            <div>
              <CardTitle>{source.name}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {source.type === "sftp" 
                  ? `${(source as SftpConfig).username}@${(source as SftpConfig).host}`
                  : `Azure Blob (${(source as AzureBlobConfig).connectionType})`
                }
              </CardDescription>
            </div>
          </div>
          <Badge variant={source.enabled ? "default" : "secondary"}>
            {source.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastPull && (
          <div className="text-sm">
            <div className="text-muted-foreground">Last Pull:</div>
            <div className="font-medium">{new Date(lastPull.pulledAt).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{lastPull.itemsProcessed} files processed</div>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            data-testid={`button-test-${source.id}`}
          >
            <TestTube className="h-4 w-4 mr-1" />
            Test
          </Button>
          <Button 
            size="sm" 
            onClick={() => pullMutation.mutate()}
            disabled={pullMutation.isPending || !source.enabled}
            data-testid={`button-pull-${source.id}`}
          >
            <Download className="h-4 w-4 mr-1" />
            Pull Now
          </Button>
          <Button 
            size="sm" 
            variant="destructive" 
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            data-testid={`button-delete-${source.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SftpForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    host: "",
    port: 22,
    username: "",
    authType: "password" as "password" | "privateKey",
    password: "",
    privateKey: "",
    remotePath: "/",
    filePattern: "*.xml",
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/datasources", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "SFTP Source Created" });
      queryClient.invalidateQueries({ queryKey: ["/api/datasources"] });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config: Partial<SftpConfig> = {
      type: "sftp",
      name: formData.name,
      host: formData.host,
      port: formData.port,
      username: formData.username,
      authType: formData.authType,
      remotePath: formData.remotePath,
      filePattern: formData.filePattern,
      enabled: true,
    };

    const secret = {
      sourceId: "",
      password: formData.authType === "password" ? formData.password : undefined,
      privateKey: formData.authType === "privateKey" ? formData.privateKey : undefined,
    };

    createMutation.mutate({ config, secret });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label htmlFor="sftp-name">Source Name</Label>
        <Input 
          id="sftp-name" 
          value={formData.name} 
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Production SFTP Server"
          required
          data-testid="input-sftp-name"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Label htmlFor="sftp-host">Host</Label>
          <Input 
            id="sftp-host" 
            value={formData.host} 
            onChange={(e) => setFormData({ ...formData, host: e.target.value })}
            placeholder="sftp.example.com"
            required
            data-testid="input-sftp-host"
          />
        </div>
        <div>
          <Label htmlFor="sftp-port">Port</Label>
          <Input 
            id="sftp-port" 
            type="number" 
            value={formData.port} 
            onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
            required
            data-testid="input-sftp-port"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="sftp-username">Username</Label>
        <Input 
          id="sftp-username" 
          value={formData.username} 
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          placeholder="user123"
          required
          data-testid="input-sftp-username"
        />
      </div>

      <div>
        <Label htmlFor="sftp-auth-type">Authentication Type</Label>
        <Select value={formData.authType} onValueChange={(v: any) => setFormData({ ...formData, authType: v })}>
          <SelectTrigger id="sftp-auth-type" data-testid="select-sftp-auth">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="password">Password</SelectItem>
            <SelectItem value="privateKey">Private Key (PPK)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.authType === "password" ? (
        <div>
          <Label htmlFor="sftp-password">Password</Label>
          <Input 
            id="sftp-password" 
            type="password" 
            value={formData.password} 
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            data-testid="input-sftp-password"
          />
        </div>
      ) : (
        <div>
          <Label htmlFor="sftp-key">Private Key (PEM format)</Label>
          <textarea
            id="sftp-key"
            className="w-full min-h-[100px] p-2 border rounded-md font-mono text-sm"
            value={formData.privateKey}
            onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
            placeholder="-----BEGIN RSA PRIVATE KEY-----..."
            required
            data-testid="textarea-sftp-key"
          />
        </div>
      )}

      <div>
        <Label htmlFor="sftp-path">Remote Path</Label>
        <Input 
          id="sftp-path" 
          value={formData.remotePath} 
          onChange={(e) => setFormData({ ...formData, remotePath: e.target.value })}
          placeholder="/uploads"
          data-testid="input-sftp-path"
        />
      </div>

      <div>
        <Label htmlFor="sftp-pattern">File Pattern</Label>
        <Input 
          id="sftp-pattern" 
          value={formData.filePattern} 
          onChange={(e) => setFormData({ ...formData, filePattern: e.target.value })}
          placeholder="*.xml"
          data-testid="input-sftp-pattern"
        />
      </div>

      <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-sftp">
        Create SFTP Source
      </Button>
    </form>
  );
}

function AzureBlobForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    connectionType: "connectionString" as "connectionString" | "http",
    connectionString: "",
    httpUrl: "",
    containerName: "",
    blobPrefix: "",
    filePattern: "*.xml",
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/datasources", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Azure Blob Source Created" });
      queryClient.invalidateQueries({ queryKey: ["/api/datasources"] });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config: Partial<AzureBlobConfig> = {
      type: "azureBlob",
      name: formData.name,
      connectionType: formData.connectionType,
      containerName: formData.connectionType === "connectionString" ? formData.containerName : undefined,
      blobPrefix: formData.blobPrefix,
      filePattern: formData.filePattern,
      enabled: true,
    };

    const secret = {
      sourceId: "",
      connectionString: formData.connectionType === "connectionString" ? formData.connectionString : undefined,
      httpUrl: formData.connectionType === "http" ? formData.httpUrl : undefined,
    };

    createMutation.mutate({ config, secret });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label htmlFor="azure-name">Source Name</Label>
        <Input 
          id="azure-name" 
          value={formData.name} 
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Production Azure Storage"
          required
          data-testid="input-azure-name"
        />
      </div>

      <div>
        <Label htmlFor="azure-connection-type">Connection Type</Label>
        <Select value={formData.connectionType} onValueChange={(v: any) => setFormData({ ...formData, connectionType: v })}>
          <SelectTrigger id="azure-connection-type" data-testid="select-azure-connection">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="connectionString">Connection String</SelectItem>
            <SelectItem value="http">HTTP URL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.connectionType === "connectionString" ? (
        <>
          <div>
            <Label htmlFor="azure-conn-str">Connection String</Label>
            <Input 
              id="azure-conn-str" 
              type="password" 
              value={formData.connectionString} 
              onChange={(e) => setFormData({ ...formData, connectionString: e.target.value })}
              placeholder="DefaultEndpointsProtocol=https;..."
              required
              data-testid="input-azure-connection-string"
            />
          </div>
          <div>
            <Label htmlFor="azure-container">Container Name</Label>
            <Input 
              id="azure-container" 
              value={formData.containerName} 
              onChange={(e) => setFormData({ ...formData, containerName: e.target.value })}
              placeholder="uploads"
              required
              data-testid="input-azure-container"
            />
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="azure-http-url">HTTP URL</Label>
          <Input 
            id="azure-http-url" 
            value={formData.httpUrl} 
            onChange={(e) => setFormData({ ...formData, httpUrl: e.target.value })}
            placeholder="https://mystorageaccount.blob.core.windows.net/container-name"
            required
            data-testid="input-azure-http-url"
          />
        </div>
      )}

      <div>
        <Label htmlFor="azure-prefix">Blob Prefix (optional)</Label>
        <Input 
          id="azure-prefix" 
          value={formData.blobPrefix} 
          onChange={(e) => setFormData({ ...formData, blobPrefix: e.target.value })}
          placeholder="incoming/"
          data-testid="input-azure-prefix"
        />
      </div>

      <div>
        <Label htmlFor="azure-pattern">File Pattern</Label>
        <Input 
          id="azure-pattern" 
          value={formData.filePattern} 
          onChange={(e) => setFormData({ ...formData, filePattern: e.target.value })}
          placeholder="*.xml"
          data-testid="input-azure-pattern"
        />
      </div>

      <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-azure">
        Create Azure Blob Source
      </Button>
    </form>
  );
}
