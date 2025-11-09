# ContinuityBridge - Project Overview

## Overview
ContinuityBridge is a configurable bi-directional integration hub designed to connect diverse enterprise systems such as WMS, Oracle, Manhattan, Amazon, and Last Mile. It ingests payloads from multiple sources (SFTP, Azure Blob, REST APIs), transforms them using configurable mappings, applies warehouse routing logic, and dispatches them to various destinations with swappable queue backends. The project aims to provide a robust, scalable, and observable solution for complex data integration challenges, supporting both linear transformation flows and advanced orchestration.

## User Preferences
- Language: English
- Emphasis: Clean architecture, modularity, extensibility
- Priority: Production-ready patterns over quick hacks

## System Architecture

### UI/UX Decisions
The frontend features a React application with a dashboard for KPIs, charts, and queue depth monitoring, an events history table, queue management, and dedicated pages for managing data sources and interfaces. A comprehensive sidebar provides navigation to all key areas.

### Technical Implementations
- **Flow Orchestrator**: A core service for executing node graphs, tracking per-node execution, and supporting conditional routing. It includes production-safe executors for manual triggers, interface operations, XML parsing, JSON building, and object mapping. Disabled executors (conditional, custom_javascript) are security hardened to prevent RCE attacks.
- **Interface Registry**: Manages interfaces with a production-ready schema supporting various types (WMS, ERP, Marketplace, TMS, 3PL, Last Mile, Custom), protocols (REST, SOAP, GraphQL, SFTP, FTP, Webhook, Database, Message Queue), and authentication methods.
- **Data Source Management**: Handles SFTP and Azure Blob polling and file retrieval.
- **Transformation Engine**: Initially an XML-to-canonical JSON transformer driven by YAML configurations, evolving into a more general flow-based system.
- **Decision Engine**: Implements intelligent warehouse routing based on weighted scoring factors like stock availability, distance, SLA, and cost.
- **Swappable Queue Backends**: Supports InMemory, RabbitMQ, and Kafka for flexible message queuing.
- **Metrics Collection**: Gathers real-time data on average latency, P95 latency, TPS, queue depth, and error rates.
- **Dual API Layer**: Provides both REST and GraphQL APIs for flexible client interaction.
- **Backend Structure**: Organized into modules for core business logic, flow orchestration, interface management, data source management, transformation, decision making, queue abstraction, receiver systems, background workers, and the HTTP API layer.

### Feature Specifications
- **Configuration-Driven Transformation**: Uses `mapping.yml` for flexible XML-to-JSON conversion.
- **Intelligent Warehouse Routing**: Utilizes a weighted scoring model for optimal warehouse selection.
- **Real-Time Metrics**: Provides comprehensive observability into system performance.
- **Portable Storage**: Implemented with an `IStorage` interface and `MemStorage` for offline capability and Docker readiness.
- **YAML Node Catalog**: Defines core nodes for flow building, loaded and validated by a singleton service.

## External Dependencies
- **Queue Providers**: RabbitMQ, Kafka (for message queuing).
- **Apollo Server**: For GraphQL API implementation.
- **Express**: For REST API implementation.
- **TanStack Query**: For frontend data fetching and caching.
- **fast-xml-parser**: For XML syntax validation.
- **object-mapper**: For field mapping within flows.