# QA Testing Guide - ContinuityBridge

**Tags:** operational, qa, testing, validation

**Created:** 2025-11-17
**Updated:** 2025-11-17

---

## Overview

This guide provides comprehensive testing scenarios and validation procedures for QA engineers testing ContinuityBridge in production. The application is currently deployed on Render with an empty database.

---

## Pre-Testing Setup

### **1. Access Credentials**

**Production URL:** `https://networkvoid.xyz`

**QA Account:**
- You will receive an enrollment email with:
  - Your API key (`cb_xxxxx`)
  - Enrollment link to set password
  - Role assignment

**Login Methods:**
1. **Web UI:** Email + Password
2. **API:** X-API-Key header with your API key

---

## Test Categories

---

## 1. Authentication & Authorization Testing

### **1.1 User Enrollment**

**Test:** Complete enrollment process

**Steps:**
1. Check email for enrollment invitation
2. Click enrollment link
3. Verify token is valid (`GET /api/enrollment/verify/{token}`)
4. Set password (min 8 characters)
5. Submit enrollment form

**Expected Results:**
- ✅ Token validates successfully
- ✅ Password requirements enforced
- ✅ Account activated
- ✅ Can login with email + password

**Validation Points:**
- ❌ Expired token shows error
- ❌ Weak password rejected
- ❌ Invalid token returns 404

---

### **1.2 Login Testing**

**Test:** Login with different methods

**Scenarios:**

**A. Password Login:**
```
POST /admin
{
  "email": "your-email",
  "password": "your-password"
}
```

**B. API Key Authentication:**
```
GET /api/users/me
Headers: X-API-Key: cb_xxxxx
```

**Expected Results:**
- ✅ Valid credentials → session created
- ❌ Wrong password → 401 Unauthorized
- ❌ Invalid API key → 401 Unauthorized
- ✅ Session persists across requests

---

### **1.3 Role-Based Access Control**

**Test:** Verify permissions by role

| Endpoint | QA (consultant) | Should Access |
|----------|-----------------|---------------|
| `/api/founder/users` | ❌ | No - Founders only |
| `/api/wiki/pages` | ✅ | Yes - Operational docs |
| `/api/flows` | ✅ | Yes - Can create flows |
| `/api/admin/projects` | ❌ | No - Founders only |
| `/api/admin/users` | ❌ | No - Customer admin only |

**Validation:**
- Access denied endpoints return **403 Forbidden**
- Allowed endpoints return data or **200 OK**

---

## 2. Data Source Testing

### **2.1 Create Data Sources**

**Test:** Configure various data source types

**A. SFTP Data Source:**

```json
{
  "name": "Test SFTP Server",
  "type": "sftp",
  "config": {
    "host": "sftp.example.com",
    "port": 22,
    "username": "testuser",
    "password": "testpass",
    "basePath": "/uploads"
  }
}
```

**Expected:**
- ✅ Data source saved
- ✅ Test connection button available
- ❌ Invalid host/port rejected
- ❌ Authentication failure detected

**B. Database Data Source:**

```json
{
  "name": "Test PostgreSQL",
  "type": "database",
  "config": {
    "connectionString": "postgresql://user:pass@host:5432/db",
    "dbType": "postgresql"
  }
}
```

**Expected:**
- ✅ Connection string validated
- ✅ Test connectivity works
- ❌ Malformed connection string rejected

**C. Azure Blob Data Source:**

```json
{
  "name": "Test Blob Storage",
  "type": "azureblob",
  "config": {
    "connectionString": "DefaultEndpointsProtocol=https;AccountName=...",
    "containerName": "uploads"
  }
}
```

**Validation Points:**
- ✅ Valid connection string format
- ✅ Container name follows Azure naming rules
- ❌ Empty required fields rejected

---

### **2.2 Test Connectivity**

**Test:** Verify connection test buttons work

**Steps:**
1. Create data source
2. Click "Test Connection" button
3. Observe result

**Expected Results:**

| Result | Status | Message |
|--------|--------|---------|
| Success | ✅ | "Connection successful" |
| Invalid credentials | ❌ | "Authentication failed" |
| Unreachable host | ❌ | "Connection timeout" |
| Malformed config | ❌ | "Invalid configuration" |

---

