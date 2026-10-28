/* Pinnacle South website server.
   Serves the static site and handles the contact form at POST /api/contact,
   sending each inquiry by SMTP. All mail settings come from environment
   variables (set them in Render → Environment, or in a local .env file). */
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const altchaExpress = require("altcha-lib/frameworks/express");
const { deriveKey } = require("altcha-lib/algorithms/pbkdf2");

try { process.loadEnvFile(path.join(__dirname, ".env")); } catch (err) { /* no .env: use real env vars */ }

const {
  PORT = 3000,
  SMTP_HOST = "smtp.gmail.com",
  SMTP_PORT = "465",
  SMTP_USER,
  SMTP_PASS,
  MAIL_TO,
  MAIL_FROM_NAME = "Pinnacle South Website",
  ALTCHA_HMAC_KEY
} = process.env;

/* ---------- ALTCHA (proof-of-work "I'm not a robot" check) ----------
   The browser solves a small puzzle issued by /api/altcha/challenge; /api/contact
   only sends mail when the solution verifies and hasn't been used before. */
const usedChallenges = new altchaExpress.CappedMap({ maxSize: 10000 }); // replay protection
let altcha = null; // set up in start() once the key secret is derived
async function setupAltcha() {
  if (!ALTCHA_HMAC_KEY) { console.error("ALTCHA_HMAC_KEY is not set: the contact form will reject all submissions"); return; }
  const keySecret = await altchaExpress.deriveHmacKeySecret(ALTCHA_HMAC_KEY);
  altcha = altchaExpress.create({
    deriveKey: deriveKey,
    hmacSignatureSecret: ALTCHA_HMAC_KEY,
    hmacKeySignatureSecret: keySecret,
    store: usedChallenges,
    createChallengeParameters: function () {
      return {
        algorithm: "PBKDF2/SHA-256",
        cost: 5000,
        counter: altchaExpress.randomInt(5000, 10000),
        expiresAt: Math.floor(Date.now() / 1000) + 20 * 60 // 20 minutes to fill in the form
      };
    }
  });
}
async function verifyAltcha(req, res) {
  if (!altcha) return "not configured";
  let error = null;
  await new Promise(function (resolve) {
    altcha.middleware({ throwOnFailure: false })(req, res, function (err) {
      error = err ? err.message : (res.locals.altcha && res.locals.altcha.error);
      resolve();
    });
  });
  return error;
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Render sits behind a proxy; needed for the visitor's real IP

/* ---------- Contact form ---------- */
const FIELDS = [
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["property_name", "Property Name"],
  ["property_address", "Property Address"],
  ["message", "Message"],
  ["submitted_ct", "Submitted"],
  ["page_url", "Page"]
];

// simple per-visitor limit: 5 verified submissions per 10 minutes.
// pinnaclesouth.net reaches this server through the static site's rewrite (an extra
// proxy hop), so key on the first X-Forwarded-For entry — the visitor's own address.
function visitorIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req.ip;
}
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), windowMs = 10 * 60 * 1000;
  const recent = (hits.get(ip) || []).filter(function (t) { return now - t < windowMs; });
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}
setInterval(function () { hits.clear(); }, 60 * 60 * 1000).unref();

function clean(v, max) { return String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, max); }
function esc(s) {
  return s.replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function centralTimeNow() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", weekday: "short", year: "numeric", month: "short",
    day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
  }).format(new Date());
}

