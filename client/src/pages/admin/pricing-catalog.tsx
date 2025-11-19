import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, DollarSign, CheckCircle, Package, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

// Helper function to format a single tier for WhatsApp
function formatTierForWhatsApp(tier: any): string {
  const monthlyPrice = tier.monthlyPriceDollars?.toLocaleString() || 0;
  const annualPrice = tier.annualPriceDollars?.toLocaleString() || 0;
  const annualDiscount = tier.monthlyPriceDollars 
    ? Math.round((1 - tier.annualPriceDollars / (tier.monthlyPriceDollars * 12)) * 100)
    : 0;

  const maxInterfaces = tier.maxInterfaces === 999999 ? "Unlimited" : tier.maxInterfaces;
  const maxSystems = tier.maxSystems === 999999 ? "Unlimited" : tier.maxSystems;
  const maxUsers = tier.maxUsers === 999999 ? "Unlimited" : tier.maxUsers;
  const maxFlows = tier.maxFlows === 999999 ? "Unlimited" : tier.maxFlows;

  let text = `*${tier.displayName}*\n`;
  text += `💰 *Pricing*\n`;
  text += `   • Monthly: $${monthlyPrice}\n`;
  text += `   • Annual: $${annualPrice}${annualDiscount > 0 ? ` (Save ${annualDiscount}%)` : ""}\n`;
  text += `\n`;
  text += `📦 *Included Resources*\n`;
  text += `   • Interfaces: ${maxInterfaces}\n`;
  text += `   • Systems: ${maxSystems}\n`;
  text += `   • Users: ${maxUsers}\n`;
  text += `   • Flows: ${maxFlows}\n`;
  
  if (tier.extraInterfacePriceDollars || tier.extraSystemPriceDollars) {
    text += `\n`;
    text += `➕ *Add-ons*\n`;
    if (tier.extraInterfacePriceDollars) {
      text += `   • Extra Interface: $${tier.extraInterfacePriceDollars}/mo\n`;
    }
    if (tier.extraSystemPriceDollars) {
      text += `   • Extra System: $${tier.extraSystemPriceDollars}/mo\n`;
    }
  }

  if (tier.description) {
    text += `\n📝 ${tier.description}`;
  }

  return text;
}

