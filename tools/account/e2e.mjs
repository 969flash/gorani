// 로그인 페이지 끝-끝 시험 — 헤드리스 크롬(CDP) + 가짜 Firebase(fake_firebase.py). 시험 전용, 의존 없음(Node 22+의 WebSocket·fetch)
//   node tools/account/e2e.mjs          시험만
//   node tools/account/e2e.mjs --shots  화면이 바뀐 곳 캡처를 .github/pr/에 쓴다
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SITE = "http://127.0.0.1:8000", API = "http://127.0.0.1:8765", PLUGIN_PORT = 8766, DEBUG_PORT = 9333;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.argv.includes("--shots");
const TEST = { apiKey: "test-key", clientId: "test-client", dbUrl: API, urls: { identity: API + "/v1/", token: API + "/v1/token", gis: API + "/gsi/client" } };
const STATE = "abcdefghijklmnop1234";
const LOGIN = (lang = "ko") => SITE + "/login/?port=" + PLUGIN_PORT + "&state=" + STATE + "&h=rhino&lang=" + lang;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url) {
  for (let i = 0; i < 100; i++) { try { await fetch(url); return; } catch { await sleep(100); } }
  throw new Error("서버가 뜨지 않음: " + url);
}

// ── 서버·크롬 ──
const server = spawn("python3", [join(HERE, "fake_firebase.py")], { stdio: ["ignore", "ignore", "inherit"] });
const profile = mkdtempSync(join(tmpdir(), "gorani-e2e-"));   // 사용자 Chrome 프로필과 따로
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + DEBUG_PORT, "--user-data-dir=" + profile, "--no-first-run",
  "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
function cleanup() { chrome.kill(); server.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
process.on("exit", cleanup);

await waitHttp(API + "/__db");
await waitHttp("http://127.0.0.1:" + DEBUG_PORT + "/json/version");
const target = (await (await fetch("http://127.0.0.1:" + DEBUG_PORT + "/json/list")).json()).find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const waiting = new Map(), problems = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") problems.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(m.params.args.map((a) => a.value || a.description).join(" "));
});
function cdp(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => waiting.set(id, r)).then((m) => { if (m.error) throw new Error(method + ": " + m.error.message); return m.result; });
}
async function js(expression) {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(expression + " → " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expression, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await js(expression)) return; } catch {} await sleep(100); }
  throw new Error("기다리다 끝남: " + expression);
}
async function go(url) { await cdp("Page.navigate", { url }); await sleep(200); await waitFor("document.readyState === 'complete'"); }
const click = (selector) => js("document.querySelector(" + JSON.stringify(selector) + ").click(), true");
const text = (selector) => js("(document.querySelector(" + JSON.stringify(selector) + ") || {}).textContent || ''");
const api = async (path, method = "GET") => (await fetch(API + path, { method })).json();
const setTest = (test) => js("localStorage.setItem('gorani_account_test', " + JSON.stringify(JSON.stringify(test)) + "), localStorage.removeItem('gorani_session'), true");
async function shot(name, width = 520, height = 560) {
  if (!SHOTS) return;
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
  await sleep(400);
  const r = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 82 });
  const file = join(ROOT, ".github", "pr", name + ".jpg");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(r.data, "base64"));
  await cdp("Emulation.clearDeviceMetricsOverride");
}

let failed = 0;
function ok(cond, name) { console.log((cond ? "ok   " : "FAIL ") + name); if (!cond) failed++; }

await cdp("Page.enable");
await cdp("Runtime.enable");
await go(SITE + "/");
await setTest(TEST);   // 시험 주소 — 페이지는 localhost·127.0.0.1에서만 읽는다

// 1. 처음 로그인 → 127.0.0.1에 state·열쇠를 폼 POST → 완료(ok=1)
await go(LOGIN());
await waitFor("!!document.getElementById('fake-gis')");
await click("#fake-gis");
await waitFor("location.pathname === '/login/done/'");
let rec = await api("/__received");
ok(rec.length === 1 && rec[0].state === STATE && rec[0].refresh_token && !rec[0].error, "로그인 → state·refresh_token을 폼 POST");
ok(await text("#title") === "로그인했습니다", "완료 화면(ok=1)");

