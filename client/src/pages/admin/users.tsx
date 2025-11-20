import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { AlertCircle, UserPlus, Mail, Trash2, Shield, Key, RefreshCw, Users as UsersIcon, CheckCircle, XCircle, Copy, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface User {
  id: string;
  email: string;
  role: "superadmin" | "consultant" | "customer_admin" | "customer_user";
  organizationId?: string;
  organizationName?: string;
  assignedCustomers?: string[];
  apiKey?: string;
  enabled: boolean;
  emailConfirmed: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface CreateUserForm {
  email: string;
  role: "consultant" | "customer_admin" | "customer_user";
  organizationName?: string;
  environment: "dev" | "test" | "staging" | "prod";
  bypassEmail?: boolean;
}

export default function UsersManagement() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const form = useForm<CreateUserForm>({
    defaultValues: {
      email: "",
      role: "customer_user",
      organizationName: currentUser?.role === "customer_admin" ? currentUser?.organizationName : "",
      environment: "prod",
      bypassEmail: false,
    },
  });

  // Fetch users based on role
  const { data: usersData, isLoading } = useQuery({
    queryKey: ["/api/users"],
  });

  // Fetch license info to check user limits
  const { data: licenseData } = useQuery({
    queryKey: ["/api/license"],
    enabled: currentUser?.role === "customer_admin",
  });

  const userLimit = licenseData?.license?.limits?.maxUsers || 10;

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserForm) => {
      return apiRequest("/api/users", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response: any, variables) => {
      const bypassedEmail = variables.bypassEmail;
      
      if (bypassedEmail && response.apiKey) {
        // Show API key in toast when email is bypassed
        toast({
          title: "User created successfully!",
          description: (
            <div className="space-y-2">
              <p className="text-sm">Email sending bypassed. Copy the credentials below:</p>
              <div className="p-2 bg-background rounded border">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs font-mono break-all flex-1">{response.apiKey}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(response.apiKey);
                      setCopiedKey(response.apiKey);
                      setTimeout(() => setCopiedKey(null), 2000);
                    }}
                  >
                    {copiedKey === response.apiKey ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                💡 Use /onboarding page to generate magic link with this email
              </p>
            </div>
          ),
          duration: 10000,
        });
      } else {
        toast({
          title: "User created",
          description: "Confirmation email sent to the user.",
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create user",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Resend API key mutation
  const resendApiKeyMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/users/${userId}/regenerate-api-key`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "API key regenerated",
        description: "New API key sent to user's email.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to regenerate API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/users/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "User deleted",
        description: "User has been removed from the system.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Promote to admin mutation
  const promoteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/users/${userId}/promote-to-admin`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      toast({
        title: "User promoted",
        description: "User is now a customer admin.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to promote user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateUserForm) => {
    createUserMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading users...</div>
      </div>
    );
  }

  // Process users based on role
  let users: User[] = [];
  let totalUsers = 0;
  let organizationGroups: any = null;

  if (currentUser?.role === "superadmin") {
    // Superadmin sees grouped structure
    organizationGroups = usersData;
    totalUsers = usersData?.totalUsers || 0;
  } else {
    // Consultant and customer_admin see flat list
    users = usersData || [];
    totalUsers = users.length;
  }

  // Check if user limit reached
  const isUserLimitReached = currentUser?.role === "customer_admin" && totalUsers >= userLimit;

  // Determine allowed roles based on current user
  const allowedRoles: Array<{ value: string; label: string }> = [];
  if (currentUser?.role === "superadmin") {
    allowedRoles.push(
      { value: "consultant", label: "Consultant" },
      { value: "customer_admin", label: "Customer Admin" },
      { value: "customer_user", label: "Customer User" }
    );
  } else if (currentUser?.role === "consultant") {
    allowedRoles.push(
      { value: "customer_admin", label: "Customer Admin" },
      { value: "customer_user", label: "Customer User" }
    );
  } else if (currentUser?.role === "customer_admin") {
    allowedRoles.push(
      { value: "customer_user", label: "Customer User" }
    );
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "superadmin": return "bg-red-500 text-white";
      case "consultant": return "bg-blue-500 text-white";
      case "customer_admin": return "bg-green-500 text-white";
      case "customer_user": return "bg-gray-500 text-white";
      default: return "bg-gray-300 text-black";
    }
  };

  const renderUserRow = (user: User) => (
    <TableRow key={user.id}>
      <TableCell>
        <div className="flex items-center gap-2">
          {user.email}
          {user.emailConfirmed ? (
            <CheckCircle className="h-4 w-4 text-green-500" title="Email confirmed" />
          ) : (
            <AlertCircle className="h-4 w-4 text-yellow-500" title="Email not confirmed" />
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge className={getRoleBadgeColor(user.role)}>
          {user.role.replace("_", " ")}
        </Badge>
      </TableCell>
      <TableCell>{user.organizationName || "—"}</TableCell>
      <TableCell>
        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
          {user.apiKey ? `${user.apiKey.substring(0, 15)}...` : "—"}
        </code>
      </TableCell>
      <TableCell>
        <Badge variant={user.enabled ? "default" : "destructive"}>
          {user.enabled ? "Active" : "Disabled"}
        </Badge>
      </TableCell>
      <TableCell>
        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          {/* Resend API Key */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resendApiKeyMutation.mutate(user.id)}
            disabled={!user.emailConfirmed}
            title={user.emailConfirmed ? "Resend API key" : "Email must be confirmed first"}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          {/* Promote to Admin (only for customer_user) */}
          {user.role === "customer_user" && (currentUser?.role === "superadmin" || currentUser?.role === "consultant") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => promoteUserMutation.mutate(user.id)}
              title="Promote to customer admin"
            >
              <Shield className="h-4 w-4" />
            </Button>
          )}
          
          {/* Delete User */}
          {user.id !== currentUser?.id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Delete user ${user.email}?`)) {
                  deleteUserMutation.mutate(user.id);
                }
              }}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <UsersIcon className="h-8 w-8" />
            User Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage users and permissions
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={isUserLimitReached}>
              <UserPlus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                User will receive a confirmation email. After confirming, they'll get their API key and magic link.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  rules={{ required: "Email is required" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="user@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="role"
                  rules={{ required: "Role is required" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allowedRoles.map(role => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {currentUser?.role !== "customer_admin" && (
                  <FormField
                    control={form.control}
                    name="organizationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" {...field} />
                        </FormControl>
                        <FormDescription>
                          Leave empty to use default organization
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                <FormField
                  control={form.control}
                  name="environment"
                  rules={{ required: "Environment is required" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Environment</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select environment" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="dev">Development</SelectItem>
                          <SelectItem value="test">Testing</SelectItem>
                          <SelectItem value="staging">Staging</SelectItem>
                          <SelectItem value="prod">Production</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        API key format: cb_[env]_[key]
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="bypassEmail"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Bypass Email Sending
                        </FormLabel>
                        <FormDescription>
                          Skip email and show API key here (for testing)
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <Separator />
                
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createUserMutation.isPending}>
                    {createUserMutation.isPending ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* User Limit Warning for Customer Admin */}
      {currentUser?.role === "customer_admin" && (
        <Alert variant={isUserLimitReached ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {totalUsers} / {userLimit} users ({userLimit - totalUsers} remaining)
            {isUserLimitReached && " - Contact your consultant to increase limit"}
          </AlertDescription>
        </Alert>
      )}

      {/* Superadmin View: Grouped by Organization */}
      {currentUser?.role === "superadmin" && organizationGroups && (
        <div className="space-y-6">
          {/* Founders */}
          {organizationGroups.founders && organizationGroups.founders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-red-500" />
                  Founders ({organizationGroups.founders.length})
                </CardTitle>
                <CardDescription>Superadmin users with full access</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizationGroups.founders.map(renderUserRow)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Projects/Organizations */}
          {organizationGroups.projects && organizationGroups.projects.map((project: any) => (
            <Card key={project.organizationName}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UsersIcon className="h-5 w-5" />
                  {project.organizationName} ({project.userCount})
                </CardTitle>
                <CardDescription>Organization ID: {project.organizationId || "N/A"}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.users.map(renderUserRow)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Consultant and Customer Admin View: Flat List */}
      {(currentUser?.role === "consultant" || currentUser?.role === "customer_admin") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5" />
              Users ({totalUsers})
              {currentUser?.role === "customer_admin" && ` / ${userLimit}`}
            </CardTitle>
            <CardDescription>
              {currentUser?.role === "consultant" 
                ? "Manage users for your assigned customers" 
                : `Manage users for ${currentUser?.organizationName || "your organization"}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map(renderUserRow)
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
