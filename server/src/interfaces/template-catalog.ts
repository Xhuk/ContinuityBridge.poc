import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as yaml from "js-yaml";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Interface Template Schema (YAML structure)
const interfaceTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(["wms", "erp", "marketplace", "tms", "3pl", "lastmile", "custom"]),
  direction: z.enum(["inbound", "outbound", "bidirectional"]),
  protocol: z.enum(["rest_api", "soap", "sftp", "ftp", "webhook", "graphql", "database", "message_queue"]),
  
  // Connection details
  endpoint: z.string().optional(),
  httpConfig: z.object({
    method: z.string().optional(),
    headers: z.record(z.string()).optional(),
    timeout: z.number().optional(),
    retryAttempts: z.number().optional(),
    retryDelay: z.number().optional(),
  }).optional(),
  
  // Auth configuration
  authType: z.enum(["none", "basic", "bearer", "api_key", "oauth2", "certificate", "ssh_key"]),
  authHeaderName: z.string().optional(),
  oauth2Config: z.object({
    tokenUrl: z.string(),
    grantType: z.string(),
    scope: z.string().optional(),
  }).optional(),
  
  // Supported formats
  formats: z.array(z.string()),
  defaultFormat: z.string().optional(),
  
  // Required secrets (what customer needs to provide)
  requiredSecrets: z.array(z.union([z.string(), z.record(z.array(z.string()))])),
  
  // API endpoints
  endpoints: z.record(z.object({
    path: z.string(),
    method: z.string(),
    description: z.string(),
  })).optional(),
  
  // Payload templates
  payloadTemplates: z.record(z.unknown()).optional(),
  
  // Field mapping suggestions
  suggestedMappings: z.record(z.record(z.any())).optional(),
  
  // Tags and metadata
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  
  // Pricing and licensing (for marketplace)
  tier: z.enum(["free", "premium"]).default("premium"),
  pricing: z.object({
    monthly: z.number().optional(), // USD per month
    yearly: z.number().optional(), // USD per year
    lifetime: z.number().optional(), // USD one-time
    currency: z.string().default("USD"),
  }).optional(),
  
  // Feature highlights (for marketplace UI)
  features: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
});

export type InterfaceTemplate = z.infer<typeof interfaceTemplateSchema>;

export class InterfaceTemplateCatalog {
  private static instance: InterfaceTemplateCatalog;
  private templates: Map<string, InterfaceTemplate>;

  private constructor() {
    this.templates = new Map();
    this.loadTemplates();
  }

  public static getInstance(): InterfaceTemplateCatalog {
    if (!InterfaceTemplateCatalog.instance) {
      InterfaceTemplateCatalog.instance = new InterfaceTemplateCatalog();
    }
    return InterfaceTemplateCatalog.instance;
  }

  private loadTemplates(): void {
    const templatesDir = path.join(__dirname, "templates");
    
    if (!fs.existsSync(templatesDir)) {
      console.warn(`[InterfaceTemplateCatalog] Templates directory not found: ${templatesDir}`);
      return;
    }

    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    
    for (const file of files) {
      try {
        const filePath = path.join(templatesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = yaml.load(content);
        
        const template = interfaceTemplateSchema.parse(data);
        this.templates.set(template.id, template);
        
        console.log(`[InterfaceTemplateCatalog] Loaded template: ${template.name} (${template.id})`);
      } catch (error) {
        console.error(`[InterfaceTemplateCatalog] Failed to load template ${file}:`, error);
      }
    }
    
    console.log(`[InterfaceTemplateCatalog] Loaded ${this.templates.size} interface templates`);
  }

  public getTemplate(id: string): InterfaceTemplate | undefined {
    return this.templates.get(id);
  }

  public getAllTemplates(): InterfaceTemplate[] {
    return Array.from(this.templates.values());
  }

  public getTemplatesByType(type: string): InterfaceTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.type === type);
  }

  public getTemplatesByTag(tag: string): InterfaceTemplate[] {
    return Array.from(this.templates.values()).filter(t => 
      t.tags?.includes(tag)
    );
  }

  public searchTemplates(query: string): InterfaceTemplate[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter(t => 
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
}

// Export singleton instance
export const interfaceTemplateCatalog = InterfaceTemplateCatalog.getInstance();
