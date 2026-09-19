import express from 'express';
import { config } from '../config/env.js';
import { verifyAnjayWebhook } from '../lib/anjayClient.js';
import { fulfillPaidOrder } from '../services/orderService.js';

const router = express.Router();

// POST /api/payment/callback/anjay - Anjay PG Webhook Callback
// Melayani autentikasi via URL Query Parameter (?secret=... atau ?token=...)
router.post('/anjay', async (req, res) => {
  const paramSecret = req.query.secret || req.query.token || req.query.key;
  const expectedSecret = config.anjayWebhookSecret;

  // Autentikasi via Query Parameter
  if (expectedSecret && paramSecret !== expectedSecret) {
    // Jika dikirimkan param secret tapi tidak cocok, atau param secret wajib
    const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
    const isValidSignature = await verifyAnjayWebhook(req.body, signature);

    if (!isValidSignature && paramSecret !== expectedSecret) {
      console.error('[PaymentCallback] Invalid webhook secret param / signature detected');
      return res.status(401).json({ error: 'Unauthorized secret parameter' });
    }
  }

  const rawBody = req.body;
  const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  const { event, status, externalId } = payload || {};

  console.log("anjay callback", payload);

  // Selalu kirim response 200 dengan cepat (<10 detik) ke Anjay PG
  res.status(200).json({ status: 'OK', received: true });

  // Proses async di belakang layar jika status payment paid/completed
  if (externalId && (status === 'completed' || status === 'PAID' || event === 'payment.paid')) {
    try {
      await fulfillPaidOrder(externalId, payload);
    } catch (err) {
      console.error(`[PaymentCallback] Error fulfilling order ${externalId}:`, err.message);
    }
  }
});

export default router;
