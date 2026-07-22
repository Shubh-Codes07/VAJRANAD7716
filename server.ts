import express from 'express';
import path from 'path';
import nodemailer from 'nodemailer';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// Globally disable TLS verification for local dev (fixes self-signed certificate issues)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// In-memory store for OTPs (Key: email, Value: { otp, expires })
const otpStore = new Map<string, { otp: string; expires: number }>();

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

  // Retrieve SMTP credentials
  const smtpUser = process.env.SMTP_USER || "swayam2005raje@gmail.com";
  const smtpPass = process.env.SMTP_PASS || "pqdg wlpa iqnb oxja";

  if (!smtpUser || !smtpPass) {
    console.warn(`SMTP credentials are not configured. OTP for testing is: ${otp}`);
    return res.status(200).json({ 
      success: true, 
      warning: 'SMTP_NOT_CONFIGURED',
      otp: otp,
      message: `SMTP email sending is not configured. For testing/review, please use this OTP code: ${otp}`
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

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

    await transporter.sendMail(mailOptions);
    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error('Error sending email:', error);
    return res.status(200).json({ 
      success: true, 
      warning: 'SMTP_SEND_FAILED',
      otp: otp,
      message: `Failed to send email via SMTP (${error.message}). Please make sure you use a Gmail 'App Password' if utilizing Gmail SMTP, and not your standard account password. For testing, please use this OTP: ${otp}`
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

// Vite middleware configuration or production static serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
