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

  // Retrieve Brevo credentials
  const brevoApiKey = process.env.BREVO_API_KEY;
  const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!brevoApiKey || !brevoSenderEmail) {
    console.error('[OTP] Brevo credentials are not set in environment variables (BREVO_API_KEY / BREVO_SENDER_EMAIL)');
    return res.status(500).json({
      error: 'Email service is not configured on the server. Please contact the administrator.'
    });
  }

  console.log(`[OTP] Using Brevo Sender: ${brevoSenderEmail}`);
  console.log(`[OTP] Sending email to ${normalizedEmail} via Brevo API...`);

  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 3px double #D4AF37; border-radius: 16px; background-color: #FAF6EE; color: #333;">
        <div style="text-align: center; border-bottom: 2px solid #800000; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #800000; margin: 0; font-family: 'Georgia', serif; text-transform: uppercase; letter-spacing: 1px;">वज्रनाद</h2>
          <p style="color: #D4AF37; margin: 5px 0 0 0; font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase;">Dhol Tasha Pathak Belgaum</p>
        </div>
        <p style="font-size: 14px; line-height: 1.5; font-weight: 500;">
          Hello ${name ? `<strong>${name}</strong>` : 'Member'},
        </p>
        <p style="font-size: 14px; line-height: 1.5;">
          You requested to sign in/register for your Vajranad Dhol Tasha Pathak account. Use the secure One-Time Password (OTP) below to complete your verification:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #800000; background-color: #FFFDD0; padding: 12px 24px; border-radius: 12px; border: 1px dashed #D4AF37; display: inline-block; font-family: monospace;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 12px; color: #666; line-height: 1.4; text-align: center; margin-top: 20px;">
          This OTP is valid for <strong>5 minutes</strong>. If you did not request this, please ignore this email.
        </p>
        <div style="text-align: center; border-top: 1px solid #ddd; margin-top: 30px; padding-top: 15px; font-size: 11px; color: #888;">
          &copy; ${new Date().getFullYear()} Vajranad Dhol Tasha Pathak, Belgaum. All rights reserved.
        </div>
      </div>
    `;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': brevoApiKey
      },
      body: JSON.stringify({
        sender: { email: brevoSenderEmail, name: "Vajranad Dhol Tasha Pathak" },
        to: [{ email: normalizedEmail, name: name || "Member" }],
        subject: 'Vajranad Login/Signup OTP Verification',
        htmlContent: htmlContent
      })
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      console.error('[OTP] ✗ Brevo API FAILED:', response.status, data);
      return res.status(500).json({
        error: `Failed to send OTP email (Brevo error). Please try again or contact support.`
      });
    }

    console.log(`[OTP] ✓ Email sent successfully via Brevo! MessageId: ${data?.messageId || 'unknown'}`);
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
