import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, Download, Trash2, Clock, FileCode, File, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SystemInstanceSelector } from "@/components/SystemInstanceSelector";
import { useAuth } from "@/lib/auth";

interface NoteIteration {
  iteration: number;
  author: string;
  authorRole: "superadmin" | "consultant";
  timestamp: string;
  content: string;
}

interface TestFile {
  id: string;
  filename: string;
  mediaType: string;
  fileSize: number;
  uploadedAt: string;
  notes?: NoteIteration[]; // Visible to consultants & founders, NOT customers
  mlApproved?: boolean;
  mlApprovedBy?: string;
  mlApprovedAt?: string;
  metadata?: {
    description?: string;
  };
}

export default function TestFiles() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [selectedSystemInstance, setSelectedSystemInstance] = useState<string>("default-dev");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<TestFile | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [initialNote, setInitialNote] = useState(""); // For upload dialog
  const [newNote, setNewNote] = useState(""); // For adding iterations

  // Get user role from auth context (production-ready)
  const userRole = user?.role || "customer_user";

  // Fetch test files
  const { data: files, isLoading } = useQuery<{ files: TestFile[] }>({
    queryKey: ["/api/system-instances", selectedSystemInstance, "test-files"],
    queryFn: async () => {
      const response = await fetch(`/api/system-instances/${selectedSystemInstance}/test-files`);
      if (!response.ok) throw new Error("Failed to fetch test files");
      return response.json();
    },
  });

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!fileToUpload) throw new Error("No file selected");

      const formData = new FormData();
      formData.append("file", fileToUpload);
      if (description) formData.append("description", description);
      if (initialNote && (userRole === "superadmin" || userRole === "consultant")) {
        formData.append("initialNote", initialNote);
      }

      const response = await fetch(`/api/system-instances/${selectedSystemInstance}/test-files`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/system-instances", selectedSystemInstance, "test-files"],
      });
      setUploadDialogOpen(false);
      setFileToUpload(null);
      setDescription("");
      setInitialNote("");
      toast({
        title: "File uploaded",
        description: "Test file uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(
        `/api/system-instances/${selectedSystemInstance}/test-files/${fileId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Delete failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/system-instances", selectedSystemInstance, "test-files"],
      });
      toast({
        title: "File deleted",
        description: "Test file deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async ({ fileId, content }: { fileId: string; content: string }) => {
      const response = await fetch(
        `/api/system-instances/${selectedSystemInstance}/test-files/${fileId}/notes`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      if (!response.ok) throw new Error("Failed to add note");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/system-instances", selectedSystemInstance, "test-files"],
      });
      setNotesDialogOpen(false);
      setSelectedFile(null);
      setNewNote("");
      toast({
        title: "Note added",
        description: "Iteration note added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add note",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Approve for ML mutation
  const approveMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(
        `/api/system-instances/${selectedSystemInstance}/test-files/${fileId}/approve`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error("Failed to approve");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/system-instances", selectedSystemInstance, "test-files"],
      });
      toast({
        title: "ML Approved",
        description: "File approved for ML training",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Approval failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDownload = (file: TestFile) => {
    window.open(
      `/api/system-instances/${selectedSystemInstance}/test-files/${file.id}/download`,
      "_blank"
    );
  };

  const handleDelete = (file: TestFile) => {
    if (confirm(`Delete "${file.filename}"?`)) {
      deleteMutation.mutate(file.id);
    }
  };

  const openNotesDialog = (file: TestFile) => {
    setSelectedFile(file);
    setNewNote("");
    setNotesDialogOpen(true);
  };

  const addNote = () => {
    if (selectedFile && newNote.trim()) {
      addNoteMutation.mutate({
        fileId: selectedFile.id,
        content: newNote,
      });
    }
  };

  const approveFile = (fileId: string) => {
    if (confirm("Approve this file for ML training?")) {
      approveMutation.mutate(fileId);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getFileIcon = (mediaType: string) => {
    if (mediaType.includes("xml")) return FileCode;
    if (mediaType.includes("json")) return FileCode;
    if (mediaType.includes("csv")) return FileText;
    return File;
  };

  return (
    <div className="px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Test Files & Payloads</h1>
          <p className="text-sm text-muted-foreground">
            Upload XML, JSON, and CSV files for testing and ML training
          </p>
        </div>
        <SystemInstanceSelector
          value={selectedSystemInstance}
          onValueChange={setSelectedSystemInstance}
        />
      </div>

      {/* Upload Button */}
      <div className="flex justify-end">
        <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-file">
          <Upload className="w-4 h-4 mr-2" />
          Upload File
        </Button>
      </div>

      {/* Files Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Loading files...
          </div>
        ) : files && files.files.length > 0 ? (
          files.files.map((file) => {
            const Icon = getFileIcon(file.mediaType);
            return (
              <Card key={file.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <CardTitle className="text-base truncate" title={file.filename}>
                        {file.filename}
                      </CardTitle>
                    </div>
                  </div>
                  <CardDescription className="flex items-center gap-2 text-xs">
                    <Clock className="w-3 h-3" />
                    {formatDate(file.uploadedAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Size:</span>
                    <Badge variant="outline">{formatFileSize(file.fileSize)}</Badge>
                  </div>

                  {file.metadata?.description && (
                    <div className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
                      {file.metadata.description}
                    </div>
                  )}

                  {/* Founder Notes Indicator (Superadmin Only) */}
                  {userRole === "superadmin" && file.founderNotes && (
                    <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded">
                      <Shield className="w-3 h-3" />
                      <span>Has internal notes</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(file)}
                      className="flex-1"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download
                    </Button>
                    {userRole === "superadmin" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openNotesDialog(file)}
                        title="Edit founder notes"
                      >
                        <Shield className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(file)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="col-span-full text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No test files uploaded yet</p>
            <Button onClick={() => setUploadDialogOpen(true)} className="mt-4">
              Upload Your First File
            </Button>
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Test File</DialogTitle>
            <DialogDescription>
              Upload XML, JSON, or CSV files for testing flows and ML training
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="file-upload">File *</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xml,.json,.csv,.txt"
                onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supported: XML, JSON, CSV (max 10MB)
              </p>
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Sample order payload from SAP"
              />
            </div>

            {/* Founder Notes - Only for Superadmin */}
            {userRole === "superadmin" && (
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-amber-600" />
                  <Label htmlFor="founder-notes" className="text-amber-700 dark:text-amber-400">
                    Founder Notes (.toon format)
                  </Label>
                </div>
                <Textarea
                  id="founder-notes"
                  value={founderNotes}
                  onChange={(e) => setFounderNotes(e.target.value)}
                  placeholder={`Purpose: Training ML model to identify order patterns\nNext Action: Use for edge case testing\nContext: Customer reported issue with nested XML arrays`}
                  rows={6}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  🔒 Internal notes for ML training. Only visible to founders, not consultants or customers.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={!fileToUpload || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Notes Dialog (Superadmin Only) */}
      {userRole === "superadmin" && (
        <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                Founder Notes
              </DialogTitle>
              <DialogDescription>
                Internal notes for ML training and documentation
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selectedFile && (
                <div className="bg-muted p-3 rounded-md text-sm">
                  <strong>{selectedFile.filename}</strong>
                </div>
              )}

              <div>
                <Label htmlFor="edit-notes">Notes (.toon format)</Label>
                <Textarea
                  id="edit-notes"
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  placeholder={`Purpose: Training ML model to identify order patterns\nNext Action: Use for edge case testing\nContext: Customer reported issue with nested XML arrays`}
                  rows={12}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Document payload purpose, next actions, and ML training context
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={saveNotes}
                  disabled={updateNotesMutation.isPending}
                >
                  {updateNotesMutation.isPending ? "Saving..." : "Save Notes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
