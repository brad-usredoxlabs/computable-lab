# computable-lab Server Architecture

## Overview

The computable-lab server operates as a **stateless appliance** that connects to external lab-git repositories for data storage. Records are never stored in the server's own repository—instead, the server manages ephemeral workspaces that clone, modify, and push to configured lab repositories.

## Core Principles

1. **Git as Source of Truth** — All records live in external lab-git repositories
2. **Ephemeral Workspaces** — Clone, modify, commit, push; never persist state
3. **Bundled Schemas** — Schemas ship with the server, with optional repo overlays
4. **Derived Identity** — `recordId` is canonical; `@id` is computed from namespace config
5. **Multi-Repo Ready** — Single repo for v1, but architecture supports routing to multiple repos

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  computable-lab Server (Docker Appliance)                               │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Configuration (config.yaml)                                       │ │
│  │  - server settings (port, host, cors)                              │ │
│  │  - repository connections (git url, auth, namespace)               │ │
│  │  - schema settings (bundled, overlay)                              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  REST API       │  │  Schema         │  │  Workspace Manager      │ │
│  │  /records/*     │  │  Registry       │  │  - clone/pull/push      │ │
│  │  /schemas/*     │  │  (bundled +     │  │  - ephemeral dirs       │ │
│  │  /meta          │  │   overlay)      │  │  - sync status          │ │
│  └────────┬────────┘  └─────────────────┘  └───────────┬─────────────┘ │
│           │                                            │               │
│           │           ┌─────────────────┐              │               │
│           └───────────│  GitRepoAdapter │──────────────┘               │
│                       │  (simple-git)   │                               │
│                       └────────┬────────┘                               │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                        git clone/pull/push
                                 │
┌────────────────────────────────▼────────────────────────────────────────┐
│  Lab-Git Repository (GitHub/GitLab/etc.)                                │
│                                                                         │
│  ├── records/                                                           │
│  │   ├── studies/STU-0001__hepatocyte-toxicity.yaml                    │
│  │   └── knowledge/ASN-0001__hepatocyte-viability.yaml                 │
│  │                                                                      │
│  └── .computable-lab/              (optional repo config)               │
│      ├── namespace.yaml            (base URI, prefix)                   │
│      └── schema-overrides/         (extend/override bundled schemas)    │
│          └── custom-study.schema.yaml                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Schema

### `config.yaml`

```yaml
# Server settings
server:
  port: 3000
  host: 0.0.0.0
  logLevel: info                    # debug | info | warn | error
  workspaceDir: /tmp/cl-workspaces  # ephemeral, disposable
  cors:
    enabled: true
    origins: ["*"]                  # or specific origins

# Schema configuration
schemas:
  source: bundled                   # bundled | overlay
  bundledDir: ./schema              # relative to server install
  # If overlay: load bundled first, then repo's .computable-lab/schema-overrides/

# Repository connections (array for future multi-repo support)
repositories:
  - id: main
    default: true
    git:
      url: https://github.com/mylab-org/mylab-records.git
      branch: main
      auth:
        type: token                 # token | github-app | ssh-key
        token: ${GITHUB_TOKEN}      # env var substitution
    namespace:
      baseUri: https://mylab.org/records/
      prefix: mylab
    jsonld:
      context: default              # default | custom
      # customContextUrl: https://mylab.org/context.jsonld
    sync:
      mode: pull-on-read            # pull-on-read | periodic | manual
      pullIntervalSeconds: 60       # if periodic
      autoCommit: true              # commit on each write
      autoPush: true                # push after commit
    records:
      directory: records            # where records live in repo
```

### Environment Variable Substitution

Config values like `${GITHUB_TOKEN}` are replaced with environment variables at load time.

---

## Identity Model

### `recordId` — Canonical Identifier

- Human-authored, immutable
- Format: `PREFIX-NNNN` (e.g., `STU-0001`, `ASN-0042`)
- Stored in the YAML file as the primary key
- Used for all internal references

### `@id` — JSON-LD Identifier (Derived)

- Computed from `recordId` + `schemaId` + namespace config
- Never authored by clients
- Generated on serialization

```typescript
// Derivation formula
function deriveJsonLdId(
  recordId: string,
  schemaId: string,
  namespace: { baseUri: string; prefix: string }
): string {
  const recordType = schemaId.split('/')[0]; // e.g., "studies" from "studies/study"
  return `${namespace.baseUri}${recordType}/${recordId}`;
}

// Example:
// recordId: "STU-0001"
// schemaId: "studies/study"
// namespace.baseUri: "https://mylab.org/records/"
// Result: "https://mylab.org/records/studies/STU-0001"
```

---

## GitRepoAdapter

The `GitRepoAdapter` replaces `LocalRepoAdapter` for production use. It uses `simple-git` to manage a shallow clone of the lab repository.

### Interface

```typescript
interface GitRepoAdapter extends RepoAdapter {
  // Inherited from RepoAdapter
  getFile(path: string): Promise<RepoFile | null>;
  fileExists(path: string): Promise<boolean>;
  listFiles(options: ListFilesOptions): Promise<string[]>;
  createFile(options: CreateFileOptions): Promise<FileOperationResult>;
  updateFile(options: UpdateFileOptions): Promise<FileOperationResult>;
  deleteFile(options: DeleteFileOptions): Promise<FileOperationResult>;
  getHistory(options: HistoryOptions): Promise<CommitInfo[]>;
  
  // Git-specific
  sync(): Promise<SyncResult>;
  getStatus(): Promise<WorkspaceStatus>;
  
  // Atomic multi-file commits
  commitFiles(options: {
    files: Array<{
      path: string;
      content: string;
      operation: 'create' | 'update' | 'delete';
    }>;
    message: string;
    push?: boolean;
  }): Promise<FileOperationResult>;
}
```

### Sync Strategy

```
READ OPERATION:
1. Check workspace age (last pull)
2. If stale (> pullInterval), pull latest
3. Read from workspace

WRITE OPERATION:
1. Pull latest (ensure we're up to date)
2. Apply changes to workspace
3. Stage files
4. Commit with message
5. Push to remote
6. If push fails (conflict), pull --rebase and retry (or error)
```

---

## Workspace Manager

Manages ephemeral workspaces for each configured repository.

```typescript
interface WorkspaceManager {
  // Get or create workspace for a repository
  getWorkspace(repoId: string): Promise<Workspace>;
  
  // Initialize workspace (clone if needed)
  initWorkspace(repoId: string, config: RepoConfig): Promise<Workspace>;
  
  // Clean up stale workspaces
  cleanup(maxAgeMs: number): Promise<void>;
  
  // Get status of all workspaces
  getStatus(): Promise<Map<string, WorkspaceStatus>>;
}

interface Workspace {
  repoId: string;
  path: string;           // e.g., /tmp/cl-workspaces/abc123/
  lastSync: Date;
  status: 'clean' | 'dirty' | 'syncing' | 'error';
}
```

---

## REST API Additions

### `GET /meta`

Returns server and repository status.

```json
{
  "server": {
    "version": "1.0.0",
    "uptime": "2h 34m 12s"
  },
  "repository": {
    "id": "main",
    "url": "https://github.com/mylab-org/mylab-records",
    "branch": "main",
    "lastSync": "2026-01-29T18:00:00Z",
    "status": "clean",
    "commitsBehind": 0,
    "commitsAhead": 0
  },
  "namespace": {
    "baseUri": "https://mylab.org/records/",
    "prefix": "mylab"
  },
  "schemas": {
    "source": "bundled+overlay",
    "bundledVersion": "1.0.0",
    "overlayCount": 2,
    "effective": [
      { "id": "studies/study", "version": "1.0.0", "source": "bundled" },
      { "id": "custom/special", "version": "1.0.0", "source": "overlay" }
    ]
  },
  "jsonld": {
    "context": "https://computable-lab.org/context/v1.jsonld"
  }
}
```

### `POST /sync`

Force a sync (pull latest from remote).

```json
// Request (empty body)

// Response
{
  "success": true,
  "result": {
    "pulledCommits": 3,
    "status": "clean"
  }
}
```

---

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine

# Install git for simple-git
RUN apk add --no-cache git

WORKDIR /app

# Copy built application
COPY dist/ ./dist/
COPY schema/ ./schema/
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --production

# Create workspace directory
RUN mkdir -p /tmp/cl-workspaces

# Set default config path
ENV CONFIG_PATH=/app/config.yaml

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/meta || exit 1

CMD ["node", "dist/server.js"]
```

### docker-compose.yaml

```yaml
version: '3.8'

services:
  computable-lab:
    image: computable-lab:latest
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./config.yaml:/app/config.yaml:ro
      # Optional: persist workspaces across restarts (for dev)
      # - cl-workspaces:/tmp/cl-workspaces
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - NODE_ENV=production
    restart: unless-stopped

# volumes:
#   cl-workspaces:
```

---

## Implementation Phases

### Phase A: Configuration & Infrastructure
- [ ] Create config schema types (`src/config/types.ts`)
- [ ] Implement config loader with env var substitution (`src/config/loader.ts`)
- [ ] Add config validation
- [ ] Create workspace manager (`src/workspace/WorkspaceManager.ts`)

### Phase B: GitRepoAdapter
- [ ] Install `simple-git` dependency
- [ ] Implement `GitRepoAdapter` (`src/repo/GitRepoAdapter.ts`)
- [ ] Add sync logic (pull, push, conflict detection)
- [ ] Add atomic multi-file commit support

### Phase C: Identity & Namespace
- [ ] Add namespace config to repo config
- [ ] Implement `@id` derivation in JSON-LD serialization
- [ ] Load `.computable-lab/namespace.yaml` from repo
- [ ] Update record store to use derived `@id`

### Phase D: Schema Overlay
- [ ] Load bundled schemas first
- [ ] Load repo `.computable-lab/schema-overrides/` if present
- [ ] Merge schemas (overlay overrides bundled)
- [ ] Report effective schema set

### Phase E: API & Deployment
- [ ] Add `GET /meta` endpoint
- [ ] Add `POST /sync` endpoint
- [ ] Create Dockerfile
- [ ] Create docker-compose.yaml
- [ ] Add health check endpoint
- [ ] Add graceful shutdown

---

## Migration Path

### From Current (LocalRepoAdapter) to Git

1. No breaking changes to API
2. Add `config.yaml` support (backwards compatible with env vars)
3. Add `GitRepoAdapter` alongside `LocalRepoAdapter`
4. Config selects which adapter to use
5. Default: `LocalRepoAdapter` for dev, `GitRepoAdapter` for production

---

## Security Considerations

1. **Tokens** — Never in config files, always via env vars (`${GITHUB_TOKEN}`)
2. **Workspaces** — In `/tmp`, mode 0700, cleaned on shutdown
3. **CORS** — Configurable per-environment
4. **Secrets in logs** — Redact tokens in log output
