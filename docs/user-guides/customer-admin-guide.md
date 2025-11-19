# 👨‍💼 Customer Admin Guide

## Overview

As a Customer Admin, you manage your organization's ContinuityBridge workspace, including user management, flow configuration, and deployment settings.

## Dashboard Overview

```mermaid
graph TB
    A[Customer Admin Dashboard] --> B[Organization Settings]
    A --> C[User Management]
    A --> D[Flow Configuration]
    A --> E[Monitoring & Reports]
    A --> F[Deployment Config]
    
    B --> B1[Company Info]
    B --> B2[License Details]
    B --> B3[Contacts]
    
    C --> C1[Invite Users]
    C --> C2[Assign Roles]
    C --> C3[Deactivate Users]
    
    D --> D1[Create Flows]
    D --> D2[Configure Integrations]
    D --> D3[Deploy Changes]
    
    E --> E1[Flow Performance]
    E --> E2[Error Reports]
    E --> E3[Usage Analytics]
    
    F --> F1[Cluster Config]
    F --> F2[Resource Limits]
    F --> F3[Security Settings]
```

## Getting Started

### Initial Setup

**First Login Checklist:**

```mermaid
sequenceDiagram
    participant A as Admin
    participant S as System
    
    A->>S: First Login
    S-->>A: Welcome Wizard
    A->>S: Update Company Info
    A->>S: Add Deployment Contacts
    A->>S: Invite Team Members
    A->>S: Review License
    S-->>A: Setup Complete
```

**Steps:**
1. ✅ Update organization profile
2. ✅ Add deployment contact email
3. ✅ Add technical contact email
4. ✅ Invite customer users
5. ✅ Review license limitations
6. ✅ Complete security checklist

---

## User Management

### Invite Team Members

```mermaid
graph LR
    A[Invite User] --> B[Enter Email]
    B --> C[Assign Role]
    C --> D{Role Type}
    D -->|Admin| E[Full Access]
    D -->|User| F[Limited Access]
    E --> G[Send Invitation]
    F --> G
    G --> H[User Activates]
```

**To Invite:**
1. Go to **Settings** → **Users**
2. Click **"Invite User"**
3. Enter email address
4. Select role:
   - **Customer Admin:** Full organization access
   - **Customer User:** View and monitor only
5. Set permissions (optional):
   - Create flows
   - Edit flows
   - Delete flows
   - View reports
6. Click **"Send Invitation"**

**Email Template Sent:**
```
Subject: You've been invited to ContinuityBridge

[Your Name] has invited you to join [Company Name]'s 
ContinuityBridge workspace.

Role: Customer User
Access Level: View & Monitor

Click here to activate your account: [Link]

This link expires in 48 hours.
```

---

### Manage Existing Users

**User Actions:**

```mermaid
graph TD
    A[User Management] --> B[Active Users]
    A --> C[Pending Invites]
    A --> D[Deactivated Users]
    
    B --> B1[Edit Permissions]
    B --> B2[Change Role]
    B --> B3[Deactivate]
    
    C --> C1[Resend Invite]
    C --> C2[Cancel Invite]
    
    D --> D1[Reactivate]
    D --> D2[Delete Permanently]
```

**Common Tasks:**

**Change User Role:**
```
Settings → Users → [User] → Edit
Change Role: Admin/User
Update Permissions
Save
```

**Deactivate User:**
```
Settings → Users → [User] → Deactivate
Reason: [Select reason]
Transfer Ownership: [If they own flows]
Confirm
```

**Reactivate User:**
```
Settings → Users → Deactivated → [User] → Reactivate
Confirm
```

---

## Flow Management

### Create Integration Flow

```mermaid
graph TB
    A[Start] --> B[Select Source]
    B --> C[Select Destination]
    C --> D[Configure Auth]
    D --> E[Map Fields]
    E --> F[Add Transformations]
    F --> G[Set Triggers]
    G --> H[Test Flow]
    H --> I{Test Pass?}
    I -->|Yes| J[Deploy to Production]
    I -->|No| K[Debug & Fix]
    K --> H
```

**Step-by-Step:**

**1. Create New Flow:**
```
Flows → Create Flow
Name: Salesforce to SAP Orders
Description: Sync new orders from Salesforce to SAP
```

**2. Configure Source (Salesforce):**
```
System Type: Predefined → Salesforce
Auth Method: OAuth 2.0
Click "Connect to Salesforce"
Authorize access
Select Object: Order
Trigger: On Create/Update
```

**3. Configure Destination (SAP):**
```
System Type: Predefined → SAP
Auth Method: API Key
API Key: [From Secrets Vault]
Endpoint: /api/orders
Method: POST
```

**4. Map Fields:**
```
Source Field          →  Destination Field
-----------------        -------------------
Order.Id             →  order_id
Order.CustomerName   →  customer_name
Order.Total          →  total_amount
Order.Items          →  line_items
```

