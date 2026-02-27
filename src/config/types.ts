/**
 * Configuration types for computable-lab server.
 * 
 * These types define the structure of config.yaml and provide
 * type-safe access to server configuration.
 */

/**
 * Top-level server configuration.
 */
export interface AppConfig {
  server: ServerConfig;
  schemas: SchemaConfig;
  repositories: RepositoryConfig[];
  ai?: AIConfig;
  execution?: ExecutionConfig;
}

export type ExecutionMode = 'local' | 'remote' | 'hybrid';
export type AdapterExecutionMode = 'local' | 'remote';

/**
 * Execution provider routing configuration.
 */
export interface ExecutionConfig {
  /** Global execution mode default. */
  mode: ExecutionMode;
  /** Optional per-adapter override used when mode is hybrid. */
  adapters?: Record<string, AdapterExecutionMode>;
}

/**
 * AI agent orchestrator configuration.
 */
export interface AIConfig {
  inference: InferenceConfig;
  agent: AgentConfig;
}

/**
 * LLM inference endpoint configuration.
 */
export interface InferenceConfig {
  /** Provider family used for UI presets / diagnostics */
  provider?: 'openai' | 'openai-compatible';
  /** Base URL for OpenAI-compatible API (e.g. "http://dgx-spark:8000/v1") */
  baseUrl: string;
  /** Model name served by the endpoint */
  model: string;
  /** Optional API key */
  apiKey?: string;
  /** Per-completion timeout in ms (default 120_000) */
  timeoutMs?: number;
  /** Max tokens per completion (default 4096) */
  maxTokens?: number;
  /** Temperature for generation (default 0.1) */
  temperature?: number;
}

/**
 * Agent behavior configuration.
 */
export interface AgentConfig {
  /** Max tool-calling round trips (default 15) */
  maxTurns?: number;
  /** Max tool calls per single turn (default 5) */
  maxToolCallsPerTurn?: number;
  /** Path to system prompt template (default "prompts/event-graph-agent.md") */
  systemPromptPath?: string;
}

/**
 * Server settings.
 */
export interface ServerConfig {
  /** Port to listen on (default: 3001) */
  port: number;
  /** Host to bind to (default: '0.0.0.0') */
  host: string;
  /** Log level (default: 'info') */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Directory for ephemeral workspaces (default: '/tmp/cl-workspaces') */
  workspaceDir: string;
  /** CORS configuration */
  cors: CorsConfig;
}

/**
 * CORS configuration.
 */
export interface CorsConfig {
  /** Whether CORS is enabled (default: true) */
  enabled: boolean;
  /** Allowed origins (default: ['*']) */
  origins: string[];
}

/**
 * Schema configuration.
 */
export interface SchemaConfig {
  /** Schema source: bundled, or overlay (bundled + repo overrides) */
  source: 'bundled' | 'overlay';
  /** Directory containing bundled schemas (default: './schema') */
  bundledDir: string;
}

/**
 * Repository configuration.
 */
export interface RepositoryConfig {
  /** Unique identifier for this repository */
  id: string;
  /** Whether this is the default repository */
  default?: boolean;
  /** Git settings */
  git: GitConfig;
  /** Namespace configuration for JSON-LD identity */
  namespace: NamespaceConfig;
  /** JSON-LD configuration */
  jsonld: JsonLdConfig;
  /** Sync settings */
  sync: SyncConfig;
  /** Records location settings */
  records: RecordsConfig;
}

/**
 * Git connection settings.
 */
export interface GitConfig {
  /** Repository URL (HTTPS or SSH) */
  url: string;
  /** Branch to use (default: 'main') */
  branch: string;
  /** Authentication settings */
  auth: GitAuthConfig;
}

/**
 * Git authentication settings.
 */
export interface GitAuthConfig {
  /** Authentication type */
  type: 'token' | 'github-app' | 'ssh-key' | 'none';
  /** Personal access token (for type: 'token') */
  token?: string;
  /** GitHub App ID (for type: 'github-app') */
  appId?: string;
  /** GitHub App private key path (for type: 'github-app') */
  privateKeyPath?: string;
  /** GitHub App installation ID (for type: 'github-app') */
  installationId?: string;
  /** SSH key path (for type: 'ssh-key') */
  sshKeyPath?: string;
}

