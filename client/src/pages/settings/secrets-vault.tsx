import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Lock, Shield, KeyRound, Plus, Eye, EyeOff, Trash2, Edit2, CheckCircle, XCircle, AlertCircle, Sparkles, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

// Generate a secure passphrase using word list
function generateSecurePassphrase(): string {
  const wordList = [
    "ability", "able", "about", "above", "accept", "according", "account", "across", "action", "activity",
    "actually", "address", "administration", "admit", "adult", "affect", "after", "again", "against", "agency",
    "agent", "agree", "agreement", "ahead", "allow", "almost", "alone", "along", "already", "although",
    "always", "american", "amount", "analysis", "animal", "another", "answer", "anyone", "anything", "appear",
    "apply", "approach", "area", "argue", "around", "arrive", "article", "artist", "assume", "attack",
    "attention", "attorney", "audience", "author", "authority", "available", "avoid", "away", "baby", "back",
    "beautiful", "because", "become", "before", "begin", "behavior", "behind", "believe", "benefit", "better",
    "between", "beyond", "billion", "board", "body", "book", "born", "both", "bring", "brother",
    "budget", "build", "building", "business", "buyer", "call", "camera", "campaign", "cancer", "candidate",
  ];
  
  // Pick 5 random words and add a number
  const words: string[] = [];
  for (let i = 0; i < 5; i++) {
    const randomIndex = Math.floor(Math.random() * wordList.length);
    words.push(wordList[randomIndex]);
  }
  const randomNum = Math.floor(Math.random() * 100);
  
  return `${words.join("-")}-${randomNum}`;
}

