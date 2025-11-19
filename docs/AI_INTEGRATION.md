# AI Integration Guide - Gemini-Powered Consultant Assistant

## Overview

ContinuityBridge now includes **AI-powered features** to help consultants configure integrations faster, troubleshoot errors more effectively, and reduce the learning curve for complex middleware configurations.

**AI Provider**: Google Gemini 1.5 Flash (Free tier)
- **Rate Limits**: 15 requests/minute, 1500 requests/day
- **Cost**: Free for development and low-volume production use
- **Model**: `gemini-1.5-flash` (optimized for speed and accuracy)

---

## 🎯 Use Cases for Consultants

### 1. **Smart Mapping Generation**
**Problem**: Manually mapping hundreds of fields between SAP, WMS, and marketplace systems is time-consuming and error-prone.

**AI Solution**: Analyze source and target schemas, automatically suggest optimal field mappings.

**Example**:
```json
// Input: Source Schema (SAP Order)
{
  "OrderDocument": {
    "OrderNumber": "12345",
    "Destination": {
      "CustomerName": "John Doe",
      "City": "New York"
    }
  }
}

// Input: Target Schema (WMS Format)
{
  "orderId": "",
  "customer": {
    "name": "",
    "city": ""
  }
}

// AI-Generated Mappings
{
  "orderId": "$.OrderDocument.OrderNumber",
  "customer.name": "$.Destination.CustomerName",
  "customer.city": "$.Destination.City"
}
```

**How to Use**:
- Navigate to Flow Builder
- Add Object Mapper node
- Click "Smart Mapping Assistant" button
- Paste source and target schemas
- Review and apply AI-generated mappings

---

### 2. **Error Diagnosis & Resolution**
**Problem**: Production errors with cryptic stack traces require deep technical knowledge to debug.

**AI Solution**: Analyze error context, identify root cause, suggest step-by-step fixes.

**Example**:
```
Error: Required field missing: orderId
Node: Object Mapper
Flow: SAP to WMS Order Sync

AI Diagnosis:
Root Cause: The source data path "$.OrderNumber" does not exist in the payload. 
The actual path is "$.OrderDocument.OrderNumber".

Suggested Fixes:
1. Update mapping from "orderId": "$.OrderNumber" to "orderId": "$.OrderDocument.OrderNumber"
2. Add validation node before mapper to ensure OrderDocument exists
3. Enable "continueOnError" in mapper config to log missing fields instead of failing
```

**How to Use**:
- Navigate to Error Triage Dashboard
- Click on any error
- Click "Diagnose with AI" button
- Review diagnosis and apply suggested fixes

---

### 3. **Flow Configuration Assistant**
**Problem**: Consultants need to translate business requirements into technical flow configurations.

**AI Solution**: Convert natural language requirements into suggested node configurations.

**Example**:
```
Requirement: "Pull orders from SAP every 5 minutes, transform to WMS format, and push to Manhattan WMS via SFTP"

AI Suggestion:
{
  "flowName": "SAP to Manhattan Order Sync",
  "description": "Automated order synchronization from SAP to Manhattan WMS",
  "suggestedNodes": [
    {
      "type": "scheduler",
      "label": "Every 5 Minutes",
      "config": { "cronExpression": "*/5 * * * *" }
    },
    {
      "type": "interface_source",
      "label": "Pull SAP Orders",
      "config": { "interfaceId": "sap-erp-prod" }
    },
    {
      "type": "object_mapper",
      "label": "Transform to WMS",
      "config": { "mappings": {...} }
    },
    {
      "type": "sftp_connector",
      "label": "Upload to Manhattan",
      "config": { "interfaceId": "manhattan-wms-sftp" }
    }
  ]
}
```

**How to Use**:
- API: `POST /api/ai/suggest-flow`
- UI: (Coming soon) Flow Builder "AI Assistant" panel

---

### 4. **Test Data Generation**
**Problem**: Creating realistic test data for E2E flow testing is tedious.

**AI Solution**: Generate sample data matching interface schemas.

**Example**:
```
Schema: Order JSON Schema
Format: JSON

AI-Generated Test Data:
{
  "orderId": "ORD-2025-001234",
  "orderDate": "2025-11-15T10:30:00Z",
  "customer": {
    "name": "Acme Corporation",
    "email": "orders@acme.com",
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001"
    }
  },
  "items": [
    {
      "sku": "WIDGET-001",
      "quantity": 10,
      "price": 29.99
    }
  ]
}
```

