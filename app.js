import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

import { config, validateEnv } from './config/env.js';
import { initCronJobs } from './services/cronService.js';
import indexRoutes from './routes/index.js';
import checkoutRoutes from './routes/checkout.js';
import paymentCallbackRoutes from './routes/paymentCallback.js';
import adminRoutes from './routes/admin.js';

// Fail fast env validation
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware parsing
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// View engine setup (EJS SSR)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Layout setup middleware
app.use((req, res, next) => {
  const originalRender = res.render;
  res.render = function (view, options = {}, callback) {
    options.user = req.session?.user || null;
    originalRender.call(this, view, options, (err, html) => {
      if (err) return next(err);
      if (options.layout === false) {
        return res.send(html);
      }
      const targetLayout = options.layout || 'layouts/main';
      originalRender.call(this, targetLayout, { ...options, body: html }, callback);
    });
  };
  next();
});

// Routes Registration
app.use('/', indexRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/api/payment/callback', paymentCallbackRoutes);
app.use('/admin', adminRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('[ServerError]', err.stack || err.message);
  res.status(500).send(`Server Error: ${err.message}`);
});

// Start Server & Cron
app.listen(config.port, () => {
  console.log(`[MasuqikStore] Server running at http://localhost:${config.port}`);
  initCronJobs();
});

export default app;
