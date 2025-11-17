# ContinuityBridge - CTO Technical Overview

## Executive Summary

**ContinuityBridge** is a **multi-tenant middleware integration platform** designed to connect disparate business systems (WMS, ERP, Marketplace, TMS, 3PL) through visual, no-code flow orchestration. The platform enables consultants to build, test, and deploy customer-specific integrations while maintaining complete data isolation and security.

**Key Differentiators**:
- **Visual Flow Builder**: No-code integration design with real-time testing
- **Multi-Tenant Architecture**: Complete customer isolation with RBAC
- **Black Box Exports**: Deployable customer packages with embedded licenses
- **Environment-Aware Versioning**: DEV (mutable) → STAGING (UAT) → PROD (immutable)
- **Production Error Triage**: Automated error capture with full context snapshots
- **Emulation Mode**: Test integrations without live system access

---

## Architecture

### Technology Stack

#### **Backend**
- **Runtime**: Node.js 20.x
- **Framework**: Express.js (REST API)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL (Drizzle ORM) / SQLite (development)
- **Queue**: BullMQ (Redis-backed) / In-Memory (development)
- **Email**: Resend API (transactional emails)
- **Logging**: Winston (rotating file logs + database)
- **Security**: Helmet, CORS, express-rate-limit, bcrypt, passport

#### **Frontend**
- **Framework**: React 18 + Vite
- **UI Library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Flow Canvas**: React Flow (visual node editor)
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router v6

#### **Infrastructure**
- **Deployment**: Render.com (web service + PostgreSQL)
- **Container**: Docker (customer exports)
- **Storage**: File system / S3 / Azure Blob (configurable)
- **Monitoring**: Winston logs + Error Triage Dashboard

---

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ContinuityBridge Platform                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Frontend   │  │  REST API    │  │  Background  │       │
│  │  (React)    │◄─┤  (Express)   │◄─┤  Workers     │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                  │               │
│         │                 ▼                  ▼               │
│         │          ┌──────────────┐   ┌──────────────┐      │
│         │          │  PostgreSQL  │   │    Redis     │      │
│         │          │  (Drizzle)   │   │   (BullMQ)   │      │
│         │          └──────────────┘   └──────────────┘      │
│         │                 │                                  │
│         └─────────────────┴──────────────────────┐          │
│                                                    ▼          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Flow Orchestrator (Execution Engine)        │   │
│  │  • Node executors (parsers, transformers, connectors)│   │
│  │  • Real-time error capture                           │   │
│  │  • Emulation mode support                            │   │
│  │  • Conditional routing                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────┐            │
│  │      External Systems (via Interfaces)      │            │
│  │  • REST APIs • SOAP • SFTP • FTP • Database │            │
│  │  • Message Queues • Webhooks                │            │
│  └─────────────────────────────────────────────┘            │
│                                                               │
└─────────────────────────────────────────────────────────────┘

                          │
                          ▼
        ┌─────────────────────────────────────┐
        │    Customer Docker Instances        │
        │  (Black Box Exports with Licenses)  │
        └─────────────────────────────────────┘
```

---

### Multi-Tenant Data Model

#### **Hierarchy**
```
Account (Monetization Layer)
  ├── maxTenants, maxEcosystems, maxInstances
  ├── licenseTier: free | professional | enterprise
  │
  └── Tenant (Customer Organization)
      ├── displayName, enabled
      │
      └── Ecosystem (Business Domain)
          ├── type: erp | marketplace | wms | tms | 3pl
          │
          └── Environment (DEV | STAGING | PROD)
              │
              └── System Instance (Billable Endpoint)
                  ├── endpoint, enabled
                  │
                  └── Flows (Integration Workflows)
                      ├── nodes[], edges[]
                      ├── version, enabled
                      └── metadata
