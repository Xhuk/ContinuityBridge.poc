import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Send, AlertCircle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const smtpSchema = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
  secure: z.boolean(),
  username: z.string().min(1, "Username is required"),
  password: z.string().optional(), // Optional for updates
  fromAddress: z.string().email("Invalid email address"),
  fromName: z.string().optional(),
  alertRecipients: z.string().min(1, "At least one recipient is required"),
  notifyOnFlowError: z.boolean(),
  notifyOnValidationError: z.boolean(),
  notifyOnAckFailure: z.boolean(),
  enabled: z.boolean(),
});

type SmtpFormData = z.infer<typeof smtpSchema>;

export default function EmailSettings() {
  const { toast } = useToast();

  const { data: smtpData, isLoading } = useQuery({
    queryKey: ["/api/smtp-settings"],
  });

  const form = useForm<SmtpFormData>({
    resolver: zodResolver(smtpSchema),
    defaultValues: {
      host: "",
      port: 587,
      secure: false,
      username: "",
      password: "",
      fromAddress: "",
      fromName: "",
      alertRecipients: "",
      notifyOnFlowError: true,
      notifyOnValidationError: false,
      notifyOnAckFailure: true,
      enabled: true,
    },
    values: smtpData?.configured ? {
      host: smtpData.settings.host || "",
      port: smtpData.settings.port || 587,
      secure: smtpData.settings.secure || false,
      username: smtpData.settings.username || "",
      password: "", // Don't prefill password for security
      fromAddress: smtpData.settings.fromAddress || "",
      fromName: smtpData.settings.fromName || "",
      alertRecipients: smtpData.settings.alertRecipients || "",
      notifyOnFlowError: smtpData.settings.notifyOnFlowError ?? true,
      notifyOnValidationError: smtpData.settings.notifyOnValidationError ?? false,
      notifyOnAckFailure: smtpData.settings.notifyOnAckFailure ?? true,
      enabled: smtpData.settings.enabled ?? true,
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: SmtpFormData) => {
      return await apiRequest("/api/smtp-settings", {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "SMTP settings have been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/smtp-settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/smtp-settings/test", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "Test email sent",
        description: "Check your inbox for the test email",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send test email",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure SMTP for email notifications and alerts
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            SMTP Configuration
          </CardTitle>
          <CardDescription>
            Configure your company's email server (Google Workspace, Office 365, or custom SMTP) for sending alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6">
              {/* Server Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Server Settings</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Host</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="smtp.gmail.com" 
                            {...field} 
                            data-testid="input-smtp-host"
                          />
                        </FormControl>
                        <FormDescription>
                          Your SMTP server address
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="587" 
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-smtp-port"
                          />
                        </FormControl>
                        <FormDescription>
                          Typically 587 (TLS) or 465 (SSL)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="secure"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Use SSL/TLS
                        </FormLabel>
                        <FormDescription>
                          Enable for port 465 (SSL), disable for port 587 (STARTTLS)
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-smtp-secure"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Authentication */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Authentication</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="your-email@company.com" 
                            {...field}
                            data-testid="input-smtp-username"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Password
                          {smtpData?.configured && smtpData.hasPassword && (
                            <span className="text-xs text-muted-foreground ml-2">(optional)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder={smtpData?.configured ? "Leave blank to keep existing" : "App-specific password"}
                            {...field}
                            value={field.value || ''}
                            data-testid="input-smtp-password"
                          />
                        </FormControl>
                        <FormDescription>
                          {smtpData?.configured 
                            ? "Leave blank to keep your existing password" 
                            : "Use an app-specific password for Gmail/Outlook"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Email Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Email Settings</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fromAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Address</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="alerts@company.com" 
                            {...field}
                            data-testid="input-smtp-from-address"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fromName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Name (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="ContinuityBridge Alerts" 
                            {...field}
                            data-testid="input-smtp-from-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="alertRecipients"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alert Recipients</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="admin@company.com, ops@company.com" 
                          {...field}
                          data-testid="input-smtp-recipients"
                        />
                      </FormControl>
                      <FormDescription>
                        Comma-separated email addresses to receive alerts
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Notification Rules */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Notification Rules</h3>
                
                <FormField
                  control={form.control}
                  name="notifyOnFlowError"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Flow Errors
                        </FormLabel>
                        <FormDescription>
                          Send email when a flow execution fails
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-notify-flow-error"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notifyOnValidationError"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Validation Errors
                        </FormLabel>
                        <FormDescription>
                          Send email when data validation fails
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-notify-validation-error"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notifyOnAckFailure"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Acknowledgment Failures
                        </FormLabel>
                        <FormDescription>
                          Send email when WMS/system acknowledgments fail
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-notify-ack-failure"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-card">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base font-semibold">
                          Enable Email Notifications
                        </FormLabel>
                        <FormDescription>
                          Master switch for all email alerts
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-smtp-enabled"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button 
                  type="submit" 
                  disabled={saveMutation.isPending}
                  data-testid="button-save-smtp"
                >
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
                
                <Button 
                  type="button"
                  variant="outline"
                  disabled={!smtpData?.configured || testMutation.isPending}
                  onClick={() => testMutation.mutate()}
                  data-testid="button-test-smtp"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send Test Email
                </Button>
              </div>

              {smtpData?.configured && smtpData.settings.lastTestedAt && (
                <p className="text-sm text-muted-foreground">
                  Last tested: {new Date(smtpData.settings.lastTestedAt).toLocaleString()}
                </p>
              )}

              {!smtpData?.configured && (
                <div className="flex items-start gap-2 p-4 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm text-blue-900 dark:text-blue-100">
                    <p className="font-semibold">SMTP not configured</p>
                    <p className="text-blue-700 dark:text-blue-300">
                      Email notifications are currently disabled. Configure your SMTP settings above to enable alerts.
                    </p>
                  </div>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
