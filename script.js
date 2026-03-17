/* =====================================================
   Tetsuography
   - centered masonry
   - per-image fade-in
   - hover / cursor / lightbox
   - thumb for grid / full for lightbox
===================================================== */

/* =========================
   Config
========================= */
const IMAGES_JSON_PATH = "./images.json";
const THUMBS_DIR = "images/thumb/";
const FULL_DIR = "images/full/";
const ENABLE_SMOOTH_SCROLL = true;
const zoom = 3;
const CURSOR_LERP = 0.3;

/* =========================
   DOM refs
========================= */
const masonryEl = document.getElementById("masonry");
const mobileMenuToggle = document.getElementById("mobileMenuToggle");
const mobileMenu = document.getElementById("mobileMenu");
const cursorEl = document.getElementById("cursor");
const lightboxEl = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbClose = document.getElementById("lbClose");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");

// Probe div: resolves CSS var()/clamp() values to px
const __probe = document.createElement("div");
__probe.style.cssText =
  "position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;height:0;";
document.body.appendChild(__probe);

/* =========================
   UI Lens (magnify X/arrows)
========================= */
const uiLens = document.createElement("div");
uiLens.className = "ui-lens";
uiLens.innerHTML = `<div class="ui-lens-inner"></div>`;
document.body.appendChild(uiLens);

const uiLensInner = uiLens.querySelector(".ui-lens-inner");

const uiClose = lbClose.cloneNode(true);
const uiPrev = lbPrev.cloneNode(true);
const uiNext = lbNext.cloneNode(true);

uiClose.removeAttribute("id");
uiPrev.removeAttribute("id");
uiNext.removeAttribute("id");

uiClose.classList.add("ui-lens-btn");
uiPrev.classList.add("ui-lens-btn");
uiNext.classList.add("ui-lens-btn");

uiLensInner.append(uiClose, uiPrev, uiNext);

