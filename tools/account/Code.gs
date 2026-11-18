/**
 * 회원 API — 구글 로그인(gorani.site)과 Gorani 플러그인 연결을 구글 시트 하나로 관리한다.
 *
 * 시트(확장 프로그램 > Apps Script)에 붙여 웹 앱으로 배포한다. 절차·관리는 README.md.
 * 요청은 문의 폼처럼 text/plain POST(JSON 본문) — 미리 보내기가 없어 CORS 설정이 필요 없다.
 * 이용권(plan)·기능(feature)·권한(entitlement)을 나눈다: 플러그인은 기능 키만 보고, 계정이 쓸 기능은 여기서 계산한다.
 * 토큰·세션은 시트에 SHA-256만 적는다 — 시트가 새도 열쇠는 새지 않는다.
 * 생성 기록은 대상지·범위·설정만 받는다 — 3D·2D 파일, 폴더 경로, 컴퓨터 이름은 받지 않는다(처리방침 1번).
 */

const TABS = { members: '회원', plans: '이용권', tokens: '연결', history: '생성 기록', events: '기록' };
const MEMBER_HEADERS = ['user_id', 'google_sub', 'email', 'plan', 'status', 'plan_until', 'extra_features', 'removed_features',
  '가입일', 'terms_v', 'privacy_v', '가입 경로', '마지막 확인', '기록 저장', '메모'];
const PLAN_HEADERS = ['plan', '이름', 'features', '메모'];
const TOKEN_HEADERS = ['token_hash', 'token_id', 'user_id', 'host', '판', '만든 날', '마지막 확인'];
const HISTORY_HEADERS = ['user_id', 'entry_id', '만든 시각', 'token_id', 'host', '판', '이름', '주소', '주소 영어', '방식', '중심', '대상', '범위', '수준',
  '3D 설정', '건물 수', '2D 요약', '★', '고친 시각'];
const EVENT_HEADERS = ['날짜', '사건', 'host'];
const DEFAULT_PLANS = [['free', 'Member', 'detail_advanced, history_sync', '무료 로그인 회원 — 기본값']];   // setup이 이용권 탭에 넣는 줄, 탭에 없으면 이 값
const GUEST = { plan: 'guest', plan_name: 'Guest', features: [], valid_until: '' };   // 막힌 계정은 손님과 같다
const HOSTS = ['web', 'rhino', 'sketchup', 'archicad'];   // 연결 host — 목록 밖은 받지 않는다
const PLUGIN_HOSTS = HOSTS.slice(1);   // 생성 기록을 만드는 곳(web은 만들지 않는다). Blender판은 로그인이 없다
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const LIMITS = { grantSeconds: 300, perMinute: 10, historyPerMinute: 60, version: 40, source: 60, label: 80, address: 120, history: 300 };
const MODES = ['lots', 'area', 'point'], SHAPES = ['rect', 'circle'], LEVELS = ['basic', 'advanced'];

/** 요청 하나. 본문 {action, …}. 결과는 {ok:true, …} 또는 {ok:false, error}. */
function doPost(e) {
  try {
    const msg = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const handler = ACTIONS[msg.action];
    if (!handler) return reply_({ ok: false, error: 'unknown_action' });
    return reply_(handler(msg));
  } catch (err) {
    if (err && err.code) return reply_({ ok: false, error: err.code });   // fail_로 던진 것 — 정해진 오류 코드
    console.error(err);
    return reply_({ ok: false, error: 'server' });
  }
}

/** 배포 주소를 브라우저로 열었을 때 — 살아 있는지만 알려 준다. */
function doGet() {
  return reply_({ ok: true, service: 'gorani-account', configured: !!clientId_() });
}

