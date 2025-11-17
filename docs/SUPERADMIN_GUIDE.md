# ContinuityBridge - Superadmin Guide

## Overview
As a **Superadmin**, you have full system access and control over all customer organizations, consultants, licenses, exports, and system configuration. This is the complete operational manual.

---

## Your Role & Permissions

### Full System Access
✅ **Complete Control**
- Manage all customer organizations globally
- Create and manage Consultants
- Create Customer Admins and Customer Users for any organization
- Export flows and generate customer licenses
- Access all Error Triage Dashboard errors across all customers
- System configuration and environment management
- Release planning and deployment coordination
- **Project management** for customer implementations
- **Environment promotion filtering** (remove admin features from STAGING/PROD)
- **Postman collection generation** with credentials

### Your Email
Your superadmin account: **jesus.cruzado@gmail.com**

---

## System Architecture

### Multi-Tenant Hierarchy
```
Account (Monetization)
  └── Tenant (Customer Organization)
      └── Ecosystem (Business Domain: ERP, WMS, Marketplace)
          └── Environment (DEV, STAGING, PROD)
              └── System Instance (Billable Endpoint: JDA_PROD_US)
                  └── Flows (Integration Workflows)
```

### Environment Strategy

**DEV (Development)**:
- **Purpose**: Configurable "Forge" for building integrations
- **Characteristics**: Mutable, no approval required, instant deployment
- **Workflow**: draft → deployed
- **Use Case**: Active development, testing, experimentation

**STAGING (UAT)**:
- **Purpose**: Pre-production customer validation
- **Characteristics**: Pre-production testing, optional approval
- **Workflow**: draft → deployed (or draft → approved → deployed)
- **Use Case**: Customer UAT, integration testing, quality assurance

**PROD (Production)**:
- **Purpose**: Live customer integrations
- **Characteristics**: **IMMUTABLE** after deployment, requires approval
- **Workflow**: draft → pending_approval → approved → deployed (🔒 immutable)
- **Use Case**: Production workloads, revenue-generating integrations

⚠️ **CRITICAL**: Once deployed to PROD, a version becomes **IMMUTABLE**. Changes require a new version.

---

## Core Features

### 1. User Management

Access: **Menu → Users**

#### User Roles

| Role | Access Level | Can Create | Scope |
|------|-------------|------------|-------|
| **Superadmin** | Full system | Consultants, Customer Admins, Customer Users | Global |
| **Consultant** | Assigned customers | Customer Admins, Customer Users | Customer-scoped |
| **Customer Admin** | Own organization | Customer Users | Organization-scoped |
| **Customer User** | Read-only | None | Organization-scoped (read-only) |

#### Creating Users

**Create Consultant**:
1. Go to **Users** → **+ New User**
2. Email: `consultant@company.com`
3. Role: **Consultant**
4. **Assigned Customers**: Select organizations (multi-select)
5. Click **Create**
6. Consultant receives invitation email with magic link
7. API key generated automatically

**Create Customer Admin/User**:
1. Select **Organization** from dropdown
2. Choose **Role**: Customer Admin or Customer User
3. Enter **Email**
4. Click **Create**

#### Managing Consultants
- **View All Consultants**: See all consultant accounts
- **Assign Customers**: Update `assignedCustomers` array
- **Enable/Disable**: Toggle consultant access
- **Regenerate API Keys**: For security rotation
- **Delete**: Remove consultant (requires confirmation)

#### API Key Management
- Every user gets an API key for programmatic access
- Format: `cb_<uuid>`
- Usage: `curl -H "X-API-Key: cb_abc123..."`
- Can regenerate if compromised

---

### 2. Export & License Management

Access: **Menu → Export**

#### Export Process (Black Box)

**Purpose**: Generate deployable customer packages with embedded licenses

**What Gets Exported**:
- All flows for selected organization
- Interface configurations
- Data source settings
- Mappings and transformations
- Environment-specific configuration
- Embedded license key

**Export Workflow**:
1. Click **Generate Export**
2. Select **Organization**
3. Choose **License Type**:
   - Trial (30 days, 5 flows)
   - Professional (365 days, 50 flows)
   - Enterprise (365 days, unlimited)
4. Set **Max Flows** (if custom)
5. Choose **Environment**: production, staging, development
6. Toggle **Include Inactive Flows** (optional)
7. Click **Generate Package**

