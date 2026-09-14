import prisma from '../lib/prisma.js';

async function seedBanners() {
  console.log('Seeding initial promo banners...');

  const dummyBanners = [
    {
      title: 'Promo Diskon Spesial Season Proxy',
      imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&q=80',
      targetUrl: '/#katalog',
      isActive: true,
      order: 1
    },
    {
      title: 'Layanan Top-Up Fast Processing 24/7',
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80',
      targetUrl: '/#katalog',
      isActive: true,
      order: 2
    }
  ];

  for (const b of dummyBanners) {
    await prisma.banner.create({ data: b });
  }

  console.log('Seed banners completed!');
  process.exit(0);
}

seedBanners().catch(err => {
  console.error('Seed banner error:', err);
  process.exit(1);
});
