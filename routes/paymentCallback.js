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

  // Autentikasi dihilangkan sesuai permintaan
  // (Validasi signature webhook dinonaktifkan)

  const rawBody = req.body;
  const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  
  // Ekstrak data dengan berbagai format field
  const event = payload?.event || payload?.data?.event;
  const status = payload?.status || payload?.data?.status;
  // Kadang externalId dari callback dikirim sebagai order_id atau dalam properti data
  const externalId = payload?.externalId || payload?.external_id || payload?.order_id || payload?.data?.externalId || payload?.data?.external_id || payload?.data?.order_id;

  console.log("anjay callback parsed:", { event, status, externalId });

  // Selalu kirim response 200 dengan cepat (<10 detik) ke Anjay PG
  res.status(200).json({ status: 'OK', received: true });

  const s = String(status).toUpperCase();
  const isPaid = (s === 'PAID' || s === 'COMPLETED' || event === 'payment.paid' || event === 'payment.success');

  // Proses async di belakang layar jika status payment paid/completed
  if (externalId && isPaid) {
    try {
      await fulfillPaidOrder(externalId, payload);
    } catch (err) {
      console.error(`[PaymentCallback] Error fulfilling order ${externalId}:`, err.message);
    }
  }
});

export default router;
