import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { syncProductsFromPanel } from '../services/productService.js';
import { fulfillPaidOrder } from '../services/orderService.js';
import {
  getDashboardStats,
  getAdminOrders,
  updateAdminProduct,
  createManualProduct,
  updateManualProduct,
  addManualStockItems,
  deleteManualStockItem,
  deleteManualProduct,
  getAdminUsers,
  toggleUserStatus,
  getStoreSettings,
  updateStoreSettings
} from '../services/adminService.js';

const router = express.Router();

// GET /admin/login - Admin Login Page
router.get('/login', (req, res) => {
  if (req.session?.user?.role === 'ADMIN' || req.session?.user?.role === 'SUPERADMIN') {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { layout: false });
});

// POST /admin/login - Authenticate Admin
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN')) {
      return res.render('admin/login', { layout: false, error: 'Email atau password admin salah' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('admin/login', { layout: false, error: 'Email atau password admin salah' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.redirect('/admin/dashboard');
  } catch (err) {
    res.render('admin/login', { layout: false, error: err.message });
  }
});

// GET /admin/logout - Logout Admin Session
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Apply requireAdmin middleware for all protected /admin routes below
router.use(requireAdmin);

// GET /admin/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const stats = await getDashboardStats();
    res.render('admin/dashboard', {
      title: 'Dashboard Statistik',
      pageTitle: 'Dashboard Statistik',
      activeTab: 'dashboard',
      layout: 'admin/layout',
      stats
    });
  } catch (err) { next(err); }
});

// GET /admin/products
router.get('/products', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
    res.render('admin/products', {
      title: 'Kelola Produk',
      pageTitle: 'Kelola Produk & Markup Harga',
      activeTab: 'products',
      layout: 'admin/layout',
      products,
      tab: req.query.tab || 'panel',
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) { next(err); }
});

// POST /admin/products/sync - Manual Sync from Panel
router.post('/products/sync', async (req, res, next) => {
  try {
    await syncProductsFromPanel();
    res.redirect('/admin/products');
  } catch (err) { next(err); }
});

// POST /admin/products/:id/update - Update Product Markup
router.post('/products/:id/update', async (req, res, next) => {
  try {
    const { markupPrice } = req.body;
    await updateAdminProduct(req.params.id, { markupPrice });
    res.redirect('/admin/products');
  } catch (err) { next(err); }
});

// POST /admin/products/:id/toggle - Toggle Product Active Status
router.post('/products/:id/toggle', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    await updateAdminProduct(req.params.id, { isActive: !product.isActive });
    res.redirect('/admin/products');
  } catch (err) { next(err); }
});

// POST /admin/products/:id/toggle-popular - Toggle Product Popular Status
router.post('/products/:id/toggle-popular', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (product) {
      await prisma.product.update({
        where: { id: req.params.id },
        data: { isPopular: !product.isPopular }
      });
    }
    res.redirect('/admin/products');
  } catch (err) { next(err); }
});

// POST /admin/products/create - Create New Manual Product
router.post('/products/create', async (req, res, next) => {
  try {
    const { name, category, priceRupiah, markupPrice, thumbnail, description } = req.body;
    await createManualProduct({ name, category, priceRupiah, markupPrice, thumbnail, description });
    res.redirect('/admin/products?tab=manual&success=Produk+manual+berhasil+dibuat');
  } catch (err) {
    // Re-render with error
    const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
    res.render('admin/products', {
      title: 'Kelola Produk',
      pageTitle: 'Kelola Produk & Markup Harga',
      activeTab: 'products',
      layout: 'admin/layout',
      products,
      tab: 'manual',
      error: err.message
    });
  }
});

// POST /admin/products/:id/edit - Edit Manual Product Details
router.post('/products/:id/edit', async (req, res, next) => {
  try {
    const { name, category, priceRupiah, markupPrice, thumbnail, description } = req.body;
    await updateManualProduct(req.params.id, { name, category, priceRupiah, markupPrice, thumbnail, description });
    res.redirect('/admin/products?tab=manual&success=Produk+berhasil+diupdate');
  } catch (err) { next(err); }
});

// POST /admin/products/:id/stock/add - Add Stock Items to Manual Product
router.post('/products/:id/stock/add', async (req, res, next) => {
  try {
    const { stockText } = req.body;
    if (!stockText || !stockText.trim()) {
      return res.redirect(`/admin/products/${req.params.id}/stock?error=Input+stok+kosong`);
    }
    await addManualStockItems(req.params.id, stockText);
    res.redirect(`/admin/products/${req.params.id}/stock?success=Stok+berhasil+ditambahkan`);
  } catch (err) {
    res.redirect(`/admin/products/${req.params.id}/stock?error=${encodeURIComponent(err.message)}`);
  }
});

// POST /admin/products/:id/stock/:index/delete - Delete Single Stock Item
router.post('/products/:id/stock/:index/delete', async (req, res, next) => {
  try {
    await deleteManualStockItem(req.params.id, req.params.index);
    res.redirect(`/admin/products/${req.params.id}/stock?success=Item+dihapus`);
  } catch (err) {
    res.redirect(`/admin/products/${req.params.id}/stock?error=${encodeURIComponent(err.message)}`);
  }
});

