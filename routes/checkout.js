import express from 'express';
import { createOrder } from '../services/orderService.js';

const router = express.Router();

// POST /checkout - Create Order & Generate Payment Invoice
router.post('/', async (req, res, next) => {
  try {
    const { productId, qty, guestContact } = req.body;

    if (!productId || !qty) {
      return res.status(400).send('Product and quantity are required');
    }

    const prisma = (await import('../lib/prisma.js')).default;
    
    if (req.session.activeOrderCode) {
      const activeOrder = await prisma.order.findUnique({
        where: { orderCode: req.session.activeOrderCode }
      });
      if (activeOrder && activeOrder.status === 'PENDING_PAYMENT') {
        return res.redirect(`/track?orderCode=${activeOrder.orderCode}&error=Selesaikan+atau+batalkan+pesanan+ini+terlebih+dahulu`);
      }
    }

    const qtyNum = parseInt(qty, 10);
    const userId = req.session?.user?.id || null;

    const result = await createOrder({
      productId,
      qty: qtyNum,
      guestContact,
      guestEmail: guestContact,
      userId
    });

    req.session.activeOrderCode = result.order.orderCode;

    res.render('checkout', {
      title: 'Selesaikan Pembayaran — Masuqik Store',
      order: result.order,
      paymentUrl: result.paymentUrl,
      invoiceCode: result.invoiceCode,
      qrString: result.qrString,
      expiredAt: result.expiredAt,
      platformFee: result.platformFee,
      grandTotal: result.grandTotal
    });
  } catch (error) {
    console.error('[CheckoutRoute] Error:', error.message);
    res.status(500).send(`Gagal memproses order: ${error.message}`);
  }
});

// POST /checkout/cancel - Cancel Invoice at PG and update order status
router.post('/cancel', async (req, res) => {
  try {
    const { orderCode, invoiceCode } = req.body;
    if (invoiceCode) {
      const { cancelAnjayInvoice } = await import('../lib/anjayClient.js');
      await cancelAnjayInvoice(invoiceCode).catch(err => console.error('[CancelRoute] PG cancel error:', err.message));
    }
    if (orderCode) {
      const prisma = (await import('../lib/prisma.js')).default;
      await prisma.order.updateMany({
        where: { orderCode, status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELLED' }
      });
      if (req.session?.activeOrderCode === orderCode) {
        req.session.activeOrderCode = null;
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /checkout/status/:orderCode - API to check order status for polling
router.get('/status/:orderCode', async (req, res) => {
  try {
    const prisma = (await import('../lib/prisma.js')).default;
    const order = await prisma.order.findUnique({
      where: { orderCode: req.params.orderCode },
      select: { status: true }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ status: order.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
