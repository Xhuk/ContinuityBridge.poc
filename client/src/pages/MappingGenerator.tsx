import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Download, Save, CheckCircle2, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FieldMapping {
  sourceField: string;
  targetField: string;
  confidence: number;
  transform?: string;
  needsReview: boolean;
}

interface MappingResult {
  mappingYAML: string;
  fieldMappings: FieldMapping[];
  confidence: number;
  suggestedReviews: string[];
}

export default function MappingGenerator() {
  const [sourceSchema, setSourceSchema] = useState("");
  const [targetSchema, setTargetSchema] = useState("");
  const [sourceSystem, setSourceSystem] = useState("");
  const [targetSystem, setTargetSystem] = useState("");
  const [sampleData, setSampleData] = useState("");
  const [sourceFormat, setSourceFormat] = useState("json");
  const [targetFormat, setTargetFormat] = useState("json");
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MappingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Sample data hints extracted from actual values
  const [sampleHints, setSampleHints] = useState<Record<string, string>>({});
  
  // Manual mapping state
  const [manualMappings, setManualMappings] = useState<Array<{
    sourceField: string;
    targetField: string;
    transform?: string;
    optional?: boolean;
    defaultValue?: string;
    validation?: string;
    segment?: string;
  }>>([]);

  const loadExampleSchemas = () => {
    setSourceSystem("Source System");
    setTargetSystem("Target System");
    setSourceFormat("json");
    setTargetFormat("json");
    
    // Generic example schemas (not tied to specific systems)
    const sourceSchemaExample = {
      id: "string",
      timestamp: "string",
      customer: {
        name: "string",
        email: "string",
        address: {
          street: "string",
          city: "string",
          postalCode: "string",
          country: "string"
        }
      },
      items: [{
        itemId: "string",
        description: "string",
        quantity: "number",
        unitPrice: "number"
      }],
      total: "number",
      currency: "string"
    };

    const targetSchemaExample = {
      documentNumber: "string",
      customerCode: "string",
      customerName: "string",
      addressLine1: "string",
      city: "string",
      zipCode: "string",
      countryCode: "string",
      productCode: "string",
      productDescription: "string",
      qty: "number",
      price: "number",
      totalAmount: "number",
      currencyCode: "string",
      createdDate: "string"
    };

    // Generic sample data
    const sampleDataExample = {
      id: "DOC-123456",
      timestamp: "2025-01-15T10:30:00Z",
      customer: {
        name: "Example Customer Inc.",
        email: "contact@example.com",
        address: {
          street: "123 Example Street",
          city: "Sample City",
          postalCode: "12345",
          country: "US"
        }
      },
      items: [
        {
          itemId: "ITEM-001",
          description: "Example Product A",
          quantity: 10,
          unitPrice: 25.50
        },
        {
          itemId: "ITEM-002",
          description: "Example Product B",
          quantity: 5,
          unitPrice: 42.00
        }
      ],
      total: 465.00,
      currency: "USD"
    };

    setSourceSchema(JSON.stringify(sourceSchemaExample, null, 2));
    setTargetSchema(JSON.stringify(targetSchemaExample, null, 2));
    setSampleData(JSON.stringify(sampleDataExample, null, 2));
    
    // Extract hints from sample data
    const hints = extractSampleValues(sampleDataExample);
    setSampleHints(hints);
  };

  // Get placeholder text based on format
  const getSchemaPlaceholder = (format: string, isSource: boolean) => {
    if (format === "json") {
      return isSource
        ? '{"id": "string", "customer": "string", "items": [...]}'
        : '{"documentNumber": "string", "customerCode": "string", "productCode": "string"}';
    } else {
      return isSource
        ? '<Document>\n  <Id>string</Id>\n  <Customer>string</Customer>\n  <Items>...</Items>\n</Document>'
        : '<TargetDocument>\n  <DocumentNumber>string</DocumentNumber>\n  <CustomerCode>string</CustomerCode>\n  <ProductCode>string</ProductCode>\n</TargetDocument>';
    }
  };

  // Get sample data placeholder based on format
  const getSampleDataPlaceholder = (format: string) => {
    if (format === "json") {
      return '{"id": "12345", "items": [{"itemId": "ABC-001", "quantity": 10}]}';
    } else {
      return '<Document>\n  <Id>12345</Id>\n  <Items>\n    <Item>\n      <ItemId>ABC-001</ItemId>\n      <Quantity>10</Quantity>\n    </Item>\n  </Items>\n</Document>';
    }
  };

  // Handle sample data change and extract hints
  const handleSampleDataChange = (value: string) => {
    setSampleData(value);
    
    if (!value.trim()) {
      setSampleHints({});
      return;
    }
    
    try {
      if (sourceFormat === 'json') {
        const parsed = JSON.parse(value);
        const hints = extractSampleValues(parsed);
        setSampleHints(hints);
        console.log('Extracted sample hints:', hints);
      } else {
        // For XML, we'll just clear hints for now
        // TODO: Add XML parsing if needed
        setSampleHints({});
      }
    } catch (err) {
      // Invalid JSON/XML, ignore
      setSampleHints({});
    }
  };

  // Check AI status on load
  useState(() => {
    fetch("/api/dev/ai-status")
      .then(res => res.json())
      .then(data => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));
  });

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSaveSuccess(false);

    try {
      // Parse schemas
      const parsedSourceSchema = JSON.parse(sourceSchema);
      const parsedTargetSchema = JSON.parse(targetSchema);
      const parsedSampleData = sampleData ? JSON.parse(sampleData) : undefined;

      const response = await fetch("/api/dev/generate-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceSchema: parsedSourceSchema,
          targetSchema: parsedTargetSchema,
          sourceSystem,
          targetSystem,
          sourceFormat,
          targetFormat,
          sampleData: parsedSampleData,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSave = async () => {
    if (manualMappings.length === 0) {
      setError("Please create at least one field mapping");
      return;
    }

    try {
      const filename = `${sourceSystem.toLowerCase().replace(/\s+/g, "-")}-to-${targetSystem.toLowerCase().replace(/\s+/g, "-")}.yaml`;
      
      // Build YAML from manual mappings
      const mappingSection = manualMappings.map(m => {
        const lines = [`  ${m.targetField}:`];
        lines.push(`    path: "${m.sourceField.startsWith('$.') ? m.sourceField : '$.'+m.sourceField}"`);
        if (m.transform) lines.push(`    transform: "${m.transform}"`);
        if (m.defaultValue) lines.push(`    default: "${m.defaultValue}"`);
        if (m.validation) lines.push(`    validation: "${m.validation}"`);
        if (m.segment) lines.push(`    segment: "${m.segment}"`);
        lines.push(`    optional: ${m.optional !== false ? 'true' : 'false'}`);
        return lines.join('\n');
      }).join("\n");
      
      const manualYAML = `sourceFormat: "${sourceFormat}"
targetFormat: "${targetFormat}"
sourceSystem: "${sourceSystem}"
targetSystem: "${targetSystem}"
version: "1.0"
generatedBy: "manual"
createdAt: "${new Date().toISOString()}"

mapping:
${mappingSection}
`;

      const response = await fetch("/api/dev/save-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappingYAML: manualYAML,
          filename,
          directory: "mapboard",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save mapping");
      }

      const data = await response.json();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      console.log("Manual mapping saved:", data.path);
      
      // Also trigger download
      const blob = new Blob([manualYAML], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      setError(null);
    } catch (err: any) {
      setError(`Save failed: ${err.message}`);
    }
  };

  const addManualMapping = () => {
    setManualMappings([...manualMappings, { sourceField: "", targetField: "", optional: true }]);
  };

  const updateManualMapping = (index: number, field: keyof typeof manualMappings[0], value: string | boolean) => {
    const updated = [...manualMappings];
    (updated[index] as any)[field] = value;
    setManualMappings(updated);
  };

  const removeManualMapping = (index: number) => {
    setManualMappings(manualMappings.filter((_, i) => i !== index));
  };

  const extractFields = (schema: any, prefix = ""): string[] => {
    if (!schema || typeof schema !== "object") return [];
    const fields: string[] = [];
    
    for (const [key, value] of Object.entries(schema)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      fields.push(fieldPath);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        fields.push(...extractFields(value, fieldPath));
      }
    }
    
    return fields;
  };

  // Extract sample values from JSON data
  const extractSampleValues = (data: any, prefix = ""): Record<string, string> => {
    const hints: Record<string, string> = {};
    
    if (!data || typeof data !== "object") return hints;
    
    for (const [key, value] of Object.entries(data)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      
      if (Array.isArray(value)) {
        // For arrays, use first item
        const arrayPath = `${fieldPath}[*]`;
        hints[arrayPath] = `[${value.length} items]`;
        if (value.length > 0 && typeof value[0] === 'object') {
          Object.assign(hints, extractSampleValues(value[0], arrayPath));
        } else if (value.length > 0) {
          hints[arrayPath] = String(value[0]);
        }
      } else if (typeof value === "object" && value !== null) {
        // Nested object
        Object.assign(hints, extractSampleValues(value, fieldPath));
      } else {
        // Primitive value
        hints[fieldPath] = String(value);
      }
    }
    
    return hints;
  };

  // Get hint for a field path
  const getFieldHint = (fieldPath: string): string => {
    // Remove leading $. if present
    const cleanPath = fieldPath.replace(/^\$\./, '');
    
    // Try exact match first
    if (sampleHints[cleanPath]) {
      return sampleHints[cleanPath];
    }
    
    // Try with $. prefix
    if (sampleHints[`$.${cleanPath}`]) {
      return sampleHints[`$.${cleanPath}`];
    }
    
    // Try partial matches
    for (const [key, value] of Object.entries(sampleHints)) {
      if (key.includes(cleanPath) || cleanPath.includes(key)) {
        return value;
      }
    }
    
    return '';
  };

  const handleSaveMapping = async () => {
    if (!result) return;

    try {
      const filename = `${sourceSystem.toLowerCase().replace(/\s+/g, "-")}-to-${targetSystem.toLowerCase().replace(/\s+/g, "-")}.yaml`;

      const response = await fetch("/api/dev/save-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappingYAML: result.mappingYAML,
          filename,
          directory: "mapboard",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save mapping");
      }

      const data = await response.json();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      console.log("Mapping saved:", data.path);
    } catch (err: any) {
      setError(`Save failed: ${err.message}`);
    }
  };

  const handleDownload = () => {
    if (!result) return;

    const filename = `${sourceSystem.toLowerCase().replace(/\s+/g, "-")}-to-${targetSystem.toLowerCase().replace(/\s+/g, "-")}.yaml`;
    const blob = new Blob([result.mappingYAML], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Mapping Generator v2</h1>
          <p className="text-muted-foreground mt-1">
            Generate YAML transformation mappings from schema analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadExampleSchemas()}
          >
            Load Example (WMS → SAP)
          </Button>
          {aiConfigured !== null && (
            <Badge variant={aiConfigured ? "default" : "secondary"}>
              {aiConfigured ? "AI API Configured" : "Rule-Based Mode"}
            </Badge>
          )}
        </div>
      </div>

      {!aiConfigured && aiConfigured !== null && (
        <Alert className="border-l-4 border-l-blue-500">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm">
            <span className="font-semibold text-blue-700">Rule-Based Mapping Mode:</span> No AI API key detected. 
            Using intelligent field matching algorithm. For AI-powered semantic mapping, set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source System */}
        <Card>
          <CardHeader>
            <CardTitle>Source System</CardTitle>
            <CardDescription>Configure the data source</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="source-system">System Name</Label>
              <Input
                id="source-system"
                placeholder="e.g., WMS, ERP, OMS"
                value={sourceSystem}
                onChange={(e) => setSourceSystem(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="source-format">Data Format</Label>
              <select
                id="source-format"
                className="w-full px-3 py-2 border rounded-md"
                value={sourceFormat}
                onChange={(e) => setSourceFormat(e.target.value)}
              >
                <option value="json">JSON</option>
                <option value="xml">XML</option>
              </select>
            </div>
            <div>
              <Label htmlFor="source-schema">Schema ({sourceFormat.toUpperCase()})</Label>
              <Textarea
                id="source-schema"
                placeholder={getSchemaPlaceholder(sourceFormat, true)}
                className="font-mono text-sm h-64"
                value={sourceSchema}
                onChange={(e) => setSourceSchema(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Target System */}
        <Card>
          <CardHeader>
            <CardTitle>Target System</CardTitle>
            <CardDescription>Configure the destination</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="target-system">System Name</Label>
              <Input
                id="target-system"
                placeholder="e.g., SAP, OMS, Shopify"
                value={targetSystem}
                onChange={(e) => setTargetSystem(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="target-format">Data Format</Label>
              <select
                id="target-format"
                className="w-full px-3 py-2 border rounded-md"
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value)}
              >
                <option value="json">JSON</option>
                <option value="xml">XML</option>
              </select>
            </div>
            <div>
              <Label htmlFor="target-schema">Schema ({targetFormat.toUpperCase()})</Label>
              <Textarea
                id="target-schema"
                placeholder={getSchemaPlaceholder(targetFormat, false)}
                className="font-mono text-sm h-64"
                value={targetSchema}
                onChange={(e) => setTargetSchema(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Optional Sample Data */}
      <Card>
        <CardHeader>
          <CardTitle>Sample Data (Optional)</CardTitle>
          <CardDescription>
            Provide sample source data ({sourceFormat.toUpperCase()}) to show real values as hints in field mappings
            {Object.keys(sampleHints).length > 0 && (
              <span className="text-green-600 font-semibold ml-2">✓ {Object.keys(sampleHints).length} hints extracted</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={getSampleDataPlaceholder(sourceFormat)}
            className="font-mono text-sm h-32"
            value={sampleData}
            onChange={(e) => handleSampleDataChange(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Generate or Manual Mapping Buttons */}
      <div className="flex justify-center gap-4">
        {aiConfigured && (
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={loading || !sourceSchema || !targetSchema || !sourceSystem || !targetSystem}
            className="w-full max-w-md"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating AI Mapping...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Mapping with AI
              </>
            )}
          </Button>
        )}
      </div>

      {/* Manual Mapping Interface (when AI not available) */}
      {!aiConfigured && sourceSchema && targetSchema && sourceSystem && targetSystem && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Manual Field Mapping</span>
              <Button onClick={addManualMapping} size="sm" variant="outline" className="border-blue-300">
                + Add Mapping
              </Button>
            </CardTitle>
            <CardDescription>
              Create field-to-field mappings manually. Click "Add Mapping" to map fields between {sourceSystem} and {targetSystem}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {manualMappings.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No mappings created yet. Click "Add Mapping" to start.
              </div>
            )}
            
            {manualMappings.map((mapping, idx) => (
              <div key={idx} className="border border-blue-200 rounded-lg bg-blue-50/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {/* Source Field */}
                  <div className="flex-1">
                    <Label className="text-xs text-blue-700">Source Field ({sourceSystem})</Label>
                    <Input
                      placeholder="e.g., $.header.orderId or $.items[*].sku"
                      value={mapping.sourceField}
                      onChange={(e) => updateManualMapping(idx, 'sourceField', e.target.value)}
                      className="mt-1 font-mono text-sm"
                    />
                    {mapping.sourceField && getFieldHint(mapping.sourceField) ? (
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">
                        💡 Sample: {getFieldHint(mapping.sourceField)}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">JSONPath: $.field.nested or $.array[*].item</p>
                    )}
                  </div>
                  
                  <ArrowRight className="h-4 w-4 text-blue-500 mt-6" />
                  
                  {/* Target Field */}
                  <div className="flex-1">
                    <Label className="text-xs text-green-700">Target Field ({targetSystem})</Label>
                    <Input
                      placeholder="e.g., VBELN or header.VBELN"
                      value={mapping.targetField}
                      onChange={(e) => updateManualMapping(idx, 'targetField', e.target.value)}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                  
                  {/* Remove Button */}
                  <Button
                    onClick={() => removeManualMapping(idx)}
                    variant="ghost"
                    size="sm"
                    className="mt-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </Button>
                </div>
                
                {/* Advanced Options Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-blue-200">
                  {/* Transform */}
                  <div>
                    <Label className="text-xs text-purple-700">Transform</Label>
                    <Input
                      placeholder="e.g., toUpperCase"
                      value={mapping.transform || ''}
                      onChange={(e) => updateManualMapping(idx, 'transform', e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  
                  {/* Default Value */}
                  <div>
                    <Label className="text-xs text-gray-700">Default Value</Label>
                    <Input
                      placeholder="e.g., N/A"
                      value={mapping.defaultValue || ''}
                      onChange={(e) => updateManualMapping(idx, 'defaultValue', e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  
                  {/* Validation */}
                  <div>
                    <Label className="text-xs text-orange-700">Validation</Label>
                    <Input
                      placeholder="e.g., required, email, numeric"
                      value={mapping.validation || ''}
                      onChange={(e) => updateManualMapping(idx, 'validation', e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  
                  {/* Segment */}
                  <div>
                    <Label className="text-xs text-indigo-700">Segment</Label>
                    <Input
                      placeholder="e.g., header, items, footer"
                      value={mapping.segment || ''}
                      onChange={(e) => updateManualMapping(idx, 'segment', e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
                
                {/* Required/Optional Toggle */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id={`optional-${idx}`}
                    checked={mapping.optional !== false}
                    onChange={(e) => updateManualMapping(idx, 'optional', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor={`optional-${idx}`} className="text-sm font-normal cursor-pointer">
                    Field is <span className="font-semibold">{mapping.optional !== false ? 'Optional' : 'Required'}</span>
                  </Label>
                </div>
              </div>
            ))}
            
            {manualMappings.length > 0 && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  onClick={handleManualSave}
                  disabled={manualMappings.some(m => !m.sourceField || !m.targetField)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saveSuccess ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Saved to /mappings/mapboard
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Mapping as YAML
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Generated Mapping</CardTitle>
                <CardDescription>
                  Overall Confidence:{" "}
                  <span className="font-semibold text-blue-700">
                    {(result.confidence * 100).toFixed(0)}%
                  </span>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                <Button onClick={handleSaveMapping} disabled={saveSuccess}>
                  {saveSuccess ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save to /mappings
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="visual">
              <TabsList>
                <TabsTrigger value="visual">Visual Mapping</TabsTrigger>
                <TabsTrigger value="yaml">YAML Output</TabsTrigger>
                <TabsTrigger value="reviews">Suggested Reviews</TabsTrigger>
              </TabsList>

              <TabsContent value="visual" className="space-y-4 mt-4">
                <div className="space-y-3">
                  {result.fieldMappings.map((mapping, idx) => (
                    <div
                      key={idx}
                      className={`p-4 border-2 rounded-lg transition-all hover:shadow-md ${
                        mapping.needsReview 
                          ? "bg-amber-50 border-amber-300" 
                          : "bg-white border-gray-200 hover:border-blue-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex-1">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                              Source • {sourceSystem}
                            </div>
                            <div className="font-mono text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-2 rounded border border-blue-200">
                              {mapping.sourceField}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                              Target • {targetSystem}
                            </div>
                            <div className="font-mono text-sm font-semibold text-green-700 bg-green-50 px-3 py-2 rounded border border-green-200">
                              {mapping.targetField}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {mapping.transform && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-300">
                              ⚡ {mapping.transform}
                            </Badge>
                          )}
                          <Badge
                            className={`text-xs font-semibold ${
                              mapping.confidence >= 0.8
                                ? "bg-green-100 text-green-700 border-green-300"
                                : mapping.confidence >= 0.6
                                ? "bg-amber-100 text-amber-700 border-amber-300"
                                : "bg-red-100 text-red-700 border-red-300"
                            }`}
                          >
                            {(mapping.confidence * 100).toFixed(0)}%
                          </Badge>
                          {mapping.needsReview && (
                            <Badge className="text-xs bg-red-100 text-red-700 border-red-300">
                              ⚠️ Review
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
                  <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-2xl font-bold text-blue-700">{result.fieldMappings.length}</div>
                    <div className="text-xs text-gray-600 mt-1">Total Mappings</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-700">
                      {result.fieldMappings.filter(m => m.confidence >= 0.8).length}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">High Confidence</div>
                  </div>
                  <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="text-2xl font-bold text-amber-700">
                      {result.fieldMappings.filter(m => m.needsReview).length}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Needs Review</div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="yaml" className="mt-4">
                <Textarea
                  className="font-mono text-sm h-96"
                  value={result.mappingYAML}
                  readOnly
                />
              </TabsContent>

              <TabsContent value="reviews" className="mt-4">
                {result.suggestedReviews.length > 0 ? (
                  <div className="space-y-2">
                    {result.suggestedReviews.map((review, idx) => (
                      <Alert key={idx}>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{review}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No reviews needed - mapping looks good!
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
