import { useState } from "react";
import { Mail, Lock, Server, Shield, Key, FileJson, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmailSettings from "./email";
import SecretsVault from "./secrets-vault";
import QueueConfiguration from "./queue-config";
import SecuritySettings from "./security";
import AuthenticationSettings from "./auth";
import PostmanExport from "./postman-export";
import LogSettings from "./log-settings";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("email");

  return (
    <div className="h-screen overflow-auto bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">
            Configure system integrations, credentials, and infrastructure
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-7 lg:w-auto lg:inline-grid" data-testid="settings-tabs">
            <TabsTrigger value="email" className="flex items-center gap-2" data-testid="tab-email">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">Email</span>
            </TabsTrigger>
            <TabsTrigger value="secrets" className="flex items-center gap-2" data-testid="tab-secrets">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Secrets Vault</span>
            </TabsTrigger>
            <TabsTrigger value="auth" className="flex items-center gap-2" data-testid="tab-auth">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">Authentication</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex items-center gap-2" data-testid="tab-queue">
              <Server className="h-4 w-4" />
              <span className="hidden sm:inline">Queue</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2" data-testid="tab-security">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="postman" className="flex items-center gap-2" data-testid="tab-postman">
              <FileJson className="h-4 w-4" />
              <span className="hidden sm:inline">Postman</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2" data-testid="tab-logs">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-4">
            <EmailSettings />
          </TabsContent>

          <TabsContent value="secrets" className="space-y-4">
            <SecretsVault />
          </TabsContent>

          <TabsContent value="auth" className="space-y-4">
            <AuthenticationSettings />
          </TabsContent>

          <TabsContent value="queue" className="space-y-4">
            <QueueConfiguration />
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <SecuritySettings />
          </TabsContent>

          <TabsContent value="postman" className="space-y-4">
            <PostmanExport />
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <LogSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
