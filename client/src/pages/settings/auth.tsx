import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Key, Shield, MoreVertical, Trash2, RefreshCw, TestTube2, CheckCircle2, XCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AuthAdapter = {
  id: string;
  name: string;
  type: "oauth2" | "jwt" | "cookie";
  direction: "inbound" | "outbound" | "bidirectional";
  activated: boolean;
  lastTestedAt: string | null;
  lastUsedAt: string | null;
  secretId: string | null;
  config: any;
  createdAt: string;
};

type InboundAuthPolicy = {
  id: string;
  routePattern: string;
  httpMethod: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
  description: string | null;
  adapterId: string | null;
  enforcementMode: "bypass" | "optional" | "required";
  multiTenant: boolean;
  createdAt: string;
};

const adapterFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["oauth2", "jwt", "cookie"]),
  direction: z.enum(["inbound", "outbound", "bidirectional"]),
  secretId: z.string().optional(),
  activated: z.boolean().default(false),
});

const policyFormSchema = z.object({
  routePattern: z.string().min(1, "Route pattern is required"),
  httpMethod: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"]),
  description: z.string().optional(),
  adapterId: z.string().optional(),
  enforcementMode: z.enum(["bypass", "optional", "required"]),
  multiTenant: z.boolean().default(false),
});

export default function AuthenticationSettings() {
  const { toast } = useToast();
  const [isAdapterDialogOpen, setIsAdapterDialogOpen] = useState(false);
  const [isPolicyDialogOpen, setIsPolicyDialogOpen] = useState(false);

  // Fetch adapters
  const { data: adapters = [], isLoading: adaptersLoading } = useQuery<AuthAdapter[]>({
    queryKey: ["/api/auth/adapters"],
  });

  // Fetch policies
  const { data: policies = [], isLoading: policiesLoading } = useQuery<InboundAuthPolicy[]>({
    queryKey: ["/api/auth/policies"],
  });

  // Create adapter mutation
  const createAdapterMutation = useMutation({
    mutationFn: async (data: z.infer<typeof adapterFormSchema>) =>
      apiRequest("/api/auth/adapters", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/adapters"] });
      setIsAdapterDialogOpen(false);
      toast({ title: "Auth adapter created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create adapter", description: error.message, variant: "destructive" });
    },
  });

  // Delete adapter mutation
  const deleteAdapterMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/auth/adapters/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/adapters"] });
      toast({ title: "Auth adapter deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete adapter", description: error.message, variant: "destructive" });
    },
  });

  // Test adapter mutation
  const testAdapterMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/auth/adapters/${id}/test`, "POST"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/adapters"] });
      toast({ title: "Test successful", description: data.message || "Adapter test passed" });
    },
    onError: (error: any) => {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });

  // Refresh adapter mutation
  const refreshAdapterMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/auth/adapters/${id}/refresh`, "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/adapters"] });
      toast({ title: "Token cache cleared", description: "Will refresh on next use" });
    },
    onError: (error: any) => {
      toast({ title: "Refresh failed", description: error.message, variant: "destructive" });
    },
  });

  // Create policy mutation
  const createPolicyMutation = useMutation({
    mutationFn: async (data: z.infer<typeof policyFormSchema>) =>
      apiRequest("/api/auth/policies", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/policies"] });
      setIsPolicyDialogOpen(false);
      toast({ title: "Policy created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create policy", description: error.message, variant: "destructive" });
    },
  });

  // Delete policy mutation
  const deletePolicyMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/auth/policies/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/policies"] });
      toast({ title: "Policy deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete policy", description: error.message, variant: "destructive" });
    },
  });

  const adapterForm = useForm<z.infer<typeof adapterFormSchema>>({
    resolver: zodResolver(adapterFormSchema),
    defaultValues: {
      name: "",
      type: "oauth2",
      direction: "outbound",
      activated: false,
    },
  });

  const policyForm = useForm<z.infer<typeof policyFormSchema>>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: {
      routePattern: "/api/",
      httpMethod: "ALL",
      enforcementMode: "required",
      multiTenant: false,
    },
  });

  const onAdapterSubmit = (data: z.infer<typeof adapterFormSchema>) => {
    createAdapterMutation.mutate(data);
  };

  const onPolicySubmit = (data: z.infer<typeof policyFormSchema>) => {
    createPolicyMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Authentication Adapters
              </CardTitle>
              <CardDescription>
                Manage OAuth2, JWT, and Cookie authentication adapters for external APIs
              </CardDescription>
            </div>
            <Dialog open={isAdapterDialogOpen} onOpenChange={setIsAdapterDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-create-adapter">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Adapter
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Authentication Adapter</DialogTitle>
                  <DialogDescription>
                    Configure a new authentication adapter for API integration
                  </DialogDescription>
                </DialogHeader>
                <Form {...adapterForm}>
                  <form onSubmit={adapterForm.handleSubmit(onAdapterSubmit)} className="space-y-4">
                    <FormField
                      control={adapterForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="My API Adapter" {...field} data-testid="input-adapter-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={adapterForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-adapter-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="oauth2">OAuth2</SelectItem>
                              <SelectItem value="jwt">JWT</SelectItem>
                              <SelectItem value="cookie">Cookie</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={adapterForm.control}
                      name="direction"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Direction</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-adapter-direction">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="inbound">Inbound</SelectItem>
                              <SelectItem value="outbound">Outbound</SelectItem>
                              <SelectItem value="bidirectional">Bidirectional</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Inbound validates requests to ContinuityBridge, outbound provides tokens for external calls
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={adapterForm.control}
                      name="activated"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Activated</FormLabel>
                            <FormDescription>Enable this adapter</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-adapter-activated" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAdapterDialogOpen(false)}
                        data-testid="button-cancel-adapter"
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createAdapterMutation.isPending} data-testid="button-submit-adapter">
                        Create
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {adaptersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading adapters...</div>
          ) : adapters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No authentication adapters configured. Create one to get started.
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adapters.map((adapter) => (
                    <TableRow key={adapter.id} data-testid={`row-adapter-${adapter.id}`}>
                      <TableCell className="font-medium">{adapter.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{adapter.type.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="capitalize">{adapter.direction}</TableCell>
                      <TableCell>
                        {adapter.activated ? (
                          <Badge variant="default" className="flex items-center gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <XCircle className="h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {adapter.lastUsedAt ? new Date(adapter.lastUsedAt).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-adapter-actions-${adapter.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => testAdapterMutation.mutate(adapter.id)}
                              disabled={!adapter.activated || testAdapterMutation.isPending}
                              data-testid={`action-test-${adapter.id}`}
                            >
                              <TestTube2 className="h-4 w-4 mr-2" />
                              Test
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => refreshAdapterMutation.mutate(adapter.id)}
                              disabled={!adapter.activated || refreshAdapterMutation.isPending}
                              data-testid={`action-refresh-${adapter.id}`}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Refresh
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteAdapterMutation.mutate(adapter.id)}
                              className="text-destructive"
                              data-testid={`action-delete-${adapter.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Inbound Auth Policies
              </CardTitle>
              <CardDescription>
                Configure authentication requirements for API routes
              </CardDescription>
            </div>
            <Dialog open={isPolicyDialogOpen} onOpenChange={setIsPolicyDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-create-policy">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Policy
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Inbound Auth Policy</DialogTitle>
                  <DialogDescription>
                    Define authentication requirements for a route pattern
                  </DialogDescription>
                </DialogHeader>
                <Form {...policyForm}>
                  <form onSubmit={policyForm.handleSubmit(onPolicySubmit)} className="space-y-4">
                    <FormField
                      control={policyForm.control}
                      name="routePattern"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Route Pattern</FormLabel>
                          <FormControl>
                            <Input placeholder="/api/items/:id" {...field} data-testid="input-policy-route" />
                          </FormControl>
                          <FormDescription>
                            Supports path-to-regexp syntax for dynamic routes
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={policyForm.control}
                      name="httpMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>HTTP Method</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-policy-method">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ALL">ALL</SelectItem>
                              <SelectItem value="GET">GET</SelectItem>
                              <SelectItem value="POST">POST</SelectItem>
                              <SelectItem value="PUT">PUT</SelectItem>
                              <SelectItem value="PATCH">PATCH</SelectItem>
                              <SelectItem value="DELETE">DELETE</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={policyForm.control}
                      name="enforcementMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Enforcement Mode</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-policy-enforcement">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bypass">Bypass (Public)</SelectItem>
                              <SelectItem value="optional">Optional</SelectItem>
                              <SelectItem value="required">Required</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Bypass allows unauthenticated access, required blocks without valid token
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={policyForm.control}
                      name="multiTenant"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Multi-Tenant</FormLabel>
                            <FormDescription>Support X-Auth-Adapter-ID header override</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-policy-multitenant" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsPolicyDialogOpen(false)}
                        data-testid="button-cancel-policy"
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createPolicyMutation.isPending} data-testid="button-submit-policy">
                        Create
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {policiesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading policies...</div>
          ) : policies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No inbound policies configured. Create one to protect routes.
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route Pattern</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Enforcement</TableHead>
                    <TableHead>Multi-Tenant</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((policy) => (
                    <TableRow key={policy.id} data-testid={`row-policy-${policy.id}`}>
                      <TableCell className="font-mono text-sm">{policy.routePattern}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{policy.httpMethod}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            policy.enforcementMode === "required"
                              ? "default"
                              : policy.enforcementMode === "bypass"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {policy.enforcementMode}
                        </Badge>
                      </TableCell>
                      <TableCell>{policy.multiTenant ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletePolicyMutation.mutate(policy.id)}
                          data-testid={`button-delete-policy-${policy.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
