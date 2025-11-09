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
- **Unified Secrets Vault**: A production-grade secrets management system using Argon2id for key derivation and AES-256-GCM for encryption. It supports session-based unlocking, unique IVs per secret, and foreign key constraints. It manages credentials for various integration types including SMTP, Azure Blob, SFTP, FTP, Database, API Keys, RabbitMQ, Kafka, OAuth2, JWT, Cookie, and custom secrets. Recovery codes are generated, and a self-service UI for credential management is provided.
- **Authentication Adapters**: External API authentication system supporting OAuth2 (client credentials, authorization code), JWT (HS256/HS512/RS256/RS512 signing and validation), and Cookie-based authentication. Adapters operate in three directions: inbound (validates requests to ContinuityBridge endpoints), outbound (provides tokens for external API calls), and bidirectional. Each adapter links to encrypted vault secrets via FK and stores configuration (header names, placement strategy, token validation settings) in plaintext. **Secret validation system complete:** Centralized validator module with Zod schemas for all 12 integration types, wired into REST POST/PUT endpoints with field-level error reporting. Vault UI migrated to snake_case type system with complete form fields for OAuth2 (clientId, clientSecret, tokenUrl, scope, audience), JWT (algorithm, secret/privateKey, issuer, audience), Cookie (cookieName, cookieSecret, domain, path, flags), RabbitMQ, and Kafka. **Status: Vault infrastructure production-ready - awaiting adapter implementations (OAuth2Adapter, JWTAdapter, CookieAdapter), REST endpoints, and middleware.**
- **Interface Template Catalog**: A YAML-based library of pre-configured templates for standard marketplace and enterprise integrations (e.g., Amazon SP-API, MercadoLibre). It allows customers to instantiate standard interfaces with their own credentials, defining protocols, authentication, required secrets, endpoint schemas, and payload templates. Templates include `conditionSchema` for interface-scoped conditional logic.
- **Flow Orchestrator**: A core service for executing node graphs, tracking execution, and enabling conditional routing. It includes executors for manual triggers, interface operations, XML/CSV parsing, JSON building, object mapping, validation, and interface-scoped conditionals. The CSV parser handles various formats, and the validation node supports YAML-based rules with multi-output routing. Integrated with the Pipeline for end-to-end flow execution.
- **Pipeline Integration**: Supports both legacy XML transformation and modern flow-based transformation. Warehouse decision logic is conditional, running only when output matches the CanonicalItem structure, allowing flows to transform any data format.
- **Interface Registry**: Manages various interface types (WMS, ERP, Marketplace, etc.), protocols (REST, SFTP, Message Queue), and authentication methods.
- **Data Source Management**: Handles polling and retrieval from SFTP and Azure Blob.
- **Transformation Engine**: A hybrid system offering both XML-to-canonical transformation (YAML-driven) and visual flow-based transformations for diverse data formats.
- **Decision Engine**: Implements intelligent warehouse routing based on weighted scoring factors for CanonicalItem-formatted output.
- **Swappable Queue Backends**: Supports InMemory, RabbitMQ, and Kafka for flexible message queuing.
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

## External Dependencies
- **Queue Providers**: RabbitMQ, Kafka
- **Apollo Server**: For GraphQL API.
- **Express**: For REST API.
- **TanStack Query**: For frontend data fetching.
- **React Flow (@xyflow/react)**: For visual flow builder.
- **fast-xml-parser**: For XML syntax validation.
- **object-mapper**: For field mapping.
- **Argon2**: For Argon2id key derivation.
- **Node.js crypto**: For AES-256-GCM encryption.