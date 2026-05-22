/* FRONTLINE_ALL_PAGE_IMAGE_OPTIMISE_V1 */
// FRONTLINE_IMAGE_SHARED_MENU_V2
// Shared Frontline AI menu. Icons are CSS backgrounds to prevent global page CSS resizing them.

(function(){
  if(document.getElementById("frontlineOneSharedMenu")) return;

  const MENU_GROUPS = [
    {
      title: "Explore",
      items: [
        { label: "Home", href: "/", meta: "Start", icon: "/assets/optimized/assets__menu-home.webp" },
        { label: "AI Workers", href: "/#workers", meta: "Products", icon: "/assets/optimized/assets__menu-workers.webp" },
        { label: "Industries", href: "/#industries", meta: "Use cases", icon: "/assets/optimized/assets__menu-industries.webp" },
        { label: "How It Works", href: "/#how", meta: "Process", icon: "/assets/optimized/assets__menu-process.webp" }
      ]
    },
    {
      title: "Proof & Method",
      items: [
        { label: "Delivery Proof", href: "/#proof", meta: "Trust", icon: "/assets/optimized/assets__menu-proof.webp" },
        { label: "Controlled Build", href: "/controlled-build-method.html", meta: "Method", icon: "/assets/optimized/assets__menu-controlled-build.webp" },
        { label: "Change Control", href: "/change-control-procedure.html", meta: "Review", icon: "/assets/optimized/assets__menu-change-control.webp" }
      ]
    },
    {
      title: "Company",
      items: [
        { label: "Resources", href: "/#resources", meta: "Links", icon: "/assets/optimized/assets__menu-resources.webp" },
        { label: "Demo Portal", href: "/demo-portal.html", meta: "Hub", icon: "/assets/optimized/assets__menu-resources.webp" },
        { label: "Websites", href: "/websites.html", meta: "Sites", icon: "/assets/optimized/assets__menu-industries.webp" },
        { label: "RAG Assistants", href: "/websites.html#workflow", meta: "RAG", icon: "/assets/optimized/assets__menu-workers.webp" },
        { label: "Managed Services", href: "/managed-ai-services.html", meta: "Run", icon: "/assets/menu-workers.png" },
        { label: "Custom Builds", href: "/custom-ai-builds.html", meta: "Build", icon: "/assets/menu-controlled-build.png" },
        { label: "Ad Engine", href: "/ad-engine.html", meta: "Growth", icon: "/assets/menu-proof.png" },
        { label: "About", href: "/about.html", meta: "Who", icon: "/assets/optimized/assets__menu-proof.webp" }
      ]
    },
    {
      title: "Start",
      items: [
        { label: "Business Fact-Find", href: "/business-fact-find.html", meta: "Assessment", icon: "/assets/optimized/assets__menu-calendar.webp" },
        { label: "Book Fact-Find", href: "/book-demo.html", meta: "Calendar", icon: "/assets/optimized/assets__menu-calendar.webp" }
      ]
    },
    {
      title: "Legal",
      items: [
        { label: "Terms", href: "/terms-of-service.html", meta: "Terms", icon: "/assets/optimized/assets__menu-controlled-build.webp" },
        { label: "Privacy", href: "/privacy-statement.html", meta: "Data", icon: "/assets/optimized/assets__menu-change-control.webp" }
      ]
    }
  ];

  const path = window.location.pathname || "/";
  const isHome = path === "/" || path.endsWith("/index.html");

  document.body.classList.add("frontline-menu-mounted");
  if(isHome) document.body.classList.add("frontline-home-page");

  function isActive(item){
    if(item.href === "/" && isHome) return true;
    if(item.href.startsWith("/#")) return false;
    return path === item.href;
  }

  const navHtml = MENU_GROUPS.map(group => {
    const items = group.items.map(item => {
      const active = isActive(item) ? " active" : "";
      return `
        <a class="frontlineMenuItem${active}" href="${item.href}">
          <span class="frontlineMenuIcon" style="--fl-icon:url('${item.icon}')"></span>
          <span class="frontlineMenuLabel">${item.label}</span>
          <span class="frontlineMenuMeta">${item.meta}</span>
          <span class="frontlineMenuArrow">›</span>
        </a>
      `;
    }).join("");

    return `
      <div class="frontlineMenuGroup" role="group" aria-label="${group.title}">
        <div class="frontlineMenuGroupHead">${group.title}</div>
        ${items}
      </div>
    `;
  }).join("");

  const sidebar = document.createElement("aside");
  sidebar.id = "frontlineOneSharedMenu";
  sidebar.className = "frontlineMenuSidebar";
  sidebar.innerHTML = `
    <a class="frontlineMenuBrand" href="/">
      <img class="frontlineMenuBrandMark" src="/assets/optimized/assets__4.webp" alt="Frontline AI">
      <div>
        <div class="frontlineMenuLogo">Frontline AI</div>
        <span>AI Worker Hub</span>
      </div>
    </a>

    <nav class="frontlineMenuNav" aria-label="Frontline AI shared menu">
      ${navHtml}
    </nav>

    <div class="frontlineMenuCta">
      <div class="frontlineMenuCtaSpark">✦</div>
      <b>Start with one <span>AI worker.</span></b>
      <p>Reception, sales, booking or follow-up. Add more once the first one proves value.</p>
      <a class="frontlineMenuButton" href="/book-demo.html">Book Fact-Find <span>→</span></a>
    </div>
  `;

  const mobile = document.createElement("div");
  mobile.className = "frontlineMenuMobileTop";
  mobile.innerHTML = `
    <a class="frontlineMenuMobileBrand" href="/">
      <img src="/assets/optimized/assets__4.webp" alt="Frontline AI">
      <span>Frontline AI</span>
    </a>
    <a class="frontlineMenuMobileCta" href="/book-demo.html">Book Fact-Find</a>
  `;

  document.body.prepend(sidebar);
  document.body.prepend(mobile);
})();
