import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Target, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  organizationId: string;
  organizationName: string;
  projectGoal: string;
  description: string;
  stages: ProjectStage[];
  assignedConsultants: string[];
  status: "planning" | "in_progress" | "completed" | "on_hold";
  createdAt: string;
  updatedAt: string;
}

interface ProjectStage {
  id: string;
  name: string;
  environment: "dev" | "test" | "staging" | "prod";
  status: "not_started" | "in_progress" | "completed" | "blocked";
  startDate?: string;
  completionDate?: string;
  notes?: string;
}

export default function Projects() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const { data: consultants } = useQuery<{ id: string; email: string }[]>({
    queryKey: ["/api/admin/consultants"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const response = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setIsCreateOpen(false);
      toast({ title: "Project created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error creating project", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Project> }) => {
      const response = await fetch(`/api/admin/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setEditingProject(null);
      toast({ title: "Project updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/projects/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      toast({ title: "Project deleted successfully" });
    },
  });

  const ProjectForm = ({ project, onSave }: { project?: Project; onSave: (data: Partial<Project>) => void }) => {
    const [formData, setFormData] = useState<Partial<Project>>(
      project || {
        organizationName: "",
        projectGoal: "",
        description: "",
        status: "planning",
        stages: [
          { id: "dev", name: "Development", environment: "dev", status: "not_started" },
          { id: "test", name: "Testing", environment: "test", status: "not_started" },
          { id: "staging", name: "Staging/UAT", environment: "staging", status: "not_started" },
          { id: "prod", name: "Production", environment: "prod", status: "not_started" },
        ],
        assignedConsultants: [],
      }
    );

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="orgName">Organization Name</Label>
          <Input
            id="orgName"
            value={formData.organizationName || ""}
            onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
            placeholder="e.g., ACME Corporation"
          />
        </div>

        <div>
          <Label htmlFor="goal">Project Goal</Label>
          <Input
            id="goal"
            value={formData.projectGoal || ""}
            onChange={(e) => setFormData({ ...formData, projectGoal: e.target.value })}
            placeholder="e.g., ERP to WMS Integration"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Detailed project description..."
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value: any) => setFormData({ ...formData, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Assigned Consultants</Label>
          <div className="space-y-2 mt-2">
            {consultants?.map((consultant) => (
              <label key={consultant.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.assignedConsultants?.includes(consultant.id)}
                  onChange={(e) => {
                    const current = formData.assignedConsultants || [];
                    setFormData({
                      ...formData,
                      assignedConsultants: e.target.checked
                        ? [...current, consultant.id]
                        : current.filter((id) => id !== consultant.id),
                    });
                  }}
                />
                <span className="text-sm">{consultant.email}</span>
              </label>
            ))}
          </div>
        </div>

        <Button onClick={() => onSave(formData)} className="w-full">
          {project ? "Update" : "Create"} Project
        </Button>
      </div>
    );
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Project Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage customer projects, goals, and deployment stages
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Set up a new customer project with stages and consultants
              </DialogDescription>
            </DialogHeader>
            <ProjectForm onSave={(data) => createMutation.mutate(data)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {projects?.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    {project.organizationName}
                    <Badge
                      variant={
                        project.status === "completed"
                          ? "default"
                          : project.status === "in_progress"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {project.status.replace("_", " ")}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    {project.projectGoal}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingProject(project)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this project?")) {
                        deleteMutation.mutate(project.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{project.description}</p>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4" />
                  <span className="font-medium">Stages:</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {project.stages.map((stage) => (
                    <Card key={stage.id} className="p-3">
                      <div className="text-sm font-medium">{stage.name}</div>
                      <Badge
                        variant={stage.status === "completed" ? "default" : "outline"}
                        className="mt-2 text-xs"
                      >
                        {stage.status.replace("_", " ")}
                      </Badge>
                    </Card>
                  ))}
                </div>
              </div>

              {project.assignedConsultants && project.assignedConsultants.length > 0 && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4" />
                  <span className="font-medium">Consultants:</span>
                  <span className="text-muted-foreground">
                    {project.assignedConsultants.length} assigned
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {editingProject && (
        <Dialog open={!!editingProject} onOpenChange={() => setEditingProject(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
              <DialogDescription>Update project details and stages</DialogDescription>
            </DialogHeader>
            <ProjectForm
              project={editingProject}
              onSave={(data) => updateMutation.mutate({ id: editingProject.id, data })}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
