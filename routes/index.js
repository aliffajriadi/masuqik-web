import express from 'express';
import { getCatalogProducts, getCategories, getPopularProducts, syncProductsFromPanel, getProductById } from '../services/productService.js';
import { trackOrder } from '../services/orderService.js';

const router = express.Router();

// GET / - Catalog Landing Page
router.get('/', async (req, res, next) => {
  try {
    const category = req.query.category || 'ALL';
    const search = req.query.search || '';

    const prisma = (await import('../lib/prisma.js')).default;
    const [products, categories, banners, popularProducts] = await Promise.all([
      getCatalogProducts({ category, search }),
      getCategories(),
      prisma.banner.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
      getPopularProducts()
    ]);

    // Background sync catalog on page view (non-blocking)
    syncProductsFromPanel().catch(err => console.error('[IndexRoute] Background sync error:', err.message));

    res.render('index', {
      title: 'Masuqik Store — Toko Produk Digital',
      activePage: 'home',
      products,
      categories,
      banners,
      popularProducts,
      activeCategory: category,
      searchQuery: search
    });
  } catch (error) {
    next(error);
  }
});

// GET /product/:id - Product Detail Page
router.get('/product/:id', async (req, res, next) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) {
      return res.redirect('/');
    }

    res.render('product', {
      title: `${product.name} — Masuqik Store`,
      activePage: 'home',
      product
    });
  } catch (error) {
    next(error);
  }
});

// GET /track - Order Tracking Page
router.get('/track', async (req, res, next) => {
  try {
    const { orderCode, contactInfo, error: queryError } = req.query;

    if (!orderCode) {
      return res.render('track', {
        title: 'Cek Transaksi — Masuqik Store',
        activePage: 'track',
        error: queryError || null
      });
    }

    const result = await trackOrder(orderCode, contactInfo);

    if (!result) {
      if (req.query.ajax) return res.status(404).json({ error: 'Not found' });
      return res.render('track', {
        title: 'Cek Transaksi — Masuqik Store',
        activePage: 'track',
        queryOrderCode: orderCode,
        queryContactInfo: contactInfo,
        error: 'Pesanan tidak ditemukan. Periksa kembali Kode Order Anda.'
      });
    }

    if (result.unauthorized) {
      if (req.query.ajax) return res.status(401).json({ error: 'Unauthorized' });
      return res.render('track', {
        title: 'Cek Transaksi — Masuqik Store',
        activePage: 'track',
        queryOrderCode: orderCode,
        queryContactInfo: contactInfo,
        error: 'Verifikasi email/kontak tidak cocok.'
      });
    }

    if (req.query.ajax) {
      return res.json({ status: result.status });
    }

    res.render('track', {
      title: `Order ${result.orderCode} — Masuqik Store`,
      activePage: 'track',
      queryOrderCode: orderCode,
      queryContactInfo: contactInfo,
      order: result,
      error: queryError || null
    });
  } catch (error) {
    next(error);
  }
});

export default router;
