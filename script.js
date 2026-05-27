/* =====================================================
   Tetsuography — script.js
===================================================== */

/* ─── Config ──────────────────────────────────── */
const IMAGES_JSON = "./images.json";
const THUMBS_DIR  = "images/thumb/";
const FULL_DIR    = "images/full/";
const ZOOM        = 3;
const LERP        = 0.16;
const SMOOTH      = true;

/* ─── DOM ─────────────────────────────────────── */
const masonryEl        = document.getElementById("masonry");
const mobileMenuToggle = document.getElementById("mobileMenuToggle");
const mobileMenu       = document.getElementById("mobileMenu");
const cursorEl         = document.getElementById("cursor");
const lightboxEl       = document.getElementById("lightbox");
const lbImg            = document.getElementById("lbImg");
const lbClose          = document.getElementById("lbClose");
const lbPrev           = document.getElementById("lbPrev");
const lbNext           = document.getElementById("lbNext");
const lbCounter        = document.getElementById("lbCounter");

/* Probe div: CSS var() → px */
const __probe = document.createElement("div");
__probe.style.cssText = "position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;height:0;";
document.body.appendChild(__probe);

/* UI Lens (magnifier) */
const uiLens = document.createElement("div");
uiLens.className = "ui-lens";
uiLens.innerHTML = `<div class="ui-lens-inner"></div>`;
document.body.appendChild(uiLens);
const uiLensInner = uiLens.querySelector(".ui-lens-inner");
const uiClose = lbClose.cloneNode(true);
const uiPrev  = lbPrev.cloneNode(true);
const uiNext  = lbNext.cloneNode(true);
[uiClose, uiPrev, uiNext].forEach(b => {
  b.removeAttribute("id");
  b.classList.add("ui-lens-btn");
});
uiLensInner.append(uiClose, uiPrev, uiNext);

/* ─── State ───────────────────────────────────── */
let IMAGES = [], items = [];
let mouseX = 0, mouseY = 0, cursorX = 0, cursorY = 0;
let activeHoverImg = null;
let activeIndex    = -1;
let suppressClick  = false;
let lastRafTime    = 0;

/* ─── Helpers ─────────────────────────────────── */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function getColumns(W) {
  if (W >= 1180) return 6;
  if (W >= 960)  return 5;
  if (W >= 720)  return 4;
  if (W >= 560)  return 3;
  return 2;
}

function cssPx(name, fallback) {
  __probe.style.width = `var(${name})`;
  const px = __probe.getBoundingClientRect().width;
  return (isFinite(px) && px > 0) ? px : fallback;
}

const gapX = () => cssPx("--gap",   150);
const gapY = () => cssPx("--gap-y", 110);

function thumbUrl(e) { return THUMBS_DIR + (e.thumb || e.file); }
function fullUrl(e)  { return FULL_DIR   + e.file; }
function aspect(e)   { return (e && e.aspect > 0) ? e.aspect : 1.3; }

/* ─── Load images.json ────────────────────────── */
async function loadImages() {
  try {
    const r = await fetch(IMAGES_JSON);
    const d = await r.json();
    return Array.isArray(d.images) ? d.images : [];
  } catch (_) {
    return [];
  }
}

/* ─── Soft chronological sort ─────────────────── */
// Recent photos tend toward the top, older toward the bottom,
// but with random jitter so it's never perfectly sequential.
// NOISE = 0.25 means ±25% of total count as position jitter.
const NOISE = 0.25;

function softChronologicalSort(arr) {
  const n      = arr.length;
  const jitter = n * NOISE;

  return arr
    .slice()
    // Sort by date descending (newest first); no-date entries go to end
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return  1;
      if (!b.date) return -1;
      return b.date < a.date ? -1 : b.date > a.date ? 1 : 0;
    })
    // Add random noise to each item's rank, then re-sort
    .map((img, rank) => ({ img, score: rank + (Math.random() - 0.5) * 2 * jitter }))
    .sort((a, b) => a.score - b.score)
    .map(x => x.img);
}

