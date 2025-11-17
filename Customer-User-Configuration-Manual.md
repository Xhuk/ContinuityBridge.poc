# Customer User Configuration Manual

**Tags:** operational, customer, consultant, user-guide

**Created:** 2025-11-17
**Updated:** 2025-11-17

---

## Overview

This manual explains all user configuration options, actions, and what each setting means for **Customer Admin** users in ContinuityBridge. Use this guide to understand how to configure your organization's settings, manage users, and control system behavior.

---

## User Roles and Permissions

### Role Hierarchy

**Customer Admin**
- ✅ Manage users within your organization
- ✅ Configure WAF (Web Application Firewall) settings
- ✅ View logs and events for your organization
- ✅ Configure flows, interfaces, and data sources
- ✅ Create and manage configuration versions
- ✅ Request changes (requires approval from consultant/founder)
- ❌ Cannot access other organizations
- ❌ Cannot manage billing or licensing

**Customer User (Standard)**
- ✅ View events and logs
- ✅ Execute flows
- ✅ View dashboards and reports
- ❌ Cannot modify configurations
- ❌ Cannot manage users
- ❌ Cannot access admin settings

---

## User Management

### Adding New Users

**Path:** `/admin/users` → "Add User" button

**Required Fields:**
- **Email Address** - User's login email (must be unique)
- **Role** - Select `customer_user` or `customer_admin`
- **Enabled** - Toggle to activate/deactivate user

**What It Means:**
- New users receive an email with temporary credentials
- Users must change password on first login
- Each user gets a unique API key for programmatic access

**Actions Available:**
1. **Create User** - Add new team member
2. **Edit User** - Change role or email
3. **Disable User** - Temporarily block access (can re-enable later)
4. **Delete User** - Permanently remove (cannot be undone)

---

## WAF (Web Application Firewall) Configuration

**Path:** `/settings` → "Security" tab → "WAF Configuration"

### What is WAF?

The WAF protects your ContinuityBridge instance from malicious traffic, bots, and attacks.

### Configuration Options

**Enable WAF**
- **Default:** Enabled
- **What It Means:** Activates firewall protection
- **When to Disable:** Only during troubleshooting (not recommended for production)

**Block Malicious Bots**
- **Default:** Enabled
- **What It Means:** Automatically blocks known scrapers, scanners (curl, wget, nikto, sqlmap)
- **Impact:** Legitimate API clients must use proper User-Agent headers

**Block Suspicious Patterns**
- **Default:** Enabled
- **What It Means:** Detects SQL injection, XSS attacks, path traversal attempts
- **Impact:** Blocks requests with dangerous patterns in URLs or payloads

**Rate Limiting**
- **Default:** 30 requests/minute per IP
- **Window:** 60 seconds
- **Block Duration:** 5 minutes
- **What It Means:** Limits how many requests a single IP can make
- **When to Adjust:** Increase if legitimate users hit limits, decrease if under attack

**Whitelist IPs**
- **Format:** Comma-separated IP addresses (e.g., `192.168.1.100, 10.0.0.5`)
- **What It Means:** IPs on whitelist bypass all WAF rules
- **Use Case:** Internal servers, trusted partners, monitoring tools

### Monitoring WAF Activity

**View Blocked IPs:** `/settings` → "Security" → "WAF Stats"

**Actions:**
- **Block IP Manually** - Add specific IP to permanent block list
- **Unblock IP** - Remove IP from block list
- **View Statistics** - See blocked requests, rate limits, patterns detected

---

## Configuration Versioning

**Path:** `/admin/versions` (if available)

### What Are Configuration Versions?

Every change to flows, interfaces, mappings, or settings creates a new version. Versions use semantic versioning: `MAJOR.MINOR.PATCH`

### Version Types

**PATCH (1.0.X)**
- **What It Means:** Small bug fixes, minor tweaks
- **Examples:** Fix typo in mapping, adjust timeout value
- **Approval:** Auto-approved in DEV environment

**MINOR (1.X.0)**
- **What It Means:** New features, backwards-compatible changes
- **Examples:** Add new data source, create new flow
- **Approval:** Requires consultant review for PROD

**MAJOR (X.0.0)**
- **What It Means:** Breaking changes, major architecture updates
- **Examples:** Change data format, remove interfaces
- **Approval:** Requires founder approval + testing

