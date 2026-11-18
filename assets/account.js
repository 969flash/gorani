// 웹 계정 — 회원 API 주소·구글 클라이언트 ID와 웹 세션. /login/(플러그인 로그인)·/account/(계정 페이지)·머리줄 로그인이 같이 쓴다(tools/account/README.md)
(function () {
  "use strict";
  // 배포 값 — tools/account/README.md 처음 설정 1·5. 비어 있으면 머리줄 로그인을 숨기고 로그인 페이지는 '준비 중'
  var ACCOUNT_API_URL = "";
  var GOOGLE_CLIENT_ID = "";
  var SESSION_KEY = "gorani_session", SESSION_DAYS = 30;

  // 이 브라우저의 웹 세션 {session, email, exp} — 30일. 서버가 invalid라 하면 지운다
  function saved() {
    try { var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.session && s.exp > Date.now() ? s : null; } catch (e) { return null; }
  }
  function store(value) {
    try { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  // text/plain POST(JSON 본문) — 미리 보내기가 없어 앱스 스크립트에 CORS 설정이 필요 없다
  function api(body) {
    return fetch(ACCOUNT_API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  // 구글 ID 토큰 → 웹 세션(처음이면 가입). 저장까지 하고 응답을 돌려준다
  function login(idToken, lang) {
    return api({ action: "login", id_token: idToken, terms_v: GoraniAccount.TERMS_V, privacy_v: GoraniAccount.PRIVACY_V, lang: lang }).then(function (res) {
      if (!res.ok) throw new Error(res.error);
      store({ session: res.session, email: res.user.email, exp: Date.now() + SESSION_DAYS * 864e5 });
      return res;
    });
  }
  // 구글 로그인 버튼(GIS) 스크립트 — 광고 차단기가 막으면 onerror
  function loadGis(onload, onerror) {
    if (window.google && google.accounts && google.accounts.id) return onload();
    var gis = document.createElement("script");
    gis.src = "https://accounts.google.com/gsi/client"; gis.async = true;
    gis.onload = function () { if (window.google && google.accounts && google.accounts.id) onload(); else onerror(); };
    gis.onerror = onerror;
    document.head.appendChild(gis);
  }

  var GoraniAccount = window.GoraniAccount = {
    ready: !!(ACCOUNT_API_URL && GOOGLE_CLIENT_ID),
    clientId: GOOGLE_CLIENT_ID,
    TERMS_V: "2026-11-16", PRIVACY_V: "2026-11-16",   // 처리방침·약관 시행일 — 가입 때 본 판으로 회원 줄에 남는다
    saved: saved, store: store, api: api, login: login, loadGis: loadGis
  };
})();
