import dotenv from 'dotenv';
dotenv.config();

import AnjayPGPackage from 'anjay-pg-sdk';
const AnjayPG = AnjayPGPackage.default || AnjayPGPackage;

const apiKey = process.env.ANJAY_API_KEY;

console.log('--- TEST CREATE INVOICE ANJAY PG ---');
console.log('Menggunakan API Key:', apiKey);

const sdk = new AnjayPG(apiKey);

async function runTest() {
  try {
    const payload = {
      productName: 'Produk Uji Coba',
      amount: 10000,
      customerName: 'Test Customer',
      customerContact: '08123456789',
      externalId: `TEST-${Date.now()}`
    };

    console.log('\nMengirim Request Create Invoice ke Anjay PG...');
    console.log('Payload:', payload);

    const result = await sdk.createInvoice(payload);

    console.log('\n✅ INVOICE BERHASIL DIBUAT!');
    console.log('Hasil Response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\n❌ INVOICE GAGAL DIBUAT!');
    if (error.response) {
      console.error('HTTP Status Code:', error.response.status);
      console.error('Response Data:', error.response.data);
    } else {
      console.error('Error Message:', error.message);
    }
  }
}

runTest();
