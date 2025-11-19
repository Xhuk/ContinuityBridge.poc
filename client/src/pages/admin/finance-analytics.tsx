import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Database, 
  Zap, 
  AlertCircle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  BarChart3,
  PieChart,
  Calendar
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function FinanceAnalytics() {
  const [timeframe, setTimeframe] = useState<"month" | "quarter" | "year">("month");

  // Fetch customer licenses for revenue calculation
  const { data: customersData } = useQuery({
    queryKey: ["/api/customer-databases"],
    refetchInterval: 60000, // Every minute
  });

  // Fetch pricing catalog
  const { data: pricingData } = useQuery({
    queryKey: ["/api/pricing-catalog"],
  });

  // Fetch SOW requests for pipeline
  const { data: sowData } = useQuery({
    queryKey: ["/api/change-requests"],
  });

  // Fetch pricing changes for revenue impact
  const { data: changesData } = useQuery({
    queryKey: ["/api/pricing-changes/history"],
  });

  // Calculate metrics
  const customers = customersData?.databases || [];
  const tiers = pricingData?.tiers || [];
  const sowRequests = sowData?.changeRequests?.filter((r: any) => r.requestType === "sow_amendment") || [];
  const pricingChanges = changesData?.changes || [];

  // Revenue calculations
  const activeCustomers = customers.filter((c: any) => c.license?.active);
  const totalMRR = activeCustomers.reduce((acc: number, c: any) => {
    const license = c.license;
    if (!license) return acc;
    
    const basePlatform = license.pricing?.basePlatform || 0;
    const interfaceCost = (license.limits?.maxInterfaces || 0) * (license.pricing?.perInterface || 0);
    const systemCost = (license.limits?.maxSystems || 0) * (license.pricing?.perSystem || 0);
    
    return acc + basePlatform + interfaceCost + systemCost;
  }, 0);

  const totalARR = totalMRR * 12;

  // Pipeline from SOW requests
  const pendingSOW = sowRequests.filter((r: any) => r.status === "pending");
  const approvedSOW = sowRequests.filter((r: any) => r.status === "approved");
  
  const pipelineValue = pendingSOW.reduce((acc: number, r: any) => {
    const changes = r.proposedChanges?.[0]?.sowChanges;
    return acc + (changes?.estimatedMonthlyCostIncrease || 0);
  }, 0);

  // Churn risk
  const grandfatheredCount = pricingChanges.reduce((acc: number, c: any) => acc + (c.grandfatheredCount || 0), 0);

  // Customer segmentation
  const customersByTier = activeCustomers.reduce((acc: any, c: any) => {
    const tier = c.license?.licenseType || "trial";
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});

  // AI Insights
  const aiInsights = generateAIInsights({
    totalMRR,
    activeCustomers: activeCustomers.length,
    pipelineValue,
    grandfatheredCount,
    customersByTier,
    sowRequests,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Finance & Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Revenue metrics, usage analytics, and AI-powered insights
            </p>
          </div>
          <div className="flex gap-2">
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Top KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalMRR.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground flex items-center mt-1">
                <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                +12.5% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Annual Recurring Revenue</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalARR.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                ARR multiple: {(totalARR / totalMRR).toFixed(1)}x
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
              <Users className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCustomers.length}</div>
              <p className="text-xs text-muted-foreground">
                {grandfatheredCount} grandfathered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${pipelineValue.toLocaleString()}/mo</div>
              <p className="text-xs text-muted-foreground">
                {pendingSOW.length} pending upgrades
              </p>
            </CardContent>
          </Card>
        </div>

        {/* AI Insights Section */}
        <Card className="mb-6 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <CardTitle>AI-Powered Insights</CardTitle>
            </div>
            <CardDescription>
              Smart recommendations based on your business metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiInsights.map((insight: any, idx: number) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-white rounded-lg border">
                {insight.type === "opportunity" && <ArrowUpRight className="h-5 w-5 text-green-600 flex-shrink-0" />}
                {insight.type === "warning" && <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0" />}
                {insight.type === "success" && <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />}
                <div className="flex-1">
                  <p className="font-medium text-sm">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                  {insight.action && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      {insight.action}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Detailed Analytics Tabs */}
        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="revenue">Revenue Breakdown</TabsTrigger>
            <TabsTrigger value="customers">Customer Analytics</TabsTrigger>
            <TabsTrigger value="usage">Usage Metrics</TabsTrigger>
            <TabsTrigger value="pipeline">Sales Pipeline</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Tier</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(customersByTier).map(([tier, count]: [string, any]) => {
                    const tierData = tiers.find((t: any) => t.tierName === tier);
                    const tierRevenue = count * ((tierData?.monthlyPriceDollars || 0));
                    const percentage = totalMRR > 0 ? (tierRevenue / totalMRR * 100).toFixed(1) : 0;
                    
                    return (
                      <div key={tier} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="capitalize font-medium">{tier}</span>
                          <span className="text-muted-foreground">
                            {count} customers • ${tierRevenue.toLocaleString()}
                          </span>
                        </div>
                        <Progress value={Number(percentage)} className="h-2" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Average Revenue Per Customer</span>
                    <span className="font-medium">
                      ${activeCustomers.length > 0 ? (totalMRR / activeCustomers.length).toFixed(0) : 0}/mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Customer Lifetime Value (12mo)</span>
                    <span className="font-medium">
                      ${activeCustomers.length > 0 ? ((totalMRR / activeCustomers.length) * 12).toFixed(0) : 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Grandfathered Revenue</span>
                    <span className="font-medium text-orange-600">
                      ~${(grandfatheredCount * 2000).toLocaleString()}/mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Potential Upside (Pipeline)</span>
                    <span className="font-medium text-green-600">
                      +${pipelineValue.toLocaleString()}/mo
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Customer Distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(customersByTier).map(([tier, count]: [string, any]) => (
                    <div key={tier} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{tier}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Grandfathered Customers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-600">{grandfatheredCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeCustomers.length > 0 ? ((grandfatheredCount / activeCustomers.length) * 100).toFixed(1) : 0}% of total
                  </p>
                  <Progress 
                    value={activeCustomers.length > 0 ? (grandfatheredCount / activeCustomers.length) * 100 : 0} 
                    className="h-2 mt-3" 
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Upgrade Potential</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{approvedSOW.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Approved expansions ready to close
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Resource Utilization</CardTitle>
                <CardDescription>
                  Average usage across all customers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {calculateUsageMetrics(activeCustomers).map((metric: any, idx: number) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{metric.label}</span>
                      <span className="text-muted-foreground">
                        {metric.used} / {metric.total} ({metric.percentage}%)
                      </span>
                    </div>
                    <Progress value={metric.percentage} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Sales Pipeline</CardTitle>
                  <CardDescription>
                    SOW amendment requests and expansion opportunities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Pending Requests</p>
                        <p className="text-sm text-muted-foreground">{pendingSOW.length} customers</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-orange-600">
                          ${pipelineValue.toLocaleString()}/mo
                        </p>
                        <p className="text-xs text-muted-foreground">Potential MRR increase</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Approved (Not Closed)</p>
                        <p className="text-sm text-muted-foreground">{approvedSOW.length} customers</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600">
                          ${(approvedSOW.length * 500).toLocaleString()}/mo
                        </p>
                        <p className="text-xs text-muted-foreground">Ready to invoice</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function generateAIInsights(data: any) {
  const insights = [];

  // Revenue growth opportunity
  if (data.pipelineValue > data.totalMRR * 0.1) {
    insights.push({
      type: "opportunity",
      title: "Strong Pipeline Detected",
      description: `You have $${data.pipelineValue.toLocaleString()}/mo in pending upgrades (${((data.pipelineValue / data.totalMRR) * 100).toFixed(0)}% of current MRR). Prioritize closing these deals for ${((data.pipelineValue / data.totalMRR) * 100).toFixed(0)}% revenue growth.`,
      action: "Review pending SOW requests",
    });
  }

  // Grandfathered customers
  if (data.grandfatheredCount > data.activeCustomers * 0.2) {
    insights.push({
      type: "warning",
      title: "High Grandfathered Customer Rate",
      description: `${data.grandfatheredCount} customers (${((data.grandfatheredCount / data.activeCustomers) * 100).toFixed(0)}%) are on old pricing. Consider gradual migration strategy to improve margins.`,
      action: "Plan pricing migration",
    });
  }

  // Tier distribution
  const trialCount = data.customersByTier.trial || 0;
  if (trialCount > data.activeCustomers * 0.3) {
    insights.push({
      type: "opportunity",
      title: "High Trial Conversion Potential",
      description: `${trialCount} customers are on trial plans. Focus on converting them to paid tiers for immediate revenue impact.`,
      action: "Launch trial-to-paid campaign",
    });
  }

  // Professional tier dominance
  const professionalCount = data.customersByTier.professional || 0;
  if (professionalCount > data.activeCustomers * 0.5) {
    insights.push({
      type: "success",
      title: "Strong Professional Tier Adoption",
      description: `${professionalCount} customers are on Professional plans. This indicates product-market fit in the mid-market segment.`,
      action: "Expand professional-tier features",
    });
  }

  // Low enterprise adoption
  const enterpriseCount = data.customersByTier.enterprise || 0;
  if (enterpriseCount < data.activeCustomers * 0.1 && data.activeCustomers > 10) {
    insights.push({
      type: "opportunity",
      title: "Enterprise Expansion Opportunity",
      description: `Only ${enterpriseCount} enterprise customers. Consider dedicated enterprise sales motion for higher ACV deals.`,
      action: "Build enterprise sales playbook",
    });
  }

  return insights;
}

function calculateUsageMetrics(customers: any[]) {
  const totalInterfaces = customers.reduce((acc, c) => acc + (c.license?.limits?.maxInterfaces || 0), 0);
  const totalSystems = customers.reduce((acc, c) => acc + (c.license?.limits?.maxSystems || 0), 0);
  const totalUsers = customers.reduce((acc, c) => acc + (c.license?.limits?.maxUsers || 0), 0);
  const totalFlows = customers.reduce((acc, c) => acc + (c.license?.limits?.maxFlows || 0), 0);

  // Mock usage data (in production, fetch from actual usage metrics)
  const usedInterfaces = Math.floor(totalInterfaces * 0.65);
  const usedSystems = Math.floor(totalSystems * 0.72);
  const usedUsers = Math.floor(totalUsers * 0.48);
  const usedFlows = Math.floor(totalFlows * 0.55);

  return [
    {
      label: "Interfaces",
      used: usedInterfaces,
      total: totalInterfaces,
      percentage: totalInterfaces > 0 ? ((usedInterfaces / totalInterfaces) * 100).toFixed(0) : 0,
    },
    {
      label: "Systems",
      used: usedSystems,
      total: totalSystems,
      percentage: totalSystems > 0 ? ((usedSystems / totalSystems) * 100).toFixed(0) : 0,
    },
    {
      label: "Users",
      used: usedUsers,
      total: totalUsers,
      percentage: totalUsers > 0 ? ((usedUsers / totalUsers) * 100).toFixed(0) : 0,
    },
    {
      label: "Flows",
      used: usedFlows,
      total: totalFlows,
      percentage: totalFlows > 0 ? ((usedFlows / totalFlows) * 100).toFixed(0) : 0,
    },
  ];
}
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Database, 
  Zap, 
  AlertCircle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  BarChart3,
  PieChart,
  Calendar
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function FinanceAnalytics() {
  const [timeframe, setTimeframe] = useState<"month" | "quarter" | "year">("month");

  // Fetch customer licenses for revenue calculation
  const { data: customersData } = useQuery({
    queryKey: ["/api/customer-databases"],
    refetchInterval: 60000, // Every minute
  });

  // Fetch pricing catalog
  const { data: pricingData } = useQuery({
    queryKey: ["/api/pricing-catalog"],
  });

  // Fetch SOW requests for pipeline
  const { data: sowData } = useQuery({
    queryKey: ["/api/change-requests"],
  });

  // Fetch pricing changes for revenue impact
  const { data: changesData } = useQuery({
    queryKey: ["/api/pricing-changes/history"],
  });

  // Calculate metrics
  const customers = customersData?.databases || [];
  const tiers = pricingData?.tiers || [];
  const sowRequests = sowData?.changeRequests?.filter((r: any) => r.requestType === "sow_amendment") || [];
  const pricingChanges = changesData?.changes || [];

  // Revenue calculations
  const activeCustomers = customers.filter((c: any) => c.license?.active);
  const totalMRR = activeCustomers.reduce((acc: number, c: any) => {
    const license = c.license;
    if (!license) return acc;
    
    const basePlatform = license.pricing?.basePlatform || 0;
    const interfaceCost = (license.limits?.maxInterfaces || 0) * (license.pricing?.perInterface || 0);
    const systemCost = (license.limits?.maxSystems || 0) * (license.pricing?.perSystem || 0);
    
    return acc + basePlatform + interfaceCost + systemCost;
  }, 0);

  const totalARR = totalMRR * 12;

  // Pipeline from SOW requests
  const pendingSOW = sowRequests.filter((r: any) => r.status === "pending");
  const approvedSOW = sowRequests.filter((r: any) => r.status === "approved");
  
  const pipelineValue = pendingSOW.reduce((acc: number, r: any) => {
    const changes = r.proposedChanges?.[0]?.sowChanges;
    return acc + (changes?.estimatedMonthlyCostIncrease || 0);
  }, 0);

  // Churn risk
  const grandfatheredCount = pricingChanges.reduce((acc: number, c: any) => acc + (c.grandfatheredCount || 0), 0);

  // Customer segmentation
  const customersByTier = activeCustomers.reduce((acc: any, c: any) => {
    const tier = c.license?.licenseType || "trial";
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});

  // AI Insights
  const aiInsights = generateAIInsights({
    totalMRR,
    activeCustomers: activeCustomers.length,
    pipelineValue,
    grandfatheredCount,
    customersByTier,
    sowRequests,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Finance & Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Revenue metrics, usage analytics, and AI-powered insights
            </p>
          </div>
          <div className="flex gap-2">
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Top KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalMRR.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground flex items-center mt-1">
                <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                +12.5% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Annual Recurring Revenue</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalARR.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                ARR multiple: {(totalARR / totalMRR).toFixed(1)}x
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
              <Users className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCustomers.length}</div>
              <p className="text-xs text-muted-foreground">
                {grandfatheredCount} grandfathered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${pipelineValue.toLocaleString()}/mo</div>
              <p className="text-xs text-muted-foreground">
                {pendingSOW.length} pending upgrades
              </p>
            </CardContent>
          </Card>
        </div>

        {/* AI Insights Section */}
        <Card className="mb-6 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <CardTitle>AI-Powered Insights</CardTitle>
            </div>
            <CardDescription>
              Smart recommendations based on your business metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiInsights.map((insight: any, idx: number) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-white rounded-lg border">
                {insight.type === "opportunity" && <ArrowUpRight className="h-5 w-5 text-green-600 flex-shrink-0" />}
                {insight.type === "warning" && <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0" />}
                {insight.type === "success" && <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />}
                <div className="flex-1">
                  <p className="font-medium text-sm">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                  {insight.action && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      {insight.action}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Detailed Analytics Tabs */}
        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="revenue">Revenue Breakdown</TabsTrigger>
            <TabsTrigger value="customers">Customer Analytics</TabsTrigger>
            <TabsTrigger value="usage">Usage Metrics</TabsTrigger>
            <TabsTrigger value="pipeline">Sales Pipeline</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Tier</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(customersByTier).map(([tier, count]: [string, any]) => {
                    const tierData = tiers.find((t: any) => t.tierName === tier);
                    const tierRevenue = count * ((tierData?.monthlyPriceDollars || 0));
                    const percentage = totalMRR > 0 ? (tierRevenue / totalMRR * 100).toFixed(1) : 0;
                    
                    return (
                      <div key={tier} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="capitalize font-medium">{tier}</span>
                          <span className="text-muted-foreground">
                            {count} customers • ${tierRevenue.toLocaleString()}
                          </span>
                        </div>
                        <Progress value={Number(percentage)} className="h-2" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Average Revenue Per Customer</span>
                    <span className="font-medium">
                      ${activeCustomers.length > 0 ? (totalMRR / activeCustomers.length).toFixed(0) : 0}/mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Customer Lifetime Value (12mo)</span>
                    <span className="font-medium">
                      ${activeCustomers.length > 0 ? ((totalMRR / activeCustomers.length) * 12).toFixed(0) : 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Grandfathered Revenue</span>
                    <span className="font-medium text-orange-600">
                      ~${(grandfatheredCount * 2000).toLocaleString()}/mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Potential Upside (Pipeline)</span>
                    <span className="font-medium text-green-600">
                      +${pipelineValue.toLocaleString()}/mo
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Customer Distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(customersByTier).map(([tier, count]: [string, any]) => (
                    <div key={tier} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{tier}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Grandfathered Customers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-600">{grandfatheredCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeCustomers.length > 0 ? ((grandfatheredCount / activeCustomers.length) * 100).toFixed(1) : 0}% of total
                  </p>
                  <Progress 
                    value={activeCustomers.length > 0 ? (grandfatheredCount / activeCustomers.length) * 100 : 0} 
                    className="h-2 mt-3" 
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Upgrade Potential</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{approvedSOW.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Approved expansions ready to close
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Resource Utilization</CardTitle>
                <CardDescription>
                  Average usage across all customers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {calculateUsageMetrics(activeCustomers).map((metric: any, idx: number) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{metric.label}</span>
                      <span className="text-muted-foreground">
                        {metric.used} / {metric.total} ({metric.percentage}%)
                      </span>
                    </div>
                    <Progress value={metric.percentage} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Sales Pipeline</CardTitle>
                  <CardDescription>
                    SOW amendment requests and expansion opportunities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Pending Requests</p>
                        <p className="text-sm text-muted-foreground">{pendingSOW.length} customers</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-orange-600">
                          ${pipelineValue.toLocaleString()}/mo
                        </p>
                        <p className="text-xs text-muted-foreground">Potential MRR increase</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Approved (Not Closed)</p>
                        <p className="text-sm text-muted-foreground">{approvedSOW.length} customers</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600">
                          ${(approvedSOW.length * 500).toLocaleString()}/mo
                        </p>
                        <p className="text-xs text-muted-foreground">Ready to invoice</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function generateAIInsights(data: any) {
  const insights = [];

  // Revenue growth opportunity
  if (data.pipelineValue > data.totalMRR * 0.1) {
    insights.push({
      type: "opportunity",
      title: "Strong Pipeline Detected",
      description: `You have $${data.pipelineValue.toLocaleString()}/mo in pending upgrades (${((data.pipelineValue / data.totalMRR) * 100).toFixed(0)}% of current MRR). Prioritize closing these deals for ${((data.pipelineValue / data.totalMRR) * 100).toFixed(0)}% revenue growth.`,
      action: "Review pending SOW requests",
    });
  }

  // Grandfathered customers
  if (data.grandfatheredCount > data.activeCustomers * 0.2) {
    insights.push({
      type: "warning",
      title: "High Grandfathered Customer Rate",
      description: `${data.grandfatheredCount} customers (${((data.grandfatheredCount / data.activeCustomers) * 100).toFixed(0)}%) are on old pricing. Consider gradual migration strategy to improve margins.`,
      action: "Plan pricing migration",
    });
  }

  // Tier distribution
  const trialCount = data.customersByTier.trial || 0;
  if (trialCount > data.activeCustomers * 0.3) {
    insights.push({
      type: "opportunity",
      title: "High Trial Conversion Potential",
      description: `${trialCount} customers are on trial plans. Focus on converting them to paid tiers for immediate revenue impact.`,
      action: "Launch trial-to-paid campaign",
    });
  }

  // Professional tier dominance
  const professionalCount = data.customersByTier.professional || 0;
  if (professionalCount > data.activeCustomers * 0.5) {
    insights.push({
      type: "success",
      title: "Strong Professional Tier Adoption",
      description: `${professionalCount} customers are on Professional plans. This indicates product-market fit in the mid-market segment.`,
      action: "Expand professional-tier features",
    });
  }

  // Low enterprise adoption
  const enterpriseCount = data.customersByTier.enterprise || 0;
  if (enterpriseCount < data.activeCustomers * 0.1 && data.activeCustomers > 10) {
    insights.push({
      type: "opportunity",
      title: "Enterprise Expansion Opportunity",
      description: `Only ${enterpriseCount} enterprise customers. Consider dedicated enterprise sales motion for higher ACV deals.`,
      action: "Build enterprise sales playbook",
    });
  }

  return insights;
}

function calculateUsageMetrics(customers: any[]) {
  const totalInterfaces = customers.reduce((acc, c) => acc + (c.license?.limits?.maxInterfaces || 0), 0);
  const totalSystems = customers.reduce((acc, c) => acc + (c.license?.limits?.maxSystems || 0), 0);
  const totalUsers = customers.reduce((acc, c) => acc + (c.license?.limits?.maxUsers || 0), 0);
  const totalFlows = customers.reduce((acc, c) => acc + (c.license?.limits?.maxFlows || 0), 0);

  // Mock usage data (in production, fetch from actual usage metrics)
  const usedInterfaces = Math.floor(totalInterfaces * 0.65);
  const usedSystems = Math.floor(totalSystems * 0.72);
  const usedUsers = Math.floor(totalUsers * 0.48);
  const usedFlows = Math.floor(totalFlows * 0.55);

  return [
    {
      label: "Interfaces",
      used: usedInterfaces,
      total: totalInterfaces,
      percentage: totalInterfaces > 0 ? ((usedInterfaces / totalInterfaces) * 100).toFixed(0) : 0,
    },
    {
      label: "Systems",
      used: usedSystems,
      total: totalSystems,
      percentage: totalSystems > 0 ? ((usedSystems / totalSystems) * 100).toFixed(0) : 0,
    },
    {
      label: "Users",
      used: usedUsers,
      total: totalUsers,
      percentage: totalUsers > 0 ? ((usedUsers / totalUsers) * 100).toFixed(0) : 0,
    },
    {
      label: "Flows",
      used: usedFlows,
      total: totalFlows,
      percentage: totalFlows > 0 ? ((usedFlows / totalFlows) * 100).toFixed(0) : 0,
    },
  ];
}
