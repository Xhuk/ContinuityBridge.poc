import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Palette, Upload, X, Check } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface PresetTheme {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  sidebarColor: string;
  sidebarPrimaryColor: string;
}

export default function BrandingSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedTheme, setSelectedTheme] = useState<string>("default");
  const [customColors, setCustomColors] = useState({
    primaryColor: "217 91% 35%",
    secondaryColor: "217 8% 90%",
    accentColor: "217 12% 91%",
    sidebarColor: "0 0% 96%",
    sidebarPrimaryColor: "217 91% 35%",
  });
  const [applicationName, setApplicationName] = useState("ContinuityBridge");
  const [showLogo, setShowLogo] = useState(true);
  const [logoPosition, setLogoPosition] = useState<"left" | "center" | "right">("left");

  // Fetch current branding
  const { data: brandingData, isLoading } = useQuery({
    queryKey: ["/api/branding"],
    onSuccess: (data: any) => {
      if (data.branding) {
        const b = data.branding;
        setSelectedTheme(b.presetTheme || "default");
        setApplicationName(b.applicationName || "ContinuityBridge");
        setShowLogo(b.showLogo !== false);
        setLogoPosition(b.logoPosition || "left");
        if (b.presetTheme === "custom") {
          setCustomColors({
            primaryColor: b.primaryColor || "217 91% 35%",
            secondaryColor: b.secondaryColor || "217 8% 90%",
            accentColor: b.accentColor || "217 12% 91%",
            sidebarColor: b.sidebarColor || "0 0% 96%",
            sidebarPrimaryColor: b.sidebarPrimaryColor || "217 91% 35%",
          });
        }
      }
    },
  });

  // Fetch preset themes
  const { data: presetsData } = useQuery({
    queryKey: ["/api/branding/presets"],
  });

  // Save branding mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      toast({
        title: "Branding Updated",
        description: "Your theme has been saved. Refresh to see changes.",
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

  // Upload logo mutation
  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/branding/upload-logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      toast({
        title: "Logo Uploaded",
        description: "Your logo has been uploaded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete logo mutation
  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/branding/logo", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      toast({
        title: "Logo Removed",
        description: "Your logo has been removed.",
      });
    },
  });

  const handleSave = () => {
    const data: any = {
      presetTheme: selectedTheme,
      applicationName,
      showLogo,
      logoPosition,
    };

    if (selectedTheme === "custom") {
      data.primaryColor = customColors.primaryColor;
      data.secondaryColor = customColors.secondaryColor;
      data.accentColor = customColors.accentColor;
      data.sidebarColor = customColors.sidebarColor;
      data.sidebarPrimaryColor = customColors.sidebarPrimaryColor;
    }

    saveMutation.mutate(data);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Logo must be under 2MB",
          variant: "destructive",
        });
        return;
      }
      uploadLogoMutation.mutate(file);
    }
  };

  const hslToHex = (hsl: string): string => {
    const [h, s, l] = hsl.split(" ").map((v, i) => 
      i === 0 ? parseInt(v) : parseInt(v.replace("%", ""))
    );
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = (l / 100) - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  const presets = presetsData?.presets || [];
  const currentBranding = brandingData?.branding;

  if (isLoading) {
    return <div className="p-6">Loading branding settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Palette className="h-6 w-6" />
          Branding & Theme
        </h2>
        <p className="text-muted-foreground">
          Customize your organization's colors, logo, and application name
        </p>
      </div>

      {/* Application Name */}
      <Card>
        <CardHeader>
          <CardTitle>Application Name</CardTitle>
          <CardDescription>Customize the application title</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={applicationName}
            onChange={(e) => setApplicationName(e.target.value)}
            placeholder="ContinuityBridge"
          />
        </CardContent>
      </Card>

      {/* Logo Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Logo</CardTitle>
          <CardDescription>Upload your company logo (max 2MB, jpg/png/svg)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentBranding?.logoUrl && (
            <div className="flex items-center gap-4 p-4 border rounded-lg">
              <img
                src={currentBranding.logoUrl}
                alt="Logo"
                className="h-16 w-auto object-contain"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">Current Logo</p>
                <p className="text-xs text-muted-foreground">{currentBranding.logoUrl}</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteLogoMutation.mutate()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadLogoMutation.isPending}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadLogoMutation.isPending ? "Uploading..." : "Upload Logo"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                checked={showLogo}
                onCheckedChange={setShowLogo}
              />
              <Label>Show Logo</Label>
            </div>

            <div className="space-y-2">
              <Label>Logo Position</Label>
              <RadioGroup value={logoPosition} onValueChange={(v: any) => setLogoPosition(v)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="left" id="left" />
                  <Label htmlFor="left">Left</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="center" id="center" />
                  <Label htmlFor="center">Center</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="right" id="right" />
                  <Label htmlFor="right">Right</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preset Themes */}
      <Card>
        <CardHeader>
          <CardTitle>Color Theme</CardTitle>
          <CardDescription>Choose a preset theme or customize your own</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {presets.map((preset: PresetTheme) => (
              <Card
                key={preset.id}
                className={`cursor-pointer transition-all ${
                  selectedTheme === preset.id
                    ? "ring-2 ring-primary"
                    : "hover:border-primary/50"
                }`}
                onClick={() => setSelectedTheme(preset.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium">{preset.name}</p>
                    {selectedTheme === preset.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div
                      className="h-8 flex-1 rounded"
                      style={{ backgroundColor: hslToHex(preset.primaryColor) }}
                      title="Primary"
                    />
                    <div
                      className="h-8 flex-1 rounded"
                      style={{ backgroundColor: hslToHex(preset.sidebarPrimaryColor) }}
                      title="Sidebar"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Custom Theme Card */}
            <Card
              className={`cursor-pointer transition-all ${
                selectedTheme === "custom"
                  ? "ring-2 ring-primary"
                  : "hover:border-primary/50"
              }`}
              onClick={() => setSelectedTheme("custom")}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium">Custom Colors</p>
                  {selectedTheme === "custom" && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="h-8 flex-1 rounded bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Custom Color Inputs (only show when custom selected) */}
          {selectedTheme === "custom" && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Primary Color (HSL)</Label>
                <Input
                  value={customColors.primaryColor}
                  onChange={(e) =>
                    setCustomColors({ ...customColors, primaryColor: e.target.value })
                  }
                  placeholder="217 91% 35%"
                />
                <div
                  className="h-8 rounded border"
                  style={{ backgroundColor: hslToHex(customColors.primaryColor) }}
                />
              </div>

              <div className="space-y-2">
                <Label>Sidebar Color (HSL)</Label>
                <Input
                  value={customColors.sidebarColor}
                  onChange={(e) =>
                    setCustomColors({ ...customColors, sidebarColor: e.target.value })
                  }
                  placeholder="0 0% 96%"
                />
                <div
                  className="h-8 rounded border"
                  style={{ backgroundColor: hslToHex(customColors.sidebarColor) }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          size="lg"
        >
          {saveMutation.isPending ? "Saving..." : "Save Branding"}
        </Button>
      </div>
    </div>
  );
}
