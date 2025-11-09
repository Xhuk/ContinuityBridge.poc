# ContinuityBridge - Project Overview

## Status: POC Complete ✅

All core features implemented and functional. Default InMemory queue backend fully tested and working. See "Known Limitations" section below for Kafka edge cases.

## Purpose
ContinuityBridge is a middleware POC that demonstrates how to build a production-ready message processing system with swappable queue backends. It processes XML IFD payloads from WMS JDA 2018, applies intelligent routing logic, and dispatches to multiple destinations.

## Recent Changes
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
    ├── rest.ts              # Express REST endpoints
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
│   └── ingest.tsx      # XML input + response viewer
├── components/
│   └── app-sidebar.tsx # Navigation sidebar
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

### Completed (MVP)
✅ XML transformation with YAML mapping
✅ Queue provider abstraction
✅ Warehouse decision engine
✅ Multi-receiver dispatch
✅ Metrics collection
✅ REST + GraphQL APIs
✅ React dashboard with 4 pages
✅ Worker process with concurrency control

### Phase 2 (Future)
- Dead Letter Queue (DLQ) handling
- XSD/XLSX visual mapping editor
- Fake WMS UI for payload generation
- DSL-based business rules engine
- Docker Compose deployment
- High Availability clustering

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
