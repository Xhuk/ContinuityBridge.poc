import { db } from "../../db.js";
import { sql } from "drizzle-orm";
import type { AuthenticatedUser } from "../auth/rbac-middleware.js";

/**
 * RLS Context Manager
 * Sets PostgreSQL session variables for Row-Level Security policies
 * 
 * CRITICAL: Must be called before ANY database query to enforce multi-tenant isolation
 */

/**
 * Set RLS context for current transaction
 * @param user - Authenticated user (from req.user)
 */
export async function setRLSContext(user: AuthenticatedUser): Promise<void> {
  if (!user) {
    throw new Error("Cannot set RLS context: user is null");
  }

  const organizationId = user.organizationId || 'default';
  const role = user.role || 'customer_user';

  // Set session variables that RLS policies check
  await db.execute(sql`SET LOCAL app.current_organization_id = ${organizationId}`);
  await db.execute(sql`SET LOCAL app.current_role = ${role}`);
}

/**
 * Execute query with RLS context
 * Automatically sets session variables before query execution
 * 
 * @param user - Authenticated user
 * @param queryFn - Database query function to execute
 * @returns Query result
 */
export async function withRLSContext<T>(
  user: AuthenticatedUser,
  queryFn: () => Promise<T>
): Promise<T> {
  // Begin transaction
  await db.execute(sql`BEGIN`);

  try {
    // Set RLS context
    await setRLSContext(user);

    // Execute query
    const result = await queryFn();

    // Commit transaction
    await db.execute(sql`COMMIT`);

    return result;
  } catch (error) {
    // Rollback on error
    await db.execute(sql`ROLLBACK`);
    throw error;
  }
}

/**
 * Middleware to automatically set RLS context for all requests
 * Add this AFTER authenticateUser middleware
 * 
 * Usage in routes:
 * app.use(authenticateUser);
 * app.use(setRLSMiddleware);
 */
export function setRLSMiddleware(req: any, res: any, next: any): void {
  if (!req.user) {
    // Skip if no user (public endpoints)
    return next();
  }

  // Attach RLS context setter to request
  req.setRLSContext = async () => {
    await setRLSContext(req.user);
  };

  // Attach helper for wrapped queries
  req.withRLS = async <T>(queryFn: () => Promise<T>): Promise<T> => {
    return withRLSContext(req.user, queryFn);
  };

  next();
}

/**
 * Check if RLS is enabled on a table
 * Useful for testing/debugging
 */
export async function isRLSEnabled(tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT relrowsecurity 
    FROM pg_class 
    WHERE relname = ${tableName}
  `);

  return result.rows.length > 0 && result.rows[0].relrowsecurity === true;
}

/**
 * Get current RLS context
 * Useful for debugging
 */
export async function getCurrentRLSContext(): Promise<{
  organizationId: string | null;
  role: string | null;
}> {
  const orgResult = await db.execute(sql`
    SELECT current_setting('app.current_organization_id', TRUE) as org_id
  `);

  const roleResult = await db.execute(sql`
    SELECT current_setting('app.current_role', TRUE) as role
  `);

  return {
    organizationId: (orgResult.rows[0] as any)?.org_id || null,
    role: (roleResult.rows[0] as any)?.role || null,
  };
}
