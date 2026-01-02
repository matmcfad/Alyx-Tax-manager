/**
 * Alyx Tax Manager - OAuth Authentication Worker
 *
 * Handles Google OAuth flow with proper refresh token management.
 * Deployed to Cloudflare Workers at auth.matmcfad.com
 */

interface Env {
  TOKENS: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_ORIGINS: string; // Comma-separated list of allowed origins
}

interface TokenData {
  refresh_token: string;
  created: number;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Get list of allowed origins from environment
 */
function getAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
}

/**
 * Get the origin from request, or default to first allowed origin
 */
function getRequestOrigin(request: Request, env: Env): string {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(env);

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  // For redirects (no Origin header), check Referer
  const referer = request.headers.get('Referer');
  if (referer) {
    const refererOrigin = new URL(referer).origin;
    if (allowedOrigins.includes(refererOrigin)) {
      return refererOrigin;
    }
  }

  // Default to first allowed origin
  return allowedOrigins[0];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(request, env, 204);
    }

    try {
      switch (url.pathname) {
        case '/auth/login':
          return handleLogin(request, env, url);
        case '/auth/callback':
          return handleCallback(request, env, url);
        case '/auth/token':
          return handleToken(request, env);
        case '/auth/logout':
          return handleLogout(request, env);
        case '/auth/status':
          return handleStatus(request, env);
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return corsResponse(request, env, 500, { error: 'Internal server error' });
    }
  }
};

/**
 * GET /auth/login
 * Redirects user to Google OAuth consent screen
 */
function handleLogin(request: Request, env: Env, url: URL): Response {
   // Prefer explicit origin param (most reliable), fall back to header detection
  const originParam = url.searchParams.get('origin');
  const allowedOrigins = getAllowedOrigins(env);
  const origin = (originParam && allowedOrigins.includes(originParam)) 
    ? originParam 
    : getRequestOrigin(request, env);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', `${url.origin}/auth/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
  authUrl.searchParams.set('state', origin); // Pass origin in state for callback

  return Response.redirect(authUrl.toString(), 302);
}

/**
 * GET /auth/callback
 * Receives authorization code from Google, exchanges for tokens
 */
async function handleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state'); // Origin passed from login

  // Validate and use the origin from state, or fall back to first allowed origin
  const allowedOrigins = getAllowedOrigins(env);
  const redirectOrigin = (state && allowedOrigins.includes(state)) ? state : allowedOrigins[0];

  if (error) {
    return Response.redirect(`${redirectOrigin}?auth=error&message=${encodeURIComponent(error)}`, 302);
  }

  if (!code) {
    return Response.redirect(`${redirectOrigin}?auth=error&message=no_code`, 302);
  }

  // Exchange authorization code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/callback`,
      grant_type: 'authorization_code'
    })
  });

  const tokens: GoogleTokenResponse = await tokenResponse.json();

  if (tokens.error) {
    console.error('Token exchange error:', tokens.error, tokens.error_description);
    return Response.redirect(
      `${redirectOrigin}?auth=error&message=${encodeURIComponent(tokens.error_description || tokens.error)}`,
      302
    );
  }

  if (!tokens.refresh_token) {
    console.error('No refresh token received');
    return Response.redirect(`${redirectOrigin}?auth=error&message=no_refresh_token`, 302);
  }

  // Generate session ID and store refresh token in KV
  const sessionId = crypto.randomUUID();
  const tokenData: TokenData = {
    refresh_token: tokens.refresh_token,
    created: Date.now()
  };

  await env.TOKENS.put(sessionId, JSON.stringify(tokenData), {
    expirationTtl: SESSION_MAX_AGE
  });

  // Redirect back to app with session cookie
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${redirectOrigin}?auth=success`,
      'Set-Cookie': buildSessionCookie(sessionId, SESSION_MAX_AGE)
    }
  });
}

/**
 * GET /auth/token
 * Returns a fresh access token (refreshes from Google if needed)
 */
async function handleToken(request: Request, env: Env): Promise<Response> {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    return corsResponse(request, env, 401, { error: 'Not authenticated', code: 'NO_SESSION' });
  }

  const stored = await env.TOKENS.get(sessionId);
  if (!stored) {
    return corsResponse(request, env, 401, { error: 'Session expired', code: 'SESSION_EXPIRED' });
  }

  const tokenData: TokenData = JSON.parse(stored);

  // Get fresh access token using refresh token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokenData.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });

  const tokens: GoogleTokenResponse = await tokenResponse.json();

  if (tokens.error) {
    console.error('Token refresh error:', tokens.error);

    // If refresh token is invalid, clear the session
    if (tokens.error === 'invalid_grant') {
      await env.TOKENS.delete(sessionId);
      return corsResponse(request, env, 401, {
        error: 'Session invalidated',
        code: 'REFRESH_FAILED'
      }, {
        'Set-Cookie': buildSessionCookie('', 0) // Clear cookie
      });
    }

    return corsResponse(request, env, 500, { error: 'Token refresh failed', code: 'REFRESH_ERROR' });
  }

  return corsResponse(request, env, 200, {
    access_token: tokens.access_token,
    expires_in: tokens.expires_in
  });
}

/**
 * POST /auth/logout
 * Clears session cookie and removes refresh token from KV
 */
async function handleLogout(request: Request, env: Env): Promise<Response> {
  const sessionId = getSessionId(request);

  if (sessionId) {
    await env.TOKENS.delete(sessionId);
  }

  return corsResponse(request, env, 200, { success: true }, {
    'Set-Cookie': buildSessionCookie('', 0) // Clear cookie
  });
}

/**
 * GET /auth/status
 * Check if user has a valid session (without refreshing token)
 */
async function handleStatus(request: Request, env: Env): Promise<Response> {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    return corsResponse(request, env, 200, { authenticated: false });
  }

  const stored = await env.TOKENS.get(sessionId);
  if (!stored) {
    return corsResponse(request, env, 200, { authenticated: false });
  }

  const tokenData: TokenData = JSON.parse(stored);
  return corsResponse(request, env, 200, {
    authenticated: true,
    sessionCreated: tokenData.created
  });
}

// Helper functions

function getSessionId(request: Request): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

function buildSessionCookie(sessionId: string, maxAge: number): string {
  const parts = [
    `session=${sessionId}`,
    'HttpOnly',
    'Secure',
    'SameSite=None', // Required for cross-site cookies
    `Max-Age=${maxAge}`,
    'Path=/'
  ];
  return parts.join('; ');
}

function corsResponse(
  request: Request,
  env: Env,
  status: number,
  body?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Response {
  const origin = getRequestOrigin(request, env);

  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });
}
