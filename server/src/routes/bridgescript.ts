/**
 * BridgeScript API Routes
 * 
 * Endpoints for compiling, validating, and saving BridgeScript flows
 */

import express from "express";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import YAML from "yaml";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { FlowCustomizationValidator } from "../services/flow-customization-validator.js";
import { logger } from "../core/logger.js";

const router = express.Router();
const log = logger.child("BridgeScriptAPI");

/**
 * POST /api/bridgescript/compile
 * Compile BridgeScript TypeScript to YAML and validate
 */
router.post("/compile", authenticateUser, async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }
  
  try {
    log.info("Compiling BridgeScript flow", { userId: req.user?.id });
    
    // Create temporary file
    const tempDir = path.join(process.cwd(), "temp", "bridgescript");
    await fs.mkdir(tempDir, { recursive: true });
    
    const tempId = randomUUID();
    const tempFile = path.join(tempDir, `${tempId}.flow.ts`);
    
    // Write code to temp file
    await fs.writeFile(tempFile, code, "utf-8");
    
    // Compile using tsx
    const yaml = execSync(`npx tsx "${tempFile}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    
    // Parse YAML to FlowDefinition
    const flowDef = YAML.parse(yaml);
    
    // Validate using FlowCustomizationValidator
    const validator = new FlowCustomizationValidator();
    const validationResult = await validator.validateCustomFlow(flowDef);
    
    // Generate validation report
    const report = validator.generateReport(validationResult);
    
    // Cleanup temp file
    await fs.unlink(tempFile).catch(() => {});
    
    log.info("BridgeScript compilation successful", {
      userId: req.user?.id,
      valid: validationResult.valid,
      errors: validationResult.errors.length,
      warnings: validationResult.warnings.length,
    });
    
    res.json({
      success: true,
      yaml,
      validation: validationResult,
      report,
      flowName: flowDef.name,
      flowVersion: flowDef.version,
    });
    
  } catch (error: any) {
    log.error("BridgeScript compilation failed", { 
      error: error.message,
      userId: req.user?.id,
    });
    
    res.status(400).json({
      error: "Compilation failed",
      message: error.stderr || error.message,
    });
  }
});

/**
 * POST /api/bridgescript/save
 * Save compiled flow to database
 */
router.post("/save", authenticateUser, async (req, res) => {
  const { flowName, code, yaml, organizationId } = req.body;
  
  if (!flowName || !code || !yaml) {
    return res.status(400).json({ error: "flowName, code, and yaml are required" });
  }
  
  try {
    const flowDef = YAML.parse(yaml);
    
    // Save to flows directory
    const flowsDir = path.join(
      process.cwd(),
      "flows",
      "custom",
      organizationId || req.user?.organizationId || "default"
    );
    
    await fs.mkdir(flowsDir, { recursive: true });
    
    // Save TypeScript source
    const tsFile = path.join(flowsDir, `${flowName}.flow.ts`);
    await fs.writeFile(tsFile, code, "utf-8");
    
    // Save compiled YAML
    const yamlFile = path.join(flowsDir, `${flowName}.yaml`);
    await fs.writeFile(yamlFile, yaml, "utf-8");
    
    log.info("BridgeScript flow saved", {
      flowName,
      organizationId: organizationId || req.user?.organizationId,
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      message: `Flow "${flowName}" saved successfully`,
      paths: {
        typescript: tsFile,
        yaml: yamlFile,
      },
    });
    
  } catch (error: any) {
    log.error("Failed to save BridgeScript flow", {
      error: error.message,
      userId: req.user?.id,
    });
    
    res.status(500).json({
      error: "Save failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/bridgescript/templates
 * List available flow templates
 */
router.get("/templates", authenticateUser, async (req, res) => {
  try {
    const templatesDir = path.join(process.cwd(), "flows", "examples");
    
    const files = await fs.readdir(templatesDir);
    const templates = files
      .filter(f => f.endsWith(".flow.ts"))
      .map(f => ({
        name: f.replace(".flow.ts", ""),
        filename: f,
      }));
    
    res.json({ templates });
    
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bridgescript/template/:name
 * Load a specific template
 */
router.get("/template/:name", authenticateUser, async (req, res) => {
  const { name } = req.params;
  
  try {
    const templatePath = path.join(
      process.cwd(),
      "flows",
      "examples",
      `${name}.flow.ts`
    );
    
    const code = await fs.readFile(templatePath, "utf-8");
    
    res.json({ code, name });
    
  } catch (error: any) {
    res.status(404).json({ error: "Template not found" });
  }
});

export default router;
