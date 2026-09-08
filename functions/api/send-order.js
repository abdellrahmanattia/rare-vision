/**
 * RARE VISION — functions/api/send-order.js
 * Cloudflare Pages Function. Receives { text } from js/checkout.js after an
 * order has already been saved to Firestore, and forwards it to your
 * Telegram bot — keeping TELEGRAM_BOT_TOKEN out of client-side code.
 *
 * SETUP:
 *   Cloudflare dashboard → your Pages project → Settings → Environment
 *   variables → add, for BOTH Production and Preview:
 *     TELEGRAM_BOT_TOKEN   (from @BotFather on Telegram)
 *     TELEGRAM_CHAT_ID     (the chat/group/channel that should receive orders)
 *   Redeploy after adding them (env vars only take effect on new deploys).
 *
 * This file lives at /api/send-order because Cloudflare Pages Functions
 * route by file path under /functions — no extra routing config needed.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Telegram is not configured on this deployment (missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID environment variables).' }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const text = typeof body.text === 'string' ? body.text.slice(0, 4000) : '';
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing "text"' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const telegramRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    });
    const data = await telegramRes.json();
    if (!telegramRes.ok || !data.ok) {
      return new Response(JSON.stringify({ ok: false, error: data.description || 'Telegram API error' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}