/* ─── Build DOM ───────────────────────────────── */
function build() {
  masonryEl.innerHTML = "";
  items = [];
  const frag = document.createDocumentFragment();

  IMAGES.forEach((entry, i) => {
    const wrap = document.createElement("div");
    wrap.className     = "masonry-item";
    wrap.dataset.index = i;
    wrap.style.cssText = "left:0;top:0;";

    const btn = document.createElement("button");
    const img = document.createElement("img");

    // Use data-src: images load after layout, in visual order
    img.dataset.src = thumbUrl(entry);
    img.decoding    = "async";
    img.loading     = "eager"; // no native lazy-loading interference
    img.alt         = "";

    btn.appendChild(img);
    wrap.appendChild(btn);
    frag.appendChild(wrap);

    items.push({ wrap, button: btn, img, entry, aspect: aspect(entry), loaded: false });
  });

  masonryEl.appendChild(frag);
}

/* ─── Image loading ───────────────────────────── */
function revealItem(it) {
  if (it.wrap.classList.contains("is-visible")) return;
  it.wrap.classList.add("is-loaded");
  it.wrap.getBoundingClientRect(); // force reflow before transition
  requestAnimationFrame(() => requestAnimationFrame(() => {
    it.wrap.classList.add("is-visible");
  }));
}

function startLoad(img) {
  if (img.dataset.started === "1") return;
  img.dataset.started = "1";

  const idx = Number(img.closest(".masonry-item").dataset.index);
  const it  = items[idx];
  let done  = false;

  const finish = () => {
    if (done) return;
    done = true;
    if (img.naturalWidth > 0) {
      it.aspect = img.naturalWidth / img.naturalHeight;
    }
    it.loaded = true;
    scheduleLayout();
    revealItem(it);
  };

  img.onload  = finish;
  img.onerror = () => { if (!done) { done = true; revealItem(it); } };
  img.src = img.dataset.src;
  if (img.complete) finish();
}

// Load all images in visual order (top → bottom, left → right)
function loadAllImages() {
  items
    .slice()
    .sort((a, b) => {
      const dy = (parseFloat(a.wrap.style.top)  || 0) - (parseFloat(b.wrap.style.top)  || 0);
      return dy !== 0 ? dy : (parseFloat(a.wrap.style.left) || 0) - (parseFloat(b.wrap.style.left) || 0);
    })
    .forEach(it => startLoad(it.img));
}

/* ─── Layout ──────────────────────────────────── */
let __layoutQ = false;

function scheduleLayout() {
  if (__layoutQ) return;
  __layoutQ = true;
  requestAnimationFrame(() => { __layoutQ = false; layout(); });
}

function layout() {
  const gx = gapX(), gy = gapY();
  const W   = masonryEl.clientWidth;
  const MIN = 92, MAX = 260;

  let cols = getColumns(W);
  while (cols > 2 && (W - (cols - 1) * gx) / cols < MIN) cols--;

  const colW     = clamp((W - (cols - 1) * gx) / cols, MIN, MAX);
  const heights  = new Array(cols).fill(0);
  const lastType = new Array(cols).fill(null);
  const runLen   = new Array(cols).fill(0);

  for (const it of items) {
    const asp = (it.aspect > 0 && isFinite(it.aspect)) ? it.aspect : 1.3;
    const h   = colW / asp;
    const t   = asp < 1 ? "P" : "L";

    // Prefer shortest column that avoids 3+ same-type run
    let col = -1, minH = Infinity;
    for (let c = 0; c < cols; c++) {
      const wouldRun = (lastType[c] === t) ? runLen[c] + 1 : 1;
      if (wouldRun <= 2 && heights[c] < minH) { col = c; minH = heights[c]; }
    }
    if (col === -1) { // fallback: just shortest
      for (let c = 0; c < cols; c++) {
        if (heights[c] < minH) { col = c; minH = heights[c]; }
      }
    }

    it.wrap.style.width    = colW + "px";
    it.wrap.style.left     = (col * (colW + gx)) + "px";
    it.wrap.style.top      = heights[col] + "px";
    it.button.style.height = h + "px";

    heights[col] += h + gy;
    runLen[col]   = (lastType[col] === t) ? runLen[col] + 1 : 1;
    lastType[col] = t;
  }

  masonryEl.style.height = Math.max(0, ...heights) + "px";

  // On first layout: unfreeze transitions, then start loading images
  if (!layout._ready) {
    layout._ready = true;
    requestAnimationFrame(() => masonryEl.classList.remove("no-move"));
    loadAllImages();
  }

  clearTimeout(layout._t);
  layout._t = setTimeout(() => masonryEl.classList.remove("is-relayouting"), 220);
  masonryEl.classList.add("is-relayouting");
}

