# PRD — Masuqik Store (Web Store dengan Integrasi Panel & Payment Gateway)

aturan ada di Rules.md

## 1. Overview

**Nama Project:** Masuqik Store
**Deskripsi Singkat:** Web store untuk menjual produk digital (proxy, voucher, top-up, dll) yang stoknya diambil secara otomatis dari sistem panel eksternal (`https://panel.ku.anjay.fun`). Pembeli bisa checkout **tanpa login** (guest checkout) maupun dengan akun. Pesanan bisa dilacak lewat kode order tanpa perlu login.

**Tujuan:**
- Menyediakan katalog produk yang datanya sinkron otomatis dari API panel.
- Memungkinkan transaksi cepat tanpa hambatan (guest checkout).
- Otomatisasi pengambilan stok setelah pembayaran berhasil (tanpa campur tangan admin manual).
- Menyediakan dashboard admin untuk kelola produk, stok, user, dan statistik penjualan.

---

## 2. Target User & Role

| Role | Deskripsi | Akses |
|---|---|---|
| **Guest** | Pengunjung tanpa akun | Lihat produk, checkout, cek pesanan via kode order |
| **Member (login)** | User terdaftar | Semua akses guest + riwayat order otomatis tersimpan di akun, profil, saldo/poin (opsional) |
| **Admin** | Pengelola toko | Kelola produk, stok, user, statistik, konfigurasi payment gateway |
| **Super Admin (opsional)** | Pemilik sistem | Semua akses admin + kelola admin lain, kelola API key integrasi |

---

## 3. Fitur Utama

### 3.1 Customer-Facing (Guest & Member)
- Landing page dengan hero banner/carousel promo (lihat referensi UI di bagian 8).
- Search bar produk (real-time / debounce).
- Katalog produk dengan filter kategori & tab (mis. "ALL", "Proxy", "Voucher", dst — dinamis dari field `category` API).
- Detail produk: nama, thumbnail, harga (Rupiah dan/atau WL sesuai `currencyMode`), stok tersedia (`stockCount`), status habis/tersedia.
- Checkout **tanpa login**:
  - Input: jumlah (qty), email/nomor kontak (untuk notifikasi & pelacakan), metode pembayaran.
  - Sistem generate **order code** unik & invoice pembayaran.
- Checkout **dengan login**:
  - Sama seperti guest, ditambah otomatis tersimpan ke riwayat akun.
- Pelacakan pesanan (Order Tracking):
  - Guest & member bisa cek status order lewat **kode order** (+ opsional verifikasi email/no HP) tanpa perlu login.
  - Status: Menunggu Pembayaran → Dibayar → Diproses → Selesai / Gagal.
- Riwayat transaksi (khusus member, login).
- Notifikasi (email/WA/telegram — opsional, tentukan channel di fase lanjutan).

### 3.2 Admin Panel
- **Dashboard statistik**: total penjualan, revenue, produk terlaris, grafik transaksi harian/mingguan/bulanan.
- **Kelola Produk**: tambah/edit/hapus produk (sinkron dari API panel atau input manual jika hybrid), atur harga jual (markup), atur status aktif/nonaktif.
- **Kelola Stok**: lihat stok real-time dari panel (`stockCount`), riwayat pengambilan stok (`take`), alert stok menipis.
- **Kelola User**: lihat daftar member, blokir/aktifkan akun, reset password, lihat riwayat order per user.
- **Kelola Pesanan**: lihat semua order (guest & member), filter by status, retry pengambilan stok jika gagal, refund/void order.
- **Kelola Payment Gateway**: aktifkan/nonaktifkan metode pembayaran, atur fee, lihat log callback.
- **Pengaturan Webhook Notifikasi Pembelian**: admin bisa mengatur (tanpa perlu redeploy):
  - URL tujuan webhook,
  - secret untuk signing (HMAC-SHA256, dikirim via header `X-Signature`),
  - toggle on/off.
  Setiap order berhasil (`COMPLETED`) akan otomatis mengirim POST notifikasi ke URL tersebut. Konfigurasi disimpan di tabel `Setting` (key-value), bukan hardcode di kode/env.
- **Manajemen API Key Integrasi**: simpan API key panel (`x-api-key`) secara aman di environment variable / secret manager — **bukan** hardcoded di kode atau database tanpa enkripsi.

---

## 4. Alur Bisnis (Order Flow)