**How to Use**:
- API: `POST /api/ai/generate-test-data`
- UI: (Coming soon) Test File Manager "Generate Sample" button

---

### 5. **Configuration Explainer**
**Problem**: Business users don't understand technical JSON configurations.

**AI Solution**: Translate technical configs into plain language.

**Example**:
```
Node Type: conditional
Config:
{
  "field": "$.totalAmount",
  "operator": "greaterThan",
  "value": 1000
}

AI Explanation:
"This conditional checks if the order total amount is greater than $1000. 
If true, the order will be routed to the high-value order processing path. 
If false, it will follow the standard processing path."
```

**How to Use**:
- API: `POST /api/ai/explain-config`
- UI: (Coming soon) Node config panel "Explain to Customer" button

---

## 🚀 Setup Instructions

### 1. Get Gemini API Key (Free)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with Google account
3. Click "Create API Key"
4. Copy the generated key

### 2. Configure Environment

Add to `.env`:
```bash
GEMINI_API_KEY=AIza...your-key-here
```

### 3. Verify Setup

**Check if AI is available**:
```bash
curl http://localhost:5000/api/ai/status
```

**Response**:
```json
{
  "available": true,
  "provider": "gemini",
  "features": [
    "mapping_generation",
    "error_diagnosis",
    "flow_suggestions",
    "test_data_generation",
    "config_explanation"
  ]
}
```

---

## 📡 API Reference

### Base URL
```
POST /api/ai/*
```

### 1. Suggest Mappings
**Endpoint**: `POST /api/ai/suggest-mappings`

**Request**:
```json
{
  "sourceSchema": { "OrderNumber": "12345", "CustomerName": "John" },
  "targetSchema": { "orderId": "", "customer": { "name": "" } },
  "context": "Map SAP order to WMS format"
}
```

**Response**:
```json
{
  "mappings": {
    "orderId": "$.OrderNumber",
    "customer.name": "$.CustomerName"
  },
  "confidence": "ai-generated",
  "provider": "gemini"
}
```

---

### 2. Diagnose Error
**Endpoint**: `POST /api/ai/diagnose-error`

**Request**:
```json
{
  "flowName": "Order Processing",
  "nodeName": "Object Mapper",
  "nodeType": "object_mapper",
  "errorMessage": "Required field missing: orderId",
  "payloadSnapshot": { "data": {...} },
  "stackTrace": "Error: ..."
}
```

**Response**:
```json
{
  "rootCause": "The source path does not match the payload structure",
  "diagnosis": "Field mapping is pointing to the wrong JSONPath...",
  "suggestedFixes": [
    "Update mapping from $.orderId to $.OrderDocument.OrderNumber",
    "Add validation before mapper",
    "Enable continueOnError mode"
  ],
  "provider": "gemini"
}
```

---

### 3. Suggest Flow Configuration
**Endpoint**: `POST /api/ai/suggest-flow`

**Request**:
```json
{
  "requirement": "Pull orders from SAP and push to WMS every 5 minutes",
  "availableInterfaces": ["SAP ERP", "Manhattan WMS"]
}
```

**Response**:
```json
{
  "flowName": "SAP to WMS Order Sync",
  "description": "Automated order synchronization",
  "suggestedNodes": [
    {
      "type": "scheduler",
      "label": "Every 5 Minutes",
      "config": { "cronExpression": "*/5 * * * *" }
    },
    ...
  ]
}
```

---

### 4. Generate Test Data
**Endpoint**: `POST /api/ai/generate-test-data`

**Request**:
```json
{
  "schema": { "orderId": "string", "items": "array" },
  "format": "json",
  "context": "E-commerce order with 3 items"
}
```

**Response**:
```json
{
  "testData": "{\n  \"orderId\": \"ORD-001\",\n  \"items\": [...]\n}",
  "format": "json",
  "provider": "gemini"
}
```

---

### 5. Explain Configuration
**Endpoint**: `POST /api/ai/explain-config`

**Request**:
```json
{
  "nodeType": "conditional",
  "config": { "field": "$.amount", "operator": "greaterThan", "value": 1000 }
}
```

**Response**:
```json
{
  "explanation": "This conditional routes orders with amounts greater than $1000 to a special processing path...",
  "nodeType": "conditional",
  "provider": "gemini"
}
```