function syncUILens() {
  const a = lbClose.getBoundingClientRect();
  const b = lbPrev.getBoundingClientRect();
  const c = lbNext.getBoundingClientRect();

  Object.assign(uiClose.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px" });
  Object.assign(uiPrev.style,  { left: b.left + "px", top: b.top + "px", width: b.width + "px", height: b.height + "px" });
  Object.assign(uiNext.style,  { left: c.left + "px", top: c.top + "px", width: c.width + "px", height: c.height + "px" });

  uiClose.style.transform = "none";
  uiPrev.style.transform = "none";
  uiNext.style.transform = "none";
}

/* =========================
   State
========================= */
let mouseX = 0;
let mouseY = 0;
let cursorX = 0;
let cursorY = 0;
let activeHoverImg = null;
let activeIndex = -1;
let initialMixed = false;
let IMAGES = [];
let items = [];

/* =========================
   Helpers
========================= */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getColumnsAuto(W) {
  if (W <= 720)  return 2;
  if (W >= 1180) return 6;
  if (W >= 960)  return 5;
  if (W >= 720)  return 4;
  if (W >= 560)  return 3;
  return 2;
}

function cssPx(name, fallback) {
  __probe.style.width = `var(${name})`;
  const px = __probe.getBoundingClientRect().width;
  return Number.isFinite(px) && px > 0 ? px : fallback;
}

function gapX() { return cssPx("--gap",   150); }
function gapY() { return cssPx("--gap-y", 110); }

function thumbUrl(entry) {
  if (typeof entry === "string") return THUMBS_DIR + entry;
  return THUMBS_DIR + (entry.thumb || entry.file);
}

function fullUrl(entry) {
  const file = typeof entry === "string" ? entry : entry.file;
  return FULL_DIR + file;
}

function entryAspect(entry) {
  if (typeof entry === "string") return 1.3;
  return entry.aspect || 1.3;
}

function entryType(entry) {
  return entryAspect(entry) < 1 ? "P" : "L";
}

/* =========================
   Load images.json
========================= */
async function loadImages() {
  try {
    const r = await fetch(IMAGES_JSON_PATH, { cache: "no-store" });
    const d = await r.json();
    if (Array.isArray(d.images)) return d.images;
    if (Array.isArray(d.files)) return d.files.map((f) => ({ file: f, chapter: "main" }));
  } catch (e) {}
  return [];
}

/* =========================
   Initial ordering
========================= */
function initialMixOnce() {
  if (initialMixed) return;
  initialMixed = true;

  const list = IMAGES.slice();
  let P = list.filter((e) => entryType(e) === "P");
  let L = list.filter((e) => entryType(e) === "L");

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  shuffle(P);
  shuffle(L);

  const ordered = [];

  function currentRunType() {
    if (!ordered.length) return null;
    return entryType(ordered[ordered.length - 1]);
  }

  function currentRunLength() {
    if (!ordered.length) return 0;
    const t = entryType(ordered[ordered.length - 1]);
    let run = 1;
    for (let i = ordered.length - 2; i >= 0; i--) {
      if (entryType(ordered[i]) === t) run++;
      else break;
    }
    return run;
  }

  function take(type) {
    if (type === "P") return P.length ? P.shift() : null;
    return L.length ? L.shift() : null;
  }

  while (P.length || L.length) {
    const lastType = currentRunType();
    const run = currentRunLength();
    const pLeft = P.length;
    const lLeft = L.length;
    let next = null;

    if (!lastType) {
      next = pLeft >= lLeft ? take("P") : take("L");
    } else {
      const opposite = lastType === "P" ? "L" : "P";

      if (opposite === "P" && pLeft > 0) next = take("P");
      if (opposite === "L" && lLeft > 0) next = take("L");

      if (!next) {
        if (lastType === "P" && pLeft > 0) next = take("P");
        if (lastType === "L" && lLeft > 0) next = take("L");
      }

      if (run >= 2 && next && entryType(next) === lastType) {
        const altAvailable = opposite === "P" ? pLeft > 0 : lLeft > 0;
        if (altAvailable) {
          if (entryType(next) === "P") P.unshift(next);
          else L.unshift(next);
          next = opposite === "P" ? take("P") : take("L");
        }
      }
    }

    if (!next) break;
    ordered.push(next);
  }

  function triplesCount(arr) {
    let run = 1, triples = 0;
    for (let i = 1; i < arr.length; i++) {
      run = entryType(arr[i]) === entryType(arr[i - 1]) ? run + 1 : 1;
      if (run === 3) triples++;
    }
    return triples;
  }

  function breakGlobalRuns(arr, maxRun = 2) {
    let run = 1;
    for (let i = 1; i < arr.length; i++) {
      const prev = entryType(arr[i - 1]);
      const cur  = entryType(arr[i]);
      run = prev === cur ? run + 1 : 1;

      if (run > maxRun) {
        const want = cur === "P" ? "L" : "P";
        let j = -1;
        for (let d = 1; d <= 80; d++) {
          const r = i + d, l = i - d;
          if (r < arr.length && entryType(arr[r]) === want) { j = r; break; }
          if (l >= 0          && entryType(arr[l]) === want) { j = l; break; }
        }
        if (j !== -1) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          i = Math.max(1, i - 2);
          run = 1;
        } else {
          run = maxRun;
        }
      }
    }
  }

  function softenTriples(arr) {
    const n = arr.length;
    for (let i = 2; i < n; i++) {
      const a = entryType(arr[i - 2]);
      const b = entryType(arr[i - 1]);
      const c = entryType(arr[i]);
      if (!(a === b && b === c)) continue;

      const want = c === "P" ? "L" : "P";
      let swapped = false;

      for (let d = 1; d <= 80; d++) {
        const r = i + d, l = i - d;
        if (r < n && entryType(arr[r]) === want) { [arr[i], arr[r]] = [arr[r], arr[i]]; swapped = true; break; }
        if (l >= 0 && entryType(arr[l]) === want) { [arr[i], arr[l]] = [arr[l], arr[i]]; swapped = true; break; }
      }

      if (swapped) i = Math.max(2, i - 3);
    }
  }

  breakGlobalRuns(ordered, 2);

  for (let k = 0; k < 12; k++) {
    const before = triplesCount(ordered);
    softenTriples(ordered);
    breakGlobalRuns(ordered, 2);
    const after = triplesCount(ordered);
    if (after >= before) break;
  }

  IMAGES = ordered;
}

/* =========================
   Build DOM
========================= */
function build() {
  masonryEl.innerHTML = "";
  items = [];

  const frag = document.createDocumentFragment();

  IMAGES.forEach((entry, i) => {
    const wrap = document.createElement("div");
    wrap.className = "masonry-item";
    wrap.dataset.index = i;
    wrap.style.left = "0px";
    wrap.style.top = "0px";

    const btn = document.createElement("button");
    const img = document.createElement("img");

    img.dataset.src = thumbUrl(entry);
    img.decoding = "async";

    const FIRST_EAGER = 6;
    if (i < FIRST_EAGER) {
      img.loading = "eager";
      img.fetchPriority = "high";
    } else {
      img.loading = "lazy";
      img.fetchPriority = "auto";
    }

    btn.appendChild(img);
    wrap.appendChild(btn);
    frag.appendChild(wrap);

    items.push({ wrap, button: btn, img, name: entry, aspect: entryAspect(entry), loaded: false });
  });

  masonryEl.appendChild(frag);
}

