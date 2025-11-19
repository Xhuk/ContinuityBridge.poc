/**
 * BridgeScript Editor - Monaco-powered TypeScript editor for consultants
 * 
 * Features:
 * - Monaco editor with TypeScript IntelliSense
 * - Real-time validation
 * - Compile to YAML preview
 * - SOW enforcement visualization
 * - Save/Load flow templates
 */

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Code2, 
  Play, 
  Save, 
  FileCode, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Eye,
  Download,
  Upload,
  Sparkles
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { queryClient } from "@/lib/queryClient";

const EXAMPLE_FLOW = `import { SOWFlowBuilder } from "../../server/src/dsl/BridgeScript";

// Define SOW constraints
const customerSOW = {
  systems: ["SHOPIFY", "WMS", "ERP", "EMAIL"],
  maxInterfaces: 10,
  maxFlows: 20,
};

// Build flow using BridgeScript
const flow = new SOWFlowBuilder(
  "my-custom-flow",
  "1.0.0-custom.1",
  customerSOW
)
  .forCustomer("my-org-id", "dev")
  .extendsBase("1.0.0")
  .changes("minor", "Custom flow description")
  .withMetadata({
    tags: ["custom", "example"],
    description: "My custom integration flow",
  })
  
  // Add your flow logic here
  .receiveWebhook("/webhooks/my-trigger", {
    auth: "hmac",
    secret: "\${WEBHOOK_SECRET}",
  })
  .validate({
    required: ["order_id", "customer"],
    mode: "strict",
  })
  .transformWith(\`
    return {
      ...context.input,
      processedAt: new Date().toISOString()
    };
  \`)
  .sendTo("\${ERP_API}/orders", {
    method: "POST",
    retries: 3,
  })
  .sendEmail({
    to: "admin@company.com",
    subject: "Order Processed",
    template: "order-confirmation",
  })
  
  .build();

console.log(flow);
`;