/* ─── Lightbox ────────────────────────────────── */

// Position counter at the bottom-right corner of the photo
function positionCounter() {
  if (!lbCounter || !lightboxEl.classList.contains("is-open")) return;
  requestAnimationFrame(() => {
    const r = lbImg.getBoundingClientRect();
    if (r.width === 0) return;
    lbCounter.style.left = (r.right  - lbCounter.offsetWidth  - 10) + "px";
    lbCounter.style.top  = (r.bottom - lbCounter.offsetHeight - 10) + "px";
  });
}

function openLightbox(i) {
  activeIndex = i;
  const it = items[i];
  if (!it) return;

  // Counter: "3 / 101"
  if (lbCounter) lbCounter.textContent = `${i + 1} / ${items.length}`;

  // URL hash: zero-padded stable ID (#042) — assigned before sort, never reveals filename
  const id      = String(it.entry._id).padStart(3, "0");
  const wasOpen = lightboxEl.classList.contains("is-open");
  if (wasOpen) {
    history.replaceState(null, "", "#" + id);
  } else {
    history.pushState(null, "", "#" + id);
  }

  lbImg.style.visibility = "hidden";
  lbImg.removeAttribute("src");
  lightboxEl.classList.add("is-open");
  lightboxEl.setAttribute("aria-hidden", "false");
  document.documentElement.style.overflow = "hidden";

  const src = fullUrl(it.entry);
  const tmp = new Image();
  tmp.onload = () => {
    if (activeIndex !== i) return;
    lbImg.src = src;
    lbImg.style.visibility = "visible";
    enableLbMag();
    updateLbRotation();
    positionCounter();
  };
  tmp.src = src;

  // Preload neighbours
  const n = items.length;
  [items[(i - 1 + n) % n], items[(i + 1) % n]].forEach(nb => {
    if (nb) { const p = new Image(); p.src = fullUrl(nb.entry); }
  });

  requestAnimationFrame(() => { syncUI(); requestAnimationFrame(syncUI); });
}

function closeLightbox() {
  lightboxEl.classList.remove("is-open");
  lightboxEl.setAttribute("aria-hidden", "true");
  document.documentElement.style.overflow = "";
  document.body.classList.remove("ui-lens-on", "cursor-active", "cursor-hover");
  lbImg.style.visibility = "hidden";
  lbImg.style.transform  = "";
  lbImg.style.maxWidth   = "";
  lbImg.style.maxHeight  = "";
  lbImg.removeAttribute("src");
  activeHoverImg = null;
  cursorEl.style.backgroundImage = "none";
  history.replaceState(null, "", location.pathname + location.search);
}