/* =========================
   Lazy / fade in
========================= */
let lazyIO = null;

function revealItem(it) {
  if (it.wrap.classList.contains("is-visible")) return;
  it.wrap.classList.add("is-loaded");
  it.wrap.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      it.wrap.classList.add("is-visible");
    });
  });
}

function startLoad(img) {
  if (img.dataset.started === "1") return;
  img.dataset.started = "1";

  const idx = Number(img.closest(".masonry-item").dataset.index);
  const it = items[idx];
  let finished = false;

  const done = async () => {
    if (finished) return;
    finished = true;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      it.aspect = img.naturalWidth / img.naturalHeight;
    }
    it.loaded = true;
    scheduleLayout();
    try { if (img.decode) await img.decode(); } catch (e) {}
    revealItem(it);
  };

  img.onload = done;
  img.onerror = () => {
    if (finished) return;
    finished = true;
    it.loaded = false;
    it.wrap.classList.add("is-error");
    console.warn("Image failed to load:", img.dataset.src);
    revealItem(it);
  };

  img.src = img.dataset.src;
  if (img.complete) done();
}

function lazy() {
  lazyIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target;
        lazyIO.unobserve(img);
        startLoad(img);
      }
    },
    { rootMargin: "1000px" }
  );
  items.forEach((it) => lazyIO.observe(it.img));
}

/* =========================
   Layout queue
========================= */
let __layoutQueued = false;
function scheduleLayout() {
  if (__layoutQueued) return;
  __layoutQueued = true;
  requestAnimationFrame(() => {
    __layoutQueued = false;
    layout();
  });
}

/* =========================
   Masonry layout
========================= */
function layout() {
  masonryEl.classList.add("is-relayouting");

  const gx = gapX();
  const gy = gapY();
  const W = masonryEl.clientWidth;
  const minCol = 92;
  const maxCol = 260;

  let cols = getColumnsAuto(W);
  while (cols > 2) {
    const colWtest = (W - (cols - 1) * gx) / cols;
    if (colWtest >= minCol) break;
    cols -= 1;
  }

  let colW = clamp((W - (cols - 1) * gx) / cols, minCol, maxCol);
  const heights = new Array(cols).fill(0);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const aspect = it.aspect && isFinite(it.aspect) && it.aspect > 0 ? it.aspect : 1.3;
    const h = colW / aspect;

    let c = 0;
    for (let j = 1; j < cols; j++) {
      if (heights[j] < heights[c]) c = j;
    }

    const x = c * (colW + gx);
    const y = heights[c];

    it.wrap.style.width  = colW + "px";
    it.wrap.style.left   = x + "px";
    it.wrap.style.top    = y + "px";
    it.button.style.height = h + "px";

    heights[c] = y + h + gy;
  }

  masonryEl.style.height = Math.max(...heights, 0) + "px";

  if (!layout._didUnfreeze) {
    layout._didUnfreeze = true;
    requestAnimationFrame(() => masonryEl.classList.remove("no-move"));
  }

  clearTimeout(layout._t);
  layout._t = setTimeout(() => masonryEl.classList.remove("is-relayouting"), 220);
}

