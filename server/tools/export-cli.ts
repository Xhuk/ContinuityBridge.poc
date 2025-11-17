#!/usr/bin/env node

/**
 * ContinuityBridge Export CLI
 * 
 * Usage:
 *   npm run export:trial -- --org "Acme Corp" --orgId "acme-001"
 *   npm run export:annual -- --org "BigCo Inc" --orgId "bigco-123" --maxFlows 50
 *   npm run export:perpetual -- --org "Enterprise Ltd" --orgId "ent-456" --maxFlows 100
 *   npm run export:keys    # Generate RSA key pair (run once)
 */

import { ExportOrchestrator } from "../src/export/export-orchestrator.js";
import { LicenseManager } from "../src/export/license-manager.js";

const args = process.argv.slice(2);

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (args[i].startsWith("--")) {
      parsed[args[i].substring(2)] = args[i + 1];
    }
  }
  return parsed;
}

async function main() {
  const command = args[0];
  const options = parseArgs(args.slice(1));

  switch (command) {
    case "keys":
      console.log("🔑 Generating RSA key pair...");
      const licenseManager = new LicenseManager();
      await licenseManager.generateKeyPair();
      break;

    case "trial":
    case "annual":
    case "perpetual":
      const orchestrator = new ExportOrchestrator();
      
      if (!options.org || !options.orgId) {
        console.error("❌ Missing required arguments: --org and --orgId");
        process.exit(1);
      }

      console.log(`🚀 Generating ${command} export for ${options.org}...`);
      
      const result = await orchestrator.exportBlackBox({
        organizationId: options.orgId,
        organizationName: options.org,
        licenseType: command as "trial" | "annual" | "perpetual",
        maxFlows: options.maxFlows ? parseInt(options.maxFlows) : undefined,
        environment: (options.env as any) || "production",
        includeInactive: options.includeInactive === "true",
      });

      if (result.success) {
        console.log(`✅ Export completed!`);
        console.log(`📂 Location: ${result.exportPath}`);
        console.log(`📦 Assets: ${result.assets}`);
      } else {
        console.error(`❌ Export failed:`, result.errors);
        process.exit(1);
      }
      break;

    default:
      console.log(`
ContinuityBridge Export CLI

Commands:
  keys                              Generate RSA key pair (run once)
  trial --org NAME --orgId ID       Generate trial license export (30 days, 5 flows)
  annual --org NAME --orgId ID      Generate annual license export (365 days, 50 flows)
  perpetual --org NAME --orgId ID   Generate perpetual license export (no expiry, 100 flows)

Options:
  --maxFlows N                      Maximum number of flows (overrides defaults)
  --env ENV                         Environment: development | staging | production
  --includeInactive                 Include non-active flows in export

Examples:
  npm run export:keys
  npm run export:trial -- --org "Acme Corp" --orgId "acme-001"
  npm run export:annual -- --org "BigCo Inc" --orgId "bigco-123" --maxFlows 50
  npm run export:perpetual -- --org "Enterprise" --orgId "ent-456" --maxFlows 200
`);
  }
}

main().catch(console.error);
