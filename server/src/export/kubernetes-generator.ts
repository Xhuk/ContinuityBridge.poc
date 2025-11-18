/**
 * Kubernetes Release Package Generator
 * 
 * Generates K8s manifests + Helm charts for enterprise customers
 * One-click from founder UI → Download K8s package
 */

import { logger } from "../core/logger.js";
import * as crypto from "crypto";

const log = logger.child("K8sGenerator");

export interface KubernetesPackage {
  organizationId: string;
  organizationName: string;
  version: string;
  
  // License config (embedded in K8s secrets)
  license: {
    licenseType: "trial" | "basic" | "professional" | "enterprise";
    maxInterfaces: number;
    maxSystems: number;
  };
  
  // K8s config
  namespace: string;
  replicas: number;
  resources: {
    cpu: string;
    memory: string;
  };
  
  // Storage
  storageClass: string;
  storageSize: string;
  
  // Ingress
  domain: string;
  tlsEnabled: boolean;
}

export class KubernetesPackageGenerator {
  /**
   * Generate complete K8s package (manifests + Helm chart)
   */
  async generatePackage(config: KubernetesPackage): Promise<{
    manifests: Record<string, string>;
    helm: Record<string, string>;
    readme: string;
  }> {
    log.info("Generating Kubernetes package", {
      organization: config.organizationName,
      version: config.version,
    });

    // Generate all K8s resources
    const manifests = {
      "namespace.yaml": this.generateNamespace(config),
      "configmap.yaml": this.generateConfigMap(config),
      "secrets.yaml": this.generateSecrets(config),
      "postgres-pvc.yaml": this.generatePostgresPVC(config),
      "postgres-deployment.yaml": this.generatePostgresDeployment(config),
      "postgres-service.yaml": this.generatePostgresService(config),
      "valkey-deployment.yaml": this.generateValkeyDeployment(config),
      "valkey-service.yaml": this.generateValkeyService(config),
      "app-deployment.yaml": this.generateAppDeployment(config),
      "app-service.yaml": this.generateAppService(config),
      "ingress.yaml": this.generateIngress(config),
    };

    // Generate Helm chart
    const helm = {
      "Chart.yaml": this.generateHelmChart(config),
      "values.yaml": this.generateHelmValues(config),
      "values-dev.yaml": this.generateHelmValuesDev(config),
      "values-prod.yaml": this.generateHelmValuesProd(config),
      "templates/namespace.yaml": this.generateNamespace(config),
      "templates/configmap.yaml": this.generateConfigMap(config),
      "templates/secrets.yaml": this.generateSecrets(config),
      "templates/postgres-pvc.yaml": this.generatePostgresPVC(config),
      "templates/postgres-deployment.yaml": this.generatePostgresDeployment(config),
      "templates/postgres-service.yaml": this.generatePostgresService(config),
      "templates/valkey-deployment.yaml": this.generateValkeyDeployment(config),
      "templates/valkey-service.yaml": this.generateValkeyService(config),
      "templates/app-deployment.yaml": this.generateAppDeployment(config),
      "templates/app-service.yaml": this.generateAppService(config),
      "templates/ingress.yaml": this.generateIngress(config),
    };

    // Generate README
    const readme = this.generateReadme(config);

    return { manifests, helm, readme };
  }

  /**
   * Generate namespace
   */
  private generateNamespace(config: KubernetesPackage): string {
    return `apiVersion: v1
kind: Namespace
metadata:
  name: ${config.namespace}
  labels:
    app: continuitybridge
    organization: ${config.organizationId}
`;
  }