**Output**:
- ZIP file: `continuitybridge-{orgName}-{timestamp}.zip`
- Contains:
  - `manifest.json` - Package metadata
  - `license.enc` - Encrypted license
  - `flows/*.json` - Flow definitions
  - `interfaces/*.json` - Interface configs
  - `datasources/*.json` - Data source configs
  - `README.md` - Deployment instructions

#### License Management

**License Validation**:
- Licenses are validated on customer Docker instance startup
- URL: `https://your-domain/api/export/validate-license`
- Checks expiration, flow limits, organization match

**License Expiry Warnings**:
- Automatic emails sent at 30, 14, 7 days before expiration
- Sent to customer admin email via Resend
- Includes renewal contact information

**Revoking Licenses**:
- Disable organization in database
- License validation API returns `valid: false`
- Customer Docker instance blocks execution

---

### 3. Error Triage Dashboard (Global View)

Access: **Menu → Error Triage**

#### What You See
**ALL errors across ALL customers** - complete visibility

#### Superadmin Capabilities

**Global Filtering**:
- Organization (select specific customer or "All")
- Flow Name
- Status, Severity, Environment
- Date Range
- Error Type
- Execution Mode (Test vs Production)

**Bulk Operations**:
- Assign multiple errors to consultants
- Mass status updates
- Export error reports to CSV
- Generate incident reports

**Advanced Analytics**:
- Error trends by customer
- Most problematic flows
- Error types distribution
- Mean time to resolution (MTTR)
- Environment-specific failure rates

#### Error Investigation

**Simple View**:
- Organization and flow details
- Failed node information
- User-friendly error message
- Timestamp, run ID, trace ID

**Advanced View**:
- **Full Payload Snapshot**: Complete input data (up to 50KB)
- **Stack Trace**: Complete developer trace
- **Node Configuration**: Settings at time of failure
- **HTTP Context**: Status codes, methods, endpoints
- **Retry Attempts**: If applicable

#### Escalation Management

**Incoming Tickets**:
- View all escalated errors
- Filter by priority (Low, Medium, High, Urgent)
- Track ticket status
- Link to external systems (Jira, Zendesk)

**Email Notifications**:
- Escalation emails sent via Resend
- Priority-based color coding
- Full error context included
- Direct link to error detail page

---

### 4. Configuration Versioning & Deployment

Access: **Menu → Versions**

#### Version Management

**Semantic Versioning**: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes (e.g., new API integration)
- **MINOR**: New features (e.g., additional mapping rules)
- **PATCH**: Bug fixes and minor updates

**Creating Versions**:
1. Navigate to **Versions**
2. Click **+ Create Version**
3. Fill in:
   - **Label**: "Q1 2025 Integration Release"
   - **Description**: Detailed changelog
   - **Change Type**: Major, Minor, Patch (auto-increments version)
   - **Target Environment**: DEV, STAGING, PROD
4. **Configuration Snapshot**: Automatically captures all flows, interfaces, mappings
5. Submit

**Version Lifecycle by Environment**:

```
DEV:
  draft → deployed (mutable) ← Can modify after deployment

STAGING:
  draft → deployed (mutable) ← Can modify after deployment
  OR
  draft → pending_approval → approved → deployed (mutable)

PROD:
  draft → pending_approval → approved → deployed (🔒 IMMUTABLE)
  ↑ Only you can approve                        ↑ Cannot modify
```

#### Approval Workflow

**Pending Approvals**:
1. Go to **Versions** → **Pending Approval** tab
2. Review configuration changes
3. Check change summary (added, modified, deleted)
4. Click **Approve** or **Reject**
5. Add approval notes

**Deployment to PROD**:
1. Version must be in "approved" status
2. Click **Deploy**
3. Docker image built: `continuitybridge-{orgId}:{version}-prod`
4. Image pushed to registry
5. Deployment history recorded
6. Version marked **IMMUTABLE** (cannot be changed)

#### Environment Promotion

**DEV → STAGING**:
- Access: **Environment Promotion** → **Promote to Staging**
- Clones DEV configuration to STAGING environment
- Same version number, different environment
- Allows UAT validation before PROD
- **⚠️ FILTERED**: SuperAdmin pages/routes are **automatically removed**

**STAGING → PROD**:
- Access: **Environment Promotion** → **Promote to Production**
- Clones STAGING configuration to PROD
- Status: **pending_approval** (requires your approval)
- Cannot deploy until approved
- Becomes immutable after deployment
- **⚠️ FILTERED**: SuperAdmin AND Consultant pages/routes are **automatically removed**

