# ContinuityBridge - Environment Migration Guide

## Overview

This guide covers the environment promotion workflow and migration rules when moving configurations from DEV → STAGING → PROD.

---

## Environment Hierarchy

```
DEV (Development)
  ↓ Promote →
STAGING (User Acceptance Testing)
  ↓ Promote →
PROD (Production)
```

### Environment Characteristics

| Environment | Mutability | Approval Required | Features Included |
|-------------|-----------|-------------------|-------------------|
| **DEV** | ✅ Fully Mutable | ❌ No | All features (SuperAdmin, Consultant, Customer) |
| **STAGING** | ✅ Mutable | ⚠️ Optional | **Filtered**: SuperAdmin features removed |
| **PROD** | 🔒 Immutable | ✅ Yes (SuperAdmin) | **Filtered**: SuperAdmin + Consultant features removed |

---

## Automatic Feature Filtering

### Why Filter?

When promoting configurations to higher environments, **management and development features are automatically removed**:

- **Customers don't need** internal project management tools
- **Production should only contain** operational/runtime features
- **Reduces attack surface** and complexity
- **Cleaner deployments** with less overhead

### Filtering Rules

#### DEV → STAGING Migration

**What Gets Removed**:
- ❌ SuperAdmin project management pages
- ❌ `/admin/projects` routes
- ❌ Project CRUD APIs
- ❌ Consultant assignment features

**What Remains**:
- ✅ All flows and interfaces
- ✅ Data sources and mappings
- ✅ Error triage dashboard
- ✅ Consultant tenant selection
- ✅ User management
- ✅ Settings and configuration

**Rationale**: Customers in STAGING (UAT) don't need to see how you manage their project internally.

#### STAGING → PROD Migration

**What Gets Removed** (in addition to STAGING filters):
- ❌ Consultant tenant selection
- ❌ `/tenant-selector` routes
- ❌ Multi-tenant switching APIs
- ❌ `/api/consultant/*` endpoints
- ❌ Tenant management features

**What Remains**:
- ✅ Production flows (enabled flows only)
- ✅ Production interfaces
- ✅ Customer-facing error dashboard
- ✅ Customer user management (scoped to their org)
- ✅ Runtime configuration only

**Rationale**: Production customers operate a single-tenant instance. They don't need consultant-level multi-tenant switching.

---

## Migration Workflow

### Step 1: DEV → STAGING Promotion

**Prerequisites**:
- ✅ All flows tested in DEV
- ✅ Mappings validated
- ✅ Interfaces configured and tested
- ✅ No critical errors in Error Triage Dashboard

**Process**:

1. **Initiate Promotion**:
   ```
   Navigate to: Environment Promotion → DEV to STAGING
   Select: DEV version ID
   ```

2. **Automatic Filtering**:
   ```
   System automatically:
   - Clones DEV configuration
   - Removes SuperAdmin features
   - Preserves flows, interfaces, mappings
   - Creates STAGING version
   ```

3. **Review Changes**:
   ```
   Check filtered configuration:
   - Verify all flows copied
   - Confirm interfaces included
   - Review removed features list
   ```

4. **Approve & Deploy**:
   ```
   Status: draft → deployed
   Deployment: Immediate (or pending approval if configured)
   ```

**Post-Promotion**:
- Customer tests in STAGING environment
- Consultant monitors for UAT issues
- Errors logged to Error Triage Dashboard (STAGING scope)

### Step 2: STAGING → PROD Promotion

**Prerequisites**:
- ✅ UAT completed successfully in STAGING
- ✅ Customer sign-off obtained
- ✅ No blocking errors in STAGING
- ✅ Rollback plan prepared
- ✅ Maintenance window scheduled

**Process**:

1. **Initiate Promotion**:
   ```
   Navigate to: Environment Promotion → STAGING to PROD
   Select: STAGING version ID
   ```

2. **Automatic Filtering** (Enhanced):
   ```
   System automatically:
   - Clones STAGING configuration
   - Removes SuperAdmin features (already done)
   - Removes Consultant features (NEW)
   - Removes tenant selection
   - Creates single-tenant PROD configuration
   - Adds filtering metadata
   ```