### Creating a Version

1. Make changes to flows/interfaces/mappings
2. Click "Create Version"
3. Fill in:
   - **Label** - Descriptive name (e.g., "Q4 Product Mappings")
   - **Description** - What changed and why
   - **Change Type** - Select patch/minor/major
   - **Environment** - DEV, Staging, or PROD

**What Happens:**
- **DEV:** Version deployed immediately
- **STAGING:** Version deployed after basic validation
- **PROD:** Version enters approval workflow (consultant → founder)

### Version Status

- **Draft** - Editable, not deployed
- **Pending Approval** - Waiting for consultant/founder review
- **Approved** - Ready for deployment
- **Deployed** - Live in target environment (IMMUTABLE in PROD)
- **Archived** - Historical version, can be used for rollback

---

## Change Requests

**Path:** `/admin/change-requests`

### When to Use

Customer Admins can **propose** changes but cannot deploy to PROD without approval. Use change requests for:
- Production configuration updates
- Critical mapping changes
- Interface modifications

### Creating a Change Request

1. Navigate to the resource (flow, interface, mapping)
2. Make desired changes
3. Click "Submit Change Request"
4. Fill in:
   - **Title** - Brief summary (e.g., "Add SKU-1234 Product Mapping")
   - **Description** - Detailed explanation
   - **Request Type** - mapping_change, flow_update, interface_config
   - **Impact Level** - Low, Medium, High, Critical
   - **Testing Notes** - How you validated the change

**What Happens:**
1. Request goes to consultant for review
2. Consultant may approve or request modifications
3. If approved, founder deploys to production
4. You receive email notification at each step

### Change Request Status

- **Pending** - Awaiting consultant review
- **Reviewing** - Consultant is evaluating
- **Approved** - Ready for deployment
- **Rejected** - Not approved (see review notes)
- **Deployed** - Live in production

---

## Logging and Monitoring

**Path:** `/settings` → "Logging" tab

### Log Configuration

**Minimum Log Level**
- **Options:** Debug, Info, Warn, Error
- **Default:** Info
- **What It Means:**
  - **Debug** - Logs everything (use for troubleshooting, high volume)
  - **Info** - Standard operations (recommended for production)
  - **Warn** - Only warnings and errors
  - **Error** - Only critical failures

**Retention Days**
- **Default:** 30 days
- **What It Means:** Logs older than this are automatically deleted
- **Impact:** Longer retention = more storage usage

**Max Log Size (MB)**
- **Default:** 100 MB
- **What It Means:** Maximum storage per organization
- **Impact:** Once limit reached, oldest logs are deleted first

**What to Log:**
- **Flow Executions** - Record every flow run (recommended)
- **API Requests** - Log all HTTP requests (high volume)
- **Auth Events** - Track logins, failed attempts (security)
- **Errors** - Always log errors (critical)

**Alert on Error**
- **What It Means:** Send email when errors occur
- **Alert Email** - Where to send notifications
- **Use Case:** Production monitoring, critical systems

---

## Settings Reference

### SMTP Configuration

**Path:** `/settings` → "Email" tab

**Required for:**
- User invitation emails
- Password reset emails
- Error alerts
- Change request notifications

**Fields:**
- **Host** - SMTP server address (e.g., `smtp.gmail.com`)
- **Port** - Usually 587 (TLS) or 465 (SSL)
- **Username** - SMTP account email
- **Password** - SMTP account password (encrypted)
- **From Email** - Sender address for system emails
- **From Name** - Display name (e.g., "ContinuityBridge")

**Testing:** Click "Send Test Email" to verify configuration

---

## Queue Configuration

**Path:** `/queue`

### Queue Backends

**BullMQ (Redis)**
- **Best for:** High-volume, distributed processing
- **Requires:** Redis server
- **Configuration:** Redis connection string in environment

**PGMq (PostgreSQL)**
- **Best for:** Simple setups, low to medium volume
- **Requires:** PostgreSQL database (already configured)
- **Configuration:** Auto-configured with database

**What It Means:**
- Queue manages background jobs (flows, transformations, file processing)
- Worker processes jobs from the queue
- Failed jobs can be retried automatically

### Worker Configuration