**Automatic Filtering Rules**:

When promoting configurations, management layers are automatically excluded:

| Source | Target | What Gets Removed |
|--------|--------|-------------------|
| DEV → STAGING | STAGING | ❌ SuperAdmin project management<br>❌ `/admin/projects` routes |
| STAGING → PROD | PROD | ❌ SuperAdmin features<br>❌ Consultant tenant selection<br>❌ `/tenant-selector` routes<br>❌ Multi-tenant switching |

**Why Filter?**
- Customers don't need internal project management tools
- Production deployments should only contain operational features
- Cleaner, more secure customer environments
- Reduces attack surface and complexity

---

### 5. Change Request Management

Access: **Menu → Change Requests**

#### What Are Change Requests?
Consultants and customers propose configuration changes (mapping updates, new flows, interface changes) that require your approval.

#### Change Request Workflow

**Incoming Requests**:
1. Consultant creates change request
2. You receive notification
3. Go to **Change Requests** → **Pending** tab
4. Review:
   - Request type (Mapping Change, Flow Update, Interface Config)
   - Proposed changes (JSON diff)
   - Impact level (Low, Medium, High, Critical)
   - Affected resources

**Approval Process**:
1. Click on change request
2. Review proposed changes:
   - **Old Value**: Current configuration
   - **New Value**: Proposed configuration
   - **Action**: Create, Update, Delete
3. Test in DEV environment (optional)
4. Click **Approve** or **Reject**
5. Add review notes
6. Notify consultant

**Deployment**:
- Approved changes automatically applied
- Version incremented
- Deployment history updated
- Consultant notified

---

### 6. Release Planning & Tracking

Access: **Menu → Release Plans**

#### What Are Release Plans?
Coordinated deployment schedules across DEV → STAGING → PROD with customer go-live dates.

#### Creating a Release Plan

1. Click **+ New Release Plan**
2. Fill in:
   - **Release Name**: "Q1 2025 Integration Release"
   - **Release Type**: Initial Deployment, Feature Release, Hotfix, Migration
   - **Organization**: Select customer
3. Configure schedules:

**DEV Schedule**:
- Planned Date: 2025-01-15
- Actual Date: (filled after deployment)
- Status: Pending, In Progress, Completed, Failed
- Notes: "Development complete"

**STAGING Schedule (UAT)**:
- Planned Date: 2025-02-01
- UAT Duration: "2 weeks"
- UAT Participants: ["customer@company.com"]
- Go-Live Expectations: "Full order sync validation"
- Status: Pending, In Progress, Completed, Failed

**PROD Schedule**:
- Planned Go-Live: 2025-02-15
- Maintenance Window: "Saturday 2AM-6AM EST"
- Rollback Plan: "Revert to v1.2.0"
- Post-Deployment Validation: "Monitor for 24 hours"
- Status: Pending, In Progress, Completed, Failed

4. **Link Versions**: Associate configuration versions
5. **Assign Owner**: Consultant responsible
6. Submit

#### Tracking Releases

**Dashboard View**:
- All active releases
- Status by environment (DEV ✅ STAGING 🟡 PROD ⏳)
- Days until go-live
- Critical path items

**Release Detail**:
- Environment timeline
- Version associations
- Deployment history
- Related change requests
- Customer communications

---

### 7. Integration Notes (Knowledge Base)

Access: **Menu → Integration Notes**

#### Purpose
Centralized knowledge base for integration patterns, troubleshooting, and best practices.

#### Creating Notes

1. Click **+ New Note**
2. Fill in:
   - **Title**: "SAP Order Sync Configuration"
   - **Category**: Architecture, Mapping, API Config, Data Model, Business Logic, Testing, Deployment, Troubleshooting
   - **Content**: Markdown supported (headings, code blocks, lists, tables)
   - **Tags**: ["SAP", "SFTP", "Order Sync", "Critical"]
3. **Link to Resources**:
   - Release Plan ID
   - Version ID
   - Flow ID
   - Interface ID
4. **Visibility**:
   - Public: Visible to all consultants
   - Private: Superadmin only
5. **Pin**: Feature important notes at top
6. Submit

#### Note Categories

