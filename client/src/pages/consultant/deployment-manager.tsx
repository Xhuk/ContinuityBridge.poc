/**
 * Deployment Manager - Visual UI for Consultants
 * 
 * Allows consultants to:
 * - View customer deployment versions (BASE + CUSTOM history)
 * - Create/merge customizations with one click
 * - See rework files requiring attention
 * - Compare versions (BASE vs CUSTOM vs RUNTIME)
 * - Rollback to previous snapshots
 * 
 * This makes the Layered Storage system TRANSPARENT and SEAMLESS for consultants
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Package,
  GitMerge,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Layers,
  RefreshCw,
  FileWarning,
  ChevronRight,
  History,
  Info,
  Settings,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function DeploymentManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [selectedProfile, setSelectedProfile] = useState<string>("standard");
  const [baseVersion, setBaseVersion] = useState<string>("1.0.0");
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showRetentionDialog, setShowRetentionDialog] = useState(false);
  
  // Retention policy settings
  const [maxSnapshots, setMaxSnapshots] = useState<number>(10);
  const [minSnapshots, setMinSnapshots] = useState<number>(3);
  const [maxAgeDays, setMaxAgeDays] = useState<number>(90);
  const [keepLatestPerBase, setKeepLatestPerBase] = useState<number>(2);

  // Fetch customers (consultants can see assigned customers)
  const { data: customersData } = useQuery({
    queryKey: ["/api/admin/customers"],
  });

  // Fetch snapshots (version history)
  const { data: snapshotsData, isLoading: isLoadingSnapshots } = useQuery({
    queryKey: [`/api/layered-storage/snapshots/${selectedCustomer}`, { deploymentProfile: selectedProfile }],
    enabled: !!selectedCustomer,
  });

  // Fetch rework files
  const { data: reworkData } = useQuery({
    queryKey: [`/api/layered-storage/rework/${selectedCustomer}`, { deploymentProfile: selectedProfile }],
    enabled: !!selectedCustomer,
  });

  // Fetch status
  const { data: statusData } = useQuery({
    queryKey: [`/api/layered-storage/status/${selectedCustomer}`, { deploymentProfile: selectedProfile }],
    enabled: !!selectedCustomer,
  });

  // Merge mutation
  const mergeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/layered-storage/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId: selectedCustomer,
          deploymentProfile: selectedProfile,
          baseVersion,
          createSnapshot: true,
          retentionPolicy: {
            maxSnapshots,
            minSnapshots,
            maxAgeDays,
            keepLatestPerBase,
          },
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Merge failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/layered-storage/snapshots/${selectedCustomer}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/layered-storage/rework/${selectedCustomer}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/layered-storage/status/${selectedCustomer}`] });

      toast({
        title: "Merge Completed",
        description: `Runtime version ${data.result.runtimeVersion} created successfully`,
      });

      if (data.result.failedFiles?.length > 0) {
        toast({
          title: "Files Require Attention",
          description: `${data.result.failedFiles.length} files moved to rework folder`,
          variant: "destructive",
        });
      }

      setShowMergeDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Merge Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const customers = (customersData as any)?.customers || [];
  const snapshots = (snapshotsData as any)?.snapshots || [];
  const reworkFiles = (reworkData as any)?.files || [];
  const status = statusData || {};

  const latestSnapshot = snapshots[0];
  const hasRework = reworkFiles.length > 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deployment Manager</h1>
          <p className="text-muted-foreground">
            Manage customer deployments (BASE + CUSTOM layers)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowRetentionDialog(true)}
            disabled={!selectedCustomer}
            variant="outline"
            size="lg"
          >
            <Settings className="mr-2 h-4 w-4" />
            Retention Policy
          </Button>
          
          <Button
            onClick={() => setShowMergeDialog(true)}
            disabled={!selectedCustomer}
            size="lg"
          >
            <GitMerge className="mr-2 h-4 w-4" />
            Create New Build
          </Button>
        </div>
      </div>

      {/* Customer & Profile Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Selection</CardTitle>
          <CardDescription>
            Select customer and deployment profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer</label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer: any) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Deployment Profile</label>
              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone">Standalone</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="cluster">Cluster</SelectItem>
                  <SelectItem value="kubernetes">Kubernetes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedCustomer && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Select a customer to view their deployment history and manage builds
          </AlertDescription>
        </Alert>
      )}

      {selectedCustomer && (
        <>
          {/* Status Overview */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Current Version</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {latestSnapshot?.version || "No builds"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {latestSnapshot && `BASE ${latestSnapshot.baseVersion}`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Builds</CardTitle>
                <Layers className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{snapshots.length}</div>
                <p className="text-xs text-muted-foreground">
                  Snapshots preserved
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rework Required</CardTitle>
                {hasRework ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reworkFiles.length}</div>
                <p className="text-xs text-muted-foreground">
                  {hasRework ? "Files need attention" : "All files valid"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Rework Alert */}
          {hasRework && (
            <Alert variant="destructive">
              <FileWarning className="h-4 w-4" />
              <AlertDescription>
                <strong>{reworkFiles.length} files</strong> failed validation and require your attention
              </AlertDescription>
            </Alert>
          )}

          {/* Rework Files Table */}
          {hasRework && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileWarning className="h-5 w-5" />
                  Files Requiring Rework
                </CardTitle>
                <CardDescription>
                  These files failed validation and need to be fixed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Name</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reworkFiles.map((file: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">{file.fileName}</TableCell>
                        <TableCell className="text-destructive">{file.reason}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(file.timestamp), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Version History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Deployment History
              </CardTitle>
              <CardDescription>
                All runtime builds (BASE + CUSTOM merged)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSnapshots ? (
                <div className="flex items-center justify-center p-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : snapshots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No deployment builds yet</p>
                  <p className="text-sm">Create your first build to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {snapshots.map((snapshot: any, idx: number) => (
                    <div
                      key={snapshot.version}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${idx === 0 ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'}`}>
                          <Package className={`h-4 w-4 ${idx === 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{snapshot.version}</span>
                            {idx === 0 && (
                              <Badge variant="default">Latest</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            BASE {snapshot.baseVersion} · Custom increment {snapshot.customIncrement}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(snapshot.createdAt), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(snapshot.downloadUrl, '_blank')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Build</DialogTitle>
            <DialogDescription>
              Merge BASE + CUSTOM layers into a new runtime version
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                This will create a new snapshot preserving the current state.
                Previous versions will remain available for rollback.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">BASE Version</label>
              <Select value={baseVersion} onValueChange={setBaseVersion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1.0.0">v1.0.0 (Original)</SelectItem>
                  <SelectItem value="1.1.0">v1.1.0 (Stable)</SelectItem>
                  <SelectItem value="1.2.0">v1.2.0 (Latest)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Foundation/Core version to use as base
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium">
                  {customers.find((c: any) => c.id === selectedCustomer)?.name}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Profile:</span>
                <span className="font-medium capitalize">{selectedProfile}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expected Version:</span>
                <span className="font-medium">
                  {latestSnapshot?.baseVersion === baseVersion
                    ? `${baseVersion}-custom.${(latestSnapshot?.customIncrement || 0) + 1}`
                    : `${baseVersion}-custom.1`}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => mergeMutation.mutate()} disabled={mergeMutation.isPending}>
              {mergeMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <GitMerge className="mr-2 h-4 w-4" />
                  Create Build
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Retention Policy Dialog */}
      <Dialog open={showRetentionDialog} onOpenChange={setShowRetentionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Snapshot Retention Policy</DialogTitle>
            <DialogDescription>
              Configure automatic cleanup of old snapshots to manage storage
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                The retention policy automatically removes old snapshots while preserving
                important versions for rollback. Current policy applies to <strong>{customers.find((c: any) => c.id === selectedCustomer)?.name}</strong>.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Maximum Snapshots</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border rounded-md"
                  value={maxSnapshots}
                  onChange={(e) => setMaxSnapshots(Number(e.target.value))}
                  min={1}
                  max={50}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum total snapshots to keep (default: 10)
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Minimum Snapshots</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border rounded-md"
                  value={minSnapshots}
                  onChange={(e) => setMinSnapshots(Number(e.target.value))}
                  min={1}
                  max={10}
                />
                <p className="text-xs text-muted-foreground">
                  Always keep at least this many (default: 3)
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Maximum Age (Days)</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border rounded-md"
                  value={maxAgeDays}
                  onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                  min={7}
                  max={365}
                />
                <p className="text-xs text-muted-foreground">
                  Delete snapshots older than X days (default: 90)
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Keep Per BASE Version</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border rounded-md"
                  value={keepLatestPerBase}
                  onChange={(e) => setKeepLatestPerBase(Number(e.target.value))}
                  min={1}
                  max={10}
                />
                <p className="text-xs text-muted-foreground">
                  Keep N latest per BASE version (default: 2)
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Current Impact</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-muted-foreground">Total Snapshots:</span>
                  <span className="font-bold">{snapshots.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-muted-foreground">Would Keep:</span>
                  <span className="font-bold text-green-600">
                    ~{Math.min(maxSnapshots, Math.max(minSnapshots, snapshots.length))}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-muted-foreground">Est. Storage:</span>
                  <span className="font-bold">{(snapshots.length * 50).toFixed(0)} MB</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-muted-foreground">After Cleanup:</span>
                  <span className="font-bold text-green-600">
                    {(Math.min(maxSnapshots, snapshots.length) * 50).toFixed(0)} MB
                  </span>
                </div>
              </div>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Policy runs automatically after each build. Deleted snapshots cannot be recovered.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRetentionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast({
                title: "Retention Policy Updated",
                description: `Policy will apply on next build for ${customers.find((c: any) => c.id === selectedCustomer)?.name}`,
              });
              setShowRetentionDialog(false);
            }}>
              <Settings className="mr-2 h-4 w-4" />
              Apply Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
