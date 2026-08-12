/**
 * Hasura GraphQL Admin Client & Network Utilities
 * 
 * All database operations performed by the serverless execution engine MUST
 * use the Hasura Admin Secret, bypassing user-restricted role permissions (Layer 2).
 */

/**
 * Normalizes any GraphQL endpoint URL by removing trailing slashes
 * and ensuring standard '/v1/graphql' suffix.
 */
export function normalizeGraphQLEndpoint(rawUrl: string): string {
  const url = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!url) return 'http://local.hasura.nhost.run/v1/graphql';
  if (url.endsWith('/v1/graphql')) {
    return url;
  }
  if (url.endsWith('/v1')) {
    return `${url}/graphql`;
  }
  if (url.endsWith('/graphql')) {
    return url;
  }
  return `${url}/v1/graphql`;
}

/**
 * Builds an ordered list of candidate GraphQL endpoints to try.
 * Prioritizes direct GraphQL/Hasura URLs and Nhost Cloud subdomain conventions,
 * while safely ignoring functions webhook endpoints (e.g. :3000).
 */
export function getGraphQLCandidateEndpoints(): string[] {
  const candidates: string[] = [];

  const addCandidate = (rawUrl?: string | null) => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    const trimmed = rawUrl.trim();
    if (!trimmed) return;

    // Skip URLs that explicitly point to functions server only
    if (
      trimmed.includes('functions:3000') ||
      (trimmed.includes(':3000') && !trimmed.includes('localhost') && !trimmed.includes('127.0.0.1'))
    ) {
      return;
    }

    // Convert Nhost functions domain to hasura domain if present
    if (trimmed.includes('.functions.') && trimmed.includes('.nhost.run')) {
      const hasuraUrl = trimmed.replace('.functions.', '.hasura.');
      const normalized = normalizeGraphQLEndpoint(hasuraUrl);
      if (!candidates.includes(normalized)) candidates.push(normalized);
      return;
    }

    const normalized = normalizeGraphQLEndpoint(trimmed);
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  // 1. Explicit Hasura/GraphQL environment variables
  addCandidate(process.env.HASURA_GRAPHQL_ENDPOINT);
  addCandidate(process.env.HASURA_GRAPHQL_URL);
  addCandidate(process.env.NHOST_GRAPHQL_URL);
  addCandidate(process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL);
  addCandidate(process.env.GRAPHQL_URL);
  addCandidate(process.env.NEXT_PUBLIC_GRAPHQL_URL);

  // 2. Nhost Cloud subdomain + region convention
  if (process.env.NHOST_SUBDOMAIN && process.env.NHOST_REGION) {
    addCandidate(`https://${process.env.NHOST_SUBDOMAIN}.hasura.${process.env.NHOST_REGION}.nhost.run/v1/graphql`);
    addCandidate(`https://${process.env.NHOST_SUBDOMAIN}.graphql.${process.env.NHOST_REGION}.nhost.run/v1/graphql`);
  }

  // 3. Hasura / Backend URLs
  addCandidate(process.env.NHOST_HASURA_URL);
  addCandidate(process.env.NHOST_BACKEND_URL);
  addCandidate(process.env.BACKEND_URL);

  // 4. Local / Docker development fallbacks
  const localFallbacks = [
    'http://local.hasura.nhost.run/v1/graphql',
    'http://hasura:8080/v1/graphql',
    'http://localhost:1337/v1/graphql',
    'http://127.0.0.1:1337/v1/graphql',
  ];

  for (const fallback of localFallbacks) {
    if (!candidates.includes(fallback)) {
      candidates.push(fallback);
    }
  }

  return candidates;
}

export function getGraphQLEndpoint(): string {
  const candidates = getGraphQLCandidateEndpoints();
  return candidates[0] || 'http://local.hasura.nhost.run/v1/graphql';
}

export function getAdminSecret(): string {
  return (
    process.env.HASURA_GRAPHQL_ADMIN_SECRET ||
    process.env.NHOST_ADMIN_SECRET ||
    'nhost-admin-secret'
  );
}

/**
 * Safely parse an HTTP Response object without throwing SyntaxError when
 * endpoints return HTML error pages, non-JSON plain text, or empty bodies.
 */