- **Architecture**: System design patterns, integration strategies
- **Mapping**: Transformation rules, field mappings
- **API Config**: Endpoint configurations, authentication
- **Data Model**: Schema definitions, data structures
- **Business Logic**: Validation rules, business processes
- **Testing**: Test scenarios, emulation mode usage
- **Deployment**: Rollout procedures, environment promotion
- **Troubleshooting**: Common issues and resolutions

#### Best Practices
- Document complex integrations
- Share successful patterns
- Record troubleshooting steps
- Link to related resources
- Keep notes updated

---

### 8. Project Management (SuperAdmin Only)

Access: **Menu → SuperAdmin → Projects**

#### Purpose
Manage customer implementation projects, track stages (dev/test/staging/prod), assign consultants, and coordinate go-live schedules.

#### Creating a Project

1. Navigate to **SuperAdmin → Projects**
2. Click **+ New Project**
3. Fill in project details:
   - **Organization Name**: Customer company name
   - **Project Goal**: "Implement SAP-to-WMS order sync"
   - **Description**: Detailed project scope
   - **Assigned Consultants**: Select consultants (multi-select)
   - **Status**: Planning, In Progress, Completed, On Hold

4. **Project Stages** (auto-created):
   - **Development**: DEV environment setup and testing
   - **Testing**: TEST environment validation
   - **Staging/UAT**: Customer acceptance testing
   - **Production**: Live deployment

5. Click **Create Project**

#### Managing Project Stages

**Stage Tracking**:
- Each stage has its own status: Not Started, In Progress, Completed, Blocked
- Track start date and completion date
- Add notes for each stage milestone

**Stage Details**:
```
Stage: Development (DEV)
Status: In Progress
Start Date: 2025-01-15
Notes: "Flow configured, pending mapping approval"

Stage: Testing (TEST)
Status: Not Started

Stage: Staging (UAT)
Status: Not Started

Stage: Production (PROD)
Status: Not Started
```

#### Consultant Assignment

**Assigning Consultants**:
1. Open project
2. Click **Edit**
3. Select consultants from **Assigned Consultants** dropdown
4. Save changes

**Consultant Notifications**:
- Consultants receive email when assigned to project
- Notifications sent when stage status changes
- Alerts for blocked stages requiring attention

#### Project Lifecycle

**Planning Phase**:
1. Create project with organization details
2. Set project goals and scope
3. Assign consultants
4. Define stage milestones

**Execution Phase**:
1. Move Development stage to "In Progress"
2. Consultants configure flows in DEV
3. Mark Development as "Completed"
4. Progress through Test → Staging → Prod

**Completion**:
1. All stages marked "Completed"
2. Project status set to "Completed"
3. Handoff to customer support team

#### Viewing Projects

**Project List**:
- Filter by status (Planning, In Progress, Completed, On Hold)
- Search by organization name
- Sort by creation date, status, assigned consultants

**Project Details**:
- Organization information
- Project goal and description
- Stage progress tracker
- Assigned consultants list
- Creation and last updated timestamps

#### Editing Projects

**Allowed Changes**:
- Update project goal or description
- Change assigned consultants
- Update project status
- Modify stage status, dates, and notes

**Cannot Change**:
- Organization name (linked to tenant)
- Project ID
- Creation timestamp

#### Deleting Projects

1. Click **Delete** on project card
2. Confirm deletion
3. **Warning**: This action cannot be undone

**⚠️ Important**: Projects are **automatically filtered out** when promoting to STAGING/PROD - they're only for internal management.

---

### 9. Postman Collection Export

Access: **Settings → Postman** tab

#### Purpose
Generate Postman collections for API testing of configured interfaces and flows, with environment-specific authentication and sample payloads.

#### Collection Features

**Auto-Generated Content**:
- ✅ All configured interfaces (inbound/outbound)
- ✅ Flow webhook triggers
- ✅ Flow manual execution endpoints
- ✅ Authentication headers (API Key, Bearer, Basic Auth, OAuth2)
- ✅ Sample request payloads (XML/JSON)
- ✅ Environment variables (base_url, credentials)
- ✅ Internal API endpoints (health, metrics, events)

#### Generating a Collection

1. Navigate to **Settings → Postman**
2. Configure export options:

**Environment Selection**:
- **DEV**: `http://localhost:5000`
- **STAGING**: `https://api.staging.com`
- **PROD**: `https://api.production.com`

