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

  function safeParams(params){
    var allowed = ["page_path", "button_label", "flow_name", "step_number", "selected_route"];
    var source = params || {};
    var clean = {};
    allowed.forEach(function(key){
      if(source[key] === undefined || source[key] === null) return;
      clean[key] = source[key];
    });
    return clean;
  }

  window.frontlineTrack = function(eventName, params) {
    var cleanParams = safeParams(params);
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", eventName, cleanParams);
      }
    } catch (err) {
      if (location.search.includes("debug_tracking=1")) {
        console.warn("[Frontline GA4 tracking failed]", err);
      }
    }
    try {
      if (typeof window.fbq === "function") {
        window.fbq("trackCustom", eventName, cleanParams);
        if(eventName === "report_email_requested" || eventName === "callback_requested"){
          window.fbq("track", "Lead", cleanParams);
        }
      }
      if (location.search.includes("debug_tracking=1")) {
        console.log("[Frontline tracking]", eventName, cleanParams);
      }
    } catch (err) {
      if (location.search.includes("debug_tracking=1")) {
        console.warn("[Frontline Meta tracking failed]", err);
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