const ACTIONS = {
  /** 웹 — 구글 ID 토큰 → 웹 세션. 처음이면 그 자리에서 회원 줄을 만든다(가입 = 로그인 한 번). */
  login: function (msg) {
    const google = verifyIdToken_(msg.id_token);
    limit_('login:' + google.sub);
    return withLock_(function () {
      const now = new Date();
      let member = findRow_(TABS.members, 'google_sub', google.sub);
      const isNew = !member;
      if (isNew) {
        const source = msg.source || {};
        const row = blank_(MEMBER_HEADERS);
        row.user_id = randomHex_(16);
        row.google_sub = google.sub;
        row.email = google.email;
        row.plan = 'free';
        row.status = 'active';
        row['가입일'] = now;
        row.terms_v = clean_(msg.terms_v, 20);
        row.privacy_v = clean_(msg.privacy_v, 20);
        row['가입 경로'] = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'].map(function (k) { return clean_(source[k], LIMITS.source); }).join('|').replace(/^\|+$/, '');
        row['마지막 확인'] = now;
        appendRow_(TABS.members, MEMBER_HEADERS, row);
        logEvent_('가입', 'web');
        member = findRow_(TABS.members, 'google_sub', google.sub);
      } else {
        update_(member, { email: google.email, '마지막 확인': now });   // 구글에서 메일을 바꿨으면 따라간다
      }
      const session = addToken_(member.values.user_id, 'web', '');
      return { ok: true, session: session, user: { email: google.email, created: iso_(member.values['가입일']), new: isNew },
        entitlement: entitlement_(member.values) };
    });
  },

  /** 웹 /login/ — 세션 → 일회용 교환권(5분, claim 한 번에 지운다). 플러그인 주소에는 열쇠가 아니라 이것이 실린다. */
  grant: function (msg) {
    const found = auth_(msg, ['web']);
    limit_('grant:' + found.member.values.user_id);
    const host = clean_(msg.host, 20);
    if (HOSTS.indexOf(host) < 1) throw fail_('invalid_host');   // web은 교환권을 받지 않는다
    const grant = randomHex_(32);
    CacheService.getScriptCache().put('grant:' + grant, JSON.stringify({ user_id: found.member.values.user_id, host: host }), LIMITS.grantSeconds);
    return { ok: true, grant: grant };
  },

  /** 플러그인 — 교환권 → 연결 열쇠와 권한. 교환권은 한 번만. */
  claim: function (msg) {
    const cache = CacheService.getScriptCache();
    const key = 'grant:' + clean_(msg.grant, 80);
    const raw = cache.get(key);
    if (!raw) throw fail_('invalid');
    cache.remove(key);
    const grant = JSON.parse(raw);
    return withLock_(function () {
      const member = findRow_(TABS.members, 'user_id', grant.user_id);
      if (!member) throw fail_('invalid');   // 교환권을 받은 뒤 탈퇴했다
      const token = addToken_(grant.user_id, grant.host, clean_(msg.version, LIMITS.version));
      logEvent_('연결', grant.host);
      return { ok: true, token: token, email: member.values.email, entitlement: entitlement_(member.values) };
    });
  },

  /** 플러그인(하루 1회)·웹 — 열쇠 확인 → 메일·지금 권한·생성 기록 저장 여부. 웹(계정 페이지)에는 가입일과 연결된 프로그램도. */
  me: function (msg) {
    const found = auth_(msg, HOSTS);
    withLock_(function () {
      const now = new Date();
      update_(found.token, { '마지막 확인': now });
      update_(found.member, { '마지막 확인': now });
    });
    const out = { ok: true, email: found.member.values.email, entitlement: entitlement_(found.member.values), history: historyOn_(found.member.values) };
    if (found.token.values.host === 'web') {
      out.created = iso_(found.member.values['가입일']);
      out.connections = readRows_(TABS.tokens).filter(function (r) { return String(r.values.user_id) === String(found.member.values.user_id) && r.values.host !== 'web'; })
        .map(function (r) { return { id: String(r.values.token_id), host: String(r.values.host), version: String(r.values['판'] || ''),
          created: iso_(r.values['만든 날']), seen: iso_(r.values['마지막 확인']) }; });
    }
    return out;
  },

  /** 연결 하나 끊기 — 그 열쇠(플러그인 로그아웃·웹 로그아웃), 또는 웹 세션으로 내 다른 연결(token_id). */
  logout: function (msg) {
    const found = auth_(msg, HOSTS);
    return withLock_(function () {
      let target = found.token;
      if (msg.token_id) {
        target = findRow_(TABS.tokens, 'token_id', clean_(msg.token_id, 40));
        if (!target || target.values.user_id !== found.member.values.user_id) throw fail_('invalid');
      }
      sheet_(TABS.tokens).deleteRow(target.row);
      return { ok: true };
    });
  },

  /** 웹 — 탈퇴. 회원 줄과 연결 전부를 바로 지운다(처리방침 '탈퇴하면 바로 지웁니다'). */
  delete: function (msg) {
    const found = auth_(msg, ['web']);
    return withLock_(function () {
      const userId = found.member.values.user_id;
      deleteRowsWhere_(TABS.history, 'user_id', userId);
      deleteRowsWhere_(TABS.tokens, 'user_id', userId);
      deleteRowsWhere_(TABS.members, 'user_id', userId);
      logEvent_('탈퇴', 'web');
      return { ok: true };
    });
  },

  /** 생성 기록 남기기 켜기·끄기(웹 계정 페이지). 끌 때 clear면 계정에 남은 기록도 지운다. 기본은 켜짐(칸이 비면 켜짐). */
  set_history_sync: function (msg) {
    const found = auth_(msg, HOSTS);
    const on = msg.on === true;
    return withLock_(function () {
      update_(found.member, { '기록 저장': on ? 'Y' : 'N' });
      if (!on && msg.clear === true) deleteRowsWhere_(TABS.history, 'user_id', found.member.values.user_id);
      return { ok: true, on: on };
    });
  },

  /** 플러그인 — 3D 생성을 마치면 기록 하나. 같은 entry_id는 합친다(다시 보내기). 프로그램은 열쇠의 host로 정한다. 꺼져 있으면 off. */
  history_add: function (msg) {
    const found = auth_(msg, PLUGIN_HOSTS);
    const userId = found.member.values.user_id;
    limit_('history:' + userId, LIMITS.historyPerMinute);
    if (entitlement_(found.member.values).features.indexOf('history_sync') < 0) throw fail_('no_feature');
    if (!historyOn_(found.member.values)) return { ok: true, off: true };
    const entry = msg.entry || {};
    const id = clean_(entry.entry_id, 40);
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw fail_('invalid_entry');
    return withLock_(function () {
      const row = historyRow_(entry, found);
      row.user_id = userId;
      row.entry_id = id;
      const old = findHistory_(userId, id);
      if (old) {
        row['★'] = old.values['★'];
        if (old.values['고친 시각']) { row['이름'] = old.values['이름']; row['고친 시각'] = old.values['고친 시각']; }   // 웹에서 바꾼 이름은 지킨다
        setRow_(old, row);
      } else {
        appendRow_(TABS.history, HISTORY_HEADERS, row);
        trimHistory_(userId);
      }
      return { ok: true };
    });
  },

  /** 플러그인·웹 — 내 생성 기록(최근 것 먼저, 최대 300). host를 주면 그 프로그램 것만. */
  history_list: function (msg) {
    const found = auth_(msg, HOSTS);
    const host = clean_(msg.host, 20);
    const items = readRows_(TABS.history)
      .filter(function (r) { return String(r.values.user_id) === String(found.member.values.user_id) && (!host || r.values.host === host); })
      .map(historyItem_)
      .sort(function (a, b) { return a.built_at < b.built_at ? 1 : a.built_at > b.built_at ? -1 : 0; });
    return { ok: true, on: historyOn_(found.member.values), available: entitlement_(found.member.values).features.indexOf('history_sync') >= 0, items: items };
  },

  /** 플러그인·웹 — 이름 바꾸기·즐겨찾기. 내 기록만. */
  history_update: function (msg) {
    const found = auth_(msg, HOSTS);
    limit_('history:' + found.member.values.user_id, LIMITS.historyPerMinute);
    return withLock_(function () {
      const row = findHistory_(found.member.values.user_id, clean_(msg.id, 40));
      if (!row) throw fail_('invalid');
      const changes = { '고친 시각': new Date() };
      if (typeof msg.label === 'string' && clean_(msg.label, LIMITS.label)) changes['이름'] = clean_(msg.label, LIMITS.label);
      if (typeof msg.star === 'boolean') changes['★'] = msg.star ? 'Y' : '';
      update_(row, changes);
      return { ok: true, item: historyItem_(row) };
    });
  },

  /** 플러그인·웹 — 기록 지우기: id 하나, 또는 all(host를 주면 그 프로그램 것 전부). 결과 파일은 PC에 그대로다. */
  history_delete: function (msg) {
    const found = auth_(msg, HOSTS);
    const userId = found.member.values.user_id;
    return withLock_(function () {
      if (msg.all === true) {
        const host = clean_(msg.host, 20);
        return { ok: true, deleted: deleteRowsWhere_(TABS.history, 'user_id', userId, function (r) { return !host || r.values.host === host; }) };
      }
      const row = findHistory_(userId, clean_(msg.id, 40));
      if (!row) throw fail_('invalid');
      sheet_(TABS.history).deleteRow(row.row);
      return { ok: true, deleted: 1 };
    });
  },
};