3. **Superadmin Approval Required**:
   ```
   Status: draft → pending_approval
   
   Superadmin reviews:
   - Configuration changes
   - Excluded features list
   - Impact assessment
   - Rollback plan
   
   Action: Approve or Reject
   ```

4. **Deployment**:
   ```
   After approval:
   Status: approved → deployed
   Immutability: Version becomes IMMUTABLE
   
   Docker Image: continuitybridge-{org}:{version}-prod
   Registry: Pushed to production registry
   Deployment: Via Kubernetes/Docker
   ```

**Post-Deployment**:
- Customer runs in production
- All changes tracked in deployment history
- Version is **IMMUTABLE** - cannot modify
- New changes require new version

---

## Filtered Features Reference

### SuperAdmin Features (Removed from STAGING & PROD)

**Routes**:
```
❌ /admin/projects
❌ /api/admin/projects
❌ /api/admin/projects/:id
❌ /api/admin/consultants
```

**UI Components**:
```
❌ SuperAdmin sidebar section
❌ Project management page
❌ Project creation dialog
❌ Consultant assignment UI
```

**Database Tables** (if using dedicated DB per customer):
```
⚠️ Not migrated:
- projects table
- project_stages table
- project_assignments table
```

**Settings**:
```
❌ configuration.settings.superadminFeatures
```

### Consultant Features (Removed from PROD only)

**Routes**:
```
❌ /tenant-selector
❌ /api/consultant/tenants
❌ /api/consultant/select-tenant
```

**UI Components**:
```
❌ Tenant selection page
❌ Tenant switcher
❌ Multi-tenant navigation
```

**Authentication**:
```
⚠️ Modified:
- JWT tokens don't include selectedTenant field in PROD
- Single-tenant authentication only
```

**Settings**:
```
❌ configuration.settings.consultantFeatures
❌ configuration.settings.tenantSelection
```

---

## Configuration Structure

### DEV Configuration (Full)

```json
{
  "flows": [...],
  "interfaces": [...],
  "dataSources": [...],
  "mappings": [...],
  "routes": [
    "/admin/projects",
    "/tenant-selector",
    "/flows",
    "/interfaces",
    ...
  ],
  "settings": {
    "superadminFeatures": {
      "projectManagement": true,
      "consultantAssignment": true
    },
    "consultantFeatures": {
      "tenantSelection": true,
      "multiTenantAccess": true
    },
    "customerFeatures": {
      "errorDashboard": true,
      "userManagement": true
    }
  }
}
```

### STAGING Configuration (SuperAdmin Filtered)

```json
{
  "flows": [...],
  "interfaces": [...],
  "dataSources": [...],
  "mappings": [...],
  "routes": [
    "/tenant-selector",  // ✅ Still included
    "/flows",
    "/interfaces",
    ...
    // ❌ /admin/projects removed
  ],
  "settings": {
    // ❌ superadminFeatures removed
    "consultantFeatures": {
      "tenantSelection": true,
      "multiTenantAccess": true
    },
    "customerFeatures": {
      "errorDashboard": true,
      "userManagement": true
    }
  },
  "_filtered": {
    "environment": "staging",
    "excludedFeatures": [
      "SuperAdmin pages",
      "Project management"
    ],
    "filteredAt": "2025-01-15T10:30:00Z"
  }
}
```

### PROD Configuration (Full Filtering)

```json
{
  "flows": [...],
  "interfaces": [...],
  "dataSources": [...],
  "mappings": [...],
  "routes": [
    "/flows",
    "/interfaces",
    ...
    // ❌ /admin/projects removed
    // ❌ /tenant-selector removed
  ],
  "settings": {
    // ❌ superadminFeatures removed
    // ❌ consultantFeatures removed
    "customerFeatures": {
      "errorDashboard": true,
      "userManagement": true
    }
  },
  "_filtered": {
    "environment": "prod",
    "excludedFeatures": [
      "SuperAdmin pages",
      "Consultant tenant selection",
      "Project management"
    ],
    "filteredAt": "2025-01-15T14:45:00Z"
  }
}
```