// Helper function to format all tiers for WhatsApp
function formatAllTiersForWhatsApp(tiers: any[]): string {
  let text = `🚀 *ContinuityBridge Pricing Plans*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  tiers.forEach((tier, index) => {
    text += formatTierForWhatsApp(tier);
    if (index < tiers.length - 1) {
      text += `

━━━━━━━━━━━━━━━━━━━━━━

`;
    }
  });

  text += `\n\n📞 Contact us for custom enterprise solutions!`;
  return text;
}

export default function PricingCatalog() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<any>(null);

  // Fetch pricing tiers
  const { data: tiersData, isLoading } = useQuery({
    queryKey: ["/api/pricing-catalog"],
  });

  const tiers = tiersData?.tiers || [];

  // Seed default tiers
  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pricing-catalog/seed");
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Default Tiers Seeded",
        description: "Starter, Professional, and Enterprise tiers have been created/updated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-catalog"] });
    },
    onError: (error: any) => {
      toast({
        title: "Seed Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (tier: any) => {
    setEditingTier(tier);
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingTier(null);
    setIsDialogOpen(true);
  };

  const copyAllTiersToClipboard = (tiers: any[]) => {
    const sortedTiers = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
    const formattedText = formatAllTiersForWhatsApp(sortedTiers);
    
    navigator.clipboard.writeText(formattedText).then(() => {
      toast({
        title: "Copied to Clipboard!",
        description: `${tiers.length} pricing plans ready to share on WhatsApp`,
      });
    }).catch((err) => {
      toast({
        title: "Copy Failed",
        description: "Please try again",
        variant: "destructive",
      });
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Pricing Catalog</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure pricing tiers and add-on costs for customer licenses
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => copyAllTiersToClipboard(tiers)}>
              <Copy className="h-4 w-4 mr-2" />
              Copy All Plans
            </Button>
            <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Package className="h-4 w-4 mr-2" />
              {seedMutation.isPending ? "Seeding..." : "Seed Default Tiers"}
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Pricing Tier
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingTier ? "Edit Pricing Tier" : "Add Pricing Tier"}</DialogTitle>
                  <DialogDescription>
                    Configure pricing, limits, and features for this tier
                  </DialogDescription>
                </DialogHeader>
                <PricingTierForm
                  tier={editingTier}
                  onSuccess={() => {
                    setIsDialogOpen(false);
                    setEditingTier(null);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading pricing tiers...</div>
        ) : tiers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No pricing tiers configured</p>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Package className="h-4 w-4 mr-2" />
              Seed Default Tiers
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier: any) => (
              <PricingTierCard key={tier.id} tier={tier} onEdit={() => handleEdit(tier)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PricingTierCard({ tier, onEdit }: { tier: any; onEdit: () => void }) {
  const { toast } = useToast();

  const copyTierToClipboard = () => {
    const formattedText = formatTierForWhatsApp(tier);
    
    navigator.clipboard.writeText(formattedText).then(() => {
      toast({
        title: "Copied to Clipboard!",
        description: `${tier.displayName} plan ready to share`,
      });
    }).catch((err) => {
      toast({
        title: "Copy Failed",
        description: "Please try again",
        variant: "destructive",
      });
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/pricing-catalog/${tier.tierName}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Tier Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-catalog"] });
    },
    onError: (error: any) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card className={!tier.isActive ? "opacity-60" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{tier.displayName}</CardTitle>
            <CardDescription className="text-xs mt-1">{tier.tierName}</CardDescription>
          </div>
          <div className="flex gap-1">
            {tier.isActive && <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>}
            {tier.isPublic && <Badge variant="outline">Public</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-2 mb-1">
            <DollarSign className="h-5 w-5 text-green-600" />
            <span className="text-3xl font-bold text-green-600">
              {tier.monthlyPriceDollars?.toLocaleString() || 0}
            </span>
            <span className="text-muted-foreground">/month</span>
          </div>
          <p className="text-sm text-muted-foreground">
            ${tier.annualPriceDollars?.toLocaleString() || 0}/year
          </p>
        </div>

        {tier.description && (
          <p className="text-sm text-muted-foreground">{tier.description}</p>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Max Interfaces:</span>
            <span className="font-medium">
              {tier.maxInterfaces === 999999 ? "Unlimited" : tier.maxInterfaces}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Max Systems:</span>
            <span className="font-medium">
              {tier.maxSystems === 999999 ? "Unlimited" : tier.maxSystems}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Max Users:</span>
            <span className="font-medium">
              {tier.maxUsers === 999999 ? "Unlimited" : tier.maxUsers}
            </span>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground border-t pt-3">
          <div className="flex justify-between">
            <span>Extra Interface:</span>
            <span className="font-medium">${tier.extraInterfacePriceDollars}/mo</span>
          </div>
          <div className="flex justify-between">
            <span>Extra System:</span>
            <span className="font-medium">${tier.extraSystemPriceDollars}/mo</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={copyTierToClipboard} className="flex-1">
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit} className="flex-1">
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm(`Delete pricing tier "${tier.displayName}"?`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PricingTierForm({ tier, onSuccess }: { tier?: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    tierName: tier?.tierName || "",
    displayName: tier?.displayName || "",
    description: tier?.description || "",
    annualPriceDollars: tier?.annualPriceDollars || 0,
    monthlyPriceDollars: tier?.monthlyPriceDollars || 0,
    maxInterfaces: tier?.maxInterfaces || 0,
    maxSystems: tier?.maxSystems || 0,
    maxFlows: tier?.maxFlows || 999999,
    maxUsers: tier?.maxUsers || 999999,
    maxExecutionsPerMonth: tier?.maxExecutionsPerMonth || 999999999,
    extraInterfacePriceDollars: tier?.extraInterfacePriceDollars || 100,
    extraSystemPriceDollars: tier?.extraSystemPriceDollars || 200,
    isActive: tier?.isActive ?? true,
    isPublic: tier?.isPublic ?? true,
    sortOrder: tier?.sortOrder || 0,
    // Features
    flowEditor: tier?.features?.flowEditor ?? true,
    dataSources: tier?.features?.dataSources ?? true,
    interfaces: tier?.features?.interfaces ?? true,
    mappingGenerator: tier?.features?.mappingGenerator ?? false,
    advancedSettings: tier?.features?.advancedSettings ?? false,
    customNodes: tier?.features?.customNodes ?? false,
    canEditFlows: tier?.features?.canEditFlows ?? false,
    canAddInterfaces: tier?.features?.canAddInterfaces ?? false,
    canAddSystems: tier?.features?.canAddSystems ?? false,
    canDeleteResources: tier?.features?.canDeleteResources ?? false,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tierName: formData.tierName,
        displayName: formData.displayName,
        description: formData.description,
        annualPriceDollars: formData.annualPriceDollars,
        monthlyPriceDollars: formData.monthlyPriceDollars,
        maxInterfaces: formData.maxInterfaces,
        maxSystems: formData.maxSystems,
        maxFlows: formData.maxFlows,
        maxUsers: formData.maxUsers,
        maxExecutionsPerMonth: formData.maxExecutionsPerMonth,
        extraInterfacePriceDollars: formData.extraInterfacePriceDollars,
        extraSystemPriceDollars: formData.extraSystemPriceDollars,
        isActive: formData.isActive,
        isPublic: formData.isPublic,
        sortOrder: formData.sortOrder,
        features: {
          flowEditor: formData.flowEditor,
          dataSources: formData.dataSources,
          interfaces: formData.interfaces,
          mappingGenerator: formData.mappingGenerator,
          advancedSettings: formData.advancedSettings,
          customNodes: formData.customNodes,
          apiAccess: true,
          webhooks: true,
          canEditFlows: formData.canEditFlows,
          canAddInterfaces: formData.canAddInterfaces,
          canAddSystems: formData.canAddSystems,
          canDeleteResources: formData.canDeleteResources,
        },
      };

      const res = await apiRequest("POST", "/api/pricing-catalog", payload);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: tier ? "Tier Updated" : "Tier Created",
        description: `${formData.displayName} has been saved successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-catalog"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
      className="space-y-6"
    >
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="font-medium">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="tierName">Tier Name (ID) *</Label>
            <Input
              id="tierName"
              value={formData.tierName}
              onChange={(e) => setFormData({ ...formData, tierName: e.target.value })}
              placeholder="e.g., professional"
              required
              disabled={!!tier} // Can't change tier name after creation
            />
            <p className="text-xs text-muted-foreground mt-1">Lowercase, no spaces (e.g., starter, professional)</p>
          </div>
          <div>
            <Label htmlFor="displayName">Display Name *</Label>
            <Input
              id="displayName"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="e.g., Professional Plan"
              required
            />
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this tier"
            rows={2}
          />
        </div>
      </div>

      {/* Pricing */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-medium">Pricing</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="monthlyPrice">Monthly Price ($) *</Label>
            <Input
              id="monthlyPrice"
              type="number"
              value={formData.monthlyPriceDollars}
              onChange={(e) => setFormData({ ...formData, monthlyPriceDollars: parseFloat(e.target.value) })}
              required
            />
          </div>
          <div>
            <Label htmlFor="annualPrice">Annual Price ($) *</Label>
            <Input
              id="annualPrice"
              type="number"
              value={formData.annualPriceDollars}
              onChange={(e) => setFormData({ ...formData, annualPriceDollars: parseFloat(e.target.value) })}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Suggested: ${formData.monthlyPriceDollars * 12 * 0.85} (15% discount)
            </p>
          </div>
          <div>
            <Label htmlFor="extraInterface">Extra Interface ($/mo)</Label>
            <Input
              id="extraInterface"
              type="number"
              value={formData.extraInterfacePriceDollars}
              onChange={(e) => setFormData({ ...formData, extraInterfacePriceDollars: parseFloat(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="extraSystem">Extra System ($/mo)</Label>
            <Input
              id="extraSystem"
              type="number"
              value={formData.extraSystemPriceDollars}
              onChange={(e) => setFormData({ ...formData, extraSystemPriceDollars: parseFloat(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* Limits */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-medium">Resource Limits</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxInterfaces">Max Interfaces</Label>
            <Input
              id="maxInterfaces"
              type="number"
              value={formData.maxInterfaces}
              onChange={(e) => setFormData({ ...formData, maxInterfaces: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground mt-1">999999 = Unlimited</p>
          </div>
          <div>
            <Label htmlFor="maxSystems">Max Systems</Label>
            <Input
              id="maxSystems"
              type="number"
              value={formData.maxSystems}
              onChange={(e) => setFormData({ ...formData, maxSystems: parseInt(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="maxUsers">Max Users</Label>
            <Input
              id="maxUsers"
              type="number"
              value={formData.maxUsers}
              onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="maxFlows">Max Flows</Label>
            <Input
              id="maxFlows"
              type="number"
              value={formData.maxFlows}
              onChange={(e) => setFormData({ ...formData, maxFlows: parseInt(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-medium">Features & Permissions</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "flowEditor", label: "Flow Builder" },
            { key: "dataSources", label: "Data Sources" },
            { key: "interfaces", label: "Interfaces" },
            { key: "mappingGenerator", label: "AI Mapping Generator" },
            { key: "advancedSettings", label: "Advanced Settings" },
            { key: "customNodes", label: "Custom Nodes" },
            { key: "canEditFlows", label: "Can Edit Flows" },
            { key: "canAddInterfaces", label: "Can Add Interfaces" },
            { key: "canAddSystems", label: "Can Add Systems" },
            { key: "canDeleteResources", label: "Can Delete Resources" },
          ].map((feature) => (
            <div key={feature.key} className="flex items-center justify-between p-2 border rounded">
              <Label htmlFor={feature.key} className="cursor-pointer">{feature.label}</Label>
              <Switch
                id={feature.key}
                checked={formData[feature.key as keyof typeof formData] as boolean}
                onCheckedChange={(checked) => setFormData({ ...formData, [feature.key]: checked })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Visibility */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-medium">Visibility & Order</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center justify-between p-3 border rounded">
            <Label htmlFor="isActive">Active</Label>
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
          </div>
          <div className="flex items-center justify-between p-3 border rounded">
            <Label htmlFor="isPublic">Public</Label>
            <Switch
              id="isPublic"
              checked={formData.isPublic}
              onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
            />
          </div>
          <div>
            <Label htmlFor="sortOrder">Sort Order</Label>
            <Input
              id="sortOrder"
              type="number"
              value={formData.sortOrder}
              onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={saveMutation.isPending}>
          <CheckCircle className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : tier ? "Update Tier" : "Create Tier"}
        </Button>
      </div>
    </form>
  );
}
