import prisma from '../lib/prisma.js';
import { fetchPanelProducts } from '../lib/panelClient.js';

/**
 * Synchronize local database product cache from external Panel API
 */
export async function syncProductsFromPanel() {
  try {
    const rawData = await fetchPanelProducts();
    const remoteProducts = Array.isArray(rawData) ? rawData : (rawData?.products || []);

    if (!Array.isArray(remoteProducts)) {
      return { success: false, message: 'Invalid panel response format' };
    }

    let syncedCount = 0;
    for (const p of remoteProducts) {
      // Upsert local product cache
      await prisma.product.upsert({
        where: { panelProductId: String(p.id) },
        update: {
          name: p.name || 'Unnamed Product',
          category: p.category || 'General',
          priceRupiah: p.priceRupiah || p.price || 0,
          priceWl: p.priceWl || 0,
          currencyMode: p.currencyMode || 'IDR',
          thumbnail: p.thumbnail || null,
          deliveryType: p.deliveryType || 'AUTOMATIC',
          stockCount: p.stockCount ?? p.stock ?? 0,
          isActive: p.isActive !== false
        },
        create: {
          panelProductId: String(p.id),
          name: p.name || 'Unnamed Product',
          category: p.category || 'General',
          priceRupiah: p.priceRupiah || p.price || 0,
          priceWl: p.priceWl || 0,
          currencyMode: p.currencyMode || 'IDR',
          thumbnail: p.thumbnail || null,
          deliveryType: p.deliveryType || 'AUTOMATIC',
          stockCount: p.stockCount ?? p.stock ?? 0,
          isActive: p.isActive !== false,
          markupPrice: 0
        }
      });
      syncedCount++;
    }

    // Deactivate panel products that are no longer returned by the external panel
    const activePanelIds = remoteProducts.map(p => String(p.id));
    if (activePanelIds.length > 0) {
      await prisma.product.updateMany({
        where: {
          source: 'PANEL',
          panelProductId: { notIn: activePanelIds }
        },
        data: { isActive: false }
      });
    }

    return { success: true, count: syncedCount };
  } catch (error) {
    console.error('[ProductService] Sync failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch catalog products with optional category filter & search query
 */
export async function getCatalogProducts({ category, search } = {}) {
  const where = {
    isActive: true
  };

  if (category && category.toUpperCase() !== 'ALL') {
    where.category = category;
  }

  if (search && search.trim() !== '') {
    where.name = {
      contains: search.trim()
    };
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  return products.map(p => ({
    ...p,
    finalPriceRupiah: p.priceRupiah + p.markupPrice
  }));
}

/**
 * Get popular products for home section
 */
export async function getPopularProducts() {
  const products = await prisma.product.findMany({
    where: { isActive: true, isPopular: true },
    orderBy: { updatedAt: 'desc' }
  });

  return products.map(p => ({
    ...p,
    finalPriceRupiah: p.priceRupiah + p.markupPrice
  }));
}

/**
 * Get distinct product categories for dynamic tab navigation
 */
export async function getCategories() {
  const categories = await prisma.product.findMany({
    where: { isActive: true },
    select: { category: true },
    distinct: ['category']
  });

  return ['ALL', ...categories.map(c => c.category)];
}

/**
 * Get single product detail by ID
 */
export async function getProductById(id) {
  const product = await prisma.product.findUnique({
    where: { id }
  });

  if (!product) return null;

  return {
    ...product,
    finalPriceRupiah: product.priceRupiah + product.markupPrice
  };
}