export default function BridgeScriptEditor() {
  const { toast } = useToast();
  const editorRef = useRef<any>(null);
  
  const [flowName, setFlowName] = useState("my-custom-flow");
  const [code, setCode] = useState(EXAMPLE_FLOW);
  const [compiledYaml, setCompiledYaml] = useState("");
  const [validationResult, setValidationResult] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState("");

  // Fetch customers for dropdown
  const { data: customersData } = useQuery({
    queryKey: ["/api/customers"],
    enabled: false, // Mock for now
  });

  // Compile mutation
  const compileMutation = useMutation({
    mutationFn: async (flowCode: string) => {
      const res = await fetch("/api/bridgescript/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: flowCode }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Compilation failed");
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      setCompiledYaml(data.yaml);
      setValidationResult(data.validation);
      
      toast({
        title: "Compilation successful",
        description: data.validation?.valid 
          ? "✅ Flow is valid and ready to deploy" 
          : `⚠️ ${data.validation?.errors?.length || 0} validation errors`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Compilation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bridgescript/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          flowName,
          code,
          yaml: compiledYaml,
          organizationId: selectedCustomer,
        }),
      });
      
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flows"] });
      toast({
        title: "Flow saved",
        description: `"${flowName}" saved successfully`,
      });
    },
  });

  const handleCompile = () => {
    compileMutation.mutate(code);
  };

  const handleSave = () => {
    if (!compiledYaml) {
      toast({
        title: "Compile first",
        description: "Please compile the flow before saving",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate();
  };

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  return (
    <div className="h-full flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Code2 className="w-8 h-8" />
            BridgeScript Editor
          </h1>
          <p className="text-muted-foreground">
            Build integration flows using TypeScript
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-2" />
            Load Template
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button 
            size="sm" 
            onClick={handleCompile}
            disabled={compileMutation.isPending}
          >
            {compileMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Compile & Validate
          </Button>
          <Button 
            size="sm" 
            onClick={handleSave}
            disabled={!compiledYaml || saveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Flow
          </Button>
        </div>
      </div>

      {/* Flow Metadata */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Flow Name</Label>
              <Input
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                placeholder="my-custom-flow"
              />
            </div>
            <div className="space-y-2">
              <Label>Customer Organization</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo-company-001">Demo Logistics Inc.</SelectItem>
                  <SelectItem value="cliente-a">Cliente A</SelectItem>
                  <SelectItem value="cliente-b">Cliente B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select defaultValue="dev">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dev">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="prod">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editor & Preview */}
      <div className="flex-1 grid grid-cols-2 gap-6">
        {/* Code Editor */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="w-5 h-5" />
                  BridgeScript Code
                </CardTitle>
                <CardDescription>Write your flow using TypeScript</CardDescription>
              </div>
              <Badge variant="secondary">
                <Sparkles className="w-3 h-3 mr-1" />
                TypeScript
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <Editor
              height="100%"
              defaultLanguage="typescript"
              value={code}
              onChange={(value: string | undefined) => setCode(value || "")}
              onMount={handleEditorDidMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
              }}
            />
          </CardContent>
        </Card>

        {/* Preview & Validation */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Preview & Validation
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <Tabs defaultValue="yaml" className="h-full flex flex-col">
              <TabsList className="mx-6 mt-0">
                <TabsTrigger value="yaml">Compiled YAML</TabsTrigger>
                <TabsTrigger value="validation">Validation</TabsTrigger>
                <TabsTrigger value="help">Help</TabsTrigger>
              </TabsList>
              
              <TabsContent value="yaml" className="flex-1 m-0 p-6 pt-4">
                {compiledYaml ? (
                  <ScrollArea className="h-full">
                    <pre className="text-xs font-mono bg-muted p-4 rounded-lg">
                      {compiledYaml}
                    </pre>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Code2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>Click "Compile & Validate" to see YAML output</p>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="validation" className="flex-1 m-0 p-6 pt-4">
                {validationResult ? (
                  <div className="space-y-4">
                    {/* Summary */}
                    <Alert className={validationResult.valid ? "border-green-500" : "border-red-500"}>
                      <div className="flex items-center gap-2">
                        {validationResult.valid ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        <AlertDescription>
                          {validationResult.valid ? (
                            <span className="font-semibold text-green-900 dark:text-green-100">
                              ✅ Flow is valid and ready to deploy
                            </span>
                          ) : (
                            <span className="font-semibold text-red-900 dark:text-red-100">
                              ❌ Validation failed: {validationResult.errors?.length || 0} errors
                            </span>
                          )}
                        </AlertDescription>
                      </div>
                    </Alert>

                    <Separator />

                    {/* Errors */}
                    {validationResult.errors?.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-red-600 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Errors ({validationResult.errors.length})
                        </h4>
                        {validationResult.errors.map((error: any, index: number) => (
                          <Alert key={index} variant="destructive">
                            <AlertDescription>
                              <p className="font-mono text-xs mb-1">[{error.code}]</p>
                              <p>{error.message}</p>
                              {error.suggestion && (
                                <p className="text-xs mt-2 italic">💡 {error.suggestion}</p>
                              )}
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    )}

                    {/* Warnings */}
                    {validationResult.warnings?.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-yellow-600 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Warnings ({validationResult.warnings.length})
                        </h4>
                        {validationResult.warnings.map((warning: any, index: number) => (
                          <Alert key={index} className="border-yellow-500">
                            <AlertDescription>
                              <p className="font-mono text-xs mb-1">[{warning.code}]</p>
                              <p>{warning.message}</p>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>Validation results will appear here after compilation</p>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="help" className="flex-1 m-0 p-6 pt-4">
                <ScrollArea className="h-full">
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="font-semibold mb-2">Quick Start</h4>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>Define your SOW constraints (authorized systems)</li>
                        <li>Create a SOWFlowBuilder instance</li>
                        <li>Chain methods to build your flow logic</li>
                        <li>Call .build() to generate YAML</li>
                        <li>Click "Compile & Validate" to check for errors</li>
                        <li>Save the flow to deploy</li>
                      </ol>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-semibold mb-2">Common Methods</h4>
                      <ul className="space-y-2 text-muted-foreground">
                        <li><code className="bg-muted px-1">.receiveWebhook(path, config)</code> - Add webhook trigger</li>
                        <li><code className="bg-muted px-1">.validate(config)</code> - Validate input</li>
                        <li><code className="bg-muted px-1">.transformWith(script)</code> - Custom JavaScript transformation</li>
                        <li><code className="bg-muted px-1">.sendTo(url, config)</code> - HTTP request</li>
                        <li><code className="bg-muted px-1">.sendEmail(config)</code> - Send email notification</li>
                        <li><code className="bg-muted px-1">.when(condition)</code> - Conditional branching</li>
                        <li><code className="bg-muted px-1">.splitBy(config)</code> - Parallel processing</li>
                        <li><code className="bg-muted px-1">.joinAll(config)</code> - Wait for parallel completion</li>
                      </ul>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-semibold mb-2">SOW Enforcement</h4>
                      <p className="text-muted-foreground mb-2">
                        The SOW (Statement of Work) defines which external systems your flow can integrate with.
                        If you try to use an unauthorized system, compilation will fail.
                      </p>
                      <pre className="bg-muted p-2 rounded text-xs">
{`const customerSOW = {
  systems: ["SHOPIFY", "WMS", "ERP"],
  maxInterfaces: 10,
  maxFlows: 20,
};`}
                      </pre>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
