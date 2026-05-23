/* FRONTLINE_SHARED_EXACT_MENU_V7 */
/* Exact agreed menu. Real links only. No sections, no accordions, no child links, no CTA card. */

(function(){
  if (document.getElementById("frontlineOneSharedMenu")) return;

  const MENU_VERSION = "FRONTLINE_SHARED_EXACT_MENU_V7";

  const LINKS = [
    { label: "Home", href: "/", icon: "/assets/optimized/assets__menu-home.webp" },
    { label: "AI Call Handlers & Receptionists", href: "/managed-ai-services.html", icon: "/assets/optimized/assets__menu-workers.webp" },
    { label: "AI Workers", href: "/#workers", icon: "/assets/optimized/assets__menu-workers.webp" },
    { label: "RAG Assistants", href: "/#how", icon: "/assets/optimized/assets__menu-workers.webp" },
    { label: "Websites", href: "/websites.html", icon: "/assets/optimized/assets__menu-industries.webp" },
    { label: "Custom Builds", href: "/custom-ai-builds.html", icon: "/assets/optimized/assets__menu-controlled-build.webp" },
    { label: "Advert Competitor Research & Campaign Creation", href: "/ad-engine.html", icon: "/assets/optimized/assets__menu-proof.webp" },
    { label: "Delivery Proof", href: "/#proof", icon: "/assets/optimized/assets__menu-proof.webp" },
    { label: "Controlled Build Process", href: "/controlled-build-method.html", icon: "/assets/optimized/assets__menu-controlled-build.webp" },
    { label: "Change Control", href: "/change-control-procedure.html", icon: "/assets/optimized/assets__menu-change-control.webp" },
    { label: "Resources", href: "/#resources", icon: "/assets/optimized/assets__menu-resources.webp" },
    { label: "About", href: "/about.html", icon: "/assets/optimized/assets__menu-home.webp" },
    { label: "Business Fact-Find", href: "/business-fact-find.html", icon: "/assets/optimized/assets__menu-calendar.webp" },
    { label: "Book Fact-Find", href: "/book-demo.html", icon: "/assets/optimized/assets__menu-calendar.webp" }
  ];

  const initialPath = normalisePath(window.location.pathname || "/");
  const isHome = initialPath === "/" || initialPath.endsWith("/index.html");

  function normalisePath(path){
    let p = String(path || "/").split("?")[0];
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p || "/";
  }

  function hrefPath(href){
    try {
      const u = new URL(href, window.location.origin);
      return normalisePath(u.pathname);
    } catch(e) {
      return normalisePath(String(href || "").split("#")[0]);
    }
  }

  function isActive(href){
    const hp = hrefPath(href);
    const path = normalisePath(window.location.pathname || "/");
    const hash = window.location.hash || "";
    if (href && href.includes("#")) return Boolean(hash) && hp === path && href.endsWith(hash);
    if (hash && hp === "/") return false;
    if (hp === path) return true;
    return false;
  }

  function esc(value){
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderIcon(src){
    return `<span class="flIcon" style="--flIcon:url('${esc(src)}')"></span>`;
  }

  function renderLink(link){
    const isCta = link.label === "Book Fact-Find";
    const className = `flMenuLink ${!isCta && isActive(link.href) ? "isActive" : ""}${isCta ? " isCta" : ""}`;
    return `
      <a class="${className}" href="${esc(link.href)}">
        ${renderIcon(link.icon)}
        <span>${esc(link.label)}</span>
      </a>
    `;
  }

  const menu = document.createElement("aside");
  menu.id = "frontlineOneSharedMenu";
  menu.className = "frontlineSharedMenu";
  menu.setAttribute("data-menu-version", MENU_VERSION);

  menu.innerHTML = `
    <div class="flShell">
      <a class="flBrand" href="/" aria-label="Frontline AI home">
        <span class="flLogo"><img src="/assets/optimized/assets__4.webp" alt=""></span>
        <span class="flBrandText">
          <strong>Frontline AI</strong>
          <em>Site Menu</em>
        </span>
      </a>
      <nav class="flNav" aria-label="Frontline AI site menu">
        ${LINKS.map(renderLink).join("")}
      </nav>
      <div class="flSidebarCta">
        <div class="flSidebarCtaSpark">✦</div>
        <b>Create your first <span>AI worker.</span></b>
        <p>Start with reception, sales, booking or follow-up. Add more once the first workflow proves value.</p>
        <a class="flSidebarCtaButton" href="/book-demo.html">Book Fact-Find <span>→</span></a>
      </div>
    </div>
  `;

  const toggle = document.createElement("button");
  toggle.className = "frontlineMenuToggle";
  toggle.type = "button";
  toggle.setAttribute("aria-controls", "frontlineOneSharedMenu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = "☰ <span>Menu</span>";

  const overlay = document.createElement("div");
  overlay.className = "frontlineMenuOverlay";
  overlay.hidden = true;

  document.body.prepend(overlay);
  document.body.prepend(menu);
  document.body.prepend(toggle);
  document.documentElement.classList.add("frontlineMenuMounted");
  document.body.classList.add("frontline-menu-mounted");
  if (isHome) document.body.classList.add("frontline-home-page");

  function updateActiveLinks(){
    menu.querySelectorAll(".flMenuLink").forEach(link => {
      if (link.classList.contains("isCta")) {
        link.classList.remove("isActive");
        return;
      }
      link.classList.toggle("isActive", isActive(link.getAttribute("href")));
    });
  }

  function setOpen(open){
    document.body.classList.toggle("frontlineMenuOpen", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    overlay.hidden = !open;
  }

  toggle.addEventListener("click", () => setOpen(!document.body.classList.contains("frontlineMenuOpen")));
  overlay.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => { if (event.key === "Escape") setOpen(false); });
  window.addEventListener("hashchange", updateActiveLinks);

  menu.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (link && window.matchMedia("(max-width: 980px)").matches) setOpen(false);
  });
})();