1. User memilih produk & qty di katalog (data dari `GET /api/v1/integration/products`).
2. User checkout (guest atau login) → sistem membuat record order lokal (`order_code` unik, status `PENDING_PAYMENT`) → panggil `sdk.createInvoice()` (Anjay PG) dengan `externalId = order_code` → tampilkan `paymentUrl`/QRIS ke user.
3. User membayar (default QRIS, sesuai konfigurasi Anjay PG).
4. Anjay PG mengirim **webhook** ke `POST /api/payment/callback/anjay` → server verifikasi `X-Webhook-Signature` (HMAC-SHA256) sebelum memproses payload.
5. Jika pembayaran **sukses**:
   - Server memanggil `POST /api/v1/integration/take` dengan `productId` & `qty`.
   - Jika sukses → simpan `orderCode`, `takenStocks` dari response ke database order lokal, update status order jadi `COMPLETED`, tampilkan/kirim data stok (misal akun/proxy) ke user.
   - Jika API panel gagal (stok habis race-condition, error, dsb) → order masuk status `FAILED_STOCK`, trigger auto-refund atau alert ke admin untuk retry manual.
6. Jika pembayaran **gagal/expired** → status order `FAILED` / `EXPIRED`, stok tidak dipotong.
7. User bisa cek status order kapan saja lewat halaman "Cek Transaksi" menggunakan kode order.

**Catatan penting:** Karena endpoint `take` bersifat destructive (langsung memotong stok), proses ini **wajib** hanya dipanggil sekali per order (idempotency key / cek status order dulu sebelum call) untuk menghindari double-deduct saat webhook payment gateway terkirim berkali-kali (retry).

---

## 5. Integrasi Eksternal

### 5.1 Panel Produk & Stok (sudah tersedia)
- **Base URL:** `https://panel.ku.anjay.fun`
- **Auth:** header `x-api-key` (simpan sebagai secret/env variable di server, JANGAN expose ke frontend/browser)
- **Endpoints:**
  1. `GET /api/v1/integration/products` — ambil semua produk aktif & stok.
  2. `POST /api/v1/integration/take` — ambil stok setelah pembayaran sukses (payload: `productId`, `qty`).
- Sinkronisasi katalog: bisa polling berkala (cron, mis. tiap 5 menit) atau on-demand saat user membuka halaman produk, lalu cache di database lokal (untuk kecepatan & agar tetap tampil walau API panel sedang down).

### 5.2 Payment Gateway — Anjay Payment Gateway (SDK Node.js: `anjay-pg-sdk`)

- **Base URL:** `https://store.ku.anjay.fun/api/v1` (default di SDK)
- **Auth:** API Key (`pk_live_...`) didapat dari Dashboard Anjay → simpan sebagai env variable di server, inisialisasi SDK sekali di server-side saja (jangan pernah expose ke frontend).
- **Metode pembayaran default:** QRIS (otomatis jika tidak didefinisikan lain).

**Alur integrasi di backend toko:**

1. **Buat invoice** saat user checkout, pakai `sdk.createInvoice()`:
   - Payload: `productName`, `amount`, `customerName` (opsional), `customerContact` (opsional), `externalId` (isi dengan **order_code lokal** kita — penting untuk mencocokkan invoice Anjay dengan order di database sendiri).
   - Response berisi `paymentUrl` → redirect/tampilkan ke user untuk bayar (QRIS/dll).
2. **Terima webhook** di endpoint sendiri (mis. `POST /api/payment/callback/anjay`):
   - Verifikasi header `X-Webhook-Signature` = HMAC-SHA256(body, `SECRET_WEBHOOK`) — **wajib**, tolak (401) kalau tidak cocok.
   - Payload webhook: `event`, `order_id` (invoice code Anjay), `status`, `externalId` (order_code lokal kita), `netAmount`.
   - Jika `event === 'payment.paid'` dan `status === 'completed'` → tandai order lokal (dicari via `externalId`) sebagai PAID, lalu **baru** trigger pemanggilan `POST /api/v1/integration/take` ke panel produk (lihat 5.1) untuk ambil stok.
   - Wajib response **HTTP 200 dalam 10 detik**, walau proses take-stock dijalankan async/queue di belakang (supaya webhook tidak timeout & di-retry berkali-kali oleh Anjay — ini alasan lain kenapa idempotency di proses take-stock wajib ada, lihat bagian 4).