function updateLbRotation() {
  const it = items[activeIndex];
  if (!it || !lightboxEl.classList.contains("is-open")) return;
  const landscape      = window.innerWidth > window.innerHeight;
  const photoLandscape = it.aspect >= 1;

  if (!landscape && photoLandscape) {
    // Rotate landscape photo 90° on portrait screen
    lbImg.style.transform = "rotate(90deg)";
    lbImg.style.maxWidth  = "88vh";
    lbImg.style.maxHeight = "96vw";
  } else {
    lbImg.style.transform = "";
    lbImg.style.maxWidth  = "min(96vw, 1400px)";
    lbImg.style.maxHeight = "88vh";
  }
}

lbClose.onclick = closeLightbox;
lbPrev.onclick  = () => openLightbox((activeIndex - 1 + items.length) % items.length);
lbNext.onclick  = () => openLightbox((activeIndex + 1) % items.length);

/* ─── Magnifier / cursor ──────────────────────── */
function syncUI() {
  [lbClose, lbPrev, lbNext].forEach((src, i) => {
    const r   = src.getBoundingClientRect();
    const dst = [uiClose, uiPrev, uiNext][i];
    Object.assign(dst.style, {
      left: r.left + "px", top: r.top + "px",
      width: r.width + "px", height: r.height + "px",
      transform: "none",
    });
  });
}

function enableLbMag() {
  activeHoverImg = lbImg;
  if (lbImg.src) cursorEl.style.backgroundImage = `url(${lbImg.src})`;
  document.body.classList.add("cursor-active", "cursor-hover");
}

function cirHit(cx, cy, r, rect) {
  const x = clamp(cx, rect.left, rect.right);
  const y = clamp(cy, rect.top,  rect.bottom);
  return (cx - x) ** 2 + (cy - y) ** 2 <= r * r;
}

function tightRect(btn, sh = 0) {
  const r  = btn.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  return {
    left:   r.left   + (parseFloat(cs.paddingLeft)   || 0) + sh,
    right:  r.right  - (parseFloat(cs.paddingRight)  || 0) - sh,
    top:    r.top    + (parseFloat(cs.paddingTop)    || 0) + sh,
    bottom: r.bottom - (parseFloat(cs.paddingBottom) || 0) - sh,
  };
}

function setUIHide(el) {
  [lbClose, lbPrev, lbNext].forEach(b => b.classList.toggle("ui-hide-real", b === el));
}

