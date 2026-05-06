// Wrapper do edge-tts pra gerar audio PT-BR (default Thalita) em mp3.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_VOICE = process.env.EDGE_TTS_VOICE || 'pt-BR-ThalitaNeural';

async function generateTTS(text, opts = {}) {
  const voice = opts.voice || DEFAULT_VOICE;
  const id = opts.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outDir = opts.outDir || os.tmpdir();
  const outPath = path.join(outDir, `tts-${id}.mp3`);

  return new Promise((resolve, reject) => {
    const proc = spawn('edge-tts', [
      '--voice', voice,
      '--text', text,
      '--write-media', outPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`edge-tts exit ${code}: ${stderr}`));
      if (!fs.existsSync(outPath)) return reject(new Error('edge-tts nao gerou arquivo'));
      const stat = fs.statSync(outPath);
      resolve({ path: outPath, sizeBytes: stat.size, voice, id });
    });
  });
}

module.exports = { generateTTS, DEFAULT_VOICE };
