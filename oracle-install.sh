#!/bin/bash
# MOVIE MAX broadcaster - one-command install for a free Oracle Cloud server (Ubuntu).
# Run inside this folder:   bash oracle-install.sh
# Run it again any time to update after you change the files (git pull first).
set -e
cd "$(dirname "$0")"
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
fi
echo "Building the broadcaster (first time takes a few minutes)..."
sudo docker build -t moviemax-broadcaster .
sudo docker rm -f moviemax >/dev/null 2>&1 || true
sudo docker run -d --name moviemax --restart always --shm-size=1g -p 8080:3000 moviemax-broadcaster
echo
echo "MOVIE MAX broadcaster is running and will start again by itself after any reboot."
echo "See what it is doing:   sudo docker logs -f moviemax     (press Ctrl+C to stop watching)"
sleep 25
sudo docker logs --tail 30 moviemax
