import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = [
  'DATABASE_URL',
  'PANEL_BASE_URL',
  'PANEL_API_KEY',
  'ANJAY_API_KEY',
  'ANJAY_WEBHOOK_SECRET',
  'SESSION_SECRET'
];

export function validateEnv() {
  const missing = [];
  for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    console.error(`[CRITICAL] Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please check your .env file or reference .env.example');
    process.exit(1);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dbUrl: process.env.DATABASE_URL,
  panelBaseUrl: process.env.PANEL_BASE_URL || 'https://panel.ku.anjay.fun',
  panelApiKey: process.env.PANEL_API_KEY,
  anjayApiKey: process.env.ANJAY_API_KEY,
  anjayWebhookSecret: process.env.ANJAY_WEBHOOK_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
};
