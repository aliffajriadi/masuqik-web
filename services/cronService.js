import cron from 'node-cron';
import { syncProductsFromPanel } from './productService.js';

export function initCronJobs() {
  // Sync immediately when server starts
  syncProductsFromPanel()
    .then(res => console.log(`[Cron] Initial startup product sync done: ${res.count || 0} products updated`))
    .catch(err => console.error('[Cron] Initial startup product sync error:', err.message));

  // Sync products every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const res = await syncProductsFromPanel();
      console.log(`[Cron] Periodic product sync done: ${res.count || 0} products updated`);
    } catch (err) {
      console.error('[Cron] Periodic product sync error:', err.message);
    }
  });

  console.log('[Cron] Product sync cron job scheduled (every 5 minutes)');

  // Auto-cancel expired orders every 1 minute
  cron.schedule('* * * * *', async () => {
    try {
      const prisma = (await import('../lib/prisma.js')).default;
      const { cancelAnjayInvoice } = await import('../lib/anjayClient.js');

      // Orders older than 11 minutes (giving 1 minute grace period beyond the 10 min UI timer)
      const expiredTime = new Date(Date.now() - 11 * 60 * 1000);
      const expiredOrders = await prisma.order.findMany({
        where: {
          status: 'PENDING_PAYMENT',
          createdAt: { lt: expiredTime }
        }
      });

      if (expiredOrders.length > 0) {
        console.log(`[Cron] Auto-cancelling ${expiredOrders.length} expired orders...`);
        for (const order of expiredOrders) {
          try {
            if (order.paymentRef) {
              await cancelAnjayInvoice(order.paymentRef).catch(() => {}); // ignore PG errors if already cancelled
            }
            await prisma.order.update({
              where: { id: order.id },
              data: { status: 'EXPIRED' }
            });
            console.log(`[Cron] Order ${order.orderCode} expired & cancelled.`);
          } catch (e) {
            console.error(`[Cron] Failed to cancel order ${order.orderCode}:`, e.message);
          }
        }
      }
    } catch (err) {
      console.error('[Cron] Order cleanup error:', err.message);
    }
  });
  console.log('[Cron] Order expiration cleanup job scheduled (every 1 minute)');
}