function animateCursor(now = 0) {
  // Frame-rate independent lerp: same feel at 60Hz and 120Hz
  const dt     = Math.min((now - lastRafTime) / 1000, 0.05); // seconds, capped at 50ms
  lastRafTime  = now;
  const factor = dt > 0 ? 1 - Math.pow(1 - LERP, dt * 60) : LERP;

  cursorX += (mouseX - cursorX) * factor;
  cursorY += (mouseY - cursorY) * factor;
  cursorEl.style.left = cursorX + "px";
  cursorEl.style.top  = cursorY + "px";

  const lbOpen = lightboxEl.classList.contains("is-open");
  const target = lbOpen ? lbImg : activeHoverImg;

  if (!target) {
    document.body.classList.remove("ui-lens-on");
    return requestAnimationFrame(animateCursor);
  }

  const rect = target.getBoundingClientRect();
  if (rect.width <= 0) {
    document.body.classList.remove("ui-lens-on");
    return requestAnimationFrame(animateCursor);
  }

  if (lbOpen) {
    document.body.classList.add("cursor-active", "cursor-hover");
    const r    = uiLens.offsetWidth / 2 - 6;
    const hitC = cirHit(cursorX, cursorY, r, tightRect(lbClose, 9));
    const hitP = cirHit(cursorX, cursorY, r, tightRect(lbPrev,  9));
    const hitN = cirHit(cursorX, cursorY, r, tightRect(lbNext,  9));

    if (hitC || hitP || hitN) {
      setUIHide(hitC ? lbClose : hitP ? lbPrev : lbNext);
      document.body.classList.add("ui-lens-on");
      cursorEl.style.backgroundImage = "none";
      uiLens.style.left = cursorX + "px";
      uiLens.style.top  = cursorY + "px";
      syncUI();
      const lr = uiLens.offsetWidth / 2;
      uiLensInner.style.cssText =
        `width:${innerWidth}px;height:${innerHeight}px;` +
        `transform:translate(${-(cursorX*ZOOM-lr)}px,${-(cursorY*ZOOM-lr)}px) scale(${ZOOM})`;
      return requestAnimationFrame(animateCursor);
    }

    document.body.classList.remove("ui-lens-on");
    setUIHide(null);
    const over = mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom;
    cursorEl.style.backgroundImage = (over && lbImg.src) ? `url(${lbImg.src})` : "none";
    const x = over ? mouseX - rect.left : rect.width  * 0.5;
    const y = over ? mouseY - rect.top  : rect.height * 0.5;
    const lr = cursorEl.offsetWidth / 2;
    cursorEl.style.backgroundSize     = `${rect.width*ZOOM}px ${rect.height*ZOOM}px`;
    cursorEl.style.backgroundPosition = `${-(x*ZOOM-lr)}px ${-(y*ZOOM-lr)}px`;
    return requestAnimationFrame(animateCursor);
  }

  document.body.classList.remove("ui-lens-on");
  const x = mouseX - rect.left, y = mouseY - rect.top;
  if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
    return requestAnimationFrame(animateCursor);
  }
  const lr = cursorEl.offsetWidth / 2;
  cursorEl.style.backgroundSize     = `${rect.width*ZOOM}px ${rect.height*ZOOM}px`;
  cursorEl.style.backgroundPosition = `${-(x*ZOOM-lr)}px ${-(y*ZOOM-lr)}px`;
  requestAnimationFrame(animateCursor);
}

