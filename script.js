(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  root.classList.add("js");

  /* ---------- Button chevrons ----------
     Fills each .btn-pill with five dotted double-chevrons. Each dot gets a
     staggered delay so the wave travels left to right. */
  const CHEVRON_DOTS = [
    [2, 2, 0], [5, 5, .05], [8, 8, .1], [5, 11, .15], [2, 14, .2],
    [6, 2, .05], [9, 5, .1], [12, 8, .15], [9, 11, .2], [6, 14, .25],
  ];
  const chevronSvg = (index) => {
    const base = index * 0.12;
    const dots = CHEVRON_DOTS.map(([cx, cy, d]) =>
      `<circle class="btn-dot" cx="${cx}" cy="${cy}" r="1" style="animation-delay:${(base + d).toFixed(2)}s"/>`
    ).join("");
    return `<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" focusable="false"><g style="fill:var(--dot)">${dots}</g></svg>`;
  };
  const pillMarkup = [0, 1, 2, 3, 4].map(chevronSvg).join("");
  document.querySelectorAll(".btn-pill").forEach((pill) => { pill.innerHTML = pillMarkup; });

  /* ---------- Hero entrance ---------- */
  const markLoaded = () => requestAnimationFrame(() => root.classList.add("is-loaded"));
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(markLoaded);
  setTimeout(markLoaded, 1200); // fallback if fonts are slow

  /* ---------- Stretched letters ----------
     Any element with data-stretch="<letter index>" is split into letters and
     filled edge to edge: the extra width goes to that one letter, which is
     scaled horizontally. With a mouse, the stretch follows the cursor. */
  /* Thinning: scaleX widens a letter's vertical strokes, so it looks bolder than
     its neighbours. An SVG erode filter (horizontal only) shaves the extra off.
     Filters are shared by radius and live in one hidden <svg>. */
  // Effective stroke width (em) used to size the erosion. Bebas Neue stems are
  // ~0.13em; 0.09 thins most of the way while keeping thin diagonals (M, W) intact.
  const STEM_EM = 0.09;
  const thinFilters = new Map();
  let thinDefs = null;
  const thinFilterId = (rx) => {
    const key = String(Math.max(1, Math.round(rx)));
    if (thinFilters.has(key)) return thinFilters.get(key);
    const ns = "http://www.w3.org/2000/svg";
    if (!thinDefs) {
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.setAttribute("aria-hidden", "true");
      svg.style.position = "absolute";
      thinDefs = document.createElementNS(ns, "defs");
      svg.appendChild(thinDefs);
      document.body.appendChild(svg);
    }
    const id = `thin-${thinFilters.size + 1}`;
    const filter = document.createElementNS(ns, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("x", "-5%");
    filter.setAttribute("width", "110%");
    const erode = document.createElementNS(ns, "feMorphology");
    erode.setAttribute("operator", "erode");
    erode.setAttribute("radius", `${key} 0`);
    filter.appendChild(erode);
    thinDefs.appendChild(filter);
    thinFilters.set(key, id);
    return id;
  };

  // maxScale caps how wide the stretched letter may get (e.g. 1.5 = 150% of its width).
  // Without it, the letter grows until the line fills the element's full width.
  // thin: keep stretched letters at the normal stroke weight (static use only).
  function initStretch(el, { home: homeIndex, interactive = true, maxScale = Infinity, thin = false } = {}) {
    const text = el.textContent.trim();
    const home = Math.max(0, Math.min(text.length - 1, homeIndex ?? (Number(el.dataset.stretch) || 0)));
    el.textContent = "";
    el.classList.add("is-stretch");

    const chars = [...text].map((c, i) => {
      const ch = document.createElement("span");
      ch.className = "ch";
      ch.style.setProperty("--i", i);
      const glyph = document.createElement("span");
      glyph.className = "glyph";
      glyph.textContent = c;
      ch.appendChild(glyph);
      el.appendChild(ch);
      return { ch, glyph, nat: 0, cur: 0, target: 0 };
    });

    let extra = 0;
    let focusX = null; // cursor x within the element, or null when idle
    let raf = null;

    const weightsFor = (x) => {
      if (x === null) return chars.map((_, i) => (i === home ? 1 : 0));
      const sigma = el.clientWidth * 0.07;
      let left = 0;
      return chars.map((c) => {
        const center = left + c.cur / 2;
        left += c.cur;
        return Math.exp(-((center - x) ** 2) / (2 * sigma * sigma));
      });
    };

    const setTargets = () => {
      const w = weightsFor(focusX);
      const total = w.reduce((a, b) => a + b, 0) || 1;
      chars.forEach((c, i) => { c.target = c.nat + (extra * w[i]) / total; });
    };

    const paint = () => chars.forEach((c) => {
      c.ch.style.width = `${c.cur}px`;
      c.glyph.style.transform = `scaleX(${c.nat ? c.cur / c.nat : 1})`;
    });

    const tick = () => {
      let moving = false;
      chars.forEach((c) => {
        const d = c.target - c.cur;
        if (Math.abs(d) > 0.3) { c.cur += d * 0.14; moving = true; } else c.cur = c.target;
      });
      paint();
      raf = moving ? requestAnimationFrame(tick) : null;
    };
    const animate = () => { setTargets(); if (!raf) raf = requestAnimationFrame(tick); };

    const measure = () => {
      chars.forEach((c) => { c.ch.style.width = "auto"; c.glyph.style.transform = "none"; });
      chars.forEach((c) => { c.nat = c.glyph.offsetWidth; });
      extra = Math.max(0, el.clientWidth - chars.reduce((s, c) => s + c.nat, 0) - 1);
      extra = Math.min(extra, chars[home].nat * (maxScale - 1));
      setTargets();
      chars.forEach((c) => { c.cur = c.target; });
      paint();
      if (thin) {
        const fontSize = parseFloat(getComputedStyle(el).fontSize);
        chars.forEach((c) => {
          const scale = c.nat ? c.cur / c.nat : 1;
          // Stem grew by stem*(scale-1); erode half of that from each side.
          const rx = (fontSize * STEM_EM * (scale - 1)) / 2;
          c.ch.style.filter = rx >= 0.5 ? `url(#${thinFilterId(rx)})` : "";
        });
      }
    };

    measure();
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(measure);
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(el);

    if (interactive && finePointer && !reduceMotion) {
      el.addEventListener("pointermove", (e) => {
        focusX = e.clientX - el.getBoundingClientRect().left;
        animate();
      });
      el.addEventListener("pointerleave", () => { focusX = null; animate(); });
    }
  }
  document.querySelectorAll("[data-stretch]").forEach((el) => initStretch(el));

  /* Display headings: each line widens one random letter (new pick on every
     page load), capped at HEADING_MAX_SCALE so it stays an accent. Static, no hover. */
  const HEADING_MAX_SCALE = 1.5;
  const randomLetterIndex = (text) => {
    // Skip I/J: stretched, they read as solid blocks rather than letters.
    const letters = [...text].map((c, i) => (/\p{L}/u.test(c) && !/[ij]/i.test(c) ? i : -1)).filter((i) => i >= 0);
    return letters[Math.floor(Math.random() * letters.length)] ?? 0;
  };

  document.querySelectorAll("h1.display, h2.display").forEach((heading) => {
    const label = heading.textContent.replace(/\s+/g, " ").trim();
    let lines;
    if (heading.querySelector(".line")) {
      lines = [...heading.querySelectorAll(".line > span")]; // hero keeps its line-reveal wrappers
    } else {
      heading.innerHTML = heading.innerHTML
        .split(/<br\s*\/?>/i)
        .map((part) => `<span class="stretch-line">${part.trim()}</span>`)
        .join("");
      lines = [...heading.querySelectorAll(".stretch-line")];
    }

    // Letter-by-letter spans read badly in screen readers: give them the whole heading instead.
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = label;
    heading.prepend(sr);
    lines.forEach((line) => {
      line.setAttribute("aria-hidden", "true");
      initStretch(line, {
        home: randomLetterIndex(line.textContent.trim()),
        interactive: false,
        maxScale: HEADING_MAX_SCALE,
        thin: true,
      });
    });
  });

  /* ---------- Sticky nav: hides on scroll down, returns on scroll up ---------- */
  const nav = document.querySelector(".nav");
  const menu = document.getElementById("mobile-menu");
  const toggle = document.querySelector(".menu-toggle");
  let lastY = window.scrollY;

  const onScrollNav = () => {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 8);
    const goingDown = y > lastY;
    const menuOpen = toggle.getAttribute("aria-expanded") === "true";
    nav.classList.toggle("is-hidden", goingDown && y > 400 && !menuOpen);
    lastY = y;
  };

  /* ---------- Mobile menu ---------- */
  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    nav.classList.toggle("menu-open", open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add("is-open"));
    } else {
      menu.classList.remove("is-open");
      setTimeout(() => { if (!menu.classList.contains("is-open")) menu.hidden = true; }, 300);
    }
  };
  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  window.matchMedia("(min-width: 721px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });

  /* ---------- Scroll reveal ---------- */
  const single = [
    ".hero-media", ".intro .display", ".intro .lead", ".product-stage",
    ".demo-media", ".demo-cta", ".faq-intro .display", ".faq-intro .lead",
    ".cta-content > *", ".cta-media", ".footer-nav", ".footer-bottom",
  ];
  const staggered = [".benefits", ".feature-grid", ".testimonial-list", ".faq-list"];

  single.forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.setAttribute("data-reveal", "")));
  staggered.forEach((sel) => document.querySelectorAll(sel).forEach((group) => {
    [...group.children].forEach((child, i) => {
      child.setAttribute("data-reveal", "");
      child.style.setProperty("--delay", `${i * 90}ms`);
    });
  }));
  // Stagger sibling items inside the CTA column too
  document.querySelectorAll(".cta-content > *").forEach((el, i) => el.style.setProperty("--delay", `${i * 90}ms`));
  document.querySelectorAll(".intro .lead, .faq-intro .lead").forEach((el) => el.style.setProperty("--delay", "120ms"));

  const revealTargets = document.querySelectorAll("[data-reveal], .footer-wordmark");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 }); // no bottom inset, so items at the very end of the page still reveal
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- Parallax on large images ---------- */
  const parallaxImgs = reduceMotion ? [] : [
    ...document.querySelectorAll(".demo-media > img, .cta-media img"),
  ];

  // The hero shape animates with SVG <animate>, which CSS reduced-motion rules can't reach.
  if (reduceMotion) document.querySelectorAll(".hero-shape svg").forEach((svg) => svg.pauseAnimations());
  const onScrollParallax = () => {
    const vh = window.innerHeight;
    parallaxImgs.forEach((img) => {
      const rect = img.parentElement.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) return;
      // -1 (entering from below) → 1 (leaving at top)
      const progress = (vh / 2 - (rect.top + rect.height / 2)) / (vh / 2 + rect.height / 2);
      img.style.transform = `translate3d(0, ${progress * 6}%, 0) scale(1.12)`;
    });
  };

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      onScrollNav();
      onScrollParallax();
      ticking = false;
    });
  }, { passive: true });
  onScrollNav();
  onScrollParallax();

  /* ---------- Play button follows the cursor over the demo image ---------- */
  const demoMedia = document.querySelector(".demo-media");
  const play = demoMedia && demoMedia.querySelector(".play");
  if (demoMedia && play && finePointer && !reduceMotion) {
    demoMedia.addEventListener("pointermove", (e) => {
      const r = demoMedia.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.25;
      const y = (e.clientY - r.top - r.height / 2) * 0.25;
      play.style.setProperty("--px", `${x}px`);
      play.style.setProperty("--py", `${y}px`);
    });
    demoMedia.addEventListener("pointerleave", () => {
      play.style.setProperty("--px", "0px");
      play.style.setProperty("--py", "0px");
    });
    demoMedia.addEventListener("click", (e) => { if (e.target === demoMedia || e.target.tagName === "IMG") openDemo(); });
  }

  /* ---------- Demo dialog ---------- */
  const dialog = document.getElementById("demo-dialog");
  const dialogBody = dialog.querySelector(".dialog-body");
  const placeholder = dialog.querySelector(".dialog-placeholder");

  function openDemo() {
    const src = dialog.dataset.videoSrc;
    if (src && !dialogBody.querySelector("video")) {
      placeholder.hidden = true;
      const video = document.createElement("video");
      video.src = src;
      video.controls = true;
      video.playsInline = true;
      dialogBody.appendChild(video);
    }
    dialog.showModal();
    const video = dialogBody.querySelector("video");
    if (video) video.play().catch(() => {});
  }
  document.querySelectorAll("[data-open-demo]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openDemo(); })
  );
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); }); // backdrop
  dialog.addEventListener("close", () => {
    const video = dialogBody.querySelector("video");
    if (video) video.pause();
  });

  /* ---------- FAQ accordion: animated, one open at a time ---------- */
  const rows = [...document.querySelectorAll(".faq-row")];
  const duration = reduceMotion ? 0 : 320;

  const animateRow = (row, open) => {
    const summary = row.querySelector("summary");
    if (row._anim) row._anim.cancel();
    const start = row.offsetHeight;
    if (open) row.open = true;
    const end = open ? row.scrollHeight : summary.offsetHeight;
    row.classList.toggle("is-open", open);
    row.style.overflow = "hidden";
    row._anim = row.animate({ height: [`${start}px`, `${end}px`] }, { duration, easing: "cubic-bezier(.2,.7,.2,1)" });
    row._anim.onfinish = () => {
      if (!open) row.open = false;
      row.style.overflow = "";
      row._anim = null;
    };
  };

  rows.forEach((row) => {
    row.querySelector("summary").addEventListener("click", (e) => {
      e.preventDefault();
      const willOpen = !row.classList.contains("is-open");
      if (willOpen) rows.forEach((other) => { if (other !== row && other.classList.contains("is-open")) animateRow(other, false); });
      animateRow(row, willOpen);
    });
  });
})();
