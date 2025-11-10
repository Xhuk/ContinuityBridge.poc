#!/usr/bin/env tsx
import express from 'express';

const app = express();
const PORT = 5001;

app.use(express.json());

console.log('🚀 Starting ContinuityBridge Mock Server...\n');

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/mock/bydm/parse', (req, res) => {
  console.log('📥 BYDM Parse request received');
  res.json({
    bydmPayload: req.body,
    version: '2025',
    messageType: 'orderRelease',
    metadata: {
      originalFormat: 'JSON',
      detectedVersion: '2025',
    }
  });
});

app.post('/api/mock/bydm/map', (req, res) => {
  console.log('🔄 BYDM Map request received');
  res.json({
    canonicalPayload: {
      orderId: 'ORD-MOCK-001',
      orderDate: new Date().toISOString(),
      items: [],
    },
    metadata: {
      mappingUsed: 'order_release_to_canonical_order.yaml',
      transformsApplied: ['toISO8601'],
    }
  });
});

app.post('/api/mock/validate', (req, res) => {
  console.log('✅ Validate request received');
  res.json({
    valid: true,
    errors: [],
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Mock server running on http://0.0.0.0:${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log(`   GET  /health`);
  console.log(`   POST /api/mock/bydm/parse`);
  console.log(`   POST /api/mock/bydm/map`);
  console.log(`   POST /api/mock/validate`);
  console.log('\nPress Ctrl+C to stop\n');
});