**Concurrency**
- **Default:** 5
- **What It Means:** How many jobs can run simultaneously
- **Impact:** Higher = faster but more CPU/memory usage

**Job Retry Settings**
- **Max Retries** - How many times to retry failed jobs
- **Retry Delay** - Seconds between retry attempts
- **What It Means:** Transient errors (network issues) get retried automatically

---

## Flow Builder

**Path:** `/flows`

### Flow Actions

**Create Flow**
- Define transformation pipelines
- Connect data sources to targets
- Configure error handling

**Schedule Flow**
- **Cron Expression** - When to run automatically
- **Example:** `0 */6 * * *` = Every 6 hours
- **What It Means:** Flow executes on schedule without manual trigger

**Test Flow**
- Run with sample data
- View transformation output
- Debug errors before production deployment

---

## Data Sources

**Path:** `/datasources`

### Supported Types

**SFTP**
- Connect to remote file servers
- Download files for processing
- **Configuration:** Host, Port, Username, Password/Key

**Database (SQL)**
- PostgreSQL, MySQL, SQL Server
- Query data directly
- **Configuration:** Connection string, credentials

**REST API**
- HTTP/HTTPS endpoints
- GET, POST, PUT, DELETE methods
- **Configuration:** Base URL, auth headers, API key

**Blob Storage**
- Azure Blob, AWS S3
- Large file storage
- **Configuration:** Account, container, access keys

### Connection Testing

Always click "Test Connection" before saving to verify credentials and connectivity.

---

## Best Practices

### Security

1. **Enable WAF** - Always keep enabled in production
2. **Use Strong Passwords** - Minimum 12 characters, mixed case, numbers, symbols
3. **Limit Admin Roles** - Only assign `customer_admin` to trusted users
4. **Whitelist Carefully** - Only add IPs you control
5. **Monitor Logs** - Review error logs weekly

### Configuration Management

1. **Use DEV First** - Test all changes in development
2. **Version Everything** - Create versions for all configuration changes
3. **Document Changes** - Write clear descriptions in change requests
4. **Test Before PROD** - Always validate in staging environment
5. **Plan Rollbacks** - Know how to revert to previous version

### Performance

1. **Adjust Concurrency** - Match worker concurrency to server capacity
2. **Monitor Queue** - Check for job backlog regularly
3. **Clean Old Logs** - Set appropriate retention to save storage
4. **Rate Limit Wisely** - Don't block legitimate traffic

---

## Common Issues and Solutions

### "Access Denied" Error

**Cause:** Insufficient permissions for your role
**Solution:** Contact your administrator to request elevated permissions or use change request workflow

### "WAF Blocked Request"

**Cause:** Request triggered firewall rule
**Solution:** 
- Check IP whitelist configuration
- Review request for suspicious patterns
- Temporarily disable WAF to troubleshoot (not recommended for production)

### "Queue Jobs Failing"

**Cause:** Worker not running or misconfigured
**Solution:**
- Check `/queue` page for worker status
- Verify queue backend configuration
- Review job error logs for specific failure reasons

### "Email Not Sending"

**Cause:** SMTP not configured or credentials invalid
**Solution:**
- Verify SMTP settings in `/settings`
- Click "Send Test Email" to diagnose
- Check that firewall allows outbound port 587/465

---

## Support and Assistance

### Getting Help

1. **Check Logs** - `/events` page shows recent activity
2. **Review Documentation** - This wiki and operational guides
3. **Submit Change Request** - For configuration assistance
4. **Contact Consultant** - For urgent issues or complex changes

### Escalation Path

1. **Customer Admin** - First point of contact for users
2. **Consultant** - Technical support and configuration help
3. **Founder/Superadmin** - Critical issues, security incidents, architecture changes

---

## Glossary

**API Key** - Unique identifier for programmatic access  
**Cron Expression** - Schedule format for automated tasks  
**Immutable** - Cannot be changed (production configurations)  
**Semantic Versioning** - MAJOR.MINOR.PATCH version numbering  
**SMTP** - Email protocol for sending system notifications  
**WAF** - Web Application Firewall for security  
**Worker** - Background process that executes queued jobs

---

## Document Version

**Version:** 1.0.0  
**Last Updated:** November 17, 2025  
**Maintained By:** ContinuityBridge Operations Team  
**Access Level:** Customer Admins, Consultants
# Customer User Configuration Manual

