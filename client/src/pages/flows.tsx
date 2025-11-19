import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  useEdges,
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
import { SystemInstanceSelector } from "@/components/SystemInstanceSelector";
import { DynamicNodeConfig } from "@/components/DynamicNodeConfig";
import type { NodeDefinition } from "@shared/schema";
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
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Beaker,
  ArrowRight,
  X,
  GitMerge,
  Send,
  Server,
  Database,
  Cloud,
  FileText,
  Calendar,
  HardDrive,
  Search,
  AlertTriangle,
  Info,
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
    type: "ingress",
    label: "Ingress (Inbound)",
    category: "trigger",
    color: "hsl(160 75% 50%)",
  },
  {
    type: "sftp_poller",
    label: "SFTP Poller",
    category: "trigger",
    color: "hsl(180 70% 45%)",
  },
  {
    type: "azure_blob_poller",
    label: "Azure Blob Poller",
    category: "trigger",
    color: "hsl(210 75% 55%)",
  },
  {
    type: "scheduler",
    label: "Scheduler (Timer)",
    category: "trigger",
    color: "hsl(290 70% 50%)",
  },
  {
    type: "data_source",
    label: "Data Source",
    category: "trigger",
    color: "hsl(280 65% 60%)",
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
  {
    type: "conditional",
    label: "Conditional",
    category: "router",
    color: "hsl(45 93% 47%)",
  },
  {
    type: "distributor",
    label: "Distributor",
    category: "router",
    color: "hsl(280 80% 55%)",
  },
  {
    type: "join",
    label: "Join (Data Stitch)",
    category: "transformer",
    color: "hsl(200 85% 55%)",
  },
  {
    type: "egress",
    label: "Egress (Outbound)",
    category: "output",
    color: "hsl(15 85% 60%)",
  },
  {
    type: "sftp_connector",
    label: "SFTP Connector",
    category: "output",
    color: "hsl(180 65% 50%)",
  },
  {
    type: "azure_blob_connector",
    label: "Azure Blob Connector",
    category: "output",
    color: "hsl(210 70% 60%)",
  },
  {
    type: "database_connector",
    label: "Database Connector",
    category: "transformer",
    color: "hsl(30 80% 55%)",
  },
  {
    type: "logger",
    label: "Logger",
    category: "transformer",
    color: "hsl(240 10% 50%)",
  },
  {
    type: "http_request",
    label: "HTTP Request",
    category: "transformer",
    color: "hsl(200 75% 55%)",
  },
  {
    type: "email_notification",
    label: "Email Notification",
    category: "output",
    color: "hsl(340 75% 55%)",
  },
  {
    type: "error_handler",
    label: "Error Handler",
    category: "router",
    color: "hsl(25 85% 55%)",
  },
];

