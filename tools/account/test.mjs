// 회원 API 시험 — node tools/account/test.mjs. Code.gs를 가짜 구글 서비스(시트·캐시·tokeninfo) 위에서 돌린다.
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";

function makeContext() {
  const sheets = {};
  class Range {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
    getValues() {
      return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j] ?? ""));
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
  return { ctx, call, rows, cell, setCell, cache, props, google };
}

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
    assert.deepEqual(first.entitlement, { plan: "free", plan_name: "Member", features: ["detail_advanced"], valid_until: "" });
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
    assert.deepEqual(me.entitlement.features, ["detail_advanced"]);
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
    assert.deepEqual(t.call({ action: "me", session }).entitlement.features, ["stl_export"]);
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
