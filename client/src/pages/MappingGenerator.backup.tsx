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

  const loadExampleSchemas = () => {
    setSourceSystem("WMS");
    setTargetSystem("SAP S/4HANA");
    setSourceFormat("json");
    setTargetFormat("json");
    
    const wmsSchema = {
      orderId: "string",
      orderDate: "string",
      customerName: "string",
      customerEmail: "string",
      shippingAddress: {
        street: "string",
        city: "string",
        state: "string",
        zipCode: "string",
        country: "string"
      },
      items: [{
        lineNumber: "number",
        sku: "string",
        productName: "string",
        quantity: "number",
        unitOfMeasure: "string",
        unitPrice: "number"
      }],
      totalAmount: "number",
      currency: "string"
    };

    const sapSchema = {
      VBELN: "string",
      KUNNR: "string",
      NAME1: "string",
      STRAS: "string",
      ORT01: "string",
      REGIO: "string",
      PSTLZ: "string",
      LAND1: "string",
      MATNR: "string",
      ARKTX: "string",
      KWMENG: "number",
      VRKME: "string",
      NETWR: "number",
      WAERK: "string",
      ERDAT: "string"
    };

    setSourceSchema(JSON.stringify(wmsSchema, null, 2));
    setTargetSchema(JSON.stringify(sapSchema, null, 2));
  };

  // Get placeholder text based on format
  const getSchemaPlaceholder = (format: string, isSource: boolean) => {
    if (format === "json") {
      return isSource
        ? '{"orderId": "string", "customerName": "string", "items": [...]}'
        : '{"VBELN": "string", "KUNNR": "string", "MATNR": "string"}';
    } else {
      return isSource
        ? '<Order>\n  <OrderId>string</OrderId>\n  <Customer>string</Customer>\n  <Items>...</Items>\n</Order>'
        : '<SalesOrder>\n  <VBELN>string</VBELN>\n  <KUNNR>string</KUNNR>\n  <MATNR>string</MATNR>\n</SalesOrder>';
    }
  };

  // Get sample data placeholder based on format
  const getSampleDataPlaceholder = (format: string) => {
    if (format === "json") {
      return '{"orderId": "12345", "items": [{"sku": "ABC-001", "qty": 10}]}';
    } else {
      return '<Order>\n  <OrderId>12345</OrderId>\n  <Items>\n    <Item>\n      <SKU>ABC-001</SKU>\n      <Quantity>10</Quantity>\n    </Item>\n  </Items>\n</Order>';
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

  const handleSaveMapping = async () => {
    if (!result) return;

    try {
      const filename = `${sourceSystem.toLowerCase().replace(/\s+/g, "-")}-to-${targetSystem.toLowerCase().replace(/\s+/g, "-")}.yaml`;
      const directory = `${sourceSystem.toLowerCase().replace(/\s+/g, "-")}-to-${targetSystem.toLowerCase().replace(/\s+/g, "-")}`;

      const response = await fetch("/api/dev/save-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappingYAML: result.mappingYAML,
          filename,
          directory,
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

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600 bg-green-50";
    if (confidence >= 0.6) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Mapping Generator</h1>
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
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No AI API key detected. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable for AI-powered mapping.
            Falling back to rule-based mapping.
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
          <CardDescription>Provide sample source data ({sourceFormat.toUpperCase()}) to improve mapping accuracy</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={getSampleDataPlaceholder(sourceFormat)}
            className="font-mono text-sm h-32"
            value={sampleData}
            onChange={(e) => setSampleData(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Generate Button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={loading || !sourceSchema || !targetSchema || !sourceSystem || !targetSystem}
          className="w-full max-w-md"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Mapping...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Mapping
            </>
          )}
        </Button>
      </div>

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
                  <span className={`font-semibold ${getConfidenceColor(result.confidence)}`}>
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
                {/* AI-Driven Dark Mode Dashboard with Glassmorphism */}
                <div className="relative rounded-xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-8 min-h-[600px] overflow-hidden">
                  {/* Animated background gradient */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-emerald-600/20 animate-pulse" />
                  
                  {/* Grid overlay */}
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)',
                    backgroundSize: '50px 50px'
                  }} />

                  {/* Header */}
                  <div className="relative mb-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                          <Sparkles className="h-6 w-6 text-blue-400" />
                          AI Field Mapping Analysis
                        </h3>
                        <p className="text-blue-300/70 text-sm mt-1">
                          {sourceSystem} → {targetSystem} • {result.fieldMappings.length} mappings detected
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-400/30 backdrop-blur-sm">
                          <div className="text-xs text-blue-300/70">Confidence Score</div>
                          <div className="text-2xl font-bold text-blue-400">
                            {(result.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mapping Visualizations */}
                  <div className="relative space-y-3">
                    {result.fieldMappings.map((mapping, idx) => {
                      const confidenceColor = mapping.confidence >= 0.8 
                        ? 'from-emerald-500/20 to-emerald-600/10 border-emerald-400/40'
                        : mapping.confidence >= 0.6
                        ? 'from-yellow-500/20 to-yellow-600/10 border-yellow-400/40'
                        : 'from-red-500/20 to-red-600/10 border-red-400/40';
                      
                      const glowColor = mapping.confidence >= 0.8
                        ? 'shadow-emerald-500/20'
                        : mapping.confidence >= 0.6
                        ? 'shadow-yellow-500/20'
                        : 'shadow-red-500/20';

                      return (
                        <div
                          key={idx}
                          className={`group relative rounded-lg bg-gradient-to-r ${confidenceColor} border backdrop-blur-xl ${glowColor} shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]`}
                        >
                          {/* Glow effect on hover */}
                          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          <div className="relative p-4">
                            <div className="flex items-center gap-4">
                              {/* Source Field */}
                              <div className="flex-1">
                                <div className="text-xs text-blue-300/60 uppercase tracking-wide mb-1">
                                  Source • {sourceSystem}
                                </div>
                                <div className="font-mono text-sm font-semibold text-blue-300 bg-blue-950/50 px-3 py-2 rounded border border-blue-400/20">
                                  {mapping.sourceField}
                                </div>
                              </div>

                              {/* Connection Arrow with Animation */}
                              <div className="flex-shrink-0 relative">
                                <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
                                <div className="relative flex items-center gap-1">
                                  <div className="h-[2px] w-16 bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-pulse" />
                                  </div>
                                  <ArrowRight className="h-5 w-5 text-cyan-400" />
                                </div>
                              </div>

                              {/* Target Field */}
                              <div className="flex-1">
                                <div className="text-xs text-emerald-300/60 uppercase tracking-wide mb-1">
                                  Target • {targetSystem}
                                </div>
                                <div className="font-mono text-sm font-semibold text-emerald-300 bg-emerald-950/50 px-3 py-2 rounded border border-emerald-400/20">
                                  {mapping.targetField}
                                </div>
                              </div>

                              {/* Metadata */}
                              <div className="flex-shrink-0 flex items-center gap-2">
                                {mapping.transform && (
                                  <div className="px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-400/30">
                                    ⚡ {mapping.transform}
                                  </div>
                                )}
                                
                                {/* Confidence Badge */}
                                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  mapping.confidence >= 0.8
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                    : mapping.confidence >= 0.6
                                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/40'
                                    : 'bg-red-500/20 text-red-300 border border-red-400/40'
                                }`}>
                                  {(mapping.confidence * 100).toFixed(0)}%
                                </div>

                                {mapping.needsReview && (
                                  <div className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-300 border border-red-400/40 animate-pulse">
                                    ⚠️ Review
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Stats Footer */}
                  <div className="relative mt-8 grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-blue-500/10 border border-blue-400/30 backdrop-blur-sm p-4">
                      <div className="text-xs text-blue-300/70 uppercase tracking-wide">Total Mappings</div>
                      <div className="text-3xl font-bold text-blue-400 mt-1">
                        {result.fieldMappings.length}
                      </div>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-400/30 backdrop-blur-sm p-4">
                      <div className="text-xs text-emerald-300/70 uppercase tracking-wide">High Confidence</div>
                      <div className="text-3xl font-bold text-emerald-400 mt-1">
                        {result.fieldMappings.filter(m => m.confidence >= 0.8).length}
                      </div>
                    </div>
                    <div className="rounded-lg bg-red-500/10 border border-red-400/30 backdrop-blur-sm p-4">
                      <div className="text-xs text-red-300/70 uppercase tracking-wide">Needs Review</div>
                      <div className="text-3xl font-bold text-red-400 mt-1">
                        {result.fieldMappings.filter(m => m.needsReview).length}
                      </div>
                    </div>
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
