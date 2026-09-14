import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';

async function seedAdmin() {
  console.log('Seeding initial Admin user...');

  const adminEmail = 'admin@masuqik.store';
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE'
    },
    create: {
      name: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE'
    }
  });

  console.log('Admin user seeded successfully:', admin.email);
  process.exit(0);
}

seedAdmin().catch(err => {
  console.error('Seed admin error:', err);
  process.exit(1);
});
