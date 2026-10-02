/* Pinnacle South — interactions */
(function () {
  "use strict";

  var doc = document.documentElement;
  var body = document.body;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Page load / preloader ---------- */
  function markLoaded() { body.classList.add("is-loaded"); }
  var seen = false;
  try { seen = sessionStorage.getItem("ps-intro") === "1"; sessionStorage.setItem("ps-intro", "1"); } catch (e) {}
  if (seen || reduceMotion) {
    setTimeout(markLoaded, 60);
  } else {
    window.addEventListener("load", function () { setTimeout(markLoaded, 650); });
    setTimeout(markLoaded, 2600); // safety net if an asset stalls
  }

  /* ---------- Smooth scroll (Lenis, optional) ---------- */
  // Lenis loads async from a CDN; the site works fine (native scroll) until/if it arrives.
  var lenis = null;
  function initLenis() {
    if (lenis || reduceMotion || !window.Lenis || !window.matchMedia("(pointer: fine)").matches) return;
    lenis = new window.Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    (function raf(time) { lenis.raf(time); requestAnimationFrame(raf); })(0);
  }
  initLenis();
  window.addEventListener("lenis-ready", initLenis);
  function scrollToY(y) {
    if (lenis) lenis.scrollTo(y); else window.scrollTo({ top: y, behavior: reduceMotion ? "auto" : "smooth" });
  }

  /* ---------- Header behaviour ---------- */
  var header = document.querySelector(".site-header");
  var lastY = window.scrollY;
  function onHeaderScroll() {
    var y = window.scrollY;
    if (!header) return;
    header.classList.toggle("is-solid", y > 40);
    if (!body.classList.contains("menu-open")) {
      header.classList.toggle("is-hidden", y > 480 && y > lastY + 2 && !header.matches(":hover, :focus-within"));
      if (y < lastY - 2) header.classList.remove("is-hidden");
    }
    lastY = y;
  }

  /* ---------- Desktop dropdown (click / keyboard support) ---------- */
  document.querySelectorAll(".nav__item--has-sub").forEach(function (item) {
    var trigger = item.querySelector(".nav__link");
    trigger.addEventListener("click", function (e) {
      if (trigger.tagName === "BUTTON") {
        e.preventDefault();
        var open = item.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", open ? "true" : "false");
      }
    });
    item.addEventListener("mouseleave", function () {
      item.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    });
    item.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { item.classList.remove("is-open"); trigger.setAttribute("aria-expanded", "false"); trigger.focus(); }
    });
  });
  document.addEventListener("click", function (e) {
    document.querySelectorAll(".nav__item--has-sub.is-open").forEach(function (item) {
      if (!item.contains(e.target)) { item.classList.remove("is-open"); item.querySelector(".nav__link").setAttribute("aria-expanded", "false"); }
    });
  });

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector(".menu-toggle");
  var mobileMenu = document.querySelector(".mobile-menu");
  function setMenu(open) {
    body.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobileMenu.setAttribute("aria-hidden", open ? "false" : "true");
    if (lenis) { open ? lenis.stop() : lenis.start(); }
  }
  if (toggle && mobileMenu) {
    toggle.addEventListener("click", function () { setMenu(!body.classList.contains("menu-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && body.classList.contains("menu-open")) setMenu(false); });
    mobileMenu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    mobileMenu.querySelectorAll("[data-sub-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sub = document.getElementById(btn.getAttribute("aria-controls"));
        var open = btn.getAttribute("aria-expanded") !== "true";
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        sub.classList.toggle("is-open", open);
      });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealTargets = document.querySelectorAll("[data-reveal], .img-reveal, .split-lines, .contrast, [data-count]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        if (entry.target.hasAttribute("data-count")) countUp(entry.target);
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(function (el) {
      el.classList.add("is-in");
      if (el.hasAttribute("data-count")) el.textContent = el.getAttribute("data-count");
    });
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dur = 2000, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * eased).toString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Services expanding panels ---------- */
  var panels = document.querySelectorAll(".svc");
  function activate(panel) {
    panels.forEach(function (p) { p.classList.toggle("is-active", p === panel); });
  }
  panels.forEach(function (panel) {
    panel.addEventListener("mouseenter", function () { if (window.innerWidth > 1024) activate(panel); });
    panel.addEventListener("focusin", function () { activate(panel); });
  });

  /* ---------- Parallax ---------- */
  var parallaxEls = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));

  /* ---------- Projects: sticky stacking showcase ---------- */
  var stack = document.querySelector(".projects-stack");
  var cards = stack ? Array.prototype.slice.call(stack.querySelectorAll(".project-card")) : [];
  var progress = document.querySelector(".projects-progress");
  var progressBtns = [];
  if (progress && cards.length) {
    cards.forEach(function (card, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Go to project " + (i + 1));
      b.addEventListener("click", function () {
        scrollToY(stack.getBoundingClientRect().top + window.scrollY + i * window.innerHeight);
      });
      progress.appendChild(b);
      progressBtns.push(b);
    });
  }

  function updateProjects(vh) {
    if (!cards.length) return;
    var current = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var next = cards[i + 1];
      var media = card.querySelector(".project-card__media");
      var img = media.querySelector("img");
      var shade = card.querySelector(".project-card__shade");
      var rect = card.getBoundingClientRect();

      // incoming parallax: image drifts as the card slides up into place
      var enter = Math.min(1, Math.max(0, rect.top / vh)); // 1 = just below fold, 0 = pinned
      img.style.transform = "translate3d(0," + (enter * -18).toFixed(2) + "%,0) scale(" + (1.12 - 0.12 * (1 - enter)).toFixed(4) + ")";

      // outgoing: next card covering this one -> shrink + darken
      var cover = 0;
      if (next) {
        var nTop = next.getBoundingClientRect().top;
        cover = Math.min(1, Math.max(0, 1 - nTop / vh));
      }
      media.style.transform = "scale(" + (1 - cover * 0.1).toFixed(4) + ")";
      media.style.borderRadius = (cover * 18).toFixed(1) + "px";
      shade.style.opacity = (cover * 0.65).toFixed(3);

      if (rect.top <= vh * 0.5) current = i;
    }
    cards.forEach(function (c, i) { c.classList.toggle("is-current", i === current); });
    if (progress) {
      var sr = stack.getBoundingClientRect();
      progress.classList.toggle("is-visible", sr.top < vh * 0.5 && sr.bottom > vh * 0.5);
      progressBtns.forEach(function (b, i) { b.classList.toggle("is-active", i === current); });
    }
  }

  /* ---------- Frame loop ---------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var vh = window.innerHeight;
      onHeaderScroll();
      if (!reduceMotion) {
        parallaxEls.forEach(function (el) {
          var r = el.parentElement.getBoundingClientRect();
          if (r.bottom < 0 || r.top > vh) return;
          var speed = parseFloat(el.getAttribute("data-parallax")) || 0.15;
          var offset = (r.top + r.height / 2 - vh / 2) * speed;
          el.style.transform = "translate3d(0," + offset.toFixed(1) + "px,0)";
        });
        updateProjects(vh);
      } else if (cards.length) {
        cards.forEach(function (c) { c.classList.add("is-current"); });
      }
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  /* ---------- Anchor links through Lenis ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      // header hides when scrolling down, so only leave room for it when scrolling up
      var top = el.getBoundingClientRect().top;
      scrollToY(top + window.scrollY - (top < 0 ? (header ? header.offsetHeight : 0) : 0));
      if (history.replaceState) history.replaceState(null, "", id === "#top" ? location.pathname : id);
    });
  });
  document.querySelectorAll("[data-to-top]").forEach(function (b) {
    b.addEventListener("click", function () { scrollToY(0); });
  });

  /* ---------- Menu highlight follows the section in view (one-page mode) ---------- */
  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link[href^="#"], .mobile-menu__link[href^="#"]'));
  var spyMap = {
    top: "#top", company: "#company", services: "#services",
    "our-design": "#services", "our-procurement": "#services", "our-manufacturing": "#services", "our-installation": "#services",
    projects: "#projects", contact: "#top", careers: "#careers", team: "#company", founder: "#company"
  };
  var spySections = Object.keys(spyMap).map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if (spyLinks.length && spySections.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var target = spyMap[en.target.id];
        spyLinks.forEach(function (a) {
          if (a.getAttribute("href") === target) a.setAttribute("aria-current", "page");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    spySections.forEach(function (sec) { spy.observe(sec); });
  }

  /* ---------- Contact form ----------
     Set the form's `action` to your form endpoint (e.g. Formspree / your CRM)
     and submissions will be posted there via fetch. */
  document.querySelectorAll("form[data-contact]").forEach(function (form) {
    var status = form.querySelector(".form__status");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var btn = form.querySelector("button[type=submit]");
      var action = form.getAttribute("action");
      btn.disabled = true;
      function done(ok) {
        btn.disabled = false;
        status.textContent = ok
          ? "Thank you — a member of the Pinnacle South team will be in touch shortly."
          : "Something went wrong. Please try again in a moment.";
        if (ok) form.reset();
      }
      if (action && action !== "#") {
        fetch(action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
          .then(function (r) { done(r.ok); })
          .catch(function () { done(false); });
      } else {
        setTimeout(function () { done(true); }, 600);
      }
    });
  });

  /* ---------- Gallery lightbox (project pages) ---------- */
  var lb = document.getElementById("lightbox");
  var lbItems = Array.prototype.slice.call(document.querySelectorAll("[data-lightbox]"));
  if (lb && lbItems.length) {
    var lbImg = lb.querySelector("img"), lbCap = lb.querySelector(".lightbox__caption"), lbCount = lb.querySelector(".lightbox__count");
    var lbIndex = 0, lbLast = null;
    function lbShow(i) {
      lbIndex = (i + lbItems.length) % lbItems.length;
      var a = lbItems[lbIndex], im = a.querySelector("img");
      lbImg.src = a.getAttribute("href");
      lbImg.alt = im ? im.alt : "";
      lbCap.textContent = im ? im.alt : "";
      lbCount.textContent = (lbIndex + 1) + " / " + lbItems.length;
    }
    function lbOpen(i) {
      lbLast = document.activeElement;
      lbShow(i);
      lb.hidden = false;
      body.classList.add("lightbox-open");
      if (lenis) lenis.stop();
      requestAnimationFrame(function () { lb.classList.add("is-open"); });
      lb.querySelector(".lightbox__close").focus();
    }
    function lbClose() {
      lb.classList.remove("is-open");
      body.classList.remove("lightbox-open");
      if (lenis) lenis.start();
      setTimeout(function () { lb.hidden = true; }, 300);
      if (lbLast) lbLast.focus();
    }
    lbItems.forEach(function (a, i) {
      a.addEventListener("click", function (e) { e.preventDefault(); lbOpen(i); });
    });
    lb.querySelector(".lightbox__close").addEventListener("click", lbClose);
    lb.querySelector(".lightbox__nav--prev").addEventListener("click", function () { lbShow(lbIndex - 1); });
    lb.querySelector(".lightbox__nav--next").addEventListener("click", function () { lbShow(lbIndex + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) lbClose(); });
    document.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      if (e.key === "Escape") lbClose();
      else if (e.key === "ArrowLeft") lbShow(lbIndex - 1);
      else if (e.key === "ArrowRight") lbShow(lbIndex + 1);
    });
    var touchX = null;
    lb.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) lbShow(lbIndex + (dx < 0 ? 1 : -1));
      touchX = null;
    });
  }

  /* ---------- Our Projects: View More ---------- */
  document.querySelectorAll("[data-projects-more]").forEach(function (btn) {
    var grid = btn.closest(".projects-more").previousElementSibling;
    btn.addEventListener("click", function () {
      var open = grid.classList.toggle("is-expanded");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.firstChild.nodeValue = open ? "View Less " : "View More ";
      if (open) grid.querySelectorAll(".pcard--more").forEach(function (c) { c.classList.add("is-in"); });
    });
  });

  /* ---------- Year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