// 2. 이 브라우저에 남은 로그인 → '이 계정으로 계속' → 열쇠를 갱신해 넘긴다
await go(LOGIN());
await waitFor("!!document.querySelector('.again')");
ok((await text(".again")).includes("member@example.com"), "남은 로그인 단추");
await click(".again");
await waitFor("location.pathname === '/login/done/'");
rec = await api("/__received");
ok(rec.length === 2 && rec[1].refresh_token && !rec[1].error, "계속 → 열쇠 POST");

// 3. 확실한 거절(사용 중지) — 넘기지 않고 실패 글, 남은 로그인은 지운다
await api("/__set?disable=member@example.com", "POST");
await go(LOGIN());
await waitFor("!!document.querySelector('.again')");
await click(".again");
await waitFor("document.getElementById('msg').classList.contains('err')");
rec = await api("/__received");
ok(rec.length === 2, "사용 중지 → 넘기지 않음(계속 단추)");
ok(!(await js("localStorage.getItem('gorani_session')")), "사용 중지 → 남은 로그인 지움");
await waitFor("!!document.getElementById('fake-gis')");
await click("#fake-gis");
await waitFor("document.getElementById('msg').textContent.indexOf('로그인하지 못했습니다') >= 0");
ok((await api("/__received")).length === 2, "사용 중지 → 넘기지 않음(구글 단추)");

// 4. 고장 — signInWithIdp 500 → error=service → 완료 화면 '풀 뜯으러'
await api("/__reset", "POST");
await api("/__set?fail_signin=1", "POST");
await go(LOGIN());
await waitFor("!!document.getElementById('fake-gis')");
await click("#fake-gis");
await waitFor("location.pathname === '/login/done/'");
rec = await api("/__received");
ok(rec.length === 1 && rec[0].error === "service" && !rec[0].refresh_token && rec[0].state === STATE, "Firebase 고장 → error=service");
ok((await text("#title")) === "로그인 서버가 풀 뜯으러 갔습니다", "완료 화면(fallback=1)");
await shot("login/web_done_fallback_ko");

// 5. 고장 — 구글 버튼 스크립트를 못 받음(차단·접속 안 됨)
await api("/__reset", "POST");
await go(SITE + "/");
await setTest({ ...TEST, urls: { ...TEST.urls, gis: API + "/nope.js" } });
await go(LOGIN("en"));
await waitFor("location.pathname === '/login/done/'");
rec = await api("/__received");
ok(rec.length === 1 && rec[0].error === "service", "구글 버튼 못 받음 → error=service");

// 6. 설정 전(키 없음)도 우리 쪽 고장 → error=service
await api("/__reset", "POST");
await go(SITE + "/");
await setTest({ ...TEST, apiKey: "" });
await go(LOGIN());
await waitFor("location.pathname === '/login/done/'");
ok((await api("/__received"))[0]?.error === "service", "키 없음 → error=service");

// 7. 영어 완료 화면(fallback)
await go(SITE + "/login/done/?fallback=1&lang=en&h=rhino");
ok((await text("#title")) === "The sign-in server wandered off to graze", "완료 화면 영어(fallback=1)");
await shot("login/web_done_fallback_en");

// 8. 플러그인 밖에서 열면 넘기지 않는다
await go(SITE + "/");
await setTest(TEST);
await go(SITE + "/login/?port=80&state=x&h=rhino&lang=ko");
ok((await text("#title")) === "잘못된 링크입니다" && (await text("#sub")).indexOf("다시 눌러") >= 0, "잘못된 port·state → 넘기지 않음(잘못된 링크 화면)");

const realProblems = problems.filter((p) => !/nope\.js|Failed to load resource/.test(p));
ok(realProblems.length === 0, "콘솔 오류 없음" + (realProblems.length ? ": " + realProblems.join(" | ") : ""));
console.log(failed ? failed + "개 실패" : "모두 통과");
ws.close();
cleanup();
process.exit(failed ? 1 : 0);
