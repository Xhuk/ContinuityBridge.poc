# ContinuityBridge - Project Overview

## Overview
ContinuityBridge is a configurable bi-directional integration hub designed to connect diverse enterprise systems such as WMS, Oracle, Manhattan, Amazon, and Last Mile. It ingests payloads from multiple sources (SFTP, Azure Blob, REST APIs), transforms them using configurable mappings, applies warehouse routing logic, and dispatches them to various destinations with swappable queue backends. The project aims to provide a robust, scalable, and observable solution for complex data integration challenges, supporting both linear transformation flows and advanced orchestration.

## Recent Changes (November 2025)
- **Phase 2.6 In Progress**: Unified Secrets Vault with Master Seed Encryption
  - Implemented Argon2id-based master seed system for all integration credentials
  - Created SecretService with AES-256-GCM encryption (session-based unlock)
  - Database schema: secrets_master_keys + secrets_vault with foreign key constraints
  - Supports 7 integration types: SMTP, Azure Blob, SFTP, FTP, Database, API Keys, Custom
  - Master seed never stored - only Argon2id hash with salt (64MB memory, 3 iterations, 4 parallelism)
  - Each secret encrypted with unique IV and authenticated GCM tag
  - Session unlock: user enters master seed per session, key held in memory only
  - Recovery code generation with irreversible-loss warnings
  - Type-safe payload interfaces with Zod validation for all integration types
  - Foreign key enforcement: secrets_vault.master_key_id → secrets_master_keys.id
  - Migration path planned from legacy SMTP_ENCRYPTION_KEY to unified vault
  - Customer self-service: manage SMTP, Azure, SFTP passwords without admin access
- **Phase 2.5 Complete**: Interface-Scoped Conditional Logic System
  - Implemented interface-scoped conditional logic to prevent mixing logic between adapters (e.g., Amazon conditions only work with Amazon interfaces)
  - Added conditionSchema to InterfaceTemplate type with field definitions (name, type, description, enum values) and rule presets
  - Updated Amazon SP-API template: 7 conditionable fields (sku, asin, quantity, fulfillmentChannel, marketplaceId, price, condition) + 4 rule presets (FBA routing, low inventory, US marketplace, high value items)
  - Updated MercadoLibre template: 6 conditionable fields (listing_type_id, price, available_quantity, condition, status, site_id) + 4 rule presets (premium listings, low stock, Brazil market, active listings)
  - Built ConditionalNodeConfig UI component with Simple/Advanced mode toggle
  - Simple mode: Interface selector → Field dropdown (schema-driven) → Operator dropdown → Value input (dynamic: dropdown for enums, number input for numeric fields)
  - Advanced mode: YAML textarea for power users with multi-condition support
  - Rule preset selector for quick condition setup from template presets
  - Re-enabled conditional executor safely using declarative YAML syntax (no JavaScript execution)
  - Implemented server-side validation: validates field exists in schema, operator is whitelisted, value type matches field type, enum values are valid
  - Prevents UI bypass by enforcing schema validation on backend (uses interfaceManager + InterfaceTemplateCatalog)
  - Custom interfaces without templateId allow any fields for flexibility
  - Whitelisted operators only: equals, not_equals, greater_than, less_than, in, contains, starts_with, ends_with
  - Nested field access via dot notation (e.g., "fulfillment.channel")
  - Returns conditionMet + nextBranch in metadata for flow routing
- **Phase 2.4 Complete**: Interface Template System & Enhanced Flow Nodes
  - Created YAML-based interface template library for standard marketplace integrations
  - Built 5 pre-configured templates: Amazon SP-API, MercadoLibre API, Manhattan WMS, ShipStation 3PL, FedEx Last Mile
  - Implemented InterfaceTemplateCatalog singleton for loading, validating, and caching templates
  - Added REST API endpoints: GET /api/interface-templates, GET /api/interface-templates/:id, POST /api/interface-templates/:id/instantiate
  - Template system enables customers to instantiate standard interfaces with their own credentials vs. manual configuration
  - Added CSV Parser node with configurable delimiter, quote character, header handling, and whitespace trimming
  - Added Validation node with YAML-based rules, strict mode, multi-output (valid/invalid streams), and continue-on-error support
  - Registered new node executors in FlowOrchestrator for end-to-end CSV/validation workflows
  - Templates conform to typed schema (protocols, auth blocks, secrets, endpoints, payload templates) with Zod validation
  - System supports WMS → Amazon + MercadoLibre synchronization use case