/* =========================
   Preload for lightbox
========================= */
function preloadImage(url) {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

function preloadNeighbors(index) {
  if (!items.length) return;
  const n = items.length;
  const prevName = items[(index - 1 + n) % n]?.name;
  const nextName = items[(index + 1) % n]?.name;
  if (prevName) preloadImage(fullUrl(prevName));
  if (nextName) preloadImage(fullUrl(nextName));
}

/* =========================
   Magnifier
========================= */
function activateCursor(img) {
  activeHoverImg = img;
  document.body.classList.add("cursor-hover");
  cursorEl.style.backgroundImage = `url(${img.src})`;
}

function deactivateCursor() {
  activeHoverImg = null;
  document.body.classList.remove("cursor-hover");
  cursorEl.style.backgroundImage = "none";
}

function circleIntersectsRect(cx, cy, r, rect) {
  const x = Math.max(rect.left, Math.min(cx, rect.right));
  const y = Math.max(rect.top,  Math.min(cy, rect.bottom));
  const dx = cx - x, dy = cy - y;
  return dx * dx + dy * dy <= r * r;
}

function tightRect(btn, extra = 0) {
  const r  = btn.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  return {
    left:   r.left   + (parseFloat(cs.paddingLeft)   || 0) + extra,
    right:  r.right  - (parseFloat(cs.paddingRight)  || 0) - extra,
    top:    r.top    + (parseFloat(cs.paddingTop)    || 0) + extra,
    bottom: r.bottom - (parseFloat(cs.paddingBottom) || 0) - extra,
  };
}

function setUIHideTarget(el) {
  [lbClose, lbPrev, lbNext].forEach((btn) => {
    btn.classList.toggle("ui-hide-real", btn === el);
  });
}

function animateCursor() {
  cursorX += (mouseX - cursorX) * CURSOR_LERP;
  cursorY += (mouseY - cursorY) * CURSOR_LERP;

  cursorEl.style.left = cursorX + "px";
  cursorEl.style.top  = cursorY + "px";

  const lightboxOpen = lightboxEl.classList.contains("is-open");
  const target = lightboxOpen ? lbImg : activeHoverImg;

  if (!target) {
    document.body.classList.remove("ui-lens-on");
    requestAnimationFrame(animateCursor);
    return;
  }

  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    document.body.classList.remove("ui-lens-on");
    requestAnimationFrame(animateCursor);
    return;
  }

  if (lightboxOpen) {
    activeHoverImg = lbImg;
    document.body.classList.add("cursor-active", "cursor-hover");

    const cx = cursorX, cy = cursorY;
    const rUI = uiLens.offsetWidth / 2 - 6;
    const shrink = 9;

    const hitClose = circleIntersectsRect(cx, cy, rUI, tightRect(lbClose, shrink));
    const hitPrev  = circleIntersectsRect(cx, cy, rUI, tightRect(lbPrev,  shrink));
    const hitNext  = circleIntersectsRect(cx, cy, rUI, tightRect(lbNext,  shrink));
    const overUI   = hitClose || hitPrev || hitNext;

    const overImg =
      mouseX >= rect.left && mouseX <= rect.right &&
      mouseY >= rect.top  && mouseY <= rect.bottom;

    if (overUI) {
      const realBtn = hitClose ? lbClose : hitPrev ? lbPrev : lbNext;
      setUIHideTarget(realBtn);
      document.body.classList.add("ui-lens-on");
      cursorEl.style.backgroundImage = "none";

      uiLens.style.left = cx + "px";
      uiLens.style.top  = cy + "px";
      syncUILens();

      const lensRadius = uiLens.offsetWidth / 2;
      const tx = -(cx * zoom - lensRadius);
      const ty = -(cy * zoom - lensRadius);
      uiLensInner.style.width  = window.innerWidth  + "px";
      uiLensInner.style.height = window.innerHeight + "px";
      uiLensInner.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;

      requestAnimationFrame(animateCursor);
      return;
    }

    document.body.classList.remove("ui-lens-on");
    setUIHideTarget(null);

    cursorEl.style.backgroundImage = overImg && lbImg.src ? `url(${lbImg.src})` : "none";

    const x = overImg ? mouseX - rect.left : rect.width  * 0.5;
    const y = overImg ? mouseY - rect.top  : rect.height * 0.5;

    const lensRadius = cursorEl.offsetWidth / 2;
    cursorEl.style.backgroundSize     = `${rect.width * zoom}px ${rect.height * zoom}px`;
    cursorEl.style.backgroundPosition = `${-(x * zoom - lensRadius)}px ${-(y * zoom - lensRadius)}px`;

    requestAnimationFrame(animateCursor);
    return;
  }

  document.body.classList.remove("ui-lens-on");

  const x = mouseX - rect.left;
  const y = mouseY - rect.top;

  if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
    requestAnimationFrame(animateCursor);
    return;
  }

  const lensRadius = cursorEl.offsetWidth / 2;
  cursorEl.style.backgroundSize     = `${rect.width * zoom}px ${rect.height * zoom}px`;
  cursorEl.style.backgroundPosition = `${-(x * zoom - lensRadius)}px ${-(y * zoom - lensRadius)}px`;

  requestAnimationFrame(animateCursor);
}

