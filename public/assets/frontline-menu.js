// FRONTLINE_IMAGE_SHARED_MENU_V2
// Shared Frontline AI menu. Icons are CSS backgrounds to prevent global page CSS resizing them.

(function(){
  if(document.getElementById("frontlineOneSharedMenu")) return;

  const MENU_ITEMS = [
    { label: "Home", href: "/", meta: "Start", icon: "/assets/menu-home.png" },
    { label: "AI Workers", href: "/#workers", meta: "Products", icon: "/assets/menu-workers.png" },
    { label: "Industries", href: "/#industries", meta: "Use cases", icon: "/assets/menu-industries.png" },
    { label: "How It Works", href: "/#how", meta: "Process", icon: "/assets/menu-process.png" },
    { label: "Delivery Proof", href: "/#proof", meta: "Trust", icon: "/assets/menu-proof.png" },
    { label: "Resources", href: "/#resources", meta: "Links", icon: "/assets/menu-resources.png" },
    { label: "Demo Portal", href: "/demo-portal.html", meta: "Hub", icon: "/assets/menu-resources.png" },
    { label: "Controlled Build", href: "/controlled-build-method.html", meta: "Method", icon: "/assets/menu-controlled-build.png" },
    { label: "Change Control", href: "/change-control-procedure.html", meta: "Review", icon: "/assets/menu-change-control.png" },
    { label: "Book Fact-Find", href: "/book-demo.html", meta: "Calendar", icon: "/assets/menu-calendar.png" }
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

  const navHtml = MENU_ITEMS.map(item => {
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

  const sidebar = document.createElement("aside");
  sidebar.id = "frontlineOneSharedMenu";
  sidebar.className = "frontlineMenuSidebar";
  sidebar.innerHTML = `
    <a class="frontlineMenuBrand" href="/">
      <img class="frontlineMenuBrandMark" src="/assets/4.png" alt="Frontline AI">
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
      <img src="/assets/4.png" alt="Frontline AI">
      <span>Frontline AI</span>
    </a>
    <a class="frontlineMenuMobileCta" href="/book-demo.html">Book Fact-Find</a>
  `;

  document.body.prepend(sidebar);
  document.body.prepend(mobile);
})();
