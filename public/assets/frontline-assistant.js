// FRONTLINE_AI_KNOWLEDGE_ASSISTANT_V1
// Controlled-knowledge assistant. Uses the backend when available and falls back locally.

(function(){
  if(document.getElementById("flaiAssistantRoot")) return;

  const openingMessage = "Hi — I can help you work out which AI worker, workflow, website automation or knowledge assistant fits your business. What are you trying to solve?";

  const prompts = [
    "I miss too many calls",
    "I need a better website",
    "I want an AI receptionist",
    "I need a document Q&A bot",
    "I run a law firm",
    "I want to automate enquiries",
    "Not sure what I need"
  ];

  const qualifierMap = {
    "Calls and enquiries":"I miss too many calls",
    "Website and bookings":"I need a better website",
    "Documents and knowledge":"I need a document Q&A bot",
    "Internal admin":"I want to automate enquiries",
    "Legal/intake workflow":"I run a law firm"
  };

  const responses = [
    {
      match:["miss","call","phone","voicemail","missed"],
      title:"AI Receptionist + Missed Call Recovery",
      short:"Start by protecting the first enquiry. If people call while your team is busy, the useful work is capturing the reason, following up quickly and creating a clean record.",
      why:"You are losing enquiries before they become bookings or sales.",
      build:[
        "Answer or follow up missed calls",
        "Capture name, number and reason for call",
        "Send SMS, WhatsApp or email follow-up",
        "Notify your team",
        "Log the enquiry"
      ],
      actions:[
        ["Book a fact-find","/book-demo.html",true],
        ["Ask about AI receptionist","/#workers",false],
        ["Show controlled build method","/controlled-build-method.html",false]
      ]
    },
    {
      match:["website","site","web","booking","bookings"],
      title:"AI-ready website + enquiry automation",
      short:"Your website should do more than explain the business. It should capture demand, qualify enquiries and route visitors into the right next step.",
      why:"A better website can become the front door for bookings, fact-finds, forms and assistant-led enquiry handling.",
      build:[
        "Service pages",
        "Booking and fact-find forms",
        "Enquiry routing",
        "AI assistant",
        "Controlled launch process"
      ],
      actions:[
        ["Book a fact-find","/book-demo.html",true],
        ["View resources","/#resources",false],
        ["Controlled build method","/controlled-build-method.html",false]
      ]
    },
    {
      match:["document","documents","q&a","qa","rag","knowledge","policy","policies","faq","manual"],
      title:"Controlled Knowledge Assistant / RAG Bot",
      short:"A knowledge assistant is the right starting point when customers or staff need reliable answers from approved documents, policies, FAQs or website content.",
      why:"It reduces vague answers by grounding responses in controlled material and escalating when the approved knowledge is not enough.",
      build:[
        "Search approved knowledge",
        "Answer with source-backed responses",
        "Avoid random guessing",
        "Escalate when unsure",
        "Log questions for improvement"
      ],
      actions:[
        ["Book a fact-find","/book-demo.html",true],
        ["Change control","/change-control-procedure.html",false],
        ["View resources","/#resources",false]
      ]
    },
    {
      match:["law","legal","solicitor","firm","matter","intake","conflict"],
      title:"Legal intake + conflict-aware workflow assistant",
      short:"For a law firm, the starting point is usually structured intake: capture the enquiry, understand urgency, route it safely and preserve a controlled record.",
      why:"Legal enquiries need capture, triage, routing and audit-friendly workflow records.",
      build:[
        "Matter intake",
        "Caller details",
        "Urgency classification",
        "Appointment and fact-find routing",
        "Audit-friendly workflows"
      ],
      actions:[
        ["Book a fact-find","/book-demo.html",true],
        ["Show controlled build method","/controlled-build-method.html",false],
        ["Change control","/change-control-procedure.html",false]
      ]
    },
    {
      match:["receptionist","reception","front desk"],
      title:"AI Reception Worker",
      short:"An AI receptionist is a practical first worker when calls, messages and first-response admin are slowing the business down.",
      why:"It gives customers a faster first response and gives your team cleaner information before they act.",
      build:[
        "Capture caller details",
        "Ask the first qualifying questions",
        "Route enquiries by need or urgency",
        "Create callback records",
        "Send confirmation and follow-up messages"
      ],
      actions:[
        ["Book a fact-find","/book-demo.html",true],
        ["Explore AI workers","/#workers",false],
        ["Controlled build method","/controlled-build-method.html",false]
      ]
    },
    {
      match:["automate","automation","enquiries","inquiries","admin","workflow","email","sms","follow"],
      title:"Enquiry automation + AI workflow assistant",
      short:"If repeated enquiries are eating time, start with a workflow that turns messy inbound messages into structured next steps.",
      why:"Automation fits when staff repeatedly collect the same details, send the same replies or manually route similar requests.",
      build:[
        "Enquiry capture forms",
        "Qualification questions",
        "Email, SMS or team notifications",
        "Follow-up sequences",
        "Dashboard or record logging"
      ],
      actions:[
        ["Book a fact-find","/book-demo.html",true],
        ["Explore AI workers","/#workers",false],
        ["View resources","/#resources",false]
      ]
    }
  ];

  const fallback = {
    title:"Guided AI worker fact-find",
    short:"The best starting point depends on where time, leads or customer experience are leaking first. Pick the closest area below and I will narrow it down.",
    why:"Frontline AI usually starts with one controlled, practical workflow before expanding into a wider AI system.",
    build:[
      "Identify the repeated operational problem",
      "Define the first useful AI worker or assistant",
      "Build a controlled frontend workflow or knowledge assistant",
      "Test the route, copy, behaviour and handover",
      "Use the fact-find to plan the next step"
    ],
    actions:[
      ["Book a fact-find","/book-demo.html",true],
      ["Controlled build method","/controlled-build-method.html",false],
      ["View resources","/#resources",false]
    ],
    qualifiers:true
  };

  const root = document.createElement("div");
  root.id = "flaiAssistantRoot";
  root.className = "flai-assistant-root";
  root.innerHTML = `
    <button class="flai-assistant-launcher" type="button" aria-label="Open Frontline AI Knowledge Assistant">
      <span class="flai-assistant-orb" aria-hidden="true"></span>
      <span class="flai-assistant-launcher-copy">
        <span class="flai-assistant-launcher-title">Ask Frontline AI</span>
        <span class="flai-assistant-launcher-subtitle">Find the right AI worker</span>
      </span>
    </button>

    <section class="flai-assistant-panel" role="dialog" aria-modal="false" aria-labelledby="flaiAssistantTitle" aria-hidden="true">
      <header class="flai-assistant-header">
        <span class="flai-assistant-mark" aria-hidden="true"></span>
        <div>
          <h2 class="flai-assistant-title" id="flaiAssistantTitle">Frontline AI Knowledge Assistant</h2>
          <div class="flai-assistant-status">Answers from approved Frontline AI material</div>
        </div>
        <button class="flai-assistant-close" type="button" aria-label="Close Frontline AI Knowledge Assistant">×</button>
      </header>

      <div class="flai-assistant-body" aria-live="polite"></div>

      <div class="flai-assistant-trust">
        <p>This assistant is a demo of the same controlled-knowledge system we can build for your business.</p>
        <div class="flai-assistant-badges">
          <span class="flai-assistant-badge">Approved knowledge</span>
          <span class="flai-assistant-badge">Source-backed answers</span>
          <span class="flai-assistant-badge">Safe escalation</span>
          <span class="flai-assistant-badge">Fact-find routing</span>
        </div>
      </div>

      <form class="flai-assistant-composer">
        <input class="flai-assistant-input" type="text" autocomplete="off" placeholder="Ask about calls, websites, RAG or automation">
        <button class="flai-assistant-send" type="submit" aria-label="Send message">↗</button>
      </form>
    </section>
  `;

  document.body.appendChild(root);

  const launcher = root.querySelector(".flai-assistant-launcher");
  const panel = root.querySelector(".flai-assistant-panel");
  const closeButton = root.querySelector(".flai-assistant-close");
  const body = root.querySelector(".flai-assistant-body");
  const form = root.querySelector(".flai-assistant-composer");
  const input = root.querySelector(".flai-assistant-input");

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g, char => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#39;"
    })[char]);
  }

  function scrollToBottom(){
    body.scrollTop = body.scrollHeight;
  }

  function addUserMessage(text){
    const wrap = document.createElement("div");
    wrap.className = "flai-assistant-message flai-assistant-message-user";
    wrap.innerHTML = `<div class="flai-assistant-message-bubble"><p>${escapeHtml(text)}</p></div>`;
    body.appendChild(wrap);
    scrollToBottom();
  }

  function addOpeningMessage(){
    const wrap = document.createElement("div");
    wrap.className = "flai-assistant-message flai-assistant-message-system";
    wrap.innerHTML = `
      <div class="flai-assistant-message-bubble">
        <p>${escapeHtml(openingMessage)}</p>
      </div>
      <div class="flai-assistant-chips">
        ${prompts.map(prompt => `<button class="flai-assistant-chip" type="button" data-flai-assistant-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
      </div>
    `;
    body.appendChild(wrap);
  }

  function findResponse(text){
    const normalized = text.toLowerCase();
    if(normalized.includes("not sure") || normalized.includes("don't know") || normalized.includes("dont know")) return fallback;
    return responses.find(item => item.match.some(token => normalized.includes(token))) || fallback;
  }

  function normalizeAssistantResponse(response){
    if(!response || typeof response !== "object") return null;
    const actions = Array.isArray(response.actions) ? response.actions.filter(action => Array.isArray(action) && action.length >= 2) : [];
    return {
      title: response.title || "Frontline AI recommendation",
      short: response.short || "",
      why: response.why || "",
      build: Array.isArray(response.build) ? response.build : [],
      sources: Array.isArray(response.sources) ? response.sources : [],
      confidence: response.confidence || "",
      actions: actions.length ? actions : fallback.actions
    };
  }

  function askBackend(text){
    return fetch("/api/assistant/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    })
      .then(res => {
        if(!res.ok) throw new Error("Assistant API unavailable");
        return res.json();
      })
      .then(data => {
        if(!data || data.ok !== true) throw new Error("Assistant API error");
        const answer = normalizeAssistantResponse(data.answer);
        if(!answer) throw new Error("Assistant API response invalid");
        return answer;
      });
  }

  function addAssistantResponse(response){
    const wrap = document.createElement("div");
    wrap.className = "flai-assistant-message flai-assistant-message-system";
    const qualifiers = response.qualifiers ? `
      <div class="flai-assistant-qualifiers">
        ${Object.keys(qualifierMap).map(label => `<button class="flai-assistant-qualifier" type="button" data-flai-assistant-prompt="${escapeHtml(qualifierMap[label])}">${escapeHtml(label)}</button>`).join("")}
      </div>
    ` : "";
    const sourceText = response.sources && response.sources.length ? `Sources: ${response.sources.join(", ")}.` : "Source: based on approved Frontline AI material.";
    wrap.innerHTML = `
      <div class="flai-assistant-message-bubble">
        <span class="flai-assistant-section-title">Short answer</span>
        <p>${escapeHtml(response.short)}</p>
        <span class="flai-assistant-section-title">Recommended starting point</span>
        <p><strong>${escapeHtml(response.title)}</strong></p>
        <span class="flai-assistant-section-title">Why it fits</span>
        <p>${escapeHtml(response.why)}</p>
        <span class="flai-assistant-section-title">What Frontline AI would build</span>
        <ul>${response.build.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        <div class="flai-assistant-source">${escapeHtml(sourceText)}</div>
      </div>
      ${qualifiers}
      <div class="flai-assistant-actions">
        ${response.actions.map(([label, href, primary]) => `<a class="flai-assistant-action${primary ? " flai-assistant-action-primary" : ""}" href="${href}">${escapeHtml(label)}</a>`).join("")}
      </div>
    `;
    body.appendChild(wrap);
    scrollToBottom();
  }

  function submitMessage(text){
    const clean = text.trim();
    if(!clean) return;
    addUserMessage(clean);
    askBackend(clean)
      .then(addAssistantResponse)
      .catch(() => window.setTimeout(() => addAssistantResponse(findResponse(clean)), 180));
  }

  function openAssistant(){
    root.classList.add("flai-assistant-is-open");
    panel.setAttribute("aria-hidden","false");
    window.setTimeout(() => input.focus(), 220);
  }

  function closeAssistant(){
    root.classList.remove("flai-assistant-is-open");
    panel.setAttribute("aria-hidden","true");
    launcher.focus();
  }

  addOpeningMessage();

  launcher.addEventListener("click", openAssistant);
  closeButton.addEventListener("click", closeAssistant);

  body.addEventListener("click", event => {
    const chip = event.target.closest("[data-flai-assistant-prompt]");
    if(!chip) return;
    submitMessage(chip.getAttribute("data-flai-assistant-prompt") || "");
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const value = input.value;
    input.value = "";
    submitMessage(value);
  });

  document.addEventListener("keydown", event => {
    if(event.key === "Escape" && root.classList.contains("flai-assistant-is-open")){
      closeAssistant();
    }
  });
})();
