import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, AlertCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function SOWRequests() {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);

  // Fetch all SOW change requests
  const { data: requestsData, isLoading } = useQuery({
    queryKey: ["/api/change-requests"],
    refetchInterval: 10000, // Poll every 10 seconds
  });

  const requests = requestsData?.changeRequests || [];
  const sowRequests = requests.filter((r: any) => r.requestType === "sow_amendment");

  const pendingRequests = sowRequests.filter((r: any) => r.status === "pending" || r.status === "reviewing");
  const approvedRequests = sowRequests.filter((r: any) => r.status === "approved");
  const rejectedRequests = sowRequests.filter((r: any) => r.status === "rejected");

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-semibold">SOW Amendment Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve customer requests for additional interfaces and systems
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="pending">
          <TabsList>
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

          <TabsContent value="pending" className="mt-4">
            <div className="grid gap-4">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No pending SOW requests
                </div>
              ) : (
                pendingRequests.map((request: any) => (
                  <SOWRequestCard
                    key={request.id}
                    request={request}
                    onReview={(req) => {
                      setSelectedRequest(req);
                      setIsReviewDialogOpen(true);
                    }}
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="approved" className="mt-4">
            <div className="grid gap-4">
              {approvedRequests.map((request: any) => (
                <SOWRequestCard key={request.id} request={request} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="rejected" className="mt-4">
            <div className="grid gap-4">
              {rejectedRequests.map((request: any) => (
                <SOWRequestCard key={request.id} request={request} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {selectedRequest && (
        <ReviewDialog
          request={selectedRequest}
          open={isReviewDialogOpen}
          onOpenChange={setIsReviewDialogOpen}
          onSuccess={() => {
            setIsReviewDialogOpen(false);
            setSelectedRequest(null);
          }}
        />
      )}
    </div>
  );
}

function SOWRequestCard({ request, onReview }: { request: any; onReview?: (req: any) => void }) {
  const sowChanges = request.proposedChanges?.[0]?.sowChanges;
  const aiSuggestions = request.proposedChanges?.[0]?.aiSuggestions;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "reviewing":
        return <Badge className="bg-blue-100 text-blue-800"><AlertCircle className="h-3 w-3 mr-1" />Reviewing</Badge>;
      case "approved":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{request.organizationName}</CardTitle>
            <CardDescription>{request.title}</CardDescription>
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

        {aiSuggestions && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <p className="text-sm font-medium text-green-900">AI Recommendation</p>
            </div>
            <p className="text-sm text-green-800">{aiSuggestions.costOptimization}</p>
            <p className="text-xs text-green-700 mt-1">
              Confidence: {Math.round(aiSuggestions.confidence * 100)}%
            </p>
          </div>
        )}

        {sowChanges?.estimatedMonthlyCostIncrease && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Monthly Cost Increase:</span>
            <span className="font-medium text-green-600">
              +${sowChanges.estimatedMonthlyCostIncrease}/month
            </span>
          </div>
        )}

        {onReview && request.status === "pending" && (
          <Button onClick={() => onReview(request)} className="w-full">
            Review Request
          </Button>
        )}

        {request.reviewNotes && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900 mb-1">Review Notes</p>
            <p className="text-sm text-gray-700">{request.reviewNotes}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Reviewed by {request.reviewedByEmail} on {new Date(request.reviewedAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewDialog({ request, open, onOpenChange, onSuccess }: {
  request: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [reviewNotes, setReviewNotes] = useState("");

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/change-requests/${request.id}/approve-sow`, {
        reviewNotes,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "SOW Amendment Approved",
        description: `License updated: ${data.updatedLimits.maxInterfaces} interfaces, ${data.updatedLimits.maxSystems} systems`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/change-requests/${request.id}/reject`, {
        reviewNotes,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Request Rejected",
        description: "Customer will be notified via email",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sowChanges = request.proposedChanges?.[0]?.sowChanges;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review SOW Amendment Request</DialogTitle>
          <DialogDescription>
            {request.organizationName} - {request.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Current Interfaces</p>
                <p className="text-lg font-medium">{sowChanges?.currentInterfaces}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Requested Interfaces</p>
                <p className="text-lg font-medium text-green-600">{sowChanges?.requestedInterfaces}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Systems</p>
                <p className="text-lg font-medium">{sowChanges?.currentSystems}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Requested Systems</p>
                <p className="text-lg font-medium text-green-600">{sowChanges?.requestedSystems}</p>
              </div>
            </div>
          </div>

          <div>
            <Label>Business Justification</Label>
            <p className="text-sm text-muted-foreground mt-1">
              {sowChanges?.businessJustification}
            </p>
          </div>

          <div>
            <Label htmlFor="reviewNotes">Review Notes</Label>
            <Textarea
              id="reviewNotes"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Add notes about your decision..."
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => rejectMutation.mutate()}
              disabled={!reviewNotes || approveMutation.isPending || rejectMutation.isPending}
            >
              <XCircle className="h-4 w-4 mr-2" />
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {approveMutation.isPending ? "Approving..." : "Approve & Update License"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
