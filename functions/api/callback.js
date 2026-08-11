/**
 * GET /api/callback
 *
 * Step 2 of the Decap CMS <-> GitHub OAuth handshake.
 * GitHub redirects here after the editor approves access. We exchange the
 * temporary `code` for a real access token server-side (the only place the
 * client secret is allowed to live), then hand that token back to the
 * Decap CMS popup via postMessage, following the exact message protocol
 * Decap's GitHub backend expects.
 *
 * Requires these Cloudflare Pages environment variables/secrets:
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET   <- mark this one as "Secret", never expose it client-side
 */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  const cookieHeader = request.headers.get('Cookie') || '';
  const stateMatch = cookieHeader.match(/oauth_state=([^;]+)/);
  const savedState = stateMatch ? stateMatch[1] : null;

  if (!code) {
    return htmlError('Missing authorization code from GitHub.');
  }
  if (!returnedState || returnedState !== savedState) {
    return htmlError('OAuth state mismatch. Please close this window and try logging in again.');
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return htmlError(
      'Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variables on the server.'
    );
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/callback`,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error || !tokenData.access_token) {
    return htmlError(
      `GitHub rejected the request: ${tokenData.error_description || tokenData.error || 'unknown error'}`
    );
  }

  const payload = JSON.stringify({ token: tokenData.access_token, provider: 'github' });

  // This is Decap CMS's documented popup handshake: the popup first tells the
  // opener it's authorizing, waits for an acknowledgement message, then sends
  // success (or error) with the token attached.
  const body = `<!DOCTYPE html>
<html>
  <body>
    <script>
      (function() {
        function receiveMessage(message) {
          window.opener.postMessage(
            'authorization:github:success:${payload.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',
            message.origin
          );
          window.removeEventListener('message', receiveMessage, false);
        }
        window.addEventListener('message', receiveMessage, false);
        window.opener.postMessage('authorizing:github', '*');
      })();
    </script>
    <p style="font-family: sans-serif; padding: 24px;">Login successful — you can close this window.</p>
  </body>
</html>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Clear the one-time state cookie now that it's been used.
      'Set-Cookie': 'oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  });
}

function htmlError(message) {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family: sans-serif; padding: 24px;">
      <h3>Login failed</h3>
      <p>${message}</p>
      <p>Close this window and try again.</p>
    </body></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