// Custom node component with connection handles and animations
function CustomNode({ data, selected, id }: { data: any; selected?: boolean; id: string }) {
  const nodeType = NODE_TYPES.find((t) => t.type === data.type);
  const color = nodeType?.color || "hsl(240 5% 64%)";
  const category = nodeType?.category || "";
  const [isHovered, setIsHovered] = useState(false);
  
  // Get edges to check connections
  const edges = useEdges();
  const hasIncoming = edges.some((e: Edge) => e.target === id);
  const hasOutgoing = edges.some((e: Edge) => e.source === id);

  // Determine which handles to show based on node category
  const showTargetHandle = category !== "trigger"; // Triggers don't accept inputs
  const showSourceHandle = category !== "output"; // Outputs don't produce outputs
  
  // Missing connection indicators
  const needsIncoming = showTargetHandle && !hasIncoming;
  const needsOutgoing = showSourceHandle && !hasOutgoing;
  const hasConnectionWarning = needsIncoming || needsOutgoing;

  // Show handles when hovered OR selected
  const handlesVisible = isHovered || selected;
  
  // Execution status from node data
  const executionStatus = data.executionStatus; // 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  
  // Mapping debug info (for BYDM mapper and interface nodes)
  const mappingInfo = data.mappingInfo || data.config?.mappingInfo;
  const hasMappingIssues = mappingInfo && (
    (mappingInfo.unmapped_fields > 0) || 
    (mappingInfo.missing_required_fields?.length > 0) ||
    (mappingInfo.warnings?.length > 0)
  );
  const mappingConfidence = mappingInfo?.confidence_score || 100;
  
  // Scheduler/Poller status (for trigger nodes)
  const triggerStatus = data.triggerStatus; // { running: boolean, lastRun: string, nextRun: string, error: string }
  const hasTriggerIssue = triggerStatus && (!triggerStatus.running || triggerStatus.error);
  const isTriggerNode = category === 'trigger' && (data.type === 'scheduler' || data.type.includes('_poller'));
  
  // Determine trigger type for pollers/schedulers
  const getTriggerType = () => {
    if (category !== 'trigger') return null;
    
    const config = data.config || {};
    
    // Check for scheduled/polling triggers
    if (data.type === 'scheduler' || config.cronExpression) {
      return { icon: Calendar, label: 'Scheduled', color: 'text-purple-600 dark:text-purple-400' };
    }
    
    if (config.pollInterval || data.type.includes('_poller')) {
      const intervalSeconds = config.pollInterval || 60;
      const intervalMinutes = Math.round(intervalSeconds / 60);
      return { 
        icon: Clock, 
        label: intervalMinutes >= 60 
          ? `Every ${Math.round(intervalMinutes / 60)}h` 
          : `Every ${intervalMinutes}m`,
        color: 'text-blue-600 dark:text-blue-400'
      };
    }
    
    // Webhook/event-driven triggers
    if (data.type === 'ingress' || data.type === 'interface_source') {
      return { icon: Send, label: 'Event-driven', color: 'text-green-600 dark:text-green-400' };
    }
    
    // Manual triggers
    if (data.type === 'manual_trigger') {
      return { icon: Play, label: 'Manual', color: 'text-gray-600 dark:text-gray-400' };
    }
    
    return null;
  };
  
  const triggerInfo = getTriggerType();
  
  // Dynamic output handles for Distributor node
  const isDistributor = data.type === 'distributor';
  const distributorRules = isDistributor && data.config?.rules ? data.config.rules : [];
  const hasMultipleOutputs = isDistributor && distributorRules.length > 0;
  
  // Join node has multiple input streams
  const isJoin = data.type === 'join';
  const hasMultipleInputs = isJoin;
  
  // Status badge icon
  const getStatusBadge = () => {
    switch (executionStatus) {
      case 'running':
        return <Loader2 className="w-3 h-3 animate-spin text-blue-600" />;
      case 'completed':
        return <CheckCircle2 className="w-3 h-3 text-green-600" />;
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-600" />;
      case 'skipped':
        return <AlertCircle className="w-3 h-3 text-gray-400" />;
      case 'pending':
        return <Clock className="w-3 h-3 text-gray-400" />;
      default:
        return null;
    }
  };
  
  // Animation variants for node states
  const nodeVariants = {
    idle: { 
      scale: 1,
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
    },
    hover: { 
      scale: 1.02,
      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)"
    },
    selected: { 
      scale: 1.03,
      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)"
    },
    running: {
      scale: [1, 1.05, 1],
      boxShadow: [
        "0 4px 6px -1px rgb(59 130 246 / 0.3)",
        "0 10px 20px -3px rgb(59 130 246 / 0.5)",
        "0 4px 6px -1px rgb(59 130 246 / 0.3)"
      ],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "easeInOut"
      }
    },
    completed: {
      scale: [1, 1.1, 1],
      transition: {
        duration: 0.5,
        ease: "easeOut"
      }
    },
    failed: {
      scale: [1, 0.95, 1],
      transition: {
        duration: 0.3,
        ease: "easeInOut"
      }
    }
  };
  
  // Determine animation state
  const getAnimationState = () => {
    if (executionStatus === 'running') return 'running';
    if (executionStatus === 'completed') return 'completed';
    if (executionStatus === 'failed') return 'failed';
    if (selected) return 'selected';
    if (isHovered) return 'hover';
    return 'idle';
  };

  return (
    <motion.div
      variants={nodeVariants}
      initial="idle"
      animate={getAnimationState()}
      className={`relative px-4 py-3 rounded-lg border-2 bg-card min-w-[180px] cursor-pointer ${
        hasConnectionWarning ? 'shadow-[0_0_0_2px_rgba(251,191,36,0.3)]' : ''
      }`}
      style={{ borderColor: hasConnectionWarning ? 'hsl(38 92% 50%)' : color }}
      data-testid={`node-${data.type}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Missing Connection Warning Badge */}
      {hasConnectionWarning && (
        <div className="absolute -top-2 -right-2 z-10">
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-amber-400 rounded-full blur-sm opacity-60"
            />
            <div className="relative bg-amber-400 text-amber-950 rounded-full w-5 h-5 flex items-center justify-center">
              <AlertCircle className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}
      
      {/* Mapping Debug Badge (for BYDM/interface nodes) */}
      {hasMappingIssues && !hasConnectionWarning && !hasTriggerIssue && (
        <div className="absolute -top-2 -right-2 z-10">
          <div className="relative group">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-0 rounded-full blur-sm opacity-50 ${
                mappingConfidence >= 80 ? 'bg-blue-400' : 'bg-orange-400'
              }`}
            />
            <div className={`relative rounded-full w-6 h-6 flex items-center justify-center text-white font-bold text-[10px] ${
              mappingConfidence >= 80 ? 'bg-blue-500' : 'bg-orange-500'
            }`}>
              <Search className="w-3 h-3" />
            </div>
            
            {/* Debug tooltip */}
            <div className="absolute top-7 right-0 hidden group-hover:block z-50 bg-gray-900 text-white rounded-lg shadow-xl p-3 w-64 text-xs">
              <div className="font-semibold mb-2 flex items-center gap-1">
                <Search className="w-3 h-3" />
                Mapping Debug Info
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-300">Confidence:</span>
                  <span className={`font-semibold ${
                    mappingConfidence >= 90 ? 'text-green-400' :
                    mappingConfidence >= 70 ? 'text-blue-400' : 'text-orange-400'
                  }`}>{mappingConfidence}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Mapped fields:</span>
                  <span className="text-white">{mappingInfo?.mapped_fields || 0}</span>
                </div>
                {mappingInfo?.unmapped_fields > 0 && (
                  <div className="flex justify-between text-orange-400">
                    <span>⚠️ Unmapped:</span>
                    <span className="font-semibold">{mappingInfo.unmapped_fields}</span>
                  </div>
                )}
                {mappingInfo?.missing_required_fields?.length > 0 && (
                  <div className="border-t border-gray-700 pt-1.5 mt-1.5">
                    <div className="text-red-400 font-semibold flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3" />
                      Missing Required:
                    </div>
                    <div className="pl-2 text-gray-300 max-h-20 overflow-y-auto">
                      {mappingInfo.missing_required_fields.map((field: string, idx: number) => (
                        <div key={idx} className="text-[10px]">• {field}</div>
                      ))}
                    </div>
                  </div>
                )}
                {mappingInfo?.warnings?.length > 0 && (
                  <div className="border-t border-gray-700 pt-1.5 mt-1.5">
                    <div className="text-yellow-400 font-semibold flex items-center gap-1 mb-1">
                      <Info className="w-3 h-3" />
                      Warnings:
                    </div>
                    <div className="pl-2 text-gray-300 max-h-16 overflow-y-auto">
                      {mappingInfo.warnings.map((warning: string, idx: number) => (
                        <div key={idx} className="text-[10px] mb-0.5">{warning}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-700 mt-2 pt-2 text-[10px] text-gray-400">
                💡 Click node to see detailed mapping
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Trigger Status Badge (for scheduler/poller nodes) */}
      {isTriggerNode && triggerStatus && !hasConnectionWarning && (
        <div className="absolute -top-2 -right-2 z-10">
          <div className="relative group">
            <motion.div
              animate={triggerStatus.running ? {
                scale: [1, 1.1, 1],
                opacity: [0.5, 0.8, 0.5]
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-0 rounded-full blur-sm ${
                triggerStatus.running ? 'bg-green-400' : triggerStatus.error ? 'bg-red-400' : 'bg-gray-400'
              }`}
            />
            <div className={`relative rounded-full w-6 h-6 flex items-center justify-center text-white ${
              triggerStatus.running ? 'bg-green-500' : triggerStatus.error ? 'bg-red-500' : 'bg-gray-500'
            }`}>
              {triggerStatus.running ? (
                <Clock className="w-3 h-3 animate-pulse" />
              ) : triggerStatus.error ? (
                <AlertTriangle className="w-3 h-3" />
              ) : (
                <Clock className="w-3 h-3 opacity-50" />
              )}
            </div>
            
            {/* Trigger Status tooltip */}
            <div className="absolute top-7 right-0 hidden group-hover:block z-50 bg-gray-900 text-white rounded-lg shadow-xl p-3 w-64 text-xs">
              <div className="font-semibold mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Trigger Status
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-300">Status:</span>
                  <span className={`font-semibold ${
                    triggerStatus.running ? 'text-green-400' : triggerStatus.error ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {triggerStatus.running ? '▶️ Running' : triggerStatus.error ? '❌ Stopped' : '⏸️ Paused'}
                  </span>
                </div>
                {triggerStatus.lastRun && (
                  <div className="flex justify-between">
                    <span className="text-gray-300">Last Run:</span>
                    <span className="text-white text-[10px]">
                      {new Date(triggerStatus.lastRun).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {triggerStatus.nextRun && triggerStatus.running && (
                  <div className="flex justify-between">
                    <span className="text-gray-300">Next Run:</span>
                    <span className="text-blue-400 text-[10px]">
                      {new Date(triggerStatus.nextRun).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {triggerStatus.error && (
                  <div className="border-t border-gray-700 pt-1.5 mt-1.5">
                    <div className="text-red-400 font-semibold flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3" />
                      Error:
                    </div>
                    <div className="pl-2 text-gray-300 text-[10px]">
                      {triggerStatus.error}
                    </div>
                  </div>
                )}
                {!triggerStatus.running && !triggerStatus.error && (
                  <div className="border-t border-gray-700 pt-1.5 mt-1.5">
                    <div className="text-yellow-400 text-[10px]">
                      ⚠️ Trigger is paused. Check System Health.
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-700 mt-2 pt-2 text-[10px] text-gray-400">
                📊 Go to System Health for details
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Connection Status Tooltip */}
      {hasConnectionWarning && isHovered && (
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 z-20 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-md px-3 py-2 shadow-lg whitespace-nowrap">
          <div className="text-xs font-medium text-amber-900 dark:text-amber-100">
            {needsIncoming && needsOutgoing && "⚠️ Missing input and output connections"}
            {needsIncoming && !needsOutgoing && "⚠️ Missing input connection"}
            {!needsIncoming && needsOutgoing && "⚠️ Missing output connection"}
          </div>
          <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
            {category === "trigger" && needsOutgoing && "Connect this trigger to a parser or transformer"}
            {category === "parser" && needsIncoming && "Connect a trigger or data source"}
            {category === "parser" && needsOutgoing && "Connect to a transformer or output"}
            {category === "transform" && needsIncoming && "Connect input from parser or trigger"}
            {category === "transform" && needsOutgoing && "Connect to another transform or output"}
            {category === "output" && needsIncoming && "Connect input from transformer"}
          </div>
        </div>
      )}
      {/* Target Handle (Left - Input) - Dynamic for Join Node */}
      {showTargetHandle && !hasMultipleInputs && (
        <Handle
          type="target"
          position={Position.Left}
          className={`!w-6 !h-6 !bg-primary !border-2 !border-primary-foreground !rounded-full transition-all ${
            handlesVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
          }`}
          style={{ left: '-12px' }}
          data-testid={`handle-target-${data.type}`}
        >
          <div className="flex items-center justify-center w-full h-full">
            <Plus className="w-3 h-3 text-primary-foreground" />
          </div>
        </Handle>
      )}

      {/* Multiple Input Handles for Join Node */}
      {hasMultipleInputs && (
        <div className="absolute left-0 top-0 h-full flex flex-col justify-around" style={{ left: '-12px' }}>
          <Handle
            type="target"
            position={Position.Left}
            id="input-stream-a"
            className={`!w-6 !h-6 !bg-cyan-600 !border-2 !border-cyan-200 !rounded-full transition-all ${
              handlesVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
            }`}
            style={{ position: 'relative', left: 0, top: 0 }}
            data-testid="handle-input-stream-a"
          >
            <div className="absolute left-8 top-1/2 -translate-y-1/2 whitespace-nowrap">
              <Badge 
                variant="outline" 
                className="text-xs bg-cyan-50 border-cyan-300 text-cyan-700 dark:bg-cyan-950/50 dark:border-cyan-700 dark:text-cyan-300"
              >
                Stream A
              </Badge>
            </div>
            <div className="flex items-center justify-center w-full h-full">
              <ArrowRight className="w-3 h-3 text-cyan-200 rotate-180" />
            </div>
          </Handle>
          
          <Handle
            type="target"
            position={Position.Left}
            id="input-stream-b"
            className={`!w-6 !h-6 !bg-blue-600 !border-2 !border-blue-200 !rounded-full transition-all ${
              handlesVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
            }`}
            style={{ position: 'relative', left: 0, top: 0 }}
            data-testid="handle-input-stream-b"
          >
            <div className="absolute left-8 top-1/2 -translate-y-1/2 whitespace-nowrap">
              <Badge 
                variant="outline" 
                className="text-xs bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/50 dark:border-blue-700 dark:text-blue-300"
              >
                Stream B
              </Badge>
            </div>
            <div className="flex items-center justify-center w-full h-full">
              <ArrowRight className="w-3 h-3 text-blue-200 rotate-180" />
            </div>
          </Handle>
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <div className="font-semibold text-sm">{data.label}</div>
        {executionStatus && (
          <div className="ml-auto">{getStatusBadge()}</div>
        )}
      </div>
      
      {/* Trigger type indicator */}
      {triggerInfo && (
        <div className={`flex items-center gap-1 text-xs mt-1 ${triggerInfo.color}`}>
          <triggerInfo.icon className="w-3 h-3" />
          <span className="font-medium">{triggerInfo.label}</span>
        </div>
      )}
      
      {data.config && Object.keys(data.config).length > 0 && !triggerInfo && (
        <div className="text-xs text-muted-foreground mt-1">
          <Settings className="inline w-3 h-3 mr-1" />
          Configured
        </div>
      )}
      {isDistributor && data.config?.fieldPath && (
        <div className="text-xs text-purple-600 dark:text-purple-400 mt-1 font-mono">
          ↳ {data.config.fieldPath}
        </div>
      )}
      {data.duration && (
        <div className="text-xs text-muted-foreground mt-1">
          ⏱ {data.duration}ms
        </div>
      )}

      {/* Source Handle (Right - Output) - Dynamic for Distributor */}
      {showSourceHandle && !hasMultipleOutputs && (
        <Handle
          type="source"
          position={Position.Right}
          className={`!w-6 !h-6 !bg-primary !border-2 !border-primary-foreground !rounded-full transition-all ${
            handlesVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
          }`}
          style={{ right: '-12px' }}
          data-testid={`handle-source-${data.type}`}
        >
          <div className="flex items-center justify-center w-full h-full">
            <Plus className="w-3 h-3 text-primary-foreground" />
          </div>
        </Handle>
      )}

      {/* Dynamic Multiple Output Handles for Distributor Node */}
      {hasMultipleOutputs && (
        <div className="absolute right-0 top-0 h-full flex flex-col justify-around" style={{ right: '-12px' }}>
          {distributorRules.map((rule: any, index: number) => (
            <Handle
              key={`output-${index}`}
              type="source"
              position={Position.Right}
              id={`output-${index}`}
              className={`!w-6 !h-6 !bg-purple-600 !border-2 !border-purple-200 !rounded-full transition-all ${
                handlesVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
              }`}
              style={{ position: 'relative', right: 0, top: 0 }}
              data-testid={`handle-output-${index}`}
            >
              <div className="absolute right-8 top-1/2 -translate-y-1/2 whitespace-nowrap">
                <Badge 
                  variant="outline" 
                  className="text-xs bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-950/50 dark:border-purple-700 dark:text-purple-300"
                >
                  {rule.outputName || `Port ${index + 1}`}
                </Badge>
              </div>
              <div className="flex items-center justify-center w-full h-full">
                <ArrowRight className="w-3 h-3 text-purple-200" />
              </div>
            </Handle>
          ))}
          
          {/* Default/Fallback Handle */}
          <Handle
            key="output-default"
            type="source"
            position={Position.Right}
            id="output-default"
            className={`!w-6 !h-6 !bg-gray-600 !border-2 !border-gray-300 !rounded-full transition-all ${
              handlesVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
            }`}
            style={{ position: 'relative', right: 0, top: 0 }}
            data-testid="handle-output-default"
          >
            <div className="absolute right-8 top-1/2 -translate-y-1/2 whitespace-nowrap">
              <Badge 
                variant="secondary" 
                className="text-xs bg-gray-100 border-gray-400 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
              >
                Default
              </Badge>
            </div>
            <div className="flex items-center justify-center w-full h-full">
              <AlertCircle className="w-3 h-3 text-gray-300" />
            </div>
          </Handle>
        </div>
      )}
    </motion.div>
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
  const [selectedSystemInstance, setSelectedSystemInstance] = useState<string>("default-dev");
  
  // Connection suggestion state (Make.com style)
  const [connectionSource, setConnectionSource] = useState<{ nodeId: string; handleId?: string } | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [showNodeSuggestions, setShowNodeSuggestions] = useState(false);
  
  // Phase 1: Execution visualization state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executedPaths, setExecutedPaths] = useState<Set<string>>(new Set());
  const [currentExecutionRun, setCurrentExecutionRun] = useState<any>(null);
  
  // Phase 2: Node testing state
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [testingNode, setTestingNode] = useState<Node | null>(null);
  const [testInput, setTestInput] = useState("{}");
  const [testOutput, setTestOutput] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);

  // Fetch available flows (filtered by system instance)
  const { data: flows, isLoading: flowsLoading } = useQuery<any[]>({
    queryKey: ["/api/flows", selectedSystemInstance],
    queryFn: async () => {
      const response = await fetch(`/api/flows?systemInstanceId=${selectedSystemInstance}`);
      if (!response.ok) throw new Error("Failed to fetch flows");
      return response.json();
    },
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
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
      setShowNodeSuggestions(false);
      setConnectionSource(null);
    },
    []
  );
  
  // Connection start handler (when user starts dragging from a handle)
  const onConnectStart = useCallback((_event: any, { nodeId, handleId }: any) => {
    setConnectionSource({ nodeId, handleId });
    setShowNodeSuggestions(true);
  }, []);
  
  // Connection end handler (when user releases the drag)
  const onConnectEnd = useCallback((event: any) => {
    // If dropped on canvas (not on a handle), show suggestions at cursor position
    const targetIsPane = (event.target as HTMLElement)?.classList.contains('react-flow__pane');
    
    if (targetIsPane && reactFlowWrapper.current && connectionSource) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      setCursorPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      // Keep suggestions open for selection
    } else {
      // Connected to a node or cancelled
      setShowNodeSuggestions(false);
      setConnectionSource(null);
      setCursorPosition(null);
    }
  }, [connectionSource]);

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
  
  // Get compatible node types based on source node category
  const getCompatibleNodeTypes = (sourceNodeId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return [];
    
    const sourceType = NODE_TYPES.find(t => t.type === sourceNode.data.type);
    const sourceCategory = sourceType?.category;
    
    // Compatibility matrix (Make.com style)
    const compatibilityMap: Record<string, string[]> = {
      trigger: ['parser', 'transformer', 'builder', 'output', 'router'],
      parser: ['transformer', 'builder', 'output', 'router'],
      transformer: ['transformer', 'builder', 'output', 'router'],
      builder: ['output', 'transformer', 'router'],
      router: ['parser', 'transformer', 'builder', 'output'],
      output: [], // Outputs don't connect to anything (terminal nodes)
    };
    
    const allowedCategories = compatibilityMap[sourceCategory || ''] || [];
    return NODE_TYPES.filter(t => allowedCategories.includes(t.category));
  };
  
  // Add node at cursor position and connect to source
  const addNodeWithConnection = (nodeType: string, position: { x: number; y: number }) => {
    const type = NODE_TYPES.find((t) => t.type === nodeType);
    if (!type || !connectionSource) return;

    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: "default",
      position,
      data: {
        label: type.label,
        type: nodeType,
        config: {},
      },
    };

    setNodes((nds) => [...nds, newNode]);
    
    // Auto-connect from source to new node
    setEdges((eds) => addEdge({
      source: connectionSource.nodeId,
      sourceHandle: connectionSource.handleId || null,
      target: newNode.id,
      targetHandle: null,
    }, eds));
    
    // Clean up
    setShowNodeSuggestions(false);
    setConnectionSource(null);
    setCursorPosition(null);
  };

  // Node click handler - show config or test panel
  const onNodeClick = (_event: any, node: Node) => {
    setSelectedNode(node);
    // Don't auto-open config dialog anymore - let user choose
  };
  
  // Validate if node can be tested (has valid scenario)
  const canTestNode = (node: Node | null): { valid: boolean; reason?: string } => {
    if (!node) return { valid: false, reason: 'No node selected' };
    if (!currentFlowId) return { valid: false, reason: 'Flow not saved' };
    
    const nodeType = NODE_TYPES.find(t => t.type === node.data.type);
    const category = nodeType?.category;
    
    // Check if node has required configuration
    const hasConfig = node.data.config && Object.keys(node.data.config).length > 0;
    
    // Trigger nodes (entry points) - can always test with empty input
    if (category === 'trigger') {
      return { valid: true };
    }
    
    // Non-trigger nodes need incoming connections to have valid input
    const hasIncomingEdge = edges.some(e => e.target === node.id);
    
    if (!hasIncomingEdge) {
      return { 
        valid: false, 
        reason: 'Node needs input connection (or add a trigger node before it)' 
      };
    }
    
    // Check if node is configured (if it requires config)
    if (!hasConfig && category !== 'trigger') {
      return { 
        valid: false, 
        reason: 'Node not configured yet' 
      };
    }
    
    return { valid: true };
  };
  
  // Check if flow has valid entry and exit points
  const validateFlowStructure = (): { valid: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    // Check for at least one trigger/entry node
    const hasEntryPoint = nodes.some(node => {
      const nodeType = NODE_TYPES.find(t => t.type === node.data.type);
      return nodeType?.category === 'trigger';
    });
    
    if (!hasEntryPoint) {
      issues.push('No entry point (trigger node) found');
    }
    
    // Check for at least one output/exit node
    const hasExitPoint = nodes.some(node => {
      const nodeType = NODE_TYPES.find(t => t.type === node.data.type);
      return nodeType?.category === 'output';
    });
    
    if (!hasExitPoint) {
      issues.push('No exit point (output node) found');
    }
    
    // Check for disconnected nodes (except triggers)
    const disconnectedNodes = nodes.filter(node => {
      const nodeType = NODE_TYPES.find(t => t.type === node.data.type);
      const category = nodeType?.category;
      
      if (category === 'trigger') return false; // Triggers can be disconnected
      
      const hasIncoming = edges.some(e => e.target === node.id);
      const hasOutgoing = edges.some(e => e.source === node.id);
      
      return !hasIncoming && !hasOutgoing;
    });
    
    if (disconnectedNodes.length > 0) {
      issues.push(`${disconnectedNodes.length} disconnected node(s)`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  };
  
  // Node context menu handler (right-click)
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setNodeToDelete(node);
    setDeleteDialogOpen(true);
  }, []);
  
  // Delete node handler
  const deleteNode = () => {
    if (!nodeToDelete) return;
    
    // Remove node
    setNodes((nds) => nds.filter((n) => n.id !== nodeToDelete.id));
    
    // Remove connected edges
    setEdges((eds) => eds.filter((e) => 
      e.source !== nodeToDelete.id && e.target !== nodeToDelete.id
    ));
    
    // Clear selection if deleted node was selected
    if (selectedNode?.id === nodeToDelete.id) {
      setSelectedNode(null);
    }
    
    setDeleteDialogOpen(false);
    setNodeToDelete(null);
    
    toast({
      title: "Node deleted",
      description: `"${nodeToDelete.data.label}" has been removed`,
    });
  };
  
  // Open test panel for selected node
  const openTestPanel = (node: Node) => {
    setTestingNode(node);
    setTestPanelOpen(true);
    setTestInput("{}");
    setTestOutput(null);
    setTestError(null);
    
    // Try to get output from previous node as sample input
    if (currentExecutionRun?.nodeExecutions) {
      const prevEdge = edges.find((e) => e.target === node.id);
      if (prevEdge) {
        const prevNodeExec = currentExecutionRun.nodeExecutions.find(
          (ne: any) => ne.nodeId === prevEdge.source
        );
        if (prevNodeExec?.output) {
          setTestInput(JSON.stringify(prevNodeExec.output, null, 2));
        }
      }
    }
  };
  
  // Test individual node
  const testNode = async () => {
    if (!testingNode || !currentFlowId) return;
    
    setIsTesting(true);
    setTestError(null);
    setTestOutput(null);
    
    try {
      const parsedInput = JSON.parse(testInput);
      
      // Execute single node via API
      const response = await fetch(`/api/flows/${currentFlowId}/test-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: testingNode.id,
          input: parsedInput,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Node test failed');
      }
      
      const result = await response.json();
      setTestOutput(result.output);
      
      toast({
        title: "Node tested successfully",
        description: `Output generated in ${result.durationMs || 0}ms`,
      });
    } catch (error: any) {
      setTestError(error.message);
      toast({
        title: "Test failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
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
        systemInstanceId: selectedSystemInstance,
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
      queryClient.invalidateQueries({ queryKey: ["/api/flows", selectedSystemInstance] });
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

  // Execute flow mutation with real-time visualization
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!currentFlowId) {
        throw new Error("Please save the flow first");
      }
      
      // Reset execution state
      setIsExecuting(true);
      setExecutedPaths(new Set());
      
      // Reset all node statuses
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: { ...node.data, executionStatus: 'pending', duration: undefined },
        }))
      );
      
      // Execute flow
      const response = await apiRequest("POST", `/api/flows/${currentFlowId}/execute`, {
        input: {},
      });
      
      return response;
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Flow executed",
        description: `Trace ID: ${data.traceId}`,
      });
      
      // Fetch execution details to animate
      if (data.traceId) {
        await animateExecution(data.traceId);
      }
      
      setIsExecuting(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Execution failed",
        description: error.message,
        variant: "destructive",
      });
      setIsExecuting(false);
    },
  });
  
  // Animate execution based on flow run data with GSAP edge effects
  const animateExecution = async (traceId: string) => {
    try {
      // Fetch flow run details
      const runResponse = await fetch(`/api/flow-runs?flowId=${currentFlowId}`);
      const runs = await runResponse.json();
      const run = runs.find((r: any) => r.traceId === traceId);
      
      if (!run || !run.nodeExecutions) return;
      
      setCurrentExecutionRun(run);
      
      // Animate nodes sequentially
      for (const nodeExec of run.nodeExecutions) {
        // Update node to 'running'
        setNodes((nds) =>
          nds.map((node) =>
            node.id === nodeExec.nodeId
              ? { ...node, data: { ...node.data, executionStatus: 'running' } }
              : node
          )
        );
        
        // Highlight incoming edge with GSAP animation
        const incomingEdge = edges.find((e) => e.target === nodeExec.nodeId);
        if (incomingEdge) {
          // Animate edge with pulsing effect using GSAP
          const edgeElement = document.querySelector(`[data-id="${incomingEdge.id}"] path`);
          if (edgeElement) {
            // Create flowing particle effect
            gsap.to(edgeElement, {
              strokeWidth: 3,
              stroke: '#10b981',
              opacity: 1,
              duration: 0.3,
              ease: 'power2.out'
            });
            
            // Pulsing glow effect
            gsap.to(edgeElement, {
              filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.8))',
              duration: 0.6,
              repeat: 2,
              yoyo: true,
              ease: 'sine.inOut'
            });
          }
          
          setEdges((eds) =>
            eds.map((edge) =>
              edge.id === incomingEdge.id
                ? { 
                    ...edge, 
                    animated: true, 
                    style: { 
                      stroke: '#10b981', 
                      strokeWidth: 3,
                      filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))'
                    } 
                  }
                : edge
            )
          );
          setExecutedPaths((prev) => {
            const newSet = new Set(prev);
            newSet.add(incomingEdge.id);
            return newSet;
          });
        }
        
        // Wait to show animation
        await new Promise((resolve) => setTimeout(resolve, 600));
        
        // Update node to final status
        setNodes((nds) =>
          nds.map((node) =>
            node.id === nodeExec.nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    executionStatus: nodeExec.status,
                    duration: nodeExec.durationMs,
                  },
                }
              : node
          )
        );
      }
    } catch (error) {
      console.error('Failed to animate execution:', error);
    }
  };

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
          <SystemInstanceSelector
            value={selectedSystemInstance}
            onValueChange={setSelectedSystemInstance}
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
            onClick={() => {
              const flowValidation = validateFlowStructure();
              if (!flowValidation.valid) {
                toast({
                  title: "Flow validation issues",
                  description: flowValidation.issues.join(', '),
                  variant: "destructive",
                });
                return;
              }
              executeMutation.mutate();
            }}
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
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
              style: { 
                strokeWidth: 3,
                stroke: 'hsl(var(--primary) / 0.6)',
              },
            }}
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
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">
                  {nodes.length} nodes, {edges.length} connections
                </div>
                {nodes.length > 0 && (() => {
                  const flowValidation = validateFlowStructure();
                  return (
                    <div className={`text-xs font-medium flex items-center gap-1 ${
                      flowValidation.valid 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {flowValidation.valid ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Valid flow structure</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" />
                          <span>{flowValidation.issues.length} issue(s)</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </Panel>
            
            {/* Selected Node Actions Panel */}
            <AnimatePresence>
              {selectedNode && (
                <Panel position="bottom-center">
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="bg-background/95 backdrop-blur p-3 rounded-lg border border-border shadow-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{String(selectedNode.data.label)}</span>
                      <Separator orientation="vertical" className="h-6" />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfigDialogOpen(true)}
                      >
                        <Settings className="w-3 h-3 mr-1" />
                        Configure
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedNode(null)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </motion.div>
                </Panel>
              )}
            </AnimatePresence>
            
            {/* Floating Action Button - Test Node (Lower Right) */}
            <AnimatePresence>
              {selectedNode && (() => {
                const testValidation = canTestNode(selectedNode);
                const isEnabled = testValidation.valid;
                
                return (
                  <Panel position="bottom-right">
                    <motion.div
                      initial={{ opacity: 0, scale: 0, rotate: -90 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0, rotate: 90 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      whileHover={{ scale: isEnabled ? 1.1 : 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="relative">
                        <Button
                          size="lg"
                          className={`rounded-full w-14 h-14 shadow-2xl transition-all ${
                            isEnabled 
                              ? 'bg-primary hover:bg-primary/90' 
                              : 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-60'
                          }`}
                          disabled={!isEnabled}
                          onClick={() => {
                            if (isEnabled) {
                              openTestPanel(selectedNode);
                            }
                          }}
                          data-testid="fab-test-node"
                        >
                          <Beaker className="w-6 h-6" />
                        </Button>
                        
                        {/* Validation tooltip */}
                        {!isEnabled && testValidation.reason && (
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-md px-3 py-2 shadow-lg"
                          >
                            <div className="text-xs font-medium text-amber-900 dark:text-amber-100">
                              ⚠️ {testValidation.reason}
                            </div>
                          </motion.div>
                        )}
                        
                        {/* Valid indicator */}
                        {isEnabled && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background"
                          >
                            <motion.div
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="w-full h-full bg-green-400 rounded-full opacity-75"
                            />
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  </Panel>
                );
              })()}
            </AnimatePresence>
            
            {/* Radial Node Suggestions Menu (Make.com style) */}
            <AnimatePresence>
              {showNodeSuggestions && connectionSource && cursorPosition && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: cursorPosition.x,
                    top: cursorPosition.y,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="relative pointer-events-auto"
                  >
                    {/* Center dot */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full z-20" />
                    
                    {/* Radial menu segments */}
                    <div className="relative w-[280px] h-[280px]">
                      {getCompatibleNodeTypes(connectionSource.nodeId).map((nodeType, index, array) => {
                        const totalNodes = array.length;
                        const angleStep = (2 * Math.PI) / totalNodes;
                        const angle = index * angleStep - Math.PI / 2; // Start from top
                        const radius = 100; // Distance from center
                        
                        const x = Math.cos(angle) * radius;
                        const y = Math.sin(angle) * radius;
                        
                        return (
                          <motion.div
                            key={nodeType.type}
                            initial={{ scale: 0, x: 0, y: 0 }}
                            animate={{ scale: 1, x, y }}
                            exit={{ scale: 0, x: 0, y: 0 }}
                            transition={{ 
                              delay: index * 0.03,
                              type: 'spring',
                              stiffness: 400,
                              damping: 20
                            }}
                            whileHover={{ scale: 1.15, zIndex: 50 }}
                            whileTap={{ scale: 0.95 }}
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                            onClick={() => {
                              if (cursorPosition && reactFlowWrapper.current) {
                                // Convert screen coordinates to flow coordinates
                                const bounds = reactFlowWrapper.current.getBoundingClientRect();
                                const position = {
                                  x: cursorPosition.x,
                                  y: cursorPosition.y,
                                };
                                addNodeWithConnection(nodeType.type, position);
                              }
                            }}
                          >
                            <div 
                              className="group relative px-3 py-2 rounded-lg border-2 bg-card shadow-lg min-w-[120px]"
                              style={{ borderColor: nodeType.color }}
                            >
                              {/* Connecting line from center */}
                              <svg
                                className="absolute left-1/2 top-1/2 pointer-events-none"
                                style={{
                                  width: `${Math.abs(x) + 60}px`,
                                  height: `${Math.abs(y) + 40}px`,
                                  transform: `translate(${x > 0 ? '-100%' : '0%'}, ${y > 0 ? '-100%' : '0%'})`,
                                }}
                              >
                                <line
                                  x1={x > 0 ? '100%' : '0%'}
                                  y1={y > 0 ? '100%' : '0%'}
                                  x2={x > 0 ? `${(60 / (Math.abs(x) + 60)) * 100}%` : `${100 - (60 / (Math.abs(x) + 60)) * 100}%`}
                                  y2={y > 0 ? `${(40 / (Math.abs(y) + 40)) * 100}%` : `${100 - (40 / (Math.abs(y) + 40)) * 100}%`}
                                  stroke={nodeType.color}
                                  strokeWidth="2"
                                  strokeDasharray="4 2"
                                  opacity="0.4"
                                />
                              </svg>
                              
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: nodeType.color }}
                                />
                                <div className="font-medium text-xs whitespace-nowrap">
                                  {nodeType.label}
                                </div>
                              </div>
                              
                              {/* Category badge */}
                              <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                                {nodeType.category}
                              </div>
                              
                              {/* Hover glow effect */}
                              <div 
                                className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-30 transition-opacity"
                                style={{ 
                                  backgroundColor: nodeType.color,
                                  filter: 'blur(8px)',
                                }}
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    
                    {/* Cancel button at center */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/95 backdrop-blur border-2 border-border shadow-lg hover:bg-destructive hover:text-destructive-foreground z-30"
                      onClick={() => {
                        setShowNodeSuggestions(false);
                        setConnectionSource(null);
                        setCursorPosition(null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    
                    {/* Instruction text */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="absolute left-1/2 -translate-x-1/2 top-full mt-6 text-xs text-muted-foreground bg-background/90 backdrop-blur px-3 py-1 rounded-md border border-border whitespace-nowrap"
                    >
                      Click a node to add and connect
                    </motion.div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </ReactFlow>
        </div>
      </div>

      {/* Node Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-node-config">
          <DialogHeader>
            <DialogTitle>Configure {String(selectedNode?.data?.label || "Node")}</DialogTitle>
            <DialogDescription>
              Edit the configuration for this node
            </DialogDescription>
          </DialogHeader>
          <DynamicNodeConfig
            node={selectedNode}
            onSave={saveNodeConfig}
            onCancel={() => setConfigDialogOpen(false)}
            systemInstanceId={selectedSystemInstance}
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
      
      {/* Phase 2: Test Node Panel */}
      <Dialog open={testPanelOpen} onOpenChange={setTestPanelOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]" data-testid="dialog-test-node">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Beaker className="w-5 h-5" />
              Test Node: {String(testingNode?.data.label || 'Node')}
            </DialogTitle>
            <DialogDescription>
              Test this node with sample input data
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Input Panel */}
            <div className="space-y-2">
              <Label className="text-blue-700 font-semibold">Input Data</Label>
              <Textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                className="font-mono text-xs h-64"
                placeholder='{"key": "value"}'
              />
            </div>
            
            {/* Output Panel */}
            <div className="space-y-2">
              <Label className="text-green-700 font-semibold">Output Data</Label>
              <AnimatePresence mode="wait">
                {testOutput ? (
                  <motion.pre
                    key="output-success"
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="font-mono text-xs h-64 overflow-auto p-3 bg-green-50 border border-green-200 rounded-md"
                  >
                    {JSON.stringify(testOutput, null, 2)}
                  </motion.pre>
                ) : testError ? (
                  <motion.div
                    key="output-error"
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="h-64 flex items-center justify-center bg-red-50 border border-red-200 rounded-md p-4"
                  >
                    <div className="text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                      >
                        <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                      </motion.div>
                      <p className="text-sm text-red-700">{testError}</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="output-idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-64 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-md"
                  >
                    <p className="text-sm text-muted-foreground">Click "Run Test" to see output</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTestPanelOpen(false)}
            >
              Close
            </Button>
            <Button
              onClick={testNode}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Node Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-node">
          <DialogHeader>
            <DialogTitle>Delete Node</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this node? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              <div>
                <p className="font-semibold">{String(nodeToDelete?.data.label || 'Node')}</p>
                <p className="text-sm text-muted-foreground">ID: {nodeToDelete?.id}</p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setNodeToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteNode}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Node configuration form component
// Uses DynamicNodeConfig to automatically render forms from YAML definitions
function NodeConfigForm({
  node,
  onSave,
  onCancel,
  systemInstanceId,
}: {
  node: Node | null;
  onSave: (config: Record<string, any>) => void;
  onCancel: () => void;
  systemInstanceId?: string;
}): JSX.Element | null {
  if (!node) return null;

  // Use DynamicNodeConfig for most node types (reads from YAML)
  const dynamicNodeTypes = [
    "manual_trigger", "scheduler", "sftp_poller", "azure_blob_poller", "database_poller",
    "xml_parser", "json_builder", "csv_parser", "object_mapper", "custom_javascript",
    "validation", "conditional", "logger", "interface_source", "interface_destination",
    "sftp_connector", "azure_blob_connector", "database_connector",
    "bydm_parser", "bydm_mapper", "distributor",
    "http_request", "email_notification", "error_handler"
  ];

  if (typeof node.data.type === 'string' && dynamicNodeTypes.includes(node.data.type)) {
    return (
      <DynamicNodeConfig
        node={node}
        onSave={onSave}
        onCancel={onCancel}
        systemInstanceId={systemInstanceId}
      />
    );
  }

  // Legacy hardcoded configs for special cases (data_source, ingress, join, egress)
  const [config, setConfig] = useState<Record<string, any>>(
    node?.data.config || {}
  );

  useEffect(() => {
    setConfig(node?.data.config || {});
  }, [node]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(config);
  };

  // Render appropriate fields based on node type
  const renderConfigFields = () => {
    switch (node.data.type) {
      case "data_source":
        return <DataSourceNodeConfig config={config} setConfig={setConfig} systemInstanceId={systemInstanceId} />;

      case "ingress":
        return <IngressNodeConfig config={config} setConfig={setConfig} />;

      case "join":
        return <JoinNodeConfig config={config} setConfig={setConfig} />;

      case "egress":
        return <EgressNodeConfig config={config} setConfig={setConfig} />;

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

function ValidationNodeConfig({
  config,
  setConfig,
}: {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
}) {
  const [mode, setMode] = useState<"simple" | "advanced">(config.rules ? "advanced" : "simple");
  const [fieldRules, setFieldRules] = useState<Array<{
    field: string;
    type: string;
    required: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string;
  }>>(config.fieldRules || [{ field: "", type: "string", required: false }]);
  
  const { data: interfaces } = useQuery<any[]>({
    queryKey: ["/api/interfaces"],
  });
  
  const { data: templates } = useQuery<any[]>({
    queryKey: ["/api/interface-templates"],
  });
  
  const selectedInterface = interfaces?.find((i) => i.id === config.interfaceId);
  const selectedTemplate = templates?.find((t) => t.id === selectedInterface?.templateId);
  const conditionSchema = selectedTemplate?.conditionSchema;
  
  const addFieldRule = () => {
    const newRules = [...fieldRules, { field: "", type: "string", required: false }];
    setFieldRules(newRules);
    setConfig({ ...config, fieldRules: newRules });
  };
  
  const removeFieldRule = (index: number) => {
    const newRules = fieldRules.filter((_, i) => i !== index);
    setFieldRules(newRules);
    setConfig({ ...config, fieldRules: newRules });
  };
  
  const updateFieldRule = (index: number, updates: Partial<typeof fieldRules[0]>) => {
    const newRules = [...fieldRules];
    newRules[index] = { ...newRules[index], ...updates };
    setFieldRules(newRules);
    setConfig({ ...config, fieldRules: newRules });
  };
  
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "simple" ? "default" : "outline"}
          onClick={() => setMode("simple")}
        >
          Simple Mode
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "advanced" ? "default" : "outline"}
          onClick={() => setMode("advanced")}
        >
          Advanced Mode
        </Button>
      </div>
      
      {mode === "simple" ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="interfaceId">Interface (Optional)</Label>
            <Select
              value={config.interfaceId || "none"}
              onValueChange={(value) =>
                setConfig({ ...config, interfaceId: value === "none" ? undefined : value })
              }
            >
              <SelectTrigger id="interfaceId" data-testid="select-interface">
                <SelectValue placeholder="No interface selected (manual fields)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No interface (manual)</SelectItem>
                {interfaces?.map((iface) => (
                  <SelectItem key={iface.id} value={iface.id}>
                    {iface.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Separator />
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Field Validation Rules</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addFieldRule}
                data-testid="button-add-field-rule"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Field
              </Button>
            </div>
            
            {fieldRules.map((rule, index) => (
              <Card key={index} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`field-${index}`}>Field Name</Label>
                      {conditionSchema ? (
                        <Select
                          value={rule.field}
                          onValueChange={(value) =>
                            updateFieldRule(index, { field: value })
                          }
                        >
                          <SelectTrigger id={`field-${index}`}>
                            <SelectValue placeholder="Select field..." />
                          </SelectTrigger>
                          <SelectContent>
                            {conditionSchema.fields.map((field: any) => (
                              <SelectItem key={field.name} value={field.name}>
                                {field.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`field-${index}`}
                          value={rule.field}
                          onChange={(e) =>
                            updateFieldRule(index, { field: e.target.value })
                          }
                          placeholder="e.g., email"
                          data-testid={`input-field-${index}`}
                        />
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor={`type-${index}`}>Data Type</Label>
                      <Select
                        value={rule.type}
                        onValueChange={(value) =>
                          updateFieldRule(index, { type: value })
                        }
                      >
                        <SelectTrigger id={`type-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="url">URL</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {fieldRules.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeFieldRule(index)}
                      data-testid={`button-remove-field-${index}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.required}
                      onChange={(e) =>
                        updateFieldRule(index, { required: e.target.checked })
                      }
                      className="w-4 h-4"
                      data-testid={`checkbox-required-${index}`}
                    />
                    <span className="text-sm">Required</span>
                  </label>
                </div>
                
                {(rule.type === "string" || rule.type === "email" || rule.type === "url") && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`minLength-${index}`}>Min Length</Label>
                      <Input
                        id={`minLength-${index}`}
                        type="number"
                        value={rule.minLength || ""}
                        onChange={(e) =>
                          updateFieldRule(index, { minLength: Number(e.target.value) || undefined })
                        }
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`maxLength-${index}`}>Max Length</Label>
                      <Input
                        id={`maxLength-${index}`}
                        type="number"
                        value={rule.maxLength || ""}
                        onChange={(e) =>
                          updateFieldRule(index, { maxLength: Number(e.target.value) || undefined })
                        }
                        placeholder="Unlimited"
                      />
                    </div>
                  </div>
                )}
                
                {rule.type === "number" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`min-${index}`}>Minimum Value</Label>
                      <Input
                        id={`min-${index}`}
                        type="number"
                        value={rule.min || ""}
                        onChange={(e) =>
                          updateFieldRule(index, { min: Number(e.target.value) || undefined })
                        }
                        placeholder="No minimum"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`max-${index}`}>Maximum Value</Label>
                      <Input
                        id={`max-${index}`}
                        type="number"
                        value={rule.max || ""}
                        onChange={(e) =>
                          updateFieldRule(index, { max: Number(e.target.value) || undefined })
                        }
                        placeholder="No maximum"
                      />
                    </div>
                  </div>
                )}
                
                {rule.type === "string" && (
                  <div>
                    <Label htmlFor={`pattern-${index}`}>Pattern (Regex - Optional)</Label>
                    <Input
                      id={`pattern-${index}`}
                      value={rule.pattern || ""}
                      onChange={(e) =>
                        updateFieldRule(index, { pattern: e.target.value || undefined })
                      }
                      placeholder="^[A-Z].*"
                      className="font-mono text-sm"
                    />
                  </div>
                )}
                
                <div>
                  <Label htmlFor={`enum-${index}`}>Allowed Values (Optional)</Label>
                  <Input
                    id={`enum-${index}`}
                    value={rule.enum || ""}
                    onChange={(e) =>
                      updateFieldRule(index, { enum: e.target.value || undefined })
                    }
                    placeholder="active,pending,closed (comma-separated)"
                  />
                </div>
              </Card>
            ))}
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.strictMode || false}
                onChange={(e) =>
                  setConfig({ ...config, strictMode: e.target.checked })
                }
                className="w-4 h-4"
                data-testid="checkbox-strict-mode"
              />
              <span className="text-sm font-medium">Strict Mode</span>
              <span className="text-xs text-muted-foreground">(Reject extra fields)</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.continueOnError || false}
                onChange={(e) =>
                  setConfig({ ...config, continueOnError: e.target.checked })
                }
                className="w-4 h-4"
                data-testid="checkbox-continue-on-error"
              />
              <span className="text-sm font-medium">Continue on Error</span>
              <span className="text-xs text-muted-foreground">(Pass invalid data to error output)</span>
            </label>
          </div>
        </div>
      ) : (
        <div>
          <Label htmlFor="rules">Validation Rules (YAML)</Label>
          <Textarea
            id="rules"
            value={config.rules || ""}
            onChange={(e) =>
              setConfig({ ...config, rules: e.target.value })
            }
            placeholder="field_name:\n  type: string\n  required: true\n  minLength: 5"
            className="font-mono text-sm"
            rows={12}
            data-testid="input-validation-rules"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Types: string, number, boolean, email, url, date
          </p>
        </div>
      )}
    </div>
  );
}

// Data Source Node Config Component
function DataSourceNodeConfig({
  config,
  setConfig,
  systemInstanceId,
}: {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
  systemInstanceId?: string;
}) {
  const { data: dataSources, isLoading } = useQuery<any[]>({
    queryKey: ["/api/data-source-schemas", systemInstanceId],
    queryFn: async () => {
      const url = systemInstanceId
        ? `/api/data-source-schemas?systemInstanceId=${systemInstanceId}`
        : "/api/data-source-schemas";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch data sources");
      return response.json();
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="dataSourceId">Select Data Source</Label>
        <Select
          value={config.dataSourceId || ""}
          onValueChange={(value) => {
            const source = dataSources?.find((s) => s.id === value);
            setConfig({ 
              ...config, 
              dataSourceId: value,
              sourceName: source?.name,
              sourceIdentifier: source?.identifier,
            });
          }}
        >
          <SelectTrigger id="dataSourceId" data-testid="select-data-source">
            <SelectValue placeholder="Select a data source..." />
          </SelectTrigger>
          <SelectContent>
            {isLoading ? (
              <div className="p-2 text-sm text-muted-foreground">Loading...</div>
            ) : dataSources && dataSources.length > 0 ? (
              dataSources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {source.identifier}
                    </Badge>
                    <span>{source.name}</span>
                  </div>
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-muted-foreground">
                No data sources available. Upload XML/JSON to create sources.
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {config.dataSourceId && config.sourceName && (
        <div className="p-3 bg-muted rounded-md">
          <p className="text-sm font-semibold mb-1">Selected Source:</p>
          <div className="flex items-center gap-2">
            <Badge variant="default">{config.sourceIdentifier}</Badge>
            <span className="text-sm">{config.sourceName}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ConditionalNodeConfig({
  config,
  setConfig,
}: {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
}) {
  const [mode, setMode] = useState<"simple" | "advanced">(config.conditions ? "advanced" : "simple");
  
  const { data: interfaces } = useQuery<any[]>({
    queryKey: ["/api/interfaces"],
  });
  
  const { data: templates } = useQuery<any[]>({
    queryKey: ["/api/interface-templates"],
  });
  
  const selectedInterface = interfaces?.find((i) => i.id === config.interfaceId);
  const selectedTemplate = templates?.find((t) => t.id === selectedInterface?.templateId);
  const conditionSchema = selectedTemplate?.conditionSchema;
  const selectedField = conditionSchema?.fields?.find((f: any) => f.name === config.field);
  
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "simple" ? "default" : "outline"}
          onClick={() => setMode("simple")}
        >
          Simple Mode
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "advanced" ? "default" : "outline"}
          onClick={() => setMode("advanced")}
        >
          Advanced Mode
        </Button>
      </div>
      
      {mode === "simple" ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="interfaceId">Interface</Label>
            <Select
              value={config.interfaceId || ""}
              onValueChange={(value) =>
                setConfig({ ...config, interfaceId: value, field: "", operator: "", value: "" })
              }
            >
              <SelectTrigger id="interfaceId" data-testid="select-interface">
                <SelectValue placeholder="Select interface..." />
              </SelectTrigger>
              <SelectContent>
                {interfaces?.map((iface) => (
                  <SelectItem key={iface.id} value={iface.id}>
                    {iface.name}
                  </SelectItem>
                ))}
                {!interfaces?.length && (
                  <SelectItem value="none" disabled>
                    No interfaces available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Select which interface's data to evaluate
            </p>
          </div>
          
          {conditionSchema && conditionSchema.rulePresets?.length > 0 && (
            <div>
              <Label htmlFor="preset">Quick Setup (Optional)</Label>
              <Select
                value=""
                onValueChange={(value) => {
                  const preset = conditionSchema.rulePresets.find((p: any) => p.name === value);
                  if (preset) {
                    setConfig({
                      ...config,
                      field: preset.condition.field,
                      operator: preset.condition.operator,
                      value: preset.condition.value,
                    });
                  }
                }}
              >
                <SelectTrigger id="preset" data-testid="select-preset">
                  <SelectValue placeholder="Choose a preset..." />
                </SelectTrigger>
                <SelectContent>
                  {conditionSchema.rulePresets.map((preset: any) => (
                    <SelectItem key={preset.name} value={preset.name}>
                      <div>
                        <div className="font-medium">{preset.name}</div>
                        {preset.description && (
                          <div className="text-xs text-muted-foreground">
                            {preset.description}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {conditionSchema ? (
            <>
              <div>
                <Label htmlFor="field">Field</Label>
                <Select
                  value={config.field || ""}
                  onValueChange={(value) =>
                    setConfig({ ...config, field: value })
                  }
                >
                  <SelectTrigger id="field" data-testid="select-field">
                    <SelectValue placeholder="Select field..." />
                  </SelectTrigger>
                  <SelectContent>
                    {conditionSchema.fields.map((field: any) => (
                      <SelectItem key={field.name} value={field.name}>
                        <div>
                          <div>{field.name}</div>
                          {field.description && (
                            <div className="text-xs text-muted-foreground">
                              {field.description}
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="operator">Operator</Label>
                <Select
                  value={config.operator || ""}
                  onValueChange={(value) =>
                    setConfig({ ...config, operator: value })
                  }
                >
                  <SelectTrigger id="operator" data-testid="select-operator">
                    <SelectValue placeholder="Select operator..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">equals</SelectItem>
                    <SelectItem value="not_equals">not equals</SelectItem>
                    <SelectItem value="greater_than">greater than</SelectItem>
                    <SelectItem value="less_than">less than</SelectItem>
                    <SelectItem value="in">in (list)</SelectItem>
                    <SelectItem value="contains">contains</SelectItem>
                    <SelectItem value="starts_with">starts with</SelectItem>
                    <SelectItem value="ends_with">ends with</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="value">Value</Label>
                {selectedField?.values && selectedField.values.length > 0 ? (
                  <Select
                    value={config.value || ""}
                    onValueChange={(value) =>
                      setConfig({ ...config, value })
                    }
                  >
                    <SelectTrigger id="value" data-testid="select-value">
                      <SelectValue placeholder="Select value..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedField.values.map((val: string) => (
                        <SelectItem key={val} value={val}>
                          {val}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="value"
                    type={selectedField?.type === "number" ? "number" : "text"}
                    value={config.value || ""}
                    onChange={(e) =>
                      setConfig({ ...config, value: e.target.value })
                    }
                    placeholder="Enter value..."
                    data-testid="input-value"
                  />
                )}
              </div>
            </>
          ) : config.interfaceId ? (
            <div className="text-sm text-muted-foreground p-4 border rounded-md">
              This interface doesn't have a condition schema defined. Switch to Advanced Mode to write custom YAML conditions.
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <Label htmlFor="conditions">Conditional Logic (YAML)</Label>
          <Textarea
            id="conditions"
            value={config.conditions || ""}
            onChange={(e) =>
              setConfig({ ...config, conditions: e.target.value })
            }
            placeholder="# Single condition:\nfield: status\noperator: equals\nvalue: shipped\n\n# Multiple conditions:\nconditions:\n  - field: quantity\n    operator: greater_than\n    value: 100\n  - field: region\n    operator: equals\n    value: US\nlogic: AND"
            className="font-mono text-sm"
            rows={12}
            data-testid="input-conditions"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Operators: equals, not_equals, greater_than, less_than, in, contains, starts_with, ends_with
          </p>
        </div>
      )}
    </div>
  );
}

// Distributor Node Config Component (Dynamic Router/Switch)
function DistributorNodeConfig({
  config,
  setConfig,
}: {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
}) {
  const [rules, setRules] = useState<Array<{
    value: string;
    outputName: string;
    operator: string;
  }>>(config.rules || []);

  const [fieldPath, setFieldPath] = useState(config.fieldPath || "");

  // Add new routing rule
  const addRule = () => {
    const newRules = [...rules, { value: "", outputName: "", operator: "equals" }];
    setRules(newRules);
    setConfig({ ...config, rules: newRules, fieldPath });
  };

  // Remove routing rule
  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    setRules(newRules);
    setConfig({ ...config, rules: newRules, fieldPath });
  };

  // Update routing rule
  const updateRule = (index: number, updates: Partial<typeof rules[0]>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    setRules(newRules);
    setConfig({ ...config, rules: newRules, fieldPath });
  };

  // Update field path
  const handleFieldPathChange = (value: string) => {
    setFieldPath(value);
    setConfig({ ...config, rules, fieldPath: value });
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
        <p className="text-sm font-semibold mb-1 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Configure Routing by Key Field
        </p>
        <p className="text-xs text-muted-foreground">
          The Distributor node routes payloads based on a specific field value (like warehouse ID, location code, etc.).
          Specify the key field path below and define routing rules for each possible value.
        </p>
      </div>

      <div>
        <Label htmlFor="fieldPath" className="text-base font-semibold">Key Field Path *</Label>
        <Input
          id="fieldPath"
          value={fieldPath}
          onChange={(e) => handleFieldPathChange(e.target.value)}
          placeholder="e.g., wh_id, location_id, warehouse_code"
          className="font-mono text-sm"
        />
        <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <p className="text-sm font-semibold mb-1">💡 How to specify the key field:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li><strong>Simple field:</strong> <code className="bg-muted px-1 py-0.5 rounded">wh_id</code>, <code className="bg-muted px-1 py-0.5 rounded">location_id</code>, <code className="bg-muted px-1 py-0.5 rounded">warehouse_code</code></li>
            <li><strong>Nested field (JSONPath):</strong> <code className="bg-muted px-1 py-0.5 rounded">$.data.warehouse.id</code>, <code className="bg-muted px-1 py-0.5 rounded">$.header.location_code</code></li>
            <li><strong>Array element:</strong> <code className="bg-muted px-1 py-0.5 rounded">$.items[0].warehouse_id</code></li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Common key fields:</strong> wh_id, warehouse_id, location_id, location_code, site_id, facility_code
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Routing Rules</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addRule}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Rule
          </Button>
        </div>

        {rules.length === 0 && (
          <div className="text-sm text-muted-foreground p-4 border rounded-md text-center">
            No routing rules defined. Add rules to create dynamic output ports.
          </div>
        )}

        {rules.map((rule, index) => (
          <Card key={index} className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`operator-${index}`}>Operator</Label>
                      <Select
                        value={rule.operator}
                        onValueChange={(value) =>
                          updateRule(index, { operator: value })
                        }
                      >
                        <SelectTrigger id={`operator-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">Equals (==)</SelectItem>
                          <SelectItem value="not_equals">Not Equals (!=)</SelectItem>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="starts_with">Starts With</SelectItem>
                          <SelectItem value="ends_with">Ends With</SelectItem>
                          <SelectItem value="greater_than">Greater Than (&gt;)</SelectItem>
                          <SelectItem value="less_than">Less Than (&lt;)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`value-${index}`}>Value to Match</Label>
                      <Input
                        id={`value-${index}`}
                        value={rule.value}
                        onChange={(e) =>
                          updateRule(index, { value: e.target.value })
                        }
                        placeholder="e.g., 100, WH-EAST, LOC-001"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        The exact value of the key field to match
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`outputName-${index}`}>Output Port Name</Label>
                    <Input
                      id={`outputName-${index}`}
                      value={rule.outputName}
                      onChange={(e) =>
                        updateRule(index, { outputName: e.target.value })
                      }
                      placeholder="e.g., Warehouse 100, Location East, Site NYC"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      A descriptive label for the output port on the node canvas
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeRule(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <p className="text-sm font-semibold mb-1 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Default/Fallback Path
        </p>
        <p className="text-xs text-muted-foreground">
          A permanent "Default" output port is automatically created for payloads that don't match any rules.
          Connect this to error handling or fallback logic.
        </p>
      </div>

      {rules.length > 0 && (
        <div className="p-3 bg-muted rounded-md">
          <p className="text-sm font-semibold mb-2">Output Ports Preview:</p>
          <div className="space-y-1">
            {rules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Port {index + 1}
                </Badge>
                <ArrowRight className="w-3 h-3" />
                <span className="text-sm">
                  {rule.outputName || `Unnamed ${index + 1}`}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                Default
              </Badge>
              <ArrowRight className="w-3 h-3" />
              <span className="text-sm text-muted-foreground">Fallback Path</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Ingress Node Config Component (Inbound Entry Point)
function IngressNodeConfig({
  config,
  setConfig,
}: {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-md">
        <p className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Inbound Entry Point
        </p>
        <p className="text-xs text-muted-foreground">
          This node creates an authenticated endpoint to receive payloads from external systems (e.g., SAP, WMS).
        </p>
      </div>

      <div>
        <Label htmlFor="endpointName">Endpoint Name *</Label>
        <Input
          id="endpointName"
          value={config.endpointName || ""}
          onChange={(e) => setConfig({ ...config, endpointName: e.target.value })}
          placeholder="e.g., sap_order_ingress, wms_shipment_webhook"
        />
        <p className="text-xs text-muted-foreground mt-1">
          A unique identifier for this ingress endpoint
        </p>
      </div>

      <div>
        <Label htmlFor="authMethod">Authentication Method</Label>
        <Select
          value={config.authMethod || "bearer"}
          onValueChange={(value) => setConfig({ ...config, authMethod: value })}
        >
          <SelectTrigger id="authMethod">
            <SelectValue placeholder="Select auth method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="api_key">API Key</SelectItem>
            <SelectItem value="basic">Basic Auth</SelectItem>
            <SelectItem value="none">None (Public)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="expectedFormat">Expected Payload Format</Label>
        <Select
          value={config.expectedFormat || "json"}
          onValueChange={(value) => setConfig({ ...config, expectedFormat: value })}
        >
          <SelectTrigger id="expectedFormat">
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="xml">XML</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
            <SelectItem value="text">Plain Text</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="schemaDefinition">Schema Definition (Optional)</Label>
        <Textarea
          id="schemaDefinition"
          value={config.schemaDefinition || ""}
          onChange={(e) => setConfig({ ...config, schemaDefinition: e.target.value })}
          placeholder={`Example JSON schema:
{
  "order_id": "string",
  "total": "number",
  "wh_id": "string"
}`}
          className="font-mono text-xs"
          rows={6}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Define the expected structure for validation
        </p>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <p className="text-sm font-semibold mb-1">📡 Generated Endpoint</p>
        <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
          POST /api/ingress/{config.endpointName || 'your-endpoint-name'}
        </code>
      </div>
    </div>
  );
}

// Join Node Config Component (Data Stitching/Correlation)
function JoinNodeConfig({
  config,
  setConfig,
}: {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 rounded-md">
        <p className="text-sm font-semibold mb-1 flex items-center gap-2">
          <GitMerge className="w-4 h-4" />
          Data Stitching / Correlation
        </p>
        <p className="text-xs text-muted-foreground">
          Wait for matching payloads from multiple streams and combine them into a single output.
        </p>
      </div>

      <div>
        <Label htmlFor="correlationKey" className="text-base font-semibold">Correlation Key *</Label>
        <Input
          id="correlationKey"
          value={config.correlationKey || ""}
          onChange={(e) => setConfig({ ...config, correlationKey: e.target.value })}
          placeholder="e.g., order_id, transaction_id, $.data.order_number"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          The field used to match payloads across streams (supports JSONPath)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="streamAName">Stream A Name</Label>
          <Input
            id="streamAName"
            value={config.streamAName || ""}
            onChange={(e) => setConfig({ ...config, streamAName: e.target.value })}
            placeholder="e.g., SAP Order"
          />
        </div>
        <div>
          <Label htmlFor="streamBName">Stream B Name</Label>
          <Input
            id="streamBName"
            value={config.streamBName || ""}
            onChange={(e) => setConfig({ ...config, streamBName: e.target.value })}
            placeholder="e.g., WMS Shipment"
          />
        </div>
      </div>

      <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
        <p className="text-sm font-semibold mb-1">🔀 Stream Identification (Optional)</p>
        <p className="text-xs text-muted-foreground">
          Configure how to identify which stream each payload belongs to. If not set, streams are identified by arrival order.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="streamAIdentifier" className="text-sm font-semibold">Stream A Identifier Field</Label>
          <Input
            id="streamAIdentifier"
            value={config.streamAIdentifier || ""}
            onChange={(e) => setConfig({ ...config, streamAIdentifier: e.target.value })}
            placeholder="e.g., source, $.meta.type"
            className="font-mono text-xs"
          />
          <Input
            id="streamAIdentifierValue"
            value={config.streamAIdentifierValue || ""}
            onChange={(e) => setConfig({ ...config, streamAIdentifierValue: e.target.value })}
            placeholder="Value: e.g., SAP, order"
            className="text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Example: <code className="bg-muted px-1 rounded">source=SAP</code> or <code className="bg-muted px-1 rounded">$.type=order</code>
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="streamBIdentifier" className="text-sm font-semibold">Stream B Identifier Field</Label>
          <Input
            id="streamBIdentifier"
            value={config.streamBIdentifier || ""}
            onChange={(e) => setConfig({ ...config, streamBIdentifier: e.target.value })}
            placeholder="e.g., source, $.meta.type"
            className="font-mono text-xs"
          />
          <Input
            id="streamBIdentifierValue"
            value={config.streamBIdentifierValue || ""}
            onChange={(e) => setConfig({ ...config, streamBIdentifierValue: e.target.value })}
            placeholder="Value: e.g., WMS, shipment"
            className="text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Example: <code className="bg-muted px-1 rounded">source=WMS</code> or <code className="bg-muted px-1 rounded">$.type=shipment</code>
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="timeoutMinutes">Timeout (minutes)</Label>
        <Input
          id="timeoutMinutes"
          type="number"
          value={config.timeoutMinutes || "1440"}
          onChange={(e) => setConfig({ ...config, timeoutMinutes: e.target.value })}
          placeholder="1440"
        />
        <p className="text-xs text-muted-foreground mt-1">
          How long to wait for matching payload (default: 24 hours = 1440 minutes)
        </p>
      </div>

      <div>
        <Label htmlFor="joinStrategy">Join Strategy</Label>
        <Select
          value={config.joinStrategy || "inner"}
          onValueChange={(value) => setConfig({ ...config, joinStrategy: value })}
        >
          <SelectTrigger id="joinStrategy">
            <SelectValue placeholder="Select join type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inner">Inner Join (Both required)</SelectItem>
            <SelectItem value="left">Left Join (Stream A primary)</SelectItem>
            <SelectItem value="right">Right Join (Stream B primary)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-3 bg-muted rounded-md">
        <p className="text-sm font-semibold mb-2">📥 Input Streams:</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Stream A</Badge>
            <ArrowRight className="w-3 h-3" />
            <span className="text-sm">{config.streamAName || "First Stream"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Stream B</Badge>
            <ArrowRight className="w-3 h-3" />
            <span className="text-sm">{config.streamBName || "Second Stream"}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Output: Combined payload with both streams' data
        </p>
      </div>
    </div>
  );
}

// Egress Node Config Component (Outbound Delivery)
function EgressNodeConfig({
  config,
  setConfig,
}: {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md">
        <p className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Send className="w-4 h-4" />
          Outbound Delivery
        </p>
        <p className="text-xs text-muted-foreground">
          Send the final payload to an external system (e.g., OMS, ERP, API endpoint).
        </p>
      </div>

      <div>
        <Label htmlFor="targetUrl">Target URL *</Label>
        <Input
          id="targetUrl"
          value={config.targetUrl || ""}
          onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
          placeholder="https://oms.example.com/api/orders"
          type="url"
        />
      </div>

      <div>
        <Label htmlFor="httpMethod">HTTP Method</Label>
        <Select
          value={config.httpMethod || "POST"}
          onValueChange={(value) => setConfig({ ...config, httpMethod: value })}
        >
          <SelectTrigger id="httpMethod">
            <SelectValue placeholder="Select method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="GET">GET</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="outboundAuthMethod">Authentication Method</Label>
        <Select
          value={config.outboundAuthMethod || "none"}
          onValueChange={(value) => setConfig({ ...config, outboundAuthMethod: value })}
        >
          <SelectTrigger id="outboundAuthMethod">
            <SelectValue placeholder="Select auth method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="api_key">API Key (Header)</SelectItem>
            <SelectItem value="basic">Basic Auth</SelectItem>
            <SelectItem value="oauth2">OAuth 2.0</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.outboundAuthMethod === "bearer" && (
        <div>
          <Label htmlFor="authTokenUrl">Auth Token URL (Optional)</Label>
          <Input
            id="authTokenUrl"
            value={config.authTokenUrl || ""}
            onChange={(e) => setConfig({ ...config, authTokenUrl: e.target.value })}
            placeholder="https://oms.example.com/oauth/token"
            type="url"
          />
          <p className="text-xs text-muted-foreground mt-1">
            If specified, will call this endpoint first to obtain a token
          </p>
        </div>
      )}

      {config.outboundAuthMethod === "api_key" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="apiKeyHeader">Header Name</Label>
            <Input
              id="apiKeyHeader"
              value={config.apiKeyHeader || ""}
              onChange={(e) => setConfig({ ...config, apiKeyHeader: e.target.value })}
              placeholder="X-API-Key"
            />
          </div>
          <div>
            <Label htmlFor="apiKeyValue">API Key Value</Label>
            <Input
              id="apiKeyValue"
              type="password"
              value={config.apiKeyValue || ""}
              onChange={(e) => setConfig({ ...config, apiKeyValue: e.target.value })}
              placeholder="Enter API key"
            />
          </div>
        </div>
      )}

      {config.outboundAuthMethod === "basic" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="basicAuthUsername">Username</Label>
            <Input
              id="basicAuthUsername"
              value={config.basicAuthUsername || ""}
              onChange={(e) => setConfig({ ...config, basicAuthUsername: e.target.value })}
              placeholder="username"
            />
          </div>
          <div>
            <Label htmlFor="basicAuthPassword">Password</Label>
            <Input
              id="basicAuthPassword"
              type="password"
              value={config.basicAuthPassword || ""}
              onChange={(e) => setConfig({ ...config, basicAuthPassword: e.target.value })}
              placeholder="password"
            />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="contentType">Content-Type</Label>
        <Select
          value={config.contentType || "application/json"}
          onValueChange={(value) => setConfig({ ...config, contentType: value })}
        >
          <SelectTrigger id="contentType">
            <SelectValue placeholder="Select content type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="application/json">application/json</SelectItem>
            <SelectItem value="application/xml">application/xml</SelectItem>
            <SelectItem value="text/plain">text/plain</SelectItem>
            <SelectItem value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="customHeaders">Custom Headers (JSON)</Label>
        <Textarea
          id="customHeaders"
          value={config.customHeaders || ""}
          onChange={(e) => setConfig({ ...config, customHeaders: e.target.value })}
          placeholder={`{\n  "X-Custom-Header": "value",\n  "X-Request-ID": "{{uuid}}"\n}`}
          className="font-mono text-xs"
          rows={4}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="retryOnFailure"
          checked={config.retryOnFailure || false}
          onChange={(e) => setConfig({ ...config, retryOnFailure: e.target.checked })}
          className="rounded"
        />
        <Label htmlFor="retryOnFailure" className="cursor-pointer">
          Retry on failure (max 3 attempts)
        </Label>
      </div>
    </div>
  );
}

// SFTP Poller Node Config Component
function SftpPollerNodeConfig({
  config,
  setConfig,
}: {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-md">
        <p className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Server className="w-4 h-4" />
          SFTP File Watcher
        </p>
        <p className="text-xs text-muted-foreground">
          Watches an SFTP directory and triggers the flow when new files appear (e.g., WMS shipping labels).
        </p>
      </div>

      <div>
        <Label htmlFor="sftpHost">SFTP Host *</Label>
        <Input
          id="sftpHost"
          value={config.sftpHost || ""}
          onChange={(e) => setConfig({ ...config, sftpHost: e.target.value })}
          placeholder="sftp.example.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="sftpPort">Port</Label>
          <Input
            id="sftpPort"
            type="number"
            value={config.sftpPort || "22"}
            onChange={(e) => setConfig({ ...config, sftpPort: e.target.value })}
            placeholder="22"
          />
        </div>
        <div>
          <Label htmlFor="sftpUsername">Username</Label>
          <Input
            id="sftpUsername"
            value={config.sftpUsername || ""}
            onChange={(e) => setConfig({ ...config, sftpUsername: e.target.value })}
            placeholder="username"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="sftpPassword">Password / Private Key</Label>
        <Input
          id="sftpPassword"
          type="password"
          value={config.sftpPassword || ""}
          onChange={(e) => setConfig({ ...config, sftpPassword: e.target.value })}
          placeholder="••••••••"
        />
      </div>

      <div>
        <Label htmlFor="watchDirectory">Directory to Watch *</Label>
        <Input
          id="watchDirectory"
          value={config.watchDirectory || ""}
          onChange={(e) => setConfig({ ...config, watchDirectory: e.target.value })}
          placeholder="/outbound/shipping_labels"
        />
      </div>

      <div>
        <Label htmlFor="filePattern">File Pattern (glob)</Label>
        <Input
          id="filePattern"
          value={config.filePattern || ""}
          onChange={(e) => setConfig({ ...config, filePattern: e.target.value })}
          placeholder="*.pdf, *.xml, order_*.csv"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Leave empty to watch all files
        </p>
      </div>

      <div>
        <Label htmlFor="pollInterval">Poll Interval (seconds)</Label>
        <Input
          id="pollInterval"
          type="number"
          value={config.pollInterval || "30"}
          onChange={(e) => setConfig({ ...config, pollInterval: e.target.value })}
          placeholder="30"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="deleteAfterProcessing"
          checked={config.deleteAfterProcessing || false}
          onChange={(e) => setConfig({ ...config, deleteAfterProcessing: e.target.checked })}
          className="rounded"
        />
        <Label htmlFor="deleteAfterProcessing" className="cursor-pointer">
          Delete file after successful processing
        </Label>
      </div>
    </div>
  );
}
