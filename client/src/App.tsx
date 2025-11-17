import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import Dashboard from "@/pages/dashboard";
import Events from "@/pages/events";
import Queue from "@/pages/queue";
import Ingest from "@/pages/ingest";
import DataSources from "@/pages/datasources";
import Interfaces from "@/pages/interfaces";
import Flows from "@/pages/flows";
import Settings from "@/pages/settings";
import MappingGenerator from "@/pages/MappingGenerator";
import NotFound from "@/pages/not-found";
import type { QueueConfig } from "@shared/schema";

function Router() {
  const { data: queueConfig } = useQuery<QueueConfig>({
    queryKey: ["/api/queue/config"],
    refetchInterval: 10000,
  });

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

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
              <Route path="/mappergenerator" component={MappingGenerator} />
              <Route path="/settings" component={Settings} />
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
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
