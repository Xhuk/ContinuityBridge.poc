import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCw, Play, AlertCircle } from "lucide-react";
import { useState } from "react";
import type { Event } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function Events() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const limit = 20;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events", page],
    refetchInterval: 5000,
  });

  const replayMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            mutation ReplayEvent($id: ID!) {
              replayEvent(id: $id)
            }
          `,
          variables: { id: eventId },
        }),
      });

      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0]?.message || "Replay failed");
      }
      return result.data.replayEvent;
    },
    onSuccess: () => {
      toast({
        title: "Event Replayed",
        description: "The event has been re-enqueued for processing",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Replay Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReplay = (eventId: string) => {
    if (replayMutation.isPending) return;
    replayMutation.mutate(eventId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading events...</div>
      </div>
    );
  }

  const totalEvents = events?.length || 0;
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, totalEvents);
  
  // Apply status filter
  const filteredEvents = statusFilter 
    ? events?.filter(e => e.status === statusFilter) || []
    : events || [];
  
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex);
  const failedCount = events?.filter(e => e.status === "failed").length || 0;

  return (
    <div className="px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-events">
            Events
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and replay processing events
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={statusFilter === "failed" ? "default" : "outline"}
            onClick={() => setStatusFilter(statusFilter === "failed" ? null : "failed")}
            className="relative"
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Failed Events
            {failedCount > 0 && (
              <Badge className="ml-2 bg-red-600 text-white">{failedCount}</Badge>
            )}
          </Button>
          <Button 
            variant="outline" 
            data-testid="button-replay-all"
            onClick={() => {
              if (statusFilter === "failed" && filteredEvents.length > 0) {
                // Replay all failed events
                filteredEvents.forEach(event => handleReplay(event.id));
              }
            }}
            disabled={statusFilter !== "failed" || replayMutation.isPending}
          >
            <RotateCw className="h-4 w-4 mr-2" />
            Replay All Failed
          </Button>
        </div>
      </div>

      <Card className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left">
                  Trace ID
                </th>
                <th className="font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left">
                  SKU
                </th>
                <th className="font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left">
                  Warehouse
                </th>
                <th className="font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left">
                  Reason
                </th>
                <th className="font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left">
                  Status
                </th>
                <th className="font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left">
                  Timestamp
                </th>
                <th className="font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-muted-foreground text-sm">No events found</div>
                      <div className="text-xs text-muted-foreground">
                        Events will appear here after processing
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedEvents.map((event, index) => (
                  <tr
                    key={event.id}
                    className="border-b last:border-b-0 hover-elevate"
                    data-testid={`row-event-${index}`}
                  >
                    <td className="py-3 px-4 text-sm font-mono" data-testid={`text-trace-${index}`}>
                      {event.traceId}
                    </td>
                    <td className="py-3 px-4 text-sm">{event.sku}</td>
                    <td className="py-3 px-4 text-sm">
                      <div>{event.warehouse}</div>
                      <div className="text-xs text-muted-foreground">{event.warehouseId}</div>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground max-w-xs truncate">
                      {event.reason}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <Badge
                        className={`${statusColors[event.status]} rounded-full px-3 py-1 text-xs font-medium`}
                      >
                        {event.status}
                      </Badge>
                      {event.retryCount !== undefined && event.retryCount > 0 && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {event.retryCount} retries
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <Button
                        size="icon"
                        variant={event.status === "failed" ? "destructive" : "ghost"}
                        onClick={() => handleReplay(event.id)}
                        disabled={replayMutation.isPending}
                        data-testid={`button-replay-${index}`}
                        title={event.status === "failed" ? "Replay failed event" : "Replay event"}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalEvents > limit && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{endIndex} of {totalEvents} events
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={endIndex >= totalEvents}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
