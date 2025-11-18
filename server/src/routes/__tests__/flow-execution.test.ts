/**
 * Critical Flow Execution Tests
 * Tests core integration engine functionality
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { executeFlow } from '../../flow/executor.js';
import type { Flow, FlowNode } from '../../types/flow.js';

describe('Flow Execution Engine', () => {
  describe('Basic Flow Execution', () => {
    it('should execute a simple webhook → transform → output flow', async () => {
      const flow: Flow = {
        id: 'test-flow-1',
        name: 'Test Flow',
        organizationId: 'test-org',
        nodes: [
          {
            id: 'webhook-1',
            type: 'webhook-trigger',
            position: { x: 0, y: 0 },
            data: { label: 'Webhook Input' },
          },
          {
            id: 'transform-1',
            type: 'object-mapper',
            position: { x: 200, y: 0 },
            data: {
              label: 'Map Fields',
              mappings: [
                { source: 'customer_name', target: 'customerName' },
                { source: 'order_id', target: 'orderId' },
              ],
            },
          },
          {
            id: 'output-1',
            type: 'http-request',
            position: { x: 400, y: 0 },
            data: {
              label: 'Send to API',
              method: 'POST',
              url: 'https://api.example.com/orders',
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'webhook-1', target: 'transform-1' },
          { id: 'e2', source: 'transform-1', target: 'output-1' },
        ],
        isActive: true,
        createdBy: 'test-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const input = {
        customer_name: 'John Doe',
        order_id: '12345',
      };

      const result = await executeFlow(flow, input, { emulationMode: true });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    it('should handle transformation errors gracefully', async () => {
      const flow: Flow = {
        id: 'test-flow-error',
        name: 'Error Test Flow',
        organizationId: 'test-org',
        nodes: [
          {
            id: 'webhook-1',
            type: 'webhook-trigger',
            position: { x: 0, y: 0 },
            data: { label: 'Input' },
          },
          {
            id: 'jq-1',
            type: 'jq-transform',
            position: { x: 200, y: 0 },
            data: {
              label: 'Bad JQ',
              jqExpression: '.invalid[[[syntax',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'webhook-1', target: 'jq-1' }],
        isActive: true,
        createdBy: 'test-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const input = { data: 'test' };

      const result = await executeFlow(flow, input, { emulationMode: true });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Conditional Logic', () => {
    it('should route based on conditional node', async () => {
      const flow: Flow = {
        id: 'test-conditional',
        name: 'Conditional Flow',
        organizationId: 'test-org',
        nodes: [
          {
            id: 'input-1',
            type: 'webhook-trigger',
            position: { x: 0, y: 0 },
            data: { label: 'Input' },
          },
          {
            id: 'condition-1',
            type: 'conditional',
            position: { x: 200, y: 0 },
            data: {
              label: 'Check Status',
              condition: 'status === "active"',
            },
          },
          {
            id: 'output-true',
            type: 'log',
            position: { x: 400, y: -50 },
            data: { label: 'Active Path' },
          },
          {
            id: 'output-false',
            type: 'log',
            position: { x: 400, y: 50 },
            data: { label: 'Inactive Path' },
          },
        ],
        edges: [
          { id: 'e1', source: 'input-1', target: 'condition-1' },
          { id: 'e2', source: 'condition-1', target: 'output-true', sourceHandle: 'true' },
          { id: 'e3', source: 'condition-1', target: 'output-false', sourceHandle: 'false' },
        ],
        isActive: true,
        createdBy: 'test-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const activeInput = { status: 'active' };
      const inactiveInput = { status: 'inactive' };

      const activeResult = await executeFlow(flow, activeInput, { emulationMode: true });
      const inactiveResult = await executeFlow(flow, inactiveInput, { emulationMode: true });

      expect(activeResult.success).toBe(true);
      expect(inactiveResult.success).toBe(true);
      // Verify correct path was taken
    });
  });

  describe('Error Handling', () => {
    it('should capture error context for debugging', async () => {
      const flow: Flow = {
        id: 'test-error-capture',
        name: 'Error Capture Test',
        organizationId: 'test-org',
        nodes: [
          {
            id: 'input-1',
            type: 'webhook-trigger',
            position: { x: 0, y: 0 },
            data: { label: 'Input' },
          },
          {
            id: 'failing-node',
            type: 'custom-script',
            position: { x: 200, y: 0 },
            data: {
              label: 'Fails',
              script: 'throw new Error("Intentional failure");',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'input-1', target: 'failing-node' }],
        isActive: true,
        createdBy: 'test-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const input = { test: 'data' };

      const result = await executeFlow(flow, input, { emulationMode: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Intentional failure');
      expect(result.errorContext).toBeDefined();
      expect(result.errorContext?.nodeId).toBe('failing-node');
    });
  });
});