**5. Add Transformations:**
```javascript
// Example transformation
{
  "customer_name": "{{ Order.CustomerName | uppercase }}",
  "total_amount": "{{ Order.Total | multiply(1.15) }}", // Add tax
  "order_date": "{{ Order.CreatedDate | date('YYYY-MM-DD') }}"
}
```

**6. Set Error Handling:**
```
On Error: Retry 3 times
Retry Delay: 5 seconds
Final Failure: Send email notification
Alert Email: admin@yourcompany.com
```

**7. Test:**
```
Click "Test Flow"
Use Sample Data or Real Record
Review Output
Check for Errors
```

**8. Deploy:**
```
Click "Deploy to Production"
Confirm
Monitor first 10 executions
```

---

### Monitor Flow Performance

```mermaid
graph LR
    A[Flow Monitoring] --> B[Real-time Status]
    A --> C[Execution History]
    A --> D[Error Logs]
    A --> E[Performance Metrics]
    
    B --> B1[Active/Paused]
    B --> B2[Last Execution]
    B --> B3[Success Rate]
    
    C --> C1[Filter by Date]
    C --> C2[View Details]
    C --> C3[Export CSV]
    
    D --> D1[Error Type]
    D --> D2[Error Count]
    D --> D3[Remediation]
    
    E --> E1[Avg Duration]
    E --> E2[Records/Hour]
    E --> E3[Trends]
```

**Access Monitoring:**
```
Flows → [Flow Name] → Monitoring
```

**Key Metrics:**
- **Success Rate:** 99.5%
- **Avg Duration:** 245ms
- **Records Processed:** 1,250 today
- **Errors:** 2 (0.16%)
- **Status:** Active

**View Execution Details:**
```
Click on any execution
See: Input Data, Output Data, Errors, Duration
Download: JSON payload
```

---

## Organization Settings

### Company Information

```
Settings → Organization → Profile
```

**Editable Fields:**
- Organization Name
- Industry
- Company Size
- Website
- Address
- Phone
- Primary Contact

### Deployment Contacts

```mermaid
graph TB
    A[Deployment Contacts] --> B[Deployment Contact]
    A --> C[Technical Contact]
    
    B --> B1[Receives deployment packages]
    B --> B2[Signed download links]
    B --> B3[Deployment instructions]
    
    C --> C1[Technical questions]
    C --> C2[Cluster configuration]
    C --> C3[Integration support]
```

**Configure:**
```
Settings → Organization → Contacts

Deployment Contact:
  Name: John Doe
  Email: john.doe@yourcompany.com
  
Technical Contact:
  Name: Jane Smith
  Email: jane.smith@yourcompany.com
```

**When Are These Used?**
- ✅ Deployment packages are emailed to deployment contact
- ✅ Technical issues are sent to technical contact
- ✅ Cluster configuration instructions go to both

---

## Deployment Configuration

### Standard Deployment (Default)

**For most organizations:**

```mermaid
graph LR
    A[Single Server] --> B[Docker Compose]
    B --> C[App Container]
    B --> D[Database]
    B --> E[Redis/Valkey]
    
    C --> F[Port 5000]
    D --> F
    E --> F
```

**No configuration needed** - works out of the box.

---

### Cluster Deployment (Enterprise)

**For high-availability, scalable deployments:**

```mermaid
graph TB
    subgraph "Server A - Application"
        A1[App Instance 1]
        A2[App Instance 2]
        A3[Load Balancer]
    end
    
    subgraph "Server B - Database"
        B1[PostgreSQL]
        B2[Valkey/Redis]
        B3[Backups]
    end
    
    A1 --> A3
    A2 --> A3
    A3 -->|Private Network| B1
    A3 -->|Private Network| B2
    B1 --> B3
```

**Configuration Access:**

**Prerequisite:** Only available if you have **Cluster** deployment profile in your license.

**Steps:**
1. Go to **Settings** → **Cluster Config**
2. Click **"Enable Cluster Mode"**

**Tab 1: Servers**
```
App Server Configuration:
  Host: 10.0.1.10
  Port: 5000
  Replicas: 2
  CPU Limit: 2.0
  Memory Limit: 4GB

DB Server Configuration:
  Host: 10.0.1.20
  PostgreSQL Port: 5432
  Redis Port: 6379
  CPU Limit: 4.0
  Memory Limit: 8GB
```

**Tab 2: Network & Security**
```
Network:
  ✅ Private Network (Recommended)
  ✅ SSL/TLS Enabled
  
Firewall Rules:
  App Server: Allow 5000 from internet
  DB Server: Allow 5432,6379 from App Server only
  
Connectivity Test:
  [Test Connection Button]
```

**Tab 3: Setup Instructions**
```
Step-by-step deployment commands for your IT team:

Server A (Application):
  $ cd deployment-package
  $ chmod +x deploy-cluster.sh
  $ ./deploy-cluster.sh
  > Select: 1) App Server

Server B (Database):
  $ cd deployment-package
  $ chmod +x deploy-cluster.sh
  $ ./deploy-cluster.sh
  > Select: 2) DB Server
```

