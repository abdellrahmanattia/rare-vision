/**
 * RARE VISION — google-apps-script/EmailAutomation.gs
 * ============================================================================
 * Processes the Firestore `email_queue` collection on a timer, sending each
 * pending email through Gmail first (up to 500/day) and then Brevo (up to
 * 300/day) once Gmail's daily quota is used up — an 800/day combined cap,
 * exactly as the spec asks for. Anything past the cap is simply left
 * "pending" and picked up automatically on the next run once the day
 * rolls over.
 *
 * WHY APPS SCRIPT (not a Cloudflare Function): Apps Script can authenticate
 * to Firestore as YOUR OWN Google account (via ScriptApp.getOAuthToken()
 * with the "datastore" scope declared in appsscript.json) — since you own
 * the Firebase project, that identity already has permission to read/write
 * Firestore directly, bypassing Firestore Security Rules entirely (rules
 * only govern the client SDKs). No service-account key file needed, and
 * Apps Script's built-in time-driven triggers give you free, reliable
 * "every N minutes" scheduling with zero extra infrastructure.
 *
 * ---------------------------------------------------------------------------
 * SETUP (about 10 minutes):
 *   1. Go to https://script.google.com/ → New project.
 *   2. Delete the default Code.gs content and paste this whole file in.
 *   3. Click the gear icon (Project Settings) → check "Show appscript.json
 *      manifest file in editor", then open appscript.json (in the file
 *      list) and paste the manifest from google-apps-script/appsscript.json
 *      (in this same folder) over its contents. This is what grants the
 *      script the Firestore ("datastore") + Gmail scopes it needs.
 *   4. Back in Code.gs, click the ⚙ Project Settings → Script Properties →
 *      add these three properties:
 *        FIREBASE_PROJECT_ID   = your Firebase project ID (from firebaseConfig)
 *        BREVO_API_KEY         = your Brevo API key (optional — leave blank
 *                                 to run Gmail-only; get one free at
 *                                 app.brevo.com → SMTP & API → API Keys)
 *        SENDER_EMAIL          = the "from" address Gmail should send as
 *                                 (must be an address YOUR Google account
 *                                 can send as, e.g. your own Gmail address)
 *   5. Run the `processEmailQueue` function once manually (Run ▶) — Google
 *      will prompt you to authorize the script; approve it. This also
 *      confirms everything is wired correctly.
 *   6. Set up automatic runs: left sidebar → Triggers (clock icon) → + Add
 *      Trigger → choose function `processEmailQueue` → Time-driven →
 *      Minutes timer → Every 15 minutes (or your preference) → Save.
 *   That's it — new emails written to Firestore's `email_queue` collection
 *   (by the idle popup, and by the admin dashboard's "Restock & Notify"
 *   button) will now go out automatically.
 * ============================================================================
 */

const GAS_DAILY_LIMIT = 500;
const BREVO_DAILY_LIMIT = 300;

function processEmailQueue() {
  const props = PropertiesService.getScriptProperties();
  const projectId = props.getProperty('FIREBASE_PROJECT_ID');
  const brevoKey = props.getProperty('BREVO_API_KEY');
  const senderEmail = props.getProperty('SENDER_EMAIL') || Session.getActiveUser().getEmail();

  if (!projectId) {
    Logger.log('Missing FIREBASE_PROJECT_ID script property — see setup instructions at the top of this file.');
    return;
  }

  const counters = getTodayCounters_(props);
  let gasRemaining = Math.max(0, GAS_DAILY_LIMIT - counters.gasSent);
  let brevoRemaining = Math.max(0, BREVO_DAILY_LIMIT - counters.brevoSent);

  if (gasRemaining === 0 && (brevoRemaining === 0 || !brevoKey)) {
    Logger.log('Daily sending limit reached for all configured channels — remaining emails stay queued for tomorrow.');
    return;
  }

  const pending = fetchPendingEmails_(projectId);
  Logger.log('Found ' + pending.length + ' pending email(s) in the queue.');

  for (const email of pending) {
    if (gasRemaining <= 0 && (brevoRemaining <= 0 || !brevoKey)) break; // out of quota for today

    let sentOk = false;
    let channel = '';
    try {
      if (gasRemaining > 0) {
        GmailApp.sendEmail(email.to, email.subject, stripHtml_(email.htmlBody), {
          htmlBody: email.htmlBody,
          from: senderEmail,
          name: 'Rare Vision',
        });
        gasRemaining--;
        counters.gasSent++;
        sentOk = true;
        channel = 'gmail';
      } else if (brevoKey && brevoRemaining > 0) {
        sendViaBrevo_(brevoKey, email, senderEmail);
        brevoRemaining--;
        counters.brevoSent++;
        sentOk = true;
        channel = 'brevo';
      }
    } catch (err) {
      Logger.log('Failed to send to ' + email.to + ': ' + err);
    }

    if (sentOk) {
      updateEmailStatus_(projectId, email.docId, 'sent', channel);
    }
    Utilities.sleep(300); // gentle pacing, avoids hammering either API
  }

  saveTodayCounters_(props, counters);
  Logger.log('Run complete. Sent via Gmail today: ' + counters.gasSent + ', via Brevo today: ' + counters.brevoSent);
}

/* ---------------------------------------------------------------------------
   Firestore REST helpers (authenticated as your own Google account via
   ScriptApp.getOAuthToken() — see the appsscript.json manifest for scopes)
   --------------------------------------------------------------------------- */
function fetchPendingEmails_(projectId) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents:runQuery';
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'email_queue' }],
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } },
      limit: 200,
    },
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText());
  const results = [];
  (json || []).forEach((row) => {
    if (!row.document) return;
    const fields = row.document.fields || {};
    results.push({
      docId: row.document.name.split('/').pop(),
      to: fields.to ? fields.to.stringValue : '',
      subject: fields.subject ? fields.subject.stringValue : '(no subject)',
      htmlBody: fields.htmlBody ? fields.htmlBody.stringValue : '',
    });
  });
  return results;
}

function updateEmailStatus_(projectId, docId, status, channel) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/email_queue/' + docId
    + '?updateMask.fieldPaths=status&updateMask.fieldPaths=sentVia&updateMask.fieldPaths=sentAt';
  const body = {
    fields: {
      status: { stringValue: status },
      sentVia: { stringValue: channel },
      sentAt: { timestampValue: new Date().toISOString() },
    },
  };
  UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
}

/* ---------------------------------------------------------------------------
   Brevo (transactional email API) — used once Gmail's daily quota runs out
   --------------------------------------------------------------------------- */
function sendViaBrevo_(apiKey, email, senderEmail) {
  const res = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'api-key': apiKey },
    payload: JSON.stringify({
      sender: { email: senderEmail, name: 'Rare Vision' },
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: email.htmlBody,
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Brevo error: ' + res.getContentText());
}

/* ---------------------------------------------------------------------------
   Daily counters (stored in Script Properties, reset automatically when the
   calendar date changes — this is what makes the 800/day rollover work)
   --------------------------------------------------------------------------- */
function getTodayCounters_(props) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
  const stored = props.getProperty('DAILY_COUNTERS');
  if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed.date === today) return parsed;
  }
  return { date: today, gasSent: 0, brevoSent: 0 };
}

function saveTodayCounters_(props, counters) {
  props.setProperty('DAILY_COUNTERS', JSON.stringify(counters));
}

function stripHtml_(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
