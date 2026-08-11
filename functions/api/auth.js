/**
 * GET /api/auth
 *
 * Step 1 of the Decap CMS <-> GitHub OAuth handshake.
 * Decap CMS opens this URL in a popup window when someone clicks
 * "Login with GitHub" on /admin. We redirect the popup to GitHub's
 * own authorize screen, and stash a random `state` value in a short-lived
 * cookie so /api/callback can confirm the response actually came from
 * the request we sent (basic CSRF protection).
 *
 * Requires these Cloudflare Pages environment variables/secrets:
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET   (used later, in callback.js)
 */
export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response(
      'Missing GITHUB_CLIENT_ID environment variable. Set it in Cloudflare Pages > Settings > Environment variables.',
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/callback`;
  const state = crypto.randomUUID();

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', 'repo,user');
  authorizeUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
