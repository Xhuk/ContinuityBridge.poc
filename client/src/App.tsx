import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import Dashboard from "@/pages/dashboard";
import Events from "@/pages/events";
import Queue from "@/pages/queue";
import Ingest from "@/pages/ingest";
import DataSources from "@/pages/datasources";
import Interfaces from "@/pages/interfaces";
import Flows from "@/pages/flows";
import TestFiles from "@/pages/test-files";
import Settings from "@/pages/settings";
import MappingGenerator from "@/pages/MappingGenerator";
import Projects from "@/pages/admin/projects";
import Customers from "@/pages/admin/customers";
import UsersManagement from "@/pages/admin/users";
import AIMonitoring from "@/pages/admin/ai-monitoring";
import SystemHealth from "@/pages/admin/system-health";
import TenantSelector from "@/pages/tenant-selector";
import Profile from "@/pages/profile";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Wiki from "@/pages/wiki";
import QATracking from "@/pages/qa-tracking";
import SOWRequests from "@/pages/admin/sow-requests";
import PricingCatalog from "@/pages/admin/pricing-catalog";
import FinanceAnalytics from "@/pages/admin/finance-analytics";
import SalesDashboard from "@/pages/sales/dashboard";
import MySOWRequests from "@/pages/customer/my-sow-requests";
import AdvancedThrottling from "@/pages/settings/advanced-throttling";
import ClusterConfig from "@/pages/settings/cluster-config";
import StorageManagement from "@/pages/admin/storage-management";
import type { QueueConfig } from "@shared/schema";

function Router() {
  const { user, isLoading } = useAuth();
  const { data: queueConfig } = useQuery<QueueConfig>({
    queryKey: ["/api/queue/config"],
    refetchInterval: 10000,
  });

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Show secure landing page (fake 404) if not authenticated
  if (!user) {
    // Determine login path based on deployment type
    // Customer deployments (prod): /admin
    // Founder/Consultant platform: /sys/auth/bridge (obscure)
    const isCustomerDeployment = import.meta.env.VITE_DEPLOYMENT_TYPE === 'customer';
    
    return (
      <Switch>
        {/* Customer login endpoint */}
        <Route path="/admin" component={Login} />
        
        {/* Founder/Consultant obscure login endpoint */}
        <Route path="/sys/auth/bridge" component={Login} />
        
        {/* Fake 404 landing page for security */}
        <Route component={Landing} />
      </Switch>
    );
  }

  // Consultant needs to select tenant first
  const needsTenantSelection = user.role === "consultant" && !user.selectedTenant;

  if (needsTenantSelection) {
    return <TenantSelector />;
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar queueBackend={queueConfig?.backend} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between p-2 border-b border-border">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/events" component={Events} />
              <Route path="/queue" component={Queue} />
              <Route path="/datasources" component={DataSources} />
              <Route path="/interfaces" component={Interfaces} />
              <Route path="/flows" component={Flows} />
              <Route path="/ingest" component={Ingest} />
              <Route path="/test-files" component={TestFiles} />
              <Route path="/mappergenerator" component={MappingGenerator} />
              <Route path="/settings" component={Settings} />
              <Route path="/profile" component={Profile} />
              <Route path="/wiki" component={Wiki} />
              {(user?.role === "superadmin" || user?.role === "consultant" || user?.role === "customer_admin") && (
                <>
                  <Route path="/admin/system-health" component={SystemHealth} />
                  <Route path="/settings/advanced-throttling" component={AdvancedThrottling} />
                  <Route path="/settings/cluster-config" component={ClusterConfig} />
                </>
              )}
              {(user?.role === "superadmin" || user?.role === "consultant") && (
                <Route path="/admin/qa-tracking" component={QATracking} />
              )}
              {user?.role === "superadmin" && (
                <>
                  <Route path="/admin/projects" component={Projects} />
                  <Route path="/admin/customers" component={Customers} />
                  <Route path="/admin/users" component={UsersManagement} />
                  <Route path="/admin/ai-monitoring" component={AIMonitoring} />
                  <Route path="/admin/sow-requests" component={SOWRequests} />
                  <Route path="/admin/pricing-catalog" component={PricingCatalog} />
                  <Route path="/admin/finance-analytics" component={FinanceAnalytics} />
                  <Route path="/admin/storage" component={StorageManagement} />
                </>
              )}
              {user?.role === "sales" && (
                <>
                  <Route path="/sales/dashboard" component={SalesDashboard} />
                </>
              )}
              {user?.role === "consultant" && (
                <Route path="/admin/users" component={UsersManagement} />
              )}
              {user?.role === "customer_admin" && (
                <>
                  <Route path="/admin/users" component={UsersManagement} />
                  <Route path="/customer/my-sow-requests" component={MySOWRequests} />
                </>
              )}
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
