import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, DollarSign, TrendingUp, AlertCircle, CheckCircle, Clock, MessageSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function SalesDashboard() {
  const [selectedChange, setSelectedChange] = useState<any>(null);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);

  // Fetch pricing changes
  const { data: changesData, isLoading } = useQuery({
    queryKey: ["/api/pricing-changes/history"],
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Fetch SOW requests
  const { data: sowData } = useQuery({
    queryKey: ["/api/change-requests"],
    refetchInterval: 10000,
  });

  const pricingChanges = changesData?.changes || [];
  const pendingChanges = pricingChanges.filter((c: any) => c.status === "pending" || c.status === "sales_notified");
  const sowRequests = sowData?.changeRequests?.filter((r: any) => r.requestType === "sow_amendment" && r.status === "approved") || [];

  // Calculate metrics
  const totalAffectedCustomers = pendingChanges.reduce((acc: number, c: any) => acc + (c.totalAffectedCustomers || 0), 0);
  const totalGrandfathered = pendingChanges.reduce((acc: number, c: any) => acc + (c.grandfatheredCount || 0), 0);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-semibold">Sales Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track pricing changes, customer outreach, and SOW amendments
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingChanges.length}</div>
              <p className="text-xs text-muted-foreground">Pricing changes requiring outreach</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Affected Customers</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAffectedCustomers}</div>
              <p className="text-xs text-muted-foreground">{totalGrandfathered} grandfathered</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SOW Amendments</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sowRequests.length}</div>
              <p className="text-xs text-muted-foreground">Approved upgrades to discuss</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue Opportunity</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$0</div>
              <p className="text-xs text-muted-foreground">From pending upgrades</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="pricing-changes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pricing-changes">
              Pricing Changes ({pendingChanges.length})
            </TabsTrigger>
            <TabsTrigger value="sow-amendments">
              SOW Amendments ({sowRequests.length})
            </TabsTrigger>
            <TabsTrigger value="my-accounts">
              My Accounts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pricing-changes" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : pendingChanges.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <p className="text-muted-foreground">No pending pricing changes</p>
                </CardContent>
              </Card>
            ) : (
              pendingChanges.map((change: any) => (
                <PricingChangeCard
                  key={change.id}
                  change={change}
                  onViewDetails={(c) => {
                    setSelectedChange(c);
                    setIsNotesDialogOpen(true);
                  }}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="sow-amendments" className="space-y-4">
            {sowRequests.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-muted-foreground">No SOW amendments to discuss</p>
                </CardContent>
              </Card>
            ) : (
              sowRequests.map((request: any) => (
                <SOWAmendmentCard key={request.id} request={request} />
              ))
            )}
          </TabsContent>

          <TabsContent value="my-accounts">
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">Account assignment coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Notes Dialog */}
      <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Outreach Details</DialogTitle>
            <DialogDescription>
              Track communication and assign sales reps
            </DialogDescription>
          </DialogHeader>
          {selectedChange && <PricingChangeDetails change={selectedChange} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PricingChangeCard({ change, onViewDetails }: { change: any; onViewDetails: (c: any) => void }) {
  const changeTypeColors = {
    price_increase: "bg-red-100 text-red-800",
    price_decrease: "bg-green-100 text-green-800",
    limit_change: "bg-blue-100 text-blue-800",
    feature_change: "bg-purple-100 text-purple-800",
  };

  const changeTypeLabels = {
    price_increase: "Price Increase",
    price_decrease: "Price Decrease",
    limit_change: "Limit Change",
    feature_change: "Feature Change",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{change.catalogTierName} Plan</CardTitle>
            <CardDescription className="mt-1">{change.changeDescription}</CardDescription>
          </div>
          <Badge className={changeTypeColors[change.changeType as keyof typeof changeTypeColors]}>
            {changeTypeLabels[change.changeType as keyof typeof changeTypeLabels]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Change Type</p>
            <p className="font-medium capitalize">{change.priceChangeDirection || "Update"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Price Change</p>
            <p className="font-medium text-orange-600">
              {change.priceChangePercentage ? `${change.priceChangePercentage}%` : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Tier</p>
            <p className="font-medium">{change.catalogTierName}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{change.totalAffectedCustomers} customers affected</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span>{change.grandfatheredCount} grandfathered</span>
          </div>
        </div>

        {change.salesTeamNotified ? (
          <Badge variant="outline" className="bg-green-50">
            <CheckCircle className="h-3 w-3 mr-1" />
            Notified {new Date(change.salesTeamNotifiedAt).toLocaleDateString()}
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-yellow-50">
            <Clock className="h-3 w-3 mr-1" />
            Pending Notification
          </Badge>
        )}

        <Button onClick={() => onViewDetails(change)} className="w-full">
          <MessageSquare className="h-4 w-4 mr-2" />
          View Customer List & Add Notes
        </Button>
      </CardContent>
    </Card>
  );
}

function PricingChangeDetails({ change }: { change: any }) {
  const [notes, setNotes] = useState(change.salesNotes || "");

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-medium">Affected Customers</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {change.affectedCustomers?.map((customer: any, idx: number) => (
            <Card key={idx}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{customer.organizationName}</p>
                    <p className="text-sm text-muted-foreground">{customer.organizationId}</p>
                  </div>
                  {customer.grandfathered && (
                    <Badge variant="outline" className="bg-green-50">
                      Grandfathered
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium">
                      {customer.grandfathered ? "Protected at current pricing" : "Will receive new pricing"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Contact</p>
                    <p className="font-medium text-sm">
                      {customer.deploymentContactName || "No contact"}
                      {customer.deploymentContactEmail && (
                        <span className="text-muted-foreground ml-2">({customer.deploymentContactEmail})</span>
                      )}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Assigned To</p>
                    <select className="mt-1 w-full border rounded px-2 py-1">
                      <option value="">Unassigned</option>
                      <option value="rep1">Sales Rep 1</option>
                      <option value="rep2">Sales Rep 2</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <h3 className="font-medium">Sales Team Notes</h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about customer outreach, objections, successful conversations, etc."
          rows={4}
        />
        <Button className="w-full">
          <CheckCircle className="h-4 w-4 mr-2" />
          Save Notes
        </Button>
      </div>
    </div>
  );
}

function SOWAmendmentCard({ request }: { request: any }) {
  const sowChanges = request.proposedChanges?.[0]?.sowChanges;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{request.organizationName}</CardTitle>
            <CardDescription className="mt-1">Approved SOW Amendment</CardDescription>
          </div>
          <Badge variant="outline" className="bg-green-100 text-green-800">
            Approved
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Interfaces</p>
            <p className="font-medium">
              {sowChanges?.currentInterfaces} → {sowChanges?.requestedInterfaces}
              <span className="text-green-600 ml-2">
                (+{(sowChanges?.requestedInterfaces || 0) - (sowChanges?.currentInterfaces || 0)})
              </span>
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Systems</p>
            <p className="font-medium">
              {sowChanges?.currentSystems} → {sowChanges?.requestedSystems}
              <span className="text-green-600 ml-2">
                (+{(sowChanges?.requestedSystems || 0) - (sowChanges?.currentSystems || 0)})
              </span>
            </p>
          </div>
        </div>

        <div className="p-3 bg-blue-50 rounded-lg text-sm">
          <p className="font-medium">💡 Sales Opportunity</p>
          <p className="text-muted-foreground mt-1">
            Customer has been approved for expansion. Contact them to finalize contract amendment.
          </p>
        </div>

        <Button variant="outline" className="w-full">
          <MessageSquare className="h-4 w-4 mr-2" />
          Contact Customer
        </Button>
      </CardContent>
    </Card>
  );
}
