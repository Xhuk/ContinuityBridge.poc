# Development Scripts - Security Notice

⚠️ **IMPORTANT: These scripts are DEVELOPMENT-ONLY and contain sensitive information**

## Security Model

### ❌ **NEVER Deploy These Scripts to Production**

These scripts contain:
- Hardcoded administrator emails
- Development-only provisioning logic
- Internal team member information
- Database seeding with specific credentials

### ✅ **What's Safe for Production**

Production deployments use:
- **`server/src/setup/first-run.ts`** - Sanitized first-run initialization
  - No hardcoded emails
  - Reads from environment variables
  - Creates generic superadmin on first boot
  
### 🔒 **Files in This Directory**

| File | Purpose | Production Safe? |
|------|---------|------------------|
| `add-emilio-founder.ts` | Add QA Manager founder account | ❌ **NO** - Contains real email |
| `init-database.ts` | Initialize dev database schema | ⚠️ **Conditional** - Only schema is safe |

### 🛡️ **Protection Mechanisms**

1. **`.dockerignore`** - Excludes `scripts/` from Docker builds
2. **`.gitignore`** - Does NOT exclude (needed for team development)
3. **Export Orchestrator** - Generates clean seed files for customers

### 📦 **Customer Deployments**

When exporting to customers, the system generates:
- `init-database.sql` - Clean schema + placeholder admin
- `seed-database.js` - Programmatic initialization
- **NO hardcoded ContinuityBridge team emails**
- **NO development scripts**

### 🚀 **Production Bootstrap**

Production systems initialize via:

```typescript
// server/src/setup/first-run.ts
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || "admin@customer.com";
```

**Environment variables used:**
- `SUPERADMIN_EMAIL` - Customer's admin email
- `SUPERADMIN_API_KEY` - Secure API key (not in code)
- `ENCRYPTION_KEY` - Data encryption key

### ⚡ **Running Development Scripts**

```bash
# Development only - adds founder to local database
npm run tsx scripts/add-emilio-founder.ts

# Development only - initializes local dev database
npm run tsx scripts/init-database.ts
```

### 🔐 **Security Best Practices**

✅ **DO:**
- Use these scripts in development only
- Keep hardcoded values for team members here
- Document what each script does
- Review scripts before committing

❌ **DON'T:**
- Deploy scripts/ directory to production
- Include in Docker images
- Export to customer packages
- Commit customer-specific emails to scripts

---

## Questions?

If you need to provision users in production, use:
- Environment variables (`SUPERADMIN_EMAIL`)
- Admin UI (once first admin is created)
- API endpoints with superadmin authentication
