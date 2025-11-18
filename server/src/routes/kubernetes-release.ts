/**
 * Kubernetes Release API
 * 
 * Founder UI: One-click K8s package generation
 * POST /api/releases/kubernetes → Download K8s package ZIP
 */

import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { kubernetesGenerator } from "../export/kubernetes-generator.js";
import { logger } from "../core/logger.js";
import archiver from "archiver";

const router = Router();
const log = logger.child("K8sReleaseAPI");

/**
 * POST /api/releases/kubernetes
 * Generate K8s package for customer
 * 🔒 Superadmin only
 */
router.post("/kubernetes", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const {
      organizationId,
      organizationName,
      version = "1.0.0",
      license = {
        licenseType: "professional",
        maxInterfaces: 20,
        maxSystems: 10,
      },
      namespace = `cb-${organizationId}`,
      replicas = 2,
      resources = {
        cpu: "1000m",
        memory: "2Gi",
      },
      storageClass = "standard",
      storageSize = "20Gi",
      domain = `${organizationId}.continuitybridge.com`,
      tlsEnabled = true,
    } = req.body;

    if (!organizationId || !organizationName) {
      return res.status(400).json({
        error: "Missing required fields: organizationId, organizationName",
      });
    }

    log.info("Generating Kubernetes package", {
      organizationId,
      organizationName,
      version,
    });

    // Generate package
    const pkg = await kubernetesGenerator.generatePackage({
      organizationId,
      organizationName,
      version,
      license,
      namespace,
      replicas,
      resources,
      storageClass,
      storageSize,
      domain,
      tlsEnabled,
    });

    // Create ZIP archive
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    // Set response headers
    const filename = `continuitybridge-k8s-${organizationId}-${version}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Pipe archive to response
    archive.pipe(res);

    // Add manifests
    archive.append("# Kubernetes Manifests\n\n", { name: "manifests/README.txt" });
    for (const [filename, content] of Object.entries(pkg.manifests)) {
      archive.append(content, { name: `manifests/${filename}` });
    }

    // Add Helm chart
    for (const [filename, content] of Object.entries(pkg.helm)) {
      archive.append(content, { name: `helm/${filename}` });
    }

    // Add README
    archive.append(pkg.readme, { name: "README.md" });

    // Add install script
    const installScript = `#!/bin/bash
# ContinuityBridge Kubernetes Installation Script

set -e

echo "Installing ContinuityBridge on Kubernetes..."
echo ""

# Check prerequisites
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
fi

if ! command -v helm &> /dev/null; then
    echo "❌ Helm not found. Please install Helm 3 first."
    exit 1
fi

echo "✅ Prerequisites checked"
echo ""

# Install using Helm
echo "Installing with Helm..."
helm install continuitybridge ./helm \\
  --namespace ${namespace} \\
  --create-namespace \\
  --wait

echo ""
echo "✅ Installation complete!"
echo ""
echo "Access your application at: https://${domain}"
echo ""
echo "Useful commands:"
echo "  kubectl get pods -n ${namespace}"
echo "  kubectl logs -n ${namespace} -l app=continuitybridge"
echo "  helm status continuitybridge -n ${namespace}"
echo ""
`;

    archive.append(installScript, { name: "install.sh", mode: 0o755 });

    // Finalize archive
    await archive.finalize();

    log.info("Kubernetes package generated successfully", {
      organizationId,
      filename,
    });
  } catch (error: any) {
    log.error("Failed to generate Kubernetes package", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/releases/kubernetes/templates
 * Get available K8s templates/presets
 */
router.get("/kubernetes/templates", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const templates = [
      {
        id: "small",
        name: "Small (Dev/Test)",
        description: "1 replica, minimal resources",
        config: {
          replicas: 1,
          resources: { cpu: "500m", memory: "1Gi" },
          storageSize: "10Gi",
        },
        price: "$50/month",
      },
      {
        id: "medium",
        name: "Medium (Production)",
        description: "2 replicas, moderate resources",
        config: {
          replicas: 2,
          resources: { cpu: "1000m", memory: "2Gi" },
          storageSize: "20Gi",
        },
        price: "$200/month",
      },
      {
        id: "large",
        name: "Large (Enterprise)",
        description: "3+ replicas, high resources",
        config: {
          replicas: 3,
          resources: { cpu: "2000m", memory: "4Gi" },
          storageSize: "50Gi",
        },
        price: "$500/month",
      },
    ];

    res.json(templates);
  } catch (error: any) {
    log.error("Failed to get K8s templates", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
