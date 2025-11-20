import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LogOut, User, Mail, Key, Building2, Shield, Calendar, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Profile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");

  // Fetch full user details from API
  const { data: userDetails } = useQuery({
    queryKey: ["/api/users/me"],
    queryFn: async () => {
      const apiKey = localStorage.getItem("apiKey");
      const response = await fetch("/api/users/me", {
        headers: { "X-API-Key": apiKey || "" },
      });
      if (!response.ok) throw new Error("Failed to fetch user details");
      return response.json();
    },
  });

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  // Transfer ownership mutation
  const transferMutation = useMutation({
    mutationFn: async (data: { newEmail: string }) => {
      const res = await apiRequest("POST", "/api/users/transfer-ownership", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Ownership transferred",
        description: "Account ownership has been transferred. The old account will be disabled.",
      });
      setTransferDialogOpen(false);
      // Logout after 2 seconds
      setTimeout(() => {
        logout();
        setLocation("/onboarding");
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Transfer failed",
        description: error.message || "Failed to transfer ownership",
        variant: "destructive",
      });
    },
  });

  const handleTransfer = () => {
    if (newEmail !== confirmEmail) {
      toast({
        title: "Email mismatch",
        description: "Email addresses do not match",
        variant: "destructive",
      });
      return;
    }
    if (!newEmail.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }
    transferMutation.mutate({ newEmail });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "superadmin":
        return "bg-purple-100 text-purple-800 border-purple-300";
      case "consultant":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "customer_admin":
        return "bg-green-100 text-green-800 border-green-300";
      case "customer_user":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "superadmin":
        return "Founder / Superadmin";
      case "consultant":
        return "Consultant";
      case "customer_admin":
        return "Customer Admin";
      case "customer_user":
        return "Customer User";
      default:
        return role;
    }
  };

  const permissions = userDetails?.permissions || {};
  const apiKey = localStorage.getItem("apiKey");
  const maskedApiKey = apiKey
    ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 8)}`
    : "Not available";

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground">View your account details and permissions</p>
        </div>
        <Button variant="destructive" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      {/* User Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Information
          </CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="text-base font-mono">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Role</p>
                <Badge className={`mt-1 ${getRoleBadgeColor(user?.role || "")}`}>
                  {getRoleLabel(user?.role || "")}
                </Badge>
              </div>
            </div>

            {user?.organizationName && (
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Organization</p>
                  <p className="text-base">{user.organizationName}</p>
                </div>
              </div>
            )}

            {user?.selectedTenant && (
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Environment</p>
                  <Badge variant="outline" className="mt-1">
                    {user.selectedTenant.environment.toUpperCase()}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key
          </CardTitle>
          <CardDescription>Your authentication credentials</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-md">
            <p className="text-sm font-medium text-muted-foreground mb-1">Current API Key</p>
            <code className="text-sm font-mono break-all">{maskedApiKey}</code>
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ Keep this key secure. Contact your admin if you need a new key.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>What you can do in ContinuityBridge</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PermissionItem
              label="Export Flows"
              granted={permissions.canExport}
            />
            <PermissionItem
              label="Manage Users"
              granted={permissions.canManageUsers}
            />
            <PermissionItem
              label="Build Flows"
              granted={permissions.canBuildFlows}
            />
            <PermissionItem
              label="View Error Dashboard"
              granted={permissions.canViewErrorDashboard}
            />
            <PermissionItem
              label="Edit Error Dashboard"
              granted={permissions.canEditErrorDashboard}
            />
            <PermissionItem
              label="Read-Only Access"
              granted={permissions.isReadOnly}
              isWarning
            />
          </div>
        </CardContent>
      </Card>

      {/* Account Transfer (only for admin@continuitybridge.local) */}
      {user?.email === "admin@continuitybridge.local" && user?.role === "superadmin" && (
        <Card className="border-orange-200 dark:border-orange-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer Account Ownership
            </CardTitle>
            <CardDescription>
              Transfer this superadmin account to a new email and disable the default account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800 dark:text-orange-200">
                <strong>Warning:</strong> This action will:
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>Create a new superadmin account with your desired email</li>
                  <li>Transfer all permissions and access</li>
                  <li>Disable the admin@continuitybridge.local account</li>
                  <li>Log you out immediately after transfer</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full border-orange-300 text-orange-700 hover:bg-orange-50">
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transfer Ownership
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transfer Account Ownership</DialogTitle>
                  <DialogDescription>
                    Enter your desired email address to transfer this account
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label htmlFor="newEmail" className="text-sm font-medium">
                      New Email Address
                    </label>
                    <Input
                      id="newEmail"
                      type="email"
                      placeholder="your@email.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="confirmEmail" className="text-sm font-medium">
                      Confirm Email Address
                    </label>
                    <Input
                      id="confirmEmail"
                      type="email"
                      placeholder="your@email.com"
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                    />
                  </div>

                  <Alert>
                    <AlertDescription className="text-sm">
                      The new account will be created with the same superadmin role and full access.
                      You'll need to use the /onboarding page to get your magic link.
                    </AlertDescription>
                  </Alert>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setTransferDialogOpen(false)}
                    disabled={transferMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleTransfer}
                    disabled={transferMutation.isPending || !newEmail || !confirmEmail}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {transferMutation.isPending ? "Transferring..." : "Transfer Ownership"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Assigned Customers (for consultants) */}
      {user?.role === "consultant" && user.assignedCustomers && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned Customers</CardTitle>
            <CardDescription>Organizations you can manage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {user.assignedCustomers.map((customer) => (
                <Badge key={customer} variant="secondary">
                  {customer}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PermissionItem({
  label,
  granted,
  isWarning = false,
}: {
  label: string;
  granted: boolean;
  isWarning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
      <span className="text-sm font-medium">{label}</span>
      {granted ? (
        isWarning ? (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            Yes
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            Granted
          </Badge>
        )
      ) : (
        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-300">
          Not Granted
        </Badge>
      )}
    </div>
  );
}
