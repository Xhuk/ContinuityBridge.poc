import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, CheckCircle2, XCircle } from "lucide-react";

export default function Onboarding() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    magicLink?: string;
    apiKey?: string;
  } | null>(null);

  const handleGenerateMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/auth/login/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate magic link");
      }

      setResult({
        success: true,
        message: data.message,
        magicLink: data.devMagicLink,
        apiKey: email === "admin@continuitybridge.local" ? data.apiKey : undefined,
      });
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || "An error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mb-2">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Welcome to ContinuityBridge</CardTitle>
          <CardDescription>
            Request a passwordless login link to get started
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleGenerateMagicLink} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Magic Link"
              )}
            </Button>
          </form>

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">{result.message}</p>
                  
                  {result.apiKey && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        🔑 Your API Key (save this securely):
                      </p>
                      <div className="p-3 bg-background rounded-md border">
                        <code className="text-xs text-blue-600 break-all font-mono">
                          {result.apiKey}
                        </code>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          navigator.clipboard.writeText(result.apiKey!);
                        }}
                      >
                        Copy API Key
                      </Button>
                    </div>
                  )}
                  
                  {result.magicLink && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Your magic link (valid for 15 minutes):
                      </p>
                      <div className="p-3 bg-background rounded-md border">
                        <a
                          href={result.magicLink}
                          className="text-xs text-blue-600 hover:underline break-all font-mono"
                        >
                          {result.magicLink}
                        </a>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => window.location.href = result.magicLink!}
                      >
                        Click here to login
                      </Button>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="pt-4 border-t">
            <p className="text-xs text-center text-muted-foreground">
              No password needed • Secure one-time link • Expires in 15 minutes
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