// GET /admin/products/:id/stock - Stock Management Page
router.get('/products/:id/stock', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product || product.source !== 'MANUAL') {
      return res.redirect('/admin/products?tab=manual&error=Produk+tidak+ditemukan');
    }
    const stockItems = product.stockItems ? JSON.parse(product.stockItems) : [];
    res.render('admin/product-stock', {
      title: `Kelola Stok — ${product.name}`,
      pageTitle: `Kelola Stok: ${product.name}`,
      activeTab: 'products',
      layout: 'admin/layout',
      product,
      stockItems,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) { next(err); }
});

// POST /admin/products/:id/delete - Delete Manual Product
router.post('/products/:id/delete', async (req, res, next) => {
  try {
    await deleteManualProduct(req.params.id);
    res.redirect('/admin/products?tab=manual&success=Produk+berhasil+dihapus');
  } catch (err) {
    res.redirect(`/admin/products?tab=manual&error=${encodeURIComponent(err.message)}`);
  }
});

// GET /admin/banners - Banner Management
router.get('/banners', async (req, res, next) => {
  try {
    const banners = await prisma.banner.findMany({ orderBy: { createdAt: 'desc' } });
    res.render('admin/banners', {
      title: 'Kelola Banner',
      pageTitle: 'Kelola Banner Promo',
      activeTab: 'banners',
      layout: 'admin/layout',
      banners
    });
  } catch (err) { next(err); }
});

// POST /admin/banners - Create Banner
router.post('/banners', async (req, res, next) => {
  try {
    const { title, imageUrl, targetUrl } = req.body;
    await prisma.banner.create({
      data: {
        title,
        imageUrl,
        targetUrl: targetUrl || '/#katalog'
      }
    });
    res.redirect('/admin/banners');
  } catch (err) { next(err); }
});

// POST /admin/banners/:id/toggle - Toggle Banner Active Status
router.post('/banners/:id/toggle', async (req, res, next) => {
  try {
    const banner = await prisma.banner.findUnique({ where: { id: req.params.id } });
    if (banner) {
      await prisma.banner.update({
        where: { id: req.params.id },
        data: { isActive: !banner.isActive }
      });
    }
    res.redirect('/admin/banners');
  } catch (err) { next(err); }
});

// POST /admin/banners/:id/delete - Delete Banner
router.post('/banners/:id/delete', async (req, res, next) => {
  try {
    await prisma.banner.delete({ where: { id: req.params.id } });
    res.redirect('/admin/banners');
  } catch (err) { next(err); }
});

// GET /admin/orders - Order Management
router.get('/orders', async (req, res, next) => {
  try {
    const status = req.query.status || 'ALL';
    const orders = await getAdminOrders(status);
    res.render('admin/orders', {
      title: 'Kelola Pesanan',
      pageTitle: 'Kelola Pesanan & Stok',
      activeTab: 'orders',
      activeStatus: status,
      layout: 'admin/layout',
      orders
    });
  } catch (err) { next(err); }
});

// POST /admin/orders/:orderCode/retry - Manual Retry Stock Take
router.post('/orders/:orderCode/retry', async (req, res, next) => {
  try {
    await fulfillPaidOrder(req.params.orderCode, { manualRetry: true });
    res.redirect('/admin/orders');
  } catch (err) { next(err); }
});

// GET /admin/users - User Management
router.get('/users', async (req, res, next) => {
  try {
    const users = await getAdminUsers();
    res.render('admin/users', {
      title: 'Kelola User',
      pageTitle: 'Kelola User / Member',
      activeTab: 'users',
      layout: 'admin/layout',
      users
    });
  } catch (err) { next(err); }
});

// POST /admin/users/:id/toggle - Toggle User Block Status
router.post('/users/:id/toggle', async (req, res, next) => {
  try {
    await toggleUserStatus(req.params.id);
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

// GET /admin/settings - Webhook Settings
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await getStoreSettings();
    res.render('admin/settings', {
      title: 'Pengaturan Webhook',
      pageTitle: 'Pengaturan Webhook Notifikasi Pembelian',
      activeTab: 'settings',
      layout: 'admin/layout',
      settings
    });
  } catch (err) { next(err); }
});

// POST /admin/settings - Save Webhook Settings
router.post('/settings', async (req, res, next) => {
  try {
    const { purchase_webhook_enabled, purchase_webhook_url, purchase_webhook_secret } = req.body;
    await updateStoreSettings({
      purchase_webhook_enabled: purchase_webhook_enabled === 'true' ? 'true' : 'false',
      purchase_webhook_url: purchase_webhook_url || '',
      purchase_webhook_secret: purchase_webhook_secret || ''
    });

    const settings = await getStoreSettings();
    res.render('admin/settings', {
      title: 'Pengaturan Webhook',
      pageTitle: 'Pengaturan Webhook Notifikasi Pembelian',
      activeTab: 'settings',
      layout: 'admin/layout',
      settings,
      successMessage: 'Pengaturan webhook berhasil disimpan!'
    });
  } catch (err) { next(err); }
});

export default router;