/** 처음 한 번 실행: 권한을 승인하고 탭·칸·기본 이용권을 만든다. 코드를 고친 뒤 다시 실행하면 새 칸만 오른쪽에 더한다. */
function setup() {
  Object.keys(TABS).forEach(function (k) { addMissingHeaders_(TABS[k]); });
  const plans = sheet_(TABS.plans);
  if (plans.getLastRow() < 2) DEFAULT_PLANS.forEach(function (row) { plans.appendRow(row); });
}

// ── 생성 기록 ──

/** 회원 줄 '기록 저장' — 비어 있으면 켜짐(처리방침: 회원 기능, 끌 수 있음). */
function historyOn_(member) {
  return String(member['기록 저장'] || 'Y').toUpperCase() !== 'N';
}

function findHistory_(userId, entryId) {
  if (!entryId) return null;
  const rows = readRows_(TABS.history);
  for (let i = 0; i < rows.length; i++) if (String(rows[i].values.user_id) === String(userId) && String(rows[i].values.entry_id) === entryId) return rows[i];
  return null;
}

/** 플러그인이 보낸 entry → 시트 줄. 모양을 확인하고 크기를 자른다 — 모르는 칸·경로처럼 보이는 글은 버린다. */
function historyRow_(entry, found) {
  const row = blank_(HISTORY_HEADERS);
  const built = entry.built_at ? new Date(entry.built_at) : null;
  row['만든 시각'] = built && !isNaN(built) ? built : new Date();
  row.token_id = found.token.values.token_id;
  row.host = found.token.values.host;
  row['판'] = clean_(entry.version || found.token.values['판'], LIMITS.version);
  row['이름'] = clean_(entry.label, LIMITS.label);
  // 대상지 주소 {ko, en} — 계정 페이지가 좌표 대신 페이지 언어 것을 보인다. 글 하나만 오면 '주소'에(패널 언어 그대로)
  const address = entry.address && typeof entry.address === 'object' ? entry.address : { ko: entry.address };
  row['주소'] = clean_(address.ko, LIMITS.address);
  row['주소 영어'] = clean_(address.en, LIMITS.address);
  row['방식'] = MODES.indexOf(entry.mode) >= 0 ? entry.mode : '';
  const center = lngLat_(entry.center);
  row['중심'] = center ? center.join(',') : '';
  const target = {};
  const pnus = Array.isArray(entry.pnus) ? entry.pnus.map(function (p) { return clean_(p, 40); }).filter(String).slice(0, 50) : [];
  if (pnus.length) target.pnus = pnus;
  const ring = Array.isArray(entry.ring) ? entry.ring.slice(0, 400).map(lngLat_).filter(Boolean) : [];
  if (ring.length >= 3) target.ring = ring;
  row['대상'] = Object.keys(target).length ? JSON.stringify(target) : '';
  const radius = Number(entry.radius);
  row['범위'] = SHAPES.indexOf(entry.shape) >= 0 && radius > 0 && radius <= 20000 ? entry.shape + ':' + Math.round(radius) : '';
  row['수준'] = LEVELS.indexOf(entry.detail) >= 0 ? entry.detail : '';
  row['3D 설정'] = flatJson_(entry.options);
  const buildings = Number(entry.buildings);
  row['건물 수'] = isFinite(buildings) && buildings >= 0 ? Math.round(buildings) : '';
  row['2D 요약'] = flatJson_(entry.made_2d);
  return row;
}

