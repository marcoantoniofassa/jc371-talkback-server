#!/usr/bin/env node
// CLI local pra disparar talkback sem precisar do server HTTP.
// Uso: node cli.js <IMEI> "<texto>"
// Requer: server.js rodando em outro terminal (pra MediaMTX ativo) OU rodar sozinho com flag --serverless

require('dotenv').config();
const axios = require('axios');

const IMEI = process.argv[2];
const TEXT = process.argv[3] || 'teste de talkback contele';
const DURATION = parseInt(process.argv[4] || '8', 10);
const HTTP_BASE = process.env.HTTP_BASE || 'http://127.0.0.1:3000';

if (!IMEI) {
  console.error('Uso: node cli.js <IMEI> "<texto>" [durationSec]');
  console.error('Ex:  node cli.js 865478070230836 "atencao motorista" 8');
  process.exit(1);
}

(async () => {
  console.log(`POST ${HTTP_BASE}/talk`);
  console.log(`  imei=${IMEI} text="${TEXT}" dur=${DURATION}s`);
  try {
    const r = await axios.post(`${HTTP_BASE}/talk`, { imei: IMEI, text: TEXT, durationSec: DURATION });
    console.log('Response:', JSON.stringify(r.data, null, 2));
  } catch (e) {
    console.error('Erro:', e.response?.data || e.message);
    process.exit(1);
  }
})();
