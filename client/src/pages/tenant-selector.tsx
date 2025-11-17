import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, ChevronRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface TenantOption {
  tenantId: string;
  tenantName: string;
  environment: "dev" | "test" | "staging" | "prod";
  instanceName: string;
  hasAccess: boolean;
}

export default function TenantSelector() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: tenants, isLoading } = useQuery<TenantOption[]>({
    queryKey: ["/api/consultant/tenants"],
  });

  const selectTenantMutation = useMutation({
    mutationFn: async (tenant: TenantOption) => {
      const response = await fetch("/api/consultant/select-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tenantId: tenant.tenantId,
          environment: tenant.environment 
        }),
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Tenant selected successfully" });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error selecting tenant", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const getEnvironmentColor = (env: string) => {
    switch (env) {
      case "dev": return "bg-blue-500";
      case "test": return "bg-yellow-500";
      case "staging": return "bg-purple-500";
      case "prod": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  // Group tenants by organization
  const groupedTenants = tenants?.reduce((acc, tenant) => {
    const key = tenant.tenantName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tenant);
    return acc;
  }, {} as Record<string, TenantOption[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading tenants...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-5xl mx-auto pt-12">
        <div className="text-center mb-12">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h1 className="text-4xl font-bold mb-3">Select Customer Environment</h1>
          <p className="text-muted-foreground text-lg">
            Choose which customer environment you want to work with
          </p>
        </div>

        <div className="space-y-6">
          {Object.entries(groupedTenants || {}).map(([tenantName, environments]) => (
            <Card key={tenantName} className="overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {tenantName}
                </CardTitle>
                <CardDescription>
                  Available environments for this customer
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
                  {environments.map((tenant) => (
                    <button
                      key={`${tenant.tenantId}-${tenant.environment}`}
                      onClick={() => selectTenantMutation.mutate(tenant)}
                      disabled={!tenant.hasAccess || selectTenantMutation.isPending}
                      className="group relative bg-card p-6 text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-3 h-3 rounded-full ${getEnvironmentColor(tenant.environment)}`} />
                            <span className="font-semibold text-lg capitalize">{tenant.environment}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {tenant.instanceName}
                          </p>
                        </div>
                        {tenant.hasAccess ? (
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            No Access
                          </Badge>
                        )}
                      </div>

                      {tenant.hasAccess && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Click to access</span>
                        </div>
                      )}

                      {/* Loading overlay */}
                      {selectTenantMutation.isPending && (
                        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {(!tenants || tenants.length === 0) && (
          <Card className="text-center p-12">
            <CardContent>
              <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Tenants Assigned</h3>
              <p className="text-muted-foreground">
                You don't have access to any customer environments yet.
                <br />
                Please contact your administrator to request access.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