export async function parseResponseSafely<T = any>(
  res: Response,
  contextName = 'Request'
): Promise<{ ok: boolean; status: number; data?: T; errorText?: string; isHtml?: boolean }> {
  const status = res.status;
  let text = '';
  try {
    text = await res.text();
  } catch (err: any) {
    return {
      ok: false,
      status,
      errorText: `Failed to read response body from ${contextName}: ${err?.message || String(err)}`,
    };
  }

  const trimmed = (text || '').trim();
  const isHtml = trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE') || trimmed.includes('<html');

  if (!trimmed) {
    if (res.ok) {
      return { ok: true, status, data: {} as T };
    }
    return {
      ok: false,
      status,
      errorText: `${contextName} returned empty response with status ${status} ${res.statusText || ''}`.trim(),
    };
  }

  try {
    const data = JSON.parse(trimmed) as T;
    return { ok: res.ok, status, data };
  } catch (_parseError: any) {
    let cleanSnippet = trimmed;
    if (isHtml) {
      // Strip HTML tags and collapse whitespace for clean error presentation
      cleanSnippet = trimmed
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (cleanSnippet.length > 250) {
      cleanSnippet = cleanSnippet.slice(0, 250) + '...';
    }

    return {
      ok: false,
      status,
      isHtml,
      errorText: `${contextName} returned non-JSON response (HTTP ${status}): ${cleanSnippet || 'Invalid JSON response'}`,
    };
  }
}

/**
 * Executes GraphQL queries / mutations against Hasura using the Admin Secret.
 * Includes candidate endpoint fallback, AbortController timeouts, and robust non-JSON error handling.
 */
export async function adminGraphQLRequest<T = any>(
  query: string,
  variables: Record<string, any> = {}
): Promise<T> {
  const candidateEndpoints = getGraphQLCandidateEndpoints();
  const adminSecret = getAdminSecret();

  let lastError: Error | null = null;

  for (let i = 0; i < candidateEndpoints.length; i++) {
    const endpoint = candidateEndpoints[i];
    const isLastCandidate = i === candidateEndpoints.length - 1;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hasura-admin-secret': adminSecret,
          },
          body: JSON.stringify({
            query,
            variables,
          }),
          signal: controller.signal,
          redirect: 'follow',
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const parsed = await parseResponseSafely<{ data?: T; errors?: Array<{ message: string }> }>(
        res,
        `GraphQL endpoint (${endpoint})`
      );

      // If we got 404 or connection failure and we have fallback candidates, try next candidate
      if (!parsed.ok || !parsed.data) {
        if (!isLastCandidate && (parsed.status === 404 || parsed.status === 502 || parsed.isHtml)) {
          lastError = new Error(parsed.errorText || `GraphQL HTTP Error ${parsed.status} from ${endpoint}`);
          continue;
        }
        throw new Error(parsed.errorText || `GraphQL HTTP Error ${res.status}: ${res.statusText}`);
      }

      const json = parsed.data;

      if (json.errors && Array.isArray(json.errors) && json.errors.length > 0) {
        const messages = json.errors.map((e: any) => e.message || JSON.stringify(e)).join('; ');
        throw new Error(`GraphQL Error: ${messages}`);
      }

      if (!json.data) {
        throw new Error(`GraphQL response returned no data (HTTP ${res.status})`);
      }

      return json.data;
    } catch (err: any) {
      lastError = err;
      const isNetworkOrTimeout =
        err.name === 'AbortError' ||
        err.message?.includes('fetch failed') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.message?.includes('non-JSON response (HTTP 404)');

      if (!isLastCandidate && isNetworkOrTimeout) {
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('GraphQL request failed with unknown error');
}

/**
 * Extract x-hasura-user-id from headers or session variables.
 * Used for Layer 2 authorization verification in Action handlers.
 */
export function extractUserId(req: any): string | null {
  if (!req) return null;
  const headers = req.headers || {};
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const sessionVariables = body?.session_variables || {};
  const input = body?.input || {};

  const headerKeys = Object.keys(headers);
  const getHeader = (name: string) => {
    const key = headerKeys.find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : undefined;
  };

  const rawUserId =
    getHeader('x-hasura-user-id') ||
    getHeader('x-hasura-userid') ||
    sessionVariables['x-hasura-user-id'] ||
    sessionVariables['X-Hasura-User-Id'] ||
    sessionVariables['x-hasura-userid'] ||
    sessionVariables['X-Hasura-Userid'] ||
    input.user_id ||
    input.userId ||
    body?.user_id ||
    body?.userId ||
    null;

  if (!rawUserId || typeof rawUserId !== 'string' || rawUserId.trim() === '') {
    return null;
  }

  return rawUserId.trim();
}