```

#### **Key Tables**

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Authentication & RBAC | email, role, organizationId, assignedCustomers |
| `accounts` | Monetization | licenseTier, maxTenants, expiresAt |
| `tenants` | Customer organizations | accountId, name, enabled |
| `ecosystems` | Business domains | tenantId, type (erp/wms/etc) |
| `environments` | Deployment stages | ecosystemId, name (dev/staging/prod) |
| `system_instances` | Billable endpoints | environmentId, endpoint, enabled |
| `flow_definitions` | Integration workflows | systemInstanceId, nodes, edges, version |
| `flow_runs` | Execution history | flowId, status, inputData, outputData |
| `configuration_versions` | Snapshots | organizationId, version, targetEnvironment, isImmutable |
| `error_reports` | Production errors | flowId, nodeId, runId, payloadSnapshot, stackTrace |
| `interfaces` | External system configs | type, protocol, endpoint, authType |

---

## Core Features

### 1. Visual Flow Builder

**Technology**: React Flow (open-source node editor)

**Node Types** (28 total):
- **Triggers**: manual_trigger, webhook_trigger, timer_trigger, scheduler, sftp_poller, azure_blob_poller
- **Parsers**: xml_parser, json_parser, csv_parser, edi_parser, excel_parser, bydm_parser
- **Transformers**: object_mapper, custom_javascript, bydm_mapper, aggregate, split
- **Validators**: validation
- **Connectors**: interface_source, interface_destination, sftp_connector, azure_blob_connector, database_connector, http_request
- **Control Flow**: conditional, join, filter, loop
- **Utilities**: logger, error_handler, delay

**Execution Model**:
1. Load flow definition from database
2. Find entry node (trigger with no incoming edges)
3. Execute nodes in topological order (respecting edge dependencies)
4. Track execution status, timing, errors for each node
5. Store node outputs for downstream nodes
6. Handle conditional routing based on node metadata
7. Return final output or error

**Emulation Mode**:
- Bypasses live authentication (injects mock headers)
- Allows flow testing without external system access
- Validates core logic and data transformations
- Identifies configuration errors before production

---

### 2. Error Reporting & Triage System

#### **Production Error Capture** (Automatic)

**Trigger**: Flow node fails in production (executionMode === "production")

**Process**:
1. Node throws error
2. `FlowOrchestrator` catches exception
3. Calls `captureErrorReport()` method
4. POST to `/api/error-triage` (internal)
5. Error report created in database (silent mode, no UI alerts)

**Data Captured**:
```typescript
{
  organizationId, organizationName,
  flowId, flowName, flowVersion,
  runId, traceId,
  nodeId, nodeName, nodeType,
  errorType: "validation" | "api_error" | "timeout" | ...,
  errorMessageSimple: "Validation Node: order_id missing",
  errorMessageTechnical: "ValidationError: Required field...",
  payloadSnapshot: { /* input data, truncated to 50KB */ },
  stackTrace: "Error: ...\n  at ValidationNode.execute...",
  nodeConfig: { /* node settings at time of failure */ },
  environment: "prod",
  executionMode: "production",
  severity: "high", // auto-calculated
  metadata: {
    httpStatus: 404,
    httpMethod: "GET",
    endpoint: "https://api.example.com/orders"
  }
}
```

**Error Triage Dashboard**:
- Role-based access (Superadmin sees all, Consultants see assigned customers)
- Filterable table (status, severity, environment, flow, date)
- Simple view (user-friendly error) + Advanced view (full context)
- Status workflow: new → investigating → resolved
- Comment tracking for investigation progress
- Escalation to Superadmin with email notification

---

### 3. Configuration Versioning

#### **Environment Strategy**

| Environment | Characteristics | Approval Required | Mutable After Deploy |
|-------------|----------------|-------------------|---------------------|
| **DEV** | Configurable "Forge" | ❌ No | ✅ Yes |
| **STAGING** | UAT validation | ⚠️ Optional | ✅ Yes |
| **PROD** | Live customer integrations | ✅ Yes (Superadmin) | ❌ No (IMMUTABLE) |

**Semantic Versioning**: `MAJOR.MINOR.PATCH`
- Auto-increments based on `changeType`
- Each environment maintains separate version history
- Versions scoped by `organizationId` + `targetEnvironment`

**Version Lifecycle (PROD)**:
```
1. draft         - Created by consultant
2. pending_approval - Submitted for review
3. approved      - Approved by superadmin
4. deployed      - Docker image built & deployed
                   ↓
              🔒 IMMUTABLE (cannot modify)
```

**Promotion Workflow**:
```
DEV → STAGING:  Clone configuration to STAGING
STAGING → PROD: Clone to PROD (requires approval)
```

**Docker Image Naming**:
```
continuitybridge-{orgId}:{version}-{environment}