/* =========================
   Mobile touch tap (single tap, no scroll/hold)
========================= */
function setupMobileTap() {
  const TAP_MOVE_LIMIT = 8;   // px — more than this = scroll, not tap
  const TAP_TIME_LIMIT = 250; // ms — longer than this = hold, not tap

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let touchMoved = false;

  masonryEl.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    touchMoved = false;
  }, { passive: true });

  masonryEl.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - touchStartX);
    const dy = Math.abs(t.clientY - touchStartY);
    if (dx > TAP_MOVE_LIMIT || dy > TAP_MOVE_LIMIT) touchMoved = true;
  }, { passive: true });

  masonryEl.addEventListener("touchend", (e) => {
    if (touchMoved) return;
    if (Date.now() - touchStartTime > TAP_TIME_LIMIT) return;

    const item = e.target.closest(".masonry-item");
    if (!item) return;

    // Prevent the click event that would fire after touchend
    e.preventDefault();
    openLightbox(Number(item.dataset.index));
  }, { passive: false });
}

/* =========================
   Lightbox landscape rotation
========================= */
function updateLightboxRotation() {
  if (!lightboxEl.classList.contains("is-open")) return;

  const item = items[activeIndex];
  if (!item) return;

  const isLandscape = window.innerWidth > window.innerHeight;
  const photoIsLandscape = item.aspect >= 1;

  // Rotate landscape photos 90deg when device is in portrait,
  // or portrait photos 90deg when device is in landscape —
  // only rotate landscape photos in landscape mode to fill more space
  if (isLandscape && photoIsLandscape) {
    // landscape photo on landscape screen: no rotation needed, just maximize
    lbImg.style.transform = "none";
    lbImg.style.maxWidth  = "min(96vw, 1400px)";
    lbImg.style.maxHeight = "88vh";
  } else if (!isLandscape && photoIsLandscape) {
    // landscape photo on portrait screen: rotate 90deg to fill width
    lbImg.style.transform  = "rotate(90deg)";
    // After rotation width becomes height and vice versa
    // Use vw as the constraint so it fills the portrait screen width
    lbImg.style.maxWidth  = "88vh";
    lbImg.style.maxHeight = "96vw";
  } else {
    // portrait photo: never rotate
    lbImg.style.transform = "none";
    lbImg.style.maxWidth  = "min(96vw, 1400px)";
    lbImg.style.maxHeight = "88vh";
  }
}

/* =========================
   Events
========================= */
function bind() {
  window.addEventListener(
    "pointermove",
    (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (lightboxEl.classList.contains("is-open")) {
        document.body.classList.add("cursor-active", "cursor-hover");
        return;
      }

      const r = masonryEl.getBoundingClientRect();
      const inside =
        mouseX >= r.left && mouseX <= r.right &&
        mouseY >= r.top  && mouseY <= r.bottom;

      if (inside) document.body.classList.add("cursor-active");
      else document.body.classList.remove("cursor-active");
    },
    { passive: true, capture: true }
  );

  masonryEl.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".masonry-item");
    if (!item) return;

    masonryEl.classList.add("is-hovering");
    masonryEl.querySelectorAll(".masonry-item.is-hovered")
      .forEach((el) => el.classList.remove("is-hovered"));
    item.classList.add("is-hovered");

    const img = items[Number(item.dataset.index)]?.img;
    if (img?.src) activateCursor(img);
  });

  masonryEl.addEventListener("mouseout", (e) => {
    const item = e.target.closest(".masonry-item");
    if (!item) return;

    const to = e.relatedTarget;
    if (to?.closest?.(".masonry-item")) {
      item.classList.remove("is-hovered");
      return;
    }

    item.classList.remove("is-hovered");
    masonryEl.classList.remove("is-hovering");
    deactivateCursor();
  });

  masonryEl.addEventListener("click", (e) => {
    const item = e.target.closest(".masonry-item");
    if (!item) return;
    openLightbox(Number(item.dataset.index));
  });

  window.addEventListener("resize", () => {
    scheduleLayout();
    if (lightboxEl.classList.contains("is-open")) {
      syncUILens();
      updateLightboxRotation();
    }
  });

  // Keyboard navigation for lightbox
  window.addEventListener("keydown", (e) => {
    if (!lightboxEl.classList.contains("is-open")) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  openLightbox((activeIndex - 1 + items.length) % items.length);
    if (e.key === "ArrowRight") openLightbox((activeIndex + 1) % items.length);
  });

  // Mobile swipe to navigate lightbox
  setupLightboxSwipe();

  // Mobile single tap to open lightbox
  setupMobileTap();

  if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("is-open");
      mobileMenuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }
}

