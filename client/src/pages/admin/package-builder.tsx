import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Package, 
  Download, 
  Building2,
  FileCode,
  Workflow,
  Settings,
  Lock,
  CheckCircle2
} from "lucide-react";

interface PackageFile {
  id: string;
  name: string;
  type: "interface" | "flow" | "node" | "config";
  version: string;
  selected: boolean;
}

export default function PackageBuilder() {
  const { toast } = useToast();
  
  // Step 1: Select Target Organization
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  
  // Step 2: Package Metadata
  const [packageId, setPackageId] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [updateType, setUpdateType] = useState<"patch" | "minor" | "major">("patch");
  const [description, setDescription] = useState("");
  const [changelog, setChangelog] = useState("");
  
  // Step 3: File Selection
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  
  // Fetch organizations (customers)
  const { data: organizations } = useQuery({
    queryKey: ["/api/founder/organizations"],
    queryFn: async () => {
      const res = await fetch("/api/founder/organizations");
      if (!res.ok) throw new Error("Failed to load organizations");
      return res.json();
    },
  });
  
  // Fetch available resources for selected org
  const { data: availableResources } = useQuery({
    queryKey: ["/api/package/available-resources", selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return { flows: [], interfaces: [], nodes: [] };
      
      const res = await fetch(`/api/package/available-resources?organizationId=${selectedOrg}`);
      if (!res.ok) throw new Error("Failed to load resources");
      return res.json();
    },
    enabled: !!selectedOrg,
  });
  
  // Build package mutation
  const buildPackageMutation = useMutation({
    mutationFn: async (packageData: any) => {
      const res = await fetch("/api/package/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packageData),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to build package");
      }
      
      // Return blob for download
      const blob = await res.blob();
      return { blob, filename: `${packageId}-${version}.cbupdate` };
    },
    onSuccess: ({ blob, filename }) => {
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "✅ Package Built Successfully",
        description: `${filename} is ready for deployment`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Build Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleFileToggle = (fileId: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };
  
  const handleBuildPackage = () => {
    if (!selectedOrg) {
      toast({ title: "Error", description: "Select target organization", variant: "destructive" });
      return;
    }
    
    if (!packageId || !version) {
      toast({ title: "Error", description: "Enter package ID and version", variant: "destructive" });
      return;
    }
    
    if (selectedFiles.size === 0) {
      toast({ title: "Error", description: "Select at least one file to include", variant: "destructive" });
      return;
    }
    
    buildPackageMutation.mutate({
      organizationId: selectedOrg,
      packageId,
      version,
      updateType,
      description,
      changelog: changelog.split("\n").filter(Boolean),
      fileIds: Array.from(selectedFiles),
    });
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Package Builder</h1>
        <p className="text-muted-foreground mt-2">
          Create signed .cbupdate packages for customer deployments
        </p>
      </div>
      
      {/* Step 1: Select Organization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Step 1: Select Target Organization
          </CardTitle>
          <CardDescription>
            Choose which customer will receive this update
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Target Organization</Label>
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations?.organizations?.map((org: any) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name} ({org.organizationId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedOrg && (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    Organization Selected
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {selectedOrg && (
        <>
          {/* Step 2: Package Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Step 2: Package Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Package ID</Label>
                  <Input
                    placeholder="e.g., sap-interface-update"
                    value={packageId}
                    onChange={(e) => setPackageId(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label>Version</Label>
                  <Input
                    placeholder="e.g., 1.2.3"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  />
                </div>
              </div>
              
              <div>
                <Label>Update Type</Label>
                <Select value={updateType} onValueChange={(v: any) => setUpdateType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patch">Patch (Bug Fix)</SelectItem>
                    <SelectItem value="minor">Minor (New Feature)</SelectItem>
                    <SelectItem value="major">Major (Breaking Change)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="Brief description of what this package contains..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              
              <div>
                <Label>Changelog (one item per line)</Label>
                <Textarea
                  placeholder="- Fixed SAP connection timeout&#10;- Added retry logic&#10;- Updated error handling"
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Step 3: File Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5" />
                Step 3: Select Files to Include
              </CardTitle>
              <CardDescription>
                Choose which resources to package for deployment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Flows */}
              {availableResources?.flows?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Workflow className="w-4 h-4" />
                    <h3 className="font-medium">Flows</h3>
                    <Badge variant="outline">{availableResources.flows.length}</Badge>
                  </div>
                  
                  <div className="space-y-2 ml-6">
                    {availableResources.flows.map((flow: any) => (
                      <div key={flow.id} className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedFiles.has(flow.id)}
                          onCheckedChange={() => handleFileToggle(flow.id)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{flow.name}</p>
                          <p className="text-xs text-muted-foreground">{flow.description}</p>
                        </div>
                        <Badge variant="secondary">{flow.version}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <Separator />
              
              {/* Interfaces */}
              {availableResources?.interfaces?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4" />
                    <h3 className="font-medium">Interfaces</h3>
                    <Badge variant="outline">{availableResources.interfaces.length}</Badge>
                  </div>
                  
                  <div className="space-y-2 ml-6">
                    {availableResources.interfaces.map((iface: any) => (
                      <div key={iface.id} className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedFiles.has(iface.id)}
                          onCheckedChange={() => handleFileToggle(iface.id)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{iface.name}</p>
                          <p className="text-xs text-muted-foreground">{iface.protocol}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedFiles.size > 0 && (
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mt-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>{selectedFiles.size}</strong> file(s) selected for packaging
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Step 4: Build & Sign */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Step 4: Build & Sign Package
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-900 dark:text-yellow-100">
                  <strong>Security:</strong> Package will be signed with Founder's private RSA key.
                  Only systems with the matching public key can install this package.
                </p>
              </div>
              
              <Button
                onClick={handleBuildPackage}
                disabled={buildPackageMutation.isPending || !selectedOrg || !packageId}
                className="w-full"
                size="lg"
              >
                {buildPackageMutation.isPending ? (
                  <>Building & Signing...</>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Build & Download .cbupdate Package
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
