// Express HTTP API + supervisao do MediaMTX.
// POST /talk { imei, text, durationSec? } -> dispara TTS + push RTMP + comando startTalkURL/stopTalkURL.

require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { YuvClient } = require('./lib/yuv');
const { generateTTS, DEFAULT_VOICE } = require('./lib/tts');
const { pushAudio } = require('./lib/rtmp');

const PORT = parseInt(process.env.PORT || '3000', 10);
const RTMP_PUBLIC_HOST = process.env.RTMP_PUBLIC_HOST; // ex jc371.up.railway.app
const RTMP_PUBLIC_PORT = parseInt(process.env.RTMP_PUBLIC_PORT || '1935', 10);
const DEFAULT_DURATION = parseInt(process.env.DEFAULT_TALK_DURATION_SEC || '8', 10);

if (!RTMP_PUBLIC_HOST) {
  console.warn('AVISO: RTMP_PUBLIC_HOST nao configurado. Camera nao vai conseguir conectar.');
}

// Sobe MediaMTX como filho persistente
let mediamtxProc;
function startMediaMtx() {
  const cfg = path.join(__dirname, 'mediamtx.yml');
  console.log(`[mediamtx] iniciando com config ${cfg}`);
  mediamtxProc = spawn('mediamtx', [cfg], { stdio: ['ignore', 'inherit', 'inherit'] });
  mediamtxProc.on('exit', code => {
    console.error(`[mediamtx] saiu com code=${code}, reiniciando em 3s`);
    setTimeout(startMediaMtx, 3000);
  });
}
startMediaMtx();

const yuv = new YuvClient();
const app = express();
app.use(express.json({ limit: '128kb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/', (_req, res) => {
  res.json({
    name: 'jc371-talkback-server',
    desc: 'POC talkback Jimi JC371 via API YUV',
    endpoints: {
      'POST /talk': '{ imei, text, durationSec? } - gera TTS PT-BR e envia pra camera',
      'POST /talk/url': '{ imei, audioUrl, durationSec? } - usa URL externa',
      'GET /device/:imei': 'lookup do device na YUV',
      'GET /health': 'healthcheck',
    },
    rtmpPublic: RTMP_PUBLIC_HOST ? `rtmp://${RTMP_PUBLIC_HOST}:${RTMP_PUBLIC_PORT}` : null,
    voiceDefault: DEFAULT_VOICE,
  });
});

app.get('/device/:imei', async (req, res) => {
  try {
    const dev = await yuv.findDeviceByImei(req.params.imei);
    if (!dev) return res.status(404).json({ error: 'imei nao encontrado na YUV' });
    res.json(dev);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Talk com TTS gerado (default fluxo)
app.post('/talk', async (req, res) => {
  const { imei, text, durationSec } = req.body || {};
  if (!imei || !text) return res.status(400).json({ error: 'imei e text obrigatorios' });
  if (!RTMP_PUBLIC_HOST) return res.status(500).json({ error: 'RTMP_PUBLIC_HOST nao configurado' });
  await runTalk({ imei, text, durationSec, res });
});

// Talk com URL externa (mp3 jah hospedado)
app.post('/talk/url', async (req, res) => {
  const { imei, audioUrl, durationSec } = req.body || {};
  if (!imei || !audioUrl) return res.status(400).json({ error: 'imei e audioUrl obrigatorios' });
  // Mandar startTalkURL apontando direto pra URL externa (sem RTMP local)
  const cmd1 = `startTalkURL,${audioUrl}#`;
  const r1 = await yuv.sendCommand(imei, cmd1);
  const dur = (durationSec || DEFAULT_DURATION) * 1000;
  setTimeout(async () => {
    try { await yuv.sendCommand(imei, `stopTalkURL,${audioUrl}#`); } catch {}
  }, dur);
  res.json({ ok: true, mode: 'external-url', startResponse: r1, willStopAfterMs: dur });
});

async function runTalk({ imei, text, durationSec, res }) {
  const dur = (durationSec || DEFAULT_DURATION) * 1000;
  let tts, ffmpeg;
  try {
    // 1. Gera TTS
    tts = await generateTTS(text);
    const streamKey = `live/${tts.id}`;
    const publicUrl = `rtmp://${RTMP_PUBLIC_HOST}:${RTMP_PUBLIC_PORT}/${streamKey}`;
    console.log(`[talk] imei=${imei} tts=${tts.path} stream=${streamKey} publicUrl=${publicUrl}`);

    // 2. Empurra o stream em loop pro MediaMTX local
    ffmpeg = pushAudio({ audioPath: tts.path, streamKey, loop: true });

    // 3. Pequeno delay pra MediaMTX virar publisher antes da camera tentar consumer
    await new Promise(r => setTimeout(r, 1500));

    // 4. Manda startTalkURL pra camera
    const cmd1 = `startTalkURL,${publicUrl}#`;
    const r1 = await yuv.sendCommand(imei, cmd1);
    console.log(`[talk] startTalkURL resp:`, r1);

    res.json({
      ok: true,
      imei,
      streamKey,
      publicUrl,
      ttsFile: tts.path,
      ttsBytes: tts.sizeBytes,
      voice: tts.voice,
      durationSec: dur / 1000,
      startResponse: r1,
    });

    // 5. Aguarda durationSec, manda stop, mata ffmpeg
    setTimeout(async () => {
      console.log(`[talk] enviando stopTalkURL e parando ffmpeg`);
      try { await yuv.sendCommand(imei, `stopTalkURL,${publicUrl}#`); } catch (e) { console.error('stop err', e.message); }
      ffmpeg.stop();
      // limpa mp3
      setTimeout(() => { try { fs.unlinkSync(tts.path); } catch {} }, 5000);
    }, dur);
  } catch (e) {
    console.error('[talk] erro:', e.message);
    if (ffmpeg) ffmpeg.stop();
    if (tts) { try { fs.unlinkSync(tts.path); } catch {} }
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
}

app.listen(PORT, () => {
  console.log(`[http] listening on :${PORT}`);
  console.log(`[rtmp public] rtmp://${RTMP_PUBLIC_HOST || '<NAO_CONFIGURADO>'}:${RTMP_PUBLIC_PORT}`);
  console.log(`[voice default] ${DEFAULT_VOICE}`);
});

// Graceful shutdown
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
  console.log(`[shutdown] ${sig}, parando MediaMTX`);
  if (mediamtxProc) { mediamtxProc.removeAllListeners('exit'); mediamtxProc.kill(); }
  process.exit(0);
}));
