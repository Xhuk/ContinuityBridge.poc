import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, AlertCircle, Lightbulb, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AIDiagnosisProps {
  flowName: string;
  nodeName: string;
  nodeType: string;
  errorMessage: string;
  payloadSnapshot?: any;
  stackTrace?: string;
}

interface DiagnosisResult {
  rootCause: string;
  diagnosis: string;
  suggestedFixes: string[];
  provider: string;
}

/**
 * AI-Powered Error Diagnosis Component
 * Uses Gemini to analyze errors and suggest fixes for consultants
 */
export function AIDiagnosis({
  flowName,
  nodeName,
  nodeType,
  errorMessage,
  payloadSnapshot,
  stackTrace,
}: AIDiagnosisProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const diagnoseError = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/ai/diagnose-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowName,
          nodeName,
          nodeType,
          errorMessage,
          payloadSnapshot,
          stackTrace,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "AI diagnosis failed");
      }

      const data = await response.json();
      setResult(data);
      
      toast({
        title: "AI Analysis Complete",
        description: "Review the suggested fixes below",
      });
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "AI Analysis Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">AI Assistant</CardTitle>
          </div>
          <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
            Powered by Gemini
          </Badge>
        </div>
        <CardDescription>
          Get AI-powered diagnosis and suggested fixes for this error
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result && !error && (
          <Button
            onClick={diagnoseError}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing with AI...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Diagnose with AI
              </>
            )}
          </Button>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Analysis Failed</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={diagnoseError}
                  className="mt-2"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Root Cause */}
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-orange-900">Root Cause</p>
                  <p className="text-sm text-orange-800 mt-1 whitespace-pre-wrap">
                    {result.rootCause}
                  </p>
                </div>
              </div>
            </div>

            {/* Diagnosis */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-blue-900">Analysis</p>
                  <p className="text-sm text-blue-800 mt-1 whitespace-pre-wrap">
                    {result.diagnosis}
                  </p>
                </div>
              </div>
            </div>

            {/* Suggested Fixes */}
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-green-900 mb-2">Suggested Fixes</p>
                  <ol className="space-y-2">
                    {result.suggestedFixes.map((fix, index) => (
                      <li key={index} className="text-sm text-green-800">
                        <span className="font-medium text-green-900">
                          {index + 1}.
                        </span>{" "}
                        {fix}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <p className="text-xs text-muted-foreground">
                Analysis provided by {result.provider}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={diagnoseError}
                disabled={loading}
              >
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