3. **Fallback/reconciliation:** gunakan `sdk.syncInvoice(invoiceCode)` secara berkala (cron, mis. tiap beberapa menit untuk invoice yang masih `WAITING_PAYMENT`) sebagai jaga-jaga kalau webhook gagal terkirim/hilang.
4. **Cek detail invoice** (`sdk.getInvoice()`) dipakai di halaman "Cek Transaksi" untuk menampilkan status pembayaran terbaru ke user jika diperlukan.
5. **Cancel invoice** (`sdk.cancelInvoice()`) dipanggil kalau user membatalkan order atau order expired secara manual di admin panel (hanya bisa untuk invoice yang belum `PAID`).

**Status invoice (`paymentStatus`) yang perlu di-mapping ke status order lokal:**

| Status Anjay | Mapping ke Order Lokal |
|---|---|
| `PENDING` / `WAITING_PAYMENT` | `PENDING_PAYMENT` |
| `PAID` | trigger take-stock → `COMPLETED` (atau `FAILED_STOCK` jika take-stock gagal) |
| `EXPIRED` | `EXPIRED` |
| `FAILED` | `FAILED` |
| `CANCELLED` | `CANCELLED` |
| `REFUNDED` | `REFUNDED` |

**Error handling:** SDK melempar `AxiosError` untuk semua kegagalan request (400/401/404/500/503, dll) — pesan error tersedia di `error.response.data.message`. Backend toko wajib bungkus semua pemanggilan SDK dengan try/catch dan log error-nya (untuk debugging & agar admin bisa lihat di log kalau ada invoice gagal dibuat).

### 5.3 Integrasi App Lain
- *(User menyebutkan akan ada integrasi tambahan — dokumentasinya belum dilampirkan. Perlu detail endpoint, auth, dan payload sebelum bisa dimasukkan ke PRD ini.)*

---

## 6. Skema Data (Entitas Utama)

- **User**: id, nama, email, password (hash), no_hp, role (member/admin), status, created_at
- **Product** (cache lokal dari panel + data tambahan toko): id, panel_product_id, name, category, price_rupiah, price_wl, currency_mode, thumbnail, delivery_type, stock_count (cache), is_active, markup/harga_jual
- **Order**: id, order_code (unik, untuk tracking), user_id (nullable utk guest), guest_email/no_hp, product_id, qty, total_harga, status, payment_method, payment_ref, taken_stocks (JSON, hasil dari endpoint `take`), created_at, updated_at
- **PaymentTransaction**: id, order_id, gateway, invoice_id, status, raw_callback_payload, created_at
- **Setting** (key-value, dikelola admin): key, value — dipakai a.l. untuk konfigurasi webhook notifikasi pembelian (`purchase_webhook_url`, `purchase_webhook_secret`, `purchase_webhook_enabled`)
- **AdminActivityLog**: id, admin_id, action, target, timestamp (untuk audit trail kelola produk/stok/user)

---

## 7. API Internal (Backend Milik Sendiri, bukan panel)

Contoh endpoint yang perlu dibangun sendiri (bukan dari panel):

- `GET /api/products` — katalog produk untuk frontend (dari cache lokal)
- `POST /api/checkout` — buat order baru (guest/member)
- `GET /api/orders/track?order_code=...` — cek status order tanpa login
- `POST /api/payment/callback` — webhook dari payment gateway
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` — auth member
- `GET /api/member/orders` — riwayat order (khusus login)
- **Admin:**
  - `POST /admin/products`, `PUT /admin/products/:id` — kelola produk
  - `GET /admin/stats` — statistik dashboard
  - `GET /admin/users`, `PUT /admin/users/:id/block` — kelola user
  - `GET /admin/orders` — kelola pesanan, retry take-stock
  - `GET /admin/settings`, `POST /admin/settings` — atur webhook notifikasi pembelian (URL, secret, on/off)

---

## 8. Referensi UI/UX

**Style & Theme:** Modern, light mode. Warna dominan putih, aksen cyan/biru muda (`#00B4D8`), dan oranye sebagai warna aksen sekunder (CTA button, badge promo). Background dengan ornamen garis gelombang (abstract wave) bertumpuk sebagai elemen dekoratif halus di belakang hero section.

**Header & Top Navigation:**
- Kiri: Logo brand.
- Tengah: Menubar horizontal dengan ikon + label (Beranda, Cek Transaksi, Kalkulator/Promo, Berita & Promo).
- Kanan: Tombol Login bergaya pill/rounded-full; jika sudah login tampilkan avatar + dropdown (Profil, Riwayat Order, Logout).

