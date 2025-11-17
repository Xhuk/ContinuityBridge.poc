import { Router, type Request, Response } from "express";
import { db } from "../../db.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticateUser, requireRole } from "../auth/rbac-middleware.js";

const router = Router();

// Projects schema (stored in a table)
interface Project {
  id: string;
  organizationId: string;
  organizationName: string;
  projectGoal: string;
  description: string;
  stages: ProjectStage[];
  assignedConsultants: string[];
  status: "planning" | "in_progress" | "completed" | "on_hold";
  createdBy: string;
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

/**
 * GET /api/admin/projects
 * List all projects (SuperAdmin only)
 */
router.get("/", authenticateUser, requireRole("superadmin"), async (req: Request, res: Response) => {
  try {
    // Fetch projects from integration_notes or create dedicated projects table
    // For now, using a custom table approach
    const projects: Project[] = []; // TODO: Implement actual DB fetch
    
    res.json(projects);
  } catch (error: any) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/projects
 * Create new project (SuperAdmin only)
 */
router.post("/", authenticateUser, requireRole("superadmin"), async (req: Request, res: Response) => {
  try {
    const {
      organizationName,
      projectGoal,
      description,
      stages,
      assignedConsultants,
      status = "planning",
    } = req.body;

    if (!organizationName || !projectGoal) {
      return res.status(400).json({ error: "Organization name and project goal are required" });
    }

    const organizationId = organizationName.toLowerCase().replace(/\s+/g, "-");
    
    const project: Project = {
      id: randomUUID(),
      organizationId,
      organizationName,
      projectGoal,
      description,
      stages: stages || [
        { id: "dev", name: "Development", environment: "dev", status: "not_started" },
        { id: "test", name: "Testing", environment: "test", status: "not_started" },
        { id: "staging", name: "Staging/UAT", environment: "staging", status: "not_started" },
        { id: "prod", name: "Production", environment: "prod", status: "not_started" },
      ],
      assignedConsultants: assignedConsultants || [],
      status,
      createdBy: req.user!.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // TODO: Store in database
    // For MVP, we'll store in memory or use existing tables
    
    // Send notification to assigned consultants
    if (project.assignedConsultants.length > 0) {
      // TODO: Implement notification system
      console.log(`[Projects] Notifying consultants:`, project.assignedConsultants);
    }

    res.json(project);
  } catch (error: any) {
    console.error("Error creating project:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/projects/:id
 * Update project (SuperAdmin only)
 */
router.put("/:id", authenticateUser, requireRole("superadmin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // TODO: Update in database
    const updatedProject = {
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    };

    // Notify consultants if newly assigned
    if (updates.assignedConsultants) {
      console.log(`[Projects] Notifying newly assigned consultants for project ${id}`);
    }

    res.json(updatedProject);
  } catch (error: any) {
    console.error("Error updating project:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/projects/:id
 * Delete project (SuperAdmin only)
 */
router.delete("/:id", authenticateUser, requireRole("superadmin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // TODO: Delete from database
    console.log(`[Projects] Deleting project ${id}`);

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/consultants
 * List all consultants (SuperAdmin only)
 */
router.get("/consultants", authenticateUser, requireRole("superadmin"), async (req: Request, res: Response) => {
  try {
    // Fetch users with role 'consultant'
    const consultants = await (db as any)
      .select({
        id: (db as any).users.id,
        email: (db as any).users.email,
      })
      .from((db as any).users)
      .where(eq((db as any).users.role, "consultant"))
      .all();

    res.json(consultants);
  } catch (error: any) {
    console.error("Error fetching consultants:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
