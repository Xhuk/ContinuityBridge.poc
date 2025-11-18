import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, CheckCircle, AlertTriangle, Code } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AIMapingingAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceInterfaceId?: string;
  targetInterfaceId?: string;
  onMappingGenerated: (mapping: any, jqExpression: string) => void;
}

interface SystemSample {
  systemName: string;
  systemType: string;
  direction: string;
  dataType: string;
  format: string;
  comments?: string;
  samplePayload: any;
}

/**
 * AI Mapping Assistant for Forger Consultant Workflow
 * 
 * Features:
 * 1. Select source and target systems
 * 2. AI analyzes sample payloads  
 * 3. Generates field mappings with enum conversions
 * 4. Consultant review and refinement
 * 5. Saves as reusable transformation template
 */
export function AIMapingingAssistant({
  open,
  onOpenChange,
  sourceInterfaceId,
  targetInterfaceId,
  onMappingGenerated,
}: AIMapingingAssistantProps) {
  const { toast } = useToast();
  const [sourceSampleId, setSourceSampleId] = useState<string>("");
  const [targetSampleId, setTargetSampleId] = useState<string>("");
  const [businessRules, setBusinessRules] = useState("");
  const [generatedMapping, setGeneratedMapping] = useState<any>(null);
  const [jqExpression, setJqExpression] = useState("");

  // Load available system samples
  const { data: samplesData, isLoading: samplesLoading } = useQuery({
    queryKey: ["/api/smart-mapping/samples"],
    enabled: open,
  });

  // Load interfaces
  const { data: interfaces } = useQuery<any[]>({
    queryKey: ["/api/interfaces"],
    enabled: open,
  });

  const samples: SystemSample[] = samplesData?.samples || [];
  const sourceInterface = interfaces?.find(i => i.id === sourceInterfaceId);
  const targetInterface = interfaces?.find(i => i.id === targetInterfaceId);

  // Generate mapping
  const generateMutation = useMutation({
    mutationFn: async () => {
      let sourceSample = samples.find(s => `${s.systemName}-${s.dataType}` === sourceSampleId);
      let targetSample = samples.find(s => `${s.systemName}-${s.dataType}` === targetSampleId);

      if (!sourceSample || !targetSample) {
        throw new Error("Please select both source and target systems");
      }

      const payload = {
        sourceSample,
        targetSample,
        context: businessRules ? { businessRules } : undefined,
      };

      const res = await apiRequest("POST", "/api/smart-mapping/generate", payload);
      return await res.json();
    },
    onSuccess: (data) => {
      setGeneratedMapping(data.mapping);
      setJqExpression(data.jqExpression);
      toast({
        title: "Mapping Generated",
        description: `AI generated ${data.mapping.rules.length} field mappings with ${Math.round(data.mapping.confidence * 100)}% confidence`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Refine mapping
  const refineMutation = useMutation({
    mutationFn: async (feedback: any) => {
      const payload = {
        mapping: generatedMapping,
        consultantFeedback: feedback,
      };

      const res = await apiRequest("POST", "/api/smart-mapping/refine", payload);
      return await res.json();
    },
    onSuccess: (data) => {
      setGeneratedMapping(data.mapping);
      setJqExpression(data.jqExpression);
      toast({
        title: "Mapping Refined",
        description: "Your changes have been applied successfully",
      });
    },
  });

  const handleApproveMapping = () => {
    onMappingGenerated(generatedMapping, jqExpression);
    onOpenChange(false);
    toast({
      title: "Mapping Applied",
      description: "AI-generated mapping has been added to your transformation node",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Mapping Assistant
          </DialogTitle>
          <DialogDescription>
            Let AI analyze your systems and generate intelligent field mappings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step 1: Select Systems */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Select Systems</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Source System */}
              <div>
                <Label>Source System</Label>
                {sourceInterface ? (
                  <div className="flex items-center gap-2 mt-2">
                    <Badge>{sourceInterface.name}</Badge>
                    <span className="text-sm text-muted-foreground">
                      ({sourceInterface.type} • {sourceInterface.protocol})
                    </span>
                  </div>
                ) : (
                  <Select value={sourceSampleId} onValueChange={setSourceSampleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source system..." />
                    </SelectTrigger>
                    <SelectContent>
                      {samples.filter(s => s.direction === "outbound").map(sample => (
                        <SelectItem 
                          key={`${sample.systemName}-${sample.dataType}`} 
                          value={`${sample.systemName}-${sample.dataType}`}
                        >
                          {sample.systemName} - {sample.dataType} ({sample.format.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Target System */}
              <div>
                <Label>Target System</Label>
                {targetInterface ? (
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary">{targetInterface.name}</Badge>
                    <span className="text-sm text-muted-foreground">
                      ({targetInterface.type} • {targetInterface.protocol})
                    </span>
                  </div>
                ) : (
                  <Select value={targetSampleId} onValueChange={setTargetSampleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target system..." />
                    </SelectTrigger>
                    <SelectContent>
                      {samples.filter(s => s.direction === "inbound").map(sample => (
                        <SelectItem 
                          key={`${sample.systemName}-${sample.dataType}`} 
                          value={`${sample.systemName}-${sample.dataType}`}
                        >
                          {sample.systemName} - {sample.dataType} ({sample.format.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Business Rules (Optional) */}
              <div>
                <Label>Business Rules (Optional)</Label>
                <Textarea
                  value={businessRules}
                  onChange={e => setBusinessRules(e.target.value)}
                  placeholder="E.g., Priority 1 maps to URGENT, orders over $1000 require approval, etc."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Provide any custom business logic or special mapping requirements
                </p>
              </div>

              <Button 
                onClick={() => generateMutation.mutate()} 
                disabled={generateMutation.isPending || (!sourceSampleId && !sourceInterface) || (!targetSampleId && !targetInterface)}
                className="w-full"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    AI is analyzing systems...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Mapping
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Step 2: Review AI-Generated Mapping */}
          {generatedMapping && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>2. Review AI-Generated Mapping</span>
                  <div className="flex gap-2">
                    <Badge variant={generatedMapping.confidence >= 0.8 ? "default" : "secondary"}>
                      {Math.round(generatedMapping.confidence * 100)}% Confidence
                    </Badge>
                    {generatedMapping.needsReview && (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Needs Review
                      </Badge>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mapping Summary */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Field Mappings</span>
                    <span className="font-semibold">{generatedMapping.rules.length}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Transformations</span>
                    <span className="font-semibold">{generatedMapping.transformations.length}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Validations</span>
                    <span className="font-semibold">{generatedMapping.validations.length}</span>
                  </div>
                </div>

                {/* Field Mappings */}
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Field Mappings</Label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {generatedMapping.rules.map((rule: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded border bg-muted/30">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono">{rule.targetField}</code>
                            <span className="text-muted-foreground">←</span>
                            <code className="text-sm font-mono text-blue-600">{rule.sourceExpression}</code>
                            {rule.transformation && (
                              <Badge variant="outline" className="text-xs">
                                {rule.transformation.type}
                              </Badge>
                            )}
                          </div>
                          {rule.reasoning && (
                            <p className="text-xs text-muted-foreground mt-1">{rule.reasoning}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {rule.confidence >= 0.8 ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {Math.round(rule.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Enum Mappings */}
                {Object.keys(generatedMapping.enumMappings || {}).length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Enum Conversions</Label>
                    <div className="space-y-2">
                      {Object.entries(generatedMapping.enumMappings).map(([field, mapping]: [string, any]) => (
                        <div key={field} className="p-2 rounded border bg-muted/30">
                          <div className="font-mono text-sm mb-1">{field}</div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(mapping).map(([from, to]: [string, any]) => (
                              <Badge key={from} variant="outline" className="text-xs">
                                {from} → {to}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested Improvements */}
                {generatedMapping.suggestedImprovements?.length > 0 && (
                  <Alert>
                    <AlertDescription>
                      <strong>AI Suggestions:</strong>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        {generatedMapping.suggestedImprovements.map((suggestion: string, idx: number) => (
                          <li key={idx} className="text-sm">{suggestion}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Generated jq Expression */}
                <div>
                  <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Generated jq Expression
                  </Label>
                  <Textarea
                    value={jqExpression}
                    readOnly
                    rows={8}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This transformation will be applied automatically in your flow
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {generatedMapping && (
            <Button onClick={handleApproveMapping}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Apply Mapping
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
