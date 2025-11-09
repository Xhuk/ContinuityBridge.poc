import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  Panel,
  MiniMap,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Save,
  Play,
  Trash2,
  Plus,
  Settings,
  Loader2,
  FolderOpen,
  Download,
  Upload,
} from "lucide-react";

// Node types from catalog
const NODE_TYPES = [
  {
    type: "manual_trigger",
    label: "Manual Trigger",
    category: "trigger",
    color: "hsl(142 71% 45%)",
  },
  {
    type: "xml_parser",
    label: "XML Parser",
    category: "parser",
    color: "hsl(221 83% 53%)",
  },
  {
    type: "json_builder",
    label: "JSON Builder",
    category: "builder",
    color: "hsl(262 83% 58%)",
  },
  {
    type: "object_mapper",
    label: "Object Mapper",
    category: "transformer",
    color: "hsl(37 91% 55%)",
  },
  {
    type: "interface_source",
    label: "Interface Source",
    category: "trigger",
    color: "hsl(142 71% 45%)",
  },
  {
    type: "interface_destination",
    label: "Interface Destination",
    category: "output",
    color: "hsl(0 72% 51%)",
  },
  {
    type: "csv_parser",
    label: "CSV Parser",
    category: "parser",
    color: "hsl(200 83% 53%)",
  },
  {
    type: "validation",
    label: "Validation",
    category: "transformer",
    color: "hsl(280 65% 55%)",
  },
];

