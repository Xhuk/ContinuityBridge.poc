import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SmartMappingAssistantProps {
  onMappingGenerated: (mappings: Record<string, string>) => void;
}

/**
 * Smart Mapping Assistant
 * Uses AI to generate field mappings between source and target schemas
 */
export function SmartMappingAssistant({
  onMappingGenerated,
}: SmartMappingAssistantProps) {
  const [sourceSchema, setSourceSchema] = useState("");
  const [targetSchema, setTargetSchema] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generateMappings = async () => {
    if (!sourceSchema.trim() || !targetSchema.trim()) {
      toast({
        title: "Missing Schemas",
        description: "Please provide both source and target schemas",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // Parse schemas
      const parsedSource = JSON.parse(sourceSchema);
      const parsedTarget = JSON.parse(targetSchema);

      const response = await fetch("/api/ai/suggest-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceSchema: parsedSource,
          targetSchema: parsedTarget,
          context: context.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "AI mapping generation failed");
      }

      const data = await response.json();
      setResult(data.mappings);

      toast({
        title: "Mappings Generated",
        description: "Review and apply the AI-suggested mappings",
      });
    } catch (err: any) {
      toast({
        title: "Generation Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    
    toast({
      title: "Copied to Clipboard",
      description: "Mappings copied successfully",
    });
  };

  const applyMappings = () => {
    if (!result) return;
    onMappingGenerated(result);
    
    toast({
      title: "Mappings Applied",
      description: "AI-generated mappings have been applied to the node",
    });
  };

  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Smart Mapping Assistant</CardTitle>
          </div>
          <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
            AI-Powered
          </Badge>
        </div>
        <CardDescription>
          Generate field mappings automatically using AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source Schema */}
        <div className="space-y-2">
          <Label htmlFor="sourceSchema">Source Schema (JSON)</Label>
          <Textarea
            id="sourceSchema"
            placeholder='{"OrderNumber": "12345", "CustomerName": "John Doe"}'
            value={sourceSchema}
            onChange={(e) => setSourceSchema(e.target.value)}
            rows={4}
            className="font-mono text-sm"
          />
        </div>

        {/* Target Schema */}
        <div className="space-y-2">
          <Label htmlFor="targetSchema">Target Schema (JSON)</Label>
          <Textarea
            id="targetSchema"
            placeholder='{"orderId": "", "customer": {"name": ""}}'
            value={targetSchema}
            onChange={(e) => setTargetSchema(e.target.value)}
            rows={4}
            className="font-mono text-sm"
          />
        </div>

        {/* Context (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="context">Context (Optional)</Label>
          <Textarea
            id="context"
            placeholder="Example: Map SAP order format to WMS format"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
          />
        </div>

        {/* Generate Button */}
        <Button
          onClick={generateMappings}
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Mappings...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate with AI
            </>
          )}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Generated Mappings</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={applyMappings}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Apply to Node
                </Button>
              </div>
            </div>
            
            <div className="p-3 bg-slate-900 rounded-lg overflow-x-auto">
              <pre className="text-xs text-green-400 font-mono">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>

            {/* Mapping Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mapping Preview</Label>
              <div className="space-y-1">
                {Object.entries(result).map(([target, source]) => (
                  <div
                    key={target}
                    className="flex items-center gap-2 p-2 bg-white rounded border border-purple-200 text-sm"
                  >
                    <code className="text-blue-600 font-mono">{target}</code>
                    <span className="text-muted-foreground">←</span>
                    <code className="text-orange-600 font-mono">{source}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
