import { NodeExecutor } from "./types";

/**
 * Conditional Executor - DISABLED FOR SECURITY
 * 
 * ⚠️ SECURITY: This executor is DISABLED to prevent remote code execution attacks.
 * 
 * REASON: Evaluating arbitrary JavaScript conditions using new Function() allows:
 * - Execution of system commands
 * - Access to sensitive data
 * - Modification of application state
 * 
 * TO RE-ENABLE SAFELY:
 * 1. Implement a declarative condition syntax instead of arbitrary JavaScript:
 *    - Safe operators: ==, !=, >, <, >=, <=, &&, ||
 *    - Field access only (no function calls)
 *    - Example: { "field": "quantity", "operator": ">", "value": 100 }
 * 
 * 2. OR use a safe expression evaluator library:
 *    - expr-eval (with sandboxing)
 *    - mathjs (expression-only mode)
 *    - Custom AST parser with whitelisted operations
 * 
 * 3. OR use vm2/isolated-vm for full sandboxing
 * 
 * WORKAROUND: Use multiple flows instead of conditionals
 */
export const executeConditional: NodeExecutor = async (node, input, context) => {
  throw new Error(
    "Conditional executor is disabled for security reasons. " +
    "Contact administrator to enable with proper sandboxing, " +
    "or use separate flows for different logic paths."
  );
};
