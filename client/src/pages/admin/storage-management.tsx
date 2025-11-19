/**
 * Storage Management Dashboard (Founder Only)
 * 
 * Visual disk usage monitor with 1GB threshold alerts
 * Shows deployment packages, database size, logs, backups
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  HardDrive,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Download,
  Package,
  Database,
  FileText,
  Archive,
  TrendingUp,
  Info,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StorageStats {
  total: number; // bytes
  used: number; // bytes
  available: number; // bytes
  percentUsed: number;
  breakdown: {
    deployments: number;
    database: number;
    logs: number;
    backups: number;
    temp: number;
  };
  files: Array<{
    path: string;
    size: number;
    type: string;
    createdAt: string;
    organizationId?: string;
  }>;
  threshold: {
    warning: number; // 800MB (80%)
    critical: number; // 950MB (95%)
  };
}

export default function StorageManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // Fetch storage stats
  const { data: stats, isLoading } = useQuery<StorageStats>({
    queryKey: ["/api/admin/storage/stats"],
    refetchInterval: 30000, // Refresh every 30s
  });

  // Delete files mutation
  const deleteMutation = useMutation({
    mutationFn: async (paths: string[]) => {
      const res = await fetch("/api/admin/storage/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/storage/stats"] });
      setSelectedFiles([]);
      toast({
        title: "✅ Files Deleted",
        description: "Storage space freed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cleanup old files mutation
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/storage/cleanup", {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/storage/stats"] });
      toast({
        title: "✅ Cleanup Complete",
        description: `Freed ${formatBytes(data.freedSpace)} from ${data.filesDeleted} old files`,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="px-6 py-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>Failed to load storage statistics</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isWarning = stats.used >= stats.threshold.warning;
  const isCritical = stats.used >= stats.threshold.critical;
  const status = isCritical ? "critical" : isWarning ? "warning" : "healthy";

  return (
    <div className="px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Storage Management</h1>
        <p className="text-muted-foreground mt-2">
          Monitor disk usage and manage deployment packages
        </p>
      </div>

      {/* Alert Banner */}
      {isCritical && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="font-semibold">
            🚨 CRITICAL: Storage almost full! Delete old files or upgrade storage.
          </AlertDescription>
        </Alert>
      )}

      {isWarning && !isCritical && (
        <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
          <AlertTriangle className="w-4 h-4 text-orange-600" />
          <AlertDescription className="text-orange-900 dark:text-orange-100">
            ⚠️ WARNING: Approaching storage limit. Consider cleanup.
          </AlertDescription>
        </Alert>
      )}

      {/* Storage Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Disk Usage Overview
          </CardTitle>
          <CardDescription>
            Render Disk - Free up to 1GB, then $0.25/GB/month
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visual Disk Representation */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {formatBytes(stats.used)} / {formatBytes(stats.total)} used
              </span>
              <Badge
                variant={
                  status === "critical"
                    ? "destructive"
                    : status === "warning"
                    ? "default"
                    : "secondary"
                }
              >
                {stats.percentUsed.toFixed(1)}%
              </Badge>
            </div>

            <Progress
              value={stats.percentUsed}
              className="h-6"
              indicatorClassName={
                isCritical
                  ? "bg-red-500"
                  : isWarning
                  ? "bg-orange-500"
                  : "bg-green-500"
              }
            />

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Healthy (&lt;80%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span>Warning (80-95%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Critical (&gt;95%)</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Storage Breakdown */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Storage Breakdown
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StorageBreakdownCard
                icon={Package}
                label="Deployments"
                size={stats.breakdown.deployments}
                total={stats.total}
                color="blue"
              />
              <StorageBreakdownCard
                icon={Database}
                label="Database"
                size={stats.breakdown.database}
                total={stats.total}
                color="purple"
              />
              <StorageBreakdownCard
                icon={FileText}
                label="Logs"
                size={stats.breakdown.logs}
                total={stats.total}
                color="green"
              />
              <StorageBreakdownCard
                icon={Archive}
                label="Backups"
                size={stats.breakdown.backups}
                total={stats.total}
                color="orange"
              />
              <StorageBreakdownCard
                icon={HardDrive}
                label="Temp Files"
                size={stats.breakdown.temp}
                total={stats.total}
                color="gray"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Storage Management Actions
          </CardTitle>
          <CardDescription>Free up space by deleting old files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Auto-Cleanup Old Files (&gt;90 days)
            </Button>

            {selectedFiles.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(selectedFiles)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedFiles.length})
              </Button>
            )}

            <Button variant="outline" asChild>
              <a href="https://render.com/docs/disks" target="_blank" rel="noopener">
                <Info className="w-4 h-4 mr-2" />
                Upgrade Storage
              </a>
            </Button>
          </div>

          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-sm">
              <strong>Tip:</strong> Deployment packages older than 90 days are automatically
              deleted. Database backups are kept for 30 days.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Files Table */}
      <Card>
        <CardHeader>
          <CardTitle>Large Files ({stats.files.length})</CardTitle>
          <CardDescription>Files larger than 10MB</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedFiles.length === stats.files.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFiles(stats.files.map((f) => f.path));
                      } else {
                        setSelectedFiles([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead>File Path</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.files.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    No large files found. Storage is optimized!
                  </TableCell>
                </TableRow>
              ) : (
                stats.files.map((file) => (
                  <TableRow key={file.path}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.path)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFiles([...selectedFiles, file.path]);
                          } else {
                            setSelectedFiles(selectedFiles.filter((p) => p !== file.path));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{file.path}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{file.type}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{formatBytes(file.size)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">{file.organizationId || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/api/deployments/download/${encodeURIComponent(file.path)}`, "_blank")}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate([file.path])}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Storage breakdown mini-card
 */
function StorageBreakdownCard({
  icon: Icon,
  label,
  size,
  total,
  color,
}: {
  icon: any;
  label: string;
  size: number;
  total: number;
  color: string;
}) {
  const percentage = ((size / total) * 100).toFixed(1);
  const colorClasses = {
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className={`rounded-lg p-3 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold">{formatBytes(size)}</div>
      <div className="text-xs opacity-75">{percentage}%</div>
    </div>
  );
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