/** 시트 줄 → 화면에 줄 기록. token_id(어느 PC인지)는 내보내지 않는다. */
function historyItem_(r) {
  const v = r.values;
  const center = String(v['중심'] || '').split(',').map(Number);
  const range = String(v['범위'] || '').split(':');
  return { id: String(v.entry_id), built_at: iso_(v['만든 시각']), host: String(v.host), version: String(v['판'] || ''),
    label: String(v['이름'] || ''), address: { ko: String(v['주소'] || ''), en: String(v['주소 영어'] || '') }, mode: String(v['방식'] || ''), center: center.length === 2 && center.every(isFinite) ? center : null,
    target: parseJson_(v['대상']), shape: range[0] || '', radius: Number(range[1]) || 0, detail: String(v['수준'] || ''),
    options: parseJson_(v['3D 설정']), buildings: v['건물 수'] === '' ? null : Number(v['건물 수']), made_2d: parseJson_(v['2D 요약']),
    star: String(v['★']) === 'Y', edited: iso_(v['고친 시각']) };
}

/** 계정당 최근 LIMITS.history개 — 넘치면 오래된 것부터, 즐겨찾기는 마지막까지 남긴다. */
function trimHistory_(userId) {
  const mine = readRows_(TABS.history).filter(function (r) { return String(r.values.user_id) === String(userId); });
  const extra = mine.length - LIMITS.history;
  if (extra <= 0) return;
  const time = function (r) { const d = new Date(r.values['만든 시각']); return isNaN(d) ? 0 : d.getTime(); };
  const drop = mine.slice().sort(function (a, b) {
    const sa = String(a.values['★']) === 'Y', sb = String(b.values['★']) === 'Y';
    return sa !== sb ? (sa ? 1 : -1) : time(a) - time(b);
  }).slice(0, extra).map(function (r) { return r.row; }).sort(function (a, b) { return b - a; });
  const sheet = sheet_(TABS.history);
  drop.forEach(function (row) { sheet.deleteRow(row); });
}

