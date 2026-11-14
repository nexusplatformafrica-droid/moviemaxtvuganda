FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg chromium xvfb pulseaudio dbus-x11 ca-certificates procps fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash app

WORKDIR /app
COPY package.json ./
COPY . .

RUN mkdir -p /tmp/runtime-app /tmp/pulse \
    && chown -R app:app /app /tmp/runtime-app /tmp/pulse \
    && chmod 700 /tmp/runtime-app /tmp/pulse \
    && chmod +x /app/start-broadcast.sh

ENV NODE_ENV=production
ENV HOME=/home/app
ENV DISPLAY=:99
ENV XDG_RUNTIME_DIR=/tmp/runtime-app
ENV PULSE_SERVER=unix:/tmp/pulse/native
ENV SCREEN_WIDTH=1280
ENV SCREEN_HEIGHT=720
ENV FPS=25
ENV VIDEO_BITRATE=2500k
ENV AUDIO_BITRATE=128k

USER app
CMD ["node", "server.js"]
