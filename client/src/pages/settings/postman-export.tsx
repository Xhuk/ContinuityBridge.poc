import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Download, RefreshCw, FileJson, Info, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PostmanStats {
  interfaces: {
    total: number;
    inbound: number;
    outbound: number;
    bidirectional: number;
    byProtocol: Record<string, number>;
    byAuthType: Record<string, number>;
  };
  flows: {
    total: number;
    enabled: number;
    withWebhooks: number;
  };
}

export default function PostmanExport() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [environment, setEnvironment] = useState<"dev" | "staging" | "prod">("dev");
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [includeFlowTriggers, setIncludeFlowTriggers] = useState(true);
  const [includeSamplePayloads, setIncludeSamplePayloads] = useState(true);
  const [showVaultDialog, setShowVaultDialog] = useState(false);
  const [vaultKey, setVaultKey] = useState("");

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<PostmanStats>({
    queryKey: ["/api/postman/stats"],
  });

  // Download collection
  const downloadCollection = () => {
    // If production environment with secrets, require vault key
    if (environment === "prod" && includeSecrets) {
      setShowVaultDialog(true);
      return;
    }

    executeDownload();
  };

  const executeDownload = (vaultKeyParam?: string) => {
    const params = new URLSearchParams({
      environment,
      includeSecrets: includeSecrets.toString(),
      includeFlowTriggers: includeFlowTriggers.toString(),
      includeSamplePayloads: includeSamplePayloads.toString(),
    });

    // Add vault key if provided (for production secrets)
    if (vaultKeyParam) {
      params.append("vaultKey", vaultKeyParam);
    }

    const url = `/api/postman/collection?${params.toString()}`;
    window.open(url, "_blank");

    toast({
      title: "Collection Downloaded",
      description: `Postman collection for ${environment.toUpperCase()} environment has been downloaded.`,
    });

    // Clear vault key after use
    setVaultKey("");
    setShowVaultDialog(false);
  };

  // Regenerate collection
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/postman/collection/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment,
          includeSecrets,
          organizationName: user?.organizationId,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Collection Regenerated",
        description: `Generated ${data.stats.requests} API requests across ${data.stats.interfaces} interfaces and ${data.stats.flows} flows.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Regeneration Failed",
        description: error.message,
      });
    },
  });

  const isSuperAdmin = user?.role === "superadmin";
  const canIncludeSecrets = isSuperAdmin || user?.role === "consultant" || user?.role === "customer_admin";
  const requiresVaultKey = environment === "prod" && includeSecrets;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Postman Collection Export</h2>
        <p className="text-muted-foreground">
          Download a Postman collection with all configured interfaces and flow triggers for API testing.
        </p>
      </div>

      {/* Stats Card */}
      {stats && !statsLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Collection Overview
            </CardTitle>
            <CardDescription>
              What will be included in your Postman collection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Total Interfaces</p>
                <p className="text-3xl font-bold">{stats.interfaces.total}</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">{stats.interfaces.inbound} Inbound</Badge>
                  <Badge variant="secondary">{stats.interfaces.outbound} Outbound</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Protocols</p>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(stats.interfaces.byProtocol).map(([protocol, count]) => (
                    <Badge key={protocol} variant="outline">
                      {protocol}: {count}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Authentication</p>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(stats.interfaces.byAuthType).map(([auth, count]) => (
                    <Badge key={auth} variant="outline">
                      {auth}: {count}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Flows</p>
                <p className="text-3xl font-bold">{stats.flows.total}</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">{stats.flows.enabled} Enabled</Badge>
                  <Badge variant="secondary">{stats.flows.withWebhooks} Webhooks</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Export Settings</CardTitle>
          <CardDescription>
            Configure what to include in your Postman collection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Environment Selection */}
          <div className="space-y-2">
            <Label htmlFor="environment">Target Environment</Label>
            <Select value={environment} onValueChange={(value: any) => setEnvironment(value)}>
              <SelectTrigger id="environment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dev">Development (DEV)</SelectItem>
                <SelectItem value="staging">Staging (STG)</SelectItem>
                <SelectItem value="prod">Production (PROD)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Select the target environment for API endpoints and sample data
            </p>
          </div>

          {/* Include Secrets Toggle */}
          {canIncludeSecrets && (
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="includeSecrets">Include Credentials</Label>
                <p className="text-sm text-muted-foreground">
                  {environment === "prod" 
                    ? "Include actual credentials (requires Vault key for PROD)"
                    : "Include actual API keys, tokens, and passwords"
                  }
                </p>
              </div>
              <Switch
                id="includeSecrets"
                checked={includeSecrets}
                onCheckedChange={setIncludeSecrets}
              />
            </div>
          )}

          {requiresVaultKey && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                <strong>Production Protection:</strong> Exporting credentials for PROD requires your Secrets Vault key for additional security.
              </AlertDescription>
            </Alert>
          )}

          {!canIncludeSecrets && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Credentials will be replaced with placeholders (e.g., <code>{'{{'}</code><code>api_key</code><code>{'}}'}</code>). 
                Higher access level required to export actual secrets.
              </AlertDescription>
            </Alert>
          )}

          {/* Include Flow Triggers */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="includeFlowTriggers">Include Flow Triggers</Label>
              <p className="text-sm text-muted-foreground">
                Add webhook and manual trigger endpoints for flows
              </p>
            </div>
            <Switch
              id="includeFlowTriggers"
              checked={includeFlowTriggers}
              onCheckedChange={setIncludeFlowTriggers}
            />
          </div>

          {/* Include Sample Payloads */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="includeSamplePayloads">Include Sample Payloads</Label>
              <p className="text-sm text-muted-foreground">
                Add example request bodies in XML/JSON format
              </p>
            </div>
            <Switch
              id="includeSamplePayloads"
              checked={includeSamplePayloads}
              onCheckedChange={setIncludeSamplePayloads}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button onClick={downloadCollection} className="flex-1">
              {requiresVaultKey ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Download with Vault Key
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Collection
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
            >
              {regenerateMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Vault Key Dialog */}
      <Dialog open={showVaultDialog} onOpenChange={setShowVaultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Production Secrets Protection
            </DialogTitle>
            <DialogDescription>
              Enter your Secrets Vault key to decrypt and export production credentials.
              This ensures only authorized users can access production secrets.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="vaultKey">Vault Key</Label>
              <Input
                id="vaultKey"
                type="password"
                placeholder="Enter your vault encryption key"
                value={vaultKey}
                onChange={(e) => setVaultKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && vaultKey) {
                    executeDownload(vaultKey);
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                The same key you use to unlock the Secrets Vault
              </p>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Your vault key is <strong>never stored</strong> and is only used to verify access to production secrets.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVaultDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => executeDownload(vaultKey)}
              disabled={!vaultKey}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-semibold">1. Import into Postman</h4>
            <p className="text-sm text-muted-foreground">
              Open Postman → Import → File → Select the downloaded JSON file
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">2. Configure Variables</h4>
            <p className="text-sm text-muted-foreground">
              Edit collection variables to set your <code>base_url</code> and authentication credentials
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">3. Test Your Integrations</h4>
            <p className="text-sm text-muted-foreground">
              Run requests from the collection to test inbound/outbound interfaces and flow triggers
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">4. Regenerate When Needed</h4>
            <p className="text-sm text-muted-foreground">
              Click "Regenerate" after adding/modifying interfaces or flows to get an updated collection
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