---

## Rollback Procedures

### STAGING Rollback

If UAT fails in STAGING:

1. Identify previous working version
2. Navigate to **Versions** → Select previous version
3. Click **Rollback**
4. System creates new version based on previous config
5. Deploy to STAGING

**No approval required** - immediate rollback available.

### PROD Rollback

If production deployment fails:

1. **Emergency Rollback**:
   ```
   Navigate to: Versions → PROD → Previous Version
   Click: Rollback to v{X.Y.Z}
   ```

2. **Superadmin Approval**:
   ```
   Status: pending_approval
   Priority: URGENT
   Approval: Required within 1 hour
   ```

3. **Deployment**:
   ```
   Docker: Rollback to previous image tag
   Database: Restore from backup (if needed)
   Verification: Health checks pass
   ```

**Important**: Rollback creates a NEW version (immutability preserved).

---

## Best Practices

### Before Promotion

**DEV → STAGING**:
- ✅ Test all flows in DEV environment
- ✅ Verify interface connectivity
- ✅ Validate all mappings
- ✅ Review Error Triage Dashboard (no critical errors)
- ✅ Document changes in Integration Notes
- ✅ Notify customer of UAT schedule

**STAGING → PROD**:
- ✅ Complete UAT with customer
- ✅ Obtain written customer sign-off
- ✅ Schedule maintenance window
- ✅ Prepare rollback plan
- ✅ Backup production database
- ✅ Notify stakeholders

### During Promotion

- ✅ Monitor filtering process
- ✅ Review excluded features list
- ✅ Verify critical flows included
- ✅ Check configuration diff
- ✅ Validate environment variables

### After Promotion

**STAGING**:
- ✅ Verify customer can access UAT environment
- ✅ Monitor error rates
- ✅ Support customer during testing
- ✅ Document UAT findings

**PROD**:
- ✅ Verify deployment success
- ✅ Run smoke tests
- ✅ Monitor for 24 hours
- ✅ Check error dashboard
- ✅ Confirm customer operations normal

---

## Troubleshooting

### Common Issues

**Issue**: Features missing after promotion
- **Cause**: Expected - features are auto-filtered
- **Solution**: Review filtering rules above

**Issue**: Customer sees consultant features in PROD
- **Cause**: Filtering not applied
- **Solution**: Contact Superadmin to re-promote with filtering

**Issue**: Flows not executing in STAGING
- **Cause**: Interface credentials not configured
- **Solution**: Update interface secrets for STAGING environment

**Issue**: PROD deployment blocked
- **Cause**: Pending Superadmin approval
- **Solution**: Wait for approval or contact Superadmin

### Error Messages

```
"Configuration filtered for STAGING"
→ Normal: SuperAdmin features removed

"Configuration filtered for PROD"
→ Normal: SuperAdmin + Consultant features removed

"Promotion requires approval"
→ Normal for PROD: Await Superadmin approval

"Version is immutable"
→ Cannot modify PROD version: Create new version instead
```

---

## Migration Checklist

### DEV → STAGING

- [ ] All flows tested in DEV
- [ ] Interfaces tested and working
- [ ] Mappings validated
- [ ] No critical errors
- [ ] Integration notes documented
- [ ] Promotion initiated
- [ ] SuperAdmin features filtered
- [ ] Configuration reviewed
- [ ] STAGING deployment verified
- [ ] Customer notified for UAT

### STAGING → PROD

- [ ] UAT completed successfully
- [ ] Customer sign-off received
- [ ] No blocking errors
- [ ] Rollback plan prepared
- [ ] Maintenance window scheduled
- [ ] Stakeholders notified
- [ ] Promotion initiated
- [ ] SuperAdmin + Consultant features filtered
- [ ] Superadmin approval obtained
- [ ] PROD deployment executed
- [ ] Smoke tests passed
- [ ] 24-hour monitoring active
- [ ] Customer operations confirmed

---

*Last Updated: 2025-01-15*
*Superadmin: jesus.cruzado@gmail.com*
