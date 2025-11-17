import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Export Qoder Wiki to GitHub Wiki Format
 * 
 * Converts .qoder/repowiki content to markdown files suitable for GitHub wiki
 * 
 * Usage:
 *   node scripts/export-wiki-to-github.js
 * 
 * Output:
 *   Creates /wiki directory with .md files ready for GitHub wiki
 */

const PROJECT_ROOT = join(__dirname, '..');
const QODER_WIKI_PATH = join(PROJECT_ROOT, '.qoder', 'repowiki');
const WIKI_OUTPUT_PATH = join(PROJECT_ROOT, 'wiki');

function sanitizeFilename(title) {
  return title
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove duplicate hyphens
    .trim();
}

function processWikiFile(filePath, outputDir) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Extract title and content
    const title = parsed.title || basename(filePath, extname(filePath));
    const body = parsed.content || parsed.body || '';
    const tags = parsed.tags || [];
    const createdAt = parsed.created_at || new Date().toISOString();
    const updatedAt = parsed.updated_at || new Date().toISOString();
    
    // Create markdown content
    let markdown = `# ${title}\n\n`;
    
    // Add metadata
    if (tags.length > 0) {
      markdown += `**Tags:** ${tags.join(', ')}\n\n`;
    }
    
    markdown += `**Created:** ${new Date(createdAt).toLocaleDateString()}\n`;
    markdown += `**Updated:** ${new Date(updatedAt).toLocaleDateString()}\n\n`;
    markdown += `---\n\n`;
    
    // Add main content
    markdown += body;
    
    // Create sanitized filename
    const filename = sanitizeFilename(title) + '.md';
    const outputPath = join(outputDir, filename);
    
    // Write markdown file
    writeFileSync(outputPath, markdown, 'utf-8');
    console.log(`✅ Exported: ${filename}`);
    
    return { title, filename };
  } catch (error) {
    console.warn(`⚠️  Failed to process ${filePath}:`, error.message);
    return null;
  }
}

function scanDirectory(dir, outputDir, index = []) {
  if (!existsSync(dir)) {
    return index;
  }
  
  const items = readdirSync(dir);
  
  for (const item of items) {
    const itemPath = join(dir, item);
    const stat = statSync(itemPath);
    
    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      scanDirectory(itemPath, outputDir, index);
    } else if (item.endsWith('.json')) {
      // Process JSON wiki files
      const result = processWikiFile(itemPath, outputDir);
      if (result) {
        index.push(result);
      }
    }
  }
  
  return index;
}

function createHomePage(index, outputDir) {
  let homepage = `# ContinuityBridge Wiki\n\n`;
  homepage += `Welcome to the ContinuityBridge documentation.\n\n`;
  homepage += `## Table of Contents\n\n`;
  
  // Sort alphabetically
  index.sort((a, b) => a.title.localeCompare(b.title));
  
  for (const page of index) {
    homepage += `- [${page.title}](${page.filename})\n`;
  }
  
  homepage += `\n---\n\n`;
  homepage += `**Last Updated:** ${new Date().toLocaleDateString()}\n`;
  
  writeFileSync(join(outputDir, 'Home.md'), homepage, 'utf-8');
  console.log(`✅ Created: Home.md (index page)`);
}

async function exportWiki() {
  console.log('📚 Exporting Qoder Wiki to GitHub format...\n');
  
  // Check if Qoder wiki exists
  if (!existsSync(QODER_WIKI_PATH)) {
    console.log('❌ No Qoder wiki found at:', QODER_WIKI_PATH);
    console.log('ℹ️  Qoder wiki is empty or not initialized.');
    process.exit(1);
  }
  
  // Create output directory
  if (!existsSync(WIKI_OUTPUT_PATH)) {
    mkdirSync(WIKI_OUTPUT_PATH, { recursive: true });
    console.log(`📁 Created output directory: ${WIKI_OUTPUT_PATH}\n`);
  }
  
  // Scan and process all wiki files
  const index = scanDirectory(QODER_WIKI_PATH, WIKI_OUTPUT_PATH);
  
  // Create home page with index
  if (index.length > 0) {
    createHomePage(index, WIKI_OUTPUT_PATH);
  }
  
  console.log(`\n✅ Export complete!`);
  console.log(`📊 Total pages exported: ${index.length}`);
  console.log(`📂 Output location: ${WIKI_OUTPUT_PATH}`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. cd wiki`);
  console.log(`   2. git init`);
  console.log(`   3. git remote add origin https://github.com/Xhuk/ContinuityBridge.wiki.git`);
  console.log(`   4. git add .`);
  console.log(`   5. git commit -m "Initial wiki export"`);
  console.log(`   6. git push -u origin master\n`);
}

// Run export
exportWiki().catch(error => {
  console.error('❌ Export failed:', error);
  process.exit(1);
});
