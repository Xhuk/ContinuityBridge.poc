/**
 * k6 Load Testing Script
 * Open-source load testing tool (https://k6.io)
 * 
 * Installation:
 *   Windows: choco install k6
 *   Mac: brew install k6
 *   Linux: sudo apt install k6
 * 
 * Run: k6 run load-tests/k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const webhookDuration = new Trend('webhook_duration');
const apiDuration = new Trend('api_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 100 }, // Spike to 100 users
    { duration: '1m', target: 100 },  // Stay at 100 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],   // Error rate under 1%
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  // Test 1: Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status 200': (r) => r.status === 200,
  });
  errorRate.add(healthRes.status !== 200);

  sleep(1);

  // Test 2: Metrics endpoint
  const metricsRes = http.get(`${BASE_URL}/metrics`);
  check(metricsRes, {
    'metrics status 200': (r) => r.status === 200,
    'metrics has data': (r) => r.body.length > 0,
  });
  apiDuration.add(metricsRes.timings.duration);
  errorRate.add(metricsRes.status !== 200);

  sleep(1);

  // Test 3: Webhook execution (if you have a test webhook)
  const webhookPayload = JSON.stringify({
    test: true,
    timestamp: new Date().toISOString(),
    data: {
      message: 'Load test from k6',
    },
  });

  const webhookRes = http.post(
    `${BASE_URL}/webhook/test-load-test`,
    webhookPayload,
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  check(webhookRes, {
    'webhook status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  webhookDuration.add(webhookRes.timings.duration);
  errorRate.add(webhookRes.status >= 500);

  sleep(2);
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let summary = '\n' + indent + '======= Load Test Summary =======\n';
  
  summary += indent + `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  summary += indent + `Failed Requests: ${data.metrics.http_req_failed.values.passes}\n`;
  summary += indent + `Request Duration (avg): ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  summary += indent + `Request Duration (p95): ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%\n`;
  
  return summary;
}