**Include Secrets** (SuperAdmin Only):
- ✅ **Enabled**: Exports actual API keys, tokens, passwords
- ❌ **Disabled**: Uses placeholders (`{{api_key}}`, `{{bearer_token}}`)

**Include Flow Triggers**:
- ✅ Adds webhook and manual trigger endpoints
- ❌ Excludes flow-related requests

**Include Sample Payloads**:
- ✅ Adds example XML/JSON request bodies
- ❌ Requests have empty bodies

3. Click **Download Collection**
4. File downloads: `{organization}-{environment}-collection.json`

#### Collection Structure

```
ContinuityBridge - DEV API Collection/
├── Inbound Interfaces (Sources)/
│   ├── SAP ERP (REST API)
│   ├── Amazon Marketplace (GraphQL)
│   └── SFTP File Monitor (SFTP)
│
├── Outbound Interfaces (Destinations)/
│   ├── JDA WMS (SOAP)
│   ├── Shipstation (REST API)
│   └── Email Notification (SMTP)
│
├── Flow Triggers/
│   ├── Trigger: Order Sync Flow
│   ├── Manual Trigger: Order Sync Flow
│   └── Trigger: Inventory Update Flow
│
└── ContinuityBridge Internal APIs/
    ├── Health Check
    ├── Metrics Snapshot
    └── Recent Events
```

#### Authentication Examples

**API Key Authentication**:
```
Header: X-API-Key
Value: {{api_key}}  (placeholder)
   or: sk_live_abc123...  (actual secret if SuperAdmin exports)
```

**Bearer Token**:
```
Auth Type: Bearer Token
Token: {{bearer_token}}  (placeholder)
    or: eyJhbGc...  (actual token if SuperAdmin exports)
```

**Basic Auth**:
```
Auth Type: Basic Auth
Username: {{username}}  (placeholder)
Password: {{password}}  (placeholder)
```

**OAuth2**:
```
Auth Type: OAuth2
Token URL: https://api.example.com/oauth/token
Client ID: {{oauth_client_id}}
Client Secret: {{oauth_client_secret}}
Grant Type: client_credentials
```

#### Sample Payload Examples

**XML Payload** (for SOAP/XML interfaces):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Request>
  <Header>
    <Timestamp>2025-01-15T10:30:00Z</Timestamp>
    <InterfaceId>abc-123</InterfaceId>
  </Header>
  <Payload>
    <Item>
      <Id>SAMPLE-001</Id>
      <Name>Sample Item</Name>
      <Quantity>10</Quantity>
    </Item>
  </Payload>
