import crypto from 'crypto';
import axios from 'axios';
import prisma from '../lib/prisma.js';
import { createAnjayInvoice, getAnjayInvoice } from '../lib/anjayClient.js';
import { takePanelStock } from '../lib/panelClient.js';

/**
 * Generate unique order code (e.g. MSQ-9A8F7B2C)
 */
function generateOrderCode() {
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `MSQ-${hex}`;
}

/**
 * Create a new Order and create Payment Gateway Invoice
 */
export async function createOrder({ productId, qty, guestEmail, guestContact, userId }) {
  if (!productId || !qty || qty < 1) {
    throw new Error('Invalid product or quantity');
  }

  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!product || !product.isActive) {
    throw new Error('Product not found or inactive');
  }

  if (product.stockCount < qty) {
    throw new Error('Stock not sufficient');
  }

  const unitPrice = product.priceRupiah + product.markupPrice;
  const totalAmount = unitPrice * qty;
  const orderCode = generateOrderCode();

  // Create order record locally
  const order = await prisma.order.create({
    data: {
      orderCode,
      productId: product.id,
      userId: userId || null,
      guestEmail: guestEmail || null,
      guestContact: guestContact || null,
      qty,
      totalAmount,
      status: 'PENDING_PAYMENT',
      paymentMethod: 'QRIS'
    }
  });

  try {
    // Call Anjay PG to create invoice
    const invoice = await createAnjayInvoice({
      productName: `${product.name} (x${qty})`,
      amount: totalAmount,
      customerName: guestEmail || 'Guest Customer',
      customerContact: guestContact || 'N/A',
      externalId: orderCode
    });

    // Extract response data (Anjay PG returns { success: true, data: { invoiceCode, paymentUrl, ... } })
    const invData = invoice.data || invoice;

    // Update order with payment ref
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentRef: invData.invoiceCode || invData.order_id || invData.id,
        totalAmount: invData.totalAmount || totalAmount
      }
    });

    return {
      order: updatedOrder,
      paymentUrl: invData.paymentUrl || invData.qrUrl || invData.checkoutUrl,
      invoiceCode: invData.invoiceCode || invData.order_id || invData.id,
      qrString: invData.payment_number || invData.qrString || invData.qrCode || null,
      expiredAt: invData.expiredAt || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      rawInvoice: invoice,
      platformFee: invData.platformFee || 0,
      grandTotal: invData.totalAmount || totalAmount
    };
  } catch (error) {
    // If PG invoice creation fails, mark order as FAILED
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'FAILED' }
    });
    throw error;
  }
}

/**
 * Fulfill Paid Order (IDEMPOTENT PROCESS)
 * Triggered by Anjay Payment Gateway Callback Webhook
 */