  /**
   * Generate ConfigMap
   */
  private generateConfigMap(config: KubernetesPackage): string {
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: continuitybridge-config
  namespace: ${config.namespace}
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  DB_TYPE: "postgres"
  VITE_DEPLOYMENT_TYPE: "customer"
  VALKEY_ENABLED: "true"
  REMOTE_UPDATES_ENABLED: "false"
  APP_DOMAIN: "${config.domain}"
  APP_URL: "https://${config.domain}"
  ORGANIZATION_ID: "${config.organizationId}"
`;
  }

  /**
   * Generate Secrets (with auto-generated passwords)
   */
  private generateSecrets(config: KubernetesPackage): string {
    const postgresPassword = this.generatePassword();
    const valkeyPassword = this.generatePassword();
    const superadminKey = `cb_${this.generatePassword()}`;
    const encryptionKey = this.generatePassword().substring(0, 32);

    return `apiVersion: v1
kind: Secret
metadata:
  name: continuitybridge-secrets
  namespace: ${config.namespace}
type: Opaque
stringData:
  POSTGRES_PASSWORD: "${postgresPassword}"
  VALKEY_PASSWORD: "${valkeyPassword}"
  SUPERADMIN_API_KEY: "${superadminKey}"
  ENCRYPTION_KEY: "${encryptionKey}"
  DATABASE_URL: "postgresql://cbadmin:${postgresPassword}@postgres:5432/continuitybridge"
  VALKEY_URL: "valkey://:${valkeyPassword}@valkey:6379"
`;
  }

  /**
   * Generate PostgreSQL PVC
   */
  private generatePostgresPVC(config: KubernetesPackage): string {
    return `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: ${config.namespace}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: ${config.storageClass}
  resources:
    requests:
      storage: ${config.storageSize}
`;
  }

  /**
   * Generate PostgreSQL Deployment
   */
  private generatePostgresDeployment(config: KubernetesPackage): string {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: ${config.namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:16-alpine
        env:
        - name: POSTGRES_DB
          value: continuitybridge
        - name: POSTGRES_USER
          value: cbadmin
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: continuitybridge-secrets
              key: POSTGRES_PASSWORD
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
          limits:
            cpu: "2000m"
            memory: "4Gi"
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
`;
  }

  /**
   * Generate PostgreSQL Service
   */
  private generatePostgresService(config: KubernetesPackage): string {
    return `apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: ${config.namespace}
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
  type: ClusterIP
`;
  }

