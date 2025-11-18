# Consolidate Wiki into 5 Master Files
# Groups 132+ markdown files into 5 comprehensive master documents

$wikiPath = Join-Path $PSScriptRoot "..\wiki"
$outputPath = $wikiPath

Write-Host "Consolidating ContinuityBridge Wiki into 5 Master Files..." -ForegroundColor Cyan
Write-Host ""

# Define the 5 master file groupings
$masterFiles = @{
    "01-Architecture-And-Core-Systems.md" = @(
        "Getting-Started.md",
        "System-Overview.md",
        "Technology-Stack.md",
        "Core-Architecture.md",
        "Pipeline-Orchestration.md",
        "Data-Transformation-Engine.md",
        "Fan-Out-Dispatch-Mechanism.md",
        "Flow-Orchestration-Framework.md",
        "Warehouse-Decisioning-System.md",
        "Flow-Orchestration.md",
        "Flow-Concepts-and-Architecture.md",
        "Flow-Definition-and-Storage.md",
        "Data-Models-and-Schemas.md",
        "Database-Schema-Design.md",
        "Data-Lifecycle-and-Validation.md",
        "Canonical-Data-Models.md",
        "Inbound-Canonical-Model.md",
        "Inventory-Canonical-Model.md",
        "Order-Canonical-Model.md",
        "Shipment-Canonical-Model.md"
    )
    
    "02-APIs-And-Integrations.md" = @(
        "API-Reference.md",
        "REST-API.md",
        "Health-Check.md",
        "Metrics-and-Monitoring.md",
        "Processing-Tracking.md",
        "Worker-Management.md",
        "XML-Ingestion.md",
        "GraphQL-API.md",
        "GraphQL-Implementation-Details.md",
        "GraphQL-Mutations.md",
        "GraphQL-Queries.md",
        "Integration-Guide.md",
        "Integration-Testing-and-Validation.md",
        "Interface-Templates.md",
        "Interface-Template-Structure.md",
        "Interface-Configuration-Management.md",
        "Connection-Testing-Framework.md",
        "Template-Usage-in-Integration-Flows.md",
        "Template-Validation-and-Loading-Process.md"
    )
    
    "03-Data-Processing-And-Mapping.md" = @(
        "Data-Processing-Pipeline.md",
        "Fan-Out-Dispatch-Mechanism.md",
        "Warehouse-Origin-Decisioning.md",
        "XML-to-Canonical-Transformation.md",
        "Data-Mapping-Configuration.md",
        "Mapping-Syntax-and-Structure.md",
        "Field-Mapping-Configuration.md",
        "Array-Handling-and-Nested-Mappings.md",
        "Transformation-Functions.md",
        "Validation-Rules.md",
        "Mapping-Configuration-Structure.md",
        "Array-Mapping-Configuration.md",
        "Field-Mapping-Syntax.md",
        "Mapping-Validation-Rules.md",
        "Mapping-Execution-Engine.md",
        "Field-Mapping-Processor.md",
        "Array-Mapping-Handler.md",
        "Value-Extraction-and-Transformation.md",
        "Lookup-Table-Integration.md",
        "Transformation-Logic-and-Execution.md",
        "Mapping-Resolution-Mechanism.md",
        "XML-Parser-Initialization.md",
        "Lookup-Tables-and-Common-Utilities.md",
        "Lookup-Table-Integration-Mechanism.md",
        "Status-Mapping-Tables.md",
        "Unit-of-Measure-Conversion.md",
        "Mapping-Testing-and-Debugging.md",
        "Dashboard-Inspection-Workflows.md",
        "Development-Mode-Simulation.md",
        "Logging-and-Tracing-Strategies.md",
        "Schema-Validation-Techniques.md",
        "Unit-Testing-Mappings.md"
    )
    
    "04-Node-Execution-And-Queue-Management.md" = @(
        "Node-Execution-System.md",
        "Manual-Trigger-Executor.md",
        "Scheduler-Executor.md",
        "SFTP-Poller-Executor.md",
        "SFTP-Connector-Executor.md",
        "Azure-Blob-Poller-Executor.md",
        "Azure-Blob-Connector-Executor.md",
        "Database-Poller-Executor.md",
        "Database-Connector-Executor.md",
        "HTTP-Request-Executor.md",
        "Interface-Source-Executor.md",
        "Interface-Destination-Executor.md",
        "XML-Parser-Executor.md",
        "CSV-Parser-Executor.md",
        "BYDM-Parser-Executor.md",
        "JSON-Builder-Executor.md",
        "Object-Mapper-Executor.md",
        "BYDM-Mapper-Executor.md",
        "Conditional-Executor.md",
        "Join-Executor.md",
        "Validation-Executor.md",
        "Error-Handler-Executor.md",
        "Logger-Executor.md",
        "Email-Notification-Executor.md",
        "Custom-JavaScript-Executor.md",
        "Queue-Management-System.md",
        "InMemory-Queue-Backend.md",
        "Kafka-Integration.md",
        "RabbitMQ-Integration.md",
        "Strategy-Pattern-Implementation.md",
        "Worker-Process-Mechanics.md"
    )
    
    "05-Operations-Security-And-Troubleshooting.md" = @(
        "Deployment-and-Operations.md",
        "Environment-Configuration.md",
        "Database-Migration-and-Initialization.md",
        "Monitoring-and-Operations.md",
        "Render-Deployment.md",
        "Dashboard-and-User-Interface.md",
        "Dashboard-Overview.md",
        "UI-Components-Library.md",
        "Data-Visualization-Components.md",
        "Navigation-and-Routing-System.md",
        "Authentication-UI-Integration.md",
        "Security-and-Licensing.md",
        "Authentication-and-Authorization.md",
        "Phone-Home-Validation.md",
        "License-Management.md",
        "License-Generation.md",
        "License-Validation.md",
        "License-Types-and-Feature-Constraints.md",
        "Troubleshooting.md",
        "AI-Feature-and-Quota-Issues.md",
        "Authentication-and-Authorization-Problems.md",
        "Dispatch-and-Integration-Failures.md",
        "Performance-Bottlenecks-and-Resource-Issues.md",
        "XML-Processing-Issues.md",
        "Queue-Connectivity-and-Backend-Issues.md",
        "Fallback-to-InMemory-Queue-on-Backend-Failure.md",
        "InMemory-Queue-Issues.md",
        "Kafka-Connectivity-and-Consumer-Group-Issues.md",
        "RabbitMQ-Connectivity-and-Configuration-Issues.md"
    )
}

