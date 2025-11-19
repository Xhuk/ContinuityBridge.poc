# 🔧 Founder & Superadmin Guide

## Overview

As a Founder or Superadmin, you have complete control over the ContinuityBridge platform, including license management, deployment configuration, and system-wide settings.

## System Architecture

```mermaid
graph TB
    subgraph "Founder Control Panel"
        A[Superadmin Dashboard]
        B[License Management]
        C[Export & Deployment]
        D[Customer Management]
        E[System Configuration]
    end
    
    A --> B
    A --> C
    A --> D
    A --> E
    
    B --> B1[Create Licenses]
    B --> B2[Assign Features]
    B --> B3[Set Expiry]
    
    C --> C1[Cluster Config]
    C --> C2[Export Package]
    C --> C3[GCS Upload]
    
    D --> D1[View All Orgs]
    D --> D2[Manage Consultants]
    D --> D3[Support Tickets]
```

## Key Responsibilities

### 1. License Management

**Create a New Customer License:**

```mermaid
sequenceDiagram
    participant F as Founder
    participant API as API
    participant DB as Database
    participant GCS as Google Cloud Storage
    
    F->>API: POST /api/licenses
    API->>DB: Create License Record
    DB-->>API: License Created
    API->>GCS: Upload License File
    GCS-->>API: Upload Complete
    API-->>F: License Key + Download URL
```

**Steps:**
1. Navigate to **Settings** → **License Management**
2. Click **"Create New License"**
3. Fill in customer details:
   - Organization Name
   - License Type (trial/annual/perpetual)
   - Expiration Date
   - Deployment Contact Email
   - Technical Contact Email
4. Click **"Generate License"**
5. Download license file or send to customer

---

### 2. Deployment & Export

**Generate Deployment Package:**

```mermaid
graph LR
    A[Select Profile] --> B{Profile Type}
    B -->|Standalone| C[Single Server]
    B -->|Standard| D[Docker Compose]
    B -->|Cluster| E[Multi-Server]
    B -->|Kubernetes| F[K8s Manifests]
    
    C --> G[Export Package]
    D --> G
    E --> G
    F --> G
    
    G --> H[Upload to GCS]
    H --> I[Generate Signed URL]
    I --> J[Email Customer]
```

**Deployment Profiles:**

| Profile | Use Case | Servers | Scalability |
|---------|----------|---------|-------------|
| **Standalone** | Development/Testing | 1 | Low |
| **Standard** | Small Business | 1 | Medium |
| **Cluster** | Enterprise | 2+ | High |
| **Kubernetes** | Large Scale | 3+ | Very High |

**To Generate:**
1. Go to **Settings** → **Export & Deployment**
2. Select customer organization
3. Choose deployment profile
4. Configure cluster settings (if applicable):
   - App Server Host/Port
   - DB Server Host/Port
   - Replica Count
   - Resource Limits
5. Click **"Generate Deployment Package"**
6. System will:
   - Create Docker images
   - Generate configuration files
   - Upload to Google Cloud Storage
   - Email customer with download link

---

### 3. Cluster Configuration

**For Enterprise Customers (Cluster Profile):**

```mermaid
graph TB
    subgraph "Server A - Application"
        A1[App Container x2]
        A2[Load Balancer]
        A3[SSL/TLS]
    end
    
    subgraph "Server B - Database"
        B1[PostgreSQL]
        B2[Valkey/Redis]
        B3[Backups]
    end
    
    A1 --> A2
    A2 --> A3
    A3 -->|Private Network| B1
    A3 -->|Private Network| B2
    B1 --> B3
```

**Configuration Steps:**
1. Navigate to **Settings** → **Cluster Config**
2. **Servers Tab:**
   - App Server: `10.0.1.10:5000`
   - DB Server: `10.0.1.20:5432`
   - Redis Server: `10.0.1.20:6379`
   - App Replicas: `2`
3. **Network & Security Tab:**
   - Enable Private Network
   - Enable SSL/TLS
   - Configure firewall rules
4. **Setup Instructions Tab:**
   - Copy deployment commands
   - Share with customer IT team

---

### 4. Customer Management

**View All Organizations:**