/**
 * Namespace configuration for JSON-LD identity.
 */
export interface NamespaceConfig {
  /** Base URI for record @id derivation */
  baseUri: string;
  /** Prefix for display purposes */
  prefix: string;
}

/**
 * JSON-LD configuration.
 */
export interface JsonLdConfig {
  /** Context source: 'default' uses bundled, 'custom' uses URL */
  context: 'default' | 'custom';
  /** Custom context URL (when context: 'custom') */
  customContextUrl?: string;
}

/**
 * Sync settings for git operations.
 */
export interface SyncConfig {
  /** Sync mode */
  mode: 'pull-on-read' | 'periodic' | 'manual';
  /** Pull interval in seconds (for mode: 'periodic') */
  pullIntervalSeconds?: number;
  /** Whether to automatically commit changes (default: true) */
  autoCommit: boolean;
  /** Whether to automatically push after commit (default: true) */
  autoPush: boolean;
}

/**
 * Records location settings.
 */
export interface RecordsConfig {
  /** Directory within the repository where records are stored */
  directory: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: AppConfig = {
  server: {
    port: 3001,
    host: '0.0.0.0',
    logLevel: 'info',
    workspaceDir: '/tmp/cl-workspaces',
    cors: {
      enabled: true,
      origins: ['*'],
    },
  },
  schemas: {
    source: 'bundled',
    bundledDir: './schema',
  },
  repositories: [],
  execution: {
    mode: 'local',
    adapters: {},
  },
};

/**
 * Default repository configuration values.
 */
export const DEFAULT_REPO_CONFIG: Omit<RepositoryConfig, 'id' | 'git'> = {
  default: false,
  namespace: {
    baseUri: 'https://example.org/records/',
    prefix: 'example',
  },
  jsonld: {
    context: 'default',
  },
  sync: {
    mode: 'pull-on-read',
    pullIntervalSeconds: 60,
    autoCommit: true,
    autoPush: true,
  },
  records: {
    directory: 'records',
  },
};

/**
 * Workspace status.
 */
export type WorkspaceStatus = 'uninitialized' | 'clean' | 'dirty' | 'syncing' | 'error';

/**
 * Workspace information.
 */
export interface Workspace {
  /** Repository ID */
  repoId: string;
  /** Absolute path to workspace directory */
  path: string;
  /** Last successful sync time */
  lastSync: Date | null;
  /** Current workspace status */
  status: WorkspaceStatus;
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Sync result.
 */
export interface SyncResult {
  /** Whether sync was successful */
  success: boolean;
  /** Number of commits pulled */
  pulledCommits?: number;
  /** Number of commits pushed */
  pushedCommits?: number;
  /** Error message if failed */
  error?: string;
  /** New workspace status */
  status: WorkspaceStatus;
}

/**
 * Git status information.
 */
export interface GitStatus {
  /** Current branch */
  branch: string;
  /** Commits ahead of remote */
  ahead: number;
  /** Commits behind remote */
  behind: number;
  /** Modified files */
  modified: string[];
  /** Staged files */
  staged: string[];
  /** Untracked files */
  untracked: string[];
  /** Whether workspace is clean */
  isClean: boolean;
}

/**
 * Server metadata (for /meta endpoint).
 */
export interface ServerMeta {
  server: {
    version: string;
    uptime: string;
  };
  repository: {
    id: string;
    url: string;
    branch: string;
    lastSync: string | null;
    status: WorkspaceStatus;
    commitsBehind: number;
    commitsAhead: number;
  } | null;
  namespace: NamespaceConfig | null;
  schemas: {
    source: string;
    bundledVersion: string;
    overlayCount: number;
    effective: Array<{
      id: string;
      version: string;
      source: 'bundled' | 'overlay';
    }>;
  };
  jsonld: {
    context: string;
  };
}
