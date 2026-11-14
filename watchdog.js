// MOVIE MAX broadcaster watchdog.
// Watches the hidden browser through its local debugging port. If the page
// crashes ("Aw, Snap!"), freezes, or shows a "can't reach this site" page, it
// fixes it within seconds so the stream never stays on an error screen.
const { execFile } = require("child_process");
const fs = require("fs");

const PORT = Number(process.env.DEBUG_PORT || 9222);
const OUTPUT_URL = process.env.OUTPUT_URL || "https://moviemaxlivetv.nexusplatformafrica.workers.dev/output";
const RELOAD_HOURS = Number(process.env.RELOAD_HOURS ?? 6); // fresh page every N hours (0 = never) to free memory
const PID_FILE = process.env.CHROME_PID_FILE || "/tmp/chrome.pid";
const PING_EVERY_MS = 15000;
const PING_TIMEOUT_MS = 12000;

const say = (m) => console.log(`${new Date().toISOString()} [watchdog] ${m}`);

let ws = null, nextId = 1, pending = new Map(), missed = 0, noBrowser = 0, restarting = false;
let lastFresh = Date.now();

function killBrowser(reason) {
  if (restarting) return;
  restarting = true;
  say(`Restarting the browser: ${reason}`);
  try { const pid = Number(fs.readFileSync(PID_FILE, "utf8")); if (pid) process.kill(pid, "SIGKILL"); } catch {}
  execFile("pkill", ["-9", "-f", "chrome-profile"], () => {});
  try { ws && ws.close(); } catch {}
  ws = null; missed = 0; noBrowser = 0;
  setTimeout(() => { restarting = false; }, 20000); // give the keeper time to reopen it
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error("not connected"));
    const id = nextId++;
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, PING_TIMEOUT_MS);
    pending.set(id, (msg) => { clearTimeout(t); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function findPage() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) });
  const list = await r.json();
  return list.find((t) => t.type === "page") || null;
}

async function connect() {
  const page = await findPage();
  if (!page) throw new Error("no page open");
  await new Promise((resolve, reject) => {
    const sock = new WebSocket(page.webSocketDebuggerUrl);
    sock.onopen = () => { ws = sock; resolve(); };
    sock.onerror = () => reject(new Error("could not connect"));
    sock.onclose = () => { if (ws === sock) ws = null; for (const cb of pending.values()) cb({ error: { message: "closed" } }); pending.clear(); };
    sock.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && pending.has(msg.id)) { const cb = pending.get(msg.id); pending.delete(msg.id); cb(msg); return; }
      if (msg.method === "Inspector.targetCrashed") killBrowser("the page crashed (usually out of memory)");
    };
  });
  await send("Inspector.enable");
  say("Watching the output page");
}

async function tick() {
  if (restarting) return;
  try {
    if (!ws) await connect();
    noBrowser = 0;
    const res = await send("Runtime.evaluate", { expression: "location.href", returnByValue: true });
    missed = 0;
    const href = String(res?.result?.value || "");
    if (!href.startsWith("http")) {
      say(`Page shows ${href || "an error"} - opening the output page again`);
      await send("Page.navigate", { url: OUTPUT_URL });
      lastFresh = Date.now();
    } else if (RELOAD_HOURS > 0 && Date.now() - lastFresh > RELOAD_HOURS * 3600e3) {
      say(`Fresh reload after ${RELOAD_HOURS} h to free memory`);
      await send("Page.navigate", { url: OUTPUT_URL });
      lastFresh = Date.now();
    }
  } catch (e) {
    if (!ws) {
      // Browser not answering at all. Allow ~1 minute for start-up before forcing a restart.
      if (++noBrowser >= 4) killBrowser(`browser not answering (${e.message})`);
    } else if (++missed >= 2) {
      killBrowser(`page frozen (${e.message})`);
    }
  }
}

say(`Started (debug port ${PORT}, fresh reload every ${RELOAD_HOURS || "never"} h)`);
setTimeout(() => { tick(); setInterval(tick, PING_EVERY_MS); }, 20000);
