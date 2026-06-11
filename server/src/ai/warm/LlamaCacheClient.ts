/**
 * Client for llama.cpp-native (non-OpenAI) server endpoints used by prompt
 * warming: the /slots API for KV-state save/restore to the server's
 * --slot-save-path directory. All methods talk to the server root (the
 * inference baseUrl with its /v1 suffix stripped).
 */

export interface SlotInfo {
  id: number;
  /** True while the slot is mid-prefill/decode. */
  is_processing?: boolean;
  n_ctx?: number;
}

export interface LlamaCacheClient {
  /** GET /slots — current slot states. */
  listSlots(): Promise<SlotInfo[]>;
  /** POST /slots/{id}?action=save — persist the slot's KV state to disk. */
  saveSlot(id: number, filename: string): Promise<{ n_saved?: number }>;
  /** POST /slots/{id}?action=restore — load a saved KV state into a slot. */
  restoreSlot(id: number, filename: string): Promise<{ n_restored?: number }>;
  /**
   * Whether the server supports slot save/restore (requires it to be started
   * with --slot-save-path; returns false on 501).
   */
  isAvailable(): Promise<boolean>;
}

export function createLlamaCacheClient(
  inferenceBaseUrl: string,
  apiKey?: string,
  timeoutMs = 30_000,
): LlamaCacheClient {
  const serverRoot = inferenceBaseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${serverRoot}${path}`, { ...init, headers, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`llama slots request timeout after ${timeoutMs}ms (${path})`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function slotAction(
    id: number,
    action: 'save' | 'restore',
    filename: string,
  ): Promise<Record<string, unknown>> {
    const res = await request(`/slots/${id}?action=${action}`, {
      method: 'POST',
      body: JSON.stringify({ filename }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`slot ${action} failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  return {
    async listSlots(): Promise<SlotInfo[]> {
      const res = await request('/slots');
      if (!res.ok) throw new Error(`GET /slots failed (${res.status})`);
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? (json as SlotInfo[]) : [];
    },

    async saveSlot(id: number, filename: string) {
      return slotAction(id, 'save', filename) as Promise<{ n_saved?: number }>;
    },

    async restoreSlot(id: number, filename: string) {
      return slotAction(id, 'restore', filename) as Promise<{ n_restored?: number }>;
    },

    async isAvailable(): Promise<boolean> {
      try {
        // A save against a missing file distinguishes "slot API enabled" from
        // "501 not supported" without side effects; use /slots list first as
        // the cheap probe and only fall back to interpreting errors.
        const res = await request('/slots');
        if (res.status === 501) return false;
        if (!res.ok) return false;
        // /slots can be enabled while --slot-save-path is not; probe save
        // support via a restore of a sentinel name and inspect the error code.
        const probe = await request(`/slots/0?action=restore`, {
          method: 'POST',
          body: JSON.stringify({ filename: '__cla_probe__.bin' }),
        });
        if (probe.status === 501) return false;
        return true; // 400/404 (missing file) still proves the action is wired
      } catch {
        return false;
      }
    },
  };
}
