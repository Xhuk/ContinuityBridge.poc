import { db } from "../../db";
import { users } from "../../db";
import { eq } from "drizzle-orm";

/**
 * Email Utilities
 * Centralized email normalization and user lookup
 */

/**
 * Normalize email for comparison
 * - Lowercase and trim
 * - For Gmail: dots are optional (jesus.cruzado = jesuscruzado)
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Find user by email with Gmail dot notation support
 * Gmail treats dots as optional (jesus.cruzado@gmail.com = jesuscruzado@gmail.com)
 * 
 * @param email - Email to search for
 * @returns User object if found, null otherwise
 */
export async function findUserByEmail(email: string): Promise<any | null> {
  const normalizedEmail = normalizeEmail(email);
  const [localPart, domain] = normalizedEmail.split('@');
  
  // Try exact match first
  const exactResult = await (db.select().from(users).where(eq(users.email, normalizedEmail)) as any);
  const exactUser = Array.isArray(exactResult) ? exactResult[0] : exactResult;
  
  if (exactUser) {
    return exactUser;
  }
  
  // If Gmail and not found, search for dot variants
  if (domain === 'gmail.com') {
    const allUsers = await (db.select().from(users) as any);
    const gmailUser = allUsers.find((u: any) => {
      const [uLocal, uDomain] = (u.email || '').split('@');
      if (uDomain !== 'gmail.com') return false;
      // Compare without dots
      return uLocal.replace(/\./g, '') === localPart.replace(/\./g, '');
    });
    
    return gmailUser || null;
  }
  
  return null;
}

/**
 * Check if email exists in database
 * 
 * @param email - Email to check
 * @returns True if user exists, false otherwise
 */
export async function emailExists(email: string): Promise<boolean> {
  const user = await findUserByEmail(email);
  return !!user;
}
