import { NodeExecutor } from "./types";

/**
 * Custom JavaScript Executor - DISABLED FOR SECURITY
 * 
 * ⚠️ SECURITY: This executor is DISABLED to prevent remote code execution attacks.
 * 
 * REASON: Arbitrary JavaScript execution allows attackers to:
 * - Execute system commands
 * - Access sensitive data (env vars, files, database)
 * - Modify application state
 * - Launch attacks on other systems
 * 
 * TO RE-ENABLE SAFELY:
 * 1. Install a proper sandbox library:
 *    - vm2 (Node.js sandbox)
 *    - isolated-vm (V8 isolate)
 *    - quickjs-emscripten (WASM-based JS runtime)
 * 
 * 2. Implement strict access controls:
 *    - Only admin users can create/edit flows with custom JS
 *    - Code review workflow for all custom JS
 *    - Automated security scanning of code
 * 
 * 3. Add resource limits:
 *    - CPU time limits
 *    - Memory limits
 *    - API call restrictions
 * 
 * 4. Run in isolated environment:
 *    - Separate process/container
 *    - No access to host filesystem
 *    - No access to internal APIs
 * 
 * WORKAROUND: Use object_mapper for simple field transformations
 */
export const executeCustomJavascript: NodeExecutor = async (node, input, context) => {
  throw new Error(
    "Custom JavaScript executor is disabled for security reasons. " +
    "Use object_mapper for field transformations, or contact administrator " +
    "to enable this feature with proper sandboxing."
  );
};
