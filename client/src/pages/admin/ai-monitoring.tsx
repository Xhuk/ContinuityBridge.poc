import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  DollarSign, 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Clock,
  Sparkles,
  ShieldAlert,
  FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * AI Monitoring Dashboard (Founder/Superadmin Only)
 * 
 * Features:
 * - Token billing & cost tracking ($250/month per 2000 tokens)
 * - Activity guard violations (weather, jokes, etc.)
 * - Environment guard violations (production access attempts)
 * - Per-organization usage breakdown
 * - Real-time monitoring
 */
export default function AIMonitoring() {
  const { user } = useAuth();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  // Access control
  if (user?.role !== "superadmin") {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Access Denied. This dashboard is restricted to founders/superadmin only.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Fetch billing data
  const { data: billingData, isLoading: billingLoading } = useQuery({
    queryKey: ["/api/ai/admin/usage/billing"],
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch violations
  const { data: violationsData, isLoading: violationsLoading } = useQuery({
    queryKey: ["/api/ai/admin/usage/violations", { limit: 50 }],
    refetchInterval: 30000,
  });

  // Fetch usage summary
  const { data: summaryData } = useQuery({
    queryKey: ["/api/ai/admin/usage/summary"],
    refetchInterval: 30000,
  });

  // Fetch detailed org usage
  const { data: orgDetailData } = useQuery({
    queryKey: ["/api/ai/admin/usage/detailed", selectedOrg],
    enabled: !!selectedOrg,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-purple-500" />
              AI Monitoring Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Token billing, usage tracking, and violation monitoring (Founder Access)
            </p>
          </div>
          <Badge variant="default" className="bg-purple-600">
            Superadmin Only
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="billing" className="space-y-6">
          <TabsList>
            <TabsTrigger value="billing">
              <DollarSign className="h-4 w-4 mr-2" />
              Billing & Costs
            </TabsTrigger>
            <TabsTrigger value="violations">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Violations
            </TabsTrigger>
            <TabsTrigger value="usage">
              <Activity className="h-4 w-4 mr-2" />
              Usage Stats
            </TabsTrigger>
            <TabsTrigger value="organizations">
              <Users className="h-4 w-4 mr-2" />
              Organizations
            </TabsTrigger>
          </TabsList>

          {/* BILLING TAB */}
          <TabsContent value="billing" className="space-y-6">
            {billingLoading ? (
              <div className="text-muted-foreground">Loading billing data...</div>
            ) : billingData ? (
              <>
                {/* Global Stats */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {billingData.global.totalTokens.toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {billingData.billingPeriod}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        ${billingData.global.estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {billingData.global.baseRate}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {billingData.global.totalRequests}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        This month
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Price/Token</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        ${billingData.global.pricePerToken.toFixed(3)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Per token
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Per-Organization Billing */}
                <Card>
                  <CardHeader>
                    <CardTitle>Organization Billing Breakdown</CardTitle>
                    <CardDescription>
                      Token usage and costs per customer ({billingData.billingPeriod})
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {billingData.organizations.map((org: any) => (
                        <div 
                          key={org.organizationId} 
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                          onClick={() => setSelectedOrg(org.organizationId)}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{org.organizationId}</div>
                            <div className="text-sm text-muted-foreground">
                              {org.totalRequests} requests • {org.totalTokens.toLocaleString()} tokens
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">Success Rate</div>
                              <div className="font-medium">
                                {org.totalRequests > 0 
                                  ? Math.round((org.successfulRequests / org.totalRequests) * 100) 
                                  : 0}%
                              </div>
                            </div>
                            <div className="text-right min-w-[100px]">
                              <div className="text-sm text-muted-foreground">Cost</div>
                              <div className="text-lg font-bold text-green-600">
                                ${org.estimatedCost.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-muted-foreground">No billing data available</div>
            )}
          </TabsContent>

          {/* VIOLATIONS TAB */}
          <TabsContent value="violations" className="space-y-6">
            {violationsLoading ? (
              <div className="text-muted-foreground">Loading violations...</div>
            ) : violationsData ? (
              <>
                {/* Violation Summary */}
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Violations</CardTitle>
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-destructive">
                        {violationsData.total}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Blocked attempts
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Activity Guards</CardTitle>
                      <ShieldAlert className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-500">
                        {violationsData.summary?.activity_guard_violation?.count || 0}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Weather, jokes, etc.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Environment Guards</CardTitle>
                      <ShieldAlert className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">
                        {violationsData.summary?.environment_guard?.count || 0}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Production attempts
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Violations */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Violations</CardTitle>
                    <CardDescription>
                      Latest AI misuse attempts and guard blocks
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {violationsData.violations.slice(0, 20).map((violation: any) => (
                        <div 
                          key={violation.id} 
                          className="flex items-start justify-between p-3 border rounded-lg bg-destructive/5"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="destructive" className="text-xs">
                                {violation.errorType}
                              </Badge>
                              <span className="text-sm font-medium">{violation.organizationId}</span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {violation.flowName || "N/A"}
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {new Date(violation.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-muted-foreground">No violations data available</div>
            )}
          </TabsContent>

          {/* USAGE STATS TAB */}
          <TabsContent value="usage" className="space-y-6">
            {summaryData && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Total AI Requests</CardTitle>
                      <CardDescription>All-time across all organizations</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{summaryData.totalRequests}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Enabled Organizations</CardTitle>
                      <CardDescription>Currently using AI features</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{summaryData.enabledOrganizations}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Usage by Feature</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {summaryData.byFeature.map((feature: any) => (
                        <div key={feature.featureType} className="flex items-center justify-between p-2 border rounded">
                          <span className="font-medium capitalize">{feature.featureType.replace('_', ' ')}</span>
                          <Badge>{feature.count} requests</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ORGANIZATIONS TAB */}
          <TabsContent value="organizations" className="space-y-6">
            {selectedOrg && orgDetailData ? (
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Usage: {selectedOrg}</CardTitle>
                  <CardDescription>
                    Recent AI requests and token consumption
                  </CardDescription>
                  <Button variant="outline" size="sm" onClick={() => setSelectedOrg(null)}>
                    ← Back to list
                  </Button>
                </CardHeader>
                <CardContent>
                  {/* Stats */}
                  <div className="grid gap-4 md:grid-cols-4 mb-6">
                    <div className="border rounded p-3">
                      <div className="text-sm text-muted-foreground">Total Requests</div>
                      <div className="text-2xl font-bold">{orgDetailData.stats.totalRequests}</div>
                    </div>
                    <div className="border rounded p-3">
                      <div className="text-sm text-muted-foreground">Total Tokens</div>
                      <div className="text-2xl font-bold">{orgDetailData.stats.totalTokens.toLocaleString()}</div>
                    </div>
                    <div className="border rounded p-3">
                      <div className="text-sm text-muted-foreground">Estimated Cost</div>
                      <div className="text-2xl font-bold text-green-600">${orgDetailData.stats.estimatedCost.toFixed(2)}</div>
                    </div>
                    <div className="border rounded p-3">
                      <div className="text-sm text-muted-foreground">Avg Duration</div>
                      <div className="text-2xl font-bold">{Math.round(orgDetailData.stats.avgDuration)}ms</div>
                    </div>
                  </div>

                  {/* Request Log */}
                  <div className="space-y-2">
                    {orgDetailData.usage.map((request: any) => (
                      <div key={request.id} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {request.success ? (
                              <Badge variant="default" className="bg-green-600">Success</Badge>
                            ) : (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                            <span className="text-sm">{request.flowName}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(request.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{request.tokensUsed} tokens</div>
                          <div className="text-xs text-muted-foreground">{request.durationMs}ms</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Select an Organization</CardTitle>
                  <CardDescription>
                    Click an organization from the Billing tab to view detailed usage
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Go to the "Billing & Costs" tab and click on any organization to see their detailed usage history.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
