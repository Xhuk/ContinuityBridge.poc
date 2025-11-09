import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, TestTube, Trash2, Building, Package, ShoppingCart, Truck, Box, MapPin, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { InterfaceConfig } from "@shared/schema";

const interfaceIcons: Record<string, any> = {
  wms: Package,
  erp: Building,
  marketplace: ShoppingCart,
  tms: Truck,
  "3pl": Box,
  lastmile: MapPin,
  custom: Cog,
};

const interfaceLabels: Record<string, string> = {
  wms: "WMS",
  erp: "ERP",
  marketplace: "Marketplace",
  tms: "TMS",
  "3pl": "3PL",
  lastmile: "Last Mile",
  custom: "Custom",
};

export default function Interfaces() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: interfaces = [], isLoading } = useQuery<InterfaceConfig[]>({
    queryKey: ["/api/interfaces"],
    refetchInterval: 30000,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Integration Interfaces</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure connections to WMS, Oracle, Manhattan, Amazon, Last Mile, and other systems
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-interface">
                <Plus className="h-4 w-4 mr-2" />
                Add Interface
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Integration Interface</DialogTitle>
                <DialogDescription>Configure a new system integration interface</DialogDescription>
              </DialogHeader>
              <InterfaceForm onSuccess={() => setIsDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="text-muted-foreground">Loading interfaces...</div>
          ) : interfaces.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No interfaces configured. Click "Add Interface" to get started.
            </div>
          ) : (
            interfaces.map((iface) => (
              <InterfaceCard key={iface.id} interface={iface} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function InterfaceCard({ interface: iface }: { interface: InterfaceConfig }) {
  const { toast } = useToast();
  const Icon = interfaceIcons[iface.type] || Cog;

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/interfaces/${iface.id}/test`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Connection Successful", description: data.message });
      } else {
        toast({ title: "Connection Failed", description: data.error || data.message, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/interfaces/${iface.id}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Interface Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/interfaces"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <div>
              <CardTitle>{iface.name}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {interfaceLabels[iface.type]} • {iface.protocol.toUpperCase()}
              </CardDescription>
            </div>
          </div>
          <Badge variant={iface.enabled ? "default" : "secondary"}>
            {iface.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Direction:</span>
            <Badge variant="outline">{iface.direction}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Auth:</span>
            <span className="text-xs font-mono">{iface.authType}</span>
          </div>
          {iface.endpoint && (
            <div className="text-xs text-muted-foreground truncate">
              {iface.endpoint}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            data-testid={`button-test-${iface.id}`}
          >
            <TestTube className="h-4 w-4 mr-1" />
            Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm(`Delete interface "${iface.name}"?`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            data-testid={`button-delete-${iface.id}`}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InterfaceForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "wms" as string,
    direction: "bidirectional" as string,
    protocol: "rest_api" as string,
    authType: "none" as string,
    enabled: true,
    
    // Connection details
    endpoint: "",
    host: "",
    port: 22,
    path: "",
    
    // HTTP config
    httpMethod: "POST",
    httpHeaders: "",
    httpTimeout: 30000,
    
    // Auth credentials
    apiKey: "",
    bearerToken: "",
    username: "",
    password: "",
    
    // OAuth2
    tokenUrl: "",
    scope: "",
    clientId: "",
    clientSecret: "",
    
    // Data formats
    defaultFormat: "json" as string,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Validate and parse HTTP headers
      let parsedHeaders = {};
      if (formData.httpHeaders && formData.httpHeaders.trim()) {
        try {
          parsedHeaders = JSON.parse(formData.httpHeaders);
        } catch (e) {
          throw new Error("Invalid JSON in HTTP headers. Please check your syntax.");
        }
      }

      // Build config object
      const config: any = {
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        direction: formData.direction,
        protocol: formData.protocol,
        authType: formData.authType,
        enabled: formData.enabled,
        endpoint: formData.endpoint || undefined,
        host: formData.host || undefined,
        port: formData.port || undefined,
        path: formData.path || undefined,
        formats: [formData.defaultFormat],
        defaultFormat: formData.defaultFormat,
      };

      // Add HTTP config if REST/SOAP/GraphQL
      if (["rest_api", "soap", "graphql"].includes(formData.protocol)) {
        config.httpConfig = {
          method: formData.httpMethod,
          headers: parsedHeaders,
          timeout: formData.httpTimeout,
        };
      }

      // Add OAuth2 config if needed
      if (formData.authType === "oauth2") {
        config.oauth2Config = {
          tokenUrl: formData.tokenUrl,
          scope: formData.scope || undefined,
          grantType: "client_credentials",
        };
      }

      // Build secret object
      const secret: any = {
        interfaceId: "", // Will be set by backend
      };

      if (formData.authType === "api_key" && formData.apiKey) {
        secret.apiKey = formData.apiKey;
      } else if (formData.authType === "bearer_token" && formData.bearerToken) {
        secret.bearerToken = formData.bearerToken;
      } else if (formData.authType === "basic_auth" && formData.username && formData.password) {
        secret.username = formData.username;
        secret.password = formData.password;
      } else if (formData.authType === "oauth2") {
        secret.clientId = formData.clientId;
        secret.clientSecret = formData.clientSecret;
      }

      const payload = {
        config,
        secret: Object.keys(secret).length > 1 ? secret : undefined,
      };

      const res = await apiRequest("POST", "/api/interfaces", payload);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Interface Created", description: `${data.name} has been configured successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/interfaces"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    },
  });

  const showEndpoint = ["rest_api", "soap", "graphql", "webhook"].includes(formData.protocol);
  const showHostPort = ["sftp", "ftp", "database"].includes(formData.protocol);
  const showHttpConfig = ["rest_api", "soap", "graphql"].includes(formData.protocol);
  const showOAuth2 = formData.authType === "oauth2";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createMutation.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">Interface Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Oracle ERP Production, Manhattan WMS, Amazon MWS"
            required
            data-testid="input-interface-name"
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this integration"
            rows={2}
            data-testid="input-description"
          />
        </div>

        <div>
          <Label htmlFor="type">Interface Type *</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
            <SelectTrigger id="type" data-testid="select-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wms">WMS (Warehouse Management)</SelectItem>
              <SelectItem value="erp">ERP (Oracle, SAP, etc.)</SelectItem>
              <SelectItem value="marketplace">Marketplace (Amazon, MercadoLibre)</SelectItem>
              <SelectItem value="tms">TMS (Transportation Management)</SelectItem>
              <SelectItem value="3pl">3PL (Third-Party Logistics)</SelectItem>
              <SelectItem value="lastmile">Last Mile Delivery</SelectItem>
              <SelectItem value="custom">Custom Integration</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="direction">Direction *</Label>
          <Select value={formData.direction} onValueChange={(v) => setFormData({ ...formData, direction: v })}>
            <SelectTrigger id="direction" data-testid="select-direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inbound">Inbound (Receive Data)</SelectItem>
              <SelectItem value="outbound">Outbound (Send Data)</SelectItem>
              <SelectItem value="bidirectional">Bidirectional (Both)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="protocol">Protocol *</Label>
          <Select value={formData.protocol} onValueChange={(v) => setFormData({ ...formData, protocol: v })}>
            <SelectTrigger id="protocol" data-testid="select-protocol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rest_api">REST API</SelectItem>
              <SelectItem value="soap">SOAP</SelectItem>
              <SelectItem value="graphql">GraphQL</SelectItem>
              <SelectItem value="sftp">SFTP</SelectItem>
              <SelectItem value="ftp">FTP</SelectItem>
              <SelectItem value="webhook">Webhook</SelectItem>
              <SelectItem value="database">Database</SelectItem>
              <SelectItem value="message_queue">Message Queue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="authType">Authentication *</Label>
          <Select value={formData.authType} onValueChange={(v) => setFormData({ ...formData, authType: v })}>
            <SelectTrigger id="authType" data-testid="select-auth">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="api_key">API Key</SelectItem>
              <SelectItem value="bearer_token">Bearer Token</SelectItem>
              <SelectItem value="basic_auth">Basic Auth</SelectItem>
              <SelectItem value="oauth2">OAuth 2.0</SelectItem>
              <SelectItem value="certificate">Certificate</SelectItem>
              <SelectItem value="ssh_key">SSH Key</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {showEndpoint && (
        <div>
          <Label htmlFor="endpoint">Endpoint URL *</Label>
          <Input
            id="endpoint"
            value={formData.endpoint}
            onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
            placeholder="https://api.example.com/v1"
            required
            data-testid="input-endpoint"
          />
        </div>
      )}

      {showHostPort && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Label htmlFor="host">Host *</Label>
            <Input
              id="host"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              placeholder="sftp.example.com"
              required
              data-testid="input-host"
            />
          </div>
          <div>
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              type="number"
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
              data-testid="input-port"
            />
          </div>
        </div>
      )}

      {showHttpConfig && (
        <div className="space-y-4 p-4 border border-border rounded-md">
          <h3 className="text-sm font-medium">HTTP Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="httpMethod">HTTP Method</Label>
              <Select value={formData.httpMethod} onValueChange={(v) => setFormData({ ...formData, httpMethod: v })}>
                <SelectTrigger id="httpMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="httpTimeout">Timeout (ms)</Label>
              <Input
                id="httpTimeout"
                type="number"
                value={formData.httpTimeout}
                onChange={(e) => setFormData({ ...formData, httpTimeout: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="httpHeaders">Headers (JSON)</Label>
            <Textarea
              id="httpHeaders"
              value={formData.httpHeaders}
              onChange={(e) => setFormData({ ...formData, httpHeaders: e.target.value })}
              placeholder='{"Content-Type": "application/json"}'
              rows={3}
            />
          </div>
        </div>
      )}

      {formData.authType !== "none" && (
        <div className="space-y-4 p-4 border border-border rounded-md">
          <h3 className="text-sm font-medium">Authentication Credentials</h3>

          {formData.authType === "api_key" && (
            <div>
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                required
                data-testid="input-api-key"
              />
            </div>
          )}

          {formData.authType === "bearer_token" && (
            <div>
              <Label htmlFor="bearerToken">Bearer Token *</Label>
              <Input
                id="bearerToken"
                type="password"
                value={formData.bearerToken}
                onChange={(e) => setFormData({ ...formData, bearerToken: e.target.value })}
                required
                data-testid="input-bearer-token"
              />
            </div>
          )}

          {formData.authType === "basic_auth" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  data-testid="input-username"
                />
              </div>
              <div>
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  data-testid="input-password"
                />
              </div>
            </div>
          )}

          {showOAuth2 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="tokenUrl">Token URL *</Label>
                <Input
                  id="tokenUrl"
                  value={formData.tokenUrl}
                  onChange={(e) => setFormData({ ...formData, tokenUrl: e.target.value })}
                  placeholder="https://oauth.example.com/token"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clientId">Client ID *</Label>
                  <Input
                    id="clientId"
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="clientSecret">Client Secret *</Label>
                  <Input
                    id="clientSecret"
                    type="password"
                    value={formData.clientSecret}
                    onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="scope">Scope</Label>
                <Input
                  id="scope"
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                  placeholder="read write"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="defaultFormat">Default Format</Label>
          <Select value={formData.defaultFormat} onValueChange={(v) => setFormData({ ...formData, defaultFormat: v })}>
            <SelectTrigger id="defaultFormat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="xml">XML</SelectItem>
              <SelectItem value="edi">EDI</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2 pt-8">
          <Switch
            id="enabled"
            checked={formData.enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
            data-testid="switch-enabled"
          />
          <Label htmlFor="enabled">Enabled</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-interface">
          {createMutation.isPending ? "Creating..." : "Create Interface"}
        </Button>
      </div>
    </form>
  );
}
