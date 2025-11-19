# ContinuityBridge - Postman Collection Guide

## Overview

ContinuityBridge automatically generates Postman collections for API testing of configured interfaces and flows. This guide covers collection generation, customization, and usage.

---

## What is a Postman Collection?

A **Postman Collection** is a pre-configured set of API requests that includes:
- ✅ Interface endpoints (REST, SOAP, GraphQL)
- ✅ Authentication headers (API Key, Bearer Token, OAuth2, Basic Auth)
- ✅ Sample request payloads (XML/JSON)
- ✅ Environment variables
- ✅ Flow webhook triggers
- ✅ Manual execution endpoints

**Benefits**:
- 🚀 **Instant Testing**: No manual request configuration
- 🔐 **Auth Pre-Configured**: Credentials auto-filled (SuperAdmin) or placeholders
- 📝 **Sample Payloads**: Example XML/JSON for quick testing
- 🔄 **Auto-Regeneration**: Updates when interfaces/flows change
- 🌍 **Multi-Environment**: Separate collections for DEV/STAGING/PROD

---

## Generating a Collection

### Step 1: Access Postman Export

1. Navigate to **Settings** → **Postman** tab
2. Review collection statistics:
   - Total interfaces (inbound/outbound)
   - Protocol breakdown (REST, SOAP, SFTP, etc.)
   - Authentication types
   - Flow counts

### Step 2: Configure Export Options

**Environment Selection**:
```
🔵 DEV       → http://localhost:5000
🟡 STAGING   → https://api.staging.com
🔴 PROD      → https://api.production.com
```

**Include Secrets** (SuperAdmin Only):
- ✅ **Enabled**: Exports actual API keys, tokens, passwords
- ❌ **Disabled**: Uses placeholders like `{{api_key}}`

**Include Flow Triggers**:
- ✅ **Enabled**: Adds webhook and manual trigger endpoints
- ❌ **Disabled**: Only interface requests

**Include Sample Payloads**:
- ✅ **Enabled**: Adds example request bodies
- ❌ **Disabled**: Empty request bodies

### Step 3: Download Collection

1. Click **Download Collection**
2. File downloads: `{organization}-{environment}-collection.json`
3. Example: `acme-corp-dev-collection.json`

---

## Collection Structure

### Folder Organization

```
📁 ContinuityBridge - DEV API Collection
│
├── 📁 Inbound Interfaces (Sources)
│   ├── 📄 SAP ERP (REST API)
│   ├── 📄 Amazon Marketplace (GraphQL)
│   ├── 📄 SFTP File Monitor (SFTP)
│   └── 📄 Shopify Webhook (Webhook)
│
├── 📁 Outbound Interfaces (Destinations)
│   ├── 📄 JDA WMS (SOAP)
│   ├── 📄 Shipstation API (REST API)
│   ├── 📄 Email Notifications (SMTP)
│   └── 📄 Azure Blob Storage (Azure)
│
├── 📁 Flow Triggers
│   ├── 📄 Trigger: Order Sync Flow (Webhook)
│   ├── 📄 Manual Trigger: Order Sync Flow
│   ├── 📄 Trigger: Inventory Update Flow
│   └── 📄 Manual Trigger: Inventory Update Flow
│
└── 📁 ContinuityBridge Internal APIs
    ├── 📄 Health Check
    ├── 📄 Metrics Snapshot
    └── 📄 Recent Events
```

---

## Authentication Examples

### API Key Authentication

**Interface Configuration**:
```json
{
  "authType": "api_key",
  "endpoint": "https://api.example.com/orders"
}
```

**Generated Postman Request**:
```
Headers:
  X-API-Key: {{api_key}}  // Placeholder
  
  OR (if SuperAdmin exports with secrets):
  
  X-API-Key: sk_live_abc123xyz789...  // Actual key
```

**How to Use**:
1. Import collection
2. Edit collection variables
3. Set `api_key` = your actual API key
4. Requests auto-use the variable

---

### Bearer Token Authentication

**Interface Configuration**:
```json
{
  "authType": "bearer_token",
  "endpoint": "https://api.example.com/v1/shipments"
}
```

**Generated Postman Request**:
```
Auth Type: Bearer Token
Token: {{bearer_token}}  // Placeholder

OR (if SuperAdmin exports with secrets):

Token: eyJhbGciOiJIUzI1NiIs...  // Actual JWT
```

**How to Use**:
1. Obtain bearer token from authentication endpoint
2. Set collection variable `bearer_token`
3. Or use Postman's OAuth2 flow to auto-refresh

---

### Basic Authentication

**Interface Configuration**:
```json
{
  "authType": "basic_auth",
  "endpoint": "https://wms.example.com/api/v2"
}
```

