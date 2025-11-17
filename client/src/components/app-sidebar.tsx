import { Home, List, Settings as SettingsIcon, Upload, Database, Network, Workflow, Cog, Sparkles, FileText, Shield, FolderKanban, User, LogOut, Users, Book } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    requiresFeature: null, // Always visible
  },
  {
    title: "Events",
    url: "/events",
    icon: List,
    requiresFeature: null,
  },
  {
    title: "Queue & Worker",
    url: "/queue",
    icon: SettingsIcon,
    requiresFeature: null,
  },
  {
    title: "Data Sources",
    url: "/datasources",
    icon: Database,
    requiresFeature: "dataSources", // Requires license feature
  },
  {
    title: "Interfaces",
    url: "/interfaces",
    icon: Network,
    requiresFeature: "interfaces", // Requires license feature
  },
  {
    title: "Flow Builder",
    url: "/flows",
    icon: Workflow,
    requiresFeature: "flowEditor", // Requires license feature
  },
  {
    title: "Mapping Generator",
    url: "/mappergenerator",
    icon: Sparkles,
    requiresFeature: "mappingGenerator", // Requires license feature
  },
  {
    title: "Ingest XML",
    url: "/ingest",
    icon: Upload,
    requiresFeature: null,
  },
  {
    title: "Test Files",
    url: "/test-files",
    icon: FileText,
    requiresFeature: null,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Cog,
    requiresFeature: "advancedSettings", // Basic settings always available
  },
];

const adminMenuItems = [
  {
    title: "Wiki",
    url: "/wiki",
    icon: Book,
    roles: ["superadmin", "consultant", "customer_admin", "customer_user"],
  },
  {
    title: "Projects",
    url: "/admin/projects",
    icon: FolderKanban,
    roles: ["superadmin"],
  },
  {
    title: "Customers",
    url: "/admin/customers",
    icon: Database,
    roles: ["superadmin"],
  },
  {
    title: "Users",
    url: "/admin/users",
    icon: Users,
    roles: ["superadmin", "consultant", "customer_admin"],
  },
];

export function AppSidebar({ queueBackend }: { queueBackend?: string }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const isSuperAdmin = user?.role === "superadmin";
  const isConsultant = user?.role === "consultant";
  const isCustomerAdmin = user?.role === "customer_admin";
  const isAdmin = isSuperAdmin || isConsultant || isCustomerAdmin;

  // Fetch license/feature flags
  const { data: licenseData } = useQuery({
    queryKey: ["/api/license"],
    enabled: !!user,
  });

  const license = licenseData?.license;
  const features = license?.features || {};

  // Admins and consultants see all features
  const showAllFeatures = isSuperAdmin || isConsultant;

  // Filter menu items based on license
  const visibleMenuItems = menuItems.filter(item => {
    // Always show items without feature requirements
    if (!item.requiresFeature) return true;
    
    // Admins/consultants see everything
    if (showAllFeatures) return true;
    
    // Check if customer has the required feature
    return features[item.requiresFeature] === true;
  });

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

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
              {visibleMenuItems.map((item) => {
                const isActive = location === item.url;
                const isLocked = item.requiresFeature && !showAllFeatures && !features[item.requiresFeature];
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive} 
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      disabled={isLocked}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-5 w-5" />
                        <span className="flex-1">{item.title}</span>
                        {isLocked && (
                          <Badge variant="secondary" className="text-xs">Pro</Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {isSuperAdmin ? "SuperAdmin" : isConsultant ? "Consultant" : "Admin"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems
                  .filter(item => item.roles.includes(user?.role || ""))
                  .map((item) => {
                    const isActive = location === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive}>
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
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="p-2 space-y-2">
          {/* User Profile */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location === "/profile"}>
                <Link href="/profile">
                  <User className="h-5 w-5" />
                  <span className="flex-1">Profile</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* Logout Button */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </Button>

          {/* Queue Backend Badge */}
          <div className="px-2 pt-2 border-t border-sidebar-border">
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
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
