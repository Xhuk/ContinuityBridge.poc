import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Users, Shield, User, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WikiPage() {
  const { user } = useAuth();

  // Define which guides are available for each role
  const roleGuides = {
    superadmin: [
      { name: "Founder Guide", file: "founder-guide.md", icon: Shield, description: "Complete system management, licensing, and deployment" },
      { name: "Consultant Guide", file: "consultant-guide.md", icon: Users, description: "Multi-customer support and configuration" },
      { name: "Customer Admin Guide", file: "customer-admin-guide.md", icon: User, description: "Organization and flow management" },
      { name: "Customer User Guide", file: "customer-user-guide.md", icon: User, description: "Monitoring and error triage" },
    ],
    consultant: [
      { name: "Consultant Guide", file: "consultant-guide.md", icon: Users, description: "Multi-customer support and configuration" },
      { name: "Customer Admin Guide", file: "customer-admin-guide.md", icon: User, description: "Help customers manage their organization" },
      { name: "Customer User Guide", file: "customer-user-guide.md", icon: User, description: "Monitoring and error triage" },
    ],
    customer_admin: [
      { name: "Customer Admin Guide", file: "customer-admin-guide.md", icon: User, description: "Organization and flow management" },
      { name: "Customer User Guide", file: "customer-user-guide.md", icon: User, description: "Monitoring and error triage" },
    ],
    customer_user: [
      { name: "Customer User Guide", file: "customer-user-guide.md", icon: User, description: "Monitoring and error triage" },
    ],
  };

  const userRole = user?.role || "customer_user";
  const availableGuides = roleGuides[userRole as keyof typeof roleGuides] || roleGuides.customer_user;

  const handleDownloadGuide = async (fileName: string) => {
    // Fetch and download the guide
    try {
      const response = await fetch(`/api/wiki/download/${fileName}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName.replace('.md', '.pdf');
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download guide:', error);
    }
  };

  const handleViewGuide = (fileName: string) => {
    // Navigate to the guide viewer
    window.open(`/wiki/view/${fileName}`, "_blank");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8" />
            Documentation & User Guides
          </h1>
          <p className="text-muted-foreground mt-2">
            Role-based documentation for ContinuityBridge platform
          </p>
        </div>
      </div>

      <Tabs defaultValue="guides" className="space-y-4">
        <TabsList>
          <TabsTrigger value="guides">
            <FileText className="h-4 w-4 mr-2" />
            User Guides
          </TabsTrigger>
          <TabsTrigger value="quick-start">
            <BookOpen className="h-4 w-4 mr-2" />
            Quick Start
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guides" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableGuides.map((guide) => {
              const Icon = guide.icon;
              return (
                <Card key={guide.file} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      {guide.name}
                    </CardTitle>
                    <CardDescription>{guide.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button 
                      variant="default" 
                      className="w-full"
                      onClick={() => handleViewGuide(guide.file)}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      Read Guide
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => handleDownloadGuide(guide.file)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="quick-start" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Guide</CardTitle>
              <CardDescription>Get started with ContinuityBridge in 5 minutes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {userRole === "superadmin" && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">For Founders & Superadmins:</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Configure Google Cloud Storage for deployment packages</li>
                    <li>Create customer licenses and organizations</li>
                    <li>Assign consultants to customer accounts</li>
                    <li>Generate and distribute deployment packages</li>
                    <li>Monitor system health and usage metrics</li>
                  </ol>
                </div>
              )}

              {userRole === "consultant" && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">For Consultants:</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Access your assigned customer workspaces</li>
                    <li>Configure integration flows between systems</li>
                    <li>Map fields and add transformations</li>
                    <li>Test integrations with sample data</li>
                    <li>Deploy flows to production and monitor</li>
                  </ol>
                </div>
              )}

              {userRole === "customer_admin" && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">For Customer Admins:</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Update organization profile and deployment contacts</li>
                    <li>Invite team members and assign roles</li>
                    <li>Create integration flows between your systems</li>
                    <li>Configure cluster deployment (if applicable)</li>
                    <li>Monitor flow performance and review reports</li>
                  </ol>
                </div>
              )}

              {userRole === "customer_user" && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">For Customer Users:</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>View the dashboard to check flow status</li>
                    <li>Monitor recent executions and success rates</li>
                    <li>Review error logs and identify issues</li>
                    <li>Alert your admin for recurring problems</li>
                    <li>Configure notification preferences</li>
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key Features by Role</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {userRole === "superadmin" && (
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Superadmin Capabilities
                    </h4>
                    <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                      <li>Full system access and configuration</li>
                      <li>License management (create, renew, upgrade)</li>
                      <li>Deployment package generation (4 profiles)</li>
                      <li>Cluster configuration for enterprise customers</li>
                      <li>GDPR compliance management</li>
                      <li>Google Cloud Storage integration</li>
                    </ul>
                  </div>
                )}

                {(userRole === "superadmin" || userRole === "consultant") && (
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Consultant Capabilities
                    </h4>
                    <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                      <li>Multi-customer workspace access</li>
                      <li>Flow configuration and mapping</li>
                      <li>Custom system integration support</li>
                      <li>Performance optimization</li>
                      <li>Troubleshooting and escalation</li>
                    </ul>
                  </div>
                )}

                {(userRole === "superadmin" || userRole === "consultant" || userRole === "customer_admin") && (
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Customer Admin Capabilities
                    </h4>
                    <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                      <li>User management (invite, roles, deactivate)</li>
                      <li>Flow creation and configuration</li>
                      <li>Field mapping and transformations</li>
                      <li>Deployment contact management</li>
                      <li>Reports and analytics</li>
                      <li>GDPR data export and deletion</li>
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Customer User Capabilities
                  </h4>
                  <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                    <li>Dashboard monitoring</li>
                    <li>View flow execution history</li>
                    <li>Error log review and triage</li>
                    <li>Notification configuration</li>
                    <li>Performance report viewing</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
