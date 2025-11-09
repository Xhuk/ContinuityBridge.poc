# ContinuityBridge - Middleware POC

A proof-of-concept middleware system that receives XML IFD payloads from WMS JDA 2018, transforms them to canonical JSON, applies intelligent warehouse routing logic, and dispatches to multiple destinations (SAP, 3PL, Meli, Amazon).

## Features

- **XML Transformation**: Converts XML IFD payloads to canonical JSON using YAML-based mapping configuration
- **Warehouse Decision Engine**: Selects optimal warehouse based on location, stock, SLA, and cost
- **Swappable Queue Backends**: Switch between InMemory, RabbitMQ, or Kafka without code changes
- **Fan-Out Dispatch**: Simultaneously sends to multiple receivers (SAP, 3PL, Meli, Amazon)
- **Real-Time Metrics**: Track latency, throughput, queue depth, and errors
- **Dual API**: Both REST and GraphQL APIs for maximum flexibility
- **Interactive Dashboard**: React-based monitoring interface with live metrics

## Architecture

```
XML IFD Payload → Queue (InMemory/RabbitMQ/Kafka) → Worker → Pipeline:
  1. XML → Canonical JSON (via mapping.yml)
  2. Warehouse Decision (warehouses.json)
  3. Fan-Out Dispatch (SAP, 3PL, Meli, Amazon)
  4. Metrics Recording
```

## Quick Start

### Prerequisites

- Node.js 18+ (included in Replit)
- Optional: RabbitMQ or Kafka for production queue backends

### Installation & Run (Replit)

The application is pre-configured to run on Replit:

1. Click **Run** button - this will:
   - Install all dependencies
   - Start the API server on port 5000
   - Start the React dashboard on port 5173
   - Initialize the InMemory queue (default)

2. Access the dashboard at the provided URL

### Installation & Run (Windows)

For local Windows development:

```powershell
.\install-and-run.ps1
```

This script will:
- Install Node.js dependencies
- Start the API server
- Start the worker process
- Start the React development server

## Environment Variables

### Queue Backend Selection

```bash
QUEUE_BACKEND=inmemory|rabbit|kafka  # Default: inmemory
```

### RabbitMQ Configuration

```bash
RABBIT_URL=amqps://user:pass@host/vhost
RABBIT_QUEUE_IN=items.inbound
RABBIT_QUEUE_OUT=items.outbound
```

### Kafka Configuration

```bash
KAFKA_BROKERS=host1:9092,host2:9092
KAFKA_USER=your_user
KAFKA_PASS=your_password
KAFKA_GROUP_ID=continuitybridge
KAFKA_TOPIC_IN=items.inbound
KAFKA_TOPIC_OUT=items.outbound
```

### Worker Configuration

```bash
WORKER_CONCURRENCY=3  # Number of parallel workers (1-100)
```

## API Endpoints

### REST API

#### POST /api/items/ifd
Process XML IFD payload

**Request:**
```json
{
  "xml": "<?xml version=\"1.0\"?>..."
}
```

**Response:**
```json
{
  "ok": true,
  "traceId": "uuid",
  "canonical": { ... }
}
```

#### GET /api/metrics
Get current metrics snapshot

**Response:**
```json
{
  "avgLatencyMs": 45.2,
  "p95LatencyMs": 120.5,
  "tps": 15.3,
  "inDepth": 5,
  "outDepth": 2,
  "errors": 0,
  "totalProcessed": 1234
}
```

#### GET /api/events
Get all processing events

#### GET /api/decisions
Get warehouse routing decisions

#### POST /api/worker/toggle
Start/stop the worker process

#### POST /api/worker/concurrency
Update worker concurrency level

### GraphQL API

Access GraphiQL at `/graphql`

**Queries:**
- `kpis`: Get current KPIs
- `recentEvents(limit: Int)`: Get recent events
- `decisions`: Get routing decisions

**Mutations:**
- `processItemIFD(xml: String!)`: Process XML payload
- `replayEvent(id: ID!)`: Replay a specific event
- `setWorker(enabled: Boolean!, concurrency: Int)`: Control worker
- `setQueueBackend(backend: String!)`: Switch queue backend

## Dashboard Pages

### 1. Dashboard
- 4 KPI cards (Avg Latency, P95, TPS, Errors)
- Real-time performance charts
- Queue depth visualization
- Recent activity log

### 2. Events
- Searchable event history table
- Event replay functionality
- Status indicators
- Pagination

