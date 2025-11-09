# ContinuityBridge - Project Overview

## Status: Phase 2.1 Complete ✅

**Phase 1**: Interface Registry system implemented and functional
**Phase 2.1**: Visual Flow Builder data models complete
- Flow schemas (FlowDefinition, FlowRun, FlowNode, FlowEdge) with React Flow compatibility
- YAML node catalog (8 core nodes: triggers, parsers, transforms, builders, outputs, logic)
- Portable storage interface with in-memory implementation (offline-capable, Docker-ready)

## Purpose
ContinuityBridge is a fully configurable bi-directional integration hub that connects WMS, Oracle, Manhattan, Amazon, Last Mile, and other enterprise systems. It receives payloads from multiple sources (SFTP, Azure Blob, REST APIs), transforms them via configurable per-source-destination mappings, applies warehouse routing logic, and dispatches to multiple destinations with swappable queue backends.

## Recent Changes
- **2025-11-09**: Phase 2.1: Flow Builder Data Models Complete ✅
  - **Flow Schemas**: FlowDefinition (36 node types), FlowNode, FlowEdge, FlowRun
  - **Queue Trigger Support**: Flows can be triggered by queue, webhook, timer, manual, or interface
  - **Node Execution Tracking**: Per-node status, timing, input/output capture with optional timestamps
  - **YAML Node Catalog**: 8 initial nodes (interface_source, object_mapper, interface_destination, xml_parser, json_builder, custom_javascript, conditional, manual_trigger)
  - **NodeCatalog Loader**: Singleton service loads/validates YAML definitions from server/src/flow/nodes/
  - **Portable Storage**: IStorage interface + MemStorage implementation for flows/runs (offline-capable, swappable for Docker)
  