## 3. Flow Builder Testing

### **3.1 Create Basic Flow**

**Test:** Build a simple transformation flow

**Steps:**
1. Navigate to `/flows`
2. Click "New Flow"
3. Name: "QA Test Flow 1"
4. Add Ingress node (HTTP Receiver)
5. Add Transform node (JSON mapping)
6. Add Egress node (HTTP Send)
7. Connect nodes
8. Save flow

**Expected:**
- ✅ Nodes added to canvas
- ✅ Connections created
- ✅ Flow saved successfully
- ✅ Flow appears in flow list

---

### **3.2 Node Configuration Validation**

**Test:** Each node type's configuration

**A. Ingress Node (SFTP Poller):**

**Required Fields:**
- Data source (must be SFTP type)
- Poll interval (minutes)
- File pattern (glob)

**Validation:**
- ❌ Missing data source → error
- ❌ Poll interval < 1 → error
- ❌ Invalid glob pattern → warning
- ✅ Valid config → saves

**B. Transform Node (JSON Mapper):**

**Required Fields:**
- Input schema (JSON schema)
- Output schema (JSON schema)
- Mapping rules (JSONPath)

**Validation:**
- ❌ Invalid JSON schema → error
- ❌ Malformed JSONPath → error
- ✅ Valid mapping → preview available

**C. Database Connector Node:**

**Required Fields:**
- Data source (database type)
- Operation type (query/insert/update)
- SQL query or operation

**Validation:**
- ❌ SQL injection patterns → blocked
- ❌ Missing required fields → error
- ✅ Test query button → executes safely
- ✅ Template variables validated

**D. Scheduler Node:**

**Required Fields:**
- Cron expression

**Validation:**
- ❌ Invalid cron syntax → error with hint
- ✅ Valid cron → shows next run time
- ✅ Cron helper/picker available

---

### **3.3 Flow Execution Testing**

**Test:** Execute flows and verify results

**Steps:**
1. Create flow with test configuration
2. Click "Test Flow" (preview mode)
3. Provide sample input data
4. Execute
5. Review execution logs

**Expected:**
- ✅ Flow execution starts
- ✅ Each node shows status (pending/running/completed/error)
- ✅ Output data matches expectations
- ✅ Execution logs captured
- ❌ Errors are caught and logged

**Sample Input for HTTP Ingress:**
```json
{
  "orderId": "12345",
  "customer": "Acme Corp",
  "items": [
    { "sku": "PROD-001", "qty": 10 }
  ]
}
```

---

### **3.4 Error Handling**

**Test:** Verify error scenarios are handled

**Error Scenarios:**

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid input data | ❌ Flow fails with clear error message |
| Missing required field | ❌ Validation error before execution |
| SFTP connection lost | ❌ Retry logic triggers, error logged |
| Database query timeout | ❌ Error captured, flow marked failed |
| Mapping error (JSONPath) | ❌ Transformation fails with path details |

**Validation:**
- All errors logged to `/events`
- Error messages are descriptive
- Stack traces available for debugging
- Retry count respected

---

## 4. Interface Testing

### **4.1 Create Interfaces**

**Test:** Define inbound/outbound interfaces

**A. Inbound Interface (REST API):**

```json
{
  "name": "Order API",
  "direction": "inbound",
  "protocol": "http",
  "config": {
    "path": "/api/orders",
    "method": "POST",
    "authentication": "api-key",
    "schema": { /* JSON schema */ }
  }
}
```

**Expected:**
- ✅ Interface saved
- ✅ Endpoint generated
- ✅ Schema validation active
- ✅ Request with invalid schema → 400 error

**B. Outbound Interface (Webhook):**

```json
{
  "name": "Order Notification",
  "direction": "outbound",
  "protocol": "http",
  "config": {
    "url": "https://customer.com/webhook",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer xxx"
    }
  }
}
```

**Validation:**
- ✅ URL format validated
- ✅ HTTPS enforced for production
- ❌ Invalid URL → error

---

### **4.2 Interface Authentication**

**Test:** Verify authentication methods

**Types:**
1. **API Key:** Header or query parameter
2. **OAuth 2.0:** Token exchange flow
3. **Basic Auth:** Username + password

