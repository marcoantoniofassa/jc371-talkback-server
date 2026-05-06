// Wrapper do ffmpeg pra empurrar audio mp3 pro MediaMTX local em formato exigido pela JC371.
// Spec da Jimi (slide 7): -c:a aac -b:a 48k -ar 8000 -ac 1 -f flv

const { spawn } = require('child_process');

const MEDIAMTX_RTMP = process.env.MEDIAMTX_INTERNAL_RTMP || 'rtmp://127.0.0.1:1935';

function pushAudio({ audioPath, streamKey, loop = false }) {
  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-re',
  ];
  if (loop) args.push('-stream_loop', '-1');
  args.push(
    '-i', audioPath,
    '-c:a', 'aac',
    '-b:a', '48k',
    '-ar', '8000',
    '-ac', '1',
    '-f', 'flv',
    `${MEDIAMTX_RTMP}/${streamKey}`
  );

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  proc.stdout.on('data', d => logs.push(`[stdout] ${d}`));
  proc.stderr.on('data', d => logs.push(`[stderr] ${d}`));
  return {
    proc,
    pid: proc.pid,
    stop: () => { try { proc.kill('SIGTERM'); } catch {} },
    onExit: () => new Promise(r => proc.once('exit', code => r({ code, logs: logs.join('') }))),
  };
}

module.exports = { pushAudio, MEDIAMTX_RTMP };
