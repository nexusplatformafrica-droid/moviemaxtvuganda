# MOVIE MAX Broadcaster v2.3 (crash-proof)

Opens your MOVIE MAX `/output` page (https://moviemaxlivetv.nexusplatformafrica.workers.dev/output)
in a hidden browser (picture + on-screen graphics + sound) and sends it 24/7 to HostHerb.
Viewers watch:

- HLS: https://watch.hostherb.com/tv-257/index.m3u8
- Player: https://watch.hostherb.com/player/tv-257/

The HostHerb server address, stream key and output page are built in - nothing to configure.

## New in v2.3
- **Crash watchdog:** if the page crashes ("Aw, Snap!"), freezes or fails to load, the browser is
  reopened within seconds instead of streaming the error screen.
- Uses less memory, and refreshes the page every 6 hours to stay light (`RELOAD_HOURS`, 0 = never).

"Aw, Snap! Error code 9" means the server ran out of memory. The browser + video + encoder need
about **1.5-2 GB of memory**. Small free plans (around 0.5 GB) will keep crashing.

## Option A - Oracle Cloud "Always Free" (recommended, free 24/7)
Oracle gives a free server with up to 4 CPUs and 24 GB memory that never sleeps.
1. Sign up at https://www.oracle.com/cloud/free/ (a card is asked to verify you; Always Free items are not charged).
2. Open **Cloud Shell** (the `>_` button at the top of the Oracle console) and run:
   `ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub`
   Copy the line it prints.
3. **Compute -> Instances -> Create instance**: Image **Ubuntu**, Shape **Ampere VM.Standard.A1.Flex**
   with **2 OCPU and 12 GB memory**. Under SSH keys choose **Paste public keys** and paste the line. Create.
4. When it is Running, copy its **Public IP** and in Cloud Shell run:
   `ssh ubuntu@PUBLIC_IP`
5. On the server run (use your own GitHub repository address):
   ```
   git clone https://github.com/YOUR-NAME/YOUR-REPO.git moviemax && cd moviemax && bash oracle-install.sh
   ```
6. Done. It keeps sending even after the server restarts. To update later:
   `cd moviemax && git pull && bash oracle-install.sh`

Only run ONE sender at a time - stop the Railway service once Oracle is sending.

## Option B - Railway
Replace the files in your Railway GitHub repository with these and push. In the service
**Settings -> Resources** give it at least **2 GB memory** (needs the paid Hobby plan; the free plan's
memory is too small for video).

## Optional settings (environment variables)
- `OUTPUT_URL` - another page to capture
- `RTMP_URL`, `STREAM_KEY` - another streaming server
- `SCREEN_WIDTH`, `SCREEN_HEIGHT`, `FPS`, `VIDEO_BITRATE`, `AUDIO_BITRATE`
- `X264_PRESET` (default `veryfast`; use `ultrafast` on weak servers), `RELOAD_HOURS` (default 6)
