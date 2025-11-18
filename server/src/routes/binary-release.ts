/**
 * Binary Release API
 * 
 * Founder UI: Generate customer-specific binaries
 * POST /api/releases/binary → Download standalone executable
 */

import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import archiver from "archiver";

const router = Router();
const log = logger.child("BinaryReleaseAPI");
const execAsync = promisify(exec);

/**
 * POST /api/releases/binary
 * Generate customer-specific binary
 * 🔒 Superadmin only
 */
router.post("/binary", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const {
      organizationId,
      organizationName,
      licenseType = "professional",
      platforms = ["linux", "windows"], // linux, windows, macos
      version = "1.0.0",
    } = req.body;

    if (!organizationId || !organizationName) {
      return res.status(400).json({
        error: "Missing required fields: organizationId, organizationName",
      });
    }

    log.info("Generating binary release", {
      organizationId,
      organizationName,
      platforms,
    });

    // Map platform names to pkg targets
    const pkgPlatforms = platforms.map((p: string) => {
      switch (p.toLowerCase()) {
        case "windows":
          return "node20-win-x64";
        case "linux":
          return "node20-linux-x64";
        case "macos":
          return "node20-macos-x64";
        default:
          return "node20-linux-x64";
      }
    });

    // Build binaries
    const buildCommand = `node scripts/build-binary.js --org ${organizationId} --license ${licenseType} --platforms ${pkgPlatforms.join(",")}`;
    
    log.info("Executing build command", { buildCommand });
    
    try {
      const { stdout, stderr } = await execAsync(buildCommand, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      
      if (stderr) {
        log.warn("Build stderr", { stderr });
      }
      
      log.info("Build completed", { stdout });
    } catch (error: any) {
      log.error("Build failed", error);
      return res.status(500).json({
        error: "Binary build failed",
        details: error.message,
      });
    }

    // Create deployment package
    const binariesDir = path.join(process.cwd(), "dist", "binaries");
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    // Set response headers
    const filename = `continuitybridge-binary-${organizationId}-${version}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Pipe archive to response
    archive.pipe(res);

    // Add binaries
    const files = await fs.readdir(binariesDir);
    for (const file of files) {
      if (file.includes(organizationId)) {
        const filePath = path.join(binariesDir, file);
        archive.file(filePath, { name: `bin/${file}` });
      }
    }

    // Add .env template
    const envTemplate = `# ContinuityBridge Configuration
# Organization: ${organizationName}

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/continuitybridge

# Server
PORT=5000
NODE_ENV=production

# License (embedded in binary)
ORGANIZATION_ID=${organizationId}
LICENSE_TYPE=${licenseType}

# Optional: Valkey
VALKEY_ENABLED=false
# VALKEY_URL=valkey://localhost:6379

# Optional: Email
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=notifications@example.com
# SMTP_PASS=your-password
`;

    archive.append(envTemplate, { name: ".env.example" });

    // Add README
    const readme = `# ContinuityBridge Binary Deployment

Organization: ${organizationName}
Version: ${version}
License: ${licenseType}

## Installation

### Linux/macOS

1. Extract package:
   \`\`\`bash
   unzip continuitybridge-binary-${organizationId}-${version}.zip
   cd continuitybridge-binary-${organizationId}-${version}
   \`\`\`

2. Make binary executable:
   \`\`\`bash
   chmod +x bin/continuitybridge-${organizationId}-linux-x64
   \`\`\`

3. Configure environment:
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your database credentials
   \`\`\`

4. Run:
   \`\`\`bash
   ./bin/continuitybridge-${organizationId}-linux-x64
   \`\`\`

### Windows

1. Extract package

2. Configure environment:
   - Copy \`.env.example\` to \`.env\`
   - Edit with your database credentials

3. Run:
   \`\`\`
   bin\\continuitybridge-${organizationId}-win-x64.exe
   \`\`\`

## Requirements

- PostgreSQL 14+ database
- (Optional) Valkey/Redis for caching

## Access

Application will be available at: http://localhost:5000

## Support

Contact: support@continuitybridge.com
`;

    archive.append(readme, { name: "README.txt" });

    // Finalize
    await archive.finalize();

    log.info("Binary package generated successfully", {
      organizationId,
      filename,
    });
  } catch (error: any) {
    log.error("Failed to generate binary package", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/releases/binary/platforms
 * Get available platforms for binary builds
 */
router.get("/binary/platforms", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const platforms = [
      {
        id: "windows",
        name: "Windows",
        arch: "x64",
        extension: ".exe",
        size: "~80MB",
      },
      {
        id: "linux",
        name: "Linux",
        arch: "x64",
        extension: "",
        size: "~80MB",
      },
      {
        id: "macos",
        name: "macOS",
        arch: "x64",
        extension: "",
        size: "~80MB",
      },
    ];

    res.json(platforms);
  } catch (error: any) {
    log.error("Failed to get platforms", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
