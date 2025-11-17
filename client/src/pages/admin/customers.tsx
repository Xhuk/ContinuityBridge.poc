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
import { 
  Plus, Database, Building2, Users, CheckCircle2, XCircle, 
  Clock, AlertCircle, Settings, Trash2, PlayCircle 
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Form schemas
const customerFormSchema = z.object({
  organizationId: z.string().min(3, "Organization ID must be at least 3 characters"),
  organizationName: z.string().min(3, "Organization name must be at least 3 characters"),
  licenseType: z.enum(["trial", "basic", "professional", "enterprise"]),
  applySchema: z.boolean().default(true),
  applyData: z.boolean().default(true),
  validUntil: z.string().optional(),
  contractNumber: z.string().optional(),
  notes: z.string().optional(),
});

const licenseFormSchema = z.object({
  licenseType: z.enum(["trial", "basic", "professional", "enterprise"]),
  flowEditor: z.boolean(),
  dataSources: z.boolean(),
  interfaces: z.boolean(),
  mappingGenerator: z.boolean(),
  advancedSettings: z.boolean(),
  customNodes: z.boolean(),
  validUntil: z.string().optional(),
});

export default function CustomersManagement() {
  const { toast } = useToast();
  const [isProvisionDialogOpen, setIsProvisionDialogOpen] = useState(false);
  const [isLicenseDialogOpen, setIsLicenseDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  // Fetch customer databases
  const { data: databasesData, isLoading: databasesLoading } = useQuery({
    queryKey: ["/api/customer-databases"],
  });

  // Fetch licenses
  const { data: licensesData } = useQuery({
    queryKey: ["/api/license/all"],
    queryFn: async () => {
      // This would need a new endpoint to list all licenses
      return { licenses: [] };
    },
  });

  const databases = databasesData?.databases || [];

  // Provision database mutation
  const provisionMutation = useMutation({
    mutationFn: async (data: z.infer<typeof customerFormSchema>) => {
      // Step 1: Provision database
      const dbResult = await apiRequest("POST", "/api/customer-databases/provision", {
        organizationId: data.organizationId,
        organizationName: data.organizationName,
        applySchema: data.applySchema,
        applyData: data.applyData,
      });

      // Step 2: Create license
      const licenseResult = await apiRequest("POST", "/api/license", {
        organizationId: data.organizationId,
        organizationName: data.organizationName,
        licenseType: data.licenseType,
        validUntil: data.validUntil,
        contractNumber: data.contractNumber,
        notes: data.notes,
      });

      return { database: dbResult, license: licenseResult };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-databases"] });
      setIsProvisionDialogOpen(false);
      toast({ 
        title: "Customer provisioned successfully",
        description: "Database and license created. Initial admin user will receive confirmation email.",
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Provisioning failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Update license mutation
  const updateLicenseMutation = useMutation({
    mutationFn: async (data: z.infer<typeof licenseFormSchema> & { organizationId: string }) => {
      return apiRequest("POST", "/api/license", {
        organizationId: data.organizationId,
        licenseType: data.licenseType,
        features: {
          flowEditor: data.flowEditor,
          dataSources: data.dataSources,
          interfaces: data.interfaces,
          mappingGenerator: data.mappingGenerator,
          advancedSettings: data.advancedSettings,
          customNodes: data.customNodes,
          apiAccess: true,
          webhooks: true,
        },
        validUntil: data.validUntil,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/license/all"] });
      setIsLicenseDialogOpen(false);
      toast({ title: "License updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update license", description: error.message, variant: "destructive" });
    },
  });

  // Delete database mutation
  const deleteDatabaseMutation = useMutation({
    mutationFn: async (id: string) => 
      apiRequest("DELETE", `/api/customer-databases/${id}`, { confirmDrop: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-databases"] });
      toast({ title: "Customer database deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete database", description: error.message, variant: "destructive" });
    },
  });

  const provisionForm = useForm<z.infer<typeof customerFormSchema>>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      organizationId: "",
      organizationName: "",
      licenseType: "trial",
      applySchema: true,
      applyData: true,
    },
  });

  const licenseForm = useForm<z.infer<typeof licenseFormSchema>>({
    resolver: zodResolver(licenseFormSchema),
    defaultValues: {
      licenseType: "trial",
      flowEditor: false,
      dataSources: false,
      interfaces: false,
      mappingGenerator: false,
      advancedSettings: false,
      customNodes: false,
    },
  });

  const onProvisionSubmit = (data: z.infer<typeof customerFormSchema>) => {
    provisionMutation.mutate(data);
  };

  const onLicenseSubmit = (data: z.infer<typeof licenseFormSchema>) => {
    if (selectedCustomer) {
      updateLicenseMutation.mutate({
        ...data,
        organizationId: selectedCustomer.organizationId,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
      case "provisioning":
        return <Badge className="bg-blue-100 text-blue-800"><Clock className="h-3 w-3 mr-1" />Provisioning</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getLicenseTypeColor = (type: string) => {
    switch (type) {
      case "trial":
        return "bg-gray-100 text-gray-800";
      case "basic":
        return "bg-blue-100 text-blue-800";
      case "professional":
        return "bg-purple-100 text-purple-800";
      case "enterprise":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Customer Management</h1>
          <p className="text-muted-foreground">Provision databases and manage customer licenses</p>
        </div>
        <Dialog open={isProvisionDialogOpen} onOpenChange={setIsProvisionDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Provision New Customer</DialogTitle>
              <DialogDescription>
                Create dedicated database and license for a new customer
              </DialogDescription>
            </DialogHeader>
            <Form {...provisionForm}>
              <form onSubmit={provisionForm.handleSubmit(onProvisionSubmit)} className="space-y-4">
                <FormField
                  control={provisionForm.control}
                  name="organizationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization ID</FormLabel>
                      <FormControl>
                        <Input placeholder="acme-corp" {...field} />
                      </FormControl>
                      <FormDescription>
                        Unique identifier (lowercase, hyphens allowed)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={provisionForm.control}
                  name="organizationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corporation" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={provisionForm.control}
                  name="licenseType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="trial">Trial (Limited Features)</SelectItem>
                          <SelectItem value="basic">Basic (20 Flows)</SelectItem>
                          <SelectItem value="professional">Professional (100 Flows + AI)</SelectItem>
                          <SelectItem value="enterprise">Enterprise (Unlimited)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={provisionForm.control}
                    name="contractNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract Number (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="CONTRACT-2024-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={provisionForm.control}
                    name="validUntil"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valid Until (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={provisionForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Additional contract details..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium">Database Provisioning</h3>
                  
                  <FormField
                    control={provisionForm.control}
                    name="applySchema"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Apply Schema</FormLabel>
                          <FormDescription>
                            Create all database tables automatically
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

                  <FormField
                    control={provisionForm.control}
                    name="applyData"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Apply Initial Data</FormLabel>
                          <FormDescription>
                            Create admin user and default configurations
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
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsProvisionDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={provisionMutation.isPending}>
                    {provisionMutation.isPending ? "Provisioning..." : "Provision Customer"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Customer Databases</CardTitle>
          </div>
          <CardDescription>
            {databases.length} customer database{databases.length !== 1 ? 's' : ''} provisioned
          </CardDescription>
        </CardHeader>
        <CardContent>
          {databasesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : databases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No customers provisioned yet</p>
              <p className="text-sm">Click "New Customer" to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Database</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {databases.map((db: any) => (
                  <TableRow key={db.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{db.organizationName}</div>
                          <div className="text-sm text-muted-foreground">{db.organizationId}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {db.databaseName}
                      </code>
                    </TableCell>
                    <TableCell>{getStatusBadge(db.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(db.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={getLicenseTypeColor("trial")}>
                        Trial
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedCustomer(db);
                              setIsLicenseDialogOpen(true);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Manage License
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Delete database for ${db.organizationName}?`)) {
                                deleteDatabaseMutation.mutate(db.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Database
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* License Management Dialog */}
      <Dialog open={isLicenseDialogOpen} onOpenChange={setIsLicenseDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage License - {selectedCustomer?.organizationName}</DialogTitle>
            <DialogDescription>
              Configure features and resource limits
            </DialogDescription>
          </DialogHeader>
          <Form {...licenseForm}>
            <form onSubmit={licenseForm.handleSubmit(onLicenseSubmit)} className="space-y-4">
              <FormField
                control={licenseForm.control}
                name="licenseType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>License Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="trial">Trial</SelectItem>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <Separator />

              <div className="space-y-3">
                <h3 className="font-medium">Feature Flags</h3>
                
                {[
                  { name: "flowEditor", label: "Flow Builder", description: "Visual flow editor" },
                  { name: "dataSources", label: "Data Sources", description: "Configure data connections" },
                  { name: "interfaces", label: "Interfaces", description: "REST, GraphQL, etc" },
                  { name: "mappingGenerator", label: "AI Mapping Generator", description: "Automated mapping" },
                  { name: "advancedSettings", label: "Advanced Settings", description: "System configuration" },
                  { name: "customNodes", label: "Custom Nodes", description: "Create custom flow nodes" },
                ].map((feature) => (
                  <FormField
                    key={feature.name}
                    control={licenseForm.control}
                    name={feature.name as any}
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>{feature.label}</FormLabel>
                          <FormDescription>{feature.description}</FormDescription>
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
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsLicenseDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateLicenseMutation.isPending}>
                  {updateLicenseMutation.isPending ? "Updating..." : "Update License"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
