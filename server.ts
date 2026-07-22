import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// Globally disable TLS verification for local dev (fixes self-signed certificate issues)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── 1. GLOBAL MIDDLEWARE ────────────────────────────────────────────────────
app.use(express.json());

// In-memory store for OTPs (Key: email, Value: { otp, expires })
const otpStore = new Map<string, { otp: string; expires: number }>();

// ─── 2. API ROUTES ───────────────────────────────────────────────────────────

// Endpoint to send OTP
app.post('/api/otp/send', async (req, res) => {
  console.log('[OTP] /api/otp/send called');

  const { email, name } = req.body;
  if (!email) {
    console.warn('[OTP] Request rejected: email is missing');
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log(`[OTP] Processing request for: ${normalizedEmail}`);

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Expiry in 5 minutes
  const expires = Date.now() + 5 * 60 * 1000;
  otpStore.set(normalizedEmail, { otp, expires });
  console.log(`[OTP] Generated OTP for ${normalizedEmail}: ${otp}`);

  // Retrieve EmailJS credentials
  const emailjsServiceId = process.env.EMAILJS_SERVICE_ID;
  const emailjsTemplateId = process.env.EMAILJS_TEMPLATE_ID;
  const emailjsPublicKey = process.env.EMAILJS_PUBLIC_KEY;
  const emailjsPrivateKey = process.env.EMAILJS_PRIVATE_KEY; // Only needed if enabled in EmailJS settings

  if (!emailjsServiceId || !emailjsTemplateId || !emailjsPublicKey) {
    console.error('[OTP] EmailJS credentials are not set in environment variables (EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY)');
    return res.status(500).json({
      error: 'Email service is not configured on the server. Please contact the administrator.'
    });
  }

  console.log(`[OTP] Sending email to ${normalizedEmail} via EmailJS API...`);

  try {
    const payload = {
      service_id: emailjsServiceId,
      template_id: emailjsTemplateId,
      user_id: emailjsPublicKey,
      accessToken: emailjsPrivateKey,
      template_params: {
        to_email: normalizedEmail,
        name: name || "Member",
        otp: otp
      }
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('[OTP] ✗ EmailJS API FAILED:', response.status, responseText);
      return res.status(500).json({
        error: `Failed to send OTP email (EmailJS error). Please try again or contact support.`
      });
    }

    console.log(`[OTP] ✓ Email sent successfully via EmailJS! Response: ${responseText}`);
    return res.status(200).json({ success: true, message: 'OTP sent successfully to your email.' });

  } catch (error: any) {
    console.error('[OTP] ✗ Email sending FAILED (Network/Fetch error):', error.message);
    console.error('[OTP] Full error:', error);

    // Always return a response so the frontend never hangs
    return res.status(500).json({
      error: `Failed to send OTP email: ${error.message}. Please try again or contact support.`
    });
  }
});


// Endpoint to verify OTP
app.post('/api/otp/verify', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this email' });
  }

  if (Date.now() > record.expires) {
    otpStore.delete(normalizedEmail);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (record.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid OTP code. Please try again.' });
  }

  // Success, clean up OTP
  otpStore.delete(normalizedEmail);
  return res.json({ success: true });
});

// Safety net: catch any unmatched /api/* routes and return a clean JSON 404
// This prevents API misses from falling through to the SPA catch-all
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// ─── 3. STATIC FILE SERVING + 4. SPA CATCH-ALL (production only) ────────────
// Vite dev middleware configuration or production static serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    // Development: use Vite's dev server as middleware (HMR, hot reload)
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve pre-built static files from dist/
    const distPath = path.join(process.cwd(), 'dist');
    // 3. Static assets (JS, CSS, images)
    app.use(express.static(distPath));
    // 4. Catch-all: return index.html for any non-API route (SPA client-side routing)
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
