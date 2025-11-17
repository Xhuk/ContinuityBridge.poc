import type { IStorage } from "../../storage";
import { TokenLifecycleService } from "./token-lifecycle-service";
import { SecretsService } from "../secrets/secrets-service";
import { OutboundTokenProvider } from "./outbound-token-provider";

/**
 * Auth Service Factory
 * 
 * Provides singleton access to authentication services for use in
 * flow executors, workers, and other components that need to make
 * authenticated outbound requests.
 */

let outboundTokenProviderInstance: OutboundTokenProvider | null = null;

/**
 * Initialize the outbound token provider singleton
 * Must be called during server startup (routes.ts)
 */
export function initializeOutboundTokenProvider(
  storage: IStorage,
  tokenLifecycle: TokenLifecycleService,
  secretsService: SecretsService
): void {
  outboundTokenProviderInstance = new OutboundTokenProvider(
    storage,
    tokenLifecycle,
    secretsService
  );
}

/**
 * Get the outbound token provider instance
 * Returns null if not initialized (e.g., in test environment)
 */
export function getOutboundTokenProvider(): OutboundTokenProvider | null {
  return outboundTokenProviderInstance;
}
