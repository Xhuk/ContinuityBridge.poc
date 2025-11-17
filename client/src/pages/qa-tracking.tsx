import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, AlertCircle, MinusCircle, Clock, TrendingUp, TrendingDown, Activity, TestTube2, Shield } from "lucide-react";

interface TestResult {
  id: string;
  sessionId?: string;
  testCategory: string;
  testName: string;
  testDescription?: string;
  status: "pass" | "fail" | "blocked" | "skipped";
  severity: "critical" | "high" | "medium" | "low";
  expectedResult?: string;
  actualResult?: string;
  notes?: string;
  stepsToReproduce?: string[];
  screenshots?: string[];
  errorLogs?: string;
  stackTrace?: string;
  browser?: string;
  environment: string;
  buildVersion?: string;
  defectId?: string;
  requiresFollowUp: boolean;
  executionTime?: number;
  testedBy?: string;
  testedByEmail?: string;
  reviewedBy?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface TestSession {
  id: string;
  sessionName: string;
  sessionType: "smoke" | "regression" | "exploratory" | "performance";
  status: "in_progress" | "completed";
  totalTests: number;
  passedTests: number;
  failedTests: number;
  blockedTests: number;
  skippedTests: number;
  testPlanUrl?: string;
  coveragePercentage: number;
  startedAt: string;
  completedAt?: string;
  createdBy?: string;
  createdByEmail?: string;
  createdAt: string;
  updatedAt: string;
}

interface QADashboard {
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    blockedTests: number;
    skippedTests: number;
    passRate: string;
    criticalFailures: number;
    requiresFollowUp: number;
  };
  sessions: {
    active: number;
    completed: number;
    total: number;
  };
  testsByCategory: Record<string, { total: number; passed: number; failed: number }>;
  testers: string[];
}

const testCategories = [
  "Authentication",
  "Authorization",
  "Data Sources",
  "Flows",
  "Interfaces",
  "Node Testing",
  "WAF Configuration",
  "User Management",
  "API Testing",
  "Performance",
  "Security",
  "UI/UX",
];

