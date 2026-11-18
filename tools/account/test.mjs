// 회원 API 시험 — node tools/account/test.mjs. Code.gs를 가짜 구글 서비스(시트·캐시·tokeninfo) 위에서 돌린다.
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";

function makeContext() {
  const sheets = {};
  class Range {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
    getValues() {   // 시트처럼 맨 앞 '(글로 적기 표시)는 값에서 빠진다
      const at = (i, j) => (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j] ?? "";
      return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => { const v = at(i, j); return typeof v === "string" && v[0] === "'" ? v.slice(1) : v; }));
    }
    setValues(values) {
      values.forEach((row, i) => row.forEach((v, j) => { const d = this.sheet.data; while (d.length < this.r + i) d.push([]); d[this.r - 1 + i][this.c - 1 + j] = v; }));
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    setFontWeight() { return this; }
  }
  class Sheet {
    constructor() { this.data = []; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getLastRow() { return this.data.length; }
    getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
    appendRow(row) { this.data.push(row.slice()); }
    deleteRow(r) { this.data.splice(r - 1, 1); }
    setFrozenRows() {}
  }
  const cache = new Map();
  const props = { GOOGLE_CLIENT_ID: "client-1" };
  const idTokens = {};   // id_token → tokeninfo 응답
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (t) => sheets[t] || null, insertSheet: (t) => (sheets[t] = new Sheet()) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null }) },
    UrlFetchApp: {
      fetch: (url) => {
        const info = idTokens[decodeURIComponent(url.split("id_token=")[1])];
        return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || { error: "invalid_token" }) };
      },
    },
    Utilities: {
      getUuid: () => randomUUID(),
      computeDigest: (_alg, text) => Array.from(createHash("sha256").update(text, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),   // 자바 byte처럼 부호 있음
      DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
      formatDate: (d) => d.toISOString(),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./Code.gs", import.meta.url), "utf8") + "\n;globalThis.__actions = ACTIONS;", ctx);
  const call = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);
  const rows = (tab) => sheets[tab] ? sheets[tab].data.slice(1) : [];
  const head = (tab) => sheets[tab].data[0];
  const cell = (tab, rowIndex, name) => rows(tab)[rowIndex][head(tab).indexOf(name)];
  const setCell = (tab, rowIndex, name, v) => { sheets[tab].data[rowIndex + 1][head(tab).indexOf(name)] = v; };
  const google = (token, sub, email, extra = {}) => { idTokens[token] = { aud: "client-1", iss: "https://accounts.google.com", email_verified: "true", exp: String(Date.now() / 1000 + 600), sub, email, ...extra }; };
  // 회원 하나 + 플러그인 연결 — {session, token(host마다)}
  const member = (sub, email, hosts = ["rhino"]) => {
    google("id-" + sub, sub, email);
    const { session } = call({ action: "login", id_token: "id-" + sub });
    const tokens = {};
    for (const h of hosts) tokens[h] = call({ action: "claim", grant: call({ action: "grant", session, host: h }).grant, version: "0.4.1" }).token;
    return { session, ...tokens };
  };
  return { ctx, call, rows, cell, setCell, cache, props, google, member, sheets };
}

// 플러그인이 보내는 생성 기록 하나(entry)
const entry = (id, extra = {}) => ({ entry_id: id, built_at: "2026-11-18T05:00:00Z", label: "성수동2가 333-139", address: { ko: "서울특별시 성동구 성수동2가 333-139", en: "333-139 Seongsu-dong 2-ga, Seongdong-gu, Seoul" }, mode: "lots", center: [127.0565, 37.5445],
  pnus: ["1120011500103330139"], shape: "rect", radius: 250, detail: "advanced", options: { terrain_step: 2, flatten_site: false }, buildings: 312,
  made_2d: { basemap: "A3", sheets: 3 }, ...extra });