/* ─── Events ──────────────────────────────────── */
function bind() {
  /* Mouse tracking */
  window.addEventListener("pointermove", e => {
    mouseX = e.clientX; mouseY = e.clientY;
    if (lightboxEl.classList.contains("is-open")) {
      document.body.classList.add("cursor-active", "cursor-hover"); return;
    }
    const r = masonryEl.getBoundingClientRect();
    document.body.classList.toggle("cursor-active",
      mouseX >= r.left && mouseX <= r.right && mouseY >= r.top && mouseY <= r.bottom);
  }, { passive: true, capture: true });

  /* Gallery hover */
  masonryEl.addEventListener("mouseover", e => {
    const item = e.target.closest(".masonry-item"); if (!item) return;
    masonryEl.classList.add("is-hovering");
    masonryEl.querySelectorAll(".masonry-item.is-hovered").forEach(el => el.classList.remove("is-hovered"));
    item.classList.add("is-hovered");
    const img = items[+item.dataset.index]?.img;
    if (img?.src) {
      activeHoverImg = img;
      document.body.classList.add("cursor-hover");
      cursorEl.style.backgroundImage = `url(${img.src})`;
    }
  });

  masonryEl.addEventListener("mouseout", e => {
    const item = e.target.closest(".masonry-item"); if (!item) return;
    if (e.relatedTarget?.closest?.(".masonry-item")) { item.classList.remove("is-hovered"); return; }
    item.classList.remove("is-hovered");
    masonryEl.classList.remove("is-hovering");
    activeHoverImg = null;
    document.body.classList.remove("cursor-hover");
    cursorEl.style.backgroundImage = "none";
  });

  /* Gallery click (desktop) */
  masonryEl.addEventListener("click", e => {
    if (suppressClick) return;
    const item = e.target.closest(".masonry-item"); if (!item) return;
    openLightbox(+item.dataset.index);
  });

  /* Gallery tap (mobile) */
  let tap = { x: 0, y: 0, t: 0, moved: false };
  masonryEl.addEventListener("touchstart", e => {
    const t = e.touches[0];
    tap = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false };
  }, { passive: true });
  masonryEl.addEventListener("touchmove", e => {
    if (Math.abs(e.touches[0].clientX - tap.x) > 8 ||
        Math.abs(e.touches[0].clientY - tap.y) > 8) tap.moved = true;
  }, { passive: true });
  masonryEl.addEventListener("touchend", e => {
    if (tap.moved || Date.now() - tap.t > 250) return;
    const item = e.target.closest(".masonry-item"); if (!item) return;
    suppressClick = true;
    setTimeout(() => suppressClick = false, 600);
    openLightbox(+item.dataset.index);
  }, { passive: true });

  /* Lightbox swipe (mobile) */
  let sw = { x: 0, y: 0, t: 0, moving: false };
  lightboxEl.addEventListener("touchstart", e => {
    const t = e.touches[0]; sw = { x: t.clientX, y: t.clientY, t: Date.now(), moving: false };
  }, { passive: true });
  lightboxEl.addEventListener("touchmove", e => { if (e.touches.length === 1) sw.moving = true; }, { passive: true });
  lightboxEl.addEventListener("touchend", e => {
    if (!sw.moving || !lightboxEl.classList.contains("is-open")) return;
    const ch = e.changedTouches[0];
    const dx = ch.clientX - sw.x, dy = ch.clientY - sw.y;
    if (Date.now() - sw.t > 400 || Math.abs(dx) < 48) return;
    const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    if (ang > 40 && ang < 140) return; // vertical swipe = ignore
    openLightbox(dx < 0 ? (activeIndex + 1) % items.length : (activeIndex - 1 + items.length) % items.length);
  }, { passive: true });

  /* Keyboard */
  window.addEventListener("keydown", e => {
    if (!lightboxEl.classList.contains("is-open")) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  openLightbox((activeIndex - 1 + items.length) % items.length);
    if (e.key === "ArrowRight") openLightbox((activeIndex + 1) % items.length);
  });

  /* Resize */
  window.addEventListener("resize", () => {
    scheduleLayout();
    if (lightboxEl.classList.contains("is-open")) { syncUI(); updateLbRotation(); positionCounter(); }
  });

  /* Back button closes lightbox */
  window.addEventListener("popstate", () => {
    if (lightboxEl.classList.contains("is-open")) closeLightbox();
  });

  /* Mobile hamburger menu */
  if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener("click", () => {
      const open = mobileMenu.classList.toggle("is-open");
      mobileMenuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
}

/* ─── Smooth scroll ───────────────────────────── */
function setupSmoothScroll() {
  if (!SMOOTH) return;
  let target = scrollY, current = scrollY, going = false;
  const raf = () => {
    going = true;
    current += (target - current) * 0.12;
    scrollTo(0, current);
    if (Math.abs(target - current) > 0.5) requestAnimationFrame(raf);
    else going = false;
  };
  window.addEventListener("wheel", e => {
    if (lightboxEl.classList.contains("is-open")) return;
    e.preventDefault();
    target = clamp(target + e.deltaY, 0, document.body.scrollHeight - innerHeight);
    if (!going) requestAnimationFrame(raf);
  }, { passive: false });
}

/* ─── Init ────────────────────────────────────── */
(async () => {
  IMAGES = await loadImages();
  IMAGES.forEach((img, i) => { img._id = i; }); // stable ID before sort
  IMAGES = softChronologicalSort(IMAGES);
  build();
  bind();
  masonryEl.classList.add("no-move");
  scheduleLayout();   // layout() → on first run → loadAllImages()
  setupSmoothScroll();
  animateCursor();

  // Auto-open photo from URL hash (e.g. shared link like #042)
  const hash = location.hash.slice(1);
  if (hash) {
    const id  = parseInt(hash, 10);
    const idx = isNaN(id) ? -1 : items.findIndex(it => it.entry._id === id);
    if (idx >= 0) setTimeout(() => openLightbox(idx), 350);
  }
})();