```mermaid
graph TD
    A[All Organizations] --> B[Active]
    A --> C[Trial]
    A --> D[Expired]
    A --> E[Cancelled]
    
    B --> B1[View License]
    B --> B2[Deployment Status]
    B --> B3[Usage Metrics]
    
    C --> C1[Convert to Paid]
    C --> C2[Extend Trial]
    
    D --> D1[Renew]
    D --> D2[Archive]
    
    E --> E1[View Termination]
    E --> E2[GDPR Deletion]
```

**Actions Available:**
- View organization details
- Check deployment status
- Review license information
- Access customer flows (read-only)
- Assign consultants
- Manage support tickets

---

## Advanced Features

### Google Cloud Storage Configuration

**Setup for Deployment Storage:**

1. **Create GCS Bucket:**
   ```bash
   Bucket Name: continuitybridge-deployments
   Location: us-central1
   Storage Class: Standard
   Access Control: Uniform
   ```

2. **Configure Environment Variables:**
   ```env
   GCP_PROJECT_ID=your-project-id
   GCS_DEPLOYMENT_BUCKET=continuitybridge-deployments
   GCP_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
   ```

3. **Test Connection:**
   ```bash
   npm run test:gcs
   ```

---

### GDPR Compliance

**Founder GDPR Responsibilities:**

```mermaid
graph LR
    A[GDPR Request] --> B{Request Type}
    B -->|Export| C[Generate Data Export]
    B -->|Delete| D{User Type}
    
    D -->|Customer Admin| E[Schedule Termination]
    D -->|Customer User| F[Full Deletion]
    D -->|Consultant| G[Transfer First]
    D -->|Primary Founder| H[BLOCKED]
    
    C --> I[Email ZIP File]
    E --> J[30-Day Notice]
    F --> K[Immediate Deletion]
    G --> L[Reassign Customers]
```

**Important Notes:**
- ✅ Consultants can request GDPR deletion
- ✅ Other superadmins can request deletion
- ❌ Primary Founder (you) cannot self-delete
- ⚠️ Customer admins trigger contract termination

**Primary Founder Protection:**
- Set `PRIMARY_FOUNDER_USER_ID` in `.env`
- This user ID is protected from deletion
- Can disable account or transfer ownership instead

---

## Security Best Practices

### 1. API Key Management
```env
SUPERADMIN_API_KEY=cb_prod_superadmin_CHANGE_THIS
```
⚠️ Change default keys in production

### 2. Encryption
```env
ENCRYPTION_KEY=generate-32-character-random-key
```
🔐 Use strong random keys

### 3. Database Backups
- Automatic daily backups enabled
- Retention: 30 days
- Manual backup: Settings → Backups

### 4. Access Logs
- All superadmin actions logged
- Review: Settings → System Logs
- Filter by action type

---

## Common Tasks

### Create Trial License
```
Settings → Licenses → New License
Type: Trial
Duration: 14 days
Features: All (limited)
```

### Convert Trial to Paid
```
Settings → Licenses → [Customer] → Upgrade
Select: Annual/Perpetual
Update expiry date
Save
```

### Assign Consultant to Customer
```
Settings → Customers → [Customer] → Consultants
Add Consultant: [Select from list]
Permissions: View/Edit/Deploy
Save
```

### Generate Deployment Report
```
Settings → Export → Reports
Select Customer
Date Range
Export Format: PDF/CSV
Download
```

---

## Troubleshooting

### Deployment Package Generation Fails

**Check:**
1. GCS credentials configured
2. Bucket exists and accessible
3. Sufficient GCP credits
4. Network connectivity

**Fix:**
```bash
# Test GCS connection
node -e "require('dotenv').config(); ..."

# Check logs
tail -f logs/export.log
```

### Customer Cannot Access Deployment

**Verify:**
1. License not expired
2. Download URL not expired (7 days)
3. Customer email correct
4. Firewall not blocking GCS

**Resolution:**
```
Settings → Licenses → [Customer] → Regenerate Download Link
```

---

## Need Help?

- **Technical Support:** support@continuitybridge.com
- **GDPR Questions:** privacy@continuitybridge.com
- **Emergency:** founder@continuitybridge.com

---

**Last Updated:** November 18, 2025
