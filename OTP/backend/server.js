const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function verifyOTP(input, actual) {
  return String(input).trim() === String(actual).trim();
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body || {};

  if (!email || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ success: false, message: 'Valid email is required.' });
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return res.status(500).json({
      success: false,
      message: 'SMTP is not configured. Add your Gmail App Password to the backend .env file.',
    });
  }

  const otp = generateOTP();
  const expiresAt = Date.now() + (Number(process.env.OTP_EXPIRE_MINUTES || 5) * 60 * 1000);

  otpStore.set(email.toLowerCase(), { otp, expiresAt });

  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Your OTP Verification Code',
      text: `Your OTP is ${otp}. It is valid for ${process.env.OTP_EXPIRE_MINUTES || 5} minutes.`,
      html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>It is valid for ${process.env.OTP_EXPIRE_MINUTES || 5} minutes.</p>`,
    });

    return res.json({ success: true, message: 'OTP sent successfully.' });
  } catch (error) {
    console.error('SMTP send error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
  }
});

app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body || {};

  if (!email || !otp) {
    return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
  }

  const entry = otpStore.get(email.toLowerCase());
  if (!entry) {
    return res.status(400).json({ success: false, message: 'No OTP found for this email.' });
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
  }

  if (verifyOTP(otp, entry.otp)) {
    otpStore.delete(email.toLowerCase());
    return res.json({ success: true, message: 'OTP verified successfully.' });
  }

  return res.status(400).json({ success: false, message: 'Invalid OTP.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`OTP server running on http://localhost:${PORT}`);
  });
}

module.exports = { generateOTP, verifyOTP, app };
