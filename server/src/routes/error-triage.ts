import { Router, Request, Response } from "express";
import { db } from "../../db";
import { errorReports, errorComments, errorEscalationTickets } from "../../db";
import { eq, desc, and, or, gte, lte, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

/**
 * GET /api/error-triage
 * List error reports with role-based filtering
 * - Superadmin: Sees all errors
 * - Consultant: Sees errors from assigned customers
 * - Customer Admin/User: Sees only their organization's errors
 */
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;
    const assignedCustomers = req.user?.assignedCustomers || [];
    
    const {
      organizationId,
      flowId,
      triageStatus,
      severity,
      environment,
      executionMode,
      errorType,
      startDate,
      endDate,
      search,
      limit = "100",
      offset = "0",
    } = req.query;

    let query = (db.select() as any).from(errorReports);
    const conditions: any[] = [];

    // Role-based filtering
    if (userRole === "superadmin") {
      // Superadmin can filter by specific org or see all
      if (organizationId) {
        conditions.push(eq(errorReports.organizationId, organizationId as string));
      }
    } else if (userRole === "consultant") {
      // Consultant sees only assigned customers
      if (assignedCustomers.length > 0) {
        conditions.push(
          or(...assignedCustomers.map(orgId => eq(errorReports.organizationId, orgId)))
        );
      } else {
        // No assigned customers = no access
        return res.json({ errors: [], total: 0 });
      }
    } else {
      // Customer Admin/User sees only their org
      conditions.push(eq(errorReports.organizationId, userOrgId || ""));
    }

    // Additional filters
    if (flowId) {
      conditions.push(eq(errorReports.flowId, flowId as string));
    }
    if (triageStatus) {
      conditions.push(eq(errorReports.triageStatus, triageStatus as string));
    }
    if (severity) {
      conditions.push(eq(errorReports.severity, severity as string));
    }
    if (environment) {
      conditions.push(eq(errorReports.environment, environment as string));
    }
    if (executionMode) {
      conditions.push(eq(errorReports.executionMode, executionMode as string));
    }
    if (errorType) {
      conditions.push(eq(errorReports.errorType, errorType as string));
    }
    if (startDate) {
      conditions.push(gte(errorReports.createdAt, startDate as string));
    }
    if (endDate) {
      conditions.push(lte(errorReports.createdAt, endDate as string));
    }
    if (search) {
      conditions.push(
        or(
          like(errorReports.errorMessageSimple, `%${search}%`),
          like(errorReports.flowName, `%${search}%`),
          like(errorReports.nodeName, `%${search}%`)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const errors = await query
      .orderBy(desc(errorReports.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string))
      .all();

    logger.info("Error triage dashboard queried", {
      scope: "customer",
      organizationId: userOrgId,
      userId: req.user?.id,
      filters: { triageStatus, severity, environment },
      resultsCount: errors.length,
    });

    res.json({
      errors,
      total: errors.length,
      filters: {
        triageStatus,
        severity,
        environment,
        executionMode,
        errorType,
      },
    });
  } catch (error: any) {
    logger.error("Error fetching error reports", {
      scope: "customer",
      error: error.message,
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/error-triage/:id
 * Get detailed error report (with full context snapshot)
 */
router.get("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const errorReport = await (db.select() as any)
      .from(errorReports)
      .where(eq(errorReports.id, req.params.id))
      .get();

    if (!errorReport) {
      return res.status(404).json({ error: "Error report not found" });
    }

    // Verify access permissions
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;
    const assignedCustomers = req.user?.assignedCustomers || [];

    if (userRole !== "superadmin") {
      if (userRole === "consultant") {
        // Consultant must have this org in assigned customers
        if (!assignedCustomers.includes(errorReport.organizationId)) {
          return res.status(403).json({ error: "Access denied to this customer" });
        }
      } else {
        // Customer admin/user must match org
        if (errorReport.organizationId !== userOrgId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    }

    // Fetch related comments
    const comments = await (db.select() as any)
      .from(errorComments)
      .where(eq(errorComments.errorReportId, req.params.id))
      .orderBy(desc(errorComments.createdAt))
      .all();

    // Fetch related escalation tickets
    const tickets = await (db.select() as any)
      .from(errorEscalationTickets)
      .where(eq(errorEscalationTickets.errorReportId, req.params.id))
      .all();

    res.json({
      error: errorReport,
      comments,
      tickets,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/error-triage
 * Create new error report (called automatically from flow execution engine)
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      organizationId,
      organizationName,
      flowId,
      flowName,
      flowVersion,
      runId,
      traceId,
      nodeId,
      nodeName,
      nodeType,
      errorType = "unknown",
      errorMessageSimple,
      errorMessageTechnical,
      payloadSnapshot,
      stackTrace,
      nodeConfig,
      environment = "prod",
      executionMode = "production",
      severity = "medium",
      metadata,
    } = req.body;

    if (!organizationId || !flowId || !runId || !nodeId || !errorMessageSimple) {
      return res.status(400).json({
        error: "Missing required fields: organizationId, flowId, runId, nodeId, errorMessageSimple",
      });
    }

    const errorReport = await (db.insert(errorReports) as any).values({
      organizationId,
      organizationName,
      flowId,
      flowName,
      flowVersion,
      runId,
      traceId: traceId || randomUUID(),
      nodeId,
      nodeName,
      nodeType,
      errorType,
      errorMessageSimple,
      errorMessageTechnical: errorMessageTechnical || errorMessageSimple,
      payloadSnapshot,
      stackTrace,
      nodeConfig,
      environment,
      executionMode,
      triageStatus: "new",
      severity,
      metadata,
    }).returning().get();

    logger.error("Production error captured", {
      scope: "customer",
      organizationId,
      flowId,
      flowName,
      runId,
      nodeId,
      errorType,
      severity,
      errorMessage: errorMessageSimple,
    });

    // Silent mode: Do NOT send UI alerts in production
    res.status(201).json({
      success: true,
      errorReportId: errorReport.id,
      message: "Error report created (silent mode)",
    });
  } catch (error: any) {
    logger.error("Failed to create error report", {
      scope: "superadmin",
      error: error.message,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/error-triage/:id
 * Update error triage status (investigate, resolve, assign)
 */
router.patch("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const {
      triageStatus,
      severity,
      assignedTo,
      assignedToEmail,
      resolutionNotes,
    } = req.body;

    const errorReport = await (db.select() as any)
      .from(errorReports)
      .where(eq(errorReports.id, req.params.id))
      .get();

    if (!errorReport) {
      return res.status(404).json({ error: "Error report not found" });
    }

    // Verify permissions (only consultants and admins can update)
    if (req.user?.role === "customer_user") {
      return res.status(403).json({
        error: "Customer Users have read-only access to error dashboard",
      });
    }

    const updateData: any = {};

    if (triageStatus) {
      updateData.triageStatus = triageStatus;
      
      // Auto-populate resolution fields if resolving
      if (triageStatus === "resolved") {
        updateData.resolvedBy = req.user?.id;
        updateData.resolvedByEmail = req.user?.email;
        updateData.resolvedAt = new Date().toISOString();
        if (resolutionNotes) {
          updateData.resolutionNotes = resolutionNotes;
        }
      }
    }

    if (severity) {
      updateData.severity = severity;
    }

    if (assignedTo || assignedToEmail) {
      updateData.assignedTo = assignedTo || req.user?.id;
      updateData.assignedToEmail = assignedToEmail || req.user?.email;
      updateData.assignedAt = new Date().toISOString();
    }

    updateData.updatedAt = new Date().toISOString();

    await (db.update(errorReports) as any)
      .set(updateData)
      .where(eq(errorReports.id, req.params.id))
      .run();

    logger.info("Error report updated", {
      scope: "customer",
      errorReportId: req.params.id,
      updates: updateData,
      updatedBy: req.user?.email,
    });

    res.json({ success: true, updates: updateData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/error-triage/:id/comments
 * Add comment/note to error report
 */
router.post("/:id/comments", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { content, commentType = "general" } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Comment content is required" });
    }

    const comment = await (db.insert(errorComments) as any).values({
      errorReportId: req.params.id,
      content,
      commentType,
      authorId: req.user?.id,
      authorEmail: req.user?.email,
      authorRole: req.user?.role,
    }).returning().get();

    logger.info("Error comment added", {
      scope: "customer",
      errorReportId: req.params.id,
      commentType,
      author: req.user?.email,
    });

    res.status(201).json({ success: true, comment });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/error-triage/:id/escalate
 * Create escalation ticket (pre-filled for external system or email)
 */
router.post("/:id/escalate", authenticateUser, async (req: Request, res: Response) => {
  try {
    // Only consultants and admins can escalate
    if (req.user?.role === "customer_user") {
      return res.status(403).json({
        error: "Customer Users cannot create escalation tickets",
      });
    }

    const errorReport = await (db.select() as any)
      .from(errorReports)
      .where(eq(errorReports.id, req.params.id))
      .get();

    if (!errorReport) {
      return res.status(404).json({ error: "Error report not found" });
    }

    const {
      ticketSystem = "email",
      priority = "medium",
      includeAdvancedContext = true,
    } = req.body;

    // Generate ticket title and description
    const title = `[${errorReport.severity.toUpperCase()}] ${errorReport.flowName} - ${errorReport.errorMessageSimple}`;
    
    let description = `**Error Report**\n\n`;
    description += `**Organization:** ${errorReport.organizationName}\n`;
    description += `**Flow:** ${errorReport.flowName} (v${errorReport.flowVersion})\n`;
    description += `**Environment:** ${errorReport.environment.toUpperCase()}\n`;
    description += `**Execution Mode:** ${errorReport.executionMode}\n`;
    description += `**Failed Node:** ${errorReport.nodeName} (${errorReport.nodeType})\n`;
    description += `**Run ID:** ${errorReport.runId}\n`;
    description += `**Timestamp:** ${errorReport.createdAt}\n\n`;
    description += `**Error Message:**\n${errorReport.errorMessageSimple}\n\n`;

    if (includeAdvancedContext) {
      description += `---

**ADVANCED DEBUG CONTEXT**

`;
      description += `**Technical Error:**
\`\`\`
${errorReport.errorMessageTechnical}
\`\`\`

`;
      
      if (errorReport.payloadSnapshot) {
        description += `**Payload Snapshot:**
\`\`\`json
${JSON.stringify(errorReport.payloadSnapshot, null, 2)}
\`\`\`

`;
      }
      
      if (errorReport.stackTrace) {
        description += `**Stack Trace:**
\`\`\`
${errorReport.stackTrace}
\`\`\`

`;
      }
    }

    const ticket = await (db.insert(errorEscalationTickets) as any).values({
      errorReportId: req.params.id,
      ticketSystem,
      title,
      description,
      priority,
      status: "open",
      createdBy: req.user?.id,
      createdByEmail: req.user?.email,
    }).returning().get();

    // Update error report status to escalated
    await (db.update(errorReports) as any)
      .set({ triageStatus: "escalated" })
      .where(eq(errorReports.id, req.params.id))
      .run();

    // Send email notification via Resend
    try {
      const { resendService } = await import("../notifications/resend-service.js");
      
      // Determine recipients (superadmin or assigned consultant)
      const recipientEmail = req.user?.email || "admin@continuitybridge.com";
      
      await resendService.sendErrorEscalationEmail(recipientEmail, {
        id: ticket.id,
        errorReportId: req.params.id,
        title: ticket.title,
        description: ticket.description,
        priority: ticket.priority,
        organizationName: errorReport.organizationName || "Unknown",
        flowName: errorReport.flowName,
        environment: errorReport.environment,
        errorMessageSimple: errorReport.errorMessageSimple,
        createdBy: req.user?.email || "Unknown",
      });
      
      logger.info("Error escalation email sent", {
        scope: "customer",
        errorReportId: req.params.id,
        ticketId: ticket.id,
        recipient: recipientEmail,
      });
    } catch (emailError: any) {
      logger.warn("Failed to send escalation email (ticket still created)", {
        scope: "customer",
        error: emailError.message,
      });
    }

    logger.warn("Error escalated to ticket", {
      scope: "customer",
      errorReportId: req.params.id,
      ticketId: ticket.id,
      ticketSystem,
      priority,
      createdBy: req.user?.email,
    });

    res.status(201).json({
      success: true,
      ticket: {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        priority: ticket.priority,
      },
      copyToClipboard: {
        title,
        description,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/error-triage/:id/copy-for-email
 * Generate formatted text for copying to email/support ticket
 */
router.get("/:id/copy-for-email", authenticateUser, async (req: Request, res: Response) => {
  try {
    const errorReport = await (db.select() as any)
      .from(errorReports)
      .where(eq(errorReports.id, req.params.id))
      .get();

    if (!errorReport) {
      return res.status(404).json({ error: "Error report not found" });
    }

    const includeAdvanced = req.query.includeAdvanced !== "false";

    let emailText = `Subject: [${errorReport.severity.toUpperCase()}] ${errorReport.flowName} - Error Report\n\n`;
    emailText += `Organization: ${errorReport.organizationName}\n`;
    emailText += `Flow: ${errorReport.flowName} (v${errorReport.flowVersion})\n`;
    emailText += `Environment: ${errorReport.environment.toUpperCase()}\n`;
    emailText += `Failed Node: ${errorReport.nodeName} (${errorReport.nodeType})\n`;
    emailText += `Run ID: ${errorReport.runId}\n`;
    emailText += `Timestamp: ${errorReport.createdAt}\n\n`;
    emailText += `Error Message:\n${errorReport.errorMessageSimple}\n\n`;

    if (includeAdvanced) {
      emailText += `---\nADVANCED DEBUG CONTEXT\n\n`;
      emailText += `Technical Error:\n${errorReport.errorMessageTechnical}\n\n`;
      
      if (errorReport.payloadSnapshot) {
        emailText += `Payload Snapshot:\n${JSON.stringify(errorReport.payloadSnapshot, null, 2)}\n\n`;
      }
      
      if (errorReport.stackTrace) {
        emailText += `Stack Trace:\n${errorReport.stackTrace}\n\n`;
      }
    }

    res.json({
      emailText,
      plainText: emailText,
      htmlText: emailText.replace(/\n/g, "<br>"),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
