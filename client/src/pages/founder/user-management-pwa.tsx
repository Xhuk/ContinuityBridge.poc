import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { UserPlus, Users, Building2, Shield, Copy, Check } from "lucide-react";

interface User {
  id: string;
  email: string;
  role: "superadmin" | "consultant" | "customer_admin" | "customer_user";
  organizationId?: string;
  organizationName?: string;
  enabled: boolean;
  emailConfirmed: boolean;
  apiKey?: string;
  createdAt: string;
  lastLoginAt?: string;
}

interface UserGroup {
  founders: User[];
  consultants: User[];
  customers: Array<{
    organizationName: string;
    organizationId: string;
    users: User[];
    userCount: number;
  }>;
  totalUsers: number;
}

export default function UserManagementPWA() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form state
  const [newUser, setNewUser] = useState<{
    email: string;
    role: "superadmin" | "consultant" | "customer_admin" | "customer_user";
    organizationId: string;
    organizationName: string;
    bypassEmail: boolean;
  }>({
    email: "",
    role: "consultant",
    organizationId: "",
    organizationName: "",
    bypassEmail: true,
  });

  // Fetch users
  const { data: usersData, isLoading } = useQuery<UserGroup>({
    queryKey: ["/api/users"],
    refetchInterval: 10000,
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create user");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "✅ User Created",
        description: `${newUser.email} created successfully`,
      });

      // Show API key if returned
      if (data.apiKey) {
        toast({
          title: "🔑 API Key Generated",
          description: `Copy and share securely: ${data.apiKey}`,
          duration: 10000,
        });
      }

      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setNewUser({
      email: "",
      role: "consultant",
      organizationId: "",
      organizationName: "",
      bypassEmail: true,
    });
  };

  const handleCreateUser = () => {
    if (!newUser.email) {
      toast({
        title: "Validation Error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }

    // Validate organization fields for non-founders
    if (newUser.role !== "superadmin" && (!newUser.organizationName || !newUser.organizationId)) {
      toast({
        title: "Validation Error",
        description: "Organization details required for this role",
        variant: "destructive",
      });
      return;
    }

    createUserMutation.mutate(newUser);
  };

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(apiKey);
    setTimeout(() => setCopiedKey(null), 2000);
    toast({
      title: "📋 Copied",
      description: "API key copied to clipboard",
    });
  };

  const getRoleBadge = (role: string) => {
    const badges = {
      superadmin: <Badge className="bg-purple-600">Founder</Badge>,
      consultant: <Badge className="bg-blue-600">Consultant</Badge>,
      customer_admin: <Badge className="bg-green-600">Admin</Badge>,
      customer_user: <Badge className="bg-gray-600">User</Badge>,
    };
    return badges[role as keyof typeof badges] || <Badge>{role}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage Founder Team, Consultants, and Customer Users
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2">
              <UserPlus className="w-5 h-5" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new Founder, Consultant, or Customer user
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value: any) =>
                    setNewUser({ ...newUser, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="superadmin">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Founder Team
                      </div>
                    </SelectItem>
                    <SelectItem value="consultant">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Consultant
                      </div>
                    </SelectItem>
                    <SelectItem value="customer_admin">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Customer Admin
                      </div>
                    </SelectItem>
                    <SelectItem value="customer_user">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Customer User
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Organization (for non-founders) */}
              {newUser.role !== "superadmin" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Organization Name *</Label>
                    <Input
                      id="orgName"
                      placeholder="e.g., Demo, Acme Corp"
                      value={newUser.organizationName}
                      onChange={(e) =>
                        setNewUser({ ...newUser, organizationName: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="orgId">Organization ID *</Label>
                    <Input
                      id="orgId"
                      placeholder="e.g., demo, acme-corp"
                      value={newUser.organizationId}
                      onChange={(e) =>
                        setNewUser({ ...newUser, organizationId: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Lowercase, no spaces (e.g., demo-customer)
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Founder Team</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usersData?.founders.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Consultants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usersData?.consultants.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Customer Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usersData?.customers.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usersData?.totalUsers || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* User Groups */}
      <Tabs defaultValue="founders" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="founders">Founder Team</TabsTrigger>
          <TabsTrigger value="consultants">Consultants</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        {/* Founder Team Tab */}
        <TabsContent value="founders">
          <Card>
            <CardHeader>
              <CardTitle>Founder Team Members</CardTitle>
              <CardDescription>
                Core platform team with full system access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {usersData?.founders.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{user.email}</p>
                        {getRoleBadge(user.role)}
                        {!user.enabled && <Badge variant="destructive">Disabled</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Created: {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {user.apiKey && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyApiKey(user.apiKey!)}
                        className="gap-2"
                      >
                        {copiedKey === user.apiKey ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        Copy API Key
                      </Button>
                    )}
                  </div>
                ))}
                {!usersData?.founders.length && (
                  <p className="text-center text-muted-foreground py-8">
                    No founder team members yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Consultants Tab */}
        <TabsContent value="consultants">
          <Card>
            <CardHeader>
              <CardTitle>Consultant Team</CardTitle>
              <CardDescription>
                External consultants managing customer deployments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {usersData?.consultants.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{user.email}</p>
                        {getRoleBadge(user.role)}
                        {!user.enabled && <Badge variant="destructive">Disabled</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Org: {user.organizationName || "Unassigned"}
                      </p>
                    </div>
                    {user.apiKey && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyApiKey(user.apiKey!)}
                        className="gap-2"
                      >
                        {copiedKey === user.apiKey ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        Copy API Key
                      </Button>
                    )}
                  </div>
                ))}
                {!usersData?.consultants.length && (
                  <p className="text-center text-muted-foreground py-8">
                    No consultants yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers">
          <div className="space-y-4">
            {usersData?.customers.map((org) => (
              <Card key={org.organizationId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {org.organizationName}
                  </CardTitle>
                  <CardDescription>
                    {org.userCount} user{org.userCount !== 1 ? "s" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {org.users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 border rounded"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{user.email}</p>
                            {getRoleBadge(user.role)}
                            {!user.enabled && (
                              <Badge variant="destructive" className="text-xs">
                                Disabled
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Last login:{" "}
                            {user.lastLoginAt
                              ? new Date(user.lastLoginAt).toLocaleDateString()
                              : "Never"}
                          </p>
                        </div>
                        {user.apiKey && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyApiKey(user.apiKey!)}
                            className="gap-2"
                          >
                            {copiedKey === user.apiKey ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                            Key
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!usersData?.customers.length && (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">
                    No customer organizations yet
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
