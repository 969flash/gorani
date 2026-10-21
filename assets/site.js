// Gorani 소개 페이지 — 방문 통계, 복사 버튼, 설치 탭, 스크롤 고라니, 시연 영상(지연 로드·장면·자막)
(function () {
  "use strict";

  // ── 방문 통계 — 웹사이트 전용 GA4 속성(플러그인 속성과 섞지 않는다). 비면 보내지 않는다 ──
  var GA_ID = "G-ZVM7EZPRPQ";   // 속성 "Gorani 웹", 스트림 16139144506
  if (GA_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
    var tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(tag);
  }
  function track(name, params) { if (window.gtag) window.gtag("event", name, params); }

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var lang = document.documentElement.lang === "ko" ? "ko" : "en";
  var live = document.getElementById("live");
  function say(text) { if (live) live.textContent = text; }
  function store(key, value) {   // 브라우저 저장소는 막혀 있을 수 있다
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  // ── 복사 버튼 ───────────────────────────
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      navigator.clipboard.writeText(text).then(function () {
        btn.classList.add("done");
        track("copy_command", { command: text });   // 설치 명령 복사 = 설치 의도
        say(btn.getAttribute("data-done") || "Copied");
        setTimeout(function () { btn.classList.remove("done"); }, 1600);
      });
    });
  });

  // ── 설치 탭(Rhino·SketchUp·Blender) ─────
  var tabs = [].slice.call(document.querySelectorAll('[role="tab"]'));
  function pick(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { pick(tab); track("install_tab", { host: tab.id.replace("tab-", "") }); });
    tab.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });

  // ── 스크롤 진행: 머리줄 아래 선을 고라니가 달린다(스크롤하는 동안만 다리가 움직임) ──
  var bar = document.querySelector(".progress"), runner = bar && bar.querySelector(".run");
  if (bar) {
    var lastY = window.scrollY, idle = 0, queued = false;
    var update = function () {
      queued = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var y = window.scrollY;
      bar.style.setProperty("--p", max > 0 ? Math.min(1, Math.max(0, y / max)).toFixed(4) : "0");
      if (y !== lastY) runner.classList.toggle("back", y < lastY);
      bar.classList.toggle("at-top", y <= 0);
      lastY = y;
    };
    window.addEventListener("scroll", function () {
      if (!queued) { queued = true; requestAnimationFrame(update); }
      if (!reduce.matches) runner.classList.add("go");
      clearTimeout(idle);
      idle = setTimeout(function () { runner.classList.remove("go"); }, 180);
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  // ── 시연 영상 ───────────────────────────
  var screen = document.querySelector(".screen");
  if (!screen) return;
  var video = screen.querySelector("video");
  var cap = screen.querySelector(".cap");
  var chapters = [].slice.call(document.querySelectorAll("[data-at]"));
  var starts = chapters.map(function (b) { return +b.getAttribute("data-at"); });
  var END = 39.3;   // 영상 길이(초)

  // 릴스식 자막 — [시작, 끝, 한국어, 영어], *강조*
  var CAPTIONS = [
    [0.0, 1.6, "Gorani 패널", "The Gorani panel"],
    [1.6, 4.0, "주소나 *지번*으로 검색", "Search an address or *parcel number*"],
    [4.0, 6.2, "결과를 누르면 *대상지*로", "Pick a result to set the *site*"],
    [6.2, 9.0, "옆 필지를 눌러 *더하기*", "Click a neighbor to *add* it"],
    [9.0, 11.0, "*3D 옵션* 확인", "Check the *3D options*"],
    [11.0, 13.0, "기본값으로 둬도 충분", "The defaults are fine"],
    [13.0, 14.0, "*3D 모델 만들기*", "Press *3D model*"],
    [14.0, 17.4, "고라니가 달리는 동안 만드는 중", "Building while the gorani runs"],
    [17.4, 20.0, "열려 있는 Rhino 문서에 *레이어별로*", "Into your open Rhino file, *layer by layer*"],
    [20.0, 21.5, "이어서 *2D 자료*", "Next, the *2D set*"],
    [21.5, 22.4, "베이스맵은 *.ai* 도면으로", "The basemap as an *.ai* drawing"],
    [22.4, 23.4, "현황도와 분석도도 함께", "Plus analysis maps"],
    [23.4, 26.0, "베이스맵과 다이어그램 만드는 중", "Making the basemap and diagrams"],
    [26.0, 29.0, "*.ai* 도면과 현황도 완성", "*.ai* drawings and maps, done"],
    [29.0, 31.0, "도면마다 미리보기", "Preview each drawing"],
    [31.0, 35.8, "*토지이용현황*", "*Land use*"],
    [35.8, 37.8, "*지목 현황*", "*Land category*"],
    [37.8, 39.4, "*용도지역*", "*Zoning*"]
  ];
  var ccLang = store("gorani-cc") || lang, shown = -2;
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function renderCaption(t) {
    var idx = -1;
    if (ccLang !== "off") for (var i = 0; i < CAPTIONS.length; i++) if (t >= CAPTIONS[i][0] && t < CAPTIONS[i][1]) { idx = i; break; }
    if (idx === shown) return;
    shown = idx;
    if (idx < 0) { cap.innerHTML = ""; return; }
    var text = esc(CAPTIONS[idx][ccLang === "ko" ? 2 : 3]).replace(/\*(.+?)\*/g, "<em>$1</em>");
    cap.innerHTML = "<span>" + text + "</span>";
    cap.classList.remove("pop"); void cap.offsetWidth; cap.classList.add("pop");
  }
  document.querySelectorAll("[data-cc]").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.getAttribute("data-cc") === ccLang));
    b.addEventListener("click", function () {
      ccLang = b.getAttribute("data-cc");
      store("gorani-cc", ccLang);
      document.querySelectorAll("[data-cc]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      shown = -2; renderCaption(video.currentTime || 0);
    });
  });

  function renderChapters(t) {
    chapters.forEach(function (b, i) {
      if (!loaded) return;
      var s = starts[i], e = i + 1 < starts.length ? starts[i + 1] : END;
      b.style.setProperty("--f", Math.min(1, Math.max(0, (t - s) / (e - s))).toFixed(3));
      if (t >= s && t < e) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
  }
  function render() { var t = video.currentTime || 0; renderCaption(t); renderChapters(t); }

  var frame = 0;
  function loop() { render(); frame = requestAnimationFrame(loop); }
  video.addEventListener("play", function () { screen.classList.remove("paused"); cancelAnimationFrame(frame); loop(); });
  video.addEventListener("pause", function () { screen.classList.add("paused"); cancelAnimationFrame(frame); render(); });
  video.addEventListener("seeked", render);
  video.addEventListener("waiting", function () { screen.classList.add("wait"); });
  video.addEventListener("playing", function () { screen.classList.remove("wait"); });
  video.addEventListener("canplay", function () { screen.classList.remove("wait"); });
  video.addEventListener("loadeddata", function () { screen.classList.add("ready"); render(); });

  // 영상은 페이지를 다 불러온 뒤에 받는다. 움직임 줄이기·데이터 절약이면 누를 때까지 받지 않는다
  var loaded = false, userPaused = false;
  function load() {
    if (loaded) return;
    loaded = true;
    screen.classList.remove("idle");
    screen.classList.add("wait");
    video.src = video.getAttribute("data-src");
    video.load();
  }
  function play() {
    load();
    var p = video.play();
    if (p && p.catch) p.catch(function () { screen.classList.remove("wait"); screen.classList.add("paused"); });
  }
  var saveData = navigator.connection && navigator.connection.saveData;
  screen.classList.add("paused", "idle");
  screen.querySelector(".big-play").addEventListener("click", function () { userPaused = false; play(); track("demo_play"); });
  if (!reduce.matches && !saveData) {
    // load 이벤트(글꼴·통계 스크립트까지 끝)가 늦으면 2.5초 뒤에는 시작한다
    var started = false, auto = function () { if (!started) { started = true; setTimeout(play, 300); } };
    if (document.readyState === "complete") auto(); else { window.addEventListener("load", auto); setTimeout(auto, 2500); }
  }

  screen.querySelector(".toggle").addEventListener("click", function () {
    if (video.paused) { userPaused = false; play(); track("demo_play"); } else { userPaused = true; video.pause(); }
  });
  chapters.forEach(function (b, i) {
    b.addEventListener("click", function () {
      var go = function () { video.currentTime = starts[i]; render(); };
      userPaused = false;
      if (video.readyState >= 1) go(); else video.addEventListener("loadedmetadata", go, { once: true });
      play();
      track("demo_chapter", { chapter: i + 1 });
    });
  });

  // 화면 밖에선 멈추고 돌아오면 이어서(사용자가 멈춘 경우는 그대로)
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      var seen = entries[0].isIntersecting;
      if (!loaded || userPaused) return;
      if (!seen && !video.paused) video.pause();
      else if (seen && video.paused && !reduce.matches) play();
    }, { threshold: 0.2 }).observe(screen);
  }
  render();
})();
