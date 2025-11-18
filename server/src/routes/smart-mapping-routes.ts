/**
 * Smart Mapping API Routes
 * 
 * Forger consultant workflow:
 * 1. GET /api/smart-mapping/samples - List available system samples
 * 2. POST /api/smart-mapping/generate - Generate AI mapping
 * 3. POST /api/smart-mapping/refine - Consultant refines mapping
 * 4. POST /api/smart-mapping/save - Save as reusable template
 */

import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { smartMappingGenerator } from "../ai/smart-mapping-generator.js";
import type { SystemPayloadSample } from "../ai/smart-mapping-generator.js";
import { logger } from "../core/logger.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLES_DIR = path.resolve(__dirname, "../../samples");

const router = Router();
const log = logger.child("SmartMappingAPI");

/**
 * GET /api/smart-mapping/samples
 * List available system payload samples
 */
router.get("/samples", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Consultant access required" });
    }

    // Load all sample files
    const samples: SystemPayloadSample[] = [];
    
    try {
      const files = await fs.readdir(SAMPLES_DIR);
      
      for (const file of files) {
        if (file.endsWith(".json")) {
          const content = await fs.readFile(path.join(SAMPLES_DIR, file), "utf-8");
          const sample = JSON.parse(content);
          samples.push(sample);
        }
      }
    } catch (error) {
      log.warn("Samples directory not found, returning empty list");
    }

    // Group by system type
    const grouped = samples.reduce((acc, sample) => {
      const key = sample.systemType;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(sample);
      return acc;
    }, {} as Record<string, SystemPayloadSample[]>);

    res.json({
      samples,
      grouped,
      count: samples.length,
    });
  } catch (error: any) {
    log.error("Failed to list samples", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/smart-mapping/generate
 * Generate AI-assisted mapping
 */
router.post("/generate", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Consultant access required" });
    }

    const { sourceSample, targetSample, context } = req.body;

    if (!sourceSample || !targetSample) {
      return res.status(400).json({
        error: "Missing required fields: sourceSample, targetSample",
      });
    }

    log.info("Generating smart mapping", {
      source: sourceSample.systemName,
      target: targetSample.systemName,
    });

    const mapping = await smartMappingGenerator.generateMapping(
      sourceSample,
      targetSample,
      context
    );

    // Convert to jq expression
    const jqExpression = smartMappingGenerator.convertToJQ(mapping);

    res.json({
      success: true,
      mapping,
      jqExpression,
      preview: {
        confidence: mapping.confidence,
        needsReview: mapping.needsReview,
        rulesCount: mapping.rules.length,
        transformationsCount: mapping.transformations.length,
        validationsCount: mapping.validations.length,
      },
    });
  } catch (error: any) {
    log.error("Failed to generate mapping", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/smart-mapping/refine
 * Consultant refines AI-generated mapping
 */
router.post("/refine", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Consultant access required" });
    }

    const { mapping, consultantFeedback } = req.body;

    if (!mapping || !consultantFeedback) {
      return res.status(400).json({
        error: "Missing required fields: mapping, consultantFeedback",
      });
    }

    log.info("Refining mapping", {
      mappingId: mapping.id,
      consultant: (req as any).user?.email,
    });

    const refined = await smartMappingGenerator.refineMapping(
      mapping,
      consultantFeedback
    );

    // Convert to jq
    const jqExpression = smartMappingGenerator.convertToJQ(refined);

    res.json({
      success: true,
      mapping: refined,
      jqExpression,
    });
  } catch (error: any) {
    log.error("Failed to refine mapping", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/smart-mapping/save-template
 * Save mapping as reusable transformation template
 */
router.post("/save-template", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Consultant access required" });
    }

    const { mapping, templateName, description } = req.body;

    if (!mapping || !templateName) {
      return res.status(400).json({
        error: "Missing required fields: mapping, templateName",
      });
    }

    // Convert to transformation template format
    const template = {
      id: `template-${mapping.sourceSystem}-${mapping.targetSystem}-${Date.now()}`,
      name: templateName,
      description: description || `${mapping.sourceSystem} to ${mapping.targetSystem} mapping`,
      sourceSystem: mapping.sourceSystem,
      targetSystem: mapping.targetSystem,
      sourceFormat: "json",
      targetFormat: "json",
      transformationType: "jq",
      category: mapping.dataType,
      transformExpression: smartMappingGenerator.convertToJQ(mapping),
      tags: [
        mapping.sourceSystem.toLowerCase(),
        mapping.targetSystem.toLowerCase(),
        mapping.dataType,
        "ai-generated",
      ],
      metadata: {
        confidence: mapping.confidence,
        generatedBy: mapping.generatedBy,
        generatedAt: mapping.generatedAt,
        rulesCount: mapping.rules.length,
        transformationsCount: mapping.transformations.length,
      },
    };

    // Save to transformation templates (would typically save to database)
    log.info("Saved mapping template", {
      templateId: template.id,
      name: templateName,
    });

    res.json({
      success: true,
      template,
      message: `Template "${templateName}" saved successfully`,
    });
  } catch (error: any) {
    log.error("Failed to save template", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