**Generated Postman Request**:
```
Auth Type: Basic Auth
Username: {{username}}  // Placeholder
Password: {{password}}  // Placeholder

OR (if SuperAdmin exports with secrets):

Username: integration_user
Password: SecureP@ssw0rd!
```

**How to Use**:
1. Set `username` variable
2. Set `password` variable
3. Postman auto-encodes to Base64

---

### OAuth2 Authentication

**Interface Configuration**:
```json
{
  "authType": "oauth2",
  "oauth2Config": {
    "tokenUrl": "https://auth.example.com/oauth/token",
    "grantType": "client_credentials",
    "scope": "read write"
  }
}
```

**Generated Postman Request**:
```
Auth Type: OAuth2
Token URL: https://auth.example.com/oauth/token
Client ID: {{oauth_client_id}}
Client Secret: {{oauth_client_secret}}
Grant Type: client_credentials
Scope: read write
```

**How to Use**:
1. Set `oauth_client_id` and `oauth_client_secret`
2. Click "Get New Access Token" in Postman
3. Token auto-refreshes when expired

---

## Sample Payload Examples

### XML Payload (SOAP/XML Interfaces)

**Auto-Generated**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Request>
  <Header>
    <Timestamp>2025-01-15T10:30:00Z</Timestamp>
    <InterfaceId>sap-erp-integration</InterfaceId>
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

**Customization**:
- Replace `SAMPLE-001` with actual SKU
- Modify `Quantity` value
- Add/remove fields as needed

---

### JSON Payload (REST/GraphQL Interfaces)

**Auto-Generated**:
```json
{
  "header": {
    "timestamp": "2025-01-15T10:30:00Z",
    "interfaceId": "shopify-orders"
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

**Customization**:
- Replace sample data with real values
- Add/remove fields
- Test with different payload structures

---

## Using Collections in Postman

### Import Collection

1. Open **Postman Desktop** or **Postman Web**
2. Click **Import** (top left)
3. Select **File** tab
4. Choose downloaded `.json` file
5. Click **Import**
6. Collection appears in left sidebar

---

### Configure Variables

**Collection-Level Variables**:
1. Click on collection name
2. Go to **Variables** tab
3. Set values:

```
Variable: base_url
Initial Value: http://localhost:5000
Current Value: https://api.staging.com  // Change per environment

Variable: api_key
Initial Value: {{api_key}}
Current Value: sk_live_abc123...  // Your actual key

Variable: bearer_token
Initial Value: {{bearer_token}}
Current Value: eyJhbGci...  // Your JWT token

Variable: username
Initial Value: {{username}}
Current Value: integration_user

Variable: password
Initial Value: {{password}}
Current Value: SecureP@ss!  // Keep secret
```

**Environment Variables** (Optional):
Create separate environments for DEV/STAGING/PROD:

**DEV Environment**:
```
base_url: http://localhost:5000
api_key: dev_key_123
```

**STAGING Environment**:
```
base_url: https://api.staging.com
api_key: staging_key_456
```

**PROD Environment**:
```
base_url: https://api.production.com
api_key: prod_key_789
```

---

### Test Interface Endpoints

**Example: Testing SAP ERP Interface**

1. Expand **Inbound Interfaces** folder
2. Click **SAP ERP (REST API)**
3. Review request:
   - Method: POST
   - URL: `{{base_url}}/api/sap/orders`
   - Headers: `X-API-Key: {{api_key}}`
   - Body: Sample JSON payload

4. Modify payload if needed
5. Click **Send**
6. Review response:
   - Status: 200 OK
   - Body: Order confirmation

**Success Indicators**:
- ✅ Status 200-299
- ✅ Valid response body
- ✅ No authentication errors

**Troubleshooting**:
- ❌ 401 Unauthorized → Check API key
- ❌ 403 Forbidden → Check permissions
- ❌ 404 Not Found → Check endpoint URL
- ❌ 500 Server Error → Check server logs

---

### Trigger Flows

**Webhook Trigger**:
1. Expand **Flow Triggers** folder
2. Click **Trigger: Order Sync Flow**
3. Request details:
   - Method: POST
   - URL: `{{base_url}}/api/webhook/order-sync-flow`
   - Body: Sample webhook payload

4. Click **Send**
5. Response:
   ```json
   {
     "ok": true,
     "traceId": "abc-123-def-456",
     "message": "Flow execution queued"
   }
   ```

6. Monitor execution:
   - Go to ContinuityBridge dashboard
   - Check **Events** page
   - Find trace ID: `abc-123-def-456`
   - View execution details

**Manual Trigger**:
1. Click **Manual Trigger: Order Sync Flow**
2. Request details:
   - Method: POST
   - URL: `{{base_url}}/api/flows/{flowId}/execute`
   - Body:
     ```json
     {
       "input": { "message": "Manual test" },
       "emulationMode": false
     }
     ```

3. Click **Send**
4. Response includes:
   - `traceId`: For tracking
   - `output`: Flow result
   - `decision`: Business logic outcomes

---

## Regenerating Collections

### When to Regenerate

✅ **After adding new interfaces**
✅ **After creating new flows**
✅ **After modifying authentication**
✅ **After changing endpoints**
✅ **When switching environments**

### How to Regenerate

1. Go to **Settings** → **Postman**
2. Click **Regenerate** button
3. System rebuilds collection:
   - Fetches latest interfaces
   - Fetches latest flows
   - Updates authentication configs
   - Refreshes sample payloads

4. Click **Download Collection**
5. Re-import to Postman:
   - Import replaces existing collection
   - Variables preserved
   - Folder structure updated

**Tip**: Use Postman's **Sync** feature to keep collections updated across team.

---

## Advanced Usage

### Scripts and Tests

**Pre-Request Script** (Set dynamic values):
```javascript
// Generate timestamp
pm.variables.set("timestamp", new Date().toISOString());

