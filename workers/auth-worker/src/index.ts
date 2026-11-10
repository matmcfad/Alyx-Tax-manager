/**
 * Alyx Tax Manager - OAuth Authentication Worker
 *
 * Handles Google OAuth flow with proper refresh token management.
 * Deployed to Cloudflare Workers at auth.therapytaxapp.work
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
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_MAX_AGE = 60 * 10; // 10 minutes to complete the Google consent screen

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
    try {
      const refererOrigin = new URL(referer).origin;
      if (allowedOrigins.includes(refererOrigin)) {
        return refererOrigin;
      }
    } catch {
      // Malformed Referer header - ignore it and fall through to the default
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
  // CSRF protection for the OAuth flow. The state carries a random nonce that
  // is also stored in a short-lived cookie in this browser. The callback only
  // accepts a response whose state nonce matches the cookie, i.e. a flow that
  // this same browser started. Without it, someone could send the user a
  // crafted /auth/callback link carrying THEIR OWN Google authorization code,
  // and the user's financial data would then be backed up to that person's
  // Google Drive.
  const nonce = crypto.randomUUID();
  authUrl.searchParams.set('state', `${nonce}|${origin}`); // nonce + origin for callback

  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString(),
      'Set-Cookie': buildStateCookie(nonce, OAUTH_STATE_MAX_AGE)
    }
  });
}

/**
 * GET /auth/callback
 * Receives authorization code from Google, exchanges for tokens
 */
async function handleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state') || ''; // "<nonce>|<origin>" from login

  // Split state into the CSRF nonce and the origin to return to
  const separatorIndex = state.indexOf('|');
  const stateNonce = separatorIndex >= 0 ? state.slice(0, separatorIndex) : '';
  const stateOrigin = separatorIndex >= 0 ? state.slice(separatorIndex + 1) : '';

  // Validate and use the origin from state, or fall back to first allowed origin
  const allowedOrigins = getAllowedOrigins(env);
  const redirectOrigin = allowedOrigins.includes(stateOrigin) ? stateOrigin : allowedOrigins[0];

  // The nonce must match the cookie set by /auth/login in this browser.
  const cookieNonce = getCookie(request, OAUTH_STATE_COOKIE);
  if (!stateNonce || !cookieNonce || stateNonce !== cookieNonce) {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${redirectOrigin}?auth=error&message=${encodeURIComponent('Sign-in could not be verified. Please try connecting again.')}`,
        'Set-Cookie': buildStateCookie('', 0)
      }
    });
  }

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

  // Redirect back to app with session cookie (and clear the one-time state cookie)
  const headers = new Headers({ 'Location': `${redirectOrigin}?auth=success` });
  headers.append('Set-Cookie', buildSessionCookie(sessionId, SESSION_MAX_AGE));
  headers.append('Set-Cookie', buildStateCookie('', 0));
  return new Response(null, { status: 302, headers });
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

  // Renew session: refresh cookie Max-Age and KV TTL on every successful token request.
  // This creates a rolling window - active sessions never expire.
  // Critical for Safari ITP which caps cross-site cookie lifetime to 7 days.
  await env.TOKENS.put(sessionId, JSON.stringify(tokenData), {
    expirationTtl: SESSION_MAX_AGE
  });

  return corsResponse(request, env, 200, {
    access_token: tokens.access_token,
    expires_in: tokens.expires_in
  }, {
    'Set-Cookie': buildSessionCookie(sessionId, SESSION_MAX_AGE)
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

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    // Exact name match - "session" must not match "other_session"
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1) || null;
    }
  }
  return null;
}

function getSessionId(request: Request): string | null {
  return getCookie(request, 'session');
}

function buildStateCookie(nonce: string, maxAge: number): string {
  const parts = [
    `${OAUTH_STATE_COOKIE}=${nonce}`,
    'HttpOnly',
    'Secure',
    // Lax: sent on the top-level redirect back from Google, never on
    // cross-site subrequests.
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    'Path=/auth'
  ];
  return parts.join('; ');
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
