# ContinuityBridge - Project Overview

## Overview
ContinuityBridge is a configurable bi-directional integration hub designed to connect diverse enterprise systems such as WMS, Oracle, Manhattan, Amazon, and Last Mile. It ingests payloads from multiple sources (SFTP, Azure Blob, REST APIs), transforms them using configurable mappings, applies warehouse routing logic, and dispatches them to various destinations with swappable queue backends. The project aims to provide a robust, scalable, and observable solution for complex data integration challenges, supporting both linear transformation flows and advanced orchestration.

## Recent Changes (November 2025)
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
- **Flow Orchestrator**: A core service for executing node graphs, tracking per-node execution, and supporting conditional routing. It includes production-safe executors for manual triggers, interface operations, XML parsing, JSON building, and object mapping. Disabled executors (conditional, custom_javascript) are security hardened to prevent RCE attacks. **Now integrated with Pipeline for end-to-end flow execution.**
- **Pipeline Integration**: The Pipeline now supports both legacy XML transformation (mode: 'xml') and modern flow-based transformation (mode: 'flow'). Warehouse decision logic is conditional - it only runs when the output matches CanonicalItem structure (itemId + destination fields). This allows flows to transform ANY data format without requiring canonical format.
- **Interface Registry**: Manages interfaces with a production-ready schema supporting various types (WMS, ERP, Marketplace, TMS, 3PL, Last Mile, Custom), protocols (REST, SOAP, GraphQL, SFTP, FTP, Webhook, Database, Message Queue), and authentication methods.
- **Data Source Management**: Handles SFTP and Azure Blob polling and file retrieval.
- **Transformation Engine**: Hybrid system supporting both legacy XML-to-canonical transformer (YAML-driven) and modern flow-based transformations (visual node graphs).
- **Decision Engine**: Implements intelligent warehouse routing based on weighted scoring factors like stock availability, distance, SLA, and cost. Only runs for CanonicalItem-formatted output.
- **Swappable Queue Backends**: Supports InMemory, RabbitMQ, and Kafka for flexible message queuing.
- **Metrics Collection**: Gathers real-time data on average latency, P95 latency, TPS, queue depth, and error rates.
- **Dual API Layer**: Provides both REST and GraphQL APIs for flexible client interaction. REST API now includes flow CRUD endpoints.
- **Backend Structure**: Organized into modules for core business logic, flow orchestration, interface management, data source management, transformation, decision making, queue abstraction, receiver systems, background workers, and the HTTP API layer.

### Feature Specifications
- **Configuration-Driven Transformation**: Uses `mapping.yml` for flexible XML-to-JSON conversion (legacy mode).
- **Flow-Based Transformation**: Visual node graph system for transforming ANY data format (XML, JSON, EDI, CSV) without code.
- **Intelligent Warehouse Routing**: Utilizes a weighted scoring model for optimal warehouse selection. Only applies to CanonicalItem-formatted data.
- **Real-Time Metrics**: Provides comprehensive observability into system performance.
- **Portable Storage**: Implemented with an `IStorage` interface and `MemStorage` for offline capability and Docker readiness. Supports flow definitions and flow run tracking.
- **YAML Node Catalog**: Defines core nodes for flow building, loaded and validated by a singleton service.
- **Dependency Injection Architecture**: Single-instance pattern across FlowOrchestrator, Pipeline, and Worker - all receive dependencies via constructor from composition root (routes.ts).

## External Dependencies
- **Queue Providers**: RabbitMQ, Kafka (for message queuing).
- **Apollo Server**: For GraphQL API implementation.
- **Express**: For REST API implementation.
- **TanStack Query**: For frontend data fetching and caching.
- **React Flow (@xyflow/react)**: For visual flow builder canvas and node graph rendering.
- **fast-xml-parser**: For XML syntax validation.
- **object-mapper**: For field mapping within flows.