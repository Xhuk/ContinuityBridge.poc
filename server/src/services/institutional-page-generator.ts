import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../core/logger.js";

const log = logger.child("InstitutionalPageGenerator");

interface LandingPageConfig {
  companyName: string;
  industry?: string;
  tagline?: string;
  features?: string[];
  brandColors?: {
    primary?: string;
    secondary?: string;
  };
  contactEmail?: string;
}

interface GeneratedLandingPage {
  html: string;
  config: {
    title: string;
    description: string;
    heroText: string;
    features: Array<{
      title: string;
      description: string;
      icon: string;
    }>;
    ctaText: string;
  };
}

export class InstitutionalPageGenerator {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      log.warn("GEMINI_API_KEY not set - AI page generation disabled");
    }
  }

  /**
   * Generate institutional landing page using AI
   */
  async generateLandingPage(config: LandingPageConfig): Promise<GeneratedLandingPage> {
    if (!this.genAI) {
      throw new Error("Gemini API not configured. Set GEMINI_API_KEY environment variable.");
    }

    const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
Generate a professional institutional landing page configuration for an enterprise integration platform.

Company Information:
- Company Name: ${config.companyName}
${config.industry ? `- Industry: ${config.industry}` : ''}
${config.tagline ? `- Tagline: ${config.tagline}` : ''}
${config.features ? `- Key Features: ${config.features.join(', ')}` : ''}

Requirements:
1. Create a professional, enterprise-focused landing page
2. Highlight the ContinuityBridge integration platform capabilities
3. Tailor the messaging to the company's industry
4. Generate 3 compelling feature cards
5. Create a strong call-to-action

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "title": "Page title for SEO",
  "description": "Meta description for SEO",
  "heroText": "Main headline text",
  "heroSubtext": "Supporting headline text",
  "features": [
    {
      "title": "Feature 1 Title",
      "description": "Feature 1 description (2-3 sentences)",
      "icon": "lucide-icon-name"
    },
    {
      "title": "Feature 2 Title",
      "description": "Feature 2 description",
      "icon": "lucide-icon-name"
    },
    {
      "title": "Feature 3 Title",
      "description": "Feature 3 description",
      "icon": "lucide-icon-name"
    }
  ],
  "ctaText": "Call to action button text",
  "footerText": "Footer tagline or company info"
}

Use these lucide icon names only: Workflow, Zap, Shield, Database, Cloud, GitBranch, FileText, Bell, Lock, TrendingUp
    `.trim();

    try {
      log.info("Generating landing page with Gemini", { companyName: config.companyName });
      
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      // Clean up response - remove markdown code blocks if present
      const cleanJson = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const pageConfig = JSON.parse(cleanJson);

      // Generate React/HTML component
      const html = this.generateReactComponent(config.companyName, pageConfig, config);

      log.info("Landing page generated successfully", { companyName: config.companyName });

      return {
        html,
        config: pageConfig,
      };
    } catch (error: any) {
      log.error("Failed to generate landing page", { error: error.message, companyName: config.companyName });
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  /**
   * Generate React component code for the landing page
   */
  private generateReactComponent(companyName: string, config: any, userConfig: LandingPageConfig): string {
    const primaryColor = userConfig.brandColors?.primary || 'blue';
    const year = new Date().getFullYear();

    return `import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ${config.features.map((f: any) => f.icon).join(', ')} } from "lucide-react";

export default function InstitutionalLanding() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">${companyName}</h1>
              <p className="text-sm text-gray-600 mt-1">${config.title}</p>
            </div>
            <Button
              onClick={() => setLocation('/admin')}
              className="bg-${primaryColor}-600 hover:bg-${primaryColor}-700 text-white"
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl">
            ${config.heroText}
            <span className="block text-${primaryColor}-600">${config.heroSubtext}</span>
          </h2>
          <p className="mt-6 max-w-2xl mx-auto text-xl text-gray-600">
            ${config.description}
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Button
              onClick={() => setLocation('/admin')}
              size="lg"
              className="bg-${primaryColor}-600 hover:bg-${primaryColor}-700 text-white px-8 py-3 text-lg"
            >
              ${config.ctaText}
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-24 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          ${config.features.map((feature: any) => `
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <${feature.icon} className="h-6 w-6 text-${primaryColor}-600" />
                <h3 className="text-xl font-semibold text-gray-900">${feature.title}</h3>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                ${feature.description}
              </p>
            </CardContent>
          </Card>
          `).join('')}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-24 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-gray-500 text-sm">
            © ${year} ${companyName}. ${config.footerText}
          </p>
        </div>
      </footer>
    </div>
  );
}
`;
  }

  /**
   * Generate default landing page (fallback when AI is not available)
   */
  generateDefaultLandingPage(companyName: string): GeneratedLandingPage {
    const config = {
      title: `${companyName} - Enterprise Integration Platform`,
      description: "Connect, transform, and orchestrate data flows across your entire technology ecosystem",
      heroText: "Enterprise Integration",
      heroSubtext: "Made Simple",
      features: [
        {
          title: "Visual Flow Builder",
          description: "Design complex integration workflows with our intuitive drag-and-drop interface. No coding required.",
          icon: "Workflow"
        },
        {
          title: "Real-Time Monitoring",
          description: "Track data flows in real-time with comprehensive dashboards and alerting capabilities.",
          icon: "TrendingUp"
        },
        {
          title: "Enterprise Security",
          description: "Bank-grade encryption, role-based access control, and comprehensive audit logging.",
          icon: "Shield"
        }
      ],
      ctaText: "Access Platform",
      footerText: "All rights reserved."
    };

    const html = this.generateReactComponent(companyName, config, { companyName });

    return { html, config };
  }
}
