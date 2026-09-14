import prisma from '../lib/prisma.js';

/**
 * Calculate dashboard summary statistics
 */
export async function getDashboardStats() {
  const [totalOrders, completedOrders, pendingOrders, totalProducts, totalUsers, revenueResult] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'COMPLETED' } }),
    prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: 'MEMBER' } }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: 'COMPLETED' }
    })
  ]);

  const totalRevenue = revenueResult._sum.totalAmount || 0;

  // Recent 5 transactions
  const recentOrders = await prisma.order.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { product: true }
  });

  return {
    totalOrders,
    completedOrders,
    pendingOrders,
    totalProducts,
    totalUsers,
    totalRevenue,
    recentOrders
  };
}

/**
 * Get all orders for admin management with optional status filter
 */
export async function getAdminOrders(statusFilter) {
  const where = {};
  if (statusFilter && statusFilter !== 'ALL') {
    where.status = statusFilter;
  }

  return await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { product: true }
  });
}

/**
 * Update product markup price or active status
 */
export async function updateAdminProduct(id, { markupPrice, isActive }) {
  return await prisma.product.update({
    where: { id },
    data: {
      ...(markupPrice !== undefined && { markupPrice: parseInt(markupPrice, 10) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) })
    }
  });
}

/**
 * Create a new manual product (source = MANUAL)
 */
export async function createManualProduct({ name, category, priceRupiah, markupPrice, thumbnail, description }) {
  if (!name || !category || !priceRupiah) {
    throw new Error('Nama, kategori, dan harga wajib diisi');
  }

  return await prisma.product.create({
    data: {
      source: 'MANUAL',
      panelProductId: null,
      name: name.trim(),
      category: category.trim().toUpperCase(),
      priceRupiah: parseInt(priceRupiah, 10),
      markupPrice: parseInt(markupPrice || 0, 10),
      thumbnail: thumbnail?.trim() || null,
      description: description?.trim() || null,
      stockCount: 0,
      stockItems: JSON.stringify([]),
      isActive: true,
      deliveryType: 'AUTOMATIC'
    }
  });
}

/**
 * Update manual product details (name, category, price, thumbnail, description)
 */
export async function updateManualProduct(id, { name, category, priceRupiah, markupPrice, thumbnail, description, isActive, isPopular }) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.source !== 'MANUAL') {
    throw new Error('Produk bukan produk manual');
  }

  return await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined         && { name: name.trim() }),
      ...(category !== undefined     && { category: category.trim().toUpperCase() }),
      ...(priceRupiah !== undefined  && { priceRupiah: parseInt(priceRupiah, 10) }),
      ...(markupPrice !== undefined  && { markupPrice: parseInt(markupPrice, 10) }),
      ...(thumbnail !== undefined    && { thumbnail: thumbnail?.trim() || null }),
      ...(description !== undefined  && { description: description?.trim() || null }),
      ...(isActive !== undefined     && { isActive: Boolean(isActive) }),
      ...(isPopular !== undefined    && { isPopular: Boolean(isPopular) })
    }
  });
}

/**
 * Add stock items to a manual product.
 * rawText: multiline string, each line = one stock item.
 * Returns updated product.
 */
export async function addManualStockItems(productId, rawText) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.source !== 'MANUAL') {
    throw new Error('Produk bukan produk manual');
  }

  // Parse new items from multiline text input
  const newItems = rawText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (newItems.length === 0) throw new Error('Tidak ada item stok yang valid');

  // Merge with existing stock
  const existing = product.stockItems ? JSON.parse(product.stockItems) : [];
  const merged = [...existing, ...newItems];

  return await prisma.product.update({
    where: { id: productId },
    data: {
      stockItems: JSON.stringify(merged),
      stockCount: merged.length
    }
  });
}

/**
 * Delete a single stock item by index (0-based) from manual product.
 */
export async function deleteManualStockItem(productId, index) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.source !== 'MANUAL') {
    throw new Error('Produk bukan produk manual');
  }

  const items = product.stockItems ? JSON.parse(product.stockItems) : [];
  const idx = parseInt(index, 10);

  if (idx < 0 || idx >= items.length) throw new Error('Index stok tidak valid');

  items.splice(idx, 1);

  return await prisma.product.update({
    where: { id: productId },
    data: {
      stockItems: JSON.stringify(items),
      stockCount: items.length
    }
  });
}

/**
 * Delete a manual product. Throws if it has linked orders to protect integrity.
 */
export async function deleteManualProduct(id) {
  const product = await prisma.product.findUnique({ where: { id }, include: { orders: { take: 1 } } });
  if (!product) throw new Error('Produk tidak ditemukan');
  if (product.source !== 'MANUAL') throw new Error('Hanya produk MANUAL yang bisa dihapus');
  if (product.orders.length > 0) throw new Error('Produk tidak bisa dihapus karena memiliki riwayat order');

  return await prisma.product.delete({ where: { id } });
}

/**
 * Get all registered users
 */
export async function getAdminUsers() {
  return await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Toggle user status (ACTIVE / BLOCKED)
 */
export async function toggleUserStatus(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const newStatus = user.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
  return await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus }
  });
}

/**
 * Get store settings key-value map
 */
export async function getStoreSettings() {
  const settings = await prisma.setting.findMany();
  const map = {};
  settings.forEach(s => { map[s.key] = s.value; });
  return map;
}

/**
 * Update store settings
 */
export async function updateStoreSettings(settingsObj) {
  const keys = Object.keys(settingsObj);
  for (const key of keys) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: String(settingsObj[key]) },
      create: { key, value: String(settingsObj[key]) }
    });
  }
}
