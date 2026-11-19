// 로그인·계정 페이지 끝-끝 시험 — 헤드리스 크롬(CDP) + 가짜 Firebase(fake_firebase.py). 시험 전용, 의존 없음(Node 22+의 WebSocket·fetch)
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
async function shot(name, width = 520, height = 560, scale = 2) {
  if (!SHOTS) return;
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
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
ok(await text("#title") === "로그인 완료" && (await text("#sub")).includes("Rhino로"), "완료 화면(ok=1)");

// 2. 이 브라우저에 남은 로그인 → '…(으)로 계속' → 열쇠를 갱신해 넘긴다
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
ok((await text("#title")) === "로그인 서버가 풀 뜯으러 갔습니다" && (await text("#sub")).includes("Rhino로 돌아가"), "완료 화면(fallback=1, 프로그램 이름)");
await shot("account/plugin_done_fallback_ko", 640, 496, 1);

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
await go(SITE + "/login/done/?fallback=1&lang=en&h=sketchup");
ok((await text("#title")) === "The sign-in server wandered off to graze" && (await text("#sub")).includes("SketchUp"), "완료 화면 영어(fallback=1)");

// 8. 플러그인 밖에서 열면 넘기지 않는다
await go(SITE + "/");
await setTest(TEST);
await go(SITE + "/login/?port=80&state=x&h=rhino&lang=ko");
ok((await text("#msg")).indexOf("열어 주세요") >= 0, "잘못된 port·state → 넘기지 않음");


// ── 계정 페이지 ──
await api("/__reset", "POST");
await go(SITE + "/");
await setTest(TEST);
await go(SITE + "/account/?lang=ko");
await waitFor("!document.getElementById('signin').hidden && !!document.getElementById('fake-gis')");
await click("#fake-gis");
await waitFor("!document.getElementById('dash').hidden");
ok((await text("#email")) === "member@example.com" && (await text("#plan")) === "Member", "계정 페이지 로그인 → 메일·이용권");
const now = Date.now(), A1 = "20261119010000-aaaaaa", A2 = "20261119020000-bbbbbb";
await js(`Promise.all([   // 플러그인처럼 기록·연결을 쓴다(account.js의 db — 쓰기 경로도 함께 시험)
  GoraniAccount.db("history/${A1}", "PUT", {built_at: ${now - 3600e3}, host: "rhino", version: "0.4.0", label: "성수동 대지", address: "서울 성동구 성수동2가 277-17",
    mode: "lots", center: [127.056, 37.544], target: JSON.stringify({pnus: ["1120011400102770017"]}), shape: "rect", radius: 500, detail: "advanced",
    options: JSON.stringify({terrain_step: 0}), buildings: 812, made_2d: JSON.stringify({sheets: 3})}),
  GoraniAccount.db("history/${A2}", "PUT", {built_at: ${now - 1800e3}, host: "sketchup", version: "0.4.0", label: "", address: "", mode: "point",
    center: [139.7, 35.68], target: "{}", shape: "circle", radius: 300, detail: "basic", options: "{}", buildings: 120}),
  GoraniAccount.db("connections/c1", "PUT", {host: "rhino", version: "0.4.0", os: "mac", created: ${now - 86400e3}, seen: ${now}}),
  GoraniAccount.db("connections/c2", "PUT", {host: "sketchup", version: "0.4.0", os: "win", created: ${now - 86400e3}, seen: ${now - 3600e3}})
]).then(() => true)`);
const uid = Object.keys((await api("/__db")).db.users)[0];
const userDb = async () => (await api("/__db")).db.users?.[uid];
ok(!(await js(`GoraniAccount.db("history/x", "PUT", {label: "built_at 없음"}).then(() => true, () => false)`)), "규칙 — built_at·host 없는 기록은 막힘");
await go(SITE + "/account/?lang=ko");
await waitFor("document.querySelectorAll('#hist li[data-id]').length === 2");
ok((await text("#tab-rhino .n")) === "1" && (await text("#tab-sketchup .n")) === "1" && (await text("#tab-all .n")) === "2", "프로그램별 탭 수");
ok((await js("document.querySelector('#hist li').getAttribute('data-id')")) === A2, "최근 것 먼저(built_at)");
await click(`#hist li[data-id="${A1}"] .open`);
await waitFor("!!document.querySelector('#hist .detail')");
const facts = await text("#hist .detail");
ok(facts.includes("필지 1120011400102770017") && facts.includes("고급 모델") && facts.includes("다이어그램 3장") && facts.includes("지형 매끈"), "펼친 기록 — JSON 글(대상·3D 설정·2D)을 풀어 보임");
await click(`#hist li[data-id="${A1}"] .star`);
await sleep(500);
ok((await userDb()).history[A1].star === true, "즐겨찾기 → RTDB star");
await click(`#hist li[data-id="${A1}"] .edit`);
await waitFor("!!document.querySelector('.rename input')");
await js("document.querySelector('.rename input').value = '새 이름', document.querySelector('.rename').requestSubmit(), true");
await sleep(500);
ok((await userDb()).history[A1].label === "새 이름", "이름 바꾸기 → RTDB label");
await js(`GoraniAccount.db("history/${A2}", "DELETE").then(() => true)`);   // 다른 기기에서 지운 기록
await click(`#hist li[data-id="${A2}"] .star`);
await waitFor("document.querySelectorAll('#hist li[data-id]').length === 1");
ok(!(await js("document.getElementById('dash').hidden")) && !(await userDb()).history[A2], "없는 기록 → 규칙에 막혀 다시 불러옴(로그아웃 아님)");
ok((await js("document.querySelectorAll('#conns li[data-conn]').length")) === 2, "연결된 프로그램 둘");
await click('#conns li[data-conn="c2"] [data-act=disconnect]');
await waitFor("document.getElementById('ask').open");
await click("#ask-ok");
await sleep(500);
let u = await userDb();
ok(!u.connections.c2 && !!u.connections.c1, "연결 해제 → RTDB에서 지움");
ok(!(await js("document.getElementById('sync')")), "기록 저장 끄기 단추 없음(늘 저장 — 2026-11-19 사용자)");
await click("#clear");
await waitFor("document.getElementById('ask').open");
await click("#ask-ok");
await sleep(600);
u = await userDb();
ok(!u.history && !u.settings, "생성 기록 삭제 → history 지움(설정 칸 없음)");
await go(SITE + "/");
await waitFor("!document.querySelector('.account-link').hidden");
ok(await js("document.querySelector('.account-link').classList.contains('signed-in')"), "홈 머리줄 — 로그인 표시");

// 탈퇴 — 로그인한 지 오래면 먼저 다시 로그인(그 전에는 아무것도 지우지 않는다), 같은 계정이면 이어서 지운다
await api("/__set?auth_back=400", "POST");
await go(SITE + "/account/?lang=ko");
await waitFor("!document.getElementById('dash').hidden");
await click("#logout");
await waitFor("!!document.getElementById('fake-gis')");
await click("#fake-gis");
await waitFor("!document.getElementById('dash').hidden");
await click("#del");
await waitFor("document.getElementById('ask').open");
await click("#ask-ok");
await waitFor("!document.getElementById('signin').hidden");
ok((await text("#si-msg")) === "탈퇴하려면 한 번 더 로그인해 주세요." && !!(await userDb()), "오래된 로그인 → 다시 로그인 먼저, 아직 지우지 않음");
await waitFor("!document.getElementById('toast').classList.contains('show')");   // 앞 로그인의 토스트가 사라진 뒤
await shot("account/signin_reauth_ko", 640, 433, 1);
await api("/__set?auth_back=0", "POST");
await waitFor("!!document.getElementById('fake-gis')");
await click("#fake-gis");
await waitFor("document.getElementById('si-msg').textContent === '탈퇴 완료'");
const after = await api("/__db");
ok(!after.db.users?.[uid] && !after.users[uid] && !(await js("localStorage.getItem('gorani_session')")), "탈퇴 → RTDB users/<uid>·계정·이 브라우저 로그인 지움");

const realProblems = problems.filter((p) => !/nope\.js|Failed to load resource/.test(p));
ok(realProblems.length === 0, "콘솔 오류 없음" + (realProblems.length ? ": " + realProblems.join(" | ") : ""));
console.log(failed ? failed + "개 실패" : "모두 통과");
ws.close();
cleanup();
process.exit(failed ? 1 : 0);
