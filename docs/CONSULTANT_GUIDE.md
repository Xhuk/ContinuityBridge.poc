# ContinuityBridge - Consultant Guide

## Overview
As a **Consultant**, you are a customer-scoped administrator who manages integration flows and users for your assigned customer organizations. This guide covers all features available to consultants.

---

## Your Role & Permissions

### What You Can Do
✅ **Customer Management**
- Access only your assigned customer organizations
- View and manage flows for assigned customers
- Create, edit, and test integration flows
- Configure data mappings and transformations

✅ **User Management**
- Create Customer Admins for assigned customers
- Create Customer Users for assigned customers
- **Cannot** create other Consultants or Superadmins

✅ **Error Triage Dashboard**
- View errors from assigned customers only
- Investigate and resolve integration failures
- Add comments and notes to error reports
- Escalate critical errors to Superadmin

✅ **Flow Testing**
- Test flows in emulation mode (bypass live auth)
- Real-time error feedback with node visualization
- View test results and debug output

### What You Cannot Do
❌ Export flows or generate licenses (Superadmin only)
❌ Access customers not assigned to you
❌ Create or manage other Consultants
❌ Access global system settings

---

## Key Features

### 1. Flow Builder

#### Creating a New Flow
1. Navigate to **Flows** page
2. Click **+ New Flow**
3. Select **System Instance** to scope the flow
4. Drag nodes from the palette onto the canvas
5. Connect nodes with edges to define data flow
6. Configure each node by clicking on it

#### Node Types Available
- **Triggers**: Manual, Webhook, Scheduler, SFTP Poller, Azure Blob Poller
- **Parsers**: XML, JSON, CSV, Excel, EDI
- **Transformers**: Object Mapper, Custom JavaScript
- **Validators**: Data Validation with YAML rules
- **Connectors**: SFTP, Azure Blob, Database, API Calls
- **Utilities**: Conditional Routing, Join, Logger

#### Testing Flows
**Emulation Mode** (Recommended for Testing):
- Toggle "Emulation Mode" ON before testing
- Bypasses live authentication (uses mock credentials)
- Safe for testing without affecting production systems
- Get instant feedback on node failures

**Test Mode vs Production**:
- **Test Mode**: Shows real-time UI feedback, error toasts, visual node states
- **Production Mode**: Silent error capture, no UI alerts, errors logged to Error Triage Dashboard

#### Saving Flows
- Click **Save Flow** to persist changes
- Flows are versioned automatically
- Enable/disable flows using the toggle switch

---

### 2. Error Triage Dashboard

Access: **Menu → Error Triage**

#### What You See
- All errors from your assigned customers
- Real-time error notifications for production failures
- Detailed error context snapshots

#### Error List View
Columns:
- **Timestamp**: When the error occurred
- **Organization**: Customer name
- **Flow**: Which flow failed
- **Error Message**: Simple, user-friendly description
- **Status**: New, Investigating, Resolved, Escalated
- **Severity**: Low, Medium, High, Critical
- **Environment**: DEV, STAGING, PROD

#### Filters Available
- Status (New, Investigating, Resolved)
- Severity (Low, Medium, High, Critical)
- Environment (DEV, STAGING, PROD)
- Flow Name
- Date Range
- Search (by error message or flow name)

#### Error Detail View
Click any error to see:

**Simple View** (Default):
- Organization and flow details
- Node that failed
- User-friendly error message
- Timestamp and run ID

**Advanced View** (Toggle):
- Full payload snapshot (input data)
- Complete stack trace
- Node configuration at time of failure
- HTTP details (status, method, endpoint)

#### Actions You Can Take

**Update Status**:
- Change from "New" → "Investigating" → "Resolved"
- Assign error to yourself or team member
- Add resolution notes

**Add Comments**:
- Type: Investigation, Workaround, Root Cause, Fix Applied
- Track progress and share findings
- Comments visible to all users with access