**Validation:**
- ✅ Valid credentials → access granted
- ❌ Missing credentials → 401
- ❌ Expired token → 401
- ✅ Token refresh works (OAuth)

---

## 5. Logging & Monitoring

### **5.1 Event Logs**

**Test:** Verify logging functionality

**Steps:**
1. Navigate to `/events`
2. Execute a flow
3. Check logs appear
4. Filter by level (debug/info/warn/error)

**Expected Log Entries:**
- Flow execution started
- Node execution (each step)
- Data transformations
- External API calls
- Errors with stack traces
- Flow execution completed

**Validation:**
- ✅ Logs appear in real-time
- ✅ Filtering works
- ✅ Search functionality works
- ✅ Log levels respected
- ✅ Sensitive data masked (passwords, API keys)

---

### **5.2 Performance Metrics**

**Test:** Dashboard metrics accuracy

**Metrics to Verify:**
- Total events processed
- Average latency (ms)
- P95 latency
- Transactions per second (TPS)
- Error rate

**Validation:**
- ✅ Metrics update after flow execution
- ✅ Chart displays correctly
- ✅ Historical data retained
- ✅ Metrics match actual execution

---

## 6. Configuration Management

### **6.1 Settings Testing**

**Test:** Configure system settings

**A. SMTP Configuration:**

**Steps:**
1. Navigate to `/settings` → Email tab
2. Configure SMTP:
   - Host: `smtp.gmail.com`
   - Port: `587`
   - Username: test email
   - Password: app password
3. Click "Send Test Email"

**Expected:**
- ✅ Test email received
- ❌ Wrong credentials → error shown
- ❌ Invalid port → connection failed

**B. Queue Configuration:**

**Options:**
- BullMQ (Redis)
- PGMq (PostgreSQL)
- In-Memory

**Validation:**
- ✅ Backend selection saved
- ✅ Worker status displayed
- ✅ Job queue visible
- ✅ Failed jobs can be retried

---

### **6.2 Logging Configuration**

**Test:** Per-scope log settings

**Steps:**
1. Go to `/settings` → Logging tab
2. Configure:
   - Min log level: Info
   - Retention days: 30
   - Max log size: 100MB
3. Save

**Expected:**
- ✅ Settings saved
- ✅ Logs below min level not stored
- ✅ Old logs deleted after retention period
- ✅ Log size limit enforced

---

## 7. API Key Management

### **7.1 View API Key**

**Test:** Access your API key

**Steps:**
1. Navigate to `/profile`
2. View API Key section

**Expected:**
- ✅ API key visible
- ✅ Copy button works
- ✅ "Regenerate" button available
- ⚠️ Warning shown before regeneration

---

### **7.2 Use API Key**

**Test:** Authenticate with API key

**cURL Example:**
```bash
curl -H "X-API-Key: cb_xxxxx" \
  https://networkvoid.xyz/api/flows
```

**Expected:**
- ✅ Returns flow list
- ❌ Invalid key → 401
- ❌ Missing header → 401

---

## 8. Wiki Documentation

### **8.1 Access Wiki**

**Test:** Role-based wiki access

**Steps:**
1. Navigate to `/wiki`
2. Verify visible pages

**Expected for QA (Consultant):**
- ✅ Customer User Configuration Manual
- ✅ Operational guides
- ❌ Strategic/business docs (hidden)
- ❌ Founder-only content (hidden)

**Validation:**
- Access denied pages return 403
- Search works
- Markdown renders correctly

---

## 9. Edge Cases & Negative Testing

### **9.1 Boundary Testing**

**Test:** System limits and boundaries

| Test | Input | Expected |
|------|-------|----------|
| Max flow name length | 300 chars | ✅ Accepted |
| Max flow name length | 301 chars | ❌ Rejected |
| Max nodes per flow | 100 nodes | ✅ Accepted |
| Concurrent flows | 50 simultaneous | ✅ All execute |
| Large payload | 10MB JSON | ✅ Processed |
| Large payload | 100MB JSON | ❌ Size limit error |

---

### **9.2 Malformed Input**

**Test:** Invalid data handling

**Test Cases:**

**A. Invalid JSON:**
```json
{ invalid json here
```
**Expected:** 400 Bad Request with parse error

**B. SQL Injection Attempt:**
```sql
'; DROP TABLE users; --
```
**Expected:** ❌ Blocked by validation

