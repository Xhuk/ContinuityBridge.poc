import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle, XCircle, Copy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { XmlIfdResponse } from "@shared/schema";

const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<ItemFulfillmentDocument>
  <Header>
    <DocumentId>IFD-2024-001234</DocumentId>
    <Timestamp>2024-01-15T10:30:00Z</Timestamp>
  </Header>
  <Item>
    <ItemId>ITEM-789012</ItemId>
    <SKU>WIDGET-PRO-500</SKU>
    <Description>Professional Widget 500</Description>
    <Quantity>25</Quantity>
    <Weight>12.5</Weight>
    <Dimensions>
      <Length>30</Length>
      <Width>20</Width>
      <Height>15</Height>
    </Dimensions>
  </Item>
  <Destination>
    <Address>123 Main Street</Address>
    <City>San Francisco</City>
    <State>CA</State>
    <ZipCode>94102</ZipCode>
    <Country>USA</Country>
    <Coordinates>
      <Latitude>37.7749</Latitude>
      <Longitude>-122.4194</Longitude>
    </Coordinates>
  </Destination>
</ItemFulfillmentDocument>`;

export default function Ingest() {
  const [xmlInput, setXmlInput] = useState("");
  const [response, setResponse] = useState<XmlIfdResponse | null>(null);
  const { toast } = useToast();

  const processMutation = useMutation({
    mutationFn: async (xml: string) => {
      return apiRequest<XmlIfdResponse>("POST", "/api/items/ifd", { xml });
    },
    onSuccess: (data) => {
      setResponse(data);
      if (data.ok) {
        toast({
          title: "Success",
          description: `XML processed successfully. Trace ID: ${data.traceId}`,
        });
      } else {
        toast({
          title: "Processing failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!xmlInput.trim()) {
      toast({
        title: "Validation error",
        description: "Please enter XML content",
        variant: "destructive",
      });
      return;
    }
    processMutation.mutate(xmlInput);
  };

  const loadSample = () => {
    setXmlInput(sampleXML);
    setResponse(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Content copied to clipboard",
    });
  };

  return (
    <div className="px-6 py-8 md:px-12 md:py-12 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-ingest">
          Ingest XML
        </h1>
        <p className="text-sm text-muted-foreground">
          Submit IFD XML payloads for processing
        </p>
      </div>

      <Card className="p-6 border rounded-lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="xml-input" className="text-sm font-medium">
              XML Payload
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSample}
              data-testid="button-load-sample"
            >
              Load Sample XML
            </Button>
          </div>

          <Textarea
            id="xml-input"
            value={xmlInput}
            onChange={(e) => setXmlInput(e.target.value)}
            placeholder="Paste your XML IFD payload here..."
            className="min-h-96 font-mono text-sm resize-y"
            data-testid="textarea-xml-input"
          />

          {processMutation.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              <span>Validation error: Please check your XML syntax</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={processMutation.isPending}
              data-testid="button-submit-xml"
            >
              <Upload className="h-4 w-4 mr-2" />
              {processMutation.isPending ? "Processing..." : "Process XML"}
            </Button>
          </div>
        </div>
      </Card>

      {response && (
        <Card className="p-6 border rounded-lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Response</h2>
              {response.ok ? (
                <Badge
                  variant="default"
                  className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Success
                </Badge>
              ) : (
                <Badge variant="destructive" className="rounded-full">
                  <XCircle className="h-3 w-3 mr-1" />
                  Failed
                </Badge>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Trace ID</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code
                    className="flex-1 text-sm font-mono bg-muted px-3 py-2 rounded"
                    data-testid="text-trace-id"
                  >
                    {response.traceId}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(response.traceId)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {response.canonical && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Canonical JSON
                  </Label>
                  <div className="relative">
                    <pre className="text-xs font-mono bg-muted p-4 rounded overflow-x-auto max-h-96">
                      {JSON.stringify(response.canonical, null, 2)}
                    </pre>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(JSON.stringify(response.canonical, null, 2))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {response.error && (
                <div>
                  <Label className="text-xs text-destructive mb-2 block">Error Details</Label>
                  <div className="bg-destructive/10 border border-destructive/20 rounded p-4">
                    <p className="text-sm text-destructive font-mono">{response.error}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
