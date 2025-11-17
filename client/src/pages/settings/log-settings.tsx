import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, Download, Clock, Trash2, Settings2, RefreshCw, FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LogConfig {
  id?: string;
  scope: "superadmin" | "customer";
  organizationId?: string;
  minLevel: "debug" | "info" | "warn" | "error";
  retentionDays: number;
  fileLoggingEnabled: boolean;
  fileRotationDays: number;
  dbLoggingEnabled: boolean;
  logFlowExecutions: boolean;
  logApiRequests: boolean;
  logAuthEvents: boolean;
  logErrors: boolean;
}

interface LogFile {
  name: string;
  size: number;
  modified: string;
  path: string;
}

interface CleanupStatus {
  running: boolean;
  lastRunAt?: string;
  lastRunStats?: {
    superadminDeleted: number;
    customerDeleted: number;
    totalDeleted: number;
    duration: number;
  };
  nextRunAt?: string;
}

export default function LogSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperadmin = user?.role === "superadmin";
  
  const [config, setConfig] = useState<LogConfig>({
    scope: isSuperadmin ? "superadmin" : "customer",
    minLevel: "info",
    retentionDays: isSuperadmin ? 90 : 30,
    fileLoggingEnabled: true,
    fileRotationDays: 30,
    dbLoggingEnabled: true,
    logFlowExecutions: true,
    logApiRequests: true,
    logAuthEvents: true,
    logErrors: true,
  });

  // Load log configuration
  const { data: loadedConfig, isLoading: configLoading } = useQuery<LogConfig>({
    queryKey: ["/api/logs/config"],
    queryFn: async () => {
      const response = await fetch("/api/logs/config");
      const data = await response.json();
      if (data.config) {
        setConfig(data.config);
        return data.config;
      }
      return config;
    },
  });

  // Load cleanup status
  const { data: cleanupStatus, isLoading: statusLoading } = useQuery<CleanupStatus>({
    queryKey: ["/api/logs/cleanup/status"],
    enabled: isSuperadmin,
    queryFn: async () => {
      const response = await fetch("/api/logs/cleanup/status");
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Load available log files
  const { data: logFiles, isLoading: filesLoading } = useQuery<LogFile[]>({
    queryKey: ["/api/logs/files"],
    enabled: isSuperadmin,
    queryFn: async () => {
      const response = await fetch("/api/logs/files");
      const data = await response.json();
      return data.files || [];
    },
  });

  // Save configuration
  const saveMutation = useMutation({
    mutationFn: async (configData: LogConfig) => {
      return apiRequest("/api/logs/config", {
        method: "PUT",
        body: JSON.stringify(configData),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Log configuration saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/logs/config"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  // Trigger manual cleanup
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/logs/cleanup/trigger", { method: "POST" });
    },
    onSuccess: () => {
      toast({
        title: "Cleanup Triggered",
        description: "Log cleanup job started successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/logs/cleanup/status"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to trigger cleanup",
        variant: "destructive",
      });
    },
  });

  // Download log file
  const handleDownload = async (file: LogFile) => {
    try {
      const response = await fetch(`/api/logs/files/${encodeURIComponent(file.name)}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download Started",
        description: `Downloading ${file.name}`,
      });
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    saveMutation.mutate(config);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatSchedule = (intervalMinutes: number) => {
    if (intervalMinutes < 60) return `Every ${intervalMinutes} minutes`;
    const hours = Math.floor(intervalMinutes / 60);
    return `Every ${hours} hour${hours > 1 ? "s" : ""}`;
  };

  const getNextRunTime = () => {
    if (!cleanupStatus?.lastRunAt) return "Not yet run";
    const lastRun = new Date(cleanupStatus.lastRunAt);
    const nextRun = new Date(lastRun.getTime() + 60 * 60 * 1000); // 60 minutes
    const now = new Date();
    
    if (nextRun < now) return "Soon";
    
    const diffMs = nextRun.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `In ${diffMins} minutes`;
    const diffHours = Math.floor(diffMins / 60);
    return `In ${diffHours} hour${diffHours > 1 ? "s" : ""}`;
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Log Configuration
          </CardTitle>
          <CardDescription>
            {isSuperadmin 
              ? "Configure global platform logging settings" 
              : "Configure logging settings for your organization"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Scope Badge */}
          <div>
            <Label>Scope</Label>
            <div className="mt-2">
              <Badge variant={isSuperadmin ? "default" : "secondary"}>
                {isSuperadmin ? "Superadmin (Global Platform Logs)" : "Customer (Organization Logs)"}
              </Badge>
            </div>
          </div>

          {/* Log Level */}
          <div>
            <Label htmlFor="minLevel">Minimum Log Level</Label>
            <Select 
              value={config.minLevel} 
              onValueChange={(v) => setConfig({ ...config, minLevel: v as any })}
            >
              <SelectTrigger id="minLevel" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debug">Debug (verbose, all logs)</SelectItem>
                <SelectItem value="info">Info (normal operations)</SelectItem>
                <SelectItem value="warn">Warning (potential issues)</SelectItem>
                <SelectItem value="error">Error (failures only)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Retention Period */}
          <div>
            <Label htmlFor="retentionDays">Retention Period (Days)</Label>
            <Input
              id="retentionDays"
              type="number"
              min="1"
              max="365"
              value={config.retentionDays}
              onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) })}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Logs older than this will be automatically deleted (default: {isSuperadmin ? "90" : "30"} days)
            </p>
          </div>

          {/* File Rotation */}
          <div>
            <Label htmlFor="fileRotationDays">File Rotation Period (Days)</Label>
            <Input
              id="fileRotationDays"
              type="number"
              min="1"
              max="90"
              value={config.fileRotationDays}
              onChange={(e) => setConfig({ ...config, fileRotationDays: parseInt(e.target.value) })}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Create new log file after this many days
            </p>
          </div>

          {/* Toggle Switches */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="fileLogging">File Logging</Label>
                <p className="text-xs text-muted-foreground">Save logs to files on disk</p>
              </div>
              <Switch
                id="fileLogging"
                checked={config.fileLoggingEnabled}
                onCheckedChange={(checked) => setConfig({ ...config, fileLoggingEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="dbLogging">Database Logging</Label>
                <p className="text-xs text-muted-foreground">Store logs in database for querying</p>
              </div>
              <Switch
                id="dbLogging"
                checked={config.dbLoggingEnabled}
                onCheckedChange={(checked) => setConfig({ ...config, dbLoggingEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="logFlowExecutions">Log Flow Executions</Label>
                <p className="text-xs text-muted-foreground">Track every flow run</p>
              </div>
              <Switch
                id="logFlowExecutions"
                checked={config.logFlowExecutions}
                onCheckedChange={(checked) => setConfig({ ...config, logFlowExecutions: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="logApiRequests">Log API Requests</Label>
                <p className="text-xs text-muted-foreground">Record all API calls</p>
              </div>
              <Switch
                id="logApiRequests"
                checked={config.logApiRequests}
                onCheckedChange={(checked) => setConfig({ ...config, logApiRequests: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="logAuthEvents">Log Authentication Events</Label>
                <p className="text-xs text-muted-foreground">Track login/logout activity</p>
              </div>
              <Switch
                id="logAuthEvents"
                checked={config.logAuthEvents}
                onCheckedChange={(checked) => setConfig({ ...config, logAuthEvents: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="logErrors">Log Errors</Label>
                <p className="text-xs text-muted-foreground">Always log errors (recommended)</p>
              </div>
              <Switch
                id="logErrors"
                checked={config.logErrors}
                onCheckedChange={(checked) => setConfig({ ...config, logErrors: checked })}
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cleanup Status Card (Superadmin Only) */}
      {isSuperadmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Automated Cleanup Job
            </CardTitle>
            <CardDescription>
              Background service that enforces retention policies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Schedule Info */}
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Schedule:</span>
                    <span>{formatSchedule(60)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Status:</span>
                    <Badge variant={cleanupStatus?.running ? "default" : "secondary"}>
                      {cleanupStatus?.running ? "Running" : "Idle"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Next Run:</span>
                    <span>{getNextRunTime()}</span>
                  </div>
                  {cleanupStatus?.lastRunAt && (
                    <div className="flex justify-between">
                      <span className="font-medium">Last Run:</span>
                      <span>{new Date(cleanupStatus.lastRunAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>

            {/* Last Run Stats */}
            {cleanupStatus?.lastRunStats && (
              <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold">{cleanupStatus.lastRunStats.superadminDeleted}</div>
                  <div className="text-xs text-muted-foreground">Superadmin Logs</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{cleanupStatus.lastRunStats.customerDeleted}</div>
                  <div className="text-xs text-muted-foreground">Customer Logs</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{cleanupStatus.lastRunStats.totalDeleted}</div>
                  <div className="text-xs text-muted-foreground">Total Deleted</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{cleanupStatus.lastRunStats.duration}ms</div>
                  <div className="text-xs text-muted-foreground">Duration</div>
                </div>
              </div>
            )}

            {/* Manual Trigger */}
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isPending || cleanupStatus?.running}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {cleanupMutation.isPending ? "Triggering..." : "Trigger Cleanup Now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log File Explorer (Superadmin Only) */}
      {isSuperadmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Log Files
            </CardTitle>
            <CardDescription>
              Browse and download log files from the server
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filesLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading files...</div>
            ) : !logFiles || logFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No log files found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Modified</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logFiles.map((file) => (
                    <TableRow key={file.name}>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {file.name}
                        </div>
                      </TableCell>
                      <TableCell>{formatBytes(file.size)}</TableCell>
                      <TableCell>{new Date(file.modified).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDownload(file)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

