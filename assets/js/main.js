(() => {
  const STUDIO_EMAIL = "studio@willispaintings.com";
  const STUDIO_PHONE = "4809835812";

  // Mobile menu
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");
  const setMenu = (open) => {
    menu.classList.toggle("hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.querySelector(".material-symbols-outlined").textContent = open ? "close" : "menu";
  };
  toggle.addEventListener("click", () => setMenu(menu.classList.contains("hidden")));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // Highlight the nav link for the section in view
  const links = [...document.querySelectorAll(".nav-link")];
  const sections = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => {
        const active = a.getAttribute("href") === `#${entry.target.id}`;
        a.classList.toggle("text-on-surface", active);
        a.classList.toggle("font-semibold", active);
      });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((s) => observer.observe(s));

  // House painter: recolors the photo's walls, trim and door, keeping its light and shadow
  const painter = (() => {
    const photo = document.getElementById("house-photo");
    const canvas = document.getElementById("house-canvas");
    const compare = document.getElementById("show-original");
    const REGIONS = ["body", "trim", "door"]; // mask channels R, G, B
    const DOOR_EXPOSURE = 0.86; // the door sits in the shaded entry
    const target = {};
    let px, idx, lum, light, alpha, ref, refLight, warm, out, ctx;
    let anim = 0;

    const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

    const pixels = (img) => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, c.width, c.height).data;
    };

    const median = (arr) => {
      const s = Float32Array.from(arr).sort();
      return s.length ? s[s.length >> 1] : 0.5;
    };

    async function init() {
      const [img, maskImg, lightImg] = await Promise.all(
        [photo.currentSrc || photo.src, photo.dataset.mask, photo.dataset.light].map(load));
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx = canvas.getContext("2d");
      px = pixels(img);
      const mask = pixels(maskImg);
      const lightPx = pixels(lightImg); // smooth lighting: blurred luminance

      // Only touch pixels that belong to a paintable region
      const list = [];
      for (let i = 0; i < mask.length; i += 4) {
        if (mask[i] | mask[i + 1] | mask[i + 2]) list.push(i);
      }
      idx = Uint32Array.from(list);
      lum = new Float32Array(idx.length);
      light = new Float32Array(idx.length);
      alpha = new Float32Array(idx.length * 3);
      warm = new Float32Array(idx.length * 3);
      const samples = [[], [], []];
      const lightSamples = [[], [], []];
      idx.forEach((i, n) => {
        const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        lum[n] = l;
        light[n] = lightPx[i] / 255;
        for (let c = 0; c < 3; c++) {
          const a = mask[i + c] / 255;
          alpha[n * 3 + c] = a;
          if (a > 0.6) {
            samples[c].push(l);
            lightSamples[c].push(light[n]);
          }
          // The sunset's warm cast, kept lightly on repainted stucco
          warm[n * 3 + c] = Math.min(1.25, Math.max(0.8, [r, g, b][c] / Math.max(l, 1e-3))) ** 0.35;
        }
      });
      ref = samples.map(median);
      refLight = lightSamples.map(median);
      out = new ImageData(new Uint8ClampedArray(px), canvas.width, canvas.height);
      render();
      canvas.classList.remove("opacity-0");
      compare.classList.remove("hidden");
    }

    function render() {
      const d = out.data;
      const tg = REGIONS.map((k) => target[k]);
      const settings = tg.map((t, c) => {
        const tl = 0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2];
        const lighter = tl > ref[c] * 1.6;
        return {
          t,
          lighter,
          inv: 1 / Math.max(ref[c], 1e-3),
          invLight: 1 / Math.max(refLight[c], 1e-3),
          exposure: c === 2 ? DOOR_EXPOSURE : 1,
          grain: c === 2 ? 0.6 : 1, // soften the door's wood grain under paint
        };
      });
      for (let n = 0; n < idx.length; n++) {
        const i = idx[n];
        let r = px[i], g = px[i + 1], b = px[i + 2];
        for (let c = 0; c < 3; c++) {
          const a = alpha[n * 3 + c];
          if (a === 0) continue;
          const s = settings[c];
          let nr, ng, nb;
          if (c === 0) {
            // Stucco keeps its own texture and the warm sunset cast
            let ratio = lum[n] * s.inv;
            if (s.lighter) ratio = 1 + (ratio - 1) * 0.55;
            const k = 255 * Math.min(1.6, Math.max(0, ratio));
            nr = s.t[0] * k * warm[n * 3];
            ng = s.t[1] * k * warm[n * 3 + 1];
            nb = s.t[2] * k * warm[n * 3 + 2];
          } else {
            const ls = light[n] * s.invLight;
            let shade;
            if (s.lighter) {
              // Light paint over dark metal or wood: smooth sunlit shading, a hint of texture
              shade = ls ** 0.6 * (lum[n] / Math.max(light[n], 1e-3)) ** 0.12;
              shade = s.exposure * Math.min(1.06, Math.max(0.72, shade));
            } else {
              // Darker paint: the surface's own shading carries over
              shade = ls * (lum[n] * s.inv / Math.max(ls, 1e-3)) ** s.grain;
              shade = Math.min(1.6, Math.max(0, shade));
            }
            const k = 255 * shade;
            nr = s.t[0] * k;
            ng = s.t[1] * k;
            nb = s.t[2] * k;
          }
          r += (nr - r) * a;
          g += (ng - g) * a;
          b += (nb - b) * a;
        }
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
      ctx.putImageData(out, 0, 0);
    }

    // Ease from the current colors to the new ones
    function animateTo(key, hex) {
      const to = hexToRgb(hex);
      const from = target[key];
      target[key] = to;
      if (!ctx) return;
      if (!from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return render();
      cancelAnimationFrame(anim);
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / 280);
        const e = 1 - (1 - p) ** 3;
        target[key] = from.map((v, j) => v + (to[j] - v) * e);
        render();
        if (p < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }

    // Press and hold to compare with the untouched photo
    const hold = (on) => {
      canvas.classList.toggle("opacity-0", on);
      compare.setAttribute("aria-pressed", String(on));
    };
    compare.addEventListener("pointerdown", () => hold(true));
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => compare.addEventListener(ev, () => hold(false)));
    compare.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); hold(true); } });
    compare.addEventListener("keyup", () => hold(false));

    // Start once the section is close to the viewport
    new IntersectionObserver((entries, obs) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      init().catch(() => {}); // keep the plain photo if anything fails
    }, { rootMargin: "400px" }).observe(canvas);

    return { set: animateTo };
  })();

  // Color atelier
  const ACTIVE = ["ring-2", "ring-primary", "ring-offset-2"];
  const palette = { body: "Adobe Sand", trim: "Cast Iron Charcoal", door: "Superstition Dusk" };
  const summary = document.getElementById("palette-summary");
  const paletteText = () => `${palette.body} (Body) + ${palette.trim} (Trim) + ${palette.door} (Accent Portal)`;

  document.querySelectorAll("[data-group]").forEach((group) => {
    const key = group.dataset.group;
    const swatches = group.querySelectorAll(".swatch");
    const select = (btn) => {
      swatches.forEach((s) => {
        const on = s === btn;
        s.classList.toggle(ACTIVE[0], on);
        s.classList.toggle(ACTIVE[1], on);
        s.classList.toggle(ACTIVE[2], on);
        s.classList.toggle("hover:ring-2", !on);
        s.classList.toggle("hover:ring-outline", !on);
        s.setAttribute("aria-pressed", String(on));
      });
      document.getElementById(`label-${key}`).textContent = btn.dataset.label;
      document.getElementById(`strip-${key}`).style.backgroundColor = btn.dataset.hex;
      painter.set(key, btn.dataset.hex);
      palette[key] = btn.dataset.label.split(" — ")[0];
      summary.textContent = paletteText();
    };
    swatches.forEach((btn) => btn.addEventListener("click", () => select(btn)));
    select(group.querySelector('[aria-pressed="true"]'));
  });

  // Carry the chosen palette into the estimate form
  document.getElementById("palette-cta").addEventListener("click", () => {
    const details = document.getElementById("f-details");
    const line = `Palette: ${paletteText()}`;
    details.value = details.value.replace(/^Palette: .*$/m, "").trim();
    details.value = details.value ? `${line}\n${details.value}` : line;
    document.getElementById("f-service").value = "Exterior Weatherproof Painting";
  });

  // Copy phone number
  const copyStatus = document.getElementById("copy-phone-status");
  document.getElementById("copy-phone").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(STUDIO_PHONE);
      copyStatus.textContent = "Copied";
    } catch {
      copyStatus.textContent = "(480) 983-5812";
    }
    setTimeout(() => { copyStatus.innerHTML = '<span class="sr-only">Copy phone number</span>'; }, 2500);
  });

  // Estimate form: no backend yet, so it opens the visitor's email app with the request filled in.
  const form = document.getElementById("estimate-form");
  const status = document.getElementById("form-status");
  const showStatus = (msg, ok) => {
    status.textContent = msg;
    status.className = `p-4 rounded font-body-md text-body-md ${ok ? "bg-surface-container text-on-surface" : "bg-error-container text-on-error-container"}`;
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const missing = [...form.querySelectorAll("[required]")].find((el) => !el.value.trim());
    if (missing) {
      const field = missing.labels[0].textContent.replace(" *", "").replace(/^your /i, "").toLowerCase();
      showStatus(`Please add your ${field}.`, false);
      missing.focus();
      return;
    }
    const d = Object.fromEntries(new FormData(form));
    const body = [
      `Name: ${d.name}`,
      `Phone: ${d.phone}`,
      d.email && `Email: ${d.email}`,
      `Service: ${d.service}`,
      d.size && `Size: ${d.size}`,
      d.details && `\n${d.details}`,
    ].filter(Boolean).join("\n");
    const subject = `Estimate request — ${d.service}`;
    window.location.href = `mailto:${STUDIO_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showStatus("Your email app should open with the request ready to send. If it doesn't, call us at (480) 983-5812.", true);
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
