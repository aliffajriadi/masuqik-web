// Auth & Admin Access Control Middleware

export function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/admin/login');
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/admin/login');
  }

  const role = req.session.user.role;
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    return res.status(403).send('Akses Ditolak: Khusus Admin');
  }

  next();
}
