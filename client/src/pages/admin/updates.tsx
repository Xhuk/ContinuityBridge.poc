import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  Package, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertCircle,
  Rocket,
  FileText
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function UpdatesManagement() {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Fetch uploaded packages (per organization)
  const { data: packages, isLoading } = useQuery({
    queryKey: ["/api/updates/packages"],
    queryFn: async () => {
      const res = await fetch("/api/updates/packages");
      if (!res.ok) throw new Error("Failed to load packages");
      return res.json();
    },
  });
  
  // Upload package mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("package", file);
      
      const res = await fetch("/api/updates/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Upload failed");
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "✅ Package Uploaded",
        description: "Update package verified and ready to install",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/updates/packages"] });
      setSelectedFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Install package mutation
  const installMutation = useMutation({
    mutationFn: async ({ packageId, version }: { packageId: string; version: string }) => {
      const res = await fetch(`/api/updates/install/${packageId}/${version}`, {
        method: "POST",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Installation failed");
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Package Installed",
        description: `Installed ${data.installed?.length} files successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/updates/packages"] });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Installation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".cbupdate")) {
        toast({
          title: "Invalid File",
          description: "Only .cbupdate files are accepted",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };
  
  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };
  
  const handleInstall = (packageId: string, version: string) => {
    if (confirm(`Install update package ${packageId} v${version}?\n\nThis will apply updates to the current organization.`)) {
      installMutation.mutate({ packageId, version });
    }
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Offline Updates Manager</h1>
        <p className="text-muted-foreground mt-2">
          Manage signed update packages for air-gapped customer deployments
        </p>
      </div>
      
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">
            <Upload className="w-4 h-4 mr-2" />
            Upload Package
          </TabsTrigger>
          <TabsTrigger value="packages">
            <Package className="w-4 h-4 mr-2" />
            Installed Packages ({packages?.count || 0})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Signed Update Package</CardTitle>
              <CardDescription>
                Upload a .cbupdate file created by the Forge platform. 
                Package must be signed with valid RSA signature.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-muted rounded-lg p-8">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <Upload className="w-12 h-12 text-muted-foreground" />
                  
                  <div className="text-center">
                    <Label htmlFor="package-file" className="cursor-pointer">
                      <div className="text-sm font-medium">
                        {selectedFile ? (
                          <div className="space-y-2">
                            <p className="text-primary">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        ) : (
                          <>
                            <p>Click to select .cbupdate file</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Max size: 100MB
                            </p>
                          </>
                        )}
                      </div>
                    </Label>
                    
                    <Input
                      id="package-file"
                      type="file"
                      accept=".cbupdate"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                  
                  {selectedFile && (
                    <div className="flex gap-2">
                      <Button
                        onClick={handleUpload}
                        disabled={uploadMutation.isPending}
                      >
                        {uploadMutation.isPending ? (
                          <>
                            <Clock className="w-4 h-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Rocket className="w-4 h-4 mr-2" />
                            Upload & Verify
                          </>
                        )}
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => setSelectedFile(null)}
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm space-y-2">
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      Security Verification
                    </p>
                    <ul className="text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                      <li>RSA signature validation (Founder's public key)</li>
                      <li>SHA-256 checksum verification for all files</li>
                      <li>Version compatibility check</li>
                      <li>Organization isolation (packages scoped per customer)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="packages" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading packages...</p>
              </CardContent>
            </Card>
          ) : packages?.packages?.length > 0 ? (
            <div className="grid gap-4">
              {packages.packages.map((pkg: any) => (
                <Card key={`${pkg.packageId}-${pkg.version}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Package className="w-5 h-5" />
                          {pkg.packageId}
                          <Badge variant="outline">{pkg.version}</Badge>
                        </CardTitle>
                        <CardDescription className="mt-2">
                          Uploaded: {new Date(pkg.uploadedAt).toLocaleString()}
                        </CardDescription>
                      </div>
                      
                      <div className="flex gap-2">
                        {pkg.installed ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Installed
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleInstall(pkg.packageId, pkg.version)}
                            disabled={installMutation.isPending}
                          >
                            <Rocket className="w-4 h-4 mr-2" />
                            Install Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No packages uploaded yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Upload a .cbupdate package to get started
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
