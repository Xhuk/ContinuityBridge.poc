import { useState } from "react";
import { Mail, Lock, Server, Shield } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import EmailSettings from "./email";
import SecretsVault from "./secrets-vault";

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
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid" data-testid="settings-tabs">
            <TabsTrigger value="email" className="flex items-center gap-2" data-testid="tab-email">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">Email</span>
            </TabsTrigger>
            <TabsTrigger value="secrets" className="flex items-center gap-2" data-testid="tab-secrets">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Secrets Vault</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex items-center gap-2" data-testid="tab-queue">
              <Server className="h-4 w-4" />
              <span className="hidden sm:inline">Queue</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2" data-testid="tab-security">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-4">
            <EmailSettings />
          </TabsContent>

          <TabsContent value="secrets" className="space-y-4">
            <SecretsVault />
          </TabsContent>

          <TabsContent value="queue" className="space-y-4">
            <Card className="p-8 text-center">
              <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Queue Configuration</h3>
              <p className="text-sm text-muted-foreground">
                Configure message queue backends (InMemory, RabbitMQ, Kafka)
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card className="p-8 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Security Settings</h3>
              <p className="text-sm text-muted-foreground">
                Audit logs, access control, and security policies
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
