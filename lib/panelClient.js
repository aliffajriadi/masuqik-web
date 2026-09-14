import axios from 'axios';
import { config } from '../config/env.js';

const panelApi = axios.create({
  baseURL: config.panelBaseUrl,
  timeout: 10000,
  headers: {
    'x-api-key': config.panelApiKey,
    'Content-Type': 'application/json'
  }
});

/**
 * Fetch all active products and stocks from external panel.
 * GET /api/v1/integration/products
 */
export async function fetchPanelProducts() {
  try {
    const response = await panelApi.get('/api/v1/integration/products');
    return response.data;
  } catch (error) {
    console.error('[PanelClient] Error fetching products:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Take stocks from external panel after payment completion.
 * POST /api/v1/integration/take
 * Payload: { productId, qty }
 */
export async function takePanelStock(productId, qty) {
  try {
    const response = await panelApi.post('/api/v1/integration/take', {
      productId,
      qty,
      notif: true
    });
    return response.data;
  } catch (error) {
    console.error('[PanelClient] Error taking stock:', error.response?.data || error.message);
    throw error;
  }
}
