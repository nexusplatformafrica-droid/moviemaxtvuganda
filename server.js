// MOVIE MAX cloud broadcaster: small status page + keeps start-broadcast.sh running forever.
const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");

const port = Number(process.env.PORT || 3000);
const outputUrl = process.env.OUTPUT_URL || "https://moviemaxlivetv.nexusplatformafrica.workers.dev/output";
const watchUrl = process.env.WATCH_URL || "https://watch.hostherb.com/tv-257/index.m3u8";
const playerUrl = process.env.PLAYER_URL || "https://watch.hostherb.com/player/tv-257/";

let child = null, startedAt = null, restarts = 0, lastExit = null;

function start() {
  startedAt = new Date().toISOString();
  child = spawn("/app/start-broadcast.sh", [], { env: process.env, stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", (code, signal) => {
    lastExit = { code, signal, at: new Date().toISOString() };
    console.error("Broadcaster stopped", lastExit, "- starting again in 5 s");
    child = null; restarts++;
    setTimeout(start, 5000);
  });
}
const status = () => { try { return fs.readFileSync("/tmp/broadcast-status", "utf8").trim(); } catch { return "starting"; } };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/health") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ok: true, broadcaster: child ? status() : "restarting", outputUrl, watchUrl, startedAt, restarts, lastExit }));
  }
  if (url === "/live/index.m3u8") { res.writeHead(302, { location: watchUrl }); return res.end(); }
  if (url !== "/") { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="15"><title>MOVIE MAX Cloud Broadcaster</title>
<style>body{font:16px Arial;max-width:760px;margin:40px auto;padding:0 18px;background:#101820;color:#f4f6f8}code{word-break:break-all;color:#8ed0ff}.card{background:#1c2a35;padding:20px;border-radius:12px;margin:16px 0}a{color:#8ed0ff}</style></head>
<body><h1>MOVIE MAX Cloud Broadcaster</h1>
<div class="card"><b>Status:</b> ${esc(child ? status() : "restarting")}<br><b>Capturing:</b> <code>${esc(outputUrl)}</code><br><b>Sending to:</b> HostHerb (RTMPS)</div>
<div class="card"><b>Watch link:</b><br><code>${esc(watchUrl)}</code><br><br><b>Player page:</b><br><a href="${esc(playerUrl)}">${esc(playerUrl)}</a></div>
<p><a href="/health">Health status</a></p></body></html>`);
}).listen(port, "0.0.0.0", () => { console.log(`Status page on port ${port}`); start(); });

process.on("SIGTERM", () => { if (child) child.kill("SIGTERM"); setTimeout(() => process.exit(0), 1000); });