Examples:
  continuitybridge-acme:1.0.0-dev
  continuitybridge-acme:1.5.2-staging
  continuitybridge-acme:2.0.0-prod
```

---

### 4. Black Box Export & Licensing

#### **Export Process**

**Purpose**: Generate deployable customer packages with embedded licenses (no source code visibility)

**What Gets Exported**:
```
continuitybridge-{orgName}-{timestamp}.zip
├── manifest.json          # Package metadata
├── license.enc            # Encrypted license
├── flows/
│   ├── order-sync.json
│   └── inventory-sync.json
├── interfaces/
│   ├── sap-erp.json
│   └── amazon-marketplace.json
├── datasources/
│   └── sftp-orders.json
└── README.md              # Deployment instructions
```

**License Encryption**:
- AES-256-GCM encryption
- Key: `ENCRYPTION_KEY` environment variable (must match customer instance)
- Payload:
  ```json
  {
    "organizationId": "org-123",
    "organizationName": "ACME Corp",
    "licenseType": "professional",
    "issuedAt": "2025-01-01T00:00:00Z",
    "expiresAt": "2026-01-01T00:00:00Z",
    "maxFlows": 50,
    "signature": "sha256-hash"
  }
  ```

**License Validation** (Customer Instance):
1. Docker container starts
2. Reads `license.enc`
3. POST to `LICENSE_VALIDATION_URL/api/export/validate-license`
4. Platform validates:
   - organizationId matches
   - License not expired
   - Flow count ≤ maxFlows
5. Returns `{ valid: true }` or `{ valid: false, reason: "..." }`
6. If invalid, container blocks execution

**Expiry Warnings**:
- Automatic emails at 30, 14, 7 days before expiration
- Sent via Resend to customer admin email

---

### 5. Authentication & Security

#### **Authentication Methods**

**1. Magic Link** (Passwordless):
- Email-based login
- Temporary token (15 minutes)
- Sent via Resend
- Session cookie created on verification

**2. Password** (Optional):
- bcrypt hashing (12 rounds)
- Temporary password on first login
- Must change after first use

**3. API Key**:
- Format: `cb_<uuid>`
- Header: `X-API-Key: YOUR_KEY`
- Stored hashed in database
- Used for programmatic access

**4. OAuth2** (Google):
- Google authentication
- Maps to existing user by email
- Requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

#### **Role-Based Access Control (RBAC)**

| Role | Global Access | Org-Scoped | Can Export | Can Create Users | Can Approve Versions |
|------|--------------|------------|------------|------------------|---------------------|
| **Superadmin** | ✅ All orgs | - | ✅ Yes | ✅ All roles | ✅ Yes |
| **Consultant** | ❌ No | ✅ Assigned customers | ❌ No | ✅ Customer Admin/User | ❌ No |
| **Customer Admin** | ❌ No | ✅ Own org only | ❌ No | ✅ Customer User | ❌ No |
| **Customer User** | ❌ No | ✅ Own org only | ❌ No | ❌ No | ❌ No |

**Middleware Chain**:
```typescript
authenticateUser → requireRole("superadmin") → handler

// Validates:
1. Session cookie OR API key header
2. User role matches required role(s)
3. Organization access (if scoped)
```

#### **Production Security**

**Helmet** (Security Headers):
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block

**CORS**:
- Production: Whitelist specific domains
- Development: Allow all origins

**Rate Limiting**:
| Endpoint | Prod Limit | Dev Limit |
|----------|-----------|-----------|
| Global API | 100/15min | 1000/min |
| Magic Link | 3/min | 20/min |
| Health Check | Unlimited | Unlimited |

**Input Validation**:
- express-validator on all mutations
- Sanitization of user inputs
- SQL injection prevention (Drizzle ORM parameterized queries)

---

## Data Flow Examples

### 1. Flow Execution (Production)

```
1. External System → POST /api/flows/:id/execute
   { input: { orderId: "12345" } }

2. Express Route Handler
   ↓
3. FlowOrchestrator.executeFlow(flowId, input, "manual", false)
   ↓
4. Load flow definition from database
   ↓
5. Find entry node (manual_trigger)
   ↓