export async function fulfillPaidOrder(orderCode, callbackPayload) {
  // Check if order exists
  const order = await prisma.order.findUnique({
    where: { orderCode },
    include: { product: true }
  });

  if (!order) {
    console.error(`[OrderService] Order not found for code: ${orderCode}`);
    return { success: false, reason: 'ORDER_NOT_FOUND' };
  }

  // Idempotency check: if order is already COMPLETED or FAILED_STOCK, skip take stock
  if (order.status === 'COMPLETED' || order.status === 'FAILED_STOCK') {
    return { success: true, idempotent: true, status: order.status };
  }

  // Record payment transaction log
  await prisma.paymentTransaction.create({
    data: {
      orderId: order.id,
      gateway: 'ANJAY',
      invoiceId: callbackPayload?.order_id || order.paymentRef || 'N/A',
      status: callbackPayload?.status || 'PAID',
      rawCallbackPayload: JSON.stringify(callbackPayload || {})
    }
  });

  // Branch: PANEL product → call Panel API | MANUAL product → pop from stockItems DB
  const isManual = order.product.source === 'MANUAL';

  try {
    let takenStocksValue;

    if (isManual) {
      // ---------- MANUAL product fulfillment ----------
      const items = order.product.stockItems ? JSON.parse(order.product.stockItems) : [];

      if (items.length < order.qty) {
        throw new Error(`Stok produk manual tidak cukup (tersedia: ${items.length}, dibutuhkan: ${order.qty})`);
      }

      // Pop the first qty items (FIFO)
      const taken = items.splice(0, order.qty);
      const remaining = items;

      // Update stockItems and stockCount in DB
      await prisma.product.update({
        where: { id: order.product.id },
        data: {
          stockItems: JSON.stringify(remaining),
          stockCount: remaining.length
        }
      });

      takenStocksValue = JSON.stringify(taken);
      console.log(`[OrderService] Manual stock taken for ${orderCode}: ${taken.length} item(s)`);

    } else {
      // ---------- PANEL product fulfillment ----------
      const stockResponse = await takePanelStock(order.product.panelProductId, order.qty);
      takenStocksValue = JSON.stringify(stockResponse.data || stockResponse.stocks || stockResponse);

      // Decrement local cached stock
      await prisma.product.update({
        where: { id: order.product.id },
        data: { stockCount: { decrement: order.qty } }
      });
    }

    // Mark order COMPLETED with taken stock data
    const completedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        takenStocks: takenStocksValue
      }
    });

    // Trigger purchase notification webhook asynchronously (non-blocking)
    triggerPurchaseWebhook(completedOrder).catch(err => {
      console.error('[OrderService] Async purchase webhook error:', err.message);
    });

    return { success: true, order: completedOrder };

  } catch (error) {
    console.error(`[OrderService] Fulfill failed for order ${orderCode}:`, error.message);

    // Mark as FAILED_STOCK for admin manual intervention
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'FAILED_STOCK' }
    });

    return { success: false, reason: 'STOCK_TAKE_FAILED', error: error.message };
  }

}

/**
 * Trigger purchase notification webhook if configured in Setting table
 */
async function triggerPurchaseWebhook(order) {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['purchase_webhook_enabled', 'purchase_webhook_url', 'purchase_webhook_secret']
        }
      }
    });

    const configMap = {};
    settings.forEach(s => { configMap[s.key] = s.value; });

    if (configMap.purchase_webhook_enabled !== 'true' || !configMap.purchase_webhook_url) {
      return;
    }

    const payload = {
      event: 'order.completed',
      orderCode: order.orderCode,
      productId: order.productId,
      qty: order.qty,
      totalAmount: order.totalAmount,
      takenStocks: order.takenStocks ? JSON.parse(order.takenStocks) : null,
      timestamp: new Date().toISOString()
    };

    let headers = { 'Content-Type': 'application/json' };
    if (configMap.purchase_webhook_secret) {
      const signature = crypto
        .createHmac('sha256', configMap.purchase_webhook_secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      headers['X-Signature'] = signature;
    }

    await axios.post(configMap.purchase_webhook_url, payload, { headers, timeout: 5000 });
  } catch (err) {
    console.error('[OrderService] Webhook notification failed:', err.message);
  }
}

/**
 * Track order by Order Code (+ optional email/contact verification)
 */
export async function trackOrder(orderCode, contactInfo) {
  if (!orderCode) return null;

  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.trim() },
    include: { product: true }
  });

  if (!order) return null;

  if (contactInfo && contactInfo.trim() !== '') {
    const info = contactInfo.trim().toLowerCase();
    const matchEmail = order.guestEmail && order.guestEmail.toLowerCase() === info;
    const matchContact = order.guestContact && order.guestContact.toLowerCase() === info;
    if (!matchEmail && !matchContact) {
      return { unauthorized: true };
    }
  }

  let qrString = null;
  let paymentUrl = null;
  
  if (order.status === 'PENDING_PAYMENT' && order.paymentRef) {
    const inv = await getAnjayInvoice(order.paymentRef);
    if (inv && inv.success && inv.data) {
      qrString = inv.data.paymentNumber || inv.data.qrCode || null;
      paymentUrl = inv.data.paymentUrl || null;
    }
  }

  return {
    ...order,
    qrString,
    paymentUrl,
    parsedTakenStocks: order.takenStocks ? JSON.parse(order.takenStocks) : null
  };
}
