import express from 'express';
import path from 'path';
import { Resend } from 'resend';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Resend with API key from environment variable
// Uses HTTPS (port 443) — bypasses SMTP firewall blocks on cloud hosts like Render
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── 1. GLOBAL MIDDLEWARE ────────────────────────────────────────────────────
app.use(express.json());

// In-memory store for OTPs (Key: email, Value: { otp, expires })
const otpStore = new Map<string, { otp: string; expires: number }>();

// ─── 2. API ROUTES ───────────────────────────────────────────────────────────

// Endpoint to send OTP
app.post('/api/otp/send', async (req, res) => {
  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Expiry in 5 minutes
  const expires = Date.now() + 5 * 60 * 1000;
  otpStore.set(normalizedEmail, { otp, expires });

  console.log(`Generated OTP for ${normalizedEmail}: ${otp}`);

  // Verify that RESEND_API_KEY is configured
  if (!process.env.RESEND_API_KEY) {
    console.warn(`RESEND_API_KEY is not set. OTP for testing: ${otp}`);
    return res.status(200).json({
      success: true,
      warning: 'RESEND_NOT_CONFIGURED',
      otp: otp,
      message: `Email service not configured. For testing, use this OTP code: ${otp}`
    });
  }

  try {
    // Send via Resend HTTP API (HTTPS port 443) — bypasses SMTP firewall on Render
    const { error: resendError } = await resend.emails.send({
      from: 'Vajranad Dhol Tasha Pathak <onboarding@resend.dev>',
      to: [normalizedEmail],
      subject: 'Vajranad Login/Signup OTP Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 3px double #D4AF37; border-radius: 16px; background-color: #FAF6EE; color: #333;">
          <div style="text-align: center; border-bottom: 2px solid #800000; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #800000; margin: 0; font-family: 'Georgia', serif; text-transform: uppercase; letter-spacing: 1px;">&#2357;&#2332;&#2381;&#2352;&#2344;&#2366;&#2342;</h2>
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
      `,
    });

    if (resendError) {
      console.error('Resend API error:', resendError);
      return res.status(500).json({
        success: false,
        error: `Failed to send email: ${resendError.message}`
      });
    }

    return res.status(200).json({ success: true, message: 'OTP sent successfully via email.' });
  } catch (error: any) {
    console.error('Error sending email via Resend:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to send email: ${error.message}`
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