6. Execute nodes in topological order:
   a. xml_parser → parseXML(input)
   b. object_mapper → transform(parsed, yamlRules)
   c. validation → validate(transformed, rules)
      ❌ Validation fails: "order_id field is missing"
   
7. Catch error in node execution
   ↓
8. Record failed node in flow_runs table
   ↓
9. Call captureErrorReport() (🔥 AUTOMATIC)
   ↓
10. POST /api/error-triage (internal call)
   ↓
11. Create error_report record with:
    - payloadSnapshot: truncated input data
    - stackTrace: full error trace
    - nodeConfig: validation rules
    - errorMessageSimple: "Validation: order_id missing"
    - severity: "high" (auto-calculated)
   ↓
12. Return error to client (if synchronous)
    OR mark job as failed in queue
```

### 2. Error Escalation Flow

```
1. Consultant views Error Triage Dashboard
   GET /api/error-triage?organizationId=acme&severity=high
   ↓
2. Click error → Navigate to detail page
   GET /api/error-triage/:id
   ↓
3. Review simple view + advanced view (payload, stack trace)
   ↓
4. Click "Create Ticket"
   ↓
5. POST /api/error-triage/:id/escalate
   {
     priority: "high",
     includeAdvancedContext: true
   }
   ↓
6. Server creates escalation ticket:
   a. Insert into error_escalation_tickets
   b. Generate ticket title/description
   c. Update error_report.triageStatus = "escalated"
   ↓
7. Send email via Resend:
   resendService.sendErrorEscalationEmail(
     recipients: "superadmin@company.com",
     ticket: { title, description, priority, ... }
   )
   ↓
8. Email sent with:
   - Priority-based color coding
   - Full error context
   - Link to dashboard: /error-triage/:id
   ↓
9. Return ticket ID to client
```

### 3. Version Promotion (DEV → PROD)

```
1. Consultant completes DEV testing
   ↓
2. POST /api/environment-promotion/dev-to-staging
   { devVersionId: "v-dev-123" }
   ↓
3. Clone DEV version to STAGING:
   - Same configuration snapshot
   - targetEnvironment: "staging"
   - status: "draft"
   ↓
4. Customer performs UAT in STAGING
   ↓
5. POST /api/environment-promotion/staging-to-prod
   { stagingVersionId: "v-staging-456" }
   ↓
6. Clone STAGING version to PROD:
   - targetEnvironment: "prod"
   - status: "pending_approval" (requires superadmin)
   ↓
7. Superadmin reviews and approves:
   POST /api/versions/:id/approve
   ↓
8. Status: "approved"
   ↓
9. Superadmin deploys:
   POST /api/versions/:id/deploy
   ↓
10. Docker build process:
    a. docker build -t continuitybridge-acme:2.0.0-prod
    b. docker push registry.example.com/continuitybridge-acme:2.0.0-prod
    c. Update deployment_history table
    d. Set isImmutable = true (🔒 cannot modify)
   ↓