const tests = {
  "설정 전에는 login이 not_configured"() {
    const t = makeContext();
    delete t.props.GOOGLE_CLIENT_ID;
    assert.equal(JSON.parse(t.ctx.doGet().s).configured, false);
    t.google("tok", "s1", "a@x.com");
    assert.equal(t.call({ action: "login", id_token: "tok" }).error, "not_configured");
  },
  "가입 = 로그인 한 번, 두 번째는 new:false, 메일이 바뀌면 따라감"() {
    const t = makeContext();
    t.ctx.setup();
    t.google("tok", "s1", "A@X.com");
    const first = t.call({ action: "login", id_token: "tok", terms_v: "2026-11-16", source: { utm_source: "ig", utm_medium: "=social" } });
    assert.equal(first.ok, true);
    assert.equal(first.user.new, true);
    assert.equal(first.user.email, "a@x.com");
    assert.deepEqual(first.entitlement, { plan: "free", plan_name: "Member", features: ["detail_advanced", "history_sync"], valid_until: "" });
    assert.equal(t.rows("회원").length, 1);
    assert.equal(t.cell("회원", 0, "가입 경로"), "ig|=social||");   // 가운데 칸이라 그대로 — 맨 앞 =만 막는다
    t.google("tok2", "s1", "b@x.com");
    const second = t.call({ action: "login", id_token: "tok2" });
    assert.equal(second.user.new, false);
    assert.equal(t.cell("회원", 0, "email"), "b@x.com");
    assert.equal(t.rows("회원").length, 1);
    assert.equal(t.rows("기록").filter((r) => r[1] === "가입").length, 1);
  },
  "가짜·만료·다른 클라이언트·메일 미확인 ID 토큰은 invalid"() {
    const t = makeContext();
    assert.equal(t.call({ action: "login", id_token: "nope" }).error, "invalid");
    t.google("old", "s1", "a@x.com", { exp: String(Date.now() / 1000 - 10) });
    t.google("aud", "s1", "a@x.com", { aud: "other" });
    t.google("unv", "s1", "a@x.com", { email_verified: "false" });
    t.google("iss", "s1", "a@x.com", { iss: "evil.example" });
    for (const tok of ["old", "aud", "unv", "iss"]) assert.equal(t.call({ action: "login", id_token: tok }).error, "invalid", tok);
    assert.equal(t.rows("회원").length, 0);
  },
  "교환권 → claim 한 번, 두 번째는 invalid. me는 플러그인 열쇠로"() {
    const t = makeContext();
    t.google("tok", "s1", "a@x.com");
    const { session } = t.call({ action: "login", id_token: "tok" });
    assert.equal(t.call({ action: "grant", host: "rhino" }).error, "invalid");
    assert.equal(t.call({ action: "grant", session, host: "web" }).error, "invalid_host");
    assert.equal(t.call({ action: "grant", session, host: "blender" }).error, "invalid_host");
    const { grant } = t.call({ action: "grant", session, host: "rhino" });
    assert.match(grant, /^[0-9a-f]{64}$/);
    const claimed = t.call({ action: "claim", grant, version: "0.4.0" });
    assert.equal(claimed.ok, true);
    assert.equal(claimed.email, "a@x.com");
    assert.equal(t.call({ action: "claim", grant }).error, "invalid");
    const me = t.call({ action: "me", token: claimed.token });
    assert.equal(me.ok, true);
    assert.deepEqual(me.entitlement.features, ["detail_advanced", "history_sync"]);
    assert.equal(t.call({ action: "me", token: "garbage" }).error, "invalid");
    const hashes = t.rows("연결").map((r) => r[0]);
    assert.ok(!hashes.includes(claimed.token) && !hashes.includes(session), "시트에는 열쇠 원문이 없다");
    assert.equal(t.rows("연결").find((r) => r[3] === "rhino")[4], "0.4.0");
  },
  "웹 세션으로는 플러그인 전용 일을 못 하고, 플러그인 열쇠로는 탈퇴를 못 한다"() {
    const t = makeContext();
    t.google("tok", "s1", "a@x.com");
    const { session } = t.call({ action: "login", id_token: "tok" });
    const { token } = t.call({ action: "claim", grant: t.call({ action: "grant", session, host: "sketchup" }).grant });
    assert.equal(t.call({ action: "delete", token }).error, "invalid");
    assert.equal(t.call({ action: "grant", session: token, host: "rhino" }).error, "invalid");
    assert.equal(t.call({ action: "me", session }).ok, true);
  },
  "권한 = 이용권 기능 + 더한 기능 − 뺀 기능, 기한 지나면 free, 막히면 손님"() {
    const t = makeContext();
    t.ctx.setup();
    t.ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName("이용권").appendRow(["pro", "Pro", "detail_advanced, laser_cut", ""]);
    t.google("tok", "s1", "a@x.com");
    const { session } = t.call({ action: "login", id_token: "tok" });
    t.setCell("회원", 0, "extra_features", "stl_export");
    t.setCell("회원", 0, "removed_features", "detail_advanced");
    assert.deepEqual(t.call({ action: "me", session }).entitlement.features, ["history_sync", "stl_export"]);
    t.setCell("회원", 0, "extra_features", "");
    t.setCell("회원", 0, "removed_features", "");
    t.setCell("회원", 0, "plan", "pro");
    t.setCell("회원", 0, "plan_until", new Date(Date.now() + 86400000));
    let e = t.call({ action: "me", session }).entitlement;
    assert.equal(e.plan_name, "Pro");
    assert.deepEqual(e.features, ["detail_advanced", "laser_cut"]);
    assert.ok(e.valid_until);
    t.setCell("회원", 0, "plan_until", new Date(Date.now() - 86400000));
    e = t.call({ action: "me", session }).entitlement;
    assert.equal(e.plan, "free");
    assert.equal(e.valid_until, "");
    t.setCell("회원", 0, "status", "blocked");
    assert.deepEqual(t.call({ action: "me", session }).entitlement, { plan: "guest", plan_name: "Guest", features: [], valid_until: "" });
  },
  "로그아웃은 그 연결만, 세션으로 다른 연결(token_id)도"() {
    const t = makeContext();
    t.google("tok", "s1", "a@x.com");
    const { session } = t.call({ action: "login", id_token: "tok" });
    const a = t.call({ action: "claim", grant: t.call({ action: "grant", session, host: "rhino" }).grant }).token;
    const b = t.call({ action: "claim", grant: t.call({ action: "grant", session, host: "archicad" }).grant }).token;
    assert.equal(t.call({ action: "logout", token: a }).ok, true);
    assert.equal(t.call({ action: "me", token: a }).error, "invalid");
    assert.equal(t.call({ action: "me", token: b }).ok, true);
    const idB = t.rows("연결").find((r) => r[3] === "archicad")[1];
    assert.equal(t.call({ action: "logout", session, token_id: idB }).ok, true);
    assert.equal(t.call({ action: "me", token: b }).error, "invalid");
    t.google("tok3", "s2", "c@x.com");
    const other = t.call({ action: "login", id_token: "tok3" }).session;
    const idSession = t.rows("연결").find((r) => r[3] === "web")[1];
    assert.equal(t.call({ action: "logout", session: other, token_id: idSession }).error, "invalid", "남의 연결은 못 끊는다");
  },
  "탈퇴하면 회원 줄과 연결이 모두 지워지고, 남은 교환권도 못 쓴다"() {
    const t = makeContext();
    t.google("tok", "s1", "a@x.com");
    t.google("tok2", "s2", "b@x.com");
    const { session } = t.call({ action: "login", id_token: "tok" });
    t.call({ action: "login", id_token: "tok2" });
    const token = t.call({ action: "claim", grant: t.call({ action: "grant", session, host: "rhino" }).grant }).token;
    const grant = t.call({ action: "grant", session, host: "rhino" }).grant;
    assert.equal(t.call({ action: "delete", session }).ok, true);
    assert.equal(t.rows("회원").length, 1);
    assert.equal(t.rows("회원")[0][2], "b@x.com");
    assert.equal(t.rows("연결").filter((r) => r[3] !== "web").length, 0);
    assert.equal(t.call({ action: "me", token }).error, "invalid");
    assert.equal(t.call({ action: "claim", grant }).error, "invalid");
  },
  "같은 사람 1분에 10번 넘게 로그인하면 too_fast"() {
    const t = makeContext();
    t.google("tok", "s1", "a@x.com");
    for (let i = 0; i < 10; i++) assert.equal(t.call({ action: "login", id_token: "tok" }).ok, true);
    assert.equal(t.call({ action: "login", id_token: "tok" }).error, "too_fast");
  },
  "생성 기록: 플러그인 열쇠로 남기고, 프로그램은 열쇠로 정해지며, 웹·플러그인 모두 읽는다"() {
    const t = makeContext();
    t.ctx.setup();
    const m = t.member("s1", "a@x.com", ["rhino", "sketchup"]);
    assert.equal(t.call({ action: "history_add", session: m.session, entry: entry("e-rhino-0001") }).error, "invalid", "웹 세션은 기록을 만들지 않는다");
    assert.equal(t.call({ action: "history_add", token: m.rhino, entry: entry("e-rhino-0001", { host: "archicad" }) }).ok, true);
    assert.equal(t.call({ action: "history_add", token: m.sketchup, entry: entry("e-skp-00001", { built_at: "2026-11-18T06:00:00Z", detail: "basic" }) }).ok, true);
    assert.equal(t.call({ action: "history_add", token: m.rhino, entry: entry("bad id!") }).error, "invalid_entry");
    const list = t.call({ action: "history_list", session: m.session });
    assert.equal(list.on, true);
    assert.equal(list.available, true);
    assert.deepEqual(list.items.map((i) => [i.id, i.host]), [["e-skp-00001", "sketchup"], ["e-rhino-0001", "rhino"]], "최근 것 먼저, host는 보낸 값이 아니라 열쇠");
    const it = list.items[1];
    assert.deepEqual(it.center, [127.0565, 37.5445]);
    assert.deepEqual(it.address, { ko: "서울특별시 성동구 성수동2가 333-139", en: "333-139 Seongsu-dong 2-ga, Seongdong-gu, Seoul" });
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-plain-0001", { address: "Dogenzaka, Shibuya, Tokyo" }) });
    assert.deepEqual(t.call({ action: "history_list", token: m.rhino }).items.find((i) => i.id === "e-plain-0001").address,
      { ko: "Dogenzaka, Shibuya, Tokyo", en: "" }, "글 하나만 오면 '주소' 칸에(이전 꼴)");
    assert.deepEqual(it.target, { pnus: ["1120011500103330139"] });
    assert.equal(it.shape, "rect");
    assert.equal(it.radius, 250);
    assert.equal(it.detail, "advanced");
    assert.equal(it.version, "0.4.1");
    assert.equal(it.buildings, 312);
    assert.deepEqual(it.made_2d, { basemap: "A3", sheets: 3 });
    assert.ok(!("token_id" in it), "어느 PC인지는 화면에 내보내지 않는다");
    assert.deepEqual(t.call({ action: "history_list", token: m.sketchup, host: "rhino" }).items.map((i) => i.id).sort(), ["e-plain-0001", "e-rhino-0001"], "host로 거르기");
  },
  "생성 기록: 경로·수식·모르는 칸은 버리고 크기를 자른다"() {
    const t = makeContext();
    const m = t.member("s1", "a@x.com");
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-clean-001", {
      label: "=HYPERLINK(\"x\")" + "가".repeat(200), address: { ko: "+82 " + "길".repeat(300), en: "x".repeat(300) }, center: [500, 37], ring: [[127, 37], [127.001, 37], [127.001, 37.001], ["x", 1]],
      shape: "hexagon", detail: "ultra", buildings: -3,
      options: { terrain_step: 1, result_dir: "/Users/kim/Gorani/result", win: "C:\\Users\\kim", "bad key": 1, nested: { a: 1 }, paper: "A3" },
    }) });
    const it = t.call({ action: "history_list", token: m.rhino }).items[0];
    assert.equal(it.label.length, 80);
    assert.equal(it.address.ko.length, 120);
    assert.equal(it.address.en.length, 120);
    assert.equal(t.cell("생성 기록", 0, "주소")[0], "'", "주소도 수식으로 읽히지 않게");
    assert.equal(t.cell("생성 기록", 0, "이름")[0], "'", "수식으로 읽히지 않게");
    assert.equal(it.center, null);
    assert.deepEqual(it.target, { pnus: ["1120011500103330139"], ring: [[127, 37], [127.001, 37], [127.001, 37.001]] });
    assert.equal(it.shape, "");
    assert.equal(it.detail, "");
    assert.equal(it.buildings, null);
    assert.deepEqual(it.options, { terrain_step: 1, paper: "A3" });
  },
  "생성 기록: 같은 entry_id는 합치고 즐겨찾기·바꾼 이름은 지킨다, 남의 기록은 못 고친다"() {
    const t = makeContext();
    const m = t.member("s1", "a@x.com");
    const other = t.member("s2", "b@x.com");
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-same-0001") });
    assert.equal(t.call({ action: "history_update", session: m.session, id: "e-same-0001", label: "우리 대지", star: true }).item.star, true);
    assert.equal(t.call({ action: "history_update", session: other.session, id: "e-same-0001", star: false }).error, "invalid");
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-same-0001", { buildings: 400, label: "다시 보낸 이름" }) });
    const items = t.call({ action: "history_list", session: m.session }).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].buildings, 400);
    assert.equal(items[0].label, "우리 대지");
    assert.equal(items[0].star, true);
    assert.ok(items[0].edited);
    assert.equal(t.call({ action: "history_update", session: m.session, id: "e-same-0001", label: "   " }).item.label, "우리 대지", "빈 이름은 무시");
  },
  "생성 기록: 지우기 — 하나, 프로그램 전부, 전부. 남의 것은 못 지운다"() {
    const t = makeContext();
    const m = t.member("s1", "a@x.com", ["rhino", "archicad"]);
    const other = t.member("s2", "b@x.com");
    ["e-r-000001", "e-r-000002"].forEach((id) => t.call({ action: "history_add", token: m.rhino, entry: entry(id) }));
    ["e-a-000001", "e-a-000002"].forEach((id) => t.call({ action: "history_add", token: m.archicad, entry: entry(id) }));
    t.call({ action: "history_add", token: other.rhino, entry: entry("e-o-000001") });
    assert.equal(t.call({ action: "history_delete", session: other.session, id: "e-r-000001" }).error, "invalid");
    assert.equal(t.call({ action: "history_delete", session: m.session, id: "e-r-000001" }).deleted, 1);
    assert.equal(t.call({ action: "history_delete", session: m.session, all: true, host: "archicad" }).deleted, 2);
    assert.deepEqual(t.call({ action: "history_list", session: m.session }).items.map((i) => i.id), ["e-r-000002"]);
    assert.equal(t.call({ action: "history_delete", session: m.session, all: true }).deleted, 1);
    assert.equal(t.rows("생성 기록").length, 1, "남의 기록은 남는다");
  },
  "생성 기록: 끄면 off(남기지 않음), clear면 지움, 다시 켜면 남김"() {
    const t = makeContext();
    const m = t.member("s1", "a@x.com");
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-sync-0001") });
    assert.equal(t.call({ action: "set_history_sync", session: m.session, on: false }).on, false);
    assert.equal(t.call({ action: "me", token: m.rhino }).history, false);
    assert.deepEqual(t.call({ action: "history_add", token: m.rhino, entry: entry("e-sync-0002") }), { ok: true, off: true });
    assert.equal(t.call({ action: "history_list", session: m.session }).items.length, 1, "끄기만 하면 남은 기록은 그대로");
    t.call({ action: "set_history_sync", session: m.session, on: false, clear: true });
    assert.equal(t.call({ action: "history_list", session: m.session }).items.length, 0);
    t.call({ action: "set_history_sync", session: m.session, on: true });
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-sync-0003") });
    assert.equal(t.call({ action: "history_list", session: m.session }).on, true);
    assert.equal(t.call({ action: "history_list", session: m.session }).items.length, 1);
  },
  "생성 기록: 기능(history_sync)이 없으면 남기지 못하지만 읽고 지우기는 된다"() {
    const t = makeContext();
    const m = t.member("s1", "a@x.com");
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-feat-0001") });
    t.setCell("회원", 0, "removed_features", "history_sync");
    assert.equal(t.call({ action: "history_add", token: m.rhino, entry: entry("e-feat-0002") }).error, "no_feature");
    const list = t.call({ action: "history_list", session: m.session });
    assert.equal(list.available, false);
    assert.equal(list.items.length, 1);
    assert.equal(t.call({ action: "history_delete", session: m.session, id: "e-feat-0001" }).ok, true);
  },
  "생성 기록: 계정당 300개 — 오래된 것부터 지우고 즐겨찾기는 남긴다"() {
    const t = makeContext();
    const m = t.member("s1", "a@x.com");
    const at = (i) => new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString();
    // 시트에 바로 299줄을 넣고(요청 한도를 피하려고) 300·301번째는 API로
    const head = t.sheets["생성 기록"] ? null : t.call({ action: "history_add", token: m.rhino, entry: entry("e-0000000000", { built_at: at(0) }) });
    const sheet = t.sheets["생성 기록"];
    const tmpl = sheet.data[1];
    const col = (name) => sheet.data[0].indexOf(name);
    for (let i = 1; i < 300; i++) { const r = tmpl.slice(); r[col("entry_id")] = "e-" + String(i).padStart(10, "0"); r[col("만든 시각")] = new Date(at(i)); sheet.data.push(r); }
    assert.ok(head && t.rows("생성 기록").length === 300);
    t.call({ action: "history_update", session: m.session, id: "e-0000000000", star: true });
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-new-000001", { built_at: at(400) }) });
    const ids = t.call({ action: "history_list", session: m.session }).items.map((i) => i.id);
    assert.equal(ids.length, 300);
    assert.ok(ids.includes("e-0000000000"), "즐겨찾기는 가장 오래돼도 남는다");
    assert.ok(!ids.includes("e-0000000001"), "즐겨찾기가 아닌 가장 오래된 것이 빠진다");
    assert.ok(ids.includes("e-new-000001"));
  },
  "웹 me: 가입일과 연결된 프로그램(웹 세션 빼고), 탈퇴하면 생성 기록도 지운다"() {
    const t = makeContext();
    const m = t.member("s1", "a@x.com", ["rhino", "archicad"]);
    const me = t.call({ action: "me", session: m.session });
    assert.ok(me.created);
    assert.equal(me.history, true);
    assert.deepEqual(me.connections.map((c) => [c.host, c.version]), [["rhino", "0.4.1"], ["archicad", "0.4.1"]]);
    assert.match(me.connections[0].id, /^[0-9a-f]{16}$/);
    assert.equal(t.call({ action: "me", token: m.rhino }).connections, undefined, "플러그인에는 연결 목록을 주지 않는다");
    t.call({ action: "history_add", token: m.rhino, entry: entry("e-bye-00001") });
    assert.equal(t.call({ action: "delete", session: m.session }).ok, true);
    assert.equal(t.rows("생성 기록").length, 0);
  },
  "setup을 다시 돌리면 예전 탭에 새 칸(기록 저장)만 더한다"() {
    const t = makeContext();
    const book = t.ctx.SpreadsheetApp.getActiveSpreadsheet();
    const old = book.insertSheet("회원");
    old.appendRow(["user_id", "google_sub", "email", "plan", "status", "메모"]);
    old.appendRow(["u1", "s1", "a@x.com", "free", "active", "VIP"]);
    t.ctx.setup();
    assert.deepEqual(old.data[0].slice(0, 6), ["user_id", "google_sub", "email", "plan", "status", "메모"]);
    assert.ok(old.data[0].includes("기록 저장"));
    assert.equal(old.data[1][5], "VIP");
    assert.ok(t.sheets["생성 기록"]);
  },
  "모르는 action·깨진 본문"() {
    const t = makeContext();
    t.ctx.console = { error() {} };   // 깨진 본문의 예외 기록은 조용히
    assert.equal(t.call({ action: "drop_tables" }).error, "unknown_action");
    assert.equal(JSON.parse(t.ctx.doPost({ postData: { contents: "{" } }).s).error, "server");
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log("ok  ", name); } catch (err) { failed++; console.log("FAIL", name, "\n     ", err.message); }
}
console.log(failed ? `${failed} failed` : `all ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
