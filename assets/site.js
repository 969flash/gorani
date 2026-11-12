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
  var tabs = [].slice.call(document.querySelectorAll('#install [role="tab"]'));   // 설치 탭만(버전 기록 필터 버튼은 따로 처리)
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
  // AutoCAD 설치: Windows·macOS 전환(기본 Windows). 블록마다 회색 박스 안에 같은 전환이 있어 함께 맞춘다
  document.querySelectorAll(".os-switch").forEach(function (sw) {
    var panel = sw.closest("[role=tabpanel]");
    sw.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-os]");
      if (!btn) return;
      var os = btn.getAttribute("data-os");
      panel.querySelectorAll(".os-switch button[data-os]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-os") === os)); });
      panel.querySelectorAll(".os-block").forEach(function (blk) { blk.hidden = blk.getAttribute("data-os") !== os; });
      var next = panel.querySelector('.os-block[data-os="' + os + '"] .os-switch button[data-os="' + os + '"]');
      if (next) next.focus();
      track("install_os", { os: os });
    });
  });
  // 설치 받기 링크: 플러그인 저장소의 최신 릴리스를 읽어 파일 주소·버전을 맞춘다(실패하면 페이지에 적힌 값 그대로)
  var releaseLinks = document.querySelectorAll("[data-release]");
  if ((releaseLinks.length || document.querySelector("[data-release-ver]")) && window.fetch) {
    var applyRelease = function (rel) {
      var tagVer = String(rel.tag_name || "").replace(/^v/, "");
      var pattern = { "sketchup": /\.rbz$/, "autocad-win": /autocad-win.*\.zip$/, "autocad-mac": /autocad-mac.*\.zip$/ };
      document.querySelectorAll("[data-release-ver]").forEach(function (el) { if (tagVer) el.textContent = tagVer; });
      releaseLinks.forEach(function (a) {
        var kind = a.getAttribute("data-release"), ver = tagVer;
        var ac = /^archicad-(\d+)-(win|mac)$/.exec(kind);   // Archicad는 버전·OS마다 파일 하나(Gorani-<판>-Archicad30-mac.zip)
        var re = pattern[kind] || (ac && new RegExp("Archicad" + ac[1] + "-" + ac[2] + "\\.zip$"));
        if (re) {
          var asset = (rel.assets || []).filter(function (x) { return re.test(x.name); })[0];
          if (!asset) return;
          a.href = asset.browser_download_url;
          ver = (asset.name.match(/(\d+\.\d+\.\d+)/) || [])[1] || tagVer;
        }
        var span = a.querySelector(".ver");
        if (span && ver) span.textContent = ver;
      });
    };
    var cached = null;   // 10분만 재사용한다(새 릴리스가 열어 둔 탭에도 곧 반영되게)
    try { cached = JSON.parse(sessionStorage.getItem("gorani-release") || "null"); } catch (e) {}
    if (cached && !(Date.now() - (cached.at || 0) < 600000)) cached = null;
    if (cached) applyRelease(cached);
    else fetch("https://api.github.com/repos/969flash/gorani-plugin/releases/latest")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rel) {
        if (!rel || !rel.tag_name) return;
        var slim = { at: Date.now(), tag_name: rel.tag_name, assets: (rel.assets || []).map(function (x) { return { name: x.name, browser_download_url: x.browser_download_url }; }) };
        try { sessionStorage.setItem("gorani-release", JSON.stringify(slim)); } catch (e) {}
        applyRelease(slim);
      })
      .catch(function () {});
  }

  // ── 버전 기록: 3D 프로그램별 구분 + 깃 업데이트 스타일(타임라인·미터 바) ──
  var timelineEl = document.querySelector(".gh-timeline");
  var filterWrap = document.querySelector(".changelog-filter");
  if (timelineEl && window.fetch) {
    var pageCode = { ko: "ko", en: "en", ja: "ja", zh: "zh", es: "es" }[pageLang] || "en";
    var base = (document.querySelector('script[src*="site.js"]') || {}).src || location.href;
    var assetsDir = base.replace(/\/?[^\/]*$/, "/");
    var esc2 = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var getJson = function (url) { return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };

    function classifyTool(str) {
      var s = String(str).toLowerCase();
      if (/rhino|라이노|ライノ/.test(s)) return "rhino";
      if (/sketchup|스케치업|スケッチアップ/.test(s)) return "sketchup";
      if (/blender|블렌더|ブレンダー/.test(s)) return "blender";
      if (/autocad|오토캐드|オートキャド/.test(s)) return "autocad";
      if (/archicad|아키캐드|アー키캐드/.test(s)) return "archicad";
      return "common";
    }

    var GROUP_LABELS = ({
      ko: { "new": "새 기능", improved: "개선", stable: "안정성" },
      en: { "new": "New", improved: "Improvements", stable: "Stability" },
      ja: { "new": "新機能", improved: "改善", stable: "安定性" },
      zh: { "new": "新功能", improved: "改进", stable: "稳定性" },
      es: { "new": "Novedades", improved: "Mejoras", stable: "Estabilidad" }
    })[pageCode] || { "new": "New", improved: "Improvements", stable: "Stability" };

    function formatMonth(dateStr) {
      var parts = String(dateStr).split("-");
      var y = parts[0], m = parseInt(parts[1], 10);
      if (!y || isNaN(m)) return "";
      var enMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      if (pageCode === "ko") return y + "년 " + m + "월";
      if (pageCode === "ja" || pageCode === "zh") return y + "年" + m + "月";
      if (pageCode === "es") {
        var esMonths = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
        return esMonths[m - 1] + " de " + y;
      }
      return enMonths[m - 1] + " " + y;
    }

    Promise.all([
      getJson(new URL("changelog.json", base).href),
      getJson("https://huggingface.co/datasets/hooooooooon/urbandesigntool-data/resolve/main/manifest.json")
    ]).then(function (res) {
      var list = Array.isArray(res[0]) ? res[0].slice() : [];
      var up = res[1] && res[1].update;
      // 플러그인 창에 뜨는 업데이트 안내(매니페스트 update)가 원본이다 — 같은 글이 두 곳에 뜨게 한다.
      // groups(새 기능·개선·안정성)가 있으면 그 판의 기록을 매니페스트 글로 바꾸고, 없는 옛 매니페스트면 changelog.json 글을 그대로 쓴다
      if (up && up.latest && (up.groups || up.items)) {
        var at = list.map(function (e) { return e.version; }).indexOf(up.latest);
        if (at === -1) list.unshift({ version: up.latest, date: up.date || "", items: up.items, groups: up.groups });
        else if (up.groups) list[at] = Object.assign({}, list[at], { date: up.date || list[at].date, groups: up.groups });
      }
      if (!list.length) return;

      var lastMonth = "";
      var html = "";

      list.forEach(function (e, releaseIdx) {
        var items = (e.items && (e.items[pageCode] || e.items.en)) || [];
        var monthKey = e.date ? e.date.slice(0, 7) : "";
        var monthLabel = e.date ? formatMonth(e.date) : "";

        if (monthKey && monthKey !== lastMonth) {
          lastMonth = monthKey;
          html += '<div class="gh-month-divider" data-month="' + esc2(monthKey) + '">' +
            '<span class="gh-month-label">' + esc2(monthLabel) + '</span>' +
            '<span class="gh-month-line" aria-hidden="true"></span>' +
            '</div>';
        }

        // 카드 안은 분류(새 기능·개선·안정성)로 나눈다. 분류가 없는 항목(매니페스트에서 자동으로 붙은 최신 배포)은 한 덩어리로 보인다
        var groups = Array.isArray(e.groups)
          ? e.groups.map(function (g) { return { type: g.type, items: (g.items && (g.items[pageCode] || g.items.en)) || [], hosts: g.hosts || [] }; })
          : [{ type: "", items: items }];
        // 항목마다 보일 프로그램(hosts, 플러그인 안내와 같은 값)이 있으면 그 합집합 — 하나라도 "모두"인 항목이 있으면 모든 프로그램
        var ALL_TOOLS = ["rhino", "sketchup", "blender", "autocad"], presentTools = [];
        if (Array.isArray(e.groups)) {
          groups.forEach(function (g) {
            g.items.forEach(function (_, i) {
              (g.hosts[i] || ALL_TOOLS).forEach(function (k) { if (presentTools.indexOf(k) === -1) presentTools.push(k); });
            });
          });
        } else if (e.tools) presentTools = Object.keys(e.tools);
        if (!presentTools.length) {
          items.forEach(function (t) { var k = classifyTool(t); if (k !== "common" && presentTools.indexOf(k) === -1) presentTools.push(k); });
        }
        if (!presentTools.length) presentTools = ["common"];

        var isOlder = releaseIdx >= 4;

        html += '<div class="gh-entry' + (isOlder ? ' gh-older' : '') + '"' +
          ' data-version="' + esc2(e.version) + '"' +
          ' data-tools="' + esc2(presentTools.join(" ")) + '"' +
          ' data-month="' + esc2(monthKey) + '"' +
          (isOlder ? ' hidden' : '') + '>';

        html += '<div class="gh-node" aria-hidden="true">' +
          '<div class="gh-node-line"></div>' +
          '<div class="gh-node-dot"></div>' +
          '</div>';

        html += '<div class="gh-body">' +
          '<div class="gh-head">' +
          '<h3 class="gh-title">Gorani ' + esc2(e.version) + '</h3>' +
          (e.date ? '<time class="gh-date" datetime="' + esc2(e.date) + '">' + esc2(e.date) + '</time>' : '') +
          '</div>';

        html += '<div class="gh-card">';
        groups.forEach(function (g) {
          if (!g.items.length) return;
          html += '<div class="gh-tool-row" data-group="' + esc2(g.type) + '">' +
            (g.type && GROUP_LABELS[g.type] ? '<div class="gh-tool-name">' + esc2(GROUP_LABELS[g.type]) + '</div>' : '') +
            '<ul class="gh-changes">' +
            g.items.map(function (txt, i) { return '<li' + (g.hosts[i] ? ' data-hosts="' + esc2(g.hosts[i].join(" ")) + '"' : "") + '>' + esc2(txt) + '</li>'; }).join("") +
            '</ul></div>';
        });
        html += '</div></div></div>';
      });

      timelineEl.innerHTML = html;

      var moreWrap = null;
      if (list.length > 4) {
        moreWrap = document.createElement("div");
        moreWrap.className = "changelog-more-wrap";
        var moreBtn = document.createElement("button");
        moreBtn.type = "button";
        moreBtn.className = "btn changelog-more";
        moreBtn.textContent = timelineEl.getAttribute("data-more") || "이전 버전 더 보기";
        moreBtn.addEventListener("click", function () {
          timelineEl.querySelectorAll(".gh-entry.gh-older").forEach(function (el) {
            el.hidden = false;
            el.classList.remove("gh-older");
          });
          moreWrap.remove();
          moreWrap = null;
          updateFilterView(currentFilter);
        });
        moreWrap.appendChild(moreBtn);
        timelineEl.after(moreWrap);
      }

      var currentFilter = "all";
      function updateFilterView(filter) {
        currentFilter = filter;
        var entries = [].slice.call(timelineEl.querySelectorAll(".gh-entry"));
        var months = [].slice.call(timelineEl.querySelectorAll(".gh-month-divider"));

        entries.forEach(function (entry) {
          var isOlder = entry.classList.contains("gh-older");
          var toolsAttr = (entry.getAttribute("data-tools") || "").split(" ");
          var show = filter === "all" ? !isOlder : toolsAttr.indexOf(filter) !== -1;
          entry.style.display = show ? "" : "none";
          // 프로그램을 고르면 그 프로그램에 해당하는 항목만(hosts가 없는 항목은 모두에게) 남기고, 빈 분류 줄은 숨긴다
          entry.querySelectorAll(".gh-tool-row").forEach(function (row) {
            var any = false;
            row.querySelectorAll("li").forEach(function (li) {
              var hs = li.getAttribute("data-hosts");
              var ok = filter === "all" || !hs || hs.split(" ").indexOf(filter) !== -1;
              li.style.display = ok ? "" : "none"; if (ok) any = true;
            });
            row.style.display = any ? "" : "none";
          });
        });

        months.forEach(function (mEl) {
          var mKey = mEl.getAttribute("data-month");
          var hasVisible = entries.some(function (en) {
            return en.getAttribute("data-month") === mKey && en.style.display !== "none" && !en.hidden;
          });
          mEl.style.display = hasVisible ? "" : "none";
        });

        if (moreWrap) {
          moreWrap.style.display = (filter === "all") ? "" : "none";
        }
      }

      if (filterWrap) {
        var filterBtns = [].slice.call(filterWrap.querySelectorAll("button[data-filter]"));
        filterBtns.forEach(function (btn) {
          btn.addEventListener("click", function () {
            filterBtns.forEach(function (b) { b.setAttribute("aria-selected", String(b === btn)); });
            updateFilterView(btn.getAttribute("data-filter"));
            track("changelog_filter", { tool: btn.getAttribute("data-filter") });
          });
        });
      }
    });
  }

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
    // 줄은 저절로 흐르되 손으로도 넘긴다: 밀기(트랙패드·터치)·마우스 끌기·양쪽 화살표. 손이 닿으면 잠깐 멈췄다가 다시 흐른다
    (function () {
      var sets = countryRow.querySelectorAll(".country-set"), SPEED = 36, HOLD = 3000;   // 36 px/s = 예전 40초에 한 벌
      var setW = 0, pos = 0, last = 0, holdUntil = 0, hovering = false, visible = true, down = null, moved = false;
      var measure = function () { setW = !reduce.matches && sets[1] && sets[1].offsetWidth ? sets[1].getBoundingClientRect().left - sets[0].getBoundingClientRect().left : 0; };
      var wrap = function () {   // 4벌 중 가운데 두 벌 안에서만 돌게 이음매에서 한 벌만큼 되돌린다(앞뒤로 모두 끝없이)
        if (!setW) return;
        if (countryRow.scrollLeft >= setW * 2.5) { countryRow.scrollLeft -= setW; pos = countryRow.scrollLeft; }
        else if (countryRow.scrollLeft < setW * 0.5) { countryRow.scrollLeft += setW; pos = countryRow.scrollLeft; }
      };
      var hold = function (ms) { holdUntil = performance.now() + (ms || HOLD); };
      var tick = function (t) {
        var dt = last ? Math.min(t - last, 64) : 0; last = t;
        if (setW && visible && !hovering && !down && t > holdUntil && !countryRow.classList.contains("is-paused") && !countryRow.querySelector(":focus-visible")) {
          pos += SPEED * dt / 1000; countryRow.scrollLeft = pos; wrap();
        }
        requestAnimationFrame(tick);
      };
      countryRow.addEventListener("scroll", function () {   // 우리가 옮긴 게 아니면 손이 옮긴 것 — 거기서부터 이어 흐른다
        if (Math.abs(countryRow.scrollLeft - pos) > 1.5) { pos = countryRow.scrollLeft; hold(); wrap(); }
      }, { passive: true });
      countryRow.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") hovering = true; });
      countryRow.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { hovering = false; hold(1200); } });
      countryRow.addEventListener("wheel", function () { hold(); }, { passive: true });
      countryRow.addEventListener("touchstart", function () { hold(); }, { passive: true });
      countryRow.addEventListener("pointerdown", function (e) {   // 마우스로 끌기(터치는 브라우저가 알아서 민다)
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        down = { x: e.clientX, left: countryRow.scrollLeft, id: e.pointerId }; moved = false;
      });
      countryRow.addEventListener("pointermove", function (e) {
        if (!down) return;
        var dx = e.clientX - down.x;
        if (!moved && Math.abs(dx) < 5) return;
        if (!moved) { moved = true; countryRow.classList.add("is-dragging"); try { countryRow.setPointerCapture(down.id); } catch (err) {} }
        countryRow.scrollLeft = down.left - dx; pos = countryRow.scrollLeft; wrap();
      });
      var release = function () {
        if (!down) return;
        down = null; countryRow.classList.remove("is-dragging"); hold();
        if (moved) { var stop = function (ev) { ev.stopPropagation(); ev.preventDefault(); }; countryRow.addEventListener("click", stop, { capture: true, once: true }); setTimeout(function () { countryRow.removeEventListener("click", stop, true); }, 0); }   // 끌고 놓은 자리에서 카드가 눌리지 않게
      };
      countryRow.addEventListener("pointerup", release);
      countryRow.addEventListener("pointercancel", release);
      [].forEach.call(document.querySelectorAll(".country-nav"), function (btn) {
        btn.addEventListener("click", function () {
          var card = countryRow.querySelector(".country-card"), step = card ? (card.offsetWidth + 12) * 2 : 360;
          hold(HOLD + 1000);
          countryRow.scrollBy({ left: btn.classList.contains("prev") ? -step : step, behavior: reduce.matches ? "auto" : "smooth" });
          track("country_nav", { dir: btn.classList.contains("prev") ? "prev" : "next" });
        });
      });
      if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(countryRow);
      var start = function () { measure(); if (setW) { pos = setW; countryRow.scrollLeft = pos; } };
      start(); window.addEventListener("load", start);
      window.addEventListener("resize", function () { var old = setW; measure(); if (setW && old) { pos = pos % setW + setW; countryRow.scrollLeft = pos; } });
      if (!reduce.matches) requestAnimationFrame(tick);
    })();
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
  var DEMO_START = 4.15;
  var firstPlayback = true;
  var END = 49.67;   // 영상 길이(초)

  // 설명 자막 — [시작, 끝, 한국어, 영어], *강조*
  var CAPTIONS = [
    [0.0, 4.15, "명령창에 *Gorani*를 입력해 패널을 엽니다.", "Type *Gorani* in the command line to open the panel."],
    [4.15, 7.8, "필지를 직접 선택하거나, 대상지의 경계를 그릴 수 있습니다.", "Choose parcels directly, or draw the site's boundary."],
    [7.8, 11.58, "범위와 옵션을 정해 3D 모델을 만듭니다.", "Set the range and options to build the 3D model."],
    [11.58, 16.98, "건물과 도로, 지형 자료를 불러옵니다.", "Gorani fetches buildings, roads and terrain."],
    [16.98, 25.1, "결과가 열린 Rhino 문서에 레이어별로 들어옵니다.", "The result lands in the open Rhino file, layer by layer."],
    [25.1, 31.33, "베이스맵과 분석 자료를 생성합니다.", "Generate the basemap and analysis materials."],
    [31.33, 42.63, "만든 도면을 패널에서 미리 봅니다.", "Preview the drawings in the panel."],
    [42.63, 49.3, "다이어그램의 스타일을 변경하고 나만의 스타일을 저장할 수 있습니다.", "Change the diagram style and save your own style."]
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