- **Phase 2.3 Complete**: React Flow-Based Visual Flow Builder UI
  - Implemented drag-and-drop flow canvas using React Flow (@xyflow/react)
  - Built Node Palette with 5 node types (Manual Trigger, XML Parser, JSON Builder, Object Mapper, Interface Call)
  - Created custom node components with color-coded styling and configuration indicators
  - Added node configuration dialogs with type-specific form fields (XPath, JSON templates, YAML mappings, interface settings)
  - Integrated flow controls: Save, Load, Execute, Clear canvas
  - Connected to backend REST API for flow CRUD operations and execution
  - Added Flow Builder navigation item to sidebar
  - Verified smooth, responsive UI with end-to-end testing via Playwright
- **RFC 7231 HTTP Methods Support**: Full REST API compliance
  - Implemented all RFC 7231 methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
  - Added idempotent PUT for complete resource replacement
  - Added HEAD for resource existence checks without body
  - Added OPTIONS for method discovery and CORS support
  - Proper HTTP status codes (200, 201, 204, 404, 501)
  - Applied to flows and interfaces endpoints
- **Phase 2.2d Complete**: Pipeline Integration with Flow Orchestrator
  - Integrated FlowOrchestrator with Pipeline for flexible transformation workflows
  - Added REST API endpoints for flow CRUD operations (GET/POST /api/flows)
  - Made warehouse decision logic conditional (only runs for CanonicalItem format)
  - Verified end-to-end flow execution through InMemory queue system
  - Successfully tested flow creation, execution, and listing via REST API

## User Preferences
- Language: English
- Emphasis: Clean architecture, modularity, extensibility
- Priority: Production-ready patterns over quick hacks

## System Architecture

### UI/UX Decisions
The frontend features a React application with a dashboard for KPIs, charts, and queue depth monitoring, an events history table, queue management, and dedicated pages for managing data sources and interfaces. A comprehensive sidebar provides navigation to all key areas. **Phase 2.3 added a visual Flow Builder** - a React Flow-based canvas where users can drag-and-drop nodes to create transformation flows, configure them via dialogs, connect them visually, and save/load/execute flows through REST API integration.

