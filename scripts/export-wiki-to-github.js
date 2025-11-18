import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync } from 'fs';
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
const QODER_WIKI_PATH = join(PROJECT_ROOT, '.qoder', 'repowiki', 'en', 'content');
const WIKI_OUTPUT_PATH = join(PROJECT_ROOT, 'wiki');

function sanitizeFilename(title) {
  return title
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove duplicate hyphens
    .trim();
}

function processWikiFile(filePath, outputDir, category) {
  try {
    const ext = extname(filePath);
    const filename = basename(filePath);
    
    if (ext === '.json') {
      // Handle JSON format (legacy)
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      
      const title = parsed.title || basename(filePath, ext);
      const body = parsed.content || parsed.body || '';
      const tags = parsed.tags || [];
      const createdAt = parsed.created_at || new Date().toISOString();
      const updatedAt = parsed.updated_at || new Date().toISOString();
      
      let markdown = `# ${title}\n\n`;
      if (tags.length > 0) {
        markdown += `**Tags:** ${tags.join(', ')}\n\n`;
      }
      markdown += `**Created:** ${new Date(createdAt).toLocaleDateString()}\n`;
      markdown += `**Updated:** ${new Date(updatedAt).toLocaleDateString()}\n\n`;
      markdown += `---\n\n`;
      markdown += body;
      
      const outputFilename = sanitizeFilename(title) + '.md';
      const outputPath = join(outputDir, outputFilename);
      writeFileSync(outputPath, markdown, 'utf-8');
      console.log(`✅ Exported: ${outputFilename}`);
      
      return { title, filename: outputFilename, category };
    } else if (ext === '.md') {
      // Handle Markdown files (Qoder wiki format)
      const content = readFileSync(filePath, 'utf-8');
      
      // Extract title from first line or filename
      const lines = content.split('\n');
      let title = basename(filePath, '.md');
      
      // Try to find title in first line (# Title format)
      if (lines[0] && lines[0].startsWith('# ')) {
        title = lines[0].substring(2).trim();
      }
      
      // Create sanitized filename (preserve content structure)
      const outputFilename = sanitizeFilename(title) + '.md';
      const outputPath = join(outputDir, outputFilename);
      
      // Copy content with category header
      let markdown = `**Category:** ${category}

---

`;
      markdown += content;
      
      writeFileSync(outputPath, markdown, 'utf-8');
      console.log(`✅ Exported: ${outputFilename} (${category})`);
      
      return { title, filename: outputFilename, category };
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️  Failed to process ${filePath}:`, error.message);
    return null;
  }
}

function scanDirectory(dir, outputDir, index = [], category = '') {
  if (!existsSync(dir)) {
    return index;
  }
  
  const items = readdirSync(dir);
  
  for (const item of items) {
    const itemPath = join(dir, item);
    const stat = statSync(itemPath);
    
    if (stat.isDirectory()) {
      // Use directory name as category
      scanDirectory(itemPath, outputDir, index, item);
    } else if (item.endsWith('.json') || item.endsWith('.md')) {
      // Process JSON or Markdown wiki files
      const result = processWikiFile(itemPath, outputDir, category || 'General');
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
  
  // Group by category (extracted from directory structure)
  const categories = {};
  for (const page of index) {
    const category = page.category || 'General';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(page);
  }
  
  // Sort categories alphabetically
  const sortedCategories = Object.keys(categories).sort();
  
  for (const category of sortedCategories) {
    homepage += `### ${category}\n\n`;
    
    // Sort pages within category
    categories[category].sort((a, b) => a.title.localeCompare(b.title));
    
    for (const page of categories[category]) {
      homepage += `- [${page.title}](${page.filename})\n`;
    }
    homepage += `\n`;
  }
  
  homepage += `---\n\n`;
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