/** [경도, 위도] — 범위를 벗어나면 null. 소수 6자리(약 10 cm). */
function lngLat_(p) {
  if (!Array.isArray(p) || p.length < 2) return null;
  const lng = Number(p[0]), lat = Number(p[1]);
  if (!isFinite(lng) || !isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
}

/** 한 단계짜리 {키: 참거짓·숫자·짧은 글} → JSON. 경로처럼 보이는 글(/·\)은 버린다 — 사용자 이름이 든 폴더 경로를 받지 않게. */
function flatJson_(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  const out = {};
  Object.keys(obj).slice(0, 60).forEach(function (k) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) return;
    const v = obj[k];
    if (typeof v === 'boolean' || (typeof v === 'number' && isFinite(v))) out[k] = v;
    else if (typeof v === 'string' && v.length <= 40 && !/[\\/]/.test(v)) out[k] = clean_(v, 40);
  });
  return Object.keys(out).length ? JSON.stringify(out) : '';
}

function parseJson_(text) {
  if (!text) return null;
  try { return JSON.parse(String(text)); } catch (e) { return null; }
}

// ── 권한 ──

/** 회원 줄 → {plan, plan_name, features, valid_until}. 기한이 지나면 free, 막힌 계정은 손님. */
function entitlement_(member) {
  if (member.status === 'blocked') return GUEST;
  let plan = String(member.plan || 'free');
  const until = member.plan_until ? new Date(member.plan_until) : null;
  if (until && !isNaN(until) && until < new Date()) plan = 'free';
  const plans = readPlans_();
  const base = plans[plan] || plans.free;
  const removed = splitList_(member.removed_features);
  const features = base.features.concat(splitList_(member.extra_features))
    .filter(function (f, i, all) { return f && all.indexOf(f) === i && removed.indexOf(f) < 0; });
  return { plan: plan, plan_name: base.name, features: features, valid_until: plan === member.plan && until && !isNaN(until) ? iso_(until) : '' };
}