### 3. Queue & Worker
- Worker toggle (on/off)
- Concurrency controls
- Real-time queue depth
- Throughput metrics

### 4. Ingest XML
- XML input textarea
- Sample XML loader
- Validation feedback
- Response viewer with syntax highlighting

## Queue Backend Comparison

### InMemory (Default - Demo Only)
- **Pros**: Fast, zero configuration, perfect for POC
- **Cons**: Non-persistent, limited capacity (~100k messages)
- **Use Case**: Development, testing, demos
- **Memory**: ~1GB RAM per 100k messages

### RabbitMQ / LavinMQ
- **Pros**: Persistent, reliable, message replay
- **Cons**: Requires separate service
- **Use Case**: Production deployments
- **Supports**: Message persistence, clustering, HA

### Kafka
- **Pros**: High throughput, distributed, scalable
- **Cons**: Complex setup, higher resource usage
- **Use Case**: High-volume production
- **Supports**: Partitioning, stream processing, retention

## Switching Queue Backends

Simply change the environment variable:

```bash
# Use InMemory
QUEUE_BACKEND=inmemory npm run dev

# Use RabbitMQ
QUEUE_BACKEND=rabbit RABBIT_URL=amqps://... npm run dev

# Use Kafka
QUEUE_BACKEND=kafka KAFKA_BROKERS=host:9092 npm run dev
```

No code changes required! The same business logic works across all backends.

## Sample Data

### Warehouses
- 5 pre-configured warehouses with different locations, stock levels, SLA, and costs
- Located in: San Francisco, Los Angeles, New York, Chicago, Dallas

### Sample XML
See `examples/item.sample.xml` for a complete IFD payload example.

### Canonical Output
See `canonical.sample.json` for the expected JSON structure.

## Performance Metrics

### Latency
- **Average**: Mean processing time per item
- **P95**: 95th percentile latency (captures outliers)

### Throughput (TPS)
- Transactions per second over 1-minute rolling window

### Queue Depth
- **Inbound**: Items waiting to be processed
- **Outbound**: Items being dispatched

### Error Rate
- Failed transformations or dispatch errors

## Roadmap

### Phase 2 (Future Enhancements)
- **DLQ (Dead Letter Queue)**: Handle failed messages with retry logic
- **XSD + XLSX Mapping**: Visual mapping tool for non-technical users
- **Fake WMS UI**: Simulate JDA 2018 payload generation
- **DSL Business Rules**: Custom routing rules without code
- **Docker Compose**: Containerized deployment
- **High Availability**: Clustered setup with load balancing

## Project Structure

```
/
├── server/
│   ├── src/
│   │   ├── core/           # Pipeline, metrics, logger, types
│   │   ├── transform/      # XML to canonical transformer
│   │   ├── decision/       # Warehouse origin decider
│   │   ├── queue/          # Queue provider implementations
│   │   ├── receivers/      # SAP, 3PL, Meli, Amazon dispatchers
│   │   ├── workers/        # Worker process
│   │   ├── http/           # REST & GraphQL APIs
│   │   └── data/           # Sample data (warehouses.json, XML)
│   ├── routes.ts           # Route registration
│   └── storage.ts          # Storage interface (not used in POC)
├── client/
│   └── src/
│       ├── pages/          # Dashboard, Events, Queue, Ingest
│       ├── components/     # Reusable UI components
│       └── lib/            # Query client, utilities
├── shared/
│   └── schema.ts           # TypeScript types & Zod schemas
├── mapping.yml             # XML → JSON transformation rules
├── schema.graphql          # GraphQL type definitions
├── examples/               # Sample XML and JSON files
├── canonical.sample.json   # Expected canonical output
└── install-and-run.ps1     # Windows installation script
```

## Tech Stack

**Backend:**
- Node.js 18+ (ESM)
- TypeScript
- Express
- Apollo Server (GraphQL)
- fast-xml-parser
- js-yaml
- amqplib (RabbitMQ)
- kafkajs

**Frontend:**
- React
- Vite
- TanStack Query
- Wouter (routing)
- Recharts (visualizations)
- Tailwind CSS
- Shadcn UI

## License

MIT - This is a proof-of-concept for demonstration purposes.

## Support

For issues or questions, please open an issue in the repository.

---

**Status**: ✅ POC Ready - InMemory queue functional, dashboard operational, pipeline working end-to-end