</Request>
```

**JSON Payload** (for REST/GraphQL interfaces):
```json
{
  "header": {
    "timestamp": "2025-01-15T10:30:00Z",
    "interfaceId": "abc-123"
  },
  "payload": {
    "items": [
      {
        "id": "SAMPLE-001",
        "name": "Sample Item",
        "quantity": 10
      }
    ]
  }
}
```

#### Using the Collection in Postman

**Step 1: Import**
1. Open Postman
2. Click **Import**
3. Select downloaded `.json` file
4. Collection appears in sidebar

**Step 2: Configure Variables**
1. Click on collection name
2. Go to **Variables** tab
3. Set values:
   - `base_url`: Your API endpoint
   - `api_key`: Your API key (if not auto-filled)
   - `bearer_token`: Your token
   - `username`/`password`: Credentials

**Step 3: Test Interfaces**
1. Expand **Inbound Interfaces** folder
2. Select an interface request
3. Click **Send**
4. View response

**Step 4: Trigger Flows**
1. Expand **Flow Triggers** folder
2. Select flow to test
3. Modify sample payload if needed
4. Click **Send**
5. Check flow execution in ContinuityBridge dashboard

#### Regenerating Collections

**When to Regenerate**:
- ✅ After adding new interfaces
- ✅ After creating new flows
- ✅ After modifying authentication settings
- ✅ After changing endpoint URLs
- ✅ When switching environments

**How to Regenerate**:
1. Go to **Settings → Postman**
2. Click **Regenerate** button
3. System rebuilds collection with latest configuration
4. Click **Download Collection**
5. Re-import to Postman (replaces existing)

#### Collection Statistics

**Overview Dashboard** shows:
- Total interfaces (by direction: inbound/outbound/bidirectional)
- Protocol breakdown (REST API, SOAP, SFTP, GraphQL, etc.)
- Authentication types (API Key, Bearer, OAuth2, Basic Auth)
- Total flows
- Enabled flows
- Flows with webhook triggers

#### Security Considerations

**⚠️ SuperAdmin Access**:
- Only SuperAdmin can export collections with actual credentials
- Consultants and customers get placeholder variables
- Prevents credential leakage to unauthorized users

**Best Practices**:
1. **Never commit** collections with real credentials to version control
2. **Use environment variables** in Postman for secrets
3. **Regenerate** credentials if collection is compromised
4. **Export without secrets** for sharing with team members
5. **Rotate API keys** periodically

**Credential Placeholders** (non-SuperAdmin):
```
{{api_key}}          ← User must provide
{{bearer_token}}     ← User must provide
{{username}}         ← User must provide
{{password}}         ← User must provide
{{oauth_client_id}}  ← User must provide
```

---

### 10. System Logs & Monitoring

Access: **Menu → Logs**

#### Log Scopes

**Superadmin Scope**:
- Global system events
- License validations
- Export operations
- User management
- System errors

**Customer Scope**:
- Per-organization operations
- Flow executions
- API requests
- Integration events
- Customer errors

#### Querying Logs

**Filters**:
- **Level**: Debug, Info, Warn, Error
- **Scope**: Superadmin or Customer
- **Service**: FlowOrchestrator, MagicLinkService, LicenseManager
- **Organization**: Specific customer
- **Flow ID**: Specific flow
- **Trace ID**: End-to-end trace
- **Date Range**: Start and end timestamps
- **Search**: Free-text search

**Log Output**:
```json
{
  "timestamp": "2025-11-15T10:30:00Z",
  "level": "error",
  "scope": "customer",
  "service": "FlowOrchestrator",
  "message": "Flow execution failed",
  "organizationId": "org-123",
  "flowId": "flow-456",
  "runId": "run-789",
  "errorStack": "Error: Validation failed..."
}
```

#### Log Retention
- **File Logs**: 14 days rotation (daily files)
- **Database Logs**: 30 days default (configurable per customer)
- **Archive**: S3/Azure Blob for long-term storage

---

### 9. First-Run Setup

#### System Initialization

When deploying to Render for the first time:

1. **Environment Validation**:
   - System checks for required environment variables
   - Missing variables displayed in banner

2. **Superadmin Creation**:
   - Your email (`jesus.cruzado@gmail.com`) pre-seeded
   - Temporary password generated
   - API key created
   - Logged once on startup (check console)

3. **Required Environment Variables**:

**Production (REQUIRED)**:
```bash
# Authentication
SUPERADMIN_API_KEY=your-secure-api-key
ENCRYPTION_KEY=32-character-encryption-key

# Domain Configuration
APP_URL=https://your-domain.com
APP_DOMAIN=your-domain.com
EXPORT_DOMAIN=your-domain.com
EXPORT_CONTACT_EMAIL=support@your-domain.com

# Email Service (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@your-domain.com

# OAuth2 (Optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback

# Database (Render PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5432/db

