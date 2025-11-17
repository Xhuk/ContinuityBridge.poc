import { Router } from "express";
import { authenticateUser, requireSuperAdmin } from "../auth/rbac-middleware";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const router = Router();

interface WikiPage {
  title: string;
  filename: string;
  content: string;
  tags: string[];
  category: "operational" | "strategic" | "technical" | "business" | "customer";
  accessLevel: "founder" | "consultant" | "customer" | "all";
}

/**
 * Get all wiki pages based on user role
 * - Founders (superadmin): See all documentation (full version)
 * - Consultants: See only operational information
 * - Customer Admins/Users: See only customer-facing manuals and basic guides
 * 
 * PRODUCTION MODE: Only customer-level content is available (self-contained deployment)
 */
router.get("/pages", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const isProduction = process.env.NODE_ENV === "production";
    const isCustomerDeployment = process.env.DEPLOYMENT_TYPE === "customer";

    // All authenticated users can access wiki (filtered by role)
    if (!userRole) {
      return res.status(403).json({ error: "Authentication required" });
    }

    const wikiPath = join(process.cwd(), "wiki");
    
    if (!existsSync(wikiPath)) {
      return res.json({ pages: [] });
    }

    const files = readdirSync(wikiPath).filter(f => f.endsWith('.md'));
    const pages: WikiPage[] = [];

    for (const file of files) {
      const filePath = join(wikiPath, file);
      const content = readFileSync(filePath, 'utf-8');
      
      // Parse metadata from markdown
      const page = parseWikiPage(file, content);
      
      // PRODUCTION CUSTOMER DEPLOYMENT: Only show customer-level content
      if (isProduction && isCustomerDeployment) {
        if (page.accessLevel === "customer" || page.category === "customer") {
          pages.push(page);
        }
        continue; // Skip role-based filtering for customer deployments
      }
      
      // Filter based on role (for platform/dev deployments)
      if (userRole === "superadmin") {
        // Founders see everything
        pages.push(page);
      } else if (userRole === "consultant") {
        // Consultants see operational content
        if (page.accessLevel === "all" || page.accessLevel === "consultant" || page.accessLevel === "customer" || page.category === "operational" || page.category === "customer") {
          pages.push(page);
        }
      } else if (userRole === "customer_admin" || userRole === "customer_user") {
        // Customers only see customer-facing manuals and guides
        if (page.accessLevel === "all" || page.accessLevel === "customer" || page.category === "customer") {
          pages.push(page);
        }
      }
    }

    res.json({
      pages,
      userRole,
      totalPages: pages.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get specific wiki page by filename
 * 
 * PRODUCTION MODE: Only customer-level content accessible in customer deployments
 */
router.get("/pages/:filename", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const { filename } = req.params;
    const isProduction = process.env.NODE_ENV === "production";
    const isCustomerDeployment = process.env.DEPLOYMENT_TYPE === "customer";

    if (!userRole) {
      return res.status(403).json({ error: "Authentication required" });
    }

    const wikiPath = join(process.cwd(), "wiki");
    const filePath = join(wikiPath, filename);

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "Wiki page not found" });
    }

    const content = readFileSync(filePath, 'utf-8');
    const page = parseWikiPage(filename, content);

    // PRODUCTION CUSTOMER DEPLOYMENT: Only allow customer-level content
    if (isProduction && isCustomerDeployment) {
      if (page.accessLevel !== "customer" && page.category !== "customer") {
        return res.status(404).json({ error: "Wiki page not found" });
      }
      // Allow access for all authenticated users in customer deployment
      return res.json({ page });
    }

    // Check access level (for platform/dev deployments)
    if (userRole === "consultant") {
      if (page.accessLevel === "founder") {
        return res.status(403).json({ error: "This page is restricted to founders only" });
      }
      if (page.category === "strategic" || page.category === "business") {
        if (page.accessLevel !== "consultant" && page.accessLevel !== "all" && page.accessLevel !== "customer") {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    } else if (userRole === "customer_admin" || userRole === "customer_user") {
      // Customers can only access customer-level content
      if (page.accessLevel === "founder" || page.accessLevel === "consultant") {
        return res.status(403).json({ error: "This page is restricted to internal teams only" });
      }
      if (page.category === "strategic" || page.category === "business" || page.category === "operational") {
        if (page.accessLevel !== "customer" && page.accessLevel !== "all") {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    }

    res.json({ page });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sync wiki from GitHub (superadmin only)
 */
router.post("/sync", requireSuperAdmin, async (req, res) => {
  try {
    const { execSync } = await import("child_process");
    const wikiPath = join(process.cwd(), "wiki");

    if (!existsSync(join(wikiPath, ".git"))) {
      return res.status(400).json({ 
        error: "Wiki git repository not initialized. Run: npm run wiki:export first" 
      });
    }

    // Pull latest from GitHub
    const output = execSync("git pull origin wiki-export", { 
      cwd: wikiPath,
      encoding: 'utf-8',
    });

    res.json({
      success: true,
      message: "Wiki synced from GitHub",
      output,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Parse wiki markdown file and extract metadata
 */
function parseWikiPage(filename: string, content: string): WikiPage {
  // Default metadata
  let title = filename.replace('.md', '');
  let tags: string[] = [];
  let category: "operational" | "strategic" | "technical" | "business" | "customer" = "operational";
  let accessLevel: "founder" | "consultant" | "customer" | "all" = "all";

  // Parse frontmatter-style metadata from markdown
  const lines = content.split('\n');
  
  // Extract title from first H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    title = h1Match[1];
  }

  // Extract tags
  const tagsMatch = content.match(/\*\*Tags:\*\*\s+(.+)/);
  if (tagsMatch) {
    tags = tagsMatch[1].split(',').map(t => t.trim());
  }

  // Determine category and access level from tags or filename
  const lowerContent = content.toLowerCase();
  const lowerFilename = filename.toLowerCase();

  // Category detection
  if (lowerContent.includes('customer') || lowerFilename.includes('customer') || tags.includes('customer')) {
    category = "customer";
  } else if (lowerContent.includes('operational') || lowerFilename.includes('operational')) {
    category = "operational";
  } else if (lowerContent.includes('strategic') || lowerFilename.includes('strategic') || lowerFilename.includes('business')) {
    category = "strategic";
  } else if (lowerContent.includes('technical') || lowerFilename.includes('technical')) {
    category = "technical";
  } else if (lowerContent.includes('business')) {
    category = "business";
  }

  // Access level detection
  if (tags.includes('founder-only') || lowerContent.includes('founder only')) {
    accessLevel = "founder";
  } else if (tags.includes('customer') || category === "customer") {
    accessLevel = "customer";
  } else if (tags.includes('consultant') || category === "operational") {
    accessLevel = "consultant";
  } else if (category === "strategic" || category === "business") {
    accessLevel = "founder";
  }

  return {
    title,
    filename,
    content,
    tags,
    category,
    accessLevel,
  };
}

export default router;