// Custom node component
function CustomNode({ data }: { data: any }) {
  const nodeType = NODE_TYPES.find((t) => t.type === data.type);
  const color = nodeType?.color || "hsl(240 5% 64%)";

  return (
    <div
      className="px-4 py-3 rounded-lg border-2 shadow-md bg-card min-w-[180px] hover-elevate active-elevate-2 transition-all"
      style={{ borderColor: color }}
      data-testid={`node-${data.type}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <div className="font-semibold text-sm">{data.label}</div>
      </div>
      {data.config && Object.keys(data.config).length > 0 && (
        <div className="text-xs text-muted-foreground mt-1">
          <Settings className="inline w-3 h-3 mr-1" />
          Configured
        </div>
      )}
    </div>
  );
}

const nodeTypes = {
  default: CustomNode,
};

export default function Flows() {
  const { toast } = useToast();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowName, setFlowName] = useState("Untitled Flow");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [currentFlowId, setCurrentFlowId] = useState<string | null>(null);

  // Fetch available flows
  const { data: flows, isLoading: flowsLoading } = useQuery<any[]>({
    queryKey: ["/api/flows"],
  });

  // Node changes handler
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  // Edge changes handler
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // Connect handler
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    []
  );

  // Add node to canvas
  const addNode = (nodeType: string) => {
    const type = NODE_TYPES.find((t) => t.type === nodeType);
    if (!type) return;

    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: "default",
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100,
      },
      data: {
        label: type.label,
        type: nodeType,
        config: {},
      },
    };

    setNodes((nds) => [...nds, newNode]);
  };

  // Node click handler
  const onNodeClick = (_event: any, node: Node) => {
    setSelectedNode(node);
    setConfigDialogOpen(true);
  };

  // Save node configuration
  const saveNodeConfig = (config: Record<string, any>) => {
    if (!selectedNode) return;

    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, config } }
          : node
      )
    );
    setConfigDialogOpen(false);
  };

  // Save flow mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const flowData = {
        name: flowName,
        version: "1.0",
        enabled: true,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.data.type,
          position: node.position,
          data: node.data,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
        })),
        triggerType: "manual",
        timeout: 30000,
      };

      if (currentFlowId) {
        return await apiRequest("PATCH", `/api/flows/${currentFlowId}`, flowData);
      } else {
        return await apiRequest("POST", "/api/flows", flowData);
      }
    },
    onSuccess: (data: any) => {
      setCurrentFlowId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/flows"] });
      toast({
        title: "Flow saved",
        description: `Flow "${flowName}" saved successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Execute flow mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!currentFlowId) {
        throw new Error("Please save the flow first");
      }
      return await apiRequest("POST", `/api/flows/${currentFlowId}/execute`, {
        input: {},
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Flow executed",
        description: `Trace ID: ${data.traceId}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Execution failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Load flow
  const loadFlow = (flow: any) => {
    setFlowName(flow.name);
    setCurrentFlowId(flow.id);
    setNodes(
      flow.nodes.map((node: any) => ({
        ...node,
        type: "default",
      }))
    );
    setEdges(flow.edges);
    setLoadDialogOpen(false);
    toast({
      title: "Flow loaded",
      description: `Loaded "${flow.name}"`,
    });
  };

  // Clear canvas
  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setFlowName("Untitled Flow");
    setCurrentFlowId(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="text-lg font-semibold w-64"
            data-testid="input-flow-name"
          />
          {currentFlowId && (
            <Badge variant="outline" data-testid="badge-flow-saved">
              Saved
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLoadDialogOpen(true)}
            data-testid="button-load-flow"
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Load
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearCanvas}
            data-testid="button-clear-canvas"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-flow"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
          <Button
            size="sm"
            onClick={() => executeMutation.mutate()}
            disabled={!currentFlowId || executeMutation.isPending}
            data-testid="button-execute-flow"
          >
            {executeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Execute
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Node Palette */}
        <Card className="w-64 m-4 p-4 flex flex-col">
          <h3 className="font-semibold mb-4">Node Palette</h3>
          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {NODE_TYPES.map((nodeType) => (
                <Button
                  key={nodeType.type}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => addNode(nodeType.type)}
                  data-testid={`button-add-${nodeType.type}`}
                >
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: nodeType.color }}
                  />
                  {nodeType.label}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* React Flow Canvas */}
        <div className="flex-1 m-4" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-muted/30 rounded-lg border border-border"
            data-testid="flow-canvas"
          >
            <Background />
            <Controls />
            <MiniMap
              nodeColor={(node: any) => {
                const type = NODE_TYPES.find((t) => t.type === node.data.type);
                return type?.color || "#666";
              }}
            />
            <Panel position="top-right" className="bg-background/80 backdrop-blur p-2 rounded-lg border border-border">
              <div className="text-xs text-muted-foreground">
                {nodes.length} nodes, {edges.length} connections
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* Node Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent data-testid="dialog-node-config">
          <DialogHeader>
            <DialogTitle>Configure {String(selectedNode?.data?.label || "Node")}</DialogTitle>
            <DialogDescription>
              Edit the configuration for this node
            </DialogDescription>
          </DialogHeader>
          <NodeConfigForm
            node={selectedNode}
            onSave={saveNodeConfig}
            onCancel={() => setConfigDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Load Flow Dialog */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent data-testid="dialog-load-flow">
          <DialogHeader>
            <DialogTitle>Load Flow</DialogTitle>
            <DialogDescription>Select a flow to load</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {flowsLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto" />
                </div>
              ) : flows && flows.length > 0 ? (
                flows.map((flow) => (
                  <Button
                    key={flow.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => loadFlow(flow)}
                    data-testid={`button-load-flow-${flow.id}`}
                  >
                    <div className="flex-1 text-left">
                      <div className="font-medium">{flow.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {flow.nodes.length} nodes
                      </div>
                    </div>
                    {flow.enabled && <Badge variant="outline">Enabled</Badge>}
                  </Button>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No flows available
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Node configuration form component
function NodeConfigForm({
  node,
  onSave,
  onCancel,
}: {
  node: Node | null;
  onSave: (config: Record<string, any>) => void;
  onCancel: () => void;
}): JSX.Element | null {
  const [config, setConfig] = useState<Record<string, any>>(
    node?.data.config || {}
  );

  useEffect(() => {
    setConfig(node?.data.config || {});
  }, [node]);

  if (!node) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(config);
  };

  // Render appropriate fields based on node type
  const renderConfigFields = () => {
    switch (node.data.type) {
      case "xml_parser":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="xpath">XPath Expression</Label>
              <Input
                id="xpath"
                value={config.xpath || ""}
                onChange={(e) =>
                  setConfig({ ...config, xpath: e.target.value })
                }
                placeholder="//Item"
                data-testid="input-xpath"
              />
            </div>
          </div>
        );

      case "json_builder":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="template">JSON Template</Label>
              <Textarea
                id="template"
                value={config.template || ""}
                onChange={(e) =>
                  setConfig({ ...config, template: e.target.value })
                }
                placeholder='{"key": "value"}'
                className="font-mono text-sm"
                rows={6}
                data-testid="input-json-template"
              />
            </div>
          </div>
        );

      case "object_mapper":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="mapping">Field Mapping (YAML)</Label>
              <Textarea
                id="mapping"
                value={config.mapping || ""}
                onChange={(e) =>
                  setConfig({ ...config, mapping: e.target.value })
                }
                placeholder="destination.field: source.field"
                className="font-mono text-sm"
                rows={6}
                data-testid="input-mapping"
              />
            </div>
          </div>
        );

      case "interface_source":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="interfaceId">Interface ID</Label>
              <Input
                id="interfaceId"
                value={config.interfaceId || ""}
                onChange={(e) =>
                  setConfig({ ...config, interfaceId: e.target.value })
                }
                placeholder="interface-id"
                data-testid="input-interface-id"
              />
            </div>
            <div>
              <Label htmlFor="method">HTTP Method</Label>
              <Select
                value={config.method || "GET"}
                onValueChange={(value) =>
                  setConfig({ ...config, method: value })
                }
              >
                <SelectTrigger data-testid="select-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="path">API Path (optional)</Label>
              <Input
                id="path"
                value={config.path || ""}
                onChange={(e) =>
                  setConfig({ ...config, path: e.target.value })
                }
                placeholder="/api/orders"
                data-testid="input-path"
              />
            </div>
          </div>
        );

      case "interface_destination":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="interfaceId">Interface ID</Label>
              <Input
                id="interfaceId"
                value={config.interfaceId || ""}
                onChange={(e) =>
                  setConfig({ ...config, interfaceId: e.target.value })
                }
                placeholder="interface-id"
                data-testid="input-interface-id"
              />
            </div>
            <div>
              <Label htmlFor="method">HTTP Method</Label>
              <Select
                value={config.method || "POST"}
                onValueChange={(value) =>
                  setConfig({ ...config, method: value })
                }
              >
                <SelectTrigger data-testid="select-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="path">API Path (optional)</Label>
              <Input
                id="path"
                value={config.path || ""}
                onChange={(e) =>
                  setConfig({ ...config, path: e.target.value })
                }
                placeholder="/api/orders"
                data-testid="input-path"
              />
            </div>
          </div>
        );

      case "csv_parser":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="delimiter">Delimiter</Label>
              <Input
                id="delimiter"
                value={config.delimiter || ","}
                onChange={(e) =>
                  setConfig({ ...config, delimiter: e.target.value })
                }
                placeholder=","
                maxLength={1}
                data-testid="input-delimiter"
              />
            </div>
            <div>
              <Label htmlFor="hasHeader">Has Header Row</Label>
              <Select
                value={config.hasHeader !== false ? "true" : "false"}
                onValueChange={(value) =>
                  setConfig({ ...config, hasHeader: value === "true" })
                }
              >
                <SelectTrigger data-testid="select-has-header">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "validation":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="rules">Validation Rules (YAML)</Label>
              <Textarea
                id="rules"
                value={config.rules || ""}
                onChange={(e) =>
                  setConfig({ ...config, rules: e.target.value })
                }
                placeholder="field_name:\n  type: string\n  required: true"
                className="font-mono text-sm"
                rows={8}
                data-testid="input-validation-rules"
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-muted-foreground">
            No configuration required for this node type
          </div>
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {renderConfigFields()}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          data-testid="button-cancel-config"
        >
          Cancel
        </Button>
        <Button type="submit" data-testid="button-save-config">
          Save Configuration
        </Button>
      </DialogFooter>
    </form>
  );
}