11. Customer Docker instance pulls new image and restarts
```

---

## Performance Characteristics

### Scalability

**Horizontal Scaling**:
- Stateless API servers (can add instances)
- Background workers (BullMQ supports multiple workers)
- PostgreSQL read replicas (future enhancement)
- Redis cluster for queue (future enhancement)

**Vertical Scaling**:
- Render Standard instance: 512MB RAM, 0.5 CPU
- Render Pro instance: 2GB RAM, 1 CPU
- Render Pro Plus instance: 4GB RAM, 2 CPU

**Current Limits** (single instance):
- Concurrent flow executions: ~50 (in-memory queue)
- Database connections: 20 (pooled)
- Request throughput: ~1000 req/min
- Flows per customer: 50-100 (soft limit)

### Performance Metrics

**Flow Execution**:
- Simple flow (3 nodes): ~50-200ms
- Complex flow (10+ nodes): ~500-2000ms
- Parser overhead: ~10-50ms per node
- Transformer overhead: ~20-100ms per node
- API call overhead: depends on external system

**Database Queries**:
- Flow lookup: ~5-10ms
- User authentication: ~5-15ms
- Error report creation: ~10-20ms
- Version query: ~10-30ms

**File Operations**:
- SFTP pull (100 files): ~5-30 seconds
- Azure Blob pull (100 files): ~3-20 seconds
- Export package generation: ~2-10 seconds

---

## Deployment & DevOps

### Environment Variables

**Required** (Production):
```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/db
SUPERADMIN_API_KEY=your-secure-api-key
ENCRYPTION_KEY=32-character-key
APP_URL=https://your-domain.com
APP_DOMAIN=your-domain.com
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@your-domain.com
```

**Optional**:
```bash
REDIS_URL=redis://localhost:6379
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
LICENSE_VALIDATION_URL=https://your-domain.com
EXPORT_DOMAIN=your-domain.com
EXPORT_CONTACT_EMAIL=support@your-domain.com
```

### Build Process

**Frontend**:
```bash
cd client
npm install
npm run build  # Vite build → dist/public
```

**Backend**:
```bash
cd server
npm install
npm run build  # esbuild → dist/index.js
```

**Combined** (Root):
```bash
npm run build  # Builds both frontend + backend
```

**Output**:
```
dist/
├── public/              # Frontend static assets
│   ├── index.html
│   ├── assets/
│   │   ├── index-[hash].css
│   │   └── index-[hash].js
├── index.js             # Backend bundle (584KB)
```

### Monitoring & Logging

**Log Levels**:
- `debug`: Detailed execution traces
- `info`: Normal operations (flow start, flow complete)
- `warn`: Non-critical issues (email send failure, license expiry warning)
- `error`: Critical failures (flow execution failure, database error)

**Log Storage**:
- **File**: Daily rotation (14-day retention)
  - `logs/combined-YYYY-MM-DD.log` (all levels)
  - `logs/error-YYYY-MM-DD.log` (errors only)
- **Database**: `system_logs` table (30-day retention, configurable)

**Log Scopes**:
- `superadmin`: Global system events (license validation, exports)
- `customer`: Per-org operations (flow execution, API calls)

**Querying Logs**:
```bash
GET /api/logs?scope=customer&organizationId=acme&level=error&startDate=2025-11-01