**Escalate to Superadmin**:
1. Click **Create Ticket**
2. Fill in priority and description
3. Email automatically sent to Superadmin
4. Status changes to "Escalated"

**Copy for Email**:
- Click **Copy for Email**
- Formatted text copied to clipboard
- Includes simple error + advanced debug context
- Ready to paste into support tickets

---

### 3. User Management

Access: **Menu → Users**

#### Creating Users for Your Customers

**Customer Admin**:
- Can manage their own company's flows
- Can create Customer Users
- Self-service configuration access
- Limited to their organization

**Customer User**:
- Read-only access
- Can view Error Triage Dashboard
- Cannot configure flows or manage users
- Ideal for monitoring teams

#### User Creation Process
1. Go to **Users** page
2. Click **+ New User**
3. Select **Organization** (from your assigned customers)
4. Choose **Role**: Customer Admin or Customer User
5. Enter **Email**
6. Click **Create**
7. User receives invitation email with login link

---

### 4. Interface Management

Access: **Menu → Interfaces**

#### What Are Interfaces?
Interfaces represent external systems you integrate with (WMS, ERP, Marketplace, TMS, etc.)

#### Creating an Interface
1. Click **+ New Interface**
2. Choose **Type**: WMS, ERP, Marketplace, TMS, 3PL, Custom
3. Select **Direction**: Inbound, Outbound, Bidirectional
4. Choose **Protocol**: REST API, SOAP, SFTP, FTP, Database, Message Queue
5. Configure connection details:
   - Endpoint URL
   - Authentication type (Basic, Bearer, API Key, OAuth2)
   - Credentials (stored securely)
6. Test connection before saving

#### Using Interface Templates
Browse pre-built templates for common systems:
- Amazon Seller Central
- Shopify
- WooCommerce
- JDA WMS
- SAP
- Microsoft Dynamics

Click **Instantiate** to create interface from template.

---

### 5. Data Source Management

Access: **Menu → Data Sources**

#### What Are Data Sources?
Automated file polling from SFTP/FTP servers or Azure Blob storage.

#### Creating a Data Source
1. Click **+ New Data Source**
2. Choose **Type**: SFTP, FTP, Azure Blob
3. Configure connection:
   - Host/URL
   - Port
   - Username/Password or connection string
   - Base directory
4. Set polling schedule (cron expression)
5. Test connection
6. Enable polling

#### Monitoring Data Sources
- View pull history
- Check file counts
- Monitor errors
- Manually trigger pull

---

### 6. Configuration Versioning

Access: **Menu → Versions**

#### Understanding Environments

**DEV** (Development):
- Mutable, no approval required
- Make changes freely
- Test configurations
- Status: draft → deployed

**STAGING** (UAT):
- Pre-production testing
- Optional approval
- Customer UAT validation
- Status: draft → deployed

**PROD** (Production):
- Immutable after deployment
- Requires Superadmin approval
- Cannot be modified once deployed
- Status: draft → pending_approval → approved → deployed

#### Creating a Version
1. Make configuration changes (flows, interfaces, mappings)
2. Go to **Versions**
3. Click **Create Version**
4. Choose:
   - **Label**: "Q1 2025 Integration"
   - **Change Type**: Major, Minor, Patch
   - **Target Environment**: DEV, STAGING, PROD
5. Add description of changes
6. Submit

#### Promoting Between Environments
**DEV → STAGING**:
- Click **Promote to Staging**
- Configuration cloned with same version number
- Ready for UAT

**STAGING → PROD**:
- Click **Promote to Production**
- Status: pending_approval
- Wait for Superadmin approval
- Deploy after approval

#### Change Requests (For Customer Changes)
When customers request configuration changes:
1. Go to **Change Requests**
2. Click **+ New Request**
3. Fill in:
   - Title: "Update order mapping rules"
   - Type: Mapping Change, Flow Update, Interface Config
   - Proposed Changes: JSON diff