**Copy All Commands Button** - copies to clipboard

---

## Reports & Analytics

### Flow Performance Report

```mermaid
graph LR
    A[Reports] --> B[Flow Performance]
    A --> C[Error Analysis]
    A --> D[Usage Trends]
    A --> E[Cost Estimation]
    
    B --> B1[Export PDF]
    C --> C1[Export CSV]
    D --> D1[Charts]
    E --> E1[Monthly]
```

**Generate Report:**
```
Reports → Flow Performance
Date Range: Last 30 days
Flows: All (or select specific)
Format: PDF
Click "Generate Report"
```

**Report Includes:**
- Total executions
- Success/failure rate
- Average duration
- Peak usage hours
- Error breakdown
- Performance trends

---

## GDPR & Privacy

### Your Rights

```mermaid
graph TD
    A[GDPR Rights] --> B[Export Your Data]
    A --> C[Request Deletion]
    A --> D[View Privacy Info]
    
    B --> B1[GET /api/gdpr/export]
    C --> C1[DELETE /api/gdpr/delete]
    D --> D1[GET /api/gdpr/info]
```

**Export All Your Data:**
```
Settings → Privacy → Export My Data
Format: JSON (portable)
Includes: Profile, Flows, Logs, Sessions
Download ZIP file
```

**Request Account Deletion:**

⚠️ **WARNING:** This action has specific rules for Customer Admins.

```mermaid
graph TD
    A[Request Deletion] --> B{Other Users?}
    B -->|Yes| C[Cannot Delete]
    C --> C1[Transfer ownership first]
    B -->|No| D{Active License?}
    D -->|Yes| E[Soft Delete]
    E --> E1[Schedules contract termination]
    E --> E2[30-day notice to founder]
    E --> E3[Organization preserved]
    D -->|No| F[Full Deletion]
    F --> F1[All data deleted]
    F --> F2[Cannot be undone]
```

**For Customer Admins:**
- ❌ Cannot delete if you have active users → Transfer ownership first
- ⚠️ Deletion triggers contract termination (30-day window)
- ✅ Organization data preserved during notice period
- ✅ Can cancel deletion within 30 days

**For Regular Users:**
- ✅ Can request full deletion anytime
- ⚠️ Permanent and irreversible
- ✅ Confirmation token required

**To Request Deletion:**
```
Settings → Privacy → Delete My Account
Reason: [Select reason]
Confirmation Token: DELETE_MY_DATA_[your-user-id]
Type "DELETE" to confirm
Submit Request
```

---

## Troubleshooting

### Common Issues

**1. Flow Not Executing**

```mermaid
graph LR
    A[Flow Not Running] --> B{Check}
    B --> C[Flow Enabled?]
    B --> D[Trigger Active?]
    B --> E[Credentials Valid?]
    B --> F[Error Logs?]
    
    C --> G[Enable Flow]
    D --> H[Configure Trigger]
    E --> I[Refresh Auth]
    F --> J[Fix Errors]
```

**Solution:**
```
1. Check flow status (Active/Paused)
2. Verify trigger configuration
3. Test authentication credentials
4. Review error logs
5. Contact support if persists
```

**2. Mapping Errors**

**Symptoms:**
- Field not found
- Type mismatch
- Null values

**Fix:**
```
Flows → [Flow] → Edit → Mappings
Review source field names (case-sensitive)
Check data types match
Add null checks
Test with sample data
```

**3. Performance Issues**

**If flow is slow:**
```
1. Check payload size (< 1MB recommended)
2. Enable pagination for large datasets
3. Optimize transformations
4. Review retry settings
5. Contact consultant for optimization
```

---

## Best Practices

### Security
- ✅ Use Secrets Vault for API keys
- ✅ Enable 2FA on your account
- ✅ Review user access quarterly
- ✅ Rotate credentials every 90 days

### Flow Design
- ✅ Use descriptive flow names
- ✅ Add comments to complex mappings
- ✅ Test thoroughly before production
- ✅ Set up error notifications

### Monitoring
- ✅ Check dashboard daily
- ✅ Review error logs weekly
- ✅ Generate monthly reports
- ✅ Monitor license usage

---

## Need Help?

**Your Support Contacts:**

```
Technical Questions:
  → Contact your assigned consultant
  → Email: [consultant-email]

Billing/License Questions:
  → Email: billing@continuitybridge.com

System Issues:
  → Email: support@continuitybridge.com

Emergency (System Down):
  → Call: [support-phone]
```

**Self-Service Resources:**
- User Guides: `/docs/user-guides`
- Video Tutorials: `/docs/tutorials`
- FAQ: `/docs/faq`
- API Docs: `/docs/api`

---

**Last Updated:** November 18, 2025
