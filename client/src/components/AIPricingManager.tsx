import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, DollarSign, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface PricingTier {
  id: string;
  teamId: string;
  teamName: string;
  tokensPerBillingUnit: number;
  pricePerUnit: number;
  currency: string;
  isActive: boolean;
  isDefault: boolean;
  description?: string;
  pricePerToken: number;
  formattedRate: string;
}

export function AIPricingManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<PricingTier | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    teamId: "",
    teamName: "",
    tokensPerBillingUnit: 10000,
    pricePerUnit: 400,
    description: "",
    isDefault: false,
  });

  // Fetch pricing tiers
  const { data: tiersData, isLoading } = useQuery({
    queryKey: ["/api/ai/pricing-tiers"],
    refetchInterval: 30000,
  });

  // Create tier mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/ai/pricing-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create pricing tier");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/pricing-tiers"] });
      toast({
        title: "Pricing Tier Created",
        description: `Successfully created pricing tier "${formData.teamName}"`,
      });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update tier mutation
  const updateMutation = useMutation({
    mutationFn: async ({ teamId, updates }: { teamId: string; updates: any }) => {
      const res = await fetch(`/api/ai/pricing-tiers/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update pricing tier");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/pricing-tiers"] });
      toast({
        title: "Pricing Tier Updated",
        description: "Successfully updated pricing tier",
      });
      setIsDialogOpen(false);
      setEditingTier(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete tier mutation
  const deleteMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await fetch(`/api/ai/pricing-tiers/${teamId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete pricing tier");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/pricing-tiers"] });
      toast({
        title: "Pricing Tier Deleted",
        description: "Successfully deleted pricing tier",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      teamId: "",
      teamName: "",
      tokensPerBillingUnit: 10000,
      pricePerUnit: 400,
      description: "",
      isDefault: false,
    });
    setEditingTier(null);
  };

  const handleCreate = () => {
    setEditingTier(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (tier: PricingTier) => {
    setEditingTier(tier);
    setFormData({
      teamId: tier.teamId,
      teamName: tier.teamName,
      tokensPerBillingUnit: tier.tokensPerBillingUnit,
      pricePerUnit: tier.pricePerUnit,
      description: tier.description || "",
      isDefault: tier.isDefault,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingTier) {
      // Update existing tier
      updateMutation.mutate({
        teamId: editingTier.teamId,
        updates: {
          teamName: formData.teamName,
          tokensPerBillingUnit: formData.tokensPerBillingUnit,
          pricePerUnit: formData.pricePerUnit,
          description: formData.description,
          isDefault: formData.isDefault,
        },
      });
    } else {
      // Create new tier
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (teamId: string) => {
    if (confirm("Are you sure you want to delete this pricing tier?")) {
      deleteMutation.mutate(teamId);
    }
  };

  const handleToggleActive = (tier: PricingTier) => {
    updateMutation.mutate({
      teamId: tier.teamId,
      updates: { isActive: !tier.isActive },
    });
  };

  const tiers = tiersData?.tiers || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Pricing Tiers Management</h3>
          <p className="text-sm text-muted-foreground">
            Configure different pricing models per consultant team
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Pricing Tier
        </Button>
      </div>

      {/* Pricing Tiers List */}
      {isLoading ? (
        <div className="text-muted-foreground">Loading pricing tiers...</div>
      ) : tiers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Pricing Tiers</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first pricing tier to start tracking costs per team
            </p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Pricing Tier
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier: PricingTier) => (
            <Card key={tier.id} className={!tier.isActive ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{tier.teamName}</CardTitle>
                    <CardDescription className="mt-1">
                      Team ID: {tier.teamId}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {tier.isDefault && (
                      <Badge variant="default" className="bg-purple-600">
                        Default
                      </Badge>
                    )}
                    {tier.isActive ? (
                      <Badge variant="default" className="bg-green-600">
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <X className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Pricing Display */}
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-green-600">
                    ${tier.pricePerUnit}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    per {tier.tokensPerBillingUnit.toLocaleString()} tokens
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    ${tier.pricePerToken.toFixed(4)} per token
                  </div>
                </div>

                {tier.description && (
                  <p className="text-sm text-muted-foreground">
                    {tier.description}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(tier)}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(tier)}
                  >
                    {tier.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  {!tier.isDefault && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(tier.teamId)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingTier ? "Edit Pricing Tier" : "Create New Pricing Tier"}
            </DialogTitle>
            <DialogDescription>
              Configure pricing model for a consultant team
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="teamId">Team ID *</Label>
              <Input
                id="teamId"
                placeholder="e.g., consultant-team-1"
                value={formData.teamId}
                onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                disabled={!!editingTier} // Can't change ID on edit
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for this team
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teamName">Team Name *</Label>
              <Input
                id="teamName"
                placeholder="e.g., Consultant Team 1"
                value={formData.teamName}
                onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tokensPerBillingUnit">Tokens per Unit *</Label>
                <Input
                  id="tokensPerBillingUnit"
                  type="number"
                  min="1"
                  placeholder="10000"
                  value={formData.tokensPerBillingUnit}
                  onChange={(e) =>
                    setFormData({ ...formData, tokensPerBillingUnit: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pricePerUnit">Price per Unit ($) *</Label>
                <Input
                  id="pricePerUnit"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="400.00"
                  value={formData.pricePerUnit}
                  onChange={(e) =>
                    setFormData({ ...formData, pricePerUnit: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            {/* Price Preview */}
            {formData.tokensPerBillingUnit > 0 && formData.pricePerUnit > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Pricing Preview:</p>
                <p className="text-lg font-bold text-green-600">
                  ${formData.pricePerUnit} per {formData.tokensPerBillingUnit.toLocaleString()} tokens
                </p>
                <p className="text-xs text-muted-foreground">
                  = ${(formData.pricePerUnit / formData.tokensPerBillingUnit).toFixed(4)} per token
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
              <Label htmlFor="isDefault">Set as default pricing tier</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.teamId ||
                !formData.teamName ||
                formData.tokensPerBillingUnit <= 0 ||
                formData.pricePerUnit <= 0 ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {editingTier ? "Update" : "Create"} Pricing Tier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
