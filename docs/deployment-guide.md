# computable-lab Deployment Guide

This guide explains how to deploy computable-lab as a Docker appliance that connects to your lab's git repository.

## Quick Start

### 1. Create Configuration File

```bash
cp config.example.yaml config.yaml
```

Edit `config.yaml`:

```yaml
server:
  port: 3000
  host: 0.0.0.0
  logLevel: info

repositories:
  - id: main
    default: true
    git:
      url: https://github.com/YOUR-ORG/YOUR-LAB-RECORDS.git
      branch: main
      auth:
        type: token
        token: ${GITHUB_TOKEN}
    namespace:
      baseUri: https://yourlab.org/records/
      prefix: yourlab
    sync:
      mode: auto
      autoCommit: true
      autoPush: true
```

### 2. Run with Docker

```bash
# Set your GitHub token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Run the container
docker run -d \
  --name computable-lab \
  -p 3000:3000 \
  -e GITHUB_TOKEN \
  -v ./config.yaml:/app/config.yaml:ro \
  computable-lab:latest
```

### 3. Verify

```bash
# Check health
curl http://localhost:3000/health

# Get server metadata
curl http://localhost:3000/meta
```

---

## Configuration Reference

### Server Settings

```yaml
server:
  port: 3000              # HTTP port (default: 3000)
  host: 0.0.0.0           # Bind address (default: 0.0.0.0)
  logLevel: info          # debug | info | warn | error
  cors: true              # Enable CORS (default: true)
  workspaceDir: /tmp/cl-workspaces  # Ephemeral workspace path
```

### Repository Settings

```yaml
repositories:
  - id: main                    # Unique identifier
    default: true               # Use as default repository
    git:
      url: https://github.com/org/repo.git  # Repository URL
      branch: main              # Branch to track
      auth:
        type: token             # token | ssh-key | github-app | none
        token: ${GITHUB_TOKEN}  # Token (via env var)
    namespace:
      baseUri: https://yourlab.org/records/  # Base URI for @id
      prefix: yourlab           # Short prefix for display
    sync:
      mode: auto                # auto | pull-on-read | manual
      autoCommit: true          # Commit on record save
      autoPush: true            # Push after commit
      pullIntervalSeconds: 60   # Auto-pull interval
    records:
      directory: records        # Records subdirectory
```

### Environment Variables

Use `${VAR_NAME}` syntax for environment variable substitution:

```yaml
git:
  auth:
    token: ${GITHUB_TOKEN}           # Required
    token: ${MY_TOKEN:-fallback}     # With default value
```

---

## Authentication Methods

### GitHub Personal Access Token (PAT)

```yaml
git:
  url: https://github.com/org/repo.git
  auth:
    type: token
    token: ${GITHUB_TOKEN}
```

Required scopes: `repo` (for private repos) or `public_repo` (for public)

### SSH Key

```yaml
git:
  url: git@github.com:org/repo.git
  auth:
    type: ssh-key
    keyPath: /app/ssh/id_ed25519
```

Mount your SSH key:
```bash
docker run -v ~/.ssh/id_ed25519:/app/ssh/id_ed25519:ro ...
```

### No Authentication (Public Repos - Read Only)

```yaml
git:
  url: https://github.com/org/public-repo.git
  auth:
    type: none
```

---

## API Endpoints

### Records API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/records` | GET | List all records |
| `/records/:schemaId` | GET | List records by schema type |
| `/records/:schemaId/:recordId` | GET | Get single record |
| `/records/:schemaId/:recordId` | PUT | Create/update record |
| `/records/:schemaId/:recordId` | DELETE | Delete record |

### Schemas API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/schemas` | GET | List all schemas |
| `/schemas/:schemaId` | GET | Get schema by ID |

### Operations API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/meta` | GET | Server metadata and status |
| `/sync` | POST | Force sync with remote |
| `/health` | GET | Health check (for Docker/k8s) |

---

## Example: /meta Response

