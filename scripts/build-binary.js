/**
 * Binary Builder for Customer Deployments
 * 
 * Builds standalone executables for Windows, Linux, macOS
 * Embeds customer license and organization config
 * Protects source code from modification
 * 
 * Usage:
 *   node scripts/build-binary.js --org acme-corp --license professional
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Parse arguments
const args = process.argv.slice(2);
const orgId = args[args.indexOf("--org") + 1] || "default";
const licenseType = args[args.indexOf("--license") + 1] || "trial";
const platforms = args.includes("--platforms") 
  ? args[args.indexOf("--platforms") + 1].split(",")
  : ["node20-win-x64", "node20-linux-x64", "node20-macos-x64"];

console.log("🔨 Building ContinuityBridge binary...");
console.log(`   Organization: ${orgId}`);
console.log(`   License: ${licenseType}`);
console.log(`   Platforms: ${platforms.join(", ")}`);
console.log("");

// Step 1: Build frontend
console.log("📦 [1/6] Building frontend...");
execSync("npm run build", { stdio: "inherit", cwd: rootDir });

// Step 2: Bundle backend with esbuild
console.log("📦 [2/6] Bundling backend...");
const bundleDir = path.join(rootDir, "dist", "bundle");
fs.mkdirSync(bundleDir, { recursive: true });

execSync(
  `esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/bundle/server.js`,
  { stdio: "inherit", cwd: rootDir }
);

// Step 3: Create embedded config
console.log("🔐 [3/6] Embedding customer config...");
const embeddedConfig = {
  organizationId: orgId,
  licenseType: licenseType,
  buildDate: new Date().toISOString(),
  buildId: crypto.randomBytes(16).toString("hex"),
  isBinary: true,
  protectionEnabled: true,
};

const configPath = path.join(bundleDir, "embedded-config.json");
fs.writeFileSync(configPath, JSON.stringify(embeddedConfig, null, 2));

// Step 4: Create package.json for pkg
console.log("📝 [4/6] Creating package.json for binary...");
const pkgJson = {
  name: "continuitybridge",
  version: "1.0.0",
  type: "module",
  main: "server.js",
  bin: "server.js",
  pkg: {
    assets: [
      "embedded-config.json",
      "../../dist/public/**/*",
    ],
    targets: platforms,
    outputPath: "../binaries",
  },
};

fs.writeFileSync(
  path.join(bundleDir, "package.json"),
  JSON.stringify(pkgJson, null, 2)
);

// Step 5: Install pkg if needed
console.log("📦 [5/6] Installing pkg...");
try {
  execSync("pkg --version", { stdio: "pipe" });
  console.log("   ✓ pkg already installed");
} catch {
  console.log("   Installing pkg globally...");
  execSync("npm install -g pkg", { stdio: "inherit" });
}

// Step 6: Build binaries
console.log("🚀 [6/6] Building binaries...");
const binariesDir = path.join(rootDir, "dist", "binaries");
fs.mkdirSync(binariesDir, { recursive: true });

for (const platform of platforms) {
  const [, os, arch] = platform.match(/node\d+-(\w+)-(\w+)/);
  const ext = os === "win" ? ".exe" : "";
  const outputName = `continuitybridge-${orgId}-${os}-${arch}${ext}`;
  
  console.log(`   Building ${platform}...`);
  
  try {
    execSync(
      `pkg dist/bundle/server.js --target ${platform} --output dist/binaries/${outputName}`,
      { stdio: "pipe", cwd: rootDir }
    );
    console.log(`   ✓ ${outputName}`);
  } catch (error) {
    console.error(`   ✗ Failed to build ${platform}:`, error.message);
  }
}

console.log("");
console.log("✅ Binary build complete!");
console.log("");
console.log("📁 Binaries location:");
console.log(`   ${binariesDir}`);
console.log("");
console.log("📦 Files:");
fs.readdirSync(binariesDir).forEach((file) => {
  const stats = fs.statSync(path.join(binariesDir, file));
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`   ${file} (${sizeMB} MB)`);
});
console.log("");
console.log("🚀 Deploy to customer:");
console.log(`   1. Copy binary to customer server`);
console.log(`   2. Set environment variables (.env)`);
console.log(`   3. Run: ./continuitybridge-${orgId}-linux-x64`);
console.log("");