/* =========================
   Mobile swipe (lightbox)
========================= */
function setupLightboxSwipe() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isSwiping = false;

  const SWIPE_THRESHOLD = 48;
  const ANGLE_LIMIT = 40;
  const TIME_LIMIT = 400;

  lightboxEl.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    isSwiping = false;
  }, { passive: true });

  lightboxEl.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1) isSwiping = true;
  }, { passive: true });

  lightboxEl.addEventListener("touchend", (e) => {
    if (!isSwiping) return;
    if (!lightboxEl.classList.contains("is-open")) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dt = Date.now() - touchStartTime;

    if (dt > TIME_LIMIT) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    const isHorizontal = angle < ANGLE_LIMIT || angle > (180 - ANGLE_LIMIT);
    if (!isHorizontal) return;

    if (dx < 0) openLightbox((activeIndex + 1) % items.length);
    else        openLightbox((activeIndex - 1 + items.length) % items.length);
  }, { passive: true });
}

/* =========================
   Lightbox
========================= */
function enableLightboxMagnifier() {
  activeHoverImg = lbImg;
  if (lbImg.src) cursorEl.style.backgroundImage = `url(${lbImg.src})`;
  document.body.classList.add("cursor-active", "cursor-hover");
}

function disableLightboxMagnifier() {
  activeHoverImg = null;
  cursorEl.style.backgroundImage = "none";
  document.body.classList.remove("cursor-hover", "cursor-active");
}

lbImg.addEventListener("load", () => {
  if (!lightboxEl.classList.contains("is-open")) return;
  lbImg.style.visibility = "visible";
});

function closeLightbox() {
  lightboxEl.classList.remove("is-open");
  lightboxEl.setAttribute("aria-hidden", "true");
  document.documentElement.style.overflow = "";
  document.body.classList.remove("ui-lens-on");
  disableLightboxMagnifier();
  document.body.classList.remove("cursor-active");
  lbImg.style.visibility = "hidden";
  lbImg.style.transform = "none";
  lbImg.style.maxWidth  = "";
  lbImg.style.maxHeight = "";
  lbImg.removeAttribute("src");
  lbImg.src = "";
}

lbClose.onclick = closeLightbox;
lbPrev.onclick = () => openLightbox((activeIndex - 1 + items.length) % items.length);
lbNext.onclick = () => openLightbox((activeIndex + 1) % items.length);

function openLightbox(i) {
  activeIndex = i;
  const item = items[i];
  if (!item) return;

  const nextSrc = fullUrl(item.name);

  lightboxEl.classList.add("is-open");
  lightboxEl.setAttribute("aria-hidden", "false");
  document.documentElement.style.overflow = "hidden";

  disableLightboxMagnifier();
  lbImg.style.visibility = "hidden";
  lbImg.removeAttribute("src");
  lbImg.src = "";
  lbImg.alt = "";

  const img = new Image();
  img.decoding = "async";
  img.src = nextSrc;
  img.onload = () => {
    if (activeIndex !== i) return;
    lbImg.src = nextSrc;
    lbImg.style.visibility = "visible";
    updateLightboxRotation();
    enableLightboxMagnifier();
  };

  preloadNeighbors(i);
  requestAnimationFrame(() => {
    syncUILens();
    requestAnimationFrame(syncUILens);
  });
}

/* =========================
   Smooth scroll
========================= */
function setupSmoothScroll() {
  if (!ENABLE_SMOOTH_SCROLL) return;

  let target  = window.scrollY;
  let current = window.scrollY;
  let ticking = false;

  function raf() {
    ticking = true;
    current += (target - current) * 0.12;
    window.scrollTo(0, current);
    if (Math.abs(target - current) > 0.5) {
      requestAnimationFrame(raf);
    } else {
      ticking = false;
    }
  }

  window.addEventListener(
    "wheel",
    (e) => {
      if (lightboxEl.classList.contains("is-open")) return;
      e.preventDefault();
      target += e.deltaY;
      target = Math.max(0, Math.min(target, document.body.scrollHeight - innerHeight));
      if (!ticking) requestAnimationFrame(raf);
    },
    { passive: false }
  );
}

/* =========================
   Init
========================= */
(async () => {
  IMAGES = await loadImages();
  initialMixOnce();
  build();
  bind();
  masonryEl.classList.add("no-move");
  scheduleLayout();
  lazy();
  setupSmoothScroll();
  animateCursor();
})();