/** 이용권 → {name, features}. 코드 기본값(DEFAULT_PLANS) 위에 시트 줄을 덮는다 — setup 전이거나 줄을 지워도 회원이 빈 권한이 되지 않게. */
function readPlans_() {
  const out = {};
  DEFAULT_PLANS.forEach(function (r) { out[r[0]] = { name: r[1], features: splitList_(r[2]) }; });
  readRows_(TABS.plans).forEach(function (r) {
    if (r.values.plan) out[String(r.values.plan)] = { name: String(r.values['이름'] || r.values.plan), features: splitList_(r.values.features) };
  });
  return out;
}

function splitList_(text) {
  return String(text || '').split(',').map(function (s) { return s.trim(); }).filter(String);
}

// ── 인증 ──

function clientId_() {
  return PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '';
}

/** 구글 ID 토큰 확인 — tokeninfo(앱스 스크립트에 RSA 서명 확인이 없다). aud = 우리 클라이언트, 메일 확인됨, 만료 전. */
function verifyIdToken_(idToken) {
  const client = clientId_();
  if (!client) throw fail_('not_configured');
  const token = clean_(idToken, 4096);
  if (!token) throw fail_('invalid');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw fail_('invalid');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== client || GOOGLE_ISSUERS.indexOf(info.iss) < 0 || String(info.email_verified) !== 'true'
      || Number(info.exp) * 1000 < Date.now() || !info.sub || !info.email) throw fail_('invalid');
  return { sub: String(info.sub), email: String(info.email).toLowerCase() };
}

/** token(플러그인) 또는 session(웹) → {token: 연결 줄, member: 회원 줄}. host가 허용 목록 밖이거나 없으면 invalid. */
function auth_(msg, hosts) {
  const secret = clean_(msg.token || msg.session, 100);
  if (!secret) throw fail_('invalid');
  const token = findRow_(TABS.tokens, 'token_hash', sha256_(secret));
  if (!token || hosts.indexOf(String(token.values.host)) < 0) throw fail_('invalid');
  const member = findRow_(TABS.members, 'user_id', token.values.user_id);
  if (!member) throw fail_('invalid');
  return { token: token, member: member };
}

function addToken_(userId, host, version) {
  const secret = randomHex_(32);
  const now = new Date();
  const row = blank_(TOKEN_HEADERS);
  row.token_hash = sha256_(secret);
  row.token_id = randomHex_(8);
  row.user_id = userId;
  row.host = host;
  row['판'] = version;
  row['만든 날'] = now;
  row['마지막 확인'] = now;
  appendRow_(TABS.tokens, TOKEN_HEADERS, row);
  return secret;
}

/** 같은 키로 1분에 max번까지(기본 perMinute — 로그인·교환권 남용 막기). */
function limit_(key, max) {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get('rate:' + key) || 0);
  if (count >= (max || LIMITS.perMinute)) throw fail_('too_fast');
  cache.put('rate:' + key, String(count + 1), 60);
}

// ── 시트 ──

function sheet_(title) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(title);
  if (sheet) return sheet;
  const headers = headersOf_(title);
  sheet = book.insertSheet(title);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function headersOf_(title) {
  return { [TABS.members]: MEMBER_HEADERS, [TABS.plans]: PLAN_HEADERS, [TABS.tokens]: TOKEN_HEADERS, [TABS.history]: HISTORY_HEADERS, [TABS.events]: EVENT_HEADERS }[title];
}

