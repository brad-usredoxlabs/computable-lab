/**
 * Resolves GitHub identity from a Personal Access Token.
 */

export interface ResolvedIdentity {
  username: string;
  email: string;
  name?: string;
}

const FALLBACK_IDENTITY: ResolvedIdentity = {
  username: 'computable-lab',
  email: 'computable-lab@localhost',
};

/**
 * Call the GitHub API to resolve the user associated with a PAT.
 * Falls back to a default identity on failure.
 */
export async function resolveGitHubIdentity(token: string): Promise<ResolvedIdentity> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      console.warn(`GitHub identity lookup failed (HTTP ${response.status}), using fallback`);
      return FALLBACK_IDENTITY;
    }

    const data = await response.json() as { login: string; email: string | null; name: string | null };

    return {
      username: data.login,
      email: data.email ?? `${data.login}@users.noreply.github.com`,
      ...(data.name ? { name: data.name } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`GitHub identity lookup failed: ${message}, using fallback`);
    return FALLBACK_IDENTITY;
  }
}
