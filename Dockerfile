# Imagem com node + ffmpeg + edge-tts + mediamtx
# Roda 2 processos: MediaMTX (RTMP :1935) + Node Express (:3000) supervisionados.
FROM node:20-bookworm-slim

# Deps de sistema: ffmpeg pra empurrar audio, python pra edge-tts, curl pra healthcheck e baixar mediamtx
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# edge-tts (Microsoft TTS gratuito, Thalita PT-BR e default)
RUN pip3 install --no-cache-dir --break-system-packages edge-tts

# MediaMTX binario oficial pra Linux amd64
ARG MEDIAMTX_VERSION=v1.9.3
RUN curl -L -o /tmp/mediamtx.tar.gz \
      "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_amd64.tar.gz" && \
    tar -xzf /tmp/mediamtx.tar.gz -C /usr/local/bin/ mediamtx && \
    chmod +x /usr/local/bin/mediamtx && \
    rm /tmp/mediamtx.tar.gz

WORKDIR /app

# Deps Node
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Codigo + config
COPY . .

# Portas: 1935 RTMP (TCP exposto via Railway TCP proxy) + 3000 HTTP API
EXPOSE 1935 3000

# Healthcheck simples
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
