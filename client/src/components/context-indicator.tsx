import { useState } from "react";
import { Building2, RefreshCw, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TenantOption {
  tenantId: string;
  tenantName: string;
  environment: "dev" | "test" | "staging" | "prod";
  instanceName: string;
  hasAccess: boolean;
}

export function ContextIndicator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const { data: tenants } = useQuery<TenantOption[]>({
    queryKey: ["/api/consultant/tenants"],
    enabled: user?.role === "consultant" || user?.role === "superadmin",
  });

  const switchTenantMutation = useMutation({
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
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Environment switched successfully" });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error switching environment", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  if (!user?.selectedTenant) {
    return null;
  }

  const getEnvironmentColor = (env: string) => {
    switch (env) {
      case "dev": return "bg-blue-500 hover:bg-blue-600";
      case "test": return "bg-yellow-500 hover:bg-yellow-600";
      case "staging": return "bg-purple-500 hover:bg-purple-600";
      case "prod": return "bg-red-500 hover:bg-red-600";
      default: return "bg-gray-500 hover:bg-gray-600";
    }
  };

  const getEnvironmentDot = (env: string) => {
    switch (env) {
      case "dev": return "bg-blue-500";
      case "test": return "bg-yellow-500";
      case "staging": return "bg-purple-500";
      case "prod": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const currentTenant = user.selectedTenant;

  // Group available tenants by organization
  const groupedTenants = tenants?.reduce((acc, tenant) => {
    const key = tenant.tenantName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tenant);
    return acc;
  }, {} as Record<string, TenantOption[]>);

  const currentOrgTenants = groupedTenants?.[user.organizationName || ""] || [];

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 px-3 font-mono text-xs"
          disabled={switchTenantMutation.isPending}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span className="hidden md:inline font-semibold">
            {user.organizationName || "Unknown Org"}
          </span>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${getEnvironmentDot(currentTenant.environment)}`} />
            <span className={`uppercase font-bold ${
              currentTenant.environment === "prod" ? "text-red-600" : 
              currentTenant.environment === "staging" ? "text-purple-600" : 
              currentTenant.environment === "test" ? "text-yellow-600" : 
              "text-blue-600"
            }`}>
              {currentTenant.environment}
            </span>
          </div>
          {switchTenantMutation.isPending ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Switch Environment
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Current Organization Environments */}
        {currentOrgTenants.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {user.organizationName || "Current Organization"}
            </DropdownMenuLabel>
            {currentOrgTenants.map((tenant) => {
              const isCurrent = 
                tenant.tenantId === currentTenant.tenantId && 
                tenant.environment === currentTenant.environment;
              
              return (
                <DropdownMenuItem
                  key={`${tenant.tenantId}-${tenant.environment}`}
                  onClick={() => {
                    if (!isCurrent && tenant.hasAccess) {
                      switchTenantMutation.mutate(tenant);
                    }
                  }}
                  disabled={!tenant.hasAccess || isCurrent}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getEnvironmentDot(tenant.environment)}`} />
                    <span className="font-medium capitalize">{tenant.environment}</span>
                  </div>
                  {isCurrent && (
                    <Badge variant="secondary" className="text-xs">Current</Badge>
                  )}
                  {!tenant.hasAccess && (
                    <Badge variant="outline" className="text-xs">No Access</Badge>
                  )}
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        {/* Other Organizations */}
        {groupedTenants && Object.keys(groupedTenants).length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Other Organizations
            </DropdownMenuLabel>
            {Object.entries(groupedTenants).map(([orgName, envs]) => {
              if (orgName === user.organizationName) return null;
              
              return envs.map((tenant) => (
                <DropdownMenuItem
                  key={`${tenant.tenantId}-${tenant.environment}`}
                  onClick={() => {
                    if (tenant.hasAccess) {
                      switchTenantMutation.mutate(tenant);
                    }
                  }}
                  disabled={!tenant.hasAccess}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getEnvironmentDot(tenant.environment)}`} />
                    <span className="text-xs">{orgName} - </span>
                    <span className="font-medium capitalize text-xs">{tenant.environment}</span>
                  </div>
                  {!tenant.hasAccess && (
                    <Badge variant="outline" className="text-xs">No Access</Badge>
                  )}
                </DropdownMenuItem>
              ));
            })}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation("/profile")} className="text-xs text-muted-foreground">
          View Full Tenant Selector
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