  /**
   * Generate Valkey Deployment
   */
  private generateValkeyDeployment(config: KubernetesPackage): string {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: valkey
  namespace: ${config.namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: valkey
  template:
    metadata:
      labels:
        app: valkey
    spec:
      containers:
      - name: valkey
        image: valkey/valkey:latest
        command:
        - valkey-server
        - --appendonly
        - "yes"
        - --requirepass
        - \$(VALKEY_PASSWORD)
        env:
        - name: VALKEY_PASSWORD
          valueFrom:
            secretKeyRef:
              name: continuitybridge-secrets
              key: VALKEY_PASSWORD
        ports:
        - containerPort: 6379
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "2Gi"
`;
  }

  /**
   * Generate Valkey Service
   */
  private generateValkeyService(config: KubernetesPackage): string {
    return `apiVersion: v1
kind: Service
metadata:
  name: valkey
  namespace: ${config.namespace}
spec:
  selector:
    app: valkey
  ports:
  - port: 6379
    targetPort: 6379
  type: ClusterIP
`;
  }

  /**
   * Generate App Deployment
   */
  private generateAppDeployment(config: KubernetesPackage): string {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: continuitybridge
  namespace: ${config.namespace}
spec:
  replicas: ${config.replicas}
  selector:
    matchLabels:
      app: continuitybridge
  template:
    metadata:
      labels:
        app: continuitybridge
    spec:
      containers:
      - name: continuitybridge
        image: continuitybridge/app:${config.version}
        envFrom:
        - configMapRef:
            name: continuitybridge-config
        - secretRef:
            name: continuitybridge-secrets
        ports:
        - containerPort: 5000
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            cpu: "${config.resources.cpu}"
            memory: "${config.resources.memory}"
          limits:
            cpu: "${config.resources.cpu === '1000m' ? '4000m' : config.resources.cpu}"
            memory: "${config.resources.memory === '2Gi' ? '8Gi' : config.resources.memory}"
`;
  }

  /**
   * Generate App Service
   */
  private generateAppService(config: KubernetesPackage): string {
    return `apiVersion: v1
kind: Service
metadata:
  name: continuitybridge
  namespace: ${config.namespace}
spec:
  selector:
    app: continuitybridge
  ports:
  - port: 80
    targetPort: 5000
  type: ClusterIP
`;
  }

  /**
   * Generate Ingress
   */
  private generateIngress(config: KubernetesPackage): string {
    const tlsSection = config.tlsEnabled ? `
  tls:
  - hosts:
    - ${config.domain}
    secretName: continuitybridge-tls` : '';

    return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: continuitybridge
  namespace: ${config.namespace}
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "${config.tlsEnabled}"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:${tlsSection}
  rules:
  - host: ${config.domain}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: continuitybridge
            port:
              number: 80
`;
  }

  /**
   * Generate Helm Chart.yaml
   */
  private generateHelmChart(config: KubernetesPackage): string {
    return `apiVersion: v2
name: continuitybridge
description: Enterprise Supply Chain Integration Platform
type: application
version: ${config.version}
appVersion: "${config.version}"
keywords:
  - integration
  - supply-chain
  - middleware
  - 3pl
  - e-commerce
maintainers:
  - name: ContinuityBridge
    email: support@continuitybridge.com
`;
  }

  /**
   * Generate Helm values.yaml
   */
  private generateHelmValues(config: KubernetesPackage): string {
    return `# Default values for ContinuityBridge

# Organization
organizationId: "${config.organizationId}"
organizationName: "${config.organizationName}"

# Namespace
namespace: ${config.namespace}

# Application
app:
  image: continuitybridge/app
  version: ${config.version}
  replicas: ${config.replicas}
  
  resources:
    requests:
      cpu: ${config.resources.cpu}
      memory: ${config.resources.memory}
    limits:
      cpu: 4000m
      memory: 8Gi

# PostgreSQL
postgres:
  image: postgres:16-alpine
  storageClass: ${config.storageClass}
  storageSize: ${config.storageSize}
  
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi

# Valkey
valkey:
  image: valkey/valkey:latest
  
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 2Gi

# Ingress
ingress:
  enabled: true
  domain: ${config.domain}
  tls: ${config.tlsEnabled}
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"

# License
license:
  type: ${config.license.licenseType}
  maxInterfaces: ${config.license.maxInterfaces}
  maxSystems: ${config.license.maxSystems}
`;
  }

  /**
   * Generate Helm values-dev.yaml
   */
  private generateHelmValuesDev(config: KubernetesPackage): string {
    return `# Development environment overrides

app:
  replicas: 1
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 2Gi

postgres:
  storageSize: 5Gi

ingress:
  tls: false
  domain: dev.${config.domain}
`;
  }

  /**
   * Generate Helm values-prod.yaml
   */
  private generateHelmValuesProd(config: KubernetesPackage): string {
    return `# Production environment overrides

app:
  replicas: 3
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 4000m
      memory: 8Gi

postgres:
  storageSize: ${config.storageSize}
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 4000m
      memory: 8Gi

valkey:
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi

ingress:
  tls: true
  domain: ${config.domain}
`;
  }

  /**
   * Generate README
   */
  private generateReadme(config: KubernetesPackage): string {
    return `# ContinuityBridge Kubernetes Deployment

Version: ${config.version}
Organization: ${config.organizationName}

## Prerequisites

- Kubernetes cluster (v1.24+)
- kubectl configured
- Helm 3 installed
- Storage class: ${config.storageClass}

## Quick Start

### Option 1: Using Helm (Recommended)

\`\`\`bash
# Install
helm install continuitybridge ./helm \\
  --namespace ${config.namespace} \\
  --create-namespace

# Check status
kubectl get pods -n ${config.namespace}

# Access logs
kubectl logs -n ${config.namespace} -l app=continuitybridge
\`\`\`

### Option 2: Using kubectl

\`\`\`bash
# Apply all manifests
kubectl apply -f manifests/

# Check status
kubectl get all -n ${config.namespace}
\`\`\`

## Environments

### Development
\`\`\`bash
helm install continuitybridge ./helm \\
  -f helm/values-dev.yaml \\
  --namespace ${config.namespace}-dev \\
  --create-namespace
\`\`\`

### Production
\`\`\`bash
helm install continuitybridge ./helm \\
  -f helm/values-prod.yaml \\
  --namespace ${config.namespace} \\
  --create-namespace
\`\`\`

## Access

Application URL: https://${config.domain}

## Scaling

\`\`\`bash
# Scale application
kubectl scale deployment continuitybridge \\
  -n ${config.namespace} \\
  --replicas=5
\`\`\`

## Upgrade

\`\`\`bash
helm upgrade continuitybridge ./helm \\
  --namespace ${config.namespace}
\`\`\`

## Uninstall

\`\`\`bash
helm uninstall continuitybridge -n ${config.namespace}
\`\`\`

## Support

Email: support@continuitybridge.com
`;
  }

  /**
   * Generate secure random password
   */
  private generatePassword(): string {
    return crypto.randomBytes(32).toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, 32);
  }
}

export const kubernetesGenerator = new KubernetesPackageGenerator();
