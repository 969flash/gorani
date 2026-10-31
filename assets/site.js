// Gorani 소개 페이지 — 방문 통계, 복사 버튼, 설치 탭, 스크롤 고라니, 시연 영상(지연 로드·장면·자막)
(function () {
  "use strict";

  // ── 방문 통계 — 웹사이트 전용 GA4 속성(플러그인 속성과 섞지 않는다). 비면 보내지 않는다 ──
  var GA_ID = "G-ZVM7EZPRPQ";   // 속성 "Gorani 웹", 스트림 16139144506
  if (GA_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    // 개발자 표시 — localhost이거나 ?dev=1로 한 번 연 브라우저(?dev=0으로 해제). 관리자 대시보드 [내 테스트 제외]가 dev = 1인 방문을 뺀다
    var dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    try {
      if (/[?&]dev=0\b/.test(location.search)) localStorage.removeItem("gorani_dev");
      else if (/[?&]dev=1\b/.test(location.search)) localStorage.setItem("gorani_dev", "1");
      dev = dev || localStorage.getItem("gorani_dev") === "1";
    } catch (e) { /* 저장소를 막은 브라우저 — localhost만 본다 */ }
    if (dev) window.gtag("set", { dev: "1" });
    window.gtag("config", GA_ID);
    var tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(tag);
  }
  function track(name, params) { if (window.gtag) window.gtag("event", name, params); }
  // 문의 받는 곳 — 구글 앱스 스크립트 웹 앱 주소(tools/contact/README.md). 비면 폼이 '준비 중'을 띄운다
  var CONTACT_URL = "https://script.google.com/macros/s/AKfycbxjfiwvtAXoDbKTjeiVvg6TosK3SA5i_ZzoPk6XkdI4sLhQQOAP_uqWzPQMKTynry-E/exec";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var lang = document.documentElement.lang === "ko" ? "ko" : "en";
  document.body.classList.add("motion-ready");
  var live = document.getElementById("live");
  function say(text) { if (live) live.textContent = text; }
  function store(key, value) {   // 브라우저 저장소는 막혀 있을 수 있다
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  // ── 머리줄 펼침 메뉴(언어, 좁은 화면 메뉴): 하나만 열고, 링크·바깥 누르기·Esc로 닫는다 ──
  var pops = [].slice.call(document.querySelectorAll(".language-switch, .menu-switch"));
  function closePops(except) { pops.forEach(function (d) { if (d !== except) d.open = false; }); }
  pops.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (!d.open) return;
      closePops(d);
      if (d.classList.contains("menu-switch")) track("menu_open");
    });
    d.addEventListener("click", function (e) { if (e.target.closest("a")) d.open = false; });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".language-switch, .menu-switch")) closePops(); });
  document.addEventListener("keydown", function (e) {
    var open = pops.filter(function (d) { return d.open; })[0];
    if (e.key === "Escape" && open) { closePops(); open.querySelector("summary").focus(); }
  });

  // ── 행동 통계: 고른 프로그램, 설치 버튼, 바깥 링크, 언어 전환, 어느 섹션까지 봤는지 ──
  var pageLang = document.documentElement.lang;
  function place(el) { return el.closest("header") ? "header" : el.closest(".hero") ? "hero" : el.closest("footer") ? "footer" : "body"; }
  document.addEventListener("click", function (e) {
    var chip = e.target.closest(".support .host-link");
    if (chip) return track("host_click", { host: chip.querySelector("b").textContent.trim().toLowerCase() });
    var a = e.target.closest("a");
    if (!a) return;
    if (a.closest(".language-switch")) return track("language_switch", { from: pageLang, to: a.getAttribute("lang") });
    if (a.getAttribute("href") === "#install") return track("install_cta", { place: place(a) });
    if (a.closest(".install-links")) return track("install_download", { target: a.textContent.trim() });
    var href = a.href;
    var target = /\/gorani(-plugin)?\/issues/.test(href) ? "review" : /github\.com\/sponsors\//.test(href) ? "sponsor"
      : /github\.com\/969flash\/gorani(-plugin)?\/?$/.test(href) ? "github" : /wikipedia\.org/.test(href) ? "wikipedia" : "";
    if (target) track("outbound_click", { target: target, place: place(a) });
  });
  if ("IntersectionObserver" in window) {
    var sectionObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        track("section_view", { section: entry.target.id });
      });
    }, { rootMargin: "0px 0px -40% 0px" });   // 섹션 머리가 화면 위쪽 60% 안에 들어오면 본 것으로 센다(긴 섹션도 잡히게)
    document.querySelectorAll("#main > section[id]").forEach(function (s) { sectionObserver.observe(s); });
  }

  // 섹션 머리·기능 블록·카드·줄은 화면에 들어올 때 나타낸다. 함께 들어온 것끼리 위에서부터 0.06초씩(최대 0.3초) 늦춘다.
  var revealTargets = [].slice.call(document.querySelectorAll([
    ".block-head h2", ".block-head .sub", ".block-head > .seg", ".block-head > .btn",
    ".support .host-link", ".feature",
    "#install [role=tabpanel]:not([hidden]) .install-quick", "#install [role=tabpanel]:not([hidden]) .install-card",
    ".usage li", ".country-marquee", ".faq", ".contact", ".final .wrap"
  ].join(", ")));
  revealTargets.forEach(function (el) { el.classList.add("reveal"); });
  if ("IntersectionObserver" in window && !reduce.matches) {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      var batch = entries.filter(function (entry) { return entry.isIntersecting; }).map(function (entry) { return entry.target; });
      batch.sort(function (a, b) {
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return (ra.top - rb.top) || (ra.left - rb.left);
      });
      batch.forEach(function (el, i) {
        el.style.setProperty("--d", Math.min(i * 0.06, 0.3).toFixed(2) + "s");
        el.classList.add("in-view");
        observer.unobserve(el);
        // 나타난 뒤에는 reveal 전환(지연 포함)을 떼어 호버 전환이 그 요소 것대로 돌게 한다
        el.addEventListener("transitionend", function done(e) {
          if (e.target !== el || e.propertyName !== "opacity") return;
          el.removeEventListener("transitionend", done);
          el.classList.remove("reveal", "in-view");
          el.style.removeProperty("--d");
        });
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add("in-view"); });
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
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      var was = panel.hidden;
      panel.hidden = !on;
      if (on && was && !reduce.matches && panel.animate) {
        panel.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
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
  // AutoCAD 설치: Windows·macOS 전환(기본 Windows)
  document.querySelectorAll(".os-switch").forEach(function (sw) {
    var panel = sw.parentElement;
    sw.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-os]");
      if (!btn) return;
      sw.querySelectorAll("button[data-os]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      panel.querySelectorAll(".os-block").forEach(function (blk) { blk.hidden = blk.getAttribute("data-os") !== btn.getAttribute("data-os"); });
      track("install_os", { os: btn.getAttribute("data-os") });
    });
  });
  // 지원 프로그램 칩: 설치의 그 프로그램 탭을 연다
  document.querySelectorAll("[data-install-tab]").forEach(function (link) {
    link.addEventListener("click", function () {
      var tab = document.getElementById("tab-" + link.getAttribute("data-install-tab"));
      if (tab) pick(tab);
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

  // ── 지원 국가: 흐르는 카드를 누르면 줄을 멈추고 그 나라의 데이터 출처를 연다(같은 카드·닫기·Esc로 닫고 다시 흐름) ──
  var countryRow = document.querySelector(".country-marquee");
  var countryDetail = document.getElementById("country-detail");
  if (countryRow && countryDetail) {
    var countryCards = [].slice.call(countryRow.querySelectorAll(".country-card"));
    var countryOpen = "";
    var countryTurn = 0;
    var showCountry = function (code) {
      countryOpen = code;
      countryRow.classList.toggle("is-paused", !!code);
      countryCards.forEach(function (c) { c.setAttribute("aria-expanded", String(c.getAttribute("data-country") === code)); });
      var turn = ++countryTurn;   // 닫는 중에 다른 카드를 누르면 늦게 끝난 닫기가 새 패널을 숨기지 않게
      var apply = function () {
        if (turn !== countryTurn) return;
        [].forEach.call(countryDetail.querySelectorAll("[data-country-panel]"), function (p) { p.hidden = p.getAttribute("data-country-panel") !== code; });
        countryDetail.hidden = !code;
      };
      var shown = countryDetail.querySelector("[data-country-panel]:not([hidden])");
      if (!code && shown && !countryDetail.hidden && !reduce.matches && shown.animate) {
        var out = shown.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(8px)" }], { duration: 180, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
        out.onfinish = function () { apply(); out.cancel(); };
      } else {
        apply();
      }
    };
    var firstCard = function (code) { return countryRow.querySelector('.country-set:not([aria-hidden]) [data-country="' + code + '"]'); };
    countryCards.forEach(function (card) {
      card.addEventListener("click", function () {
        var code = card.getAttribute("data-country");
        if (code === countryOpen) return showCountry("");
        showCountry(code);
        track("coverage_country", { country: code });
      });
    });
    countryDetail.addEventListener("click", function (e) {
      if (!e.target.closest(".country-close")) return;
      var code = countryOpen;
      showCountry("");
      firstCard(code).focus({ preventScroll: true });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !countryOpen) return;
      var code = countryOpen;
      showCountry("");
      if (countryDetail.contains(document.activeElement) || countryRow.contains(document.activeElement)) firstCard(code).focus({ preventScroll: true });
    });
  }

  // ── 문의: 칸을 확인하고 앱스 스크립트로 보낸다(text/plain이라 사전 요청 없이 간다). 숨은 칸이 채워졌거나 너무 빨리 보내면 봇으로 보고 성공처럼 보인다 ──
  var contact = document.querySelector(".contact-form");
  if (contact) {
    var shownAt = Date.now();
    var status = contact.querySelector(".contact-status");
    var sendBtn = contact.querySelector('button[type="submit"]');
    var note = function (text, isError) { status.textContent = text; status.classList.toggle("error", !!isError); };
    var finish = function (email) {
      contact.classList.add("sent");
      note(contact.getAttribute("data-sent").replace("{email}", email));
    };
    contact.addEventListener("submit", function (e) {
      e.preventDefault();
      contact.classList.add("checked");
      if (!contact.checkValidity()) { contact.reportValidity(); return; }
      var f = contact.elements;
      var email = f.email.value.trim();
      if (f.website.value || Date.now() - shownAt < 3000) { finish(email); return; }
      if (!CONTACT_URL) { note(contact.getAttribute("data-unready"), true); return; }
      sendBtn.disabled = true;
      note(contact.getAttribute("data-sending"));
      var topic = f.topic.value;
      fetch(CONTACT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          app: "gorani-web", lang: pageLang, page: location.href, topic: topic,
          name: f.name.value.trim(), email: email, message: f.message.value.trim(), elapsed: Date.now() - shownAt
        })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res || !res.ok) throw new Error(res && res.error);
        finish(email);
        track("contact_submit", { topic: topic });
      }).catch(function () {
        sendBtn.disabled = false;
        note(contact.getAttribute("data-error"), true);
      });
    });
  }

  // ── 시연 영상 ───────────────────────────
  var screen = document.querySelector(".screen");
  if (!screen) return;
  var video = screen.querySelector("video");
  var cap = screen.querySelector(".cap");
  var chapters = [].slice.call(document.querySelectorAll("[data-at]"));
  var starts = chapters.map(function (b) { return +b.getAttribute("data-at"); });
  var DEMO_START = 3.67;
  var firstPlayback = true;
  var END = 52.33;   // 영상 길이(초)

  // 설명 자막 — [시작, 끝, 한국어, 영어], *강조*
  var CAPTIONS = [
    [0.0, 3.67, "명령창에 *Gorani*를 입력해 패널을 엽니다.", "Type *Gorani* in the command line to open the panel."],
    [3.67, 6.45, "대상지를 선택합니다.", "Select a site."],
    [6.45, 9.5, "필지를 직접 선택하거나, 대상지의 경계를 그릴 수 있습니다.", "Choose parcels directly, or draw the site's boundary."],
    [9.5, 12.5, "구역을 선택합니다.", "Select an area."],
    [12.5, 17.17, "범위와 옵션을 정해 3D 모델을 만듭니다.", "Set the range and options to build the 3D model."],
    [17.17, 20.37, "결과가 열린 Rhino 문서에 레이어별로 들어옵니다.", "The result lands in the open Rhino file, layer by layer."],
    [20.37, 27.37, "베이스맵과 분석 자료를 생성합니다.", "Generate the basemap and analysis materials."],
    [27.37, 34.87, "만든 도면을 패널에서 미리 봅니다.", "Preview the drawings in the panel."],
    [34.87, 40.87, "다이어그램의 스타일을 변경하고 나만의 스타일을 저장할 수 있습니다.", "Change the diagram style and save your own style."],
    [40.87, 46.37, "결과를 파일로 저장합니다.", "Save the results to files."],
    [46.37, 49.93, "결과 폴더를 확인합니다.", "Check the result folder."]
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
    cap.classList.remove("pop");
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
      if (t >= s && t < e) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
  }
  function render() {
    var t = video.currentTime || 0;
    renderCaption(t);
    renderChapters(t);
  }

  var frame = 0;
  function loop() { render(); frame = requestAnimationFrame(loop); }
  video.addEventListener("play", function () { screen.classList.remove("paused"); cancelAnimationFrame(frame); loop(); });
  video.addEventListener("pause", function () { screen.classList.add("paused"); cancelAnimationFrame(frame); render(); });
  video.addEventListener("seeked", render);
  video.addEventListener("loadedmetadata", function () {
    if (firstPlayback) video.currentTime = DEMO_START;
    render();
  });
  video.addEventListener("ended", function () {
    if (userPaused) return;
    firstPlayback = false;
    video.currentTime = 0;
    play();
  });
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