// Branded inquiry email: navy header, field table (every field shown, even if blank), footer.
// Inline styles and tables only, so it renders the same in Gmail, Outlook and Apple Mail.
const EMAIL_ROWS = [
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone Number"],
  ["property_name", "Property Name"],
  ["property_address", "Property Address"],
  ["message", "Message"]
];
function inquiryEmail(data) {
  const submitted = data.submitted_ct || centralTimeNow();
  const font = "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;";
  const rows = EMAIL_ROWS.map(function (f) {
    let value = esc(data[f[0]] || "").replace(/\n/g, "<br>");
    if (f[0] === "email" && data.email) {
      value = '<a href="mailto:' + esc(data.email) + '" style="color:#1b6fa3;text-decoration:underline;">' + esc(data.email) + "</a>";
    }
    return '<tr>' +
      '<td width="38%" style="' + font + 'padding:14px 16px;background:#f3f8fc;border:1px solid #e3e9f0;font-size:15px;font-weight:bold;color:#0f2440;vertical-align:middle;">' + f[1] + "</td>" +
      '<td style="' + font + 'padding:14px 16px;background:#ffffff;border:1px solid #e3e9f0;font-size:15px;line-height:1.5;color:#0f2440;vertical-align:middle;">' + (value || "&nbsp;") + "</td>" +
      "</tr>";
  }).join("");

  const html =
    '<!doctype html><html><body style="margin:0;padding:0;background:#f1f4f8;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f8;"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e9f0;border-radius:8px;border-collapse:separate;overflow:hidden;">' +
    // header
    '<tr><td style="' + font + 'background:#13233f;padding:26px 28px 24px;border-radius:8px 8px 0 0;">' +
    '<div style="font-size:12px;letter-spacing:4px;color:#9fc2e0;text-transform:uppercase;">Pinnacle South</div>' +
    '<div style="font-size:24px;font-weight:bold;color:#ffffff;padding-top:10px;">Website Inquiry</div>' +
    "</td></tr>" +
    // body
    '<tr><td style="' + font + 'padding:24px 28px 8px;font-size:15px;line-height:1.6;color:#44566e;">' +
    "A new inquiry was submitted through the contact form on the Pinnacle South website." +
    "</td></tr>" +
    '<tr><td style="padding:8px 28px 4px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + rows + "</table>" +
    "</td></tr>" +
    // footer
    '<tr><td style="' + font + 'padding:18px 28px 26px;font-size:13px;line-height:1.7;color:#74849a;">' +
    'Submitted: <strong style="color:#0f2440;">' + esc(submitted) + "</strong><br>" +
    "Reply to this email to respond directly to " + esc(data.name) + "." +
    "</td></tr>" +
    "</table></td></tr></table></body></html>";

  const text =
    "PINNACLE SOUTH — Website Inquiry\n\n" +
    "A new inquiry was submitted through the contact form on the Pinnacle South website.\n\n" +
    EMAIL_ROWS.map(function (f) { return f[1] + ": " + (data[f[0]] || ""); }).join("\n") +
    "\n\nSubmitted: " + submitted +
    (data.page_url ? "\nPage: " + data.page_url : "") +
    "\nReply to this email to respond directly to " + data.name + ".";

  return { html: html, text: text };
}

app.post("/api/contact", express.json({ limit: "20kb" }), async function (req, res) {
  const body = req.body || {};
  // spam trap: hidden "website" field is only filled by bots — pretend success
  if (body.website) return res.json({ ok: true });

  const data = {};
  FIELDS.forEach(function (f) { data[f[0]] = clean(body[f[0]], f[0] === "message" ? 5000 : 300); });
  if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return res.status(400).json({ ok: false, error: "Name and a valid email are required" });
  }
  const altchaError = await verifyAltcha(req, res);
  if (altchaError) {
    console.warn("Contact form: ALTCHA check failed:", altchaError);
    return res.status(403).json({ ok: false, error: "verification" });
  }
  // counted only after the robot check, so rejected bot attempts can't lock out visitors
  if (rateLimited(visitorIp(req))) return res.status(429).json({ ok: false, error: "Too many requests" });
  if (!SMTP_USER || !SMTP_PASS || !MAIL_TO) {
    console.error("Contact form: SMTP_USER, SMTP_PASS and MAIL_TO must be set");
    return res.status(500).json({ ok: false, error: "Mail is not configured" });
  }

  const mail = inquiryEmail(data);
  try {
    await transporter.sendMail({
      from: { name: MAIL_FROM_NAME, address: SMTP_USER },
      to: MAIL_TO,
      replyTo: { name: data.name, address: data.email },
      subject: "Website Inquiry – Pinnacle South",
      text: mail.text,
      html: mail.html
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Contact form: send failed:", err.message);
    res.status(502).json({ ok: false, error: "Send failed" });
  }
});

app.get("/api/altcha/challenge", function (req, res, next) {
  if (!altcha) return res.status(503).json({ error: "not configured" });
  altcha.challengeHandler(req, res, next);
});

/* ---------- Static site ---------- */
// never serve server-side files
app.use(function (req, res, next) {
  if (/^\/(server\.js|package(-lock)?\.json|node_modules(\/|$)|\.env)/i.test(req.path)) return res.status(404).end();
  next();
});
app.use(express.static(__dirname, { extensions: ["html"], dotfiles: "ignore" }));
app.use(function (req, res) { res.status(404).send("Page not found"); });

if (require.main === module) {
  setupAltcha().then(function () {
    app.listen(PORT, function () { console.log("Pinnacle South site on http://localhost:" + PORT); });
  });
}
module.exports = { inquiryEmail: inquiryEmail }; // lets the email template be previewed without sending
