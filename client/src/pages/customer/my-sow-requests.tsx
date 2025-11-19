import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle, XCircle, TrendingUp, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MySOWRequests() {
  const { data: requestsData, isLoading } = useQuery({
    queryKey: ["/api/change-requests"],
    refetchInterval: 10000,
  });

  const requests = requestsData?.changeRequests || [];
  const sowRequests = requests.filter((r: any) => r.requestType === "sow_amendment");

  const pendingRequests = sowRequests.filter((r: any) => r.status === "pending" || r.status === "reviewing");
  const approvedRequests = sowRequests.filter((r: any) => r.status === "approved");
  const rejectedRequests = sowRequests.filter((r: any) => r.status === "rejected");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending Review
          </Badge>
        );
      case "reviewing":
        return (
          <Badge className="gap-1 bg-blue-500">
            <AlertCircle className="h-3 w-3" />
            Under Review
          </Badge>
        );
      case "approved":
        return (
          <Badge className="gap-1 bg-green-500">
            <CheckCircle className="h-3 w-3" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-semibold">My SOW Amendment Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your requests for additional interfaces and systems
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading requests...</div>
        ) : sowRequests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No SOW amendment requests yet</p>
            <p className="text-xs mt-2">
              You can request additional resources from the Interfaces page when you reach your limit
            </p>
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">
                All ({sowRequests.length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({pendingRequests.length})
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved ({approvedRequests.length})
              </TabsTrigger>
              <TabsTrigger value="rejected">
                Rejected ({rejectedRequests.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <div className="grid gap-4">
                {sowRequests.map((request: any) => (
                  <SOWRequestCard key={request.id} request={request} getStatusBadge={getStatusBadge} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="pending" className="mt-4">
              <div className="grid gap-4">
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No pending requests
                  </div>
                ) : (
                  pendingRequests.map((request: any) => (
                    <SOWRequestCard key={request.id} request={request} getStatusBadge={getStatusBadge} />
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="approved" className="mt-4">
              <div className="grid gap-4">
                {approvedRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No approved requests
                  </div>
                ) : (
                  approvedRequests.map((request: any) => (
                    <SOWRequestCard key={request.id} request={request} getStatusBadge={getStatusBadge} />
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="rejected" className="mt-4">
              <div className="grid gap-4">
                {rejectedRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No rejected requests
                  </div>
                ) : (
                  rejectedRequests.map((request: any) => (
                    <SOWRequestCard key={request.id} request={request} getStatusBadge={getStatusBadge} />
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function SOWRequestCard({ request, getStatusBadge }: { request: any; getStatusBadge: (status: string) => JSX.Element }) {
  const sowChanges = request.proposedChanges?.[0]?.sowChanges;
  const aiSuggestions = request.proposedChanges?.[0]?.aiSuggestions;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{request.title}</CardTitle>
            <CardDescription>
              Requested on {new Date(request.createdAt).toLocaleDateString()}
            </CardDescription>
          </div>
          {getStatusBadge(request.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sowChanges && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-muted-foreground mb-1">Interfaces</p>
              <p className="font-medium">
                {sowChanges.currentInterfaces} → {sowChanges.requestedInterfaces}
                <span className="text-green-600 ml-2">
                  (+{sowChanges.requestedInterfaces - sowChanges.currentInterfaces})
                </span>
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-muted-foreground mb-1">Systems</p>
              <p className="font-medium">
                {sowChanges.currentSystems} → {sowChanges.requestedSystems}
                <span className="text-green-600 ml-2">
                  (+{sowChanges.requestedSystems - sowChanges.currentSystems})
                </span>
              </p>
            </div>
          </div>
        )}

        {sowChanges?.businessJustification && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-1">Business Justification</p>
            <p className="text-sm text-blue-800">{sowChanges.businessJustification}</p>
          </div>
        )}

        {aiSuggestions?.costOptimization && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <p className="text-sm font-medium text-green-900">AI Recommendation</p>
            </div>
            <p className="text-sm text-green-800">{aiSuggestions.costOptimization}</p>
          </div>
        )}

        {request.status === "approved" && request.reviewedAt && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-900">
              Approved by {request.reviewedByEmail || "Founder"}
            </p>
            <p className="text-xs text-green-700 mt-1">
              {new Date(request.reviewedAt).toLocaleString()}
            </p>
            {request.reviewNotes && (
              <p className="text-sm text-green-800 mt-2">{request.reviewNotes}</p>
            )}
          </div>
        )}

        {request.status === "rejected" && request.reviewNotes && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-900">Rejection Reason</p>
            <p className="text-sm text-red-800 mt-1">{request.reviewNotes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
