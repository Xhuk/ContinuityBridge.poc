# Multi-Tenant Version Isolation Architecture

**Last Updated**: 2025-11-20 (Session 2)  
**Status**: ✅ P0 COMPLETE, ⚠️ P1 IN PROGRESS

---

## Problem Statement

Consultants working on Render (Founder site) need to access specific customer organizations and environments. The system must load the correct flow/interface versions based on `organizationId` + `environment` selection.

**Challenge**: Without proper isolation, consultants could see data from all organizations, or load wrong environment versions (dev instead of prod).

---

## Implementation Status

### ✅ Phase 1: Foundation (COMPLETE)

#### 1. Version Context Middleware
- **File**: `server/src/middleware/version-context.ts`
- **Status**: ✅ IMPLEMENTED
- **Purpose**: Extracts `organizationId` + `environment` from authenticated user session
- **Registered**: `server/routes.ts` line ~117 (after auth, before routes)

**Interface**:
```typescript
interface VersionContext {
  organizationId: string;
  environment: "dev" | "test" | "staging" | "prod";
  source: "consultant-selection" | "user-org" | "default";
}
```

**Priority Logic**:
1. **Consultants** → Uses `req.user.selectedTenant` from JWT
   - `req.versionContext = { organizationId: selectedTenant.tenantId, environment: selectedTenant.environment }`
2. **Customer Users** → Uses own `organizationId`, defaults to `prod`
   - `req.versionContext = { organizationId: user.organizationId, environment: "prod" }`
3. **Superadmins** → No version context (sees all organizations)

**Helper Functions**:
```typescript
// Require version context (throws if missing)
const ctx = requireVersionContext(req);

// Optional version context (returns null if missing)
const ctx = getVersionContext(req);
```

#### 2. Consultant Tenant Selection
- **Route**: `POST /api/consultant/select-tenant`
- **Status**: ✅ ALREADY WORKING
- **Flow**:
  1. Consultant selects "Acme Corp - PROD" from dropdown
  2. Backend generates new JWT with `selectedTenant` object
  3. Cookie updated with new session token
  4. All subsequent requests include version context

**JWT Structure**:
```typescript
{
  userId: "user-123",
  email: "consultant@example.com",
  role: "consultant",
  selectedTenant: {
    tenantId: "org-acme",
    tenantName: "Acme Corp",
    environment: "prod"
  }
}
```

#### 3. Database Schema
- **Status**: ✅ SCHEMA COMPLETE
- **Tables with `organization_id`**: 40+ tables
  - ✅ `flow_definitions`
  - ✅ `interfaces`
  - ✅ `configuration_versions`
  - ✅ `webhooks`
  - ✅ `routing_rules`
  - ✅ `system_logs`
  - ✅ `users` (customer users only)

---

### ✅ Phase 2: Query Updates (P0 COMPLETE)

#### Flows - ✅ COMPLETE
**Files Modified**:
1. `server/database-storage.ts` - Added `organizationId` param to `getFlows()`
2. `server/storage.ts` - Updated in-memory storage
3. `server/src/http/rest.ts` - GET `/api/flows` uses version context

**Query Pattern**:
```typescript
// Before (❌ WRONG - returns all flows)
const flows = await storage.getFlows(systemInstanceId);

// After (✅ CORRECT - filters by organization)
const versionContext = req.versionContext;
const flows = await storage.getFlows(systemInstanceId, versionContext?.organizationId);
```

**Result**: Consultants now only see flows for selected organization.

#### Interfaces - ✅ COMPLETE
**Files Modified**:
1. `server/src/interfaces/manager.ts` - Added `organizationId` param to all query methods
2. `server/src/http/rest.ts` - GET `/api/interfaces` uses version context
3. `server/src/routes/postman.ts` - Postman collection filtering

**Query Pattern**:
```typescript
// InterfaceManager now supports organization filtering
const versionContext = req.versionContext;
const interfaces = interfaceManager.getAllInterfaces(versionContext?.organizationId);

// Also applies to:
const byType = interfaceManager.getInterfacesByType("rest_api", organizationId);
const byDirection = interfaceManager.getInterfacesByDirection("inbound", organizationId);
```

**Result**: Consultants now only see interfaces for selected organization.

#### Webhooks - ✅ COMPLETE (Already Implemented)
**Status**: Webhooks were already organization-aware before this work
**Files**: `server/src/http/dynamic-webhook-router.ts`