export default function SecretsVault() {
  const { toast } = useToast();
  const [masterSeed, setMasterSeed] = useState("");
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Check vault status
  const { data: vaultStatus } = useQuery({
    queryKey: ["/api/secrets/status"],
  });

  // Initialize vault
  const initMutation = useMutation({
    mutationFn: async (seed: string) => {
      return await apiRequest("/api/secrets/initialize", {
        method: "POST",
        body: JSON.stringify({ masterSeed: seed }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data: any) => {
      setRecoveryCode(data.recoveryCode);
      setShowRecoveryCode(true);
      queryClient.invalidateQueries({ queryKey: ["/api/secrets/status"] });
      toast({
        title: "Vault Initialized",
        description: "Your secrets vault has been created. Save your recovery code!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Initialization Failed",
        description: error.message || "Failed to initialize vault",
        variant: "destructive",
      });
    },
  });

  // Unlock vault
  const unlockMutation = useMutation({
    mutationFn: async (seed: string) => {
      return await apiRequest("/api/secrets/unlock", {
        method: "POST",
        body: JSON.stringify({ masterSeed: seed }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      setMasterSeed("");
      toast({
        title: "Vault Unlocked",
        description: "You can now manage your secrets",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unlock Failed",
        description: error.message || "Invalid master seed",
        variant: "destructive",
      });
    },
  });

  // Lock vault
  const lockMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/secrets/lock", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets/status"] });
      toast({
        title: "Vault Locked",
        description: "Your secrets are secured",
      });
    },
  });

  // Vault not initialized - show onboarding
  if (vaultStatus && !vaultStatus.initialized) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Initialize Secrets Vault</CardTitle>
                <CardDescription>
                  Create a master seed to encrypt all integration credentials
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="text-amber-600 dark:text-amber-400">Important Security Notice</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <ul className="list-disc list-inside space-y-1 mt-2">
                  <li>Your master seed is <strong>NEVER stored</strong> on our servers</li>
                  <li>Loss of your master seed means <strong>PERMANENT DATA LOSS</strong></li>
                  <li>You will receive a recovery code - <strong>save it securely</strong></li>
                  <li>We cannot recover your secrets if you lose both</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="master-seed">Master Seed (Passphrase)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="master-seed"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter a strong passphrase (min 12 characters)"
                    value={masterSeed}
                    onChange={(e) => setMasterSeed(e.target.value)}
                    data-testid="input-master-seed"
                    className="pr-20"
                  />
                  <div className="absolute right-0 top-0 h-full flex items-center gap-1 pr-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowPassword(!showPassword)}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    {masterSeed && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          navigator.clipboard.writeText(masterSeed);
                          toast({
                            title: "Copied to Clipboard",
                            description: "Passphrase has been copied. Clear your clipboard after saving it securely.",
                          });
                        }}
                        data-testid="button-copy-passphrase"
                      >
                        <Shield className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const passphrase = generateSecurePassphrase();
                    setMasterSeed(passphrase);
                    setShowPassword(true); // Auto-show when generated
                    toast({
                      title: "Passphrase Generated",
                      description: "A secure passphrase has been generated. Make sure to save it!",
                    });
                  }}
                  data-testid="button-generate-passphrase"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate
                </Button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <p className="text-muted-foreground">
                  Use a long, memorable passphrase. This encrypts all your secrets.
                </p>
                <a
                  href="https://www.useapassphrase.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
                  data-testid="link-password-generator"
                >
                  Password Generator <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <Button
              onClick={() => initMutation.mutate(masterSeed)}
              disabled={masterSeed.length < 12 || initMutation.isPending}
              className="w-full"
              data-testid="button-initialize-vault"
            >
              {initMutation.isPending ? "Initializing..." : "Initialize Vault"}
            </Button>
          </CardContent>
        </Card>

        {/* Recovery Code Dialog */}
        <Dialog open={showRecoveryCode} onOpenChange={setShowRecoveryCode}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                Save Your Recovery Code
              </DialogTitle>
              <DialogDescription>
                Store this code in a secure location. You'll need it if you forget your master seed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Alert className="border-green-500/50 bg-green-500/10">
                  <AlertDescription className="font-mono text-center text-lg py-2">
                    {recoveryCode}
                  </AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryCode);
                    toast({
                      title: "Recovery Code Copied",
                      description: "Make sure to save it in a secure location offline.",
                    });
                  }}
                  data-testid="button-copy-recovery-code"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Copy Recovery Code
                </Button>
              </div>
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertTitle className="text-red-600 dark:text-red-400">Warning</AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-300">
                  This code is shown only once. Write it down and store it securely offline.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                setShowRecoveryCode(false);
                setRecoveryCode("");
              }} data-testid="button-recovery-confirm">
                I've Saved My Recovery Code
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Vault initialized but locked - show unlock
  if (vaultStatus && vaultStatus.initialized && !vaultStatus.unlocked) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 rounded-lg">
                <Lock className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <CardTitle>Vault Locked</CardTitle>
                <CardDescription>
                  Enter your master seed to access secrets
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unlock-seed">Master Seed</Label>
              <Input
                id="unlock-seed"
                type="password"
                placeholder="Enter your master seed"
                value={masterSeed}
                onChange={(e) => setMasterSeed(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && masterSeed.length >= 12) {
                    unlockMutation.mutate(masterSeed);
                  }
                }}
                data-testid="input-unlock-seed"
              />
              <p className="text-xs text-muted-foreground">
                Enter the passphrase you created during initialization
              </p>
            </div>

            <Button
              onClick={() => unlockMutation.mutate(masterSeed)}
              disabled={masterSeed.length < 12 || unlockMutation.isPending}
              className="w-full"
              data-testid="button-unlock-vault"
            >
              {unlockMutation.isPending ? "Unlocking..." : "Unlock Vault"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vault unlocked - show secrets management
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <CardTitle>Vault Unlocked</CardTitle>
                <CardDescription>
                  Manage your integration secrets securely
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => lockMutation.mutate()}
              data-testid="button-lock-vault"
            >
              <Lock className="h-4 w-4 mr-2" />
              Lock Vault
            </Button>
          </div>
        </CardHeader>
      </Card>

      <SecretsManagement />
    </div>
  );
}

function SecretsManagement() {
  const { toast } = useToast();

  const { data: secrets, isLoading } = useQuery({
    queryKey: ["/api/secrets"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading secrets...</div>
        </CardContent>
      </Card>
    );
  }

  const secretsList = Array.isArray(secrets) ? secrets : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Stored Secrets</h3>
          <p className="text-sm text-muted-foreground">
            {secretsList.length} secret{secretsList.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Button data-testid="button-add-secret">
          <Plus className="h-4 w-4 mr-2" />
          Add Secret
        </Button>
      </div>

      {secretsList.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-2">
              <KeyRound className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="font-semibold">No Secrets Yet</h3>
              <p className="text-sm text-muted-foreground">
                Add your first integration secret to get started
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {secretsList.map((secret: any) => (
            <Card key={secret.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">{secret.label}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      <Badge variant="outline" className="text-xs">
                        {secret.integrationType}
                      </Badge>
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  {secret.metadata?.host && (
                    <div>Host: {secret.metadata.host}</div>
                  )}
                  {secret.metadata?.username && (
                    <div>User: {secret.metadata.username}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-2">
                    Updated: {new Date(secret.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
