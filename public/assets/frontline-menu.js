/* FRONTLINE_ALL_PAGE_IMAGE_OPTIMISE_V1 */
// FRONTLINE_IMAGE_SHARED_MENU_V2
// Shared Frontline AI menu. Icons are CSS backgrounds to prevent global page CSS resizing them.

(function(){
  if(document.getElementById("frontlineOneSharedMenu")) return;

  const MENU_ITEMS = [
    { label: "Home", href: "/", meta: "Start", icon: "/assets/optimized/assets__menu-home.webp" },
    { label: "AI Workers", href: "/#workers", meta: "Products", icon: "/assets/optimized/assets__menu-workers.webp" },
    { label: "Industries", href: "/#industries", meta: "Use cases", icon: "/assets/optimized/assets__menu-industries.webp" },
    { label: "How It Works", href: "/#how", meta: "Process", icon: "/assets/optimized/assets__menu-process.webp" },
    { label: "Delivery Proof", href: "/#proof", meta: "Trust", icon: "/assets/optimized/assets__menu-proof.webp" },
    { label: "Resources", href: "/#resources", meta: "Links", icon: "/assets/optimized/assets__menu-resources.webp" },
    { label: "Demo Portal", href: "/demo-portal.html", meta: "Hub", icon: "/assets/optimized/assets__menu-resources.webp" },
    { label: "About", href: "/about.html", meta: "Who", icon: "/assets/optimized/assets__menu-proof.webp" },
    { label: "Controlled Build", href: "/controlled-build-method.html", meta: "Method", icon: "/assets/optimized/assets__menu-controlled-build.webp" },
    { label: "Change Control", href: "/change-control-procedure.html", meta: "Review", icon: "/assets/optimized/assets__menu-change-control.webp" },
    { label: "Book Fact-Find", href: "/book-demo.html", meta: "Calendar", icon: "/assets/optimized/assets__menu-calendar.webp" }
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


/* FRONTLINE_MENU_BUTTON_POLISH_V1 */
(function(){
  function polishFrontlineMenuButtons(){
    const links = Array.from(document.querySelectorAll("a"));
    const homeLink = links.find(a => (a.textContent || "").trim().match(/^Home\b/i));
    const workersLink = links.find(a => (a.textContent || "").trim().match(/^AI Workers\b/i));
    if(!homeLink || !workersLink) return;

    function ancestors(el){
      const out = [];
      while(el && el !== document.body && el !== document.documentElement){
        out.push(el);
        el = el.parentElement;
      }
      return out;
    }

    const homeAnc = ancestors(homeLink);
    const workerAnc = new Set(ancestors(workersLink));
    const navRoot = homeAnc.find(el => workerAnc.has(el) && el.querySelectorAll("a").length >= 8);
    if(!navRoot) return;

    navRoot.classList.add("flaiMenuButtonPolishNav");

    const styleId = "flai-menu-button-polish-style-v1";
    if(document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .flaiMenuButtonPolishNav{
        display:flex !important;
        flex-direction:column !important;
        align-items:center !important;
        gap:7px !important;
      }

      .flaiMenuButtonPolishNav > a{
        width:88% !important;
        max-width:248px !important;
        min-height:40px !important;
        height:40px !important;
        margin-left:auto !important;
        margin-right:auto !important;
        padding:5px 11px !important;
        border-radius:13px !important;
        border-width:1px !important;
        font-size:12.5px !important;
        line-height:1.05 !important;
        font-weight:700 !important;
      }

      .flaiMenuButtonPolishNav > a img{
        width:27px !important;
        height:27px !important;
        min-width:27px !important;
        max-width:27px !important;
        border-radius:9px !important;
      }

      .flaiMenuButtonPolishNav > a span,
      .flaiMenuButtonPolishNav > a small,
      .flaiMenuButtonPolishNav > a em{
        font-size:9.5px !important;
        line-height:1 !important;
        font-weight:700 !important;
      }

      .flaiMenuButtonPolishNav > a:hover{
        transform:translateX(2px) !important;
      }

      @media(max-height:860px){
        .flaiMenuButtonPolishNav{
          gap:5px !important;
        }

        .flaiMenuButtonPolishNav > a{
          width:86% !important;
          min-height:38px !important;
          height:38px !important;
          font-size:12px !important;
        }

        .flaiMenuButtonPolishNav > a img{
          width:25px !important;
          height:25px !important;
          min-width:25px !important;
          max-width:25px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", polishFrontlineMenuButtons);
  }else{
    polishFrontlineMenuButtons();
  }

  setTimeout(polishFrontlineMenuButtons, 80);
  setTimeout(polishFrontlineMenuButtons, 350);
})();
