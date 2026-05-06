# jc371-talkback-server

Servidor POC pra disparar **talkback / intercom** em câmeras Jimi JC371 via API YUV (`cgv.cloud-services`). Pipeline: gera TTS PT-BR (Edge Thalita) → empurra como RTMP via FFmpeg pro MediaMTX embutido → manda comando `startTalkURL` pro device → para 8s depois com `stopTalkURL`.

Baseado no protocolo oficial Jimi (PPTX `two way intercom` enviado pelo João da Jimi Brasil em 06/05/2026).

## Stack

- **MediaMTX** (RTMP server) embutido na imagem Docker
- **Express** HTTP API
- **edge-tts** (Microsoft, free) com voz padrão `pt-BR-ThalitaNeural`
- **FFmpeg** pra empacotar mp3 → AAC 48k 8kHz mono FLV (config exata exigida pelo firmware Jimi)
- API YUV `/device/send-command` pra disparar `startTalkURL`/`stopTalkURL`

## Endpoints HTTP

| Método | Path | Body | Descrição |
|---|---|---|---|
| POST | `/talk` | `{ imei, text, durationSec? }` | Gera TTS, empurra stream, dispara talkback |
| POST | `/talk/url` | `{ imei, audioUrl, durationSec? }` | Usa URL externa (mp3/aac já hospedado) sem RTMP local |
| GET | `/device/:imei` | : | Lookup do device na YUV |
| GET | `/health` | : | Healthcheck |

## Uso local

```bash
cp .env.example .env
# preencher CGV_JIMI_API_KEY (pegar do fleet-yuv-tools/.env) e RTMP_PUBLIC_HOST
npm install
npm start

# em outro terminal:
node cli.js 865478070230836 "atencao reduza velocidade" 8
```

Localmente, `RTMP_PUBLIC_HOST` precisa ser endereço alcançável pela câmera (que está em SIM 4G, ou seja: hostname público). Use ngrok TCP:

```bash
ngrok tcp 1935
# pega o tcp://X.tcp.ngrok.io:Y
# coloca no .env como:
#   RTMP_PUBLIC_HOST=X.tcp.ngrok.io
#   RTMP_PUBLIC_PORT=Y
```

## Deploy Railway

1. Criar serviço novo apontando pra esse repo. Builder: Dockerfile.
2. Definir variáveis de ambiente:
   - `CGV_JIMI_API_KEY` (do fleet-yuv-tools)
   - `YUV_API_BASE_URL=https://api.cloud-services.yuv.com.br`
   - `RTMP_PUBLIC_PORT=1935`
   - `RTMP_PUBLIC_HOST` : preencher **depois** com hostname do TCP proxy
3. Habilitar **TCP proxy** na porta 1935 no painel Railway (Settings → Networking → "TCP Proxy"). Railway gera um hostname tipo `roundhouse.proxy.rlwy.net:12345`. Esse é o `RTMP_PUBLIC_HOST` (host) + `RTMP_PUBLIC_PORT` (porta gerada).
4. Habilitar HTTP público na porta 3000 (gerar `*.up.railway.app` automaticamente).
5. Redeploy depois de setar `RTMP_PUBLIC_HOST`.

**Importante:** alguns firmwares Jimi parecem só aceitar **porta 1935 RTMP padrão**. Se o Railway TCP proxy não permitir mapear pra 1935 externa (gera porta aleatória), pode ser necessário front-ar com Cloudflare TCP origin ou mover pra VPS com IP fixo + porta 1935. Testar antes.

## Variáveis de ambiente

| Var | Default | Descrição |
|---|---|---|
| `CGV_JIMI_API_KEY` | : | Token Bearer da API YUV |
| `YUV_API_BASE_URL` | `https://api.cloud-services.yuv.com.br` | Base API YUV |
| `PORT` | `3000` | Porta HTTP |
| `RTMP_PUBLIC_HOST` | : | Hostname público que a câmera vai consumir |
| `RTMP_PUBLIC_PORT` | `1935` | Porta TCP RTMP exposta |
| `EDGE_TTS_VOICE` | `pt-BR-ThalitaNeural` | Voz TTS |
| `DEFAULT_TALK_DURATION_SEC` | `8` | Quantos segundos manter o talkback aberto |

## Como testar

```bash
# 1. healthcheck
curl https://<seu-host-railway>.up.railway.app/health

# 2. lookup device
curl https://<seu-host-railway>.up.railway.app/device/865478070230836

# 3. dispara talkback
curl -X POST https://<seu-host-railway>.up.railway.app/talk \
  -H "Content-Type: application/json" \
  -d '{"imei":"865478070230836","text":"atencao motorista, teste contele","durationSec":8}'
```

Validação física: alguém na cabine ouvindo o alto-falante da JC371. Sem isso, só dá pra confirmar que o comando foi aceito (não que o áudio reproduziu).

## Status conhecido (06/05/2026)

- ✅ Comando `startTalkURL` reconhecido pelo firmware (`commandResponse: "OK"`)
- ✅ Pipeline RTMP local funciona (ffmpeg → MediaMTX confirmado em testes)
- ❓ Câmera **não conectou** ao stream em testes via `ngrok TCP` com porta aleatória
- ❓ Hipótese principal: firmware Jimi só aceita porta RTMP padrão (1935) e Railway TCP proxy pode dar porta dinâmica

Detalhes completos: `obsidian-marco/DOCS/integracao-yuv-tts-jc371.md` (segundo cérebro Marco).
