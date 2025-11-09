import { Home, List, Settings, Upload, Database } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Events",
    url: "/events",
    icon: List,
  },
  {
    title: "Queue & Worker",
    url: "/queue",
    icon: Settings,
  },
  {
    title: "Data Sources",
    url: "/datasources",
    icon: Database,
  },
  {
    title: "Ingest XML",
    url: "/ingest",
    icon: Upload,
  },
];

export function AppSidebar({ queueBackend }: { queueBackend?: string }) {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-6 py-4 border-b border-sidebar-border">
          <h1 className="text-lg font-semibold text-sidebar-foreground">
            ContinuityBridge
          </h1>
          <p className="text-xs text-muted-foreground">Middleware POC</p>
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <Link href={item.url}>
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Queue Backend</span>
            <Badge
              variant="secondary"
              className="rounded-full text-xs font-medium"
              data-testid="badge-queue-backend"
            >
              {queueBackend || "InMemory"}
            </Badge>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