**Tags:** operational, customer, consultant, user-guide

**Created:** 2025-11-17
**Updated:** 2025-11-17

---

## Overview

This manual explains all user configuration options, actions, and what each setting means for **Customer Admin** users in ContinuityBridge. Use this guide to understand how to configure your organization's settings, manage users, and control system behavior.

---

## User Roles and Permissions

### Role Hierarchy

**Customer Admin**
- ✅ Manage users within your organization
- ✅ Configure WAF (Web Application Firewall) settings
- ✅ View logs and events for your organization
- ✅ Configure flows, interfaces, and data sources
- ✅ Create and manage configuration versions
- ✅ Request changes (requires approval from consultant/founder)
- ❌ Cannot access other organizations
- ❌ Cannot manage billing or licensing

**Customer User (Standard)**
- ✅ View events and logs
- ✅ Execute flows
- ✅ View dashboards and reports
- ❌ Cannot modify configurations
- ❌ Cannot manage users
- ❌ Cannot access admin settings

---

## User Management

### Adding New Users

**Path:** `/admin/users` → "Add User" button

**Required Fields:**
- **Email Address** - User's login email (must be unique)
- **Role** - Select `customer_user` or `customer_admin`
- **Enabled** - Toggle to activate/deactivate user

**What It Means:**
- New users receive an email with temporary credentials
- Users must change password on first login
- Each user gets a unique API key for programmatic access

**Actions Available:**
1. **Create User** - Add new team member
2. **Edit User** - Change role or email
3. **Disable User** - Temporarily block access (can re-enable later)
4. **Delete User** - Permanently remove (cannot be undone)

---

## WAF (Web Application Firewall) Configuration

**Path:** `/settings` → "Security" tab → "WAF Configuration"

### What is WAF?

The WAF protects your ContinuityBridge instance from malicious traffic, bots, and attacks.

### Configuration Options

**Enable WAF**
- **Default:** Enabled
- **What It Means:** Activates firewall protection
- **When to Disable:** Only during troubleshooting (not recommended for production)

**Block Malicious Bots**
- **Default:** Enabled
- **What It Means:** Automatically blocks known scrapers, scanners (curl, wget, nikto, sqlmap)
- **Impact:** Legitimate API clients must use proper User-Agent headers

**Block Suspicious Patterns**
- **Default:** Enabled
- **What It Means:** Detects SQL injection, XSS attacks, path traversal attempts
- **Impact:** Blocks requests with dangerous patterns in URLs or payloads

**Rate Limiting**
- **Default:** 30 requests/minute per IP
- **Window:** 60 seconds
- **Block Duration:** 5 minutes
- **What It Means:** Limits how many requests a single IP can make
- **When to Adjust:** Increase if legitimate users hit limits, decrease if under attack

**Whitelist IPs**
- **Format:** Comma-separated IP addresses (e.g., `192.168.1.100, 10.0.0.5`)
- **What It Means:** IPs on whitelist bypass all WAF rules
- **Use Case:** Internal servers, trusted partners, monitoring tools

### Monitoring WAF Activity

**View Blocked IPs:** `/settings` → "Security" → "WAF Stats"

**Actions:**
- **Block IP Manually** - Add specific IP to permanent block list
- **Unblock IP** - Remove IP from block list
- **View Statistics** - See blocked requests, rate limits, patterns detected

---

## Configuration Versioning

**Path:** `/admin/versions` (if available)

### What Are Configuration Versions?

Every change to flows, interfaces, mappings, or settings creates a new version. Versions use semantic versioning: `MAJOR.MINOR.PATCH`

### Version Types

**PATCH (1.0.X)**
- **What It Means:** Small bug fixes, minor tweaks
- **Examples:** Fix typo in mapping, adjust timeout value
- **Approval:** Auto-approved in DEV environment

**MINOR (1.X.0)**
- **What It Means:** New features, backwards-compatible changes
- **Examples:** Add new data source, create new flow
- **Approval:** Requires consultant review for PROD

**MAJOR (X.0.0)**
- **What It Means:** Breaking changes, major architecture updates
- **Examples:** Change data format, remove interfaces
- **Approval:** Requires founder approval + testing

