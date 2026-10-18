// Gorani 소개 페이지 — 복사 버튼과 축측 도해(합성 데이터)
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

  // ── 복사 버튼 ───────────────────────────
  var live = document.getElementById("live");
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var src = btn.getAttribute("data-copy");
      var text = src.charAt(0) === "#" ? document.querySelector(src).textContent.trim() : src;
      navigator.clipboard.writeText(text).then(function () {
        btn.classList.add("done");
        if (window.gtag) gtag("event", "copy_command", { command: src.replace("#", "") });   // 설치 명령 복사 = 설치 의도
        if (live) live.textContent = btn.getAttribute("data-done") || "Copied";
        setTimeout(function () { btn.classList.remove("done"); }, 1600);
      });
    });
  });

  // ── 축측 도해 ───────────────────────────
  // 대상지(파랑) 둘레 반경 안의 필지·건물·수계·지형을 합성 데이터로 만들고, 건물이 대상지에서 바깥으로 솟는다.
  var canvas = document.getElementById("axon");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  var seed = 20261014;
  function rand() {   // mulberry32 — 매번 같은 동네
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function between(a, b) { return a + (b - a) * rand(); }

  var HALF = 1150;                                   // m — 반경 1 km를 덮는 합성 도시 반폭
  var TARGET = { w: 36, depth: 46 };                 // m — 대상지 폭·깊이
  function riverY(x) { return -470 + 60 * Math.sin(x / 240); }
  var RIVER_HALF = 55;
  var HILL = { x: 300, y: 250, r: 190, h: 42 };

  function getCuts(arterialEvery) {   // [블록 시작, 블록 끝] 목록, 원점을 지나는 블록이 가운데 오게 맞춘다
    var blocks = [], p = -HALF - 200, run = 0;
    while (p < HALF + 200) {
      run += 1;
      var road = run % arterialEvery === 0 ? between(26, 34) : between(9, 15);
      var size = between(78, 128);
      blocks.push([p + road, p + road + size]);
      p += road + size;
    }
    var hit = blocks.reduce(function (best, b) { return Math.abs((b[0] + b[1]) / 2) < Math.abs((best[0] + best[1]) / 2) ? b : best; });
    var shift = (hit[0] + hit[1]) / 2;
    return blocks.map(function (b) { return [b[0] - shift, b[1] - shift]; });
  }

  function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }   // 반시계
  function isWet(x0, y0, x1, y1) {
    return [x0, (x0 + x1) / 2, x1].some(function (x) {
      var c = riverY(x);
      return y1 > c - RIVER_HALF - 6 && y0 < c + RIVER_HALF + 6;
    });
  }

  var lots = [], buildings = [], parks = [], target = null;

  function addBuilding(pts, floors) { buildings.push({ pts: pts, h: Math.max(1, Math.round(floors)) * 3.3 }); }

  function getFloors(x, y) {
    if (Math.abs(x) < 70 && y < 0 && y > -90) return between(1, 3);   // 대상지 앞(남쪽)은 낮게 — 도해에서 대상지가 가려지지 않게
    var r = rand();
    if (r < 0.03) return between(18, 32);
    if (r < 0.16) return between(6, 14);
    return between(1.6, 5.4);
  }

  function splitRow(x0, x1, y0, y1, faceTop, isTargetRow) {
    var cuts = [x0];
    if (isTargetRow) {
      var p = x0;
      while (p + 30 < -TARGET.w / 2) { p += between(12, 24); cuts.push(p); }
      if (cuts.length > 1) cuts[cuts.length - 1] = -TARGET.w / 2; else cuts.push(-TARGET.w / 2);
      cuts.push(TARGET.w / 2);
      p = TARGET.w / 2;
      while (p + 30 < x1) { p += between(12, 24); cuts.push(p); }
    } else {
      var q = x0;
      while (q + 30 < x1) { q += between(12, 26); cuts.push(q); }
    }
    cuts.push(x1);
    for (var i = 0; i < cuts.length - 1; i++) {
      var a = cuts[i], b = cuts[i + 1];
      var lot = rect(a, y0, b, y1);
      if (isTargetRow && a === -TARGET.w / 2) { target = lot; continue; }
      lots.push(lot);
      if (rand() < 0.08) continue;                  // 빈 필지(주차장)
      var side = between(0.8, 2.2), depth = (y1 - y0) * between(0.62, 0.92);
      var by0 = faceTop ? y1 - depth : y0 + between(1, 3);
      var by1 = faceTop ? y1 - between(1, 3) : y0 + depth;
      if (b - a - 2 * side < 6) continue;
      addBuilding(rect(a + side, by0, b - side, by1), getFloors((a + b) / 2, (y0 + y1) / 2));
    }
  }

  function build() {
    var xs = getCuts(5), ys = getCuts(4);
    var targetY = ys.filter(function (b) { return b[0] < 0 && b[1] > 0; })[0];
    var dy = TARGET.depth / 2 - targetY[1];         // 대상지 행의 가운데가 원점에 오게
    ys = ys.map(function (b) { return [b[0] + dy, b[1] + dy]; });
    xs.forEach(function (bx) {
      ys.forEach(function (by) {
        var x0 = bx[0], x1 = bx[1], y0 = by[0], y1 = by[1];
        var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        var hasTarget = x0 < 0 && x1 > 0 && y0 < 0 && y1 > 0;
        if (!hasTarget && isWet(x0, y0, x1, y1)) return;
        if (!hasTarget && Math.hypot(cx - HILL.x, cy - HILL.y) < HILL.r) { parks.push(rect(x0, y0, x1, y1)); return; }
        var kind = hasTarget ? 1 : rand();
        if (kind < 0.09 && x1 - x0 > 90 && y1 - y0 > 90) {          // 아파트 단지 — 판상형 동
          lots.push(rect(x0, y0, x1, y1));
          for (var sy = y0 + 14; sy + 14 < y1 - 10; sy += between(34, 40)) {
            var len = (x1 - x0 - 28) / 2 - 6;
            addBuilding(rect(x0 + 14, sy, x0 + 14 + len, sy + 13), between(15, 25));
            addBuilding(rect(x1 - 14 - len, sy, x1 - 14, sy + 13), between(15, 25));
          }
          return;
        }
        if (kind < 0.14) {                                           // 큰 건물 하나
          lots.push(rect(x0, y0, x1, y1));
          addBuilding(rect(x0 + 9, y0 + 9, x1 - 9, y1 - 9), between(4, 9));
          return;
        }
        var mid = hasTarget ? y1 - TARGET.depth : cy + between(-8, 8);
        if (y1 - y0 < 64 && !hasTarget) { splitRow(x0, x1, y0, y1, rand() < 0.5, false); return; }
        splitRow(x0, x1, mid, y1, true, hasTarget);
        splitRow(x0, x1, y0, mid, false, false);
      });
    });
    buildings.forEach(function (b) {
      var cx = 0, cy = 0;
      b.pts.forEach(function (p) { cx += p[0] / b.pts.length; cy += p[1] / b.pts.length; });
      b.dist = Math.hypot(cx, cy);
      b.reach = Math.max.apply(null, b.pts.map(function (p) { return Math.hypot(p[0], p[1]); }));
      b.cx = cx; b.cy = cy;
    });
  }
  build();

  // ── 투영: 평면을 φ만큼 돌리고 고도 α에서 내려다본다 ──
  var PHI = 0.52, ALPHA = 0.66;
  var cosP = Math.cos(PHI), sinP = Math.sin(PHI), sinA = Math.sin(ALPHA), cosA = Math.cos(ALPHA);
  function depthOf(x, y) { return x * sinP + y * cosP; }

  var view = { r: 500, s: 1, cx: 0, cy: 0, dpr: 1 };
  function project(x, y, z) {
    var xr = x * cosP - y * sinP, yr = x * sinP + y * cosP;
    return [view.cx + view.s * xr, view.cy - view.s * (yr * sinA + z * cosA)];
  }

  var colors = {};
  function readColors() {
    var css = getComputedStyle(document.documentElement);
    ["--ink", "--ink-2", "--hair", "--surface", "--paper", "--grid-major", "--blue", "--blue-ink", "--blue-wash", "--wall-a", "--wall-b"].forEach(function (k) {
      colors[k] = css.getPropertyValue(k).trim();
    });
  }

  function fit() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    var r = view.r;
    view.s = Math.min((w * 0.86) / (2 * r), (h * 0.78) / (2 * r * sinA + 70 * cosA)) * view.dpr;
    view.cx = canvas.width / 2;
    view.cy = canvas.height * 0.56;
  }

  function path(pts, z) {
    ctx.beginPath();
    pts.forEach(function (p, i) {
      var q = project(p[0], p[1], z || 0);
      if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    });
    ctx.closePath();
  }

  function discPath(r) {
    ctx.beginPath();
    for (var i = 0; i <= 96; i++) {
      var t = (i / 96) * Math.PI * 2, q = project(r * Math.cos(t), r * Math.sin(t), 0);
      if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    }
    ctx.closePath();
  }

  function riverPts() {
    var top = [], bottom = [];
    for (var x = -HALF; x <= HALF; x += 20) { top.push([x, riverY(x) + RIVER_HALF]); bottom.unshift([x, riverY(x) - RIVER_HALF]); }
    return top.concat(bottom);
  }
  var RIVER = riverPts();

  function inDisc(pts, r) { return pts.some(function (p) { return Math.hypot(p[0], p[1]) < r + 40; }); }

  var visible = [], visibleLots = [], visibleParks = [];
  function selectVisible() {
    var r = view.r;
    visible = buildings.filter(function (b) { return b.reach < r; });   // 범위 원 안에 다 들어오는 건물만
    visible.sort(function (a, b) { return depthOf(b.cx, b.cy) - depthOf(a.cx, a.cy); });
    visibleLots = lots.filter(function (p) { return inDisc(p, r); });
    visibleParks = parks.filter(function (p) { return inDisc(p, r); });
  }

  function ease(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  function draw(elapsed) {
    var r = view.r, d = view.dpr, ppm = view.s / d;   // ppm = CSS 픽셀/미터
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineJoin = "round";

    // 바닥 원판(범위)
    discPath(r);
    ctx.fillStyle = colors["--surface"];
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = colors["--grid-major"];
    visibleParks.forEach(function (p) { path(p); ctx.fill(); });
    path(RIVER);
    ctx.fillStyle = colors["--blue-wash"]; ctx.fill();
    ctx.strokeStyle = colors["--blue-ink"]; ctx.lineWidth = 0.8 * d; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
    if (ppm > 0.45) {
      ctx.strokeStyle = colors["--hair"]; ctx.lineWidth = 0.6 * d;
      visibleLots.forEach(function (p) { path(p); ctx.stroke(); });
    }
    path(target);
    ctx.fillStyle = colors["--blue"]; ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = colors["--blue"]; ctx.lineWidth = 2 * d; ctx.stroke();
    ctx.restore();

    // 범위 원
    discPath(r);
    ctx.setLineDash([6 * d, 5 * d]);
    ctx.strokeStyle = colors["--blue"]; ctx.lineWidth = 1.2 * d; ctx.stroke();
    ctx.setLineDash([]);

    // 언덕 등고선(올려 그림)
    ctx.strokeStyle = colors["--ink-2"]; ctx.lineWidth = 0.6 * d; ctx.globalAlpha = 0.55;
    for (var cr = 40; cr < HILL.r; cr += 34) {
      var z = HILL.h * (1 - cr / HILL.r), pen = false;
      ctx.beginPath();
      for (var i = 0; i <= 72; i++) {
        var t = (i / 72) * Math.PI * 2, wob = 1 + 0.08 * Math.sin(3 * t + cr / 50);
        var x = HILL.x + cr * wob * Math.cos(t), y = HILL.y + cr * wob * Math.sin(t) * 0.8;
        if (Math.hypot(x, y) > r) { pen = false; continue; }
        var q = project(x, y, z);
        if (pen) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 건물 — 먼 것부터
    var lw = Math.max(0.35, Math.min(0.9, ppm * 0.45)) * d;
    ctx.lineWidth = lw;
    ctx.strokeStyle = colors["--ink"];
    for (var k = 0; k < visible.length; k++) {
      var b = visible[k];
      var delay = (b.dist / r) * 560, grow = ease(Math.max(0, (elapsed - delay) / 760));
      var h = b.h * grow, pts = b.pts, n = pts.length;
      if (h > 0.3) {
        for (var j = 0; j < n; j++) {
          var p0 = pts[j], p1 = pts[(j + 1) % n];
          var nx = p1[1] - p0[1], ny = -(p1[0] - p0[0]);           // 바깥 법선
          if (nx * sinP + ny * cosP >= 0) continue;                 // 등진 벽
          var a0 = project(p0[0], p0[1], 0), a1 = project(p1[0], p1[1], 0), b1 = project(p1[0], p1[1], h), b0 = project(p0[0], p0[1], h);
          ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b0[0], b0[1]); ctx.closePath();
          ctx.fillStyle = nx * cosP - ny * sinP < 0 ? colors["--wall-a"] : colors["--wall-b"];
          ctx.fill(); ctx.stroke();
        }
      }
      path(pts, h);
      ctx.fillStyle = colors["--surface"]; ctx.fill(); ctx.stroke();
    }

    // 지시선
    var site = project(0, 0, 0);
    var tag = canvas.getAttribute("data-site") || "Site";
    var lx = site[0] + 64 * d, ly = site[1] - 96 * d;
    ctx.strokeStyle = colors["--blue"]; ctx.lineWidth = 1 * d;
    ctx.beginPath(); ctx.moveTo(site[0], site[1]); ctx.lineTo(lx, ly); ctx.lineTo(lx + 12 * d, ly); ctx.stroke();
    ctx.fillStyle = colors["--blue"]; ctx.fillRect(site[0] - 2.5 * d, site[1] - 2.5 * d, 5 * d, 5 * d);
    ctx.font = "650 " + 14 * d + "px 'Pretendard Variable', Pretendard, sans-serif";
    ctx.textBaseline = "middle";
    var tw = ctx.measureText(tag).width;
    ctx.fillStyle = colors["--surface"];
    ctx.fillRect(lx + 12 * d, ly - 12 * d, tw + 12 * d, 24 * d);
    ctx.fillStyle = colors["--blue-ink"];
    ctx.fillText(tag, lx + 18 * d, ly);

    var front = project(-r * sinP, -r * cosP, 0);      // 원판의 화면 맨 아래 점
    var label = (canvas.getAttribute("data-radius") || "R {r}").replace("{r}", r >= 1000 ? r / 1000 + " km" : r + " m");
    ctx.font = "500 " + 13 * d + "px 'Pretendard Variable', Pretendard, sans-serif";
    ctx.fillStyle = colors["--blue-ink"];
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, front[0], front[1] + 8 * d);
    ctx.textAlign = "left";
  }

  var start = 0, frame = 0;
  function play() {
    cancelAnimationFrame(frame);
    if (reduce.matches) { draw(1e9); return; }
    start = performance.now();
    var tick = function (now) {
      var t = now - start;
      draw(t);
      if (t < 1500) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function setRadius(r) {
    view.r = r;
    fit();
    selectVisible();
    play();
  }

  document.querySelectorAll("[data-r]").forEach(function (cell) {
    cell.addEventListener("click", function () {
      document.querySelectorAll("[data-r]").forEach(function (c) { c.setAttribute("aria-pressed", String(c === cell)); });
      setRadius(+cell.getAttribute("data-r"));
    });
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { fit(); draw(1e9); }, 120);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { readColors(); draw(1e9); });

  readColors();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setRadius(view.r); });
})();
