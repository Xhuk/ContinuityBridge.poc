import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Lock, Activity, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export default function SecuritySettings() {
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);

  // Fetch vault status for audit info
  const { data: vaultStatus } = useQuery<{
    initialized: boolean;
    unlocked: boolean;
  }>({
    queryKey: ["/api/secrets/status"],
  });

  // Check localStorage for restart flag (set by other tabs after config changes)
  useEffect(() => {
    const restartFlag = localStorage.getItem("app_needs_restart");
    if (restartFlag === "true") {
      setNeedsRestart(true);
    }

    // Listen for storage events from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "app_needs_restart" && e.newValue === "true") {
        setNeedsRestart(true);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleRestart = () => {
    // Clear restart flag before reload
    localStorage.removeItem("app_needs_restart");
    // This will trigger a workflow restart via the Replit environment
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {needsRestart && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-600 dark:text-amber-400">Restart Required</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Configuration changes require an application restart to take effect.
            <Button
              variant="outline"
              size="sm"
              className="ml-4"
              onClick={() => setShowRestartDialog(true)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Restart Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Application Control</CardTitle>
                <CardDescription>Manage application lifecycle and runtime</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium">Restart Application</div>
              <p className="text-sm text-muted-foreground">
                Apply configuration changes by restarting the application server
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowRestartDialog(true)}
              data-testid="button-restart-app"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Restart
            </Button>
          </div>

          <Alert>
            <Activity className="h-4 w-4" />
            <AlertTitle>When to Restart</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>Application restart is required after:</p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                <li>Changing queue backend (InMemory → RabbitMQ/Kafka)</li>
                <li>Updating environment variables</li>
                <li>Installing new dependencies</li>
                <li>Modifying core configuration files</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Lock className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <CardTitle>Secrets Vault Security</CardTitle>
              <CardDescription>Vault status and security information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Vault Status</div>
              <div className="flex items-center gap-2">
                {vaultStatus?.initialized ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Initialized</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">Not Initialized</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 border rounded-lg space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Lock Status</div>
              <div className="flex items-center gap-2">
                {vaultStatus?.unlocked ? (
                  <>
                    <Activity className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Unlocked</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Locked</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-lg space-y-2">
            <div className="text-sm font-medium">Security Features</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                Argon2id master key derivation (64MB memory, 3 iterations)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                AES-256-GCM encryption with unique IVs
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                Session-based vault unlocking (key never persisted)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                Foreign key constraints prevent orphaned secrets
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <Activity className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <CardTitle>Security Best Practices</CardTitle>
              <CardDescription>Recommended security configurations</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Use Strong Passphrases</div>
              <p className="text-xs text-muted-foreground">
                Use the built-in passphrase generator for 72.4 bits of entropy
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Store Recovery Codes Securely</div>
              <p className="text-xs text-muted-foreground">
                Save recovery codes offline in a secure location - they cannot be regenerated
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Lock Vault When Not in Use</div>
              <p className="text-xs text-muted-foreground">
                Lock the vault after managing secrets to prevent unauthorized access
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Regular Security Audits</div>
              <p className="text-xs text-muted-foreground">
                Periodically review stored secrets and remove unused credentials
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-500" />
              Restart Application?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will restart the application server to apply configuration changes.
              </p>
              <Alert className="border-amber-500/50 bg-amber-500/10 mt-3">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  <strong>Note:</strong> Active connections will be interrupted. In-flight requests may fail.
                </AlertDescription>
              </Alert>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restart">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestart} data-testid="button-confirm-restart">
              <RefreshCw className="h-4 w-4 mr-2" />
              Restart Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