export default function QATracking() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isFounder = user?.role === "superadmin";

  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isNewTestDialogOpen, setIsNewTestDialogOpen] = useState(false);
  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);

  // Fetch QA dashboard (founders only)
  const { data: dashboard } = useQuery<QADashboard>({
    queryKey: ["/api/qa/dashboard"],
    enabled: isFounder,
  });

  // Fetch test sessions
  const { data: sessionsData } = useQuery<{ sessions: TestSession[]; total: number }>({
    queryKey: ["/api/qa/test-sessions"],
  });

  // Fetch test results
  const { data: resultsData, refetch: refetchResults } = useQuery<{ testResults: TestResult[]; total: number }>({
    queryKey: ["/api/qa/test-results", selectedSession],
    queryFn: async () => {
      const params = selectedSession ? `?sessionId=${selectedSession}` : "";
      const response = await fetch(`/api/qa/test-results${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch test results");
      return response.json();
    },
  });

  // Create test session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (data: { sessionName: string; sessionType: string; testPlanUrl?: string }) => {
      const response = await fetch("/api/qa/test-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create session");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qa/test-sessions"] });
      setIsNewSessionDialogOpen(false);
      toast({ title: "Session created", description: "Test session created successfully" });
    },
  });

  // Log test result mutation
  const logTestMutation = useMutation({
    mutationFn: async (data: Partial<TestResult>) => {
      const response = await fetch("/api/qa/test-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to log test");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qa/test-results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/qa/dashboard"] });
      setIsNewTestDialogOpen(false);
      toast({ title: "Test logged", description: "Test result logged successfully" });
    },
  });

  // Review test mutation (founders only)
  const reviewTestMutation = useMutation({
    mutationFn: async ({ testId, reviewNotes }: { testId: string; reviewNotes: string }) => {
      const response = await fetch(`/api/qa/test-results/${testId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewNotes }),
      });
      if (!response.ok) throw new Error("Failed to review test");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qa/test-results"] });
      toast({ title: "Test reviewed", description: "Test result reviewed successfully" });
    },
  });

  const handleCreateSession = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createSessionMutation.mutate({
      sessionName: formData.get("sessionName") as string,
      sessionType: formData.get("sessionType") as string,
      testPlanUrl: formData.get("testPlanUrl") as string || undefined,
    });
  };

  const handleLogTest = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const stepsArray = (formData.get("stepsToReproduce") as string)
      ?.split("\n")
      .filter(s => s.trim());

    logTestMutation.mutate({
      sessionId: selectedSession || undefined,
      testCategory: formData.get("testCategory") as string,
      testName: formData.get("testName") as string,
      testDescription: formData.get("testDescription") as string || undefined,
      status: formData.get("status") as "pass" | "fail" | "blocked" | "skipped",
      severity: formData.get("severity") as "critical" | "high" | "medium" | "low",
      expectedResult: formData.get("expectedResult") as string || undefined,
      actualResult: formData.get("actualResult") as string || undefined,
      notes: formData.get("notes") as string || undefined,
      stepsToReproduce: stepsArray,
      errorLogs: formData.get("errorLogs") as string || undefined,
      browser: formData.get("browser") as string || undefined,
      environment: "production",
      requiresFollowUp: formData.get("requiresFollowUp") === "true",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "blocked":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case "skipped":
        return <MinusCircle className="h-4 w-4 text-gray-400" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "pass":
        return "default";
      case "fail":
        return "destructive";
      case "blocked":
        return "secondary";
      case "skipped":
        return "outline";
      default:
        return "default";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TestTube2 className="h-8 w-8" />
            QA Testing Tracker
            {isFounder && <Shield className="h-6 w-6 text-blue-600" />}
          </h1>
          <p className="text-muted-foreground">
            {isFounder ? "View all testing activity" : "Log your test results"}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isNewSessionDialogOpen} onOpenChange={setIsNewSessionDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Activity className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateSession}>
                <DialogHeader>
                  <DialogTitle>Create Test Session</DialogTitle>
                  <DialogDescription>
                    Start a new testing session to group related tests
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="sessionName">Session Name</Label>
                    <Input id="sessionName" name="sessionName" placeholder="e.g., Sprint 1 Regression" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sessionType">Session Type</Label>
                    <Select name="sessionType" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="smoke">Smoke Testing</SelectItem>
                        <SelectItem value="regression">Regression Testing</SelectItem>
                        <SelectItem value="exploratory">Exploratory Testing</SelectItem>
                        <SelectItem value="performance">Performance Testing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="testPlanUrl">Test Plan URL (Optional)</Label>
                    <Input id="testPlanUrl" name="testPlanUrl" type="url" placeholder="https://..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createSessionMutation.isPending}>
                    Create Session
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isNewTestDialogOpen} onOpenChange={setIsNewTestDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <TestTube2 className="h-4 w-4 mr-2" />
                Log Test
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <form onSubmit={handleLogTest}>
                <DialogHeader>
                  <DialogTitle>Log Test Result</DialogTitle>
                  <DialogDescription>
                    Record the outcome of a test case
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="testCategory">Category</Label>
                      <Select name="testCategory" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {testCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select name="status" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pass">Pass</SelectItem>
                          <SelectItem value="fail">Fail</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                          <SelectItem value="skipped">Skipped</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="testName">Test Name</Label>
                    <Input id="testName" name="testName" placeholder="e.g., SFTP Connection Test" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="testDescription">Description</Label>
                    <Textarea id="testDescription" name="testDescription" placeholder="What does this test validate?" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="severity">Severity (if failed)</Label>
                      <Select name="severity" defaultValue="medium">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="browser">Browser/Environment</Label>
                      <Input id="browser" name="browser" placeholder="Chrome, Firefox, etc." />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expectedResult">Expected Result</Label>
                    <Textarea id="expectedResult" name="expectedResult" placeholder="What should happen?" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="actualResult">Actual Result</Label>
                    <Textarea id="actualResult" name="actualResult" placeholder="What actually happened?" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="stepsToReproduce">Steps to Reproduce (one per line)</Label>
                    <Textarea id="stepsToReproduce" name="stepsToReproduce" placeholder="1. Navigate to...\n2. Click on...\n3. Observe..." rows={4} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="errorLogs">Error Logs</Label>
                    <Textarea id="errorLogs" name="errorLogs" placeholder="Paste error messages or logs" rows={3} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea id="notes" name="notes" placeholder="Any other relevant information" />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="requiresFollowUp"
                      name="requiresFollowUp"
                      value="true"
                      className="h-4 w-4"
                    />
                    <Label htmlFor="requiresFollowUp" className="cursor-pointer">
                      Requires follow-up from founders
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={logTestMutation.isPending}>
                    Log Test Result
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Founder Dashboard Summary */}
      {isFounder && dashboard && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
              <TestTube2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.summary.totalTests}</div>
              <p className="text-xs text-muted-foreground">
                Pass Rate: {dashboard.summary.passRate}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Passed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{dashboard.summary.passedTests}</div>
              <p className="text-xs text-muted-foreground">
                {dashboard.summary.totalTests > 0
                  ? ((dashboard.summary.passedTests / dashboard.summary.totalTests) * 100).toFixed(1)
                  : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{dashboard.summary.failedTests}</div>
              <p className="text-xs text-destructive">
                {dashboard.summary.criticalFailures} critical failures
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Requires Follow-up</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{dashboard.summary.requiresFollowUp}</div>
              <p className="text-xs text-muted-foreground">
                Needs founder review
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Test Sessions & Results */}
      <Tabs defaultValue="results" className="space-y-4">
        <TabsList>
          <TabsTrigger value="results">Test Results</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          {isFounder && <TabsTrigger value="analytics">Analytics</TabsTrigger>}
        </TabsList>

        {/* Test Results Tab */}
        <TabsContent value="results" className="space-y-4">
          {/* Session Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Filter by Session</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedSession || "all"} onValueChange={(v) => setSelectedSession(v === "all" ? null : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tests</SelectItem>
                  {sessionsData?.sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.sessionName} ({session.totalTests} tests)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Test Results List */}
          <div className="space-y-2">
            {resultsData?.testResults.map((test) => (
              <Card key={test.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(test.status)}
                        <h3 className="font-semibold">{test.testName}</h3>
                        <Badge variant={getStatusBadgeVariant(test.status)}>
                          {test.status}
                        </Badge>
                        <span className={`h-2 w-2 rounded-full ${getSeverityColor(test.severity)}`} />
                        <span className="text-xs text-muted-foreground">{test.severity}</span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="font-medium">{test.testCategory}</span>
                        <span>•</span>
                        <span>{test.testedByEmail}</span>
                        <span>•</span>
                        <span>{new Date(test.createdAt).toLocaleString()}</span>
                        {test.requiresFollowUp && (
                          <>
                            <span>•</span>
                            <Badge variant="outline" className="text-yellow-600">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Follow-up Required
                            </Badge>
                          </>
                        )}
                      </div>

                      {test.testDescription && (
                        <p className="text-sm text-muted-foreground">{test.testDescription}</p>
                      )}

                      {test.status === "fail" && (
                        <div className="space-y-2 mt-3 p-3 bg-red-50 rounded-md">
                          {test.expectedResult && (
                            <div>
                              <span className="text-sm font-medium">Expected:</span>
                              <p className="text-sm">{test.expectedResult}</p>
                            </div>
                          )}
                          {test.actualResult && (
                            <div>
                              <span className="text-sm font-medium">Actual:</span>
                              <p className="text-sm">{test.actualResult}</p>
                            </div>
                          )}
                          {test.stepsToReproduce && test.stepsToReproduce.length > 0 && (
                            <div>
                              <span className="text-sm font-medium">Steps to Reproduce:</span>
                              <ol className="list-decimal list-inside text-sm">
                                {test.stepsToReproduce.map((step, idx) => (
                                  <li key={idx}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {test.errorLogs && (
                            <div>
                              <span className="text-sm font-medium">Error Logs:</span>
                              <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded mt-1 overflow-x-auto">
                                {test.errorLogs}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}

                      {test.notes && (
                        <div className="mt-2 p-2 bg-gray-50 rounded">
                          <span className="text-sm font-medium">Notes:</span>
                          <p className="text-sm">{test.notes}</p>
                        </div>
                      )}

                      {/* Founder Review */}
                      {test.reviewedBy && (
                        <div className="mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-500">
                          <div className="flex items-center gap-2 mb-1">
                            <Shield className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium">Founder Review</span>
                            <span className="text-xs text-muted-foreground">
                              by {test.reviewedByEmail} at {new Date(test.reviewedAt!).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm">{test.reviewNotes}</p>
                        </div>
                      )}
                    </div>

                    {/* Founder Actions */}
                    {isFounder && !test.reviewedBy && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Shield className="h-4 w-4 mr-2" />
                            Review
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              reviewTestMutation.mutate({
                                testId: test.id,
                                reviewNotes: formData.get("reviewNotes") as string,
                              });
                            }}
                          >
                            <DialogHeader>
                              <DialogTitle>Review Test Result</DialogTitle>
                              <DialogDescription>
                                Add your review notes for this test
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="reviewNotes">Review Notes</Label>
                                <Textarea
                                  id="reviewNotes"
                                  name="reviewNotes"
                                  placeholder="Your review comments..."
                                  rows={4}
                                  required
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button type="submit" disabled={reviewTestMutation.isPending}>
                                Submit Review
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {resultsData?.testResults.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <TestTube2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No test results yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Click "Log Test" to record your first test result</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {sessionsData?.sessions.map((session) => (
              <Card key={session.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{session.sessionName}</span>
                    <Badge variant={session.status === "in_progress" ? "default" : "secondary"}>
                      {session.status === "in_progress" ? "In Progress" : "Completed"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {session.sessionType} • Started {new Date(session.startedAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>{session.passedTests} Passed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span>{session.failedTests} Failed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <span>{session.blockedTests} Blocked</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MinusCircle className="h-4 w-4 text-gray-400" />
                      <span>{session.skippedTests} Skipped</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Total Tests</span>
                      <span className="font-medium">{session.totalTests}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Pass Rate</span>
                      <span className="font-medium">
                        {session.totalTests > 0
                          ? ((session.passedTests / session.totalTests) * 100).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Created by {session.createdByEmail}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setSelectedSession(session.id)}
                  >
                    View Tests
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {sessionsData?.sessions.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No test sessions yet</p>
                <p className="text-sm text-muted-foreground mt-1">Create a session to group related tests</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analytics Tab (Founders Only) */}
        {isFounder && dashboard && (
          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tests by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(dashboard.testsByCategory).map(([category, stats]) => (
                    <div key={category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{category}</span>
                        <span className="text-muted-foreground">
                          {stats.passed}/{stats.total} passed
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{
                            width: `${stats.total > 0 ? (stats.passed / stats.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>QA Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dashboard.testers.map((tester) => (
                    <div key={tester} className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span>{tester}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