### Creating a Version

1. Make changes to flows/interfaces/mappings
2. Click "Create Version"
3. Fill in:
   - **Label** - Descriptive name (e.g., "Q4 Product Mappings")
   - **Description** - What changed and why
   - **Change Type** - Select patch/minor/major
   - **Environment** - DEV, Staging, or PROD

**What Happens:**
- **DEV:** Version deployed immediately
- **STAGING:** Version deployed after basic validation
- **PROD:** Version enters approval workflow (consultant → founder)

### Version Status

- **Draft** - Editable, not deployed
- **Pending Approval** - Waiting for consultant/founder review
- **Approved** - Ready for deployment
- **Deployed** - Live in target environment (IMMUTABLE in PROD)
- **Archived** - Historical version, can be used for rollback

---

## Change Requests

**Path:** `/admin/change-requests`

### When to Use

Customer Admins can **propose** changes but cannot deploy to PROD without approval. Use change requests for:
- Production configuration updates
- Critical mapping changes
- Interface modifications

### Creating a Change Request

1. Navigate to the resource (flow, interface, mapping)
2. Make desired changes
3. Click "Submit Change Request"
4. Fill in:
   - **Title** - Brief summary (e.g., "Add SKU-1234 Product Mapping")
   - **Description** - Detailed explanation
   - **Request Type** - mapping_change, flow_update, interface_config
   - **Impact Level** - Low, Medium, High, Critical
   - **Testing Notes** - How you validated the change

**What Happens:**
1. Request goes to consultant for review
2. Consultant may approve or request modifications
3. If approved, founder deploys to production
4. You receive email notification at each step

### Change Request Status

- **Pending** - Awaiting consultant review
- **Reviewing** - Consultant is evaluating
- **Approved** - Ready for deployment
- **Rejected** - Not approved (see review notes)
- **Deployed** - Live in production

---

## Logging and Monitoring

**Path:** `/settings` → "Logging" tab

### Log Configuration

**Minimum Log Level**
- **Options:** Debug, Info, Warn, Error
- **Default:** Info
- **What It Means:**
  - **Debug** - Logs everything (use for troubleshooting, high volume)
  - **Info** - Standard operations (recommended for production)
  - **Warn** - Only warnings and errors
  - **Error** - Only critical failures

**Retention Days**
- **Default:** 30 days
- **What It Means:** Logs older than this are automatically deleted
- **Impact:** Longer retention = more storage usage

**Max Log Size (MB)**
- **Default:** 100 MB
- **What It Means:** Maximum storage per organization
- **Impact:** Once limit reached, oldest logs are deleted first

**What to Log:**
- **Flow Executions** - Record every flow run (recommended)
- **API Requests** - Log all HTTP requests (high volume)
- **Auth Events** - Track logins, failed attempts (security)
- **Errors** - Always log errors (critical)

**Alert on Error**
- **What It Means:** Send email when errors occur
- **Alert Email** - Where to send notifications
- **Use Case:** Production monitoring, critical systems

---

## Settings Reference

### SMTP Configuration

**Path:** `/settings` → "Email" tab

**Required for:**
- User invitation emails
- Password reset emails
- Error alerts
- Change request notifications

**Fields:**
- **Host** - SMTP server address (e.g., `smtp.gmail.com`)
- **Port** - Usually 587 (TLS) or 465 (SSL)
- **Username** - SMTP account email
- **Password** - SMTP account password (encrypted)
- **From Email** - Sender address for system emails
- **From Name** - Display name (e.g., "ContinuityBridge")

**Testing:** Click "Send Test Email" to verify configuration

---

## Queue Configuration

**Path:** `/queue`

### Queue Backends

**BullMQ (Redis)**
- **Best for:** High-volume, distributed processing
- **Requires:** Redis server
- **Configuration:** Redis connection string in environment

**PGMq (PostgreSQL)**
- **Best for:** Simple setups, low to medium volume
- **Requires:** PostgreSQL database (already configured)
- **Configuration:** Auto-configured with database

**What It Means:**
- Queue manages background jobs (flows, transformations, file processing)
- Worker processes jobs from the queue
- Failed jobs can be retried automatically

### Worker Configuration

**Concurrency**
- **Default:** 5
- **What It Means:** How many jobs can run simultaneously
- **Impact:** Higher = faster but more CPU/memory usage