**Features**:
- Multi-tenant slug isolation: `{organizationId}::{slug}`
- `getWebhooks(organizationId)` filters by organization
- `registerWebhook()` requires organizationId parameter

**Result**: Cross-tenant webhook visibility already prevented.

---

### ⚠️ Phase 3: Environment Filtering (P1 - IN PROGRESS)

**Current State**: Only `organizationId` filtering is implemented. Environment filtering (`dev`/`test`/`staging`/`prod`) is partially blocked.

**Challenge Identified**: `flow_definitions` table does NOT have a `targetEnvironment` column.

**Current Schema Structure**:
```
flow_definitions
  ├─ organizationId (✅ exists)
  ├─ systemInstanceId → system_instances
  │                        ├─ environmentId → environments
  │                        │                    └─ name (dev/staging/prod)
  │                        └─ endpoint
  └─ metadata (JSONB) ← Can store environment here
```

**Options for Implementation**:

#### Option 1: Add `targetEnvironment` Column (Recommended Long-Term)
**Pros**:
- Clean, explicit schema
- Fast queries (indexed column)
- Type-safe

**Cons**:
- Requires migration
- Downtime or careful migration planning

**Implementation**:
```sql
ALTER TABLE flow_definitions 
ADD COLUMN target_environment TEXT CHECK (target_environment IN ('dev', 'test', 'staging', 'prod'));

CREATE INDEX flow_definitions_env_idx ON flow_definitions(target_environment);
```

#### Option 2: Use `metadata` Field (Quick Win)
**Pros**:
- No schema migration needed
- Already exists as JSONB
- Can deploy immediately

**Cons**:
- Slower queries (no index on JSONB field)
- Less type-safe
- Requires JSONB query syntax

**Implementation**:
```typescript
// Store in metadata
flow.metadata = {
  ...flow.metadata,
  targetEnvironment: "prod"
};

// Query with JSONB
const flows = await db.select()
  .from(flowDefinitions)
  .where(
    and(
      eq(flowDefinitions.organizationId, orgId),
      sql`metadata->>'targetEnvironment' = ${environment}`
    )
  );
```

#### Option 3: Join Through `systemInstance` (Complex)
**Pros**:
- Uses existing foreign keys
- Leverages ecosystem/environment architecture

**Cons**:
- Requires JOIN queries (slower)
- More complex code
- Not all flows have systemInstanceId

**Recommendation**: **Use Option 2 now (metadata), migrate to Option 1 later**

---

### ❌ Phase 4: UI Context Indicator (TODO)

**What's Missing**: No visual indicator showing which organization + environment the consultant is currently viewing.

**Recommendation**: Add header banner or sidebar widget showing:
```
🏢 Organization: Acme Corp
🌍 Environment: PRODUCTION
```

**Benefits**:
- Prevents consultant confusion
- Clear context at all times
- Easy to verify correct tenant is selected

---

## Access Patterns

### For Routes Requiring Organization Selection
```typescript
router.get("/api/flows", async (req, res) => {
  try {
    // Require version context (throws if missing)
    const versionContext = requireVersionContext(req);
    
    const flows = await storage.getFlows(
      systemInstanceId, 
      versionContext.organizationId
    );
    
    res.json(flows);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

### For Routes with Optional Filtering
```typescript
router.get("/api/users", async (req, res) => {
  // Optional version context
  const versionContext = getVersionContext(req);
  
  let query = db.select().from(users);
  
  if (versionContext) {
    // Filter by organization if context exists
    query = query.where(eq(users.organizationId, versionContext.organizationId));
  } else {
    // Superadmin sees all users
  }
  
  const users = await query;
  res.json(users);
});
```

---

## Common Pitfalls

### ❌ Pitfall 1: Querying Without Version Context
**Problem**: Fetches data from ALL organizations instead of selected tenant.

**Wrong**:
```typescript
// ❌ BAD: Returns all flows regardless of selected tenant
const flows = await db.select()
  .from(flowDefinitions)
  .where(eq(flowDefinitions.organizationId, req.user.organizationId));
```

**Correct**:
```typescript
// ✅ GOOD: Uses version context from middleware
const versionContext = req.versionContext;
const flows = await db.select()
  .from(flowDefinitions)
  .where(eq(flowDefinitions.organizationId, versionContext.organizationId));
