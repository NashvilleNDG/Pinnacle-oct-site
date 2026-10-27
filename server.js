/* Pinnacle South website server.
   Serves the static site and handles the contact form at POST /api/contact,
   sending each inquiry by SMTP. All mail settings come from environment
   variables (set them in Render → Environment, or in a local .env file). */
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");

try { process.loadEnvFile(path.join(__dirname, ".env")); } catch (err) { /* no .env: use real env vars */ }

const {
  PORT = 3000,
  SMTP_HOST = "smtp.gmail.com",
  SMTP_PORT = "465",
  SMTP_USER,
  SMTP_PASS,
  MAIL_TO,
  MAIL_FROM_NAME = "Pinnacle South Website"
} = process.env;

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

// simple per-IP limit: 5 submissions per 10 minutes
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

app.post("/api/contact", express.json({ limit: "20kb" }), async function (req, res) {
  const body = req.body || {};
  // spam trap: hidden "website" field is only filled by bots — pretend success
  if (body.website) return res.json({ ok: true });
  if (rateLimited(req.ip)) return res.status(429).json({ ok: false, error: "Too many requests" });

  const data = {};
  FIELDS.forEach(function (f) { data[f[0]] = clean(body[f[0]], f[0] === "message" ? 5000 : 300); });
  if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return res.status(400).json({ ok: false, error: "Name and a valid email are required" });
  }
  if (!SMTP_USER || !SMTP_PASS || !MAIL_TO) {
    console.error("Contact form: SMTP_USER, SMTP_PASS and MAIL_TO must be set");
    return res.status(500).json({ ok: false, error: "Mail is not configured" });
  }

  const rows = FIELDS.filter(function (f) { return data[f[0]]; });
  const text = rows.map(function (f) { return f[1] + ": " + data[f[0]]; }).join("\n");
  const html =
    '<table cellpadding="8" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
    rows.map(function (f) {
      return '<tr><td style="font-weight:bold;vertical-align:top;border-bottom:1px solid #eee">' + f[1] +
        '</td><td style="border-bottom:1px solid #eee;white-space:pre-wrap">' + esc(data[f[0]]) + "</td></tr>";
    }).join("") + "</table>";

  try {
    await transporter.sendMail({
      from: { name: MAIL_FROM_NAME, address: SMTP_USER },
      to: MAIL_TO,
      replyTo: { name: data.name, address: data.email },
      subject: "Website Inquiry – Pinnacle South",
      text: text,
      html: html
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Contact form: send failed:", err.message);
    res.status(502).json({ ok: false, error: "Send failed" });
  }
});

/* ---------- Static site ---------- */
// never serve server-side files
app.use(function (req, res, next) {
  if (/^\/(server\.js|package(-lock)?\.json|node_modules(\/|$)|\.env)/i.test(req.path)) return res.status(404).end();
  next();
});
app.use(express.static(__dirname, { extensions: ["html"], dotfiles: "ignore" }));
app.use(function (req, res) { res.status(404).send("Page not found"); });

app.listen(PORT, function () { console.log("Pinnacle South site on http://localhost:" + PORT); });