**Job Retry Settings**
- **Max Retries** - How many times to retry failed jobs
- **Retry Delay** - Seconds between retry attempts
- **What It Means:** Transient errors (network issues) get retried automatically

---

## Flow Builder

**Path:** `/flows`

### Flow Actions

**Create Flow**
- Define transformation pipelines
- Connect data sources to targets
- Configure error handling

**Schedule Flow**
- **Cron Expression** - When to run automatically
- **Example:** `0 */6 * * *` = Every 6 hours
- **What It Means:** Flow executes on schedule without manual trigger

**Test Flow**
- Run with sample data
- View transformation output
- Debug errors before production deployment

---

## Data Sources

**Path:** `/datasources`

### Supported Types

**SFTP**
- Connect to remote file servers
- Download files for processing
- **Configuration:** Host, Port, Username, Password/Key

**Database (SQL)**
- PostgreSQL, MySQL, SQL Server
- Query data directly
- **Configuration:** Connection string, credentials

**REST API**
- HTTP/HTTPS endpoints
- GET, POST, PUT, DELETE methods
- **Configuration:** Base URL, auth headers, API key

**Blob Storage**
- Azure Blob, AWS S3
- Large file storage
- **Configuration:** Account, container, access keys

### Connection Testing

Always click "Test Connection" before saving to verify credentials and connectivity.

---

## Best Practices

### Security

1. **Enable WAF** - Always keep enabled in production
2. **Use Strong Passwords** - Minimum 12 characters, mixed case, numbers, symbols
3. **Limit Admin Roles** - Only assign `customer_admin` to trusted users
4. **Whitelist Carefully** - Only add IPs you control
5. **Monitor Logs** - Review error logs weekly

### Configuration Management

1. **Use DEV First** - Test all changes in development
2. **Version Everything** - Create versions for all configuration changes
3. **Document Changes** - Write clear descriptions in change requests
4. **Test Before PROD** - Always validate in staging environment
5. **Plan Rollbacks** - Know how to revert to previous version

### Performance

1. **Adjust Concurrency** - Match worker concurrency to server capacity
2. **Monitor Queue** - Check for job backlog regularly
3. **Clean Old Logs** - Set appropriate retention to save storage
4. **Rate Limit Wisely** - Don't block legitimate traffic

---

## Common Issues and Solutions

### "Access Denied" Error

**Cause:** Insufficient permissions for your role
**Solution:** Contact your administrator to request elevated permissions or use change request workflow

### "WAF Blocked Request"

**Cause:** Request triggered firewall rule
**Solution:** 
- Check IP whitelist configuration
- Review request for suspicious patterns
- Temporarily disable WAF to troubleshoot (not recommended for production)

### "Queue Jobs Failing"

**Cause:** Worker not running or misconfigured
**Solution:**
- Check `/queue` page for worker status
- Verify queue backend configuration
- Review job error logs for specific failure reasons

### "Email Not Sending"

**Cause:** SMTP not configured or credentials invalid
**Solution:**
- Verify SMTP settings in `/settings`
- Click "Send Test Email" to diagnose
- Check that firewall allows outbound port 587/465

---

## Support and Assistance

### Getting Help

1. **Check Logs** - `/events` page shows recent activity
2. **Review Documentation** - This wiki and operational guides
3. **Submit Change Request** - For configuration assistance
4. **Contact Consultant** - For urgent issues or complex changes

### Escalation Path

1. **Customer Admin** - First point of contact for users
2. **Consultant** - Technical support and configuration help
3. **Founder/Superadmin** - Critical issues, security incidents, architecture changes

---

## Glossary

**API Key** - Unique identifier for programmatic access  
**Cron Expression** - Schedule format for automated tasks  
**Immutable** - Cannot be changed (production configurations)  
**Semantic Versioning** - MAJOR.MINOR.PATCH version numbering  
**SMTP** - Email protocol for sending system notifications  
**WAF** - Web Application Firewall for security  
**Worker** - Background process that executes queued jobs

---

## Document Version

**Version:** 1.0.0  
**Last Updated:** November 17, 2025  
**Maintained By:** ContinuityBridge Operations Team  
**Access Level:** Customer Admins, Consultants