**C. XSS Attempt:**
```html
<script>alert('xss')</script>
```
**Expected:** ❌ Sanitized/escaped

**D. Path Traversal:**
```
../../../etc/passwd
```
**Expected:** ❌ Blocked

---

## 10. Production-Specific Tests

### **10.1 SSL/TLS**

**Test:** HTTPS enforcement

**Validation:**
- ✅ All pages served over HTTPS
- ❌ HTTP redirects to HTTPS
- ✅ Valid SSL certificate
- ✅ No mixed content warnings

---

### **10.2 WAF Protection**

**Test:** Web Application Firewall

**Test Scenarios:**

| Attack Type | Expected Result |
|-------------|-----------------|
| Known bot user-agent | ❌ Blocked (404 or 403) |
| Rapid requests (>30/min) | ❌ Rate limited (429) |
| SQL injection pattern | ❌ Blocked |
| XSS pattern | ❌ Blocked |
| Path traversal | ❌ Blocked |
| Whitelisted IP | ✅ Allowed |

---

### **10.3 Performance Testing**

**Test:** System under load

**Scenarios:**
1. **Single Flow:** Execute 100 times → < 2s avg latency
2. **Concurrent Flows:** 10 flows simultaneously → all complete
3. **Large Batch:** 1000 records → processed without memory issues
4. **Long-Running Flow:** 5 minute execution → doesn't timeout

**Metrics to Monitor:**
- CPU usage
- Memory usage
- Database connections
- Response times

---

## 11. Defect Reporting Template

When you find a bug, report with:

```markdown
**Title:** [Component] Brief description

**Environment:** Production (networkvoid.xyz)

**Priority:** Critical / High / Medium / Low

**Steps to Reproduce:**
1. Navigate to...
2. Click...
3. Enter...
4. Observe...

**Expected Result:**
What should happen

**Actual Result:**
What actually happened

**Screenshots/Logs:**
[Attach evidence]

**Additional Context:**
Browser, API response, error logs
```

---

## 12. Test Checklist

Use this checklist to track test coverage:

### **Authentication**
- [ ] Enrollment completion
- [ ] Password login
- [ ] API key authentication
- [ ] Role-based access control
- [ ] Session persistence

### **Data Sources**
- [ ] SFTP configuration
- [ ] Database configuration
- [ ] Azure Blob configuration
- [ ] Connection testing
- [ ] Invalid config rejection

### **Flows**
- [ ] Create flow
- [ ] Add nodes
- [ ] Configure nodes
- [ ] Connect nodes
- [ ] Execute flow (test mode)
- [ ] Execute flow (production)
- [ ] View execution logs
- [ ] Error handling

### **Interfaces**
- [ ] Create inbound interface
- [ ] Create outbound interface
- [ ] Schema validation
- [ ] Authentication

### **Monitoring**
- [ ] Event logs visible
- [ ] Log filtering works
- [ ] Metrics accurate
- [ ] Dashboard updates

### **Settings**
- [ ] SMTP configuration
- [ ] Queue configuration
- [ ] Logging configuration
- [ ] Settings persist

### **Security**
- [ ] WAF active
- [ ] Rate limiting works
- [ ] SQL injection blocked
- [ ] XSS sanitized
- [ ] HTTPS enforced

### **API Key**
- [ ] View API key
- [ ] Use API key
- [ ] Regenerate API key

### **Wiki**
- [ ] Access wiki
- [ ] Role-based filtering
- [ ] Search works
- [ ] Markdown renders

---

## 13. Smoke Test Suite (Quick Verification)

**Run this after each deployment:**

1. ✅ Login works
2. ✅ Create data source
3. ✅ Test connection
4. ✅ Create simple flow
5. ✅ Execute flow in test mode
6. ✅ View logs
7. ✅ Check metrics
8. ✅ Logout

**Expected Time:** 5-10 minutes

---

## Support & Questions

**Contact:**
- **Founders:** Via `/api/founder/users` (view contact info)
- **Issues:** Report via defect template above
- **Documentation:** Check `/wiki` for operational guides

---

**Document Version:** 1.0.0  
**Last Updated:** November 17, 2025  
**Maintained By:** ContinuityBridge QA Team
