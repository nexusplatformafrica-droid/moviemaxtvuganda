#!/bin/bash
# MOVIE MAX cloud broadcaster: opens the /output page in a hidden browser and
# sends picture + graphics + sound to the HostHerb RTMPS server, 24/7.
# If the browser crashes or freezes, or FFmpeg stops, it is started again automatically.
set -uo pipefail

OUTPUT_URL="${OUTPUT_URL:-https://moviemaxlivetv.nexusplatformafrica.workers.dev/output}"
RTMP_URL="${RTMP_URL:-rtmps://source.hostherb.com:1936}"
STREAM_KEY="${STREAM_KEY:-hhv_4940993731b415ba65489e4018a80e8783294972c5930d40}"
TARGET="${RTMP_URL%/}/${STREAM_KEY}"

WIDTH="${SCREEN_WIDTH:-1280}"
HEIGHT="${SCREEN_HEIGHT:-720}"
FPS="${FPS:-25}"
VB="${VIDEO_BITRATE:-2500k}"
AB="${AUDIO_BITRATE:-128k}"
STATUS=/tmp/broadcast-status
mkdir -p /tmp/pulse /tmp/runtime-app
chmod 700 /tmp/pulse /tmp/runtime-app
rm -f /tmp/pulse/native /tmp/.X99-lock
say() { echo "$(date -u +%FT%TZ) $*"; }

say "Starting virtual screen ${WIDTH}x${HEIGHT}"
Xvfb :99 -screen 0 "${WIDTH}x${HEIGHT}x24" -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 2

say "Starting sound"
pulseaudio --daemonize=yes --exit-idle-time=-1 --log-target=stderr \
  --load="module-native-protocol-unix socket=/tmp/pulse/native auth-anonymous=1" \
  --load="module-null-sink sink_name=tv_sink" \
  --load="module-always-sink" || { say "ERROR: sound could not start"; exit 1; }
export PULSE_SERVER=unix:/tmp/pulse/native
for i in $(seq 1 20); do pactl info >/dev/null 2>&1 && break; sleep 1; done
pactl set-default-sink tv_sink

start_browser() {
  say "Opening ${OUTPUT_URL}"
  rm -rf /tmp/chrome-profile
  chromium \
    --no-sandbox --disable-dev-shm-usage --disable-gpu \
    --disable-background-timer-throttling --disable-renderer-backgrounding \
    --disable-backgrounding-occluded-windows \
    --autoplay-policy=no-user-gesture-required \
    --no-first-run --no-default-browser-check --disable-session-crashed-bubble \
    --disable-features=Translate,MediaRouter,OptimizationHints --disable-infobars \
    --disable-extensions --disable-component-update --disable-sync --disable-background-networking \
    --renderer-process-limit=1 --js-flags="--max-old-space-size=${JS_MEMORY_MB:-512}" \
    --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
    --user-data-dir=/tmp/chrome-profile \
    --window-position=0,0 --window-size="${WIDTH},${HEIGHT}" --kiosk \
    "${OUTPUT_URL}" >/tmp/chrome.log 2>&1 &
  CHROME_PID=$!
  echo "$CHROME_PID" > /tmp/chrome.pid
}

# Keeps the browser open forever: if it closes, or the watchdog closes it
# after a crash, it opens again within 3 seconds.
keep_browser() {
  while true; do
    start_browser
    wait "$CHROME_PID"
    say "Browser stopped - opening it again"
    sleep 3
  done
}

cleanup() {
  echo "stopped" > "$STATUS"
  kill "${FFMPEG_PID:-}" "${KEEPER_PID:-}" "${WATCHDOG_PID:-}" "${XVFB_PID:-}" 2>/dev/null || true
  pkill -9 -f chrome-profile 2>/dev/null || true
  pulseaudio --kill 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

keep_browser &
KEEPER_PID=$!
# Watchdog: reloads the page if it crashes ("Aw, Snap!"), freezes or fails to load.
node /app/watchdog.js &
WATCHDOG_PID=$!
say "Waiting for the page to load"
sleep 20

while true; do
  say "Sending to ${RTMP_URL%/}/****"
  echo "sending" > "$STATUS"
  ffmpeg -hide_banner -loglevel warning \
    -thread_queue_size 1024 \
    -f x11grab -draw_mouse 0 -framerate "$FPS" -video_size "${WIDTH}x${HEIGHT}" -i :99.0 \
    -thread_queue_size 1024 \
    -f pulse -i tv_sink.monitor \
    -map 0:v:0 -map 1:a:0 \
    -c:v libx264 -preset "${X264_PRESET:-veryfast}" -threads "${ENCODER_THREADS:-2}" -tune zerolatency -profile:v high \
    -pix_fmt yuv420p -r "$FPS" -g "$((FPS * 2))" -keyint_min "$((FPS * 2))" -sc_threshold 0 \
    -b:v "$VB" -maxrate "$VB" -bufsize "$(( ${VB%k} * 2 ))k" \
    -c:a aac -b:a "$AB" -ar 44100 -ac 2 \
    -f flv -flvflags no_duration_filesize "$TARGET" &
  FFMPEG_PID=$!
  wait "$FFMPEG_PID"
  say "Sending stopped (code $?) - trying again in 5 seconds"
  echo "retrying" > "$STATUS"
  sleep 5
done
