import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { NodeDefinition } from "@shared/schema";
import type { Node } from "@xyflow/react";

interface DynamicNodeConfigProps {
  node: Node | null;
  onSave: (config: Record<string, any>) => void;
  onCancel: () => void;
  systemInstanceId?: string;
}

/**
 * Dynamic Node Configuration Component
 * Renders configuration forms automatically from YAML node definitions
 */
export function DynamicNodeConfig({
  node,
  onSave,
  onCancel,
  systemInstanceId,
}: DynamicNodeConfigProps) {
  const [config, setConfig] = useState<Record<string, any>>(
    node?.data?.config || {}
  );

  // Debug logging for node initialization
  useEffect(() => {
    console.log('[DynamicNodeConfig] Component mounted', {
      nodeId: node?.id,
      nodeType: node?.data?.type,
      nodeLabel: node?.data?.label,
      existingConfig: node?.data?.config,
      systemInstanceId,
    });
  }, []);

  // Load node definition from API
  const { data: nodeDefinition, isLoading, error, isError } = useQuery<NodeDefinition>({
    queryKey: ["/api/node-definitions", node?.data?.type],
    queryFn: async () => {
      if (!node?.data?.type) {
        console.error('[DynamicNodeConfig] No node type provided');
        throw new Error("No node type");
      }

      const url = `/api/node-definitions/${node?.data?.type}`;
      console.log('[DynamicNodeConfig] Fetching node definition', {
        nodeType: node?.data?.type,
        url,
      });

      const response = await fetch(url);
      
      console.log('[DynamicNodeConfig] Response received', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorText = '';
        
        // Check if response is JSON or HTML
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          errorText = errorData.error || JSON.stringify(errorData);
        } else {
          errorText = await response.text();
          console.error('[DynamicNodeConfig] Received HTML instead of JSON', {
            firstChars: errorText.substring(0, 200),
          });
        }
        
        console.error('[DynamicNodeConfig] Failed to fetch node definition', {
          status: response.status,
          statusText: response.statusText,
          contentType,
          error: errorText,
        });
        
        throw new Error(`Failed to fetch node definition: ${response.status} - ${contentType?.includes('json') ? errorText : 'Server returned HTML instead of JSON'}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await response.text();
        console.error('[DynamicNodeConfig] Expected JSON but got:', {
          contentType,
          responsePreview: text.substring(0, 500),
        });
        throw new Error(`Server returned ${contentType} instead of JSON. This usually means the API endpoint doesn't exist or there's a server error.`);
      }

      const data = await response.json();
      console.log('[DynamicNodeConfig] Node definition loaded successfully', {
        nodeType: node?.data?.type,
        definition: data,
        configFieldsCount: data.configFields?.length || 0,
      });

      return data;
    },
    enabled: !!node?.data?.type,
    retry: false, // Don't retry on HTML responses
  });

  // Load interfaces for interface-type fields
  const { data: interfaces, isLoading: interfacesLoading } = useQuery<any[]>({
    queryKey: ["/api/interfaces", nodeDefinition?.configFields?.find(f => f.type === "interface")?.filterDirection],
    enabled: nodeDefinition?.configFields?.some((f) => f.type === "interface"),
    queryFn: async () => {
      const interfaceField = nodeDefinition?.configFields?.find(f => f.type === "interface");
      const filterDirection = interfaceField?.filterDirection;
      
      console.log('[DynamicNodeConfig] Fetching interfaces for interface-type fields', {
        nodeType: node?.data?.type,
        filterDirection,
      });
      
      const url = filterDirection 
        ? `/api/interfaces?direction=${filterDirection}`
        : '/api/interfaces';
      
      const response = await fetch(url);
      const data = await response.json();
      console.log('[DynamicNodeConfig] Interfaces loaded', {
        count: data?.length || 0,
        filterDirection,
        interfaces: data,
      });
      return data;
    },
  });

  useEffect(() => {
    if (node?.data?.config) {
      console.log('[DynamicNodeConfig] Updating config from node data', {
        nodeId: node.id,
        config: node.data.config,
      });
      setConfig(node.data.config);
    }
  }, [node]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Frontend validation
    const errors: string[] = [];
    if (nodeDefinition?.configFields) {
      for (const field of nodeDefinition.configFields) {
        const value = config[field.name];
        
        // Required field validation
        if (field.required && (value === undefined || value === null || value === "")) {
          errors.push(`${field.label} is required`);
          continue;
        }
        
        // Email validation
        if (field.type === "text" && field.name.toLowerCase().includes("email") && value) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(value))) {
            errors.push(`${field.label} must be a valid email address`);
          }
        }
        
        // Password validation
        if (field.type === "password" && field.required && value) {
          if (String(value).length < 8) {
            errors.push(`${field.label} must be at least 8 characters long`);
          }
          if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(String(value))) {
            errors.push(`${field.label} must contain uppercase, lowercase, and number`);
          }
        }
        
        // Number validation
        if (field.type === "number" && value !== undefined && value !== null && value !== "") {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push(`${field.label} must be a valid number`);
          }
        }
      }
    }
    
    // Display validation errors
    if (errors.length > 0) {
      console.error('[DynamicNodeConfig] Validation errors', errors);
      // We'll set validation errors in state to display them properly
      setValidationErrors(errors);
      return;
    }
    
    // Clear validation errors if submission is valid
    setValidationErrors([]);
    
    console.log('[DynamicNodeConfig] Saving configuration', {
      nodeId: node?.id,
      nodeType: node?.data?.type,
      config,
    });
    onSave(config);
  };

  // Add validation errors state
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Log loading state
  if (isLoading) {
    console.log('[DynamicNodeConfig] Loading node definition...', {
      nodeType: node?.data?.type,
    });
    return <div className="text-sm text-muted-foreground">Loading configuration...</div>;
  }

  // Log error state
  if (isError) {
    console.error('[DynamicNodeConfig] Error loading node definition', {
      nodeType: node?.data?.type,
      error,
    });
    return (
      <div className="text-sm text-destructive">
        Error loading configuration: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  // Log missing definition
  if (!nodeDefinition) {
    console.warn('[DynamicNodeConfig] Node definition not found', {
      nodeType: node?.data?.type,
    });
    return <div className="text-sm text-muted-foreground">Node definition not found</div>;
  }

  // Log no config fields
  if (!nodeDefinition.configFields || nodeDefinition.configFields.length === 0) {
    console.log('[DynamicNodeConfig] No configuration fields defined', {
      nodeType: node?.data?.type,
      nodeDefinition,
    });
    return (
      <div className="text-sm text-muted-foreground">
        No configuration required for this node type
      </div>
    );
  }

  console.log('[DynamicNodeConfig] Rendering configuration form', {
    nodeType: node?.data?.type,
    fieldsCount: nodeDefinition.configFields.length,
    fields: nodeDefinition.configFields.map(f => ({ name: f.name, type: f.type, required: f.required })),
    currentConfig: config,
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Display validation errors */}
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {nodeDefinition.configFields.map((field) => {
        const value = config[field.name] ?? field.default ?? "";

        switch (field.type) {
          case "text":
            return (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id={field.name}
                  value={value}
                  onChange={(e) => setConfig({ ...config, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  required={field.required}
                />
                {field.helpText && (
                  <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                )}
              </div>
            );

          case "password":
            return (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id={field.name}
                  type="password"
                  value={value}
                  onChange={(e) => setConfig({ ...config, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  required={field.required}
                />
                {field.helpText && (
                  <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                )}
              </div>
            );

          case "textarea":
            return (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Textarea
                  id={field.name}
                  value={value}
                  onChange={(e) => setConfig({ ...config, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  required={field.required}
                  rows={6}
                />
                {field.helpText && (
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{field.helpText}</p>
                )}
              </div>
            );

          case "number":
            return (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id={field.name}
                  type="number"
                  value={value}
                  onChange={(e) =>
                    setConfig({ ...config, [field.name]: parseInt(e.target.value, 10) })
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                />
                {field.helpText && (
                  <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                )}
              </div>
            );

          case "boolean":
          case "checkbox":
            return (
              <div key={field.name} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={field.name}
                  checked={!!value}
                  onChange={(e) => setConfig({ ...config, [field.name]: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <Label htmlFor={field.name} className="cursor-pointer">
                  {field.label}
                </Label>
                {field.helpText && (
                  <p className="text-xs text-muted-foreground ml-6">{field.helpText}</p>
                )}
              </div>
            );

          case "select":
            return (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Select
                  value={value}
                  onValueChange={(newValue) =>
                    setConfig({ ...config, [field.name]: newValue })
                  }
                >
                  <SelectTrigger id={field.name}>
                    <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.helpText && (
                  <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                )}
              </div>
            );

          case "interface":
            return (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Select
                  value={value}
                  onValueChange={(newValue) =>
                    setConfig({ ...config, [field.name]: newValue })
                  }
                >
                  <SelectTrigger id={field.name}>
                    <SelectValue placeholder="Select interface" />
                  </SelectTrigger>
                  <SelectContent>
                    {interfaces?.map((iface) => (
                      <SelectItem key={iface.id} value={iface.id}>
                        {iface.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.helpText && (
                  <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                )}
              </div>
            );

          case "code":
          case "json":
            return (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Textarea
                  id={field.name}
                  value={value}
                  onChange={(e) => setConfig({ ...config, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  required={field.required}
                  rows={10}
                  className="font-mono text-sm"
                />
                {field.helpText && (
                  <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                )}
              </div>
            );

          default:
            return null;
        }
      })}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          data-testid="button-cancel-config"
        >
          Cancel
        </Button>
        <Button type="submit" data-testid="button-save-config">
          Save Configuration
        </Button>
      </DialogFooter>
    </form>
  );
}
