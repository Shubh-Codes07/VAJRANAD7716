import express from 'express';
import path from 'path';
import dns from 'dns';
import nodemailer from 'nodemailer';
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

  // Retrieve SMTP credentials — prefer GMAIL_USER/GMAIL_APP_PASSWORD,
  // fall back to legacy SMTP_USER/SMTP_PASS for backwards compatibility
  const smtpUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const smtpPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    console.error('[OTP] SMTP credentials are not set in environment variables (GMAIL_USER / GMAIL_APP_PASSWORD)');
    return res.status(500).json({
      error: 'Email service is not configured on the server. Please contact the administrator.'
    });
  }

  console.log(`[OTP] Using SMTP account: ${smtpUser}`);
  console.log('[OTP] Creating Nodemailer transporter...');

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,            // false for port 587 (STARTTLS)
      requireTLS: true,         // Enforce TLS upgrade — more reliable than SSL/465 on Render
      // Custom lookup forces IPv4-only DNS resolution.
      // This is the REAL fix for ENETUNREACH on Render — `family: 4` alone does NOT
      // override the DNS resolver; only a custom lookup function does.
      lookup: (hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        dns.lookup(hostname, { ...options, family: 4 }, callback);
      },
      connectionTimeout: 12000, // 12s connection timeout
      socketTimeout: 20000,     // 20s socket idle timeout
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    console.log('[OTP] Verifying SMTP connection...');
    await transporter.verify();
    console.log('[OTP] SMTP connection verified ✓');

    const mailOptions = {
      from: `"Vajranad Dhol Tasha Pathak" <${smtpUser}>`,
      to: normalizedEmail,
      subject: 'Vajranad Login/Signup OTP Verification',
      html: `
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
      `,
    };

    console.log(`[OTP] Sending email to ${normalizedEmail}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[OTP] ✓ Email sent successfully! MessageId: ${info.messageId}`);

    return res.status(200).json({ success: true, message: 'OTP sent successfully to your email.' });

  } catch (error: any) {
    console.error('[OTP] ✗ Email sending FAILED:', error.message);
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