- **2025-11-09**: Phase 1: Interface Registry Complete ✅
  - **Interface Schema**: Production-ready schema supporting 7 interface types (WMS, ERP, Marketplace, TMS, 3PL, Last Mile, Custom)
  - **Protocol Support**: REST API, SOAP, GraphQL, SFTP, FTP, Webhook, Database, Message Queue
  - **Authentication**: API Key, Bearer Token, Basic Auth, OAuth2, Certificate, SSH Key
  - **Backend Service**: InterfaceManager with CRUD operations, test connectivity, event tracking
  - **REST API**: 8 endpoints for interface management (/api/interfaces/*)
  - **Interfaces UI**: Comprehensive management page with dynamic forms, test/delete functionality
  - **Data Sources UI**: SFTP/Azure Blob configuration and monitoring page
  - **Navigation**: Integrated into sidebar with 6 total pages

- **2024-01-15**: Initial MVP implementation complete
  - Full-stack architecture with Node.js + TypeScript backend and React frontend
  - Swappable queue providers (InMemory, RabbitMQ, Kafka)
  - XML-to-JSON transformation engine with YAML configuration
  - Warehouse decision engine with geolocation and stock optimization
  - Multi-receiver dispatch system (SAP, 3PL, Meli, Amazon)
  - Real-time metrics and monitoring dashboard
  - Dual API layer (REST + GraphQL)

## Architecture

### Backend Structure
```
/server/src/
├── core/               # Core business logic
│   ├── pipeline.ts     # Orchestrates: transform → decide → dispatch
│   ├── metrics.ts      # Collects latency, TPS, queue depth, errors
│   ├── logger.ts       # Structured logging
│   └── types.ts        # TypeScript interfaces
├── interfaces/         # Interface management (NEW)
│   └── manager.ts      # CRUD, test connectivity, event tracking
├── datasources/        # Data source management (NEW)
│   └── manager.ts      # SFTP/Azure Blob polling and file retrieval
├── transform/          # XML transformation
│   └── xml-to-canonical.ts  # Uses mapping.yml for XML→JSON
├── decision/           # Warehouse routing
│   └── origin-decider.ts    # Geolocation + stock + SLA + cost scoring
├── queue/              # Queue abstraction
│   ├── QueueProvider.ts     # Interface
│   ├── inmemory.ts          # Array-based (demo)
│   ├── rabbit.ts            # RabbitMQ/LavinMQ
│   └── kafka.ts             # Kafka
├── receivers/          # Destination systems
│   ├── sap.ts
│   ├── threepl.ts
│   ├── meli.ts
│   ├── amazon.ts
│   └── dispatch.ts          # Fan-out orchestration
├── workers/            # Background processing
│   └── worker.ts            # Configurable concurrency
└── http/               # API layer
    ├── rest.ts              # Express REST + Interface/DataSource endpoints
    ├── graphql.ts           # Apollo Server setup
    └── resolvers.ts         # GraphQL resolvers
```

### Frontend Structure
```
/client/src/
├── pages/              # Route pages
│   ├── dashboard.tsx   # KPIs + charts + queue depth
│   ├── events.tsx      # Event history table
│   ├── queue.tsx       # Worker controls + queue management
│   ├── datasources.tsx # SFTP/Azure Blob management (NEW)
│   ├── interfaces.tsx  # WMS/Oracle/Amazon/LastMile management (NEW)
│   └── ingest.tsx      # XML input + response viewer
├── components/
│   └── app-sidebar.tsx # Navigation sidebar (6 menu items)
└── lib/
    └── queryClient.ts  # TanStack Query configuration
```

### Data Flow
1. **Ingestion**: POST /api/items/ifd receives XML
2. **Validation**: fast-xml-parser validates syntax
3. **Queueing**: Enqueue to items.inbound
4. **Worker**: Consumes from queue with configurable concurrency
5. **Pipeline**:
   - Transform: XML → Canonical JSON (via mapping.yml)
   - Decide: Select optimal warehouse (warehouses.json)
   - Dispatch: Fan-out to SAP, 3PL, Meli, Amazon in parallel
   - Metrics: Record latency, TPS, errors
6. **Response**: Return canonical JSON + trace ID to client

## Key Features

### 1. Swappable Queue Backends
Switch via environment variable `QUEUE_BACKEND`:
- **inmemory**: Fast, non-persistent, demo-ready
- **rabbit**: RabbitMQ/LavinMQ with persistence
- **kafka**: High-throughput distributed streaming

### 2. Configuration-Driven Transformation
`mapping.yml` defines XML→JSON conversion:
- No hardcoded XPath logic
- Easy to modify for different XML schemas
- Supports nested objects and optional fields

### 3. Intelligent Warehouse Routing
Decision factors (weighted scoring):
- **Stock availability** (50%): Has required quantity?
- **Distance** (25%): Haversine distance to destination
- **SLA** (15%): Delivery time commitment
- **Cost** (10%): Per-unit fulfillment cost

### 4. Real-Time Metrics
- **Avg Latency**: Mean processing time
- **P95 Latency**: 95th percentile (captures outliers)
- **TPS**: Transactions per second (1-minute window)
- **Queue Depth**: Inbound/outbound message counts
- **Error Rate**: Failed transformations or dispatches

### 5. Dual API Layer
- **REST**: Direct endpoints for operations
- **GraphQL**: Flexible querying and mutations

## Environment Variables

### Core Configuration
```bash
PORT=5000
QUEUE_BACKEND=inmemory  # or rabbit, kafka
WORKER_CONCURRENCY=3
```

### RabbitMQ
```bash
RABBIT_URL=amqps://user:pass@host/vhost
RABBIT_QUEUE_IN=items.inbound
RABBIT_QUEUE_OUT=items.outbound
```

### Kafka
```bash
KAFKA_BROKERS=host1:9092,host2:9092
KAFKA_USER=username
KAFKA_PASS=password
KAFKA_GROUP_ID=continuitybridge
KAFKA_TOPIC_IN=items.inbound
KAFKA_TOPIC_OUT=items.outbound
```

## Running the Application

### Development (Replit)
Click **Run** - Everything is pre-configured!

### Local Development
```bash
npm install
npm run dev
```

Access:
- API: http://localhost:5000
- Dashboard: http://localhost:5173
- GraphQL: http://localhost:5000/graphql

## Sample Data

### Warehouses
5 locations with realistic data:
- San Francisco Hub (high stock, premium cost)
- Los Angeles Distribution (balanced)
- New York Central (large capacity)
- Chicago Midwest Hub (strategic location)
- Dallas 3PL Partner (low cost, slower SLA)

### Test XML
```xml
<?xml version="1.0"?>
<ItemFulfillmentDocument>
  <Item>
    <SKU>WIDGET-PRO-500</SKU>
    <Quantity>25</Quantity>
  </Item>
  <Destination>
    <City>San Francisco</City>
    <State>CA</State>
  </Destination>
</ItemFulfillmentDocument>
```

## Roadmap

### Phase 1: Interface Registry ✅ COMPLETE
(See completed items below)

### Phase 2.1: Flow Builder Data Models ✅ COMPLETE
✅ FlowDefinition schema with React Flow structure (nodes, edges, positions)
✅ FlowRun schema with node-level execution tracking
✅ YAML node catalog with 8 core node types
✅ NodeCatalog loader with schema validation
✅ Storage interface extensions for Flow CRUD operations
✅ Portable in-memory storage (offline-capable, Docker-ready)

### Phase 2.2: Flow Orchestrator Backend (Next)
- Install object-mapper package for field mapping
- Create FlowOrchestrator service (loads flows, executes node chains)
- Implement core node executors (InterfaceSource, ObjectMapper, InterfaceDestination, XmlParser, JsonBuilder)
- Integrate orchestrator into existing Pipeline (replace XMLToCanonicalTransformer)

### Phase 2.3: Flow REST APIs
- FlowManager backend service (CRUD, test execution, history)
- REST endpoints for flows (/api/flows/*)
- Node catalog endpoint (/api/flows/node-types)

### Phase 2.4: React Flow Visual Editor
- Flow editor page with React Flow canvas
- Dynamic node configuration forms from YAML definitions
- Flow save/load/test functionality

### Phase 2.5: Extended Node Library
- SFTP operations, API calls, custom JS sandbox, conditional routing

### Phase 1: Interface Registry ✅ COMPLETE (Previous)
✅ Interface schema supporting 7 types, 8 protocols, 7 auth methods
✅ Backend InterfaceManager with CRUD + test connectivity
✅ Data Sources manager for SFTP/Azure Blob
✅ REST API endpoints for interface/datasource management
✅ Interfaces UI with dynamic forms
✅ Data Sources UI with polling controls
✅ Sidebar navigation integration (6 pages total)

### Phase 2: Transformation Builder (Next)
- Schema for source-destination transformation mappings
- Transformation Engine backend (field mapping, custom JS)
- REST API for transformation CRUD and testing
- Transformations UI with visual mapping editor
- Template library for common WMS/ERP formats

### Phase 3: Routing Rules Engine
- Schema for routing rules (conditions, multi-target dispatch)
- Routing Engine backend (evaluate conditions, determine targets)
- Replace hardcoded dispatch.ts with dynamic routing
- Routing Rules UI with condition builder

### Phase 4: Multi-Format Support
- Format detection and conversion utilities (XML, JSON, EDI, CSV)
- Update pipeline to support multi-format transformations
- End-to-end integration testing

### Original MVP Features (Completed)
✅ XML transformation with YAML mapping
✅ Queue provider abstraction
✅ Warehouse decision engine
✅ Multi-receiver dispatch
✅ Metrics collection
✅ REST + GraphQL APIs
✅ React dashboard
✅ Worker process with concurrency control

## Technical Decisions

### Why InMemory as Default?
- Zero configuration for demos
- Instant startup
- Perfect for POC validation
- Easy to understand and debug

### Why YAML for Mapping?
- Human-readable configuration
- Easy to version control
- Non-developers can modify
- Better than hardcoded XPath

### Why Dual API (REST + GraphQL)?
- REST: Simple, direct operations
- GraphQL: Flexible client queries
- Demonstrates both patterns
- Future-proof architecture

## Performance Notes

### InMemory Queue Capacity
- ~1GB RAM per 100k messages (1KB each)
- Recommended max: 100k simultaneous messages
- Beyond that: Use RabbitMQ or Kafka

### Latency Benchmarks (InMemory)
- XML parsing: ~5-10ms
- Decision engine: ~2-5ms
- Dispatch (4 receivers): ~50-200ms
- **Total**: ~60-220ms per item

## Known Limitations

### Kafka Queue Backend
- **Race Condition on Stop**: Small window exists where messages delivered between pause() and isConsuming=false may auto-commit without processing
- **Impact**: Potential message loss during worker stop operations
- **Mitigation**: Use InMemory or RabbitMQ for POC/testing. Production Kafka implementation should use manual commits.
- **Status**: Documented limitation, acceptable for POC scope

### General
- In-memory storage: Events, decisions, and payloads are lost on server restart
- No authentication: APIs are open (suitable for internal/demo use only)
- Mock receivers: SAP, 3PL, Meli, Amazon are simulated

## User Preferences
- Language: English
- Emphasis: Clean architecture, modularity, extensibility
- Priority: Production-ready patterns over quick hacks
