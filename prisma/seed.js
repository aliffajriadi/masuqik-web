import prisma from '../lib/prisma.js';

async function seed() {
  console.log('Seeding initial products for demonstration...');

  const dummyProducts = [
    {
      panelProductId: 'PROX-001',
      name: 'Residential Proxy High Speed 1GB',
      category: 'Proxy',
      priceRupiah: 25000,
      priceWl: 5,
      currencyMode: 'IDR',
      thumbnail: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=300&q=80',
      stockCount: 50,
      isActive: true,
      markupPrice: 5000
    },
    {
      panelProductId: 'PROX-002',
      name: 'Datacenter IPv4 Unlimited 1 Month',
      category: 'Proxy',
      priceRupiah: 45000,
      priceWl: 10,
      currencyMode: 'IDR',
      thumbnail: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=300&q=80',
      stockCount: 20,
      isActive: true,
      markupPrice: 5000
    },
    {
      panelProductId: 'VOUCH-001',
      name: 'Voucher Premium Access 30 Hari',
      category: 'Voucher',
      priceRupiah: 15000,
      priceWl: 3,
      currencyMode: 'IDR',
      thumbnail: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300&q=80',
      stockCount: 100,
      isActive: true,
      markupPrice: 2000
    },
    {
      panelProductId: 'TOPUP-001',
      name: 'Topup Balance 100 World Lock',
      category: 'Top-Up',
      priceRupiah: 120000,
      priceWl: 100,
      currencyMode: 'BOTH',
      thumbnail: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=300&q=80',
      stockCount: 10,
      isActive: true,
      markupPrice: 10000
    }
  ];

  for (const item of dummyProducts) {
    await prisma.product.upsert({
      where: { panelProductId: item.panelProductId },
      update: item,
      create: item
    });
  }

  console.log('Seeding completed successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
