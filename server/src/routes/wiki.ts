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
  category: "operational" | "strategic" | "technical" | "business";
  accessLevel: "founder" | "consultant" | "all";
}

/**
 * Get all wiki pages based on user role
 * - Founders: See all documentation (full version)
 * - Consultants: See only operational information
 * - Customer admins/users: No access
 */
router.get("/pages", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;

    // Only superadmin (founders) and consultants can access wiki
    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Wiki access restricted to founders and consultants" });
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
      
      // Filter based on role
      if (userRole === "superadmin") {
        // Founders see everything
        pages.push(page);
      } else if (userRole === "consultant") {
        // Consultants only see operational content
        if (page.accessLevel === "all" || page.accessLevel === "consultant" || page.category === "operational") {
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
 */
router.get("/pages/:filename", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const { filename } = req.params;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Wiki access restricted" });
    }

    const wikiPath = join(process.cwd(), "wiki");
    const filePath = join(wikiPath, filename);

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "Wiki page not found" });
    }

    const content = readFileSync(filePath, 'utf-8');
    const page = parseWikiPage(filename, content);

    // Check access level
    if (userRole === "consultant") {
      if (page.accessLevel === "founder") {
        return res.status(403).json({ error: "This page is restricted to founders only" });
      }
      if (page.category !== "operational" && page.accessLevel !== "consultant" && page.accessLevel !== "all") {
        return res.status(403).json({ error: "Access denied" });
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
  let category: "operational" | "strategic" | "technical" | "business" = "operational";
  let accessLevel: "founder" | "consultant" | "all" = "all";

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
  if (lowerContent.includes('operational') || lowerFilename.includes('operational')) {
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
