import AnjayPGPackage from 'anjay-pg-sdk';
const AnjayPG = AnjayPGPackage.default || AnjayPGPackage;
import crypto from 'crypto';
import { config } from '../config/env.js';

// Inisialisasi Anjay PG SDK (Konstruktor menerima string apiKey langsung)
export const anjay = new AnjayPG(config.anjayApiKey);

/**
 * Verify Anjay PG Webhook Signature
 * Signature format: HMAC-SHA256(rawBody, SECRET_WEBHOOK)
 */
export function verifyAnjayWebhook(rawBody, headerSignature) {
  if (!headerSignature || !config.anjayWebhookSecret) {
    return false;
  }
  const computedSignature = crypto
    .createHmac('sha256', config.anjayWebhookSecret)
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
    const response = await anjay.createInvoice({
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
    const response = await anjay.cancelInvoice(invoiceCode);
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
    const response = await anjay.getInvoice(invoiceCode);
    return response;
  } catch (error) {
    console.error('[AnjayClient] Error getting invoice:', error.response?.data || error.message);
    return null;
  }
}