```json
{
  "server": {
    "version": "1.0.0",
    "uptime": "2h 34m 12s",
    "uptimeMs": 9252000
  },
  "repository": {
    "id": "main",
    "url": "https://***@github.com/mylab/records",
    "branch": "main",
    "status": "clean",
    "ahead": 0,
    "behind": 0
  },
  "namespace": {
    "baseUri": "https://mylab.org/records/",
    "prefix": "mylab"
  },
  "schemas": {
    "source": "bundled+overlay",
    "count": 15,
    "bundledCount": 12,
    "overlayCount": 3,
    "overriddenCount": 1
  },
  "lint": {
    "ruleCount": 5
  },
  "jsonld": {
    "context": "https://computable-lab.org/context/v1.jsonld"
  }
}
```

---

## Lab Repository Structure

Your lab-git repository should have this structure:

```
lab-records/
├── records/
│   ├── studies/
│   │   └── STU-0001__hepatocyte-toxicity.yaml
│   ├── knowledge/
│   │   └── ASN-0001__viability-assertion.yaml
│   └── ...
└── .computable-lab/           # Optional config
    ├── namespace.yaml         # Namespace override
    └── schema-overrides/      # Custom schemas
        └── custom.schema.yaml
```

### .computable-lab/namespace.yaml

Override the namespace for this repository:

```yaml
baseUri: https://mylab.org/records/
prefix: mylab
vocab: https://schema.org/
prefixes:
  obo: http://purl.obolibrary.org/obo/
  uo: http://purl.obolibrary.org/obo/UO_
```

### .computable-lab/schema-overrides/

Add custom schemas or override bundled ones:

```yaml
# custom-material.schema.yaml
$id: https://mylab.org/schema/materials/custom-reagent
$schema: https://json-schema.org/draft/2020-12/schema
title: Custom Reagent
type: object
properties:
  recordId:
    type: string
  name:
    type: string
  vendor:
    type: string
  catalogNumber:
    type: string
required: [recordId, name]
```

---

## Docker Compose Deployment

```yaml
# docker-compose.yaml
version: '3.8'

services:
  computable-lab:
    image: computable-lab:latest
    build: .
    ports:
      - "3000:3000"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - NODE_ENV=production
    volumes:
      - ./config.yaml:/app/config.yaml:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

Run:
```bash
docker-compose up -d
```

---

## Kubernetes Deployment

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: computable-lab-config
data:
  config.yaml: |
    server:
      port: 3000
    repositories:
      - id: main
        default: true
        git:
          url: https://github.com/mylab/records.git
          branch: main
          auth:
            type: token
            token: ${GITHUB_TOKEN}
        namespace:
          baseUri: https://mylab.org/records/
          prefix: mylab
```

### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: computable-lab-secrets
type: Opaque
data:
  GITHUB_TOKEN: <base64-encoded-token>
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: computable-lab
spec:
  replicas: 1
  selector:
    matchLabels:
      app: computable-lab
  template:
    metadata:
      labels:
        app: computable-lab
    spec:
      containers:
        - name: computable-lab
          image: computable-lab:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: computable-lab-secrets
          volumeMounts:
            - name: config
              mountPath: /app/config.yaml
              subPath: config.yaml
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: config
          configMap:
            name: computable-lab-config
```

---

## Troubleshooting

### Check Logs

```bash
docker logs computable-lab
```

### Test Git Connection

```bash
docker exec computable-lab git ls-remote origin
```

### Force Sync

```bash
curl -X POST http://localhost:3000/sync
```

### Check Health Status

```bash
curl http://localhost:3000/health | jq
```

Response codes:
- `200` — Healthy or degraded (still functioning)
- `503` — Unhealthy (critical failure)

### Common Issues

| Issue | Solution |
|-------|----------|
| Auth fails | Check `GITHUB_TOKEN` is set and has correct scopes |
| Push rejected | Another commit was pushed; sync and retry |
| Schema not found | Check schema path and `$id` |
| Permission denied | Check workspace directory permissions |

---

## Development Mode

For local development without git sync:

```yaml
# config.yaml
repositories:
  - id: local
    default: true
    git:
      url: ""  # Empty URL = local mode
      branch: main
      auth:
        type: none
```

Or run directly:
```bash
npm run dev
```

---

## Security Best Practices

1. **Never commit tokens** — Always use `${GITHUB_TOKEN}` 
2. **Use read-only volume mounts** — `:ro` for config files
3. **Run as non-root** — Dockerfile uses `nodejs` user
4. **Limit resources** — Set memory/CPU limits
5. **Use secrets** — K8s secrets or Docker secrets, not env files