```

### ❌ Pitfall 2: Using User's OrganizationId for Consultants
**Problem**: Consultants belong to "Founder" organization, but need to access customer organizations.

**Solution**: Always use `req.versionContext.organizationId`, NOT `req.user.organizationId`.

### ❌ Pitfall 3: Not Filtering by Environment
**Problem**: Returns dev/staging flows when consultant selected PROD environment.

**Solution**: Add environment filtering:
```typescript
.where(
  and(
    eq(flowDefinitions.organizationId, versionContext.organizationId),
    eq(flowDefinitions.targetEnvironment, versionContext.environment)
  )
)
```

---

## Testing Guide

### Test Case 1: Consultant Switches Organizations
1. Login as consultant
2. Select "Acme Corp - PROD"
3. Navigate to `/flows`
4. **Expected**: Only Acme Corp flows visible
5. Select "Demo Inc - DEV"
6. **Expected**: Only Demo Inc flows visible

### Test Case 2: Customer User Access
1. Login as customer user (belongs to "Acme Corp")
2. Navigate to `/flows`
3. **Expected**: Only Acme Corp flows visible (auto-filtered)

### Test Case 3: Superadmin Access
1. Login as superadmin
2. Navigate to `/flows`
3. **Expected**: All flows from all organizations visible

---

## Next Steps (Priority Order)

### ✅ P0 - CRITICAL (COMPLETE)
1. ✅ **Interface Queries** - organizationId filtering implemented
2. ✅ **Webhook Queries** - Already organization-aware

### ⚠️ P1 - HIGH (DECISION NEEDED)
3. ⚠️ **Environment Filtering** - Strategy decision required:
   - **Option A**: Use `metadata` field (quick, no migration)
   - **Option B**: Add `targetEnvironment` column (proper, requires migration)
4. ❌ **Status Filtering** - Only show "enabled" flows to customers

### ❌ P2 - MEDIUM (TODO)
5. ❌ **UI Context Indicator** - Show selected org/env in UI header
6. ❌ **Audit Logging** - Log when consultants switch tenants
7. ❌ **Performance Testing** - Test with 100+ organizations

---

## Dependencies

### Required for Version Context to Work
1. ✅ Authentication middleware must run first
2. ✅ JWT must contain `selectedTenant` for consultants
3. ✅ `POST /api/consultant/select-tenant` must update JWT
4. ✅ Database tables must have `organization_id` column

### Required for Full Implementation
1. ❌ `targetEnvironment` column on version tables
2. ❌ UI context indicator component
3. ❌ All query endpoints updated to use version context
4. ❌ Test coverage for multi-tenant scenarios

---

## File Locations

| Component | File Path | Status |
|-----------|-----------|--------|
| Version Context Middleware | `server/src/middleware/version-context.ts` | ✅ Complete |
| Middleware Registration | `server/routes.ts` | ✅ Complete |
| Tenant Selection API | `server/src/routes/consultant.ts` | ✅ Complete |
| Flow Storage (DB) | `server/database-storage.ts` | ✅ Updated |
| Flow Storage (Memory) | `server/storage.ts` | ✅ Updated |
| Flow REST API | `server/src/http/rest.ts` | ✅ Updated |
| Interface Manager | `server/src/interfaces/manager.ts` | ✅ Complete |
| Webhook Router | `server/src/http/dynamic-webhook-router.ts` | ✅ Complete |

---

## Conclusion

**✅ P0 Complete**. Version context middleware is working. Flows, interfaces, and webhooks are properly filtered by organization.

**⚠️ P1 Blocked**: Environment filtering needs strategy decision (metadata vs. column).

**Next critical step**: 
1. **Decide** environment storage approach
2. Implement environment filtering
3. Add UI context indicator

**Estimated remaining effort**: 
- P1 Environment filtering: 2-4 hours (depends on approach)
- P2 UI indicator: 1-2 hours

**Total**: ~3-6 hours to complete full multi-tenant version isolation.

---

## Session Handoff Notes

**What was completed this session**:
- ✅ P0.1 - Interface filtering by organizationId
- ✅ P0.2 - Verified webhooks already organization-aware
- 📝 Documented environment filtering challenge and options
- 📝 Updated architecture document with current status

**Decision needed for next session**:
- Choose environment filtering strategy (metadata vs. column)
- If metadata: Implement immediately
- If column: Plan migration timeline

**Files modified this session**:
1. `server/src/interfaces/manager.ts` - Added organizationId params
2. `server/src/http/rest.ts` - Interface endpoint filtering
3. `server/src/routes/postman.ts` - Postman generation filtering
4. `docs/ARCHITECTURE-multi-tenant-version-isolation.md` - Status updates