# Server
NODE_ENV=production
PORT=3000
```

**Development (Optional)**:
```bash
NODE_ENV=development
PORT=3000
# Other variables optional for dev
```

4. **System Readiness Check**:
   - Access: `GET /api/system/requirements`
   - Returns:
     ```json
     {
       "ready": true,
       "superadminExists": true,
       "database": { "connected": true },
       "email": { "configured": true },
       "security": {
         "apiKeySet": true,
         "encryptionKeySet": true
       }
     }
     ```

---

### 10. Security Configuration

#### Production Security (Auto-Enabled)

**Helmet Headers**:
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff

**CORS**:
- **Production**: Whitelist specific domains
- **Development**: Allow all origins

**Rate Limiting**:
- **Production**: 100 requests per 15 minutes
- **Development**: 1000 requests per minute
- **Magic Link**: 3 requests per minute (prod)
- **Health Check**: No rate limit

**Input Validation**:
- Express-validator on all POST/PUT/PATCH routes
- Sanitization of user inputs
- SQL injection prevention (Drizzle ORM)

#### Authentication Methods

**Magic Link** (Passwordless):
- Email-based login
- Temporary token (15 minutes)
- Sent via Resend
- No password required

**Password** (Optional):
- bcrypt hashing (12 rounds)
- Minimum 8 characters
- Must change on first login if temporary

**API Key**:
- Format: `cb_<uuid>`
- Header: `X-API-Key: YOUR_KEY`
- Never expires (rotate manually)
- Stored hashed in database

**OAuth2** (Google):
- Google authentication
- Configured via environment variables
- Maps to existing user by email

---

## Production Deployment Guide

### Deploying to Render

#### Prerequisites
1. Render account created
2. PostgreSQL database provisioned
3. Domain configured (optional but recommended)
4. Resend API key obtained

#### Deployment Steps

**1. Create Web Service**:
- Name: ContinuityBridge
- Environment: Node
- Build Command: `npm run build`
- Start Command: `npm run start`
- Instance Type: Standard (minimum)

**2. Configure Environment Variables**:
Paste all required variables from First-Run Setup section above.

**3. Connect Database**:
- Link Render PostgreSQL instance
- `DATABASE_URL` auto-populated

**4. Deploy**:
- Click **Create Web Service**
- Wait for build to complete
- Monitor logs for:
  ```
  🔐 Superadmin created successfully!
  📧 Email: jesus.cruzado@gmail.com
  🔑 Temporary Password: [generated-password]
  🚀 ContinuityBridge ready!
  ```

**5. First Login**:
- Navigate to deployed URL
- Enter: `jesus.cruzado@gmail.com`
- Use temporary password from logs
- Change password immediately

#### Post-Deployment Checklist
- [ ] Verify `/api/system/requirements` returns `ready: true`
- [ ] Test magic link email delivery
- [ ] Create first consultant account
- [ ] Create first customer organization
- [ ] Test flow execution
- [ ] Monitor error triage dashboard
- [ ] Set up custom domain (if applicable)

---

## Advanced Operations

### Docker Deployment (Customer Exports)

#### Building Customer Images

**Automatic** (via Export API):
```bash
POST /api/versions/:id/deploy
{
  "organizationId": "org-123"
}
```

**Manual**:
```bash
docker build -t continuitybridge-org-123:1.2.3-prod .
docker tag continuitybridge-org-123:1.2.3-prod \
  registry.example.com/continuitybridge-org-123:1.2.3-prod
docker push registry.example.com/continuitybridge-org-123:1.2.3-prod
```

#### Image Naming Convention
Format: `continuitybridge-{orgId}:{version}-{environment}`

Examples:
- `continuitybridge-acme:1.0.0-dev`
- `continuitybridge-acme:1.5.2-staging`
- `continuitybridge-acme:2.0.0-prod`

#### Deployment History Tracking
Every deployment recorded in `deploymentHistory` table:
- Deployment type (initial, update, rollback, hotfix)
- Docker image tag
- Status (pending, building, pushing, deploying, success, failed)
- Build logs
- Deployment logs

---

### Database Management

#### Schema Migrations

**Manual Migration** (if needed):
```bash
cd server
npm run db:push  # Push schema changes to DB
npm run db:studio  # Open Drizzle Studio for inspection
```

**Tables Created**:
- `users` - User accounts and authentication
- `system_logs` - Application logs
- `log_configurations` - Per-org log settings
- `configuration_versions` - Version snapshots
- `change_requests` - Configuration change proposals
- `deployment_history` - Deployment tracking
- `release_plans` - Release scheduling
- `integration_notes` - Knowledge base
- `error_reports` - Production error capture
- `error_comments` - Error investigation notes
- `error_escalation_tickets` - Support ticket tracking
- `accounts`, `tenants`, `ecosystems`, `environments`, `system_instances` - Multi-tenant hierarchy
- `flow_definitions`, `flow_runs`, `flow_join_states` - Flow execution
- `interfaces`, `integration_events` - Interface management

#### Backup Strategy
- **Automated**: Render PostgreSQL daily backups
- **Manual**: Export critical tables before major changes
- **Recovery**: Point-in-time restore from Render dashboard

---

## Troubleshooting

### Common Superadmin Issues

**Cannot Login**:
- Check logs for generated temporary password
- Use magic link instead (sent to `jesus.cruzado@gmail.com`)
- Verify `SUPERADMIN_API_KEY` environment variable set
- Check database for user record: `SELECT * FROM users WHERE role = 'superadmin'`

**Resend Emails Not Sending**:
- Verify `RESEND_API_KEY` is set correctly
- Check Resend dashboard for failed emails
- Verify `RESEND_FROM_EMAIL` is authorized domain
- Test: `GET /api/system/requirements` → check `email.configured`

**License Validation Failing**:
- Check `ENCRYPTION_KEY` matches between export and customer instance
- Verify `LICENSE_VALIDATION_URL` is accessible
- Check customer instance logs for validation errors
- Regenerate license if expired

**Docker Deployment Failing**:
- Check build logs in deployment history
- Verify Docker registry credentials
- Ensure sufficient disk space
- Check network connectivity to registry

**Error Triage Not Capturing**:
- Verify flow executed in production mode (not emulation)
- Check `NODE_ENV=production`
- Review flow orchestrator logs
- Test error capture with intentional flow failure

### Performance Optimization

**Database**:
- Add indexes on frequently queried columns (flowId, organizationId, traceId)
- Archive old logs and errors to reduce table size
- Use connection pooling (configured in DATABASE_URL)

**API**:
- Enable Redis caching for frequently accessed data
- Use CDN for static assets
- Optimize large payload queries with pagination

**Docker Images**:
- Multi-stage builds to reduce image size
- Layer caching for faster builds
- Compress large assets

---

## API Reference (Superadmin)

### Authentication
All endpoints require authentication. Use one of:
- Magic link session cookie
- API key header: `X-API-Key: YOUR_KEY`

### Key Endpoints

#### User Management
```bash
# List all users
GET /api/users