/** 예전 setup으로 만든 탭에 새 칸이 없으면 오른쪽 끝에 더한다(있는 칸 순서는 건드리지 않는다). */
function addMissingHeaders_(title) {
  const h = headerIndex_(title);
  const missing = headersOf_(title).filter(function (name) { return !(name in h.index); });
  if (missing.length) h.sheet.getRange(1, h.head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
}

function headerIndex_(title) {
  const sheet = sheet_(title);
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const index = {};
  head.forEach(function (name, i) { if (name) index[String(name)] = i; });
  return { sheet: sheet, head: head, index: index };
}

/** 탭의 모든 줄 → [{row(시트 줄 번호), values{칸: 값}, title}]. 회원 수천 명까지는 한 번에 읽어도 충분하다. */
function readRows_(title) {
  const h = headerIndex_(title);
  const last = h.sheet.getLastRow();
  if (last < 2) return [];
  return h.sheet.getRange(2, 1, last - 1, h.head.length).getValues().map(function (values, i) {
    const obj = {};
    h.head.forEach(function (name, j) { if (name) obj[String(name)] = values[j]; });
    return { row: i + 2, values: obj, title: title };
  });
}

function findRow_(title, column, value) {
  if (!value) return null;
  const rows = readRows_(title);
  for (let i = 0; i < rows.length; i++) if (String(rows[i].values[column]) === String(value)) return rows[i];
  return null;
}

function appendRow_(title, headers, obj) {
  const h = headerIndex_(title);
  const row = h.head.map(function (name) { return name in obj ? cellValue_(obj[name]) : ''; });
  h.sheet.appendRow(row);
}

/** 찾은 줄 전체를 한 번에 다시 쓴다(칸마다 쓰면 느리다). */
function setRow_(found, obj) {
  const h = headerIndex_(found.title);
  h.sheet.getRange(found.row, 1, 1, h.head.length).setValues([h.head.map(function (name) {
    return name in obj ? cellValue_(obj[name]) : found.values[name] === undefined ? '' : found.values[name];   // 운영자가 더한 칸은 그대로
  })]);
  Object.keys(obj).forEach(function (name) { found.values[name] = obj[name]; });
}

function update_(found, changes) {
  const h = headerIndex_(found.title);
  Object.keys(changes).forEach(function (name) {
    if (!(name in h.index)) return;
    h.sheet.getRange(found.row, h.index[name] + 1).setValue(cellValue_(changes[name]));
    found.values[name] = changes[name];
  });
}

/** 아래 줄부터 지운다(위부터 지우면 줄 번호가 밀린다). also가 있으면 그것도 맞는 줄만. 지운 줄 수. */
function deleteRowsWhere_(title, column, value, also) {
  const sheet = sheet_(title);
  const rows = readRows_(title).filter(function (r) { return String(r.values[column]) === String(value) && (!also || also(r)); })
    .map(function (r) { return r.row; }).sort(function (a, b) { return b - a; });
  rows.forEach(function (row) { sheet.deleteRow(row); });
  return rows.length;
}

function logEvent_(what, host) {
  sheet_(TABS.events).appendRow([new Date(), what, host]);   // 메일 없이 숫자 세기용
}

function blank_(headers) {
  const obj = {};
  headers.forEach(function (name) { obj[name] = ''; });
  return obj;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ── 도우미 ──

function randomHex_(bytes) {
  let hex = '';
  while (hex.length < bytes * 2) hex += Utilities.getUuid().replace(/-/g, '');   // UUID v4 = 보안 난수 122비트씩
  return hex.slice(0, bytes * 2);
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function iso_(value) {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d) ? '' : Utilities.formatDate(d, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function clean_(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001F]/g, '').trim().slice(0, max);
}

/** 시트 칸에 넣을 글 — =·+·-·@로 시작하면 수식으로 읽히지 않게 앞에 '를 붙인다(날짜·숫자는 그대로). */
function cellValue_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

function fail_(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
