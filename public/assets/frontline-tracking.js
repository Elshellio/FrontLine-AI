(function(){
  function debugEnabled(){
    return location.search.includes("debug_tracking=1");
  }

  function pagePath(){
    return location.pathname;
  }

  function cleanLabel(value){
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function routePath(value){
    try{
      return new URL(value, location.origin).pathname;
    }catch(err){
      return "";
    }
  }

  window.frontlineTrack = function(eventName, params) {
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", eventName, params || {});
      }
      if (location.search.includes("debug_tracking=1")) {
        console.log("[Frontline tracking]", eventName, params || {});
      }
    } catch (err) {
      if (location.search.includes("debug_tracking=1")) {
        console.warn("[Frontline tracking failed]", err);
      }
    }
  };

  document.addEventListener("click", function(event){
    var target = event.target.closest("a, button");
    if(!target) return;

    var label = cleanLabel(target.getAttribute("aria-label") || target.textContent || target.value);
    var href = target.getAttribute("href") || "";
    var route = href ? routePath(href) : "";
    var baseParams = {
      page_path: pagePath(),
      button_label: label
    };

    if(route === "/business-fact-find.html" || route === "/business-fact-find"){
      window.frontlineTrack("book_fact_find_click", Object.assign({}, baseParams, {
        flow_name: "business_fact_find",
        selected_route: route
      }));
      return;
    }

    if(
      target.matches(".btn, .primary, .cta, [data-track-cta]") ||
      route === "/book-demo.html" ||
      route === "/book-demo"
    ){
      window.frontlineTrack("cta_click", Object.assign({}, baseParams, route ? {selected_route: route} : {}));
    }
  });
})();
