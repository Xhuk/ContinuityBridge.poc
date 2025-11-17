import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types.js";
import type { FlowNode } from "../../../schema.js";

/**
 * HTTP Request Executor - Generic HTTP/REST API caller
 * Makes HTTP requests to any endpoint with full configurability
 */
export const executeHttpRequest: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    url = "",
    method = "GET",
    headers = "{}",
    body = "",
    queryParams = "{}",
    timeout = 30000,
    retryAttempts = 0,
    followRedirects = true,
    validateSSL = true,
    responseField = "response",
  } = config;

  // Template replacement helper
  const replaceTemplates = (str: string, data: any): string => {
    return str.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = path.trim().split('.').reduce((obj: any, key: string) => obj?.[key.replace('$', '')], { $: data });
      return value !== undefined ? String(value) : match;
    });
  };

  try {
    // Process URL with template variables
    const processedUrl = replaceTemplates(url, input);

    // Parse and process headers
    let processedHeaders: Record<string, string> = {};
    try {
      const headersObj = typeof headers === 'string' ? JSON.parse(headers) : headers;
      processedHeaders = Object.entries(headersObj).reduce((acc, [key, value]) => {
        acc[key] = replaceTemplates(String(value), input);
        return acc;
      }, {} as Record<string, string>);
    } catch {
      processedHeaders = {};
    }

    // Parse and process query parameters
    let processedQueryParams: Record<string, string> = {};
    try {
      const queryObj = typeof queryParams === 'string' ? JSON.parse(queryParams) : queryParams;
      processedQueryParams = Object.entries(queryObj).reduce((acc, [key, value]) => {
        acc[key] = replaceTemplates(String(value), input);
        return acc;
      }, {} as Record<string, string>);
    } catch {
      processedQueryParams = {};
    }

    // Build query string
    const queryString = Object.entries(processedQueryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    
    const fullUrl = queryString ? `${processedUrl}?${queryString}` : processedUrl;

    // Process request body
    let processedBody: string | undefined;
    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      processedBody = replaceTemplates(body, input);
    }

    // EMULATION MODE - Return mock response
    if (context.emulationMode) {
      return {
        output: {
          ...input as object,
          [responseField]: {
            status: 200,
            statusText: 'OK',
            data: { 
              message: `[EMULATION] HTTP ${method} to ${fullUrl}`,
              mockResponse: true 
            },
            headers: processedHeaders,
          },
        },
        metadata: {
          emulated: true,
          url: fullUrl,
          method,
        },
      };
    }

    // PRODUCTION MODE - Real HTTP request with retry logic
    let lastError: Error | null = null;
    const maxAttempts = retryAttempts + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(fullUrl, {
          method: method.toUpperCase(),
          headers: processedHeaders,
          body: processedBody,
          signal: controller.signal,
          redirect: followRedirects ? 'follow' : 'manual',
        });

        clearTimeout(timeoutId);

        // Parse response based on content type
        const contentType = response.headers.get('content-type');
        let data: any;

        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else if (contentType?.includes('text/')) {
          data = await response.text();
        } else {
          data = await response.text();
        }

        // Check if response is ok
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return {
          output: {
            ...input as object,
            [responseField]: {
              status: response.status,
              statusText: response.statusText,
              data,
              headers: Object.fromEntries(response.headers.entries()),
            },
          },
          metadata: {
            url: fullUrl,
            method,
            status: response.status,
            attempt: attempt + 1,
          },
        };
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on last attempt
        if (attempt < maxAttempts - 1) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
      }
    }

    // All retries failed
    throw lastError || new Error('HTTP request failed');
  } catch (error: any) {
    throw new Error(`HTTP Request failed: ${error.message}`);
  }
};