---

## 🛡️ Production Considerations

### Rate Limiting
- **Free Tier**: 15 requests/minute, 1500 requests/day
- **Recommendation**: Cache AI results where possible
- **Fallback**: Gracefully disable AI features if quota exceeded

### Error Handling
- All AI endpoints return 503 if `GEMINI_API_KEY` not configured
- Client should check `/api/ai/status` before showing AI features
- Display user-friendly message if AI unavailable

### Data Privacy
- **Payload Sanitization**: Large payloads are truncated to 50KB before sending to AI
- **No PII Storage**: AI service doesn't persist data sent to Gemini
- **Audit Logging**: All AI requests are logged for compliance

### Cost Management
- **Free Tier Usage**: Monitor daily quota in Google AI Studio
- **Upgrade Path**: If exceeding free tier, upgrade to Gemini Pro ($0.0025/1K chars)
- **Alternative Providers**: System designed to support OpenAI/Anthropic if needed

---

## 🎨 UI Components

### React Components Available

1. **`<AIDiagnosis />`** - Error diagnosis panel
   - Location: `client/src/components/ai/AIDiagnosis.tsx`
   - Usage: Error Triage Dashboard

2. **`<SmartMappingAssistant />`** - Mapping generator
   - Location: `client/src/components/ai/SmartMappingAssistant.tsx`
   - Usage: Object Mapper node configuration

### Integration Example

```tsx
import { AIDiagnosis } from "@/components/ai/AIDiagnosis";

// In Error Triage Page
<AIDiagnosis
  flowName={error.flowName}
  nodeName={error.nodeName}
  nodeType={error.nodeType}
  errorMessage={error.errorMessage}
  payloadSnapshot={error.payloadSnapshot}
  stackTrace={error.stackTrace}
/>
```

---

## 🔄 Future Enhancements

### Phase 2 (Next Quarter)
- [ ] **Flow Template Generator**: Generate complete flows from requirements
- [ ] **Intelligent Autocomplete**: Suggest config values as consultant types
- [ ] **Error Pattern Detection**: Identify recurring issues across flows
- [ ] **Documentation Generator**: Auto-create customer-facing docs

### Phase 3 (Long-term)
- [ ] **Multi-tenant Knowledge Base**: Learn from consultant fixes
- [ ] **Proactive Monitoring**: Predict failures before they happen
- [ ] **Natural Language Queries**: "Show me all failed SAP orders today"
- [ ] **Voice Assistant**: Hands-free configuration support

---

## 📊 Success Metrics

Track AI impact:
- **Time to Configure**: Measure flow setup time before/after AI
- **Error Resolution Speed**: Time from error detection to fix
- **Consultant Satisfaction**: Survey on AI helpfulness (1-5 scale)
- **AI Accuracy**: % of AI suggestions applied without modification

---

## 🐛 Troubleshooting

### AI Features Not Available
1. Check `GEMINI_API_KEY` is set in `.env`
2. Verify API key is valid at [Google AI Studio](https://aistudio.google.com/)
3. Restart server after adding key

### "AI diagnosis failed" Error
1. Check rate limits (15 req/min, 1500/day)
2. Verify payload size < 50KB
3. Check server logs for detailed error

### Poor AI Suggestions
1. Provide more context in requests
2. Ensure schemas are valid JSON
3. Use descriptive field names in schemas

---

## 📝 License & Attribution

- **Gemini API**: Provided by Google under [Google AI Terms](https://ai.google.dev/terms)
- **ContinuityBridge**: MIT License
- **AI Service**: `server/src/ai/gemini-service.ts`

---

## 🤝 Contributing

To extend AI features:

1. Add new method to `GeminiService` class
2. Create corresponding API endpoint in `ai-routes.ts`
3. Build React component for UI integration
4. Update this documentation

**Example**:
```typescript
// gemini-service.ts
async suggestRetryStrategy(errorType: string): Promise<string> {
  const prompt = `Suggest retry strategy for ${errorType}...`;
  return await this.generate([{ role: "user", content: prompt }]);
}

// ai-routes.ts
router.post("/suggest-retry", async (req, res) => {
  const strategy = await geminiService.suggestRetryStrategy(req.body.errorType);
  res.json({ strategy });
});
```

---

**Questions?** Contact the architecture team or check `replit.md` for system overview.
