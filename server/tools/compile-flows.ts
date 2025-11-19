/**
 * BridgeScript Flow Compiler
 * 
 * Compiles TypeScript flow definitions (.flow.ts) into YAML files
 * that can be imported into ContinuityBridge
 * 
 * Usage:
 *   npm run compile:flows
 *   npm run compile:flows -- flows/examples/my-flow.flow.ts
 */

import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";

const FLOWS_DIR = path.join(process.cwd(), "flows");
const OUTPUT_DIR = path.join(process.cwd(), "flows", "compiled");

async function compileFlow(filePath: string): Promise<void> {
  console.log(`📝 Compiling: ${path.basename(filePath)}`);
  
  try {
    // Execute the TypeScript file using tsx
    const output = execSync(`npx tsx "${filePath}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    
    // Extract filename without .flow.ts extension
    const baseName = path.basename(filePath, ".flow.ts");
    const outputPath = path.join(OUTPUT_DIR, `${baseName}.yaml`);
    
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Write YAML output
    await fs.writeFile(outputPath, output, "utf-8");
    
    console.log(`✅ Compiled to: ${path.relative(process.cwd(), outputPath)}`);
  } catch (error: any) {
    console.error(`❌ Failed to compile ${filePath}:`);
    console.error(error.stderr || error.message);
    throw error;
  }
}

async function compileAll(): Promise<void> {
  console.log("🚀 BridgeScript Flow Compiler\n");
  
  // Find all .flow.ts files
  const flowFiles = await glob("flows/**/*.flow.ts", {
    cwd: process.cwd(),
    absolute: true,
  });
  
  if (flowFiles.length === 0) {
    console.log("⚠️  No .flow.ts files found in flows/ directory");
    return;
  }
  
  console.log(`Found ${flowFiles.length} flow(s) to compile:\n`);
  
  const results = {
    success: [] as string[],
    failed: [] as string[],
  };
  
  for (const file of flowFiles) {
    try {
      await compileFlow(file);
      results.success.push(file);
    } catch (error) {
      results.failed.push(file);
    }
    console.log(""); // Blank line between files
  }
  
  // Summary
  console.log("=" .repeat(60));
  console.log("📊 Compilation Summary\n");
  console.log(`✅ Successful: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log("\n❌ Failed files:");
    results.failed.forEach(f => console.log(`   - ${path.basename(f)}`));
    process.exit(1);
  }
  
  console.log(`\n📁 Output directory: ${path.relative(process.cwd(), OUTPUT_DIR)}`);
}

// Main
const args = process.argv.slice(2);

if (args.length > 0) {
  // Compile specific file
  const filePath = path.resolve(args[0]);
  compileFlow(filePath)
    .then(() => console.log("\n✨ Done!"))
    .catch(() => process.exit(1));
} else {
  // Compile all
  compileAll()
    .then(() => console.log("\n✨ Done!"))
    .catch(() => process.exit(1));
}
