# ContinuityBridge - Project Overview

## Overview
ContinuityBridge is a configurable bi-directional integration hub designed to connect diverse enterprise systems (WMS, Oracle, Manhattan, Amazon, Last Mile). It ingests data from various sources (SFTP, Azure Blob, REST APIs), transforms it using configurable mappings and visual flow builders, applies intelligent warehouse routing logic, and dispatches it to multiple destinations with swappable queue backends. The project aims to provide a robust, scalable, and observable solution for complex data integration, supporting both linear transformation flows and advanced orchestration. Key features include a unified secrets vault, template-based interface instantiation, and interface-scoped conditional logic.

## User Preferences
- Language: English
- Emphasis: Clean architecture, modularity, extensibility
- Priority: Production-ready patterns over quick hacks

## System Architecture

### UI/UX Decisions
The frontend is a React application featuring a dashboard for KPIs, event history, queue management, and dedicated pages for data source and interface management. A comprehensive sidebar provides navigation. A visual Flow Builder, implemented with React Flow, allows users to drag-and-drop nodes to create, configure, connect, and execute transformation flows.

### Technical Implementations
- **Per-System Authentication Configuration (UNREGISTERED - SECURITY BLOCKED)**: REST API routes exist in `server/src/http/system-auth-routes.ts` for managing per-system authentication configs (OAuth2, JWT, Cookie, API Key) with configurable HTTP methods and custom headers. Routes implement discriminated union validation, existence checks, and duplicate name prevention. **CRITICAL: Routes are NOT registered in production due to missing tenant ownership verification.** Requires authentication middleware to identify request tenant before routes can be safely deployed. Current state: Implementation complete, security gap documented, deployment blocked.
- **Unified Secrets Vault**: A production-grade secrets management system using Argon2id for key derivation and AES-256-GCM for encryption. It supports session-based unlocking, unique IVs per secret, and foreign key constraints. It manages credentials for various integration types including SMTP, Azure Blob, SFTP, FTP, Database, API Keys, RabbitMQ, Kafka, OAuth2, JWT, Cookie, and custom secrets. Recovery codes are generated, and a self-service UI for credential management is provided.
- **Token Lifecycle Management**: Production-ready infrastructure for automatic token refresh, caching, and lifecycle tracking. Core system includes dedicated `tokenCache` table with optimistic locking (version-based CAS), encrypted token storage via SecretsService (AES-256-GCM), and TokenLifecycleService for centralized token management. Supports preemptive refresh (<5min expiry), race-free concurrent refresh via compare-and-swap, refresh-in-flight coordination with 60s stuck-refresh timeout, and idle timeout enforcement for cookie sessions. **Status: Core lifecycle infrastructure complete and architect-approved** - awaiting RetryManager and background refresh job.
- **Authentication Adapters**: External API authentication system supporting OAuth2 (client credentials, refresh_token), JWT (HS256/HS512/RS256/RS512 signing and validation), and Cookie-based authentication. Adapters operate in three directions: inbound (validates requests to ContinuityBridge endpoints), outbound (provides tokens for external API calls), and bidirectional. Each adapter extends BaseAuthAdapter with dependency injection (storage, TokenLifecycleService, SecretsService), automatic token refresh, and configurable placement (header/query/body/cookie). **All three core adapters complete:** (1) OAuth2Adapter with client_credentials/refresh_token grants per RFC 6749, (2) JWTAdapter with timing-safe HMAC verification and binary-safe signature decoding, (3) CookieAdapter with 60-minute idle timeout and automatic session renewal. **Retry infrastructure complete:** RetryManager wraps QueueProvider with 7×2min linear retry policy, AuthErrorHandler invalidates tokens on 401/403, BackgroundTokenRefreshJob runs every 1 minute scanning for tokens expiring in <5 minutes with job-level audit logging. **Outbound provider complete:** OutboundTokenProvider.provideAuth() supplies fresh tokens via adapters, handleAuthError() invalidates on 401/403. **Inbound middleware complete:** createInboundAuthMiddleware() validates requests via per-route policies (stored in inbound_auth_policies table), uses path-to-regexp for dynamic route matching (/api/interfaces/:id/execute), supports enforcement modes (bypass/optional/required), multi-tenant (X-Auth-Adapter-ID header override), WWW-Authenticate headers, audit logging, and exposes reloadPolicies() for cache invalidation. **Status: Core auth system production-ready (MVP) - awaiting REST API integration (Task #15: policy CRUD endpoints, middleware registration, cache invalidation hooks) and UI (Task #16: settings tab with adapter management).**
- **Interface Template Catalog**: A YAML-based library of pre-configured templates for standard marketplace and enterprise integrations (e.g., Amazon SP-API, MercadoLibre). It allows customers to instantiate standard interfaces with their own credentials, defining protocols, authentication, required secrets, endpoint schemas, and payload templates. Templates include `conditionSchema` for interface-scoped conditional logic.
- **Flow Orchestrator**: A core service for executing node graphs, tracking execution, and enabling conditional routing. It includes executors for manual triggers, interface operations, XML/CSV parsing, JSON building, object mapping, validation, and interface-scoped conditionals. The CSV parser handles various formats, and the validation node supports YAML-based rules with multi-output routing. Integrated with the Pipeline for end-to-end flow execution.
- **Test File Management**: Production-ready system for uploading and managing sample data files (XML, JSON, CSV) for E2E flow testing and interface emulation. **Implementation complete:** Database schema (`system_instance_test_files` table with FK constraints, unique storage keys), SQLite migration with CASCADE deletes, DatabaseStorage layer with filesystem helpers (binary storage at `server/data/test-files/<instanceId>/<uuid>.<ext>`), REST API endpoints (GET list, POST upload with multer, GET download, DELETE) with multi-tenant security (ownership verification), quota enforcement (50 files/100MB per instance), proper error handling (400/413/429/403/404/501/500), and orphaned file cleanup on DB failures. **Status: Backend complete and architect-approved** - awaiting UI (Task #7: TestFileManager component) and orchestrator integration (Task #8: emulation mode support).
- **Pipeline Integration**: Supports both legacy XML transformation and modern flow-based transformation. Warehouse decision logic is conditional, running only when output matches the CanonicalItem structure, allowing flows to transform any data format.
- **Interface Registry**: Manages various interface types (WMS, ERP, Marketplace, etc.), protocols (REST, SFTP, Message Queue), and authentication methods.
- **Data Source Management**: Handles polling and retrieval from SFTP and Azure Blob.
- **Transformation Engine**: A hybrid system offering both XML-to-canonical transformation (YAML-driven) and visual flow-based transformations for diverse data formats.
- **Decision Engine**: Implements intelligent warehouse routing based on weighted scoring factors for CanonicalItem-formatted output.
- **Swappable Queue Backends**: Supports InMemory, RabbitMQ, and Kafka for flexible message queuing with retry support via QueueDelivery abstraction (ack/fail/deadLetter hooks). **InMemoryQueue** provides native delay support (no external deps). **RabbitQueue** requires `rabbitmq_delayed_message_exchange` plugin for delayed retries (uses x-delayed-message exchange). **KafkaQueue** uses pause/resume strategy for MVP (separate delay topic recommended for production).
- **Metrics Collection**: Gathers real-time performance data including latency, TPS, queue depth, and error rates.
- **Dual API Layer**: Provides both REST and GraphQL APIs, with the REST API supporting flow CRUD operations and interface template management.
- **Portable Storage**: Utilizes an `IStorage` interface with `MemStorage` for offline capability and Docker readiness, storing flow definitions and run tracking.
- **YAML Node Catalog**: Defines core node types (e.g., parsers, transformers, validators, interface connectors) for flow building, loaded and validated by a singleton service.
- **Dependency Injection Architecture**: Ensures a single-instance pattern for core services, receiving dependencies via constructor.

### Feature Specifications
- **Configuration-Driven Transformation**: Uses `mapping.yml` for XML-to-JSON conversion in legacy mode.
- **Flow-Based Transformation**: Visual node graph system for transforming various data formats (XML, JSON, EDI, CSV) without code, including CSV parsing and data validation.
- **Template-Based Interface Instantiation**: Pre-configured YAML templates allow customers to instantiate standard integrations with their credentials, avoiding manual configuration. Templates define `conditionSchema` for conditionals.
- **Interface-Scoped Conditional Logic**: Canonical adapters define allowed conditional fields in their templates. Conditional nodes validate against the selected interface's schema server-side, ensuring logic doesn't mix between adapters. Includes rule presets for common scenarios.
- **Intelligent Warehouse Routing**: Utilizes a weighted scoring model for optimal warehouse selection, applicable to CanonicalItem-formatted data.
- **Real-Time Metrics**: Provides comprehensive observability into system performance.
- **Portable Storage**: `IStorage` interface with `MemStorage` for flow definitions and run tracking, enabling offline and Docker-ready capabilities.
- **YAML Node Catalog**: Defines core node types (10 types) for flow building, loaded and validated by a singleton service, including parsers, transformers, validators, and interface connectors.
- **Dependency Injection Architecture**: Single-instance pattern across FlowOrchestrator, Pipeline, and Worker, with dependencies injected via constructor.

## Deployment Requirements

### Queue Backend Configuration
- **InMemoryQueue**: No external dependencies. Native delay support via poll-time filtering. **Recommended for:** Electron, Docker, standalone deployments.
- **RabbitMQ**: Requires `rabbitmq_delayed_message_exchange` plugin for delayed retries. Install via: `rabbitmq-plugins enable rabbitmq_delayed_message_exchange`. Without plugin, system will fail fast with clear error. **Recommended for:** Distributed systems with RabbitMQ infrastructure.
- **Kafka**: Works with standard Kafka cluster. Uses pause/resume for delay (MVP). Separate delay topic recommended for high-throughput production. **Recommended for:** High-volume Kafka deployments.

## External Dependencies
- **Queue Providers**: RabbitMQ (with delayed message plugin), Kafka
- **Apollo Server**: For GraphQL API.
- **Express**: For REST API.
- **TanStack Query**: For frontend data fetching.
- **React Flow (@xyflow/react)**: For visual flow builder.
- **fast-xml-parser**: For XML syntax validation.
- **object-mapper**: For field mapping.
- **Argon2**: For Argon2id key derivation.
- **Node.js crypto**: For AES-256-GCM encryption.