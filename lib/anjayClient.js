import AnjayPGPackage from 'anjay-pg-sdk';
const AnjayPG = AnjayPGPackage.default || AnjayPGPackage;
import crypto from 'crypto';
import { config } from '../config/env.js';
import { getStoreSettings } from '../services/adminService.js';

// Legacy export untuk kompatibilitas, akan memakai env default.
// Sangat disarankan memanggil getAnjayInstance() untuk mendapatkan instance terbaru dari DB.
export const anjay = new AnjayPG(config.anjayApiKey);

/**
 * Get dynamic AnjayPG instance based on DB settings
 */
export async function getAnjayInstance() {
  const settings = await getStoreSettings();
  const apiKey = settings.anjay_api_key || config.anjayApiKey;
  return new AnjayPG(apiKey);
}

/**
 * Verify Anjay PG Webhook Signature
 * Signature format: HMAC-SHA256(rawBody, SECRET_WEBHOOK)
 */
export async function verifyAnjayWebhook(rawBody, headerSignature) {
  const settings = await getStoreSettings();
  const secret = settings.anjay_webhook_secret || config.anjayWebhookSecret;

  if (!headerSignature || !secret) {
    return false;
  }
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(headerSignature)
  );
}

/**
 * Helper to create invoice with Anjay PG
 */
export async function createAnjayInvoice({ productName, amount, customerName, customerContact, externalId }) {
  try {
    const anjayInstance = await getAnjayInstance();
    const response = await anjayInstance.createInvoice({
      productName,
      amount,
      customerName: customerName || 'Guest User',
      customerContact: customerContact || 'N/A',
      externalId // Maps to orderCode lokal
    });
    return response;
  } catch (error) {
    console.error('[AnjayClient] Error creating invoice:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Helper to cancel invoice with Anjay PG
 */
export async function cancelAnjayInvoice(invoiceCode) {
  try {
    const anjayInstance = await getAnjayInstance();
    const response = await anjayInstance.cancelInvoice(invoiceCode);
    return response;
  } catch (error) {
    console.error('[AnjayClient] Error cancelling invoice:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Helper to get invoice details with Anjay PG
 */
export async function getAnjayInvoice(invoiceCode) {
  try {
    const anjayInstance = await getAnjayInstance();
    const response = await anjayInstance.getInvoice(invoiceCode);
    return response;
  } catch (error) {
    console.error('[AnjayClient] Error getting invoice:', error.response?.data || error.message);
    return null;
  }
}