# Create consultant
POST /api/users
{
  "email": "consultant@company.com",
  "role": "consultant",
  "assignedCustomers": ["org-1", "org-2"]
}

# Enable/disable user
PATCH /api/users/:id/enable
{ "enabled": false }
```

#### Export & License
```bash
# Generate export package
POST /api/export/generate
{
  "organizationId": "org-123",
  "organizationName": "ACME Corp",
  "licenseType": "professional",
  "licenseDays": 365,
  "maxFlows": 50,
  "environment": "production"
}

# Validate license (called by customer instance)
POST /api/export/validate-license
{
  "organizationId": "org-123",
  "encryptedLicense": "..."
}
```

#### Version Management
```bash
# List versions
GET /api/versions?organizationId=org-123

# Create version
POST /api/versions
{
  "organizationId": "org-123",
  "label": "Q1 Release",
  "changeType": "minor",
  "targetEnvironment": "prod"
}

# Approve version (superadmin only)
POST /api/versions/:id/approve

# Deploy version
POST /api/versions/:id/deploy
```

#### Error Triage
```bash
# List all errors (global view)
GET /api/error-triage?organizationId=org-123&severity=high&environment=prod

# Get error detail
GET /api/error-triage/:id

# Update error status
PATCH /api/error-triage/:id
{
  "triageStatus": "resolved",
  "resolutionNotes": "Fixed mapping rule"
}

# Escalate error
POST /api/error-triage/:id/escalate
{
  "priority": "high",
  "includeAdvancedContext": true
}
```

---

## Glossary

**Black Box Export**: Deployable customer package with embedded license (customers cannot see/modify flows)

**Immutable**: Configuration that cannot be modified after deployment (PROD versions only)

**Emulation Mode**: Testing mode that bypasses live authentication using mock credentials

**Error Context Snapshot**: Complete error details including payload, stack trace, node config

**Semantic Versioning**: MAJOR.MINOR.PATCH version numbering scheme

**Multi-Tenant**: Single application serving multiple isolated customer organizations

**RBAC**: Role-Based Access Control (Superadmin, Consultant, Customer Admin, Customer User)

**UAT**: User Acceptance Testing (done in STAGING environment)

**Go-Live**: Production deployment date

**Rollback Plan**: Procedure to revert to previous version if deployment fails

**Triage**: Process of investigating, prioritizing, and resolving errors

---

## Support

As Superadmin, you are the escalation point for all consultants.

**Your Responsibilities**:
- Respond to escalated errors within 24 hours
- Review and approve change requests within 48 hours
- Approve PROD deployments after thorough review
- Maintain system health and performance
- Coordinate release schedules
- Generate customer licenses
- Troubleshoot critical system issues

**Internal Support**:
- CTO: Technical architecture questions
- Engineering Team: Bug fixes, feature requests
- Infrastructure: Render deployment, scaling

---

*Last Updated: 2025-01-15*
*Superadmin: jesus.cruzado@gmail.com*
*Version: 2.0 (with Project Management, Environment Filtering, and Postman Export)*