### Technical Implementations
- **Unified Secrets Vault**: Production-grade secrets management with Argon2id key derivation and AES-256-GCM encryption. User creates master seed on first launch (never stored, only hashed). Session-based unlock derives 256-bit master key in memory. Supports SMTP, Azure Blob, SFTP, FTP, Database, API keys, and custom secrets. Each secret has unique IV and GCM authentication tag. Foreign key constraints prevent orphaned secrets. Recovery code generation with explicit warnings about irrecoverable loss. Self-service management UI planned for customers to manage their own credentials without admin access.
- **Interface Template Catalog**: YAML-based library of pre-configured marketplace/enterprise system templates (Amazon SP-API, MercadoLibre, Manhattan WMS, ShipStation, FedEx). Singleton service loads templates at startup with Zod validation, provides REST API for listing/viewing/instantiating. Templates define typed protocols, authentication, required secrets, endpoint schemas, and payload templates. Enables customers to instantiate standard integrations with their credentials vs. manual interface configuration.
- **Flow Orchestrator**: A core service for executing node graphs, tracking per-node execution, and supporting conditional routing. Includes production-safe executors for manual triggers, interface operations, XML/CSV parsing, JSON building, object mapping, validation, and **interface-scoped conditionals**. CSV parser handles quoted fields, configurable delimiters, and header detection. Validation node supports YAML rule sets with type checking, pattern matching, range validation, and multi-output routing (valid/invalid streams). Conditional node uses declarative YAML syntax with server-side schema validation to prevent RCE attacks - no JavaScript execution. **Now integrated with Pipeline for end-to-end flow execution.**
- **Pipeline Integration**: The Pipeline now supports both legacy XML transformation (mode: 'xml') and modern flow-based transformation (mode: 'flow'). Warehouse decision logic is conditional - it only runs when the output matches CanonicalItem structure (itemId + destination fields). This allows flows to transform ANY data format without requiring canonical format.
- **Interface Registry**: Manages interfaces with a production-ready schema supporting various types (WMS, ERP, Marketplace, TMS, 3PL, Last Mile, Custom), protocols (REST, SOAP, GraphQL, SFTP, FTP, Webhook, Database, Message Queue), and authentication methods.
- **Data Source Management**: Handles SFTP and Azure Blob polling and file retrieval.
- **Transformation Engine**: Hybrid system supporting both legacy XML-to-canonical transformer (YAML-driven) and modern flow-based transformations (visual node graphs).
- **Decision Engine**: Implements intelligent warehouse routing based on weighted scoring factors like stock availability, distance, SLA, and cost. Only runs for CanonicalItem-formatted output.
- **Swappable Queue Backends**: Supports InMemory, RabbitMQ, and Kafka for flexible message queuing.
- **Metrics Collection**: Gathers real-time data on average latency, P95 latency, TPS, queue depth, and error rates.
- **Dual API Layer**: Provides both REST and GraphQL APIs for flexible client interaction. REST API now includes flow CRUD endpoints and interface template endpoints.
- **Backend Structure**: Organized into modules for core business logic, flow orchestration, interface management, data source management, transformation, decision making, queue abstraction, receiver systems, background workers, and the HTTP API layer.

### Feature Specifications
- **Configuration-Driven Transformation**: Uses `mapping.yml` for flexible XML-to-JSON conversion (legacy mode).
- **Flow-Based Transformation**: Visual node graph system for transforming ANY data format (XML, JSON, EDI, CSV) without code. Includes CSV parser for structured data ingestion and validation node for data quality gates.
- **Template-Based Interface Instantiation**: Pre-configured YAML templates for standard marketplace/enterprise integrations. Customers instantiate templates with their own credentials instead of manually configuring endpoints, auth, and payload formats. Templates include conditionSchema for interface-scoped conditional logic.
- **Interface-Scoped Conditional Logic**: Each canonical adapter defines allowed conditional fields and operators in its template. Conditional nodes validate field names, operators, and value types against the selected interface's schema server-side. Prevents mixing logic between adapters (Amazon conditions only work with Amazon data). Includes rule presets for common scenarios (FBA routing, low inventory alerts, marketplace filtering).
- **Intelligent Warehouse Routing**: Utilizes a weighted scoring model for optimal warehouse selection. Only applies to CanonicalItem-formatted data.
- **Real-Time Metrics**: Provides comprehensive observability into system performance.
- **Portable Storage**: Implemented with an `IStorage` interface and `MemStorage` for offline capability and Docker readiness. Supports flow definitions and flow run tracking.
- **YAML Node Catalog**: Defines core nodes (10 types) for flow building, loaded and validated by a singleton service. Includes parsers (XML, CSV), transformers (object mapper, JSON builder), validators, and interface connectors.
- **Dependency Injection Architecture**: Single-instance pattern across FlowOrchestrator, Pipeline, and Worker - all receive dependencies via constructor from composition root (routes.ts).

## External Dependencies
- **Queue Providers**: RabbitMQ, Kafka (for message queuing).
- **Apollo Server**: For GraphQL API implementation.
- **Express**: For REST API implementation.
- **TanStack Query**: For frontend data fetching and caching.
- **React Flow (@xyflow/react)**: For visual flow builder canvas and node graph rendering.
- **fast-xml-parser**: For XML syntax validation.
- **object-mapper**: For field mapping within flows.
- **Argon2**: For production-grade password hashing and key derivation (Argon2id algorithm).
- **Node.js crypto**: For AES-256-GCM symmetric encryption with authenticated encryption.