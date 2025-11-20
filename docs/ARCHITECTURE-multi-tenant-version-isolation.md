# Multi-Tenant Version Isolation Architecture

**Last Updated**: 2025-11-20  
**Status**: ✅ FOUNDATION COMPLETE, PARTIAL IMPLEMENTATION

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

### ✅ Phase 2: Query Updates (PARTIAL)

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

#### Interfaces - ❌ TODO
**Files to Modify**:
- `server/src/interface/interface-manager.ts`
- Query methods need `organizationId` filtering

#### Webhooks - ❌ TODO
**Files to Modify**:
- `server/src/routes/webhooks.ts`
- GET `/api/webhooks` needs version context filtering

#### Routing Rules - ❌ TODO
**Files to Modify**:
- Routing rule queries need `organizationId` filtering

---

### ❌ Phase 3: Environment Filtering (TODO)

**Current State**: Only `organizationId` filtering is implemented. Environment filtering (`dev`/`test`/`staging`/`prod`) is not yet applied.

**What Needs to Be Done**:
1. Add `targetEnvironment` column to tables (or use existing `status` field)
2. Filter queries by `req.versionContext.environment`
3. Only return "deployed" versions for selected environment

**Example**:
```typescript
// ✅ Full implementation should look like this
const flows = await db.select()
  .from(flowDefinitions)
  .where(
    and(
      eq(flowDefinitions.organizationId, versionContext.organizationId),
      eq(flowDefinitions.targetEnvironment, versionContext.environment),
      eq(flowDefinitions.status, "deployed")
    )
  );
```

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

1. **Interface Queries** - Add `organizationId` filtering to interface manager
2. **Webhook Queries** - Filter webhooks by organization
3. **Environment Filtering** - Add `targetEnvironment` filtering to all queries
4. **UI Context Indicator** - Show selected org/env in UI header
5. **Audit Logging** - Log when consultants switch tenants
6. **Performance Testing** - Test with 100+ organizations

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
| Interface Manager | `server/src/interface/interface-manager.ts` | ❌ TODO |
| Webhook Routes | `server/src/routes/webhooks.ts` | ❌ TODO |

---

## Conclusion

**Foundation is solid**. Version context middleware is working and flows are properly filtered by organization.

**Next critical step**: Apply the same pattern to interfaces, webhooks, and routing rules. Add environment filtering once all queries are updated.

**Estimated effort**: 
- Phase 2 completion (interfaces/webhooks): 4-6 hours
- Phase 3 (environment filtering): 2-3 hours
- Phase 4 (UI indicator): 1-2 hours

**Total**: ~8-11 hours of development work to complete full multi-tenant version isolation.
