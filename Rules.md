# Coding Guidelines — Masuqik Store

Dokumen ini adalah aturan kerja untuk siapa pun (atau AI agent apa pun) yang menulis kode di project ini. Tujuannya: kode tetap rapi, aman, dan konsisten selama proses development — termasuk lintas sesi/lintas orang.

---

## 1. Prinsip Umum

- **KISS (Keep It Simple):** pilih solusi paling sederhana yang menyelesaikan masalah dengan benar. Kompleksitas harus punya alasan konkret, bukan "biar keren" atau "siapa tahu nanti butuh".
- **YAGNI (You Aren't Gonna Need It):** jangan bangun fitur/abstraksi untuk kebutuhan yang belum ada. Kalau butuh nanti, refactor nanti.
- **Jangan overengineering:**
  - Tidak boleh menambah layer abstraksi (repository pattern, DI container, event bus, dsb) kalau masalahnya bisa selesai dengan fungsi biasa di `services/`.
  - Tidak boleh menambah microservice, message queue (Redis/BullMQ/RabbitMQ), atau caching layer kalau belum ada bukti kebutuhan (mis. load tinggi, latency jadi masalah nyata).
  - Satu tanggung jawab jelas per file/fungsi. Kalau satu file mulai > 200–300 baris dan mengerjakan banyak hal, itu sinyal untuk dipecah — bukan sinyal untuk menambah pattern baru.
- **Konsistensi > preferensi pribadi.** Ikuti pola yang sudah ada di codebase (struktur `routes → services → lib`) daripada memperkenalkan gaya baru di tengah jalan.
- **Kode harus bisa dibaca tanpa penjelasan tambahan.** Nama variabel/fungsi jelas, komentar hanya untuk *kenapa* (alasan bisnis/teknis), bukan *apa* (yang sudah jelas dari kode itu sendiri).

---

## 2. Efisiensi Kode (Level Profesional)

- Hindari query database berlebihan (N+1 query). Gunakan `include`/`select` Prisma untuk ambil relasi sekaligus, bukan loop query satu-satu.
- Gunakan `Promise.all()` untuk operasi async independen yang bisa jalan paralel (lihat contoh di `statsService.js`), tapi jangan paksakan paralel untuk operasi yang sebenarnya harus berurutan (mis. buat order → baru buat invoice).
- Hindari komputasi berat di request-response cycle. Kalau ada proses berat/lambat (laporan besar, sinkronisasi banyak data), pertimbangkan job terjadwal (cron) — bukan dijalankan sinkron saat user menunggu response.
- Validasi input di titik paling awal (controller/route level) sebelum masuk ke service — jangan biarkan data kotor mengalir jauh ke dalam business logic.
- Jangan duplikasi logic. Kalau logic yang sama dipakai di 2+ tempat, ekstrak ke `services/` atau helper — tapi hanya setelah benar-benar duplikat, jangan diabstraksi preventif dari awal.
- Idempotency wajib untuk operasi yang efeknya sekali jalan (contoh nyata: `fulfillPaidOrder` di `orderService.js` — pakai conditional `updateMany` berbasis status, bukan cek-lalu-update terpisah yang rawan race condition).

---

## 3. Aturan Menjalankan Perintah Terminal

**Tidak boleh asal eksekusi command di terminal.** Sebelum menjalankan command apa pun yang berpotensi mengubah state (bukan sekadar membaca), harus dijelaskan dulu ke user: command apa, apa efeknya, dan minta konfirmasi — kecuali command tersebut jelas-jelas aman & reversible (misal `ls`, `cat`, `pnpm list`).

### Wajib konfirmasi eksplisit ke user sebelum dijalankan:
- Perintah yang mengubah database: `prisma migrate reset`, `prisma db push --force-reset`, `DROP TABLE`, `TRUNCATE`, atau apa pun yang menghapus data.
- Perintah git yang menimpa histori: `git push --force`, `git reset --hard`, `git rebase` di branch yang sudah dibagikan/di-push.
- Perintah filesystem destruktif: `rm -rf`, `mv` yang menimpa file penting, overwrite `.env` production.
- Perintah yang menyentuh environment production (deploy, restart service production, ubah env var production).
- Install/uninstall dependency (lihat Bagian 4).
- Mengubah `prisma/schema.prisma` lalu migrate — karena bisa berdampak ke data yang sudah ada di production.

### Boleh langsung dijalankan tanpa konfirmasi tambahan (read-only / aman):
- `pnpm install` (saat pertama setup, sebelum ada `node_modules`)
- `pnpm dev` / `pnpm start` untuk menjalankan server lokal
- `pnpm prisma:generate`
- Perintah baca seperti `git status`, `git diff`, `git log`, `cat`, `ls`

**Prinsip dasarnya:** kalau command itu bisa membuat kerja sebelumnya hilang, sulit di-undo, atau menyentuh data/lingkungan yang bukan milik sesi kerja saat ini — **tanya dulu, jangan asumsi**.

---

## 4. Aturan Menambah Library / Dependency

**Tidak boleh asal tambah library.** Sebelum `pnpm add <package>`, cek dulu:

1. **Apakah benar-benar dibutuhkan?** Kalau kebutuhannya sepele (mis. generate random string, format tanggal simpel), lebih baik pakai built-in Node.js (`crypto`, `Intl.DateTimeFormat`) daripada menambah dependency baru. Contoh nyata di project ini: order code digenerate pakai `crypto.randomBytes` bawaan Node, bukan library eksternal seperti `nanoid`/`uuid`, karena kebutuhannya sederhana.
2. **Untuk hal-hal besar/berdampak luas — wajib konfirmasi ke user dulu**, termasuk (tapi tidak terbatas pada):
   - Mengganti komponen inti (ORM lain selain Prisma, template engine lain selain EJS, framework lain selain Express).
   - Menambah dependency yang membawa infrastruktur baru (Redis, message queue, search engine seperti Elasticsearch, dll).
   - Menambah library autentikasi/keamanan (JWT library, OAuth provider, dll) yang mengubah alur auth yang sudah ada.
   - Library yang menambah build step/tooling baru (bundler, transpiler) ke project yang sebelumnya tidak pakai build step.
3. **Untuk penambahan kecil yang jelas aman & sudah direncanakan di PRD** (mis. `bcryptjs` untuk hash password, `node-cron` untuk scheduler, `axios` untuk HTTP client) — boleh langsung ditambahkan tanpa perlu konfirmasi berulang, karena sudah disepakati di scope awal.
4. **Selalu cek dulu:** jumlah unduhan/maintenance status package (hindari package yang sudah lama tidak di-update atau tidak jelas maintainer-nya), dan pastikan lisensinya kompatibel (hindari GPL untuk kode proprietary kalau belum didiskusikan).
5. Jangan menambah dua library berbeda untuk fungsi yang sama (mis. `axios` dan `node-fetch` sekaligus). Konsisten pakai satu.

---

## 5. Struktur & Konvensi Kode

- **Struktur folder tetap:** `routes/` (HTTP layer, tipis, hanya parsing request & memanggil service) → `services/` (business logic) → `lib/` (client eksternal: Prisma, panel API, Anjay SDK). Jangan taruh business logic di routes.
- **Penamaan file:** camelCase untuk file JS (`orderService.js`), lowercase-dash untuk view/folder kalau perlu.
- **Async/await** untuk semua operasi asinkron — hindari mencampur `.then()` dan `async/await` di file yang sama.
- **Error handling:**
  - Operasi yang boleh gagal tanpa menghentikan alur utama (mis. kirim webhook notifikasi) wajib dibungkus try/catch dan **tidak boleh melempar ulang** error tersebut ke pemanggil.
  - Operasi kritikal (create order, ambil stok) biarkan error naik ke route handler, lalu route yang menampilkan pesan yang sesuai ke user.
- **Environment variable:** semua secret (API key, webhook secret, session secret) wajib lewat `.env`, divalidasi di `config/env.js` saat startup (fail fast kalau ada yang kosong) — tidak boleh hardcode di kode maupun tersimpan di database tanpa enkripsi.
- **Jangan expose data sensitif ke view/response:** password hash, API key, secret tidak boleh dikirim ke `res.render()`/`res.json()` dalam bentuk apa pun.

---

## 6. Sebelum Menganggap Task Selesai

- Pastikan tidak ada `console.log` debug yang tertinggal (boleh `console.error` untuk logging error yang memang disengaja).
- Pastikan setiap endpoint baru yang mengubah data (POST/PUT/DELETE) sudah divalidasi inputnya & sudah dilindungi middleware yang sesuai (`requireAuth`/`requireAdmin` kalau memang perlu).
- Kalau menambah field baru ke `schema.prisma`, jelaskan dulu ke user apa dampaknya ke data existing sebelum menjalankan migrasi.
- Kalau ragu antara dua pendekatan (dan keduanya sama-sama valid), **tanya user**, jangan pilih sepihak untuk keputusan yang berdampak besar ke arsitektur.