# Returns:
[
  {
    "timestamp": "2025-11-15T10:30:00Z",
    "level": "error",
    "scope": "customer",
    "service": "FlowOrchestrator",
    "message": "Flow execution failed",
    "flowId": "flow-123",
    "runId": "run-456",
    "errorStack": "..."
  }
]
```

---

## Testing Strategy

### Unit Tests
- Node executors (parsers, transformers, validators)
- Utility functions (encryption, validation)
- API endpoint handlers

### Integration Tests
- Flow execution end-to-end
- Database operations
- External API mocking

### E2E Tests (Planned)
- Flow builder UI
- User authentication
- Error triage workflow

### Manual Testing Checklist
- [ ] Create flow in DEV
- [ ] Test with emulation mode
- [ ] Promote DEV → STAGING
- [ ] Promote STAGING → PROD (approval required)
- [ ] Trigger production error (validate capture)
- [ ] Escalate error (validate email sent)
- [ ] Generate export package
- [ ] Validate license on customer instance

---

## Security Considerations

### Threat Model

**Authentication Bypass**:
- Mitigation: Multi-layer auth (session + API key + JWT)
- Rate limiting on login endpoints
- Magic link expiration (15 minutes)

**SQL Injection**:
- Mitigation: Drizzle ORM parameterized queries
- Input validation with express-validator
- No raw SQL execution

**XSS (Cross-Site Scripting)**:
- Mitigation: React auto-escaping
- Content Security Policy (CSP)
- Sanitization of user inputs

**CSRF (Cross-Site Request Forgery)**:
- Mitigation: SameSite cookies
- CORS whitelist in production
- CSRF tokens on mutations (future enhancement)

**Data Leakage**:
- Mitigation: Organization-scoped queries
- RBAC enforcement on all endpoints
- Error messages don't expose stack traces to non-admins

**License Tampering**:
- Mitigation: AES-256-GCM encryption
- HMAC signature verification
- Server-side validation on startup

### Compliance

**Data Privacy**:
- Customer data isolated by organizationId
- No cross-customer data access
- Audit logs for all mutations

**PCI DSS** (if handling payment data):
- Encrypt credentials at rest (planned)
- Use HTTPS for all traffic
- Secure credential storage (env variables)

**GDPR** (if EU customers):
- Right to data deletion (delete user/org)
- Data export capability (via export package)
- Privacy policy and consent management (future)

---

## Cost Analysis

### Infrastructure Costs (Render)

**Web Service**:
- Starter: $7/month (512MB RAM, 0.5 CPU)
- Standard: $25/month (2GB RAM, 1 CPU)
- Pro: $85/month (4GB RAM, 2 CPU)

**PostgreSQL**:
- Starter: $7/month (1GB storage)
- Standard: $20/month (10GB storage, daily backups)
- Pro: $90/month (50GB storage, point-in-time recovery)

**Redis** (optional):
- Starter: $10/month (25MB)
- Standard: $50/month (100MB)

**Total Estimated** (Production):
- Small deployment: ~$50-75/month (Starter tier)
- Medium deployment: ~$100-150/month (Standard tier)
- Large deployment: ~$250-400/month (Pro tier)

### Operational Costs

**Resend** (Email):
- Free: 3,000 emails/month
- Starter: $20/month (50,000 emails)
- Pro: $85/month (1,000,000 emails)

**Domain & SSL**:
- Domain: ~$12/year
- SSL: Free (Let's Encrypt via Render)

**Monitoring** (optional):
- Sentry: $26/month (errors)
- Datadog: $15/month (APM)

---

## Roadmap & Future Enhancements

### Short-Term (Q1 2025)
- [ ] Frontend: Error Triage Dashboard UI
- [ ] Frontend: Flow Tester error panel
- [ ] Enhanced flow debugging with breakpoints
- [ ] Export package encryption improvements
- [ ] Real-time flow execution monitoring

### Medium-Term (Q2 2025)
- [ ] AI-powered mapping generator (production mode)
- [ ] Advanced flow analytics (success rates, latency)
- [ ] Customer portal for self-service
- [ ] Webhook support for external triggers
- [ ] GraphQL API (in addition to REST)

### Long-Term (Q3+ 2025)
- [ ] Multi-region deployment (EU, APAC)
- [ ] Kubernetes deployment option
- [ ] Real-time collaboration (multi-user flow editing)
- [ ] Marketplace for flow templates
- [ ] Advanced error prediction (ML-based)

---

## Key Technical Decisions

### Why React Flow?
- **Mature library**: Battle-tested, active maintenance
- **Extensibility**: Custom nodes, edges, controls
- **Performance**: Handles 100+ nodes without lag
- **TypeScript support**: Strong typing, better DX
- **Community**: Large ecosystem, plugins, examples

### Why Drizzle ORM?
- **Type-safe**: Auto-generated TypeScript types
- **Lightweight**: No runtime overhead
- **SQL-first**: Write SQL-like queries, not abstracted DSL
- **Dual database**: Supports SQLite (dev) + PostgreSQL (prod)
- **Migration-less**: Push schema changes directly

### Why Render?
- **Simplicity**: Zero DevOps setup, auto-deploy from Git
- **Cost-effective**: Pay-as-you-grow pricing
- **PostgreSQL included**: Managed database, backups
- **SSL/CDN**: Automatic HTTPS, global CDN
- **Environment variables**: Easy config management

### Why Resend?
- **Developer-first**: Clean API, great docs
- **Reliability**: 99.99% uptime SLA
- **Templates**: React email component support
- **Analytics**: Open rates, click rates, bounces
- **Generous free tier**: 3,000 emails/month

---

## Glossary

**Node**: Processing step in a flow (parser, transformer, connector)

**Edge**: Connection between nodes defining data flow

**Flow**: Visual integration workflow (nodes + edges)

**Emulation Mode**: Testing mode bypassing live auth

**Black Box Export**: Deployable package hiding source code

**Immutable**: Cannot be modified (PROD versions)

**Triage**: Error investigation and resolution process

**Semantic Versioning**: MAJOR.MINOR.PATCH scheme

**Multi-Tenant**: Single app serving multiple isolated customers

**RBAC**: Role-Based Access Control

**UAT**: User Acceptance Testing (STAGING)

**Magic Link**: Passwordless email-based login

---

## Contact

**CTO**: [Your contact info]
**Superadmin**: jesus.cruzado@gmail.com
**Support**: support@continuitybridge.com
**Documentation**: https://docs.continuitybridge.com

---

*Last Updated: 2025-11-15*
*Platform Version: 1.0.0*
*Build: 584.1kb*