$totalFiles = 0
foreach ($masterFile in $masterFiles.Keys) {
    $totalFiles += $masterFiles[$masterFile].Count
}
Write-Host "Target: Consolidate $totalFiles files into 5 master documents" -ForegroundColor Yellow
Write-Host ""

# Process each master file
$processedCount = 0
foreach ($masterFileName in $masterFiles.Keys | Sort-Object) {
    $sourceFiles = $masterFiles[$masterFileName]
    $outputFile = Join-Path $outputPath $masterFileName
    
    # Extract title from filename
    $title = $masterFileName -replace '^\d+-', '' -replace '-', ' ' -replace '\.md$', ''
    
    Write-Host "Creating: $masterFileName" -ForegroundColor Green
    Write-Host "   Combining $($sourceFiles.Count) files..." -ForegroundColor Gray
    
    # Start with header
    $content = @"
# $title

**ContinuityBridge Documentation - Master Reference**

**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

---

"@
    
    $foundFiles = 0
    $missingFiles = @()
    
    # Combine all source files
    foreach ($sourceFile in $sourceFiles) {
        $sourcePath = Join-Path $wikiPath $sourceFile
        
        if (Test-Path $sourcePath) {
            $foundFiles++
            
            # Read source content
            $sourceContent = Get-Content $sourcePath -Raw -Encoding UTF8
            
            # Extract title from first line (# Title) or use filename
            $fileTitle = $sourceFile -replace '-', ' ' -replace '\.md$', ''
            if ($sourceContent -match '^#\s+(.+)$') {
                $fileTitle = $matches[1]
            }
            
            # Add section divider
            $content += @"

---

## $fileTitle

$sourceContent

"@
        } else {
            $missingFiles += $sourceFile
        }
    }
    
    # Write consolidated file
    $content | Out-File -FilePath $outputFile -Encoding UTF8 -NoNewline
    
    $processedCount += $foundFiles
    Write-Host "   Added $foundFiles files" -ForegroundColor Cyan
    
    if ($missingFiles.Count -gt 0) {
        Write-Host "   Missing $($missingFiles.Count) files" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Consolidation Complete!" -ForegroundColor Green
Write-Host "Processed: $processedCount files" -ForegroundColor Cyan
Write-Host "Output: $outputPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Master Files Created:" -ForegroundColor Yellow
foreach ($masterFile in $masterFiles.Keys | Sort-Object) {
    Write-Host "   - $masterFile" -ForegroundColor White
}
