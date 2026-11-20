// 웹 계정 — Firebase(구글) 설정·이 브라우저의 로그인·Firebase REST. /login/(플러그인 로그인)·/account/(계정 페이지)·머리줄 로그인이 같이 쓴다(tools/account/README.md)
(function () {
  "use strict";
  // 배포 값 — tools/account/README.md 처음 설정 5·7·8. 비어 있으면 머리줄 로그인을 숨기고 계정 페이지는 '준비 중'(플러그인 로그인은 고장으로 넘긴다)
  var FIREBASE = { apiKey: "AIzaSyCggyybM6ngv8v0NUJ2n_0wf476R0vZWxs", projectId: "gorani-da15f", dbUrl: "https://gorani-da15f-default-rtdb.asia-southeast1.firebasedatabase.app" };   // 고라니 운영 계정의 Spark 프로젝트 — 공개 값
  var GOOGLE_CLIENT_ID = "881558869222-8njad170fa7q4jc5nom2bjlbj2n6ngkb.apps.googleusercontent.com";   // 같은 프로젝트의 웹 클라이언트(승인된 출처 gorani.site·localhost:8000)
  var URLS = { identity: "https://identitytoolkit.googleapis.com/v1/", token: "https://securetoken.googleapis.com/v1/token", gis: "https://accounts.google.com/gsi/client" };
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {   // 시험만 — tools/account/fake_firebase.py 주소로 바꾼다
    try {
      var t = JSON.parse(localStorage.getItem("gorani_account_test") || "null");
      if (t) { FIREBASE = { apiKey: t.apiKey, projectId: "test", dbUrl: t.dbUrl }; GOOGLE_CLIENT_ID = t.clientId; URLS = t.urls; }
    } catch (e) {}
  }
  var SESSION_KEY = "gorani_session";
  var PLAN_NAMES = { free: "Member" };   // 이용권 이름 — 영어 고유명사(플러그인 원격 설정 PLAN_NAMES와 같게). 토큰에 plan이 없으면 free
  var DENIED = ["USER_DISABLED", "USER_NOT_FOUND", "TOKEN_EXPIRED", "INVALID_REFRESH_TOKEN"];   // 확실한 거절 넷 — 이것만 '로그인이 끝났다'로 본다

  // 이 브라우저의 로그인 {refresh, email} — 열쇠는 거절될 때까지 쓴다(기한 없음). 토큰은 메모리에만
  var cache = null;   // {token, claims}
  function saved() {
    try { var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.refresh ? s : null; } catch (e) { return null; }
  }
  function store(value) {
    if (!value) cache = null;
    try { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  // 실패 — Error.message: 'invalid'(거절 넷 — 로그인이 끝났다)·'reauth'(한 번 더 로그인해야 하는 일)·'denied'(RTDB 규칙)·'service'(고장)
  function failure(message) {
    var m = String(message || "").split(/[\s:]/)[0];
    return new Error(DENIED.indexOf(m) >= 0 ? "invalid" : m === "CREDENTIAL_TOO_OLD_LOGIN_AGAIN" ? "reauth" : "service");
  }
  function post(url, body, form) {
    return fetch(url, { method: "POST", headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (r.ok) return j; throw failure(j.error && j.error.message); });
    }, function () { throw failure(""); });
  }
  function identity(name, body) { return post(URLS.identity + "accounts:" + name + "?key=" + FIREBASE.apiKey, body); }
  function claimsOf(token) {   // 토큰 가운데 칸(JSON) — email·user_id·auth_time·exp, 있으면 plan·plan_until
    var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(part + "===".slice((part.length + 3) % 4)))));
  }

  // 토큰 — 만료 1분 전이면 열쇠로 새로 받는다. 열쇠가 거절되면 이 브라우저의 로그인을 지운다
  function token() {
    var s = saved();
    if (!s) return Promise.reject(new Error("invalid"));
    if (cache && cache.claims.exp * 1000 - Date.now() > 60000) return Promise.resolve(cache);
    return post(URLS.token + "?key=" + FIREBASE.apiKey, { grant_type: "refresh_token", refresh_token: s.refresh }, true).then(function (r) {
      cache = { token: r.id_token, claims: claimsOf(r.id_token) };
      if (r.refresh_token !== s.refresh || (cache.claims.email && cache.claims.email !== s.email)) store({ refresh: r.refresh_token, email: cache.claims.email || s.email });
      return cache;
    }, function (err) { if (err.message === "invalid") store(null); throw err; });
  }
  // 구글 ID 토큰 → Firebase 열쇠·토큰(처음이면 그 자리에서 가입)
  function login(credential) {
    return identity("signInWithIdp", { postBody: "id_token=" + encodeURIComponent(credential) + "&providerId=google.com", requestUri: location.origin, returnSecureToken: true })
      .then(function (r) {
        store({ refresh: r.refreshToken, email: r.email });
        cache = { token: r.idToken, claims: claimsOf(r.idToken) };
        return { refresh: r.refreshToken, user: { email: r.email, new: !!r.isNewUser } };
      });
  }
  // 이용권 — 토큰의 plan(운영자·결제 알림만 넣는다). 없거나 기한(plan_until)이 지나면 free
  function plan(claims) {
    var p = claims.plan || "free";
    if (claims.plan_until && Date.parse(claims.plan_until) < Date.now()) p = "free";
    return { plan: p, plan_name: PLAN_NAMES[p] || p.charAt(0).toUpperCase() + p.slice(1) };
  }
  // RTDB REST — 늘 users/<내 uid> 아래. 쓰기는 POST + x-http-method-override + text/plain(미리 보내기 없는 요청이라 CORS 설정이 필요 없다)
  function db(path, method, value) {
    return token().then(function (t) {
      var url = FIREBASE.dbUrl.replace(/\/$/, "") + "/users/" + t.claims.user_id + (path ? "/" + path : "") + ".json?auth=" + encodeURIComponent(t.token);
      var write = method && method !== "GET";
      var init = write ? { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(value === undefined ? null : value) } : {};
      return fetch(url + (write ? "&x-http-method-override=" + method : ""), init).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) { if (r.ok) return j; throw new Error(r.status === 401 ? "denied" : "service"); });
      }, function () { throw new Error("service"); });
    });
  }
  function lookup() { return token().then(function (t) { return identity("lookup", { idToken: t.token }); }); }
  function deleteAccount() { return token().then(function (t) { return identity("delete", { idToken: t.token }); }).then(function () { store(null); }); }
  // 구글 로그인 버튼(GIS) 스크립트 — 광고 차단기가 막으면 onerror
  function loadGis(onload, onerror) {
    if (window.google && google.accounts && google.accounts.id) return onload();
    var gis = document.createElement("script");
    gis.src = URLS.gis; gis.async = true;
    gis.onload = function () { if (window.google && google.accounts && google.accounts.id) onload(); else onerror(); };
    gis.onerror = onerror;
    document.head.appendChild(gis);
  }

  window.GoraniAccount = {
    ready: !!(FIREBASE.apiKey && FIREBASE.dbUrl && GOOGLE_CLIENT_ID),
    clientId: GOOGLE_CLIENT_ID,
    saved: saved, store: store, token: token, login: login, plan: plan, db: db, lookup: lookup, deleteAccount: deleteAccount, loadGis: loadGis
  };
})();