// Generate trace ID
pm.variables.set("traceId", pm.variables.replaceIn("{{$guid}}"));
```

**Test Script** (Validate responses):
```javascript
// Check status code
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Check response body
pm.test("Response has traceId", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('traceId');
});

// Save token for next request
pm.test("Save bearer token", function () {
    var jsonData = pm.response.json();
    pm.environment.set("bearer_token", jsonData.access_token);
});
```

---

### Collection Runner

**Batch Testing**:
1. Click collection → **Run**
2. Select requests to run
3. Choose environment
4. Set iterations (run multiple times)
5. Click **Run Collection**

**Results**:
- Pass/Fail status for each request
- Response times
- Test results
- Failed assertions

**Use Cases**:
- Smoke testing after deployment
- Regression testing
- Load testing (with delays)
- Integration validation

---

### Newman (CLI)

**Run collections from command line**:

```bash
# Install Newman
npm install -g newman

# Run collection
newman run acme-dev-collection.json \
  --environment dev-env.json \
  --reporters cli,json

# Run with specific data
newman run acme-dev-collection.json \
  --iteration-data test-data.csv \
  --reporters html
```

**CI/CD Integration**:
```yaml
# GitHub Actions example
- name: Run Postman Tests
  run: |
    newman run collection.json \
      --environment staging.json \
      --bail \
      --reporters cli
```

---

## Security Best Practices

### Credential Management

**❌ Never Do**:
- Commit collections with actual credentials to Git
- Share collections with secrets via email
- Hardcode API keys in requests

**✅ Always Do**:
- Use environment variables for secrets
- Export collections **without secrets** for sharing
- Store credentials in Postman Vault
- Rotate API keys periodically

---

### Exporting Without Secrets

**For Team Sharing**:
1. Settings → Postman
2. **Uncheck** "Include Secrets"
3. Download collection
4. Collection has placeholders:
   ```
   {{api_key}}
   {{bearer_token}}
   {{username}}
   {{password}}
   ```

5. Share collection file
6. Team members set their own credentials

---

### Vault Storage (Postman Cloud)

1. Click collection → **Authorization**
2. Choose auth type
3. Click **Vault** icon
4. Save credentials to Postman Vault
5. Credentials encrypted in cloud
6. Sync across devices securely

---

## Troubleshooting

### Collection Import Fails

**Error**: "Invalid JSON format"
- **Cause**: Corrupted download
- **Solution**: Re-download collection

**Error**: "Missing schema"
- **Cause**: Postman version too old
- **Solution**: Update Postman to latest version

---

### Requests Fail with 401

**Error**: "Authentication required"
- **Cause**: Missing or invalid API key
- **Solution**: Check collection variables, ensure `api_key` is set

**Error**: "Token expired"
- **Cause**: OAuth2 token expired
- **Solution**: Click "Get New Access Token" in Postman

---

### Variables Not Replacing

**Issue**: Request shows `{{api_key}}` instead of actual value
- **Cause**: Variable not set
- **Solution**: 
  1. Edit collection
  2. Go to **Variables** tab
  3. Set **Current Value** for each variable

---

### Sample Payloads Don't Match API

**Issue**: Generated payload structure differs from actual API
- **Cause**: Auto-generated samples are generic
- **Solution**: Customize payload based on API documentation

---

## Support

### Postman Resources

- **Documentation**: https://learning.postman.com/
- **Community**: https://community.postman.com/
- **Support**: https://support.postman.com/

### ContinuityBridge Support

- **Regenerate Collection**: Settings → Postman → Regenerate
- **View Stats**: Settings → Postman → Overview
- **Contact SuperAdmin**: jesus.cruzado@gmail.com

---

*Last Updated: 2025-01-15*
*For questions about Postman collection generation, contact your Superadmin*
