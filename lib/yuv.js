// Cliente minimo da API YUV pra send-command e lookup device.
// Reusa pattern do fleet-yuv-tools mas standalone.

const axios = require('axios');

class YuvClient {
  constructor() {
    const base = process.env.YUV_API_BASE_URL || 'https://api.cloud-services.yuv.com.br';
    const token = process.env.CGV_JIMI_API_KEY;
    if (!token) throw new Error('CGV_JIMI_API_KEY ausente no env');
    this.client = axios.create({
      baseURL: base,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
      validateStatus: () => true,
    });
  }

  async findDeviceByImei(imei) {
    const r = await this.client.get('/device', { data: { search: imei, page: 1 } });
    if (r.status !== 200) throw new Error(`YUV /device search ${r.status}: ${JSON.stringify(r.data)}`);
    const list = r.data?.data || [];
    return list.find(d => String(d.deviceImei) === String(imei)) || null;
  }

  async sendCommand(imei, commandString) {
    const r = await this.client.post('/device/send-command', { deviceImei: imei, commandString });
    if (r.status !== 200 && r.status !== 201) {
      throw new Error(`YUV send-command ${r.status}: ${JSON.stringify(r.data)}`);
    }
    return r.data;
  }
}

module.exports = { YuvClient };