**Search Bar:** Full-width tepat di bawah header, placeholder "Cari produk...".

**Hero Banner/Carousel:** Slider promo di tengah halaman, bisa disertai modal pop-up promosi (mis. sosial media/promo spesial) yang muncul sekali per sesi.

**Seksi Produk Populer:** Grid 2x3 (desktop) / scroll horizontal (mobile) berisi card ringkas: thumbnail, nama produk, kategori/label.

**Filter & Catalog Grid:**
- Tab filter kategori dinamis (diambil dari field `category` API panel).
- Grid produk utama berbentuk card vertikal (portrait) menampilkan thumbnail, nama, harga, status stok (tersedia/habis).

**Halaman Cek Transaksi:** Form sederhana — input kode order (+ email/no HP opsional untuk verifikasi) → tampilkan status & detail order.

**Halaman Checkout:** Ringkasan produk, pilih qty, pilih metode pembayaran, form kontak (untuk guest), tombol bayar → redirect/tampilkan instruksi pembayaran (QRIS/VA/dll).

**Admin Panel:** Layout dashboard standar — sidebar navigasi (Dashboard, Produk, Stok, Pesanan, User, Pengaturan), topbar dengan info admin, konten utama berupa tabel + grafik statistik.

---

## 9. Non-Functional Requirements

- **Keamanan:**
  - API key panel & credential payment gateway disimpan di environment variable/secret manager, tidak pernah dikirim ke client/browser.
  - Rate limiting pada endpoint checkout & tracking order untuk cegah abuse/brute-force kode order.
  - Validasi & idempotency pada proses `take stock` agar tidak double-deduct.
  - HTTPS wajib di semua environment.
- **Performa:** Cache katalog produk di database lokal, jangan hit API panel setiap request user.
- **Reliabilitas:** Retry mechanism & logging untuk pemanggilan API panel & payment gateway yang gagal.
- **Skalabilitas:** Desain database & API agar mudah menambah integrasi produk/panel lain di masa depan.

---

## 10. Tech Stack (Final)

- **Backend:** Express.js
- **ORM:** Prisma
- **Database:** SQLITE
- **Template Engine (SSR):** EJS
- **Package Manager:** pnpm
- **Payment Gateway:** Anjay Payment Gateway (`anjay-pg-sdk`) — lihat bagian 5.2
- **Auth:** Session-based (server-rendered, cocok dengan EJS — tidak perlu JWT/SPA)
- **Scheduler:** `node-cron` untuk sinkronisasi katalog produk dari panel secara berkala

**Prinsip implementasi:** kode dibangun dengan standar senior engineer — jelas, terstruktur per tanggung jawab (routes → services → lib/external client), dan **sengaja tidak overengineered**: tanpa layer abstraksi/microservice/queue system yang tidak dibutuhkan di skala MVP ini. Tambahan seperti message queue (mis. Redis/BullMQ) baru relevan kalau volume transaksi sudah butuh proses async yang lebih berat.

---

## 11. Roadmap/Fase Pengembangan

1. **Fase 1 — MVP:** Katalog produk (sinkron dari panel), checkout guest, integrasi 1 payment gateway, take-stock otomatis, cek order tanpa login.
2. **Fase 2:** Sistem member (register/login), riwayat order, admin panel dasar (kelola produk, stok, pesanan).
3. **Fase 3:** Statistik dashboard, kelola user, integrasi app tambahan (menunggu dokumentasi), notifikasi email/WA.
4. **Fase 4:** Optimasi performa, monitoring, audit log, fitur promo/voucher toko.

---

## 12. Hal yang Masih Perlu Dilengkapi

- Dokumentasi integrasi "app lain" yang disebutkan sebelumnya (endpoint, auth, payload) — belum dilampirkan.
- Kebijakan refund/void order (khususnya untuk status `REFUNDED` dari Anjay PG — perlu proses apa di sisi toko, mis. kembalikan stok yang sudah di-take jika delivery-nya belum dikonsumsi user).
- Channel notifikasi (email/WA/Telegram) yang dipakai untuk kirim hasil stok (`takenStocks`) ke user setelah pembayaran sukses.
- Secret Key webhook Anjay PG & API Key (`pk_live_...`) harus disiapkan di environment variable production — **jangan** commit ke repository/version control.