4. Submit for Superadmin approval
5. Track status: pending → approved → deployed

---

## Best Practices

### Flow Design
1. **Always use Emulation Mode** for initial testing
2. **Add Logger nodes** at critical points for debugging
3. **Use Validation nodes** to catch data issues early
4. **Handle errors gracefully** with Conditional nodes
5. **Document flows** with clear node labels and descriptions

### Error Handling
1. **Monitor Error Triage Dashboard daily**
2. **Investigate NEW errors within 24 hours**
3. **Add comments** with investigation findings
4. **Escalate critical PROD errors immediately**
5. **Mark as Resolved** only after confirming fix

### Version Control
1. **Test in DEV first**, then promote to STAGING
2. **Never deploy to PROD without UAT approval**
3. **Use semantic versioning**: Major.Minor.Patch
4. **Document all changes** in version descriptions
5. **Keep backup versions** for rollback capability

### Customer Communication
1. **Respond to change requests within 48 hours**
2. **Test changes in STAGING with customer**
3. **Schedule PROD deployments** during maintenance windows
4. **Notify customers** before and after deployments
5. **Document configuration** in Integration Notes

---

## Troubleshooting

### Common Issues

**Flow Not Executing**:
- Check if flow is enabled
- Verify trigger configuration
- Check System Instance is active
- Review Error Triage Dashboard

**Authentication Failures**:
- Use Emulation Mode to bypass auth during testing
- Verify credentials in Interface secrets
- Check OAuth2 token expiration
- Test interface connection

**Data Transformation Errors**:
- Review Object Mapper YAML syntax
- Check source data format matches expected schema
- Use Logger nodes to inspect intermediate data
- Test with sample payloads

**SFTP/FTP Connection Issues**:
- Verify host, port, username, password
- Check firewall rules
- Test connection from Data Source page
- Review pull history for errors

### Getting Help

**In-App Support**:
- Click **?** icon in top-right corner
- Access context-sensitive help
- View integration notes for your customers

**Escalate to Superadmin**:
- Use **Create Ticket** in Error Triage Dashboard
- Include full error context
- Specify urgency and impact

**Community Resources**:
- Check Integration Notes for similar solutions
- Review successful flow configurations
- Share knowledge with other consultants

---

## Quick Reference

### Keyboard Shortcuts (Flow Builder)
- `Ctrl+S` - Save flow
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo
- `Delete` - Delete selected node/edge
- `Ctrl+C` - Copy node
- `Ctrl+V` - Paste node

### API Access
Consultants have API key authentication for programmatic access.

**Get Your API Key**:
1. Go to **Profile → API Keys**
2. Click **Generate API Key**
3. Copy and store securely

**Usage**:
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  https://your-domain/api/flows
```

### Environment URLs
- **Production**: `https://your-domain.com`
- **Staging**: `https://staging.your-domain.com`
- **Dev**: `http://localhost:3000`

---

## Glossary

**Flow**: A visual integration workflow connecting systems via nodes and edges

**Node**: A processing step in a flow (parser, transformer, connector, etc.)

**Edge**: Connection between nodes defining data flow direction

**System Instance**: A specific deployment environment (e.g., JDA_PROD_US, SAP_DEV_EU)

**Interface**: External system connection configuration (API, SFTP, Database)

**Data Source**: Automated file polling configuration

**Emulation Mode**: Testing mode that bypasses live authentication

**Error Context Snapshot**: Complete error details including payload, stack trace, and node config

**Triage**: Process of investigating, prioritizing, and resolving errors

**Version**: Snapshot of complete system configuration (flows, interfaces, mappings)

**Change Request**: Customer-initiated configuration change awaiting approval

---

## Support

For technical assistance:
- **Email**: support@continuitybridge.com
- **Error Escalation**: Use "Create Ticket" in Error Triage Dashboard
- **Documentation**: Check Integration Notes for your customers

---

*Last Updated: 2025-11-15*
