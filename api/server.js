"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3401);
const DATA_DIR = process.env.DATA_DIR || "/opt/frontline-ai/data";
const REQUESTS_FILE = path.join(DATA_DIR, "demo-requests.jsonl");
const REPORT_REQUESTS_FILE = path.join(DATA_DIR, "business-fact-find-report-requests.jsonl");
const DEMO_VIDEO_MEDIA_FILE = path.join(DATA_DIR, "demo-video-media.json");
const DEMO_VIDEO_UPLOAD_DIR = path.join(__dirname, "..", "public", "assets", "demo-video-media");
const PRODUCT_KNOWLEDGE_FILE = path.join(__dirname, "product-knowledge.json");
const SITE_KNOWLEDGE_FILE = path.join(__dirname, "site-knowledge.json");
const FRONTLINE_MS_SCOPES = "offline_access User.Read Mail.Send";
const FRONTLINE_MS_TOKEN_FILE = process.env.FRONTLINE_MS_TOKEN_FILE || path.join(DATA_DIR, "ms-oauth-token.json");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ASSISTANT_BODY_LIMIT_BYTES = 8 * 1024;
const ASSISTANT_MESSAGE_LIMIT = 750;
const ASSISTANT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ASSISTANT_RATE_LIMIT_MAX = 8;
const MAX_ASSISTANT_LLM_CALLS_PER_DAY = Number(process.env.MAX_ASSISTANT_LLM_CALLS_PER_DAY || 100);
const OPENAI_ASSISTANT_TIMEOUT_MS = Number(process.env.OPENAI_ASSISTANT_TIMEOUT_MS || 12000);
const REPORT_REQUEST_BODY_LIMIT_BYTES = 80 * 1024;

const assistantRateLimits = new Map();
let assistantDailyUsage = {
  date: new Date().toISOString().slice(0, 10),
  llmCalls: 0
};

fs.mkdirSync(DATA_DIR, { recursive: true });

const WORKING_DAYS = [1, 2, 3, 4, 5];
const SLOT_TIMES = ["09:30", "10:30", "11:30", "13:30", "14:30", "15:30", "16:30"];
const SLOT_MINUTES = 30;
const LOOKAHEAD_DAYS = 21;

const allowedProducts = new Set([
  "AI Reception Worker",
  "AI Sales Worker",
  "AI Booking Worker",
  "AI Missed Lead Worker",
  "AI Legal Intake Worker",
  "Custom AI Worker"
]);

const allowedBusinessSizes = new Set([
  "One-person business",
  "Small team",
  "Growing business",
  "Established company",
  "Agency / consultancy",
  "Other"
]);

const allowedContactMethods = new Set(["Phone", "Email", "WhatsApp", "Any"]);

const assistantActions = {
  factFind: ["Book a fact-find", "/book-demo.html", true],
  buildMethod: ["View controlled build method", "/controlled-build-method.html", false],
  changeControl: ["Change control", "/change-control-procedure.html", false]
};

const defaultAssistantActions = [
  assistantActions.factFind,
  assistantActions.buildMethod,
  assistantActions.changeControl
];

function loadProductKnowledge() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PRODUCT_KNOWLEDGE_FILE, "utf8"));
    return Array.isArray(parsed.products) ? parsed.products : [];
  } catch (err) {
    console.error("[frontline-ai-api] product knowledge unavailable", err.message);
    return [];
  }
}

const productKnowledge = loadProductKnowledge();

function loadSiteKnowledge() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SITE_KNOWLEDGE_FILE, "utf8"));
    return Array.isArray(parsed.chunks) ? parsed.chunks : [];
  } catch (err) {
    console.warn("[frontline-ai-api] site knowledge unavailable; run scripts/build-site-knowledge.js", err.message);
    return [];
  }
}

const siteKnowledge = loadSiteKnowledge();

const assistantKnowledge = [
  {
    intent: "industry_garage",
    match: ["garage", "mot", "car service", "car servicing", "service enquiry", "service enquiries", "working on cars", "vehicle repair", "mechanic"],
    title: "Garage enquiry and MOT booking workflow",
    short: "For a garage, the first useful build is usually missed-call recovery plus MOT, service and repair enquiry capture. Frontline AI would make sure callers are answered, qualified and routed while the team is on the tools.",
    why: "Garages often lose revenue because calls arrive when nobody can stop to answer. This controlled recommendation is based on fixed Frontline AI knowledge, not a live LLM improvising.",
    build: [
      "AI Reception Worker for missed calls and busy periods",
      "MOT, service, repair and callback qualification questions",
      "SMS or email follow-up for the customer",
      "Booking or callback record sent to the garage team",
      "Escalation rules for urgent or unclear enquiries"
    ],
    sources: ["Homepage", "Controlled Build Method", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "industry_legal",
    match: ["law firm", "legal", "solicitor", "solicitors", "matter intake", "legal intake", "conflict", "conflict-aware", "client callback", "client callbacks"],
    title: "Legal intake and callback workflow",
    short: "For a law firm, start with a controlled legal intake workflow: capture the enquiry, identify the matter type, flag conflict-sensitive steps and route callbacks without giving legal advice.",
    why: "Legal intake needs structure, auditability and careful escalation. This is controlled knowledge only, so Frontline AI would build approved questions and routing rules rather than a live LLM making judgement calls.",
    build: [
      "Matter type and urgency capture",
      "Conflict-aware routing prompts and handover rules",
      "Client callback and appointment request records",
      "Email notification to the right team or inbox",
      "Controlled copy, testing and change log before launch"
    ],
    sources: ["Homepage", "Controlled Build Method", "Change Control Procedure", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "industry_estate_agents",
    match: ["estate agent", "estate agents", "property enquiry", "property enquiries", "valuation", "valuation request", "valuation requests", "viewing", "viewing booking", "viewing bookings", "tenant", "landlord"],
    title: "Estate agent lead and viewing workflow",
    short: "For an estate agency, the best first build is usually property enquiry routing: valuation requests, viewing bookings, tenant questions and landlord leads captured into a clean follow-up record.",
    why: "Property enquiries go cold quickly when they are not qualified and routed. This assistant uses controlled Frontline AI knowledge, not a live LLM, so the workflow should be explicit and testable.",
    build: [
      "Visitor route for sales, lettings, valuations and viewings",
      "Property, budget, timing and contact detail capture",
      "Viewing or valuation request notifications",
      "Tenant and landlord lead separation",
      "Fact-find review before adding calendar or CRM integrations"
    ],
    sources: ["Homepage", "Controlled Build Method", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "industry_clinic",
    match: ["clinic", "patient", "patients", "patient enquiry", "patient enquiries", "treatment", "treatment question", "treatment questions", "appointment request", "appointment requests"],
    title: "Clinic enquiry and appointment request workflow",
    short: "For a clinic, start with appointment requests and treatment enquiries: capture the patient need, collect the right non-clinical details and route the request for the team to review.",
    why: "Clinics need fast responses without unsafe advice. This is controlled knowledge only, so Frontline AI would build scripted capture, approved answers and escalation rather than a live diagnostic LLM.",
    build: [
      "Treatment or service enquiry routing",
      "Appointment request and callback capture",
      "Approved FAQs for opening hours, services and next steps",
      "Email notification with structured patient enquiry details",
      "No-advice fallback for medical or uncertain questions"
    ],
    sources: ["Homepage", "Controlled Build Method", "Change Control Procedure", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "industry_hospitality",
    match: ["restaurant", "restaurants", "table booking", "table bookings", "hotel", "hotel enquiry", "hotel enquiries", "guest question", "guest questions", "event enquiry", "event enquiries", "hospitality"],
    title: "Hospitality booking and guest enquiry workflow",
    short: "For hospitality, start with bookings and guest questions: table bookings, hotel enquiries, event requests and common questions routed into a clear team notification.",
    why: "Hospitality teams are often busy when enquiries arrive. This is a controlled, non-LLM recommendation, so Frontline AI would keep the first version practical and rule-based.",
    build: [
      "Booking or event enquiry capture",
      "Guest details, dates, party size and special request fields",
      "Approved FAQ answers for opening, availability and services",
      "Email or dashboard notification for staff",
      "Escalation for VIP, urgent or unclear requests"
    ],
    sources: ["Homepage", "Controlled Build Method", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "missed_calls",
    match: ["miss calls", "missed calls", "miss call", "busy", "answer my phone", "answer phone", "take messages", "send sms", "sms follow", "qualify callers", "qualify caller", "phone", "voicemail", "call back", "callback", "reception", "receptionist"],
    title: "AI Reception Worker for missed calls",
    short: "Start with an AI Reception Worker that answers or recovers missed calls, takes a useful message, qualifies the caller and sends a fast SMS or email follow-up.",
    why: "This protects buyer intent at the moment it appears. It is controlled keyword and workflow knowledge, not a live LLM, so the first build should use approved questions, clear routing and human handover.",
    build: [
      "Missed-call or phone enquiry capture",
      "Name, number, service need, urgency and preferred callback time",
      "SMS or email confirmation after the enquiry",
      "Caller qualification and routing rules",
      "Team notification with a structured record"
    ],
    sources: ["Homepage", "Controlled Build Method", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "admin_overload",
    match: ["admin", "wasting time", "same questions", "repeated questions", "answering the same", "structured enquiries", "structured inquiries", "send details", "email or dashboard", "dashboard", "manual", "manual admin", "inbox", "email", "emails", "outbound email", "sending emails", "thousands of emails", "email volume", "email follow-up", "repeated emails"],
    title: "Admin relief and structured enquiry workflow",
    short: "Start with one admin-heavy enquiry path and turn it into a structured workflow. Frontline AI would capture the details once, route them cleanly and send the team a usable email or dashboard record.",
    why: "This works when staff repeatedly ask the same questions or copy details between systems. It remains controlled knowledge, not a live LLM, so the workflow should be predictable and easy to review.",
    build: [
      "Approved intake questions for the repeated enquiry",
      "Structured enquiry summary for email or dashboard",
      "Routing by service, urgency or location",
      "Reusable replies for common questions",
      "Question log to identify gaps and improvements"
    ],
    sources: ["Homepage", "Controlled Build Method", "Change Control Procedure", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "appointment_booking",
    match: ["book appointments", "book appointment", "appointment", "appointments", "replace calendly", "calendly", "calendar", "collect details before booking", "before booking", "cancellation", "cancellations", "rebooking", "reschedule", "booking details", "email me booking", "schedule", "scheduling"],
    title: "AI Booking Worker for qualified appointments",
    short: "An AI Booking Worker is the right first build when you want enquiries converted into qualified appointments rather than just raw calendar slots.",
    why: "It can sit before or alongside a calendar tool by collecting the right details first. This controlled assistant is not a live LLM, so availability, cancellation and rebooking rules should be defined before launch.",
    build: [
      "Pre-booking questions and qualification rules",
      "Appointment type, urgency and contact detail capture",
      "Booking request or calendar handoff",
      "Cancellation and rebooking rules for a later version",
      "Email confirmation with the booking details"
    ],
    sources: ["Homepage", "Controlled Build Method", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "website_lead_capture",
    match: ["website capture", "better leads", "capture leads", "forms trigger", "trigger emails", "trigger sms", "route visitors", "visitors into bookings", "turn visitors", "existing website", "my website", "site", "web form", "forms", "lead capture"],
    title: "Website lead capture and visitor routing",
    short: "Your website can capture better leads by asking the right questions, routing visitors to the next step and triggering email or SMS follow-up when someone is ready to act.",
    why: "This is a strong first build when traffic exists but enquiries are messy or incomplete. It stays controlled and non-LLM by using approved routes, forms and response rules.",
    build: [
      "Lead capture route for your existing website",
      "Service-specific forms and visitor routing",
      "Email, SMS or team notification triggers",
      "Booking or callback next step",
      "Testing against real buyer situations before launch"
    ],
    sources: ["Homepage", "Controlled Build Method", "Change Control Procedure", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "rag_documents",
    match: ["answer from my documents", "documents", "document", "pdf", "pdfs", "faq", "faqs", "policy", "policies", "make things up", "hallucinate", "cite sources", "sources", "doesn't know", "does not know", "rag", "knowledge base", "approved knowledge"],
    title: "Controlled Knowledge Assistant for documents",
    short: "For PDFs, FAQs, policies or website content, start with a controlled knowledge assistant that answers only from approved material, cites source labels and says when it does not know.",
    why: "This is useful when reliability matters more than free-form chat. It is not a live LLM in this Stage 2 assistant; Frontline AI would define the approved knowledge, answer format and escalation path first.",
    build: [
      "Approved document, FAQ and policy inventory",
      "Source-backed answer format with source labels",
      "No-guessing fallback when knowledge is missing",
      "Escalation route to a person or fact-find",
      "Change-controlled updates when documents change"
    ],
    sources: ["Homepage", "Controlled Build Method", "Change Control Procedure", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "ai_worker_selection",
    match: ["what ai worker", "which ai worker", "need first", "ai reception", "ai sales", "difference between", "more than one ai worker", "more than one worker", "don't know what i need", "dont know what i need", "not sure what i need", "i don't know", "i dont know"],
    title: "AI worker selection fact-find",
    short: "If you are not sure which AI worker you need, start by finding the biggest leak: missed calls, weak website leads, repeated admin, bookings or document questions.",
    why: "Frontline AI can build more than one worker, but the first version should prove one commercial workflow. This recommendation is controlled knowledge, not a live LLM assessment.",
    build: [
      "Short fact-find to identify the highest-value workflow",
      "First AI worker recommendation: Reception, Sales, Booking, Knowledge or custom",
      "Scope for one useful version before expanding",
      "Success criteria and handover rules",
      "Roadmap for additional workers if the first one proves useful"
    ],
    sources: ["Homepage", "Controlled Build Method", "Book Fact-Find page"],
    confidence: "medium",
    actions: defaultAssistantActions
  },
  {
    intent: "controlled_delivery",
    match: ["stop it breaking", "stop changes breaking", "how do you test", "test it", "review changes", "change goes wrong", "version control", "breaking the site", "rollback", "roll back", "change control", "controlled delivery", "safe launch"],
    title: "Controlled delivery and change control",
    short: "Frontline AI would keep the build controlled: define the workflow, test changes before release, let you review important changes and keep a rollback path if something goes wrong.",
    why: "This matters when the assistant affects live enquiries, customer messages or operational records. The assistant here is controlled knowledge only, so delivery should be equally explicit and testable.",
    build: [
      "Acceptance checks for the workflow and copy",
      "Test route before live release",
      "Client review for material changes",
      "Version control and change notes",
      "Rollback plan for live changes"
    ],
    sources: ["Controlled Build Method", "Change Control Procedure", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "savings_roi",
    match: ["how much can i save", "how much money can this save", "save using ai", "save me time", "save time", "admin time", "admin time can i save", "roi", "return on investment", "worth it", "go live in minutes", "live in minutes", "quickly can i go live", "first realistic saving", "recovered lead", "recovered leads"],
    title: "Realistic AI savings depend on where the leak is",
    short: "Savings depend on where the business is leaking time, enquiries or staff capacity. The useful question is not whether AI can save money in theory, but where the first realistic saving sits.",
    why: "For one business that might be calls; for another it might be email volume, repeated admin, booking back-and-forth, quote follow-up, website enquiries, document questions or manual handoffs. That is why Frontline AI starts with a focused fact-find rather than promising a meaningful bespoke system that goes live in minutes.",
    build: [
      "Map where enquiries, bookings or admin currently slow down",
      "Identify the first realistic saving or recovered-lead opportunity",
      "Recommend the smallest useful AI worker or workflow",
      "Build under controlled change, testing and review",
      "Improve from real usage rather than guessing upfront"
    ],
    sources: ["Homepage", "Book Fact-Find page", "Controlled Build Method", "Change Control Procedure"],
    confidence: "high",
    actions: defaultAssistantActions
  },
  {
    intent: "pricing_and_timeline",
    match: ["how much", "cost", "costs", "price", "pricing", "how long", "timeline", "take", "fact-find", "fact find", "what do you need from me", "need from me", "pay monthly", "monthly"],
    title: "Pricing, timeline and fact-find",
    short: "The honest next step is a fact-find, because price and timeline depend on the workflow, channels, content and handover rules. Frontline AI would scope the smallest useful version first.",
    why: "A missed-call worker is different from a document assistant or booking workflow, so the fact-find prevents vague pricing. This is controlled knowledge only, not a live quote engine.",
    build: [
      "Fact-find covering the buyer situation and current process",
      "First-version scope and success criteria",
      "Required content, pages, documents or example enquiries",
      "Timeline based on complexity and review cycles",
      "Monthly support or iteration options if appropriate"
    ],
    sources: ["Homepage", "Controlled Build Method", "Book Fact-Find page"],
    confidence: "medium",
    actions: defaultAssistantActions
  },
  {
    intent: "start_small",
    match: ["start small", "first version", "test one thing", "one thing first", "huge build", "small build", "pilot", "mvp", "simple version", "prove it"],
    title: "Small first version",
    short: "Yes. The best route is usually one controlled first version: one audience, one workflow and one clear handover, then expand once it proves useful.",
    why: "This keeps cost, risk and review effort sensible. It also fits the Stage 2 controlled approach: keyword and workflow matching first, not a live LLM doing too much too soon.",
    build: [
      "One buyer situation chosen in the fact-find",
      "One assistant or AI worker workflow",
      "Approved copy, questions and fallback behaviour",
      "Simple email, SMS or dashboard handover",
      "Review after real enquiries before expanding"
    ],
    sources: ["Homepage", "Controlled Build Method", "Change Control Procedure", "Book Fact-Find page"],
    confidence: "high",
    actions: defaultAssistantActions
  }
];

const assistantFallback = {
  intent: "unknown_general",
  title: "Guided AI worker fact-find",
  short: "The best starting point depends on where time, leads or customer experience are leaking first. Frontline AI would use the fact-find to choose one controlled workflow before building wider automation.",
  why: "This assistant is controlled keyword knowledge, not a live LLM, so it will not guess beyond the approved material. A fact-find is the right route when the situation is not clear yet.",
  build: [
    "Identify the repeated operational problem",
    "Define the first useful AI worker or assistant",
    "Agree approved knowledge and workflow rules",
    "Test behaviour, copy and handover",
    "Use the fact-find to plan the next step"
  ],
  sources: ["Homepage", "Controlled Build Method", "Book Fact-Find page"],
  confidence: "medium",
  actions: defaultAssistantActions
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function cleanText(value, max = 1000) {
  return String(value ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeEmailText(value, max = 50000) {
  return cleanText(value, max).replace(/\\n/g, "\n");
}

function emailList(items) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .slice(0, 6)
    .map(item => `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`)
    .join("");
}

function emailTags(items) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .slice(0, 4)
    .map(item => `<span style="display:inline-block;margin:0 8px 8px 0;padding:7px 10px;border-radius:999px;background:#e9f4ff;color:#075fb7;font-size:12px;font-weight:700">${escapeHtml(item)}</span>`)
    .join("");
}

function extractLineValue(text, label) {
  const source = normalizeEmailText(text, 50000);
  const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.+)$`, "mi");
  const match = source.match(pattern);
  return match ? match[1].trim() : "";
}

function buildBusinessFactFindReportEmail(record) {
  const factFind = record.fact_find && typeof record.fact_find === "object" ? record.fact_find : {};
  const recommendation = factFind.recommendation && typeof factFind.recommendation === "object" ? factFind.recommendation : {};
  const answers = factFind.answers && typeof factFind.answers === "object" ? factFind.answers : {};
  const draftBody = normalizeEmailText(record.draft_body, 50000);
  const callNotes = normalizeEmailText(record.call_notes, 50000);
  const extraNotes = normalizeEmailText(record.extra_notes, 1800);

  const focus = recommendation.focus || extractLineValue(draftBody, "Recommended focus") || extractLineValue(callNotes, "Recommended focus") || "Frontline AI recommendation";
  const why = recommendation.why || extractLineValue(draftBody, "Why this matters") || "Based on the answers, Frontline AI has identified a practical first workflow to review.";
  const top = Array.isArray(recommendation.top) && recommendation.top.length
    ? recommendation.top
    : [extractLineValue(callNotes, "Top improvement areas")].filter(Boolean);
  const benefits = Array.isArray(recommendation.benefits) && recommendation.benefits.length
    ? recommendation.benefits
    : [extractLineValue(callNotes, "Potential benefits")].filter(Boolean);
  const costSaving = Array.isArray(recommendation.costSaving) && recommendation.costSaving.length
    ? recommendation.costSaving
    : [extractLineValue(callNotes, "Potential cost-saving areas")].filter(Boolean);
  const workflow = recommendation.workflow || extractLineValue(callNotes, "Suggested first workflow") || "";
  const delivery = recommendation.delivery || extractLineValue(callNotes, "Recommended delivery model") || "";
  const secondary = Array.isArray(factFind.recommendation?.secondary)
    ? factFind.recommendation.secondary
    : String(extractLineValue(callNotes, "Secondary opportunities") || "")
      .split(",")
      .map(item => item.trim())
      .filter(item => item && item !== "None highlighted");
  const gutFeel = answers.desired_first_improvement || extractLineValue(callNotes, "Gut feel");
  const gutFeelMatch = extractLineValue(callNotes, "Gut feel match");
  const bookUrl = "https://frontline-ai.co.uk/book-demo.html?source=business-fact-find&fact_find=1";

  const text = [
    "Your Frontline AI Business Fact-Find Report",
    "",
    "Thanks for completing the Frontline AI Business Fact-Find. Based on your answers, this is the first opportunity we would look at.",
    "",
    "Recommended focus:",
    focus,
    "",
    why,
    "",
    "Top improvement areas:",
    top.map(item => "- " + item).join("\n"),
    "",
    "Potential benefits:",
    benefits.map(item => "- " + item).join("\n"),
    "",
    "Potential cost-saving areas:",
    costSaving.map(item => "- " + item).join("\n"),
    "",
    workflow ? "Suggested first workflow:\n" + workflow : "",
    delivery ? "Recommended delivery model:\n" + delivery : "",
    extraNotes ? "Your notes:\n" + extraNotes : "",
    "",
    "Book a call:",
    bookUrl,
    "",
    "Frontline AI"
  ].filter(Boolean).join("\n");

  const card = (title, body) => body ? `
    <div style="margin:16px 0;padding:18px;border:1px solid #d9e8f7;border-radius:16px;background:#ffffff">
      <h3 style="margin:0 0 10px;color:#071a33;font-size:17px;line-height:1.25">${escapeHtml(title)}</h3>
      ${body}
    </div>` : "";

  const html = `
  <div style="margin:0;padding:0;background:#eef4fb;font-family:Arial,'Segoe UI',sans-serif;color:#102033">
    <div style="max-width:680px;margin:0 auto;padding:24px 14px">
      <div style="border-radius:20px 20px 0 0;background:#06142a;padding:26px 24px;color:#ffffff">
        <div style="color:#7dd3ff;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Frontline AI</div>
        <h1 style="margin:10px 0 0;font-size:28px;line-height:1.15">Your Frontline AI Business Fact-Find Report</h1>
      </div>
      <div style="border:1px solid #d9e8f7;border-top:0;border-radius:0 0 20px 20px;background:#f8fbff;padding:24px">
        <p style="margin:0 0 18px;font-size:15px;line-height:1.65">Thanks for completing the Frontline AI Business Fact-Find. Based on your answers, this is the first practical opportunity we would look at first.</p>
        <div style="margin:0 0 18px;padding:18px;border-radius:16px;background:#e9f4ff;border:1px solid #cce5ff">
          <div style="color:#075fb7;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Recommended focus</div>
          <h2 style="margin:8px 0 8px;color:#071a33;font-size:24px;line-height:1.18">${escapeHtml(focus)}</h2>
          <p style="margin:0;color:#33465f;font-size:15px;line-height:1.6">${escapeHtml(why)}</p>
        </div>
        ${gutFeel ? card("Gut-feel comparison", `<p style="margin:0;color:#33465f;font-size:14px;line-height:1.6"><b>Your gut feel:</b> ${escapeHtml(gutFeel)}<br><b>Frontline AI recommendation:</b> ${escapeHtml(focus)}${gutFeelMatch ? `<br>${escapeHtml(gutFeelMatch)}` : ""}</p>`) : ""}
        ${card("Top improvement areas", `<ul style="margin:0;padding-left:20px;color:#33465f;font-size:14px;line-height:1.55">${emailList(top)}</ul>`)}
        ${card("Potential benefits", `<ul style="margin:0;padding-left:20px;color:#33465f;font-size:14px;line-height:1.55">${emailList(benefits)}</ul>`)}
        ${card("Potential cost-saving areas", `<ul style="margin:0;padding-left:20px;color:#33465f;font-size:14px;line-height:1.55">${emailList(costSaving)}</ul>`)}
        ${workflow ? card("Suggested first workflow", `<p style="margin:0;color:#33465f;font-size:14px;line-height:1.65">${escapeHtml(workflow)}</p>`) : ""}
        ${delivery ? card("Recommended delivery model", `<p style="margin:0;color:#33465f;font-size:14px;line-height:1.65">${escapeHtml(delivery)}</p>`) : ""}
        ${secondary.length ? card("Secondary opportunities", `<div>${emailTags(secondary)}</div>`) : ""}
        ${extraNotes ? card("Your notes", `<p style="margin:0;color:#33465f;font-size:14px;line-height:1.65;white-space:pre-line">${escapeHtml(extraNotes)}</p>`) : ""}
        <div style="margin:22px 0 8px;text-align:center">
          <a href="${bookUrl}" style="display:inline-block;padding:13px 20px;border-radius:999px;background:#1478ff;color:#ffffff;text-decoration:none;font-weight:700">Book a call to talk this through</a>
        </div>
        <p style="margin:18px 0 0;color:#6b7c90;font-size:12px;line-height:1.5;text-align:center">Frontline AI</p>
      </div>
    </div>
  </div>`;

  return { text, html };
}

function cleanEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value));
}

function graphTenantId() {
  return cleanText(process.env.FRONTLINE_MS_TENANT_ID, 120) || "organizations";
}

function graphRedirectUri() {
  return cleanText(process.env.FRONTLINE_MS_REDIRECT_URI, 500) || "https://frontline-ai.co.uk/api/ms/callback";
}

function graphTokenEndpoint() {
  return `https://login.microsoftonline.com/${encodeURIComponent(graphTenantId())}/oauth2/v2.0/token`;
}

function graphAuthEndpoint() {
  return `https://login.microsoftonline.com/${encodeURIComponent(graphTenantId())}/oauth2/v2.0/authorize`;
}

function graphIsConfigured() {
  return Boolean(
    cleanText(process.env.FRONTLINE_MS_CLIENT_ID, 200) &&
    cleanText(process.env.FRONTLINE_MS_CLIENT_SECRET, 500) &&
    graphRedirectUri()
  );
}

function graphStateSignature(payload) {
  const secret = cleanText(process.env.FRONTLINE_MS_CONNECT_ADMIN_SECRET, 500);
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function createGraphOauthState() {
  const payload = `${Date.now()}.${crypto.randomBytes(16).toString("hex")}`;
  return `${payload}.${graphStateSignature(payload)}`;
}

function isValidGraphOauthState(state) {
  const value = cleanText(state, 300);
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = graphStateSignature(payload);
  const supplied = parts[2];
  if (expected.length !== supplied.length) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (!crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) return false;
  const createdAt = Number(parts[0]);
  return Number.isFinite(createdAt) && Date.now() - createdAt < 10 * 60 * 1000;
}

function readGraphToken() {
  try {
    if (!fs.existsSync(FRONTLINE_MS_TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(FRONTLINE_MS_TOKEN_FILE, "utf8"));
  } catch (err) {
    console.error("[frontline-ai-api] MS_TOKEN_READ_FAILED", err && err.message ? err.message : err);
    return null;
  }
}

function writeGraphToken(token) {
  fs.mkdirSync(path.dirname(FRONTLINE_MS_TOKEN_FILE), { recursive: true });
  fs.writeFileSync(FRONTLINE_MS_TOKEN_FILE, JSON.stringify(token, null, 2), { mode: 0o600 });
  fs.chmodSync(FRONTLINE_MS_TOKEN_FILE, 0o600);
}

async function graphTokenRequest(params) {
  const response = await fetch(graphTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cleanText(process.env.FRONTLINE_MS_CLIENT_ID, 200),
      client_secret: cleanText(process.env.FRONTLINE_MS_CLIENT_SECRET, 500),
      ...params
    }).toString()
  });
  const body = await response.text();
  let parsed = {};
  try { parsed = JSON.parse(body || "{}"); } catch {}
  if (!response.ok) {
    throw new Error(`MICROSOFT_GRAPH_TOKEN_FAILED_${response.status} ${body.slice(0, 300)}`);
  }
  return parsed;
}

async function exchangeGraphCodeForToken(code) {
  const token = await graphTokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: graphRedirectUri(),
    scope: FRONTLINE_MS_SCOPES
  });
  const stored = {
    ...token,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + Number(token.expires_in || 0) * 1000).toISOString()
  };
  writeGraphToken(stored);
  return stored;
}

async function graphAccessToken() {
  if (!graphIsConfigured()) throw new Error("MICROSOFT_GRAPH_NOT_CONFIGURED");
  const token = readGraphToken();
  if (!token || !token.refresh_token) throw new Error("MICROSOFT_GRAPH_NOT_CONNECTED");

  const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : 0;
  if (token.access_token && expiresAt - Date.now() > 2 * 60 * 1000) return token.access_token;

  const refreshed = await graphTokenRequest({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    redirect_uri: graphRedirectUri(),
    scope: FRONTLINE_MS_SCOPES
  });
  const stored = {
    ...token,
    ...refreshed,
    refresh_token: refreshed.refresh_token || token.refresh_token,
    refreshed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + Number(refreshed.expires_in || 0) * 1000).toISOString()
  };
  writeGraphToken(stored);
  return stored.access_token;
}

async function sendMicrosoftGraphMail({ to, cc, subject, text, html, replyTo }) {
  const recipient = cleanEmail(to);
  if (!recipient) throw new Error("MISSING_FRONTLINE_SALES_INBOX");
  const ccRecipients = []
    .concat(cc || [])
    .map(item => cleanEmail(item))
    .filter(Boolean);
  const accessToken = await graphAccessToken();
  const htmlBody = html ? String(html).slice(0, 100000) : "";
  const textBody = String(text || "").slice(0, 50000);
  const message = {
    subject: cleanText(subject, 255) || "Frontline AI report request",
    body: {
      contentType: htmlBody ? "HTML" : "Text",
      content: htmlBody || textBody
    },
    toRecipients: [{ emailAddress: { address: recipient } }]
  };
  if (ccRecipients.length) {
    message.ccRecipients = ccRecipients.map(address => ({ emailAddress: { address } }));
  }
  if (replyTo && isValidEmail(replyTo)) {
    message.replyTo = [{ emailAddress: { address: cleanEmail(replyTo) } }];
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      saveToSentItems: true
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`MICROSOFT_GRAPH_SENDMAIL_FAILED_${response.status} ${body.slice(0, 300)}`);
  }

  return { ok: true, provider: "microsoft_graph", mode: "sent" };
}

function configuredSalesInbox() {
  return cleanEmail(
    process.env.BOOK_DEMO_TO ||
    process.env.DEMO_TO_EMAIL ||
    process.env.SALES_EMAIL ||
    process.env.CONTACT_EMAIL ||
    process.env.MAIL_TO ||
    process.env.SMTP_TO ||
    process.env.FRONTLINE_SALES_INBOX ||
    ""
  );
}


/* FRONTLINE_FACT_FIND_REPORT_EMAIL_V1 */
function outboundEmailFrom() {
  return cleanEmail(
    process.env.FRONTLINE_EMAIL_FROM ||
    process.env.MAIL_FROM ||
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM ||
    process.env.POSTMARK_FROM ||
    "no-reply@frontline-ai.co.uk"
  );
}

async function sendSalesNotificationEmail({ to, subject, text, replyTo }) {
  const recipient = cleanEmail(to);
  if (!recipient) throw new Error("MISSING_SALES_INBOX_CONFIG");

  const cleanSubject = cleanText(subject, 180) || "New Frontline AI enquiry";
  const cleanTextBody = String(text || "").slice(0, 50000);
  return sendMicrosoftGraphMail({
    to: recipient,
    subject: cleanSubject,
    text: cleanTextBody,
    replyTo
  });
}


function validateBusinessFactFindReportRequest(input) {
  const errors = [];
  const record = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    source: cleanText(input.source, 80) || "business-fact-find-report-request",
    sales_inbox_configured: Boolean(configuredSalesInbox()),
    visitor_email: cleanEmail(input.email),
    extra_notes: cleanText(input.extra_notes, 1800),
    draft_subject: cleanText(input.draft_subject, 180),
    draft_body: cleanText(input.draft_body, 18000),
    call_notes: cleanText(input.call_notes, 12000),
    fact_find: input.fact_find && typeof input.fact_find === "object" ? input.fact_find : {}
  };

  if (!record.visitor_email) errors.push("Email address is required.");
  if (record.visitor_email && !isValidEmail(record.visitor_email)) errors.push("Email address looks invalid.");
  if (record.source !== "business-fact-find-report-request") errors.push("Choose a valid source.");
  if (!record.draft_subject) errors.push("Draft subject is required.");
  if (!record.draft_body) errors.push("Draft body is required.");
  if (record.draft_body.length > 18000) errors.push("Draft body is too long.");

  return { record, errors };
}

function normalizeAssistantQuery(message) {
  return ` ${message.toLowerCase().replace(/[^a-z0-9'&]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function scoreAssistantIntent(normalized, item) {
  return item.match.reduce((score, token) => {
    const cleanToken = token.toLowerCase();
    if (!normalized.includes(cleanToken)) return score;
    return score + (cleanToken.includes(" ") ? 3 : 1);
  }, 0);
}

function scoreProductMatch(normalized, product) {
  return (product.keywords || []).reduce((score, token) => {
    const cleanToken = String(token).toLowerCase();
    if (!normalized.includes(cleanToken)) return score;
    return score + (cleanToken.includes(" ") ? 4 : 1);
  }, 0);
}

function tokenizeKnowledge(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 2 && ![
      "the", "and", "for", "with", "from", "that", "this", "can", "into", "your", "you", "are", "not", "but", "has", "have", "what", "how", "why", "who"
    ].includes(token));
}

function productKnowledgeDocuments() {
  return productKnowledge.map(product => {
    const textParts = [
      product.name,
      product.category,
      product.shortSummary,
      product.longSummary,
      ...(product.whoItIsFor || []),
      ...(product.problemsSolved || []),
      ...(product.coreFeatures || []),
      ...(product.commercialValue || []),
      ...(product.deliveryModel || []),
      ...(product.modules || []).map(module => `${module.name}: ${module.description}`),
      ...(product.keywords || [])
    ];

    return {
      id: `product-${product.id || product.name}`,
      page: product.productPage || product.bookingPage || "/book-demo.html",
      url: product.productPage || product.bookingPage || "/book-demo.html",
      title: product.name,
      text: textParts.filter(Boolean).join(" "),
      tags: ["product", product.category || ""].filter(Boolean),
      links: [
        product.productPage ? { label: `View ${product.name}`, href: product.productPage } : null,
        product.bookingPage ? { label: "Book a demo", href: product.bookingPage } : null
      ].filter(Boolean)
    };
  });
}

function normalizeInternalUrl(url) {
  const clean = String(url || "").trim();
  if (!clean) return "";
  if (clean.startsWith("https://frontline-ai.co.uk/")) return clean.replace("https://frontline-ai.co.uk", "");
  if (clean.startsWith("http://frontline-ai.co.uk/")) return clean.replace("http://frontline-ai.co.uk", "");
  if (clean.startsWith("/")) return clean;
  if (/^[a-z]+:/i.test(clean)) return "";
  return `/${clean.replace(/^\/+/, "")}`;
}

function scoreKnowledgeDocument(message, doc) {
  const normalizedMessage = normalizeAssistantQuery(message);
  const queryTokens = tokenizeKnowledge(message);
  const haystack = `${doc.title || ""} ${doc.text || ""} ${(doc.tags || []).join(" ")}`.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (!haystack.includes(token)) continue;
    score += token.length > 6 ? 3 : 1;
    if (String(doc.title || "").toLowerCase().includes(token)) score += 3;
    if ((doc.tags || []).some(tag => String(tag).toLowerCase().includes(token))) score += 3;
  }

  for (const phrase of [
    "premium websites",
    "ai ready",
    "managed ai services",
    "custom ai builds",
    "ad engine",
    "competitor analysis",
    "clone winning",
    "facebook results",
    "rag knowledge",
    "controlled build",
    "change control",
    "fact find"
  ]) {
    if (normalizedMessage.includes(phrase) && haystack.includes(phrase)) score += 8;
  }

  return score;
}

function searchApprovedKnowledge(message, limit = 8) {
  const documents = [
    ...siteKnowledge,
    ...productKnowledgeDocuments()
  ];

  return documents
    .map(doc => ({ ...doc, score: scoreKnowledgeDocument(message, doc) }))
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function actionFromKnowledgeDoc(doc, primary = false) {
  const url = normalizeInternalUrl(doc.url || doc.page);
  if (!url) return null;
  const label = url === "/" ? "View homepage" : `View ${doc.title || "page"}`;
  return [label, url, primary];
}

function uniqueActions(actions, limit = 4) {
  const seen = new Set();
  return actions.filter(action => {
    if (!Array.isArray(action) || !action[0] || !action[1]) return false;
    const url = normalizeInternalUrl(action[1]);
    if (!url || seen.has(url)) return false;
    action[1] = url;
    seen.add(url);
    return true;
  }).slice(0, limit);
}

function hasCommercialIntent(message) {
  const normalized = normalizeAssistantQuery(message);
  return [
    "can you",
    "do you",
    "could you",
    "we need",
    "i need",
    "my business",
    "my company",
    "our business",
    "our company",
    "service",
    "services",
    "price",
    "pricing",
    "cost",
    "costs",
    "how much",
    "how it works",
    "what should",
    "which",
    "choose",
    "build",
    "website",
    "managed",
    "custom",
    "ad engine",
    "book",
    "demo",
    "fact find",
    "fact-find"
  ].some(token => normalized.includes(token));
}

function productInterestFromKnowledge(message, relevantDocs = []) {
  const matches = [
    ["managed-ai-services", "Managed AI Services"],
    ["managed ai services", "Managed AI Services"],
    ["custom-ai-builds", "Custom AI Build"],
    ["custom ai builds", "Custom AI Build"],
    ["custom build", "Custom AI Build"],
    ["ad-engine", "Ad Engine"],
    ["ad engine", "Ad Engine"],
    ["ads", "Ad Engine"],
    ["campaign", "Ad Engine"],
    ["lawflow", "LawFlow Pro"],
    ["garagepro", "GaragePro"],
    ["garage", "GaragePro"],
    ["propertydesk", "PropertyDesk"],
    ["property", "PropertyDesk"],
    ["salonboss", "SalonBoss"],
    ["salon", "SalonBoss"],
    ["tableboss", "TableBoss"],
    ["restaurant", "TableBoss"],
    ["plumberpro", "PlumberPro"],
    ["plumber", "PlumberPro"],
    ["locksmithpro", "LockSmithPro"],
    ["locksmith", "LockSmithPro"],
    ["maintenancedesk", "MaintenanceDesk"],
    ["maintenance", "MaintenanceDesk"],
    ["builderdesk", "BuilderDesk"],
    ["builder", "BuilderDesk"],
    ["electriciandesk", "ElectricianDesk"],
    ["electrician", "ElectricianDesk"],
    ["clinics", "Clinics"],
    ["clinic", "Clinics"],
    ["managed", "Managed AI Services"],
    ["website", "Premium Website Build"],
    ["websites", "Premium Website Build"],
    ["premium websites", "Premium Website Build"]
  ];

  const topDocText = relevantDocs.length
    ? `${relevantDocs[0].url || ""} ${relevantDocs[0].title || ""} ${(relevantDocs[0].tags || []).join(" ")}`.toLowerCase()
    : "";
  const userText = normalizeAssistantQuery(message).toLowerCase();
  const broadText = `${userText} ${relevantDocs.map(doc => `${doc.url || ""} ${doc.title || ""} ${(doc.tags || []).join(" ")}`).join(" ")}`.toLowerCase();

  const found = matches.find(([needle]) => topDocText.includes(needle))
    || matches.find(([needle]) => userText.includes(needle))
    || matches.find(([needle]) => broadText.includes(needle));
  return found ? found[1] : "";
}

function factFindUrlFor(message, relevantDocs = []) {
  const interest = productInterestFromKnowledge(message, relevantDocs);
  return interest ? `/book-demo.html?product_interest=${encodeURIComponent(interest)}` : "/book-demo.html";
}

function factFindActionFor(message, relevantDocs = [], primary = true) {
  return ["Book a fact-find", factFindUrlFor(message, relevantDocs), primary];
}

function closeTextFor(message, relevantDocs = []) {
  const interest = productInterestFromKnowledge(message, relevantDocs);
  if (interest) {
    return `The best next step is a short fact-find so we can map what you need for ${interest}.`;
  }
  return "The best next step is a short fact-find so we can map what you need.";
}

function isPricingOrNextStepQuery(normalized) {
  return [
    "price",
    "pricing",
    "cost",
    "costs",
    "how much",
    "demo",
    "book",
    "setup",
    "set up",
    "next step",
    "next steps",
    "monthly",
    "managed",
    "custom build"
  ].some(token => normalized.includes(token));
}

function isRoiQuestion(message) {
  const normalized = normalizeAssistantQuery(message);
  return [
    "make more than it costs",
    "make more than this costs",
    "more than it costs",
    "pay for itself",
    "pay itself back",
    "worth the cost",
    "worth it",
    "return on investment",
    "roi",
    "make money",
    "profitable"
  ].some(token => normalized.includes(token));
}

function buildRoiAnswer(message, relevantDocs = []) {
  const factFindAction = factFindActionFor(message, relevantDocs, true);
  const interest = productInterestFromKnowledge(message, relevantDocs);
  const focus = interest || "the first workflow";
  const actions = uniqueActions([
    factFindAction,
    ["View managed AI services", "/managed-ai-services.html", false],
    ["View controlled build method", "/controlled-build-method.html", false]
  ]);

  return {
    title: "Estimate the commercial upside first",
    short: "It can, but only if the first build targets a real leak: missed enquiries, slow follow-up, wasted admin time, weak booking conversion or under-tracked ad spend.",
    why: `Frontline AI should compare the likely recovered revenue or saved time against the cost before recommending ${focus}. The best next step is a short fact-find so we can map the numbers and avoid guessing.`,
    build: [
      "Identify where leads, time or bookings are currently being lost",
      "Estimate the value of one recovered booking, enquiry or saved admin hour",
      "Choose the smallest useful workflow that can prove value",
      "Track whether the workflow creates enough return to justify expanding it"
    ],
    sources: ["Homepage", "Managed AI Services", "Book Fact-Find page"],
    source_pages: ["/", "/managed-ai-services.html", "/book-demo.html"],
    confidence: "medium",
    actions,
    links: actions.map(([label, url]) => ({ label, url })),
    suggested_cta: { label: factFindAction[0], url: factFindAction[1] }
  };
}

function productAction(action, primary) {
  if (!action || !action.label || !action.url) return null;
  return [action.label, action.url, Boolean(primary)];
}

function formatProductModules(product, limit = 5) {
  return (product.modules || [])
    .slice(0, limit)
    .map(module => `${module.name}: ${module.description}`);
}

function buildReadyProductAnswer(product, normalized) {
  const pricingOrNextStep = isPricingOrNextStepQuery(normalized);
  const factFindUrl = `/book-demo.html?product_interest=${encodeURIComponent(product.name)}`;
  const actions = [
    ["Book a fact-find", factFindUrl, true],
    productAction(product.recommendedCTA || (product.productPage ? { label: `View ${product.name}`, url: product.productPage } : null), true),
    productAction(product.secondaryCTA || (product.bookingPage ? { label: "Book Demo", url: product.bookingPage } : null), false)
  ].filter(Boolean).map((action, index) => index === 0 ? action : [action[0], action[1], false]);

  const build = [
    ...(product.coreFeatures || []).slice(0, 5),
    ...formatProductModules(product, 3)
  ].slice(0, 8);
  if (!build.length && Array.isArray(product.keywords)) {
    build.push("Preview product page now available", "Book a demo to map the first workflow worth building");
  }

  const short = product.shortSummary;
  const why = pricingOrNextStep
    ? `${product.pricingPosition || "Pricing depends on scope, support level and the workflow involved. Book a demo for the next step."} ${product.name} is controlled product knowledge in this assistant, not a live quote engine.`
    : `${product.longSummary || product.shortSummary} This assistant is using controlled product knowledge, not a live LLM.`;

  return {
    title: product.name,
    short,
    why: `${why} The best next step is a short fact-find so we can map what you need for ${product.name}.`,
    build,
    sources: ["LawFlow Pro product page", "Homepage", "Book Demo page", "Controlled Build Method"],
    confidence: "high",
    actions: uniqueActions(actions)
  };
}

function buildPlaceholderProductAnswer(product) {
  const actions = [
    ["Book a fact-find", `/book-demo.html?product_interest=${encodeURIComponent(product.name)}`, true],
    assistantActions.buildMethod
  ];

  return {
    title: product.name,
    short: product.shortSummary,
    why: `The full ${product.name} product page is not ready yet. Frontline AI can still discuss the workflow and map a controlled first version through a demo call. The best next step is a short fact-find so we can map what you need for ${product.name}.`,
    build: [
      "Clarify the main enquiry or admin workflow",
      "Identify the first controlled version worth building",
      "Avoid pretending the full product is ready before the product page exists"
    ],
    sources: ["Homepage", "Book Demo page", "Controlled Build Method"],
    confidence: "medium",
    actions
  };
}

function findProductAnswer(normalized) {
  let bestProduct = null;
  let bestScore = 0;

  for (const product of productKnowledge) {
    const score = scoreProductMatch(normalized, product);
    if (score > bestScore) {
      bestProduct = product;
      bestScore = score;
    }
  }

  if (!bestProduct) return null;
  if (bestProduct.status === "placeholder" && bestScore < 2) return null;
  if (bestProduct.status !== "placeholder" && bestScore < 1) return null;
  if (bestProduct.status === "placeholder") return buildPlaceholderProductAnswer(bestProduct);
  return buildReadyProductAnswer(bestProduct, normalized);
}

function findAssistantAnswer(message) {
  const normalized = normalizeAssistantQuery(message);
  const productAnswer = findProductAnswer(normalized);
  if (productAnswer) return productAnswer;

  let bestAnswer = assistantFallback;
  let bestScore = 0;

  for (const item of assistantKnowledge) {
    const score = scoreAssistantIntent(normalized, item);
    if (score > bestScore) {
      bestAnswer = item;
      bestScore = score;
    }
  }

  const { intent, match, ...publicAnswer } = bestAnswer;
  return publicAnswer;
}

function sentenceSnippets(text, limit = 4) {
  const prepared = String(text || "").replace(/\s+(Managed AI Reception|Managed Booking & Callback Handling|Managed RAG Website Assistant|Monthly AI Operations Support|Managed Ad Engine|Reporting & Improvement|Competitor Analysis|Winning Ad Campaign Clone|Facebook Results Evidence|Landing Page Intelligence|Ad Copy & Creative Angles|Monthly Growth Reports)\s+/g, ". $1 ");
  return prepared
    .split(/(?<=[.!?])\s+/)
    .map(item => item.trim())
    .filter(item => item.length > 35)
    .slice(0, limit);
}

function labelledKnowledgeSnippets(text, limit = 6) {
  const labels = [
    "Managed AI Reception",
    "Managed Booking & Callback Handling",
    "Managed RAG Website Assistant",
    "Monthly AI Operations Support",
    "Managed Ad Engine",
    "Reporting & Improvement",
    "Competitor Analysis",
    "Winning Ad Campaign Clone",
    "Facebook Results Evidence",
    "Landing Page Intelligence",
    "Ad Copy & Creative Angles",
    "Monthly Growth Reports"
  ];
  const source = String(text || "");
  const positions = labels
    .map(label => ({ label, index: source.indexOf(label) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index);

  return positions.map((item, index) => {
    const next = positions[index + 1]?.index || source.length;
    return source.slice(item.index, next).replace(/\s+/g, " ").trim();
  }).filter(Boolean).slice(0, limit);
}

function buildKnowledgeFallbackAnswer(message, relevantDocs) {
  if (!relevantDocs.length) {
    const answer = findAssistantAnswer(message);
    const factFindAction = factFindActionFor(message, relevantDocs, true);
    return {
      ...answer,
      why: `${answer.why} ${closeTextFor(message, relevantDocs)}`,
      actions: uniqueActions([factFindAction, ...(answer.actions || [])]),
      links: uniqueActions([factFindAction, ...(answer.actions || [])]).map(([label, url]) => ({ label, url })),
      suggested_cta: { label: factFindAction[0], url: factFindAction[1] }
    };
  }

  const top = relevantDocs[0];
  const commercialIntent = hasCommercialIntent(message);
  const factFindAction = factFindActionFor(message, relevantDocs, true);
  const snippets = sentenceSnippets(relevantDocs.map(doc => doc.text).join(" "), 8);
  const labelledSnippets = labelledKnowledgeSnippets(top.text, 8);
  const buildItems = (labelledSnippets.length ? labelledSnippets : snippets.slice(3, 8)).concat([
    closeTextFor(message, relevantDocs)
  ]).slice(0, 7);
  const actions = uniqueActions([
    ...(commercialIntent ? [factFindAction] : []),
    actionFromKnowledgeDoc(top, !commercialIntent),
    ...relevantDocs.slice(1, 4).map(doc => actionFromKnowledgeDoc(doc, false)),
    factFindAction
  ].filter(Boolean));

  return {
    title: top.title || "Frontline AI recommendation",
    short: snippets[0] || "Frontline AI can scope this using approved site knowledge and a focused fact-find.",
    why: `${snippets.slice(1, 3).join(" ") || "This response is based on approved Frontline AI site material. If a detail is not covered, the right next step is a fact-find rather than guessing."} ${commercialIntent ? closeTextFor(message, relevantDocs) : ""}`.trim(),
    build: buildItems,
    sources: [...new Set(relevantDocs.slice(0, 4).map(doc => doc.title).filter(Boolean))],
    source_pages: [...new Set(relevantDocs.slice(0, 5).map(doc => normalizeInternalUrl(doc.url || doc.page)).filter(Boolean))],
    confidence: "medium",
    actions,
    links: actions.map(([label, url]) => ({ label, url })),
    suggested_cta: { label: factFindAction[0], url: factFindAction[1] }
  };
}

function assistantBlockedAnswer(reason) {
  const action = ["Book a fact-find", "/book-demo.html", true];
  const answer = {
    title: "Book a Frontline AI fact-find",
    short: reason === "rate_limited"
      ? "I can help, but the assistant is being rate-limited. Please book a fact-find."
      : "I can help, but the safest next step is to book a short fact-find.",
    why: "Frontline AI can map the first useful workflow, website build, Ad Engine task, managed service or custom AI system without relying on an unrestricted public assistant.",
    build: [
      "Identify the business problem and buyer journey",
      "Map the smallest useful first version",
      "Decide whether this should be a managed service, website build, Ad Engine task or custom system"
    ],
    sources: ["Book Fact-Find page"],
    source_pages: ["/book-demo.html"],
    confidence: "medium",
    actions: [action],
    links: [{ label: action[0], url: action[1] }],
    suggested_cta: { label: action[0], url: action[1] }
  };

  return {
    ok: true,
    mode: `assistant_${reason}_fallback`,
    answer,
    reply: answer
  };
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function isAllowedAssistantOrigin(req) {
  const allowed = new Set([
    "https://frontline-ai.co.uk",
    "https://www.frontline-ai.co.uk",
    "http://127.0.0.1",
    "http://localhost"
  ]);
  const origin = req.headers.origin;
  if (origin && !allowed.has(origin)) return false;

  const referer = req.headers.referer;
  if (!origin && referer) {
    try {
      const parsed = new URL(referer);
      const refererOrigin = `${parsed.protocol}//${parsed.host}`;
      if (!allowed.has(refererOrigin)) return false;
    } catch {
      return false;
    }
  }

  return true;
}

function isBotishAssistantRequest(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) return true;

  const userAgent = String(req.headers["user-agent"] || "").trim();
  if (!userAgent) return true;

  return /\b(bot|crawler|spider|scrapy|python-requests|httpclient|wget|libwww|headless)\b/i.test(userAgent);
}

function isAssistantRateLimited(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const current = assistantRateLimits.get(ip);

  if (!current || now - current.windowStart > ASSISTANT_RATE_LIMIT_WINDOW_MS) {
    assistantRateLimits.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  current.count += 1;
  if (current.count > ASSISTANT_RATE_LIMIT_MAX) {
    console.warn("[frontline-ai-api] rate_limited", ip);
    return true;
  }

  return false;
}

function resetAssistantDailyUsageIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (assistantDailyUsage.date !== today) {
    assistantDailyUsage = { date: today, llmCalls: 0 };
  }
}

function canAttemptAssistantLlmCall() {
  resetAssistantDailyUsageIfNeeded();
  if (assistantDailyUsage.llmCalls >= MAX_ASSISTANT_LLM_CALLS_PER_DAY) {
    console.warn("[frontline-ai-api] daily_cap_reached");
    return false;
  }
  assistantDailyUsage.llmCalls += 1;
  return true;
}

let openAiWarningLogged = false;

function logMissingOpenAiKeyOnce() {
  if (openAiWarningLogged) return;
  openAiWarningLogged = true;
  console.warn("[frontline-ai-api] OPENAI_API_KEY missing; assistant using controlled fallback.");
}

function safeJsonParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function assistantVisibleText(value, max = 220) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return cleanText(value, max);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = assistantVisibleText(item, max);
      if (text) return text;
    }
    return "";
  }
  if (typeof value === "object") {
    for (const field of ["label", "title", "name", "short", "text", "description", "page", "url", "href"]) {
      const text = assistantVisibleText(value[field], max);
      if (text) return text;
    }
  }
  return "";
}

function sanitizeLlmAction(action) {
  if (Array.isArray(action)) {
    const url = normalizeInternalUrl(action[1]);
    if (!action[0] || !url) return null;
    return [String(action[0]).slice(0, 80), url, Boolean(action[2])];
  }
  if (action && typeof action === "object") {
    const url = normalizeInternalUrl(action.url || action.href);
    if (!action.label || !url) return null;
    return [String(action.label).slice(0, 80), url, Boolean(action.primary)];
  }
  return null;
}

function sanitizeAssistantAnswer(answer, fallback, relevantDocs, message) {
  if (!answer || typeof answer !== "object") return fallback;
  const commercialIntent = hasCommercialIntent(message);
  const factFindAction = factFindActionFor(message, relevantDocs, true);
  const contextActions = uniqueActions([
    ...(commercialIntent ? [factFindAction] : []),
    ...(Array.isArray(answer.actions) ? answer.actions.map(sanitizeLlmAction).filter(Boolean) : []),
    ...(Array.isArray(answer.links) ? answer.links.map(link => sanitizeLlmAction(link)).filter(Boolean) : []),
    ...(answer.suggested_cta ? [sanitizeLlmAction(answer.suggested_cta)].filter(Boolean) : []),
    ...relevantDocs.slice(0, 3).map(doc => actionFromKnowledgeDoc(doc, false)).filter(Boolean),
    factFindAction
  ]);

  const answerWhy = cleanText(answer.why || fallback.why, 1000);
  const commercialClose = commercialIntent && !answerWhy.toLowerCase().includes("best next step")
    ? `${answerWhy} ${closeTextFor(message, relevantDocs)}`
    : answerWhy;

  const sourcePages = Array.isArray(answer.source_pages)
    ? answer.source_pages.map(normalizeInternalUrl).filter(Boolean)
    : [...new Set(relevantDocs.slice(0, 5).map(doc => normalizeInternalUrl(doc.url || doc.page)).filter(Boolean))];

  return {
    title: assistantVisibleText(answer.title || fallback.title || "Frontline AI recommendation", 160),
    short: assistantVisibleText(answer.short || fallback.short, 900),
    why: cleanText(commercialClose, 1100),
    build: Array.isArray(answer.build) ? answer.build.map(item => assistantVisibleText(item, 220)).filter(Boolean).slice(0, 7) : fallback.build,
    sources: Array.isArray(answer.sources) && answer.sources.length ? answer.sources.map(item => assistantVisibleText(item, 90)).filter(Boolean).slice(0, 5) : fallback.sources,
    source_pages: sourcePages,
    confidence: answer.confidence === "high" ? "high" : "medium",
    actions: contextActions.length ? contextActions : fallback.actions,
    links: contextActions.map(([label, url]) => ({ label, url })),
    suggested_cta: { label: factFindAction[0], url: factFindAction[1] }
  };
}

async function askOpenAiAssistant(message, relevantDocs, fallback) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logMissingOpenAiKeyOnce();
    return null;
  }
  if (!canAttemptAssistantLlmCall()) return null;

  const approvedContext = relevantDocs.map((doc, index) => ({
    id: index + 1,
    title: doc.title,
    url: normalizeInternalUrl(doc.url || doc.page),
    tags: doc.tags || [],
    text: String(doc.text || "").slice(0, 1400)
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_ASSISTANT_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are the Frontline AI website assistant. Answer using only the approved Frontline AI site knowledge provided. Be concise, practical and commercially helpful. Do not invent prices. Do not pretend to be a human. Answer the question first, then give a short explanation, suggest a relevant next page if useful, and close toward a fact-find when the user shows buying intent, asks about a service, asks whether Frontline AI can do something, mentions their business, asks about pricing, asks how it works, or asks what to choose. Use this preferred close when relevant: \"The best next step is a short fact-find so we can map what you need.\" If a specific offer is relevant, make /book-demo.html with the correct product_interest query the main CTA. If the answer is not covered, say Frontline AI can scope it in a fact-find rather than inventing details. Return JSON only with: title, short, why, build array, sources array, source_pages array, actions array of [label,url,primary], links array of {label,url}, suggested_cta {label,url}, confidence."
          },
          {
            role: "user",
            content: JSON.stringify({
              question: message,
              approved_frontline_ai_knowledge: approvedContext,
              allowed_links: [
                "/book-demo.html",
                "/websites.html",
                "/managed-ai-services.html",
                "/custom-ai-builds.html",
                "/ad-engine.html",
                "/controlled-build-method.html",
                "/change-control-procedure.html",
                "/demo-portal.html",
                "/lawflow-pro.html",
                "/garagepro.html",
                "/propertydesk.html",
                "/salonboss.html",
                "/tableboss.html",
                "/plumberpro.html",
                "/locksmithpro.html",
                "/maintenancedesk.html",
                "/builderdesk.html",
                "/electriciandesk.html",
                "/clinics.html"
              ],
              preferred_fact_find_url: factFindUrlFor(message, relevantDocs)
            })
          }
        ]
      })
    });

    if (!response.ok) {
      console.warn("[frontline-ai-api] OpenAI assistant fallback", response.status);
      return null;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = safeJsonParse(content);
    return sanitizeAssistantAnswer(parsed, fallback, relevantDocs, message);
  } catch (err) {
    console.warn("[frontline-ai-api]", err.name === "AbortError" ? "openai_timeout" : "OpenAI assistant fallback", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function findAssistantAnswerWithKnowledge(message) {
  const relevantDocs = searchApprovedKnowledge(message, 8);
  if (isRoiQuestion(message)) return buildRoiAnswer(message, relevantDocs);
  const fallback = buildKnowledgeFallbackAnswer(message, relevantDocs);
  const llmAnswer = await askOpenAiAssistant(message, relevantDocs, fallback);
  return llmAnswer || fallback;
}

function readBookings() {
  if (!fs.existsSync(REQUESTS_FILE)) return [];
  return fs.readFileSync(REQUESTS_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localSlotIso(date, hhmm) {
  return `${ymd(date)}T${hhmm}:00`;
}

function addMinutesIso(localIso, minutes) {
  const d = new Date(localIso);
  d.setMinutes(d.getMinutes() + minutes);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function prettyDay(date) {
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function isBooked(slotStart) {
  return readBookings().some(row => row.slot_start === slotStart && row.status !== "cancelled");
}

function generateSlots() {
  const now = new Date();
  const slots = [];

  for (let offset = 0; offset < LOOKAHEAD_DAYS; offset++) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    day.setHours(0, 0, 0, 0);

    if (!WORKING_DAYS.includes(day.getDay())) continue;

    for (const time of SLOT_TIMES) {
      const slotStart = localSlotIso(day, time);
      const slotEnd = addMinutesIso(slotStart, SLOT_MINUTES);
      const startDate = new Date(slotStart);

      if (startDate <= now) continue;
      if (isBooked(slotStart)) continue;

      slots.push({
        slot_start: slotStart,
        slot_end: slotEnd,
        date: ymd(day),
        day_label: prettyDay(day),
        time_label: time,
        duration_minutes: SLOT_MINUTES,
        timezone: "Europe/London"
      });
    }
  }

  return slots;
}

function validateBooking(input) {
  const errors = [];
  const selectedSlot = cleanText(input.slot_start, 40);
  const availableSlots = generateSlots();
  const slot = availableSlots.find(s => s.slot_start === selectedSlot);

  const record = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    status: "booked",
    slot_start: selectedSlot,
    slot_end: slot ? slot.slot_end : cleanText(input.slot_end, 40),
    slot_label: slot ? `${slot.day_label} at ${slot.time_label}` : "",
    timezone: "Europe/London",
    name: cleanText(input.name, 160),
    company: cleanText(input.company, 180),
    phone: cleanText(input.phone, 80),
    email: cleanEmail(input.email),
    business_size: cleanText(input.business_size, 80),
    product_interest: cleanText(input.product_interest, 80),
    website: cleanText(input.website, 300),
    business_links: cleanText(input.business_links, 1200),
    preferred_contact: cleanText(input.preferred_contact, 80),
    notes: cleanText(input.notes, 1800),
    source: "frontline-ai-calendly-style-booking"
  };

  if (!selectedSlot) errors.push("Choose an available slot.");
  if (selectedSlot && !slot) errors.push("That slot is no longer available. Choose another.");
  if (!record.name) errors.push("Name is required.");
  if (!record.phone && !record.email) errors.push("Phone or email is required.");
  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) errors.push("Email looks invalid.");
  if (!allowedProducts.has(record.product_interest)) errors.push("Choose a valid AI worker/product.");
  if (!allowedBusinessSizes.has(record.business_size)) errors.push("Choose a valid business size.");
  if (!allowedContactMethods.has(record.preferred_contact)) errors.push("Choose a valid contact method.");

  return { record, errors };
}

function buildDemoBookingSalesNotification(record) {
  const value = (item) => item || "Not provided";
  return [
    "New Frontline AI demo booking",
    "",
    "Name:",
    value(record.name),
    "",
    "Company:",
    value(record.company),
    "",
    "Phone:",
    value(record.phone),
    "",
    "Email:",
    value(record.email),
    "",
    "Slot label:",
    value(record.slot_label),
    "",
    "Slot start:",
    value(record.slot_start),
    "",
    "Product interest:",
    value(record.product_interest),
    "",
    "Business size:",
    value(record.business_size),
    "",
    "Preferred contact:",
    value(record.preferred_contact),
    "",
    "Website:",
    value(record.website),
    "",
    "Business links:",
    value(record.business_links),
    "",
    "Notes:",
    value(record.notes),
    "",
    "Booking ID:",
    value(record.id),
    "",
    "Timestamp:",
    value(record.created_at)
  ].join("\n");
}

function buildDemoBookingCustomerConfirmation(record) {
  const value = (item) => item || "Not provided";
  return [
    "Hello " + value(record.name) + ",",
    "",
    "Thanks for requesting a Frontline AI fact-find. We have received your request.",
    "",
    "Selected slot:",
    value(record.slot_label),
    "",
    "Timezone:",
    "Europe/London",
    "",
    "Product interest:",
    value(record.product_interest),
    "",
    "Frontline AI will contact you using your preferred contact method to confirm the next step.",
    "",
    "Frontline AI"
  ].join("\n");
}


const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");


    if (req.method === "GET" && url.pathname === "/api/demo-video-media") {
      let media = { who: [], how: [] };
      try { media = JSON.parse(fs.readFileSync(DEMO_VIDEO_MEDIA_FILE, "utf8")); } catch {}
      return sendJson(res, 200, { ok: true, media });
    }

    if (req.method === "POST" && url.pathname === "/api/demo-video-media") {
      let input = {};
      try {
        const raw = await readBody(req, 200_000);
        input = JSON.parse(raw || "{}");
      } catch {
        return sendJson(res, 400, { ok: false, errors: ["Invalid JSON."] });
      }

      const normaliseGroup = (items) => Array.isArray(items) ? items.map(item => ({
        label: cleanText(item && item.label, 120),
        presenter_text: cleanText(item && item.presenter_text, 260),
        kicker: cleanText(item && item.kicker, 80),
        headline: cleanText(item && item.headline, 220),
        body: cleanText(item && item.body, 420),
        cards: Array.isArray(item && item.cards) ? item.cards.slice(0, 4).map(x => cleanText(x, 120)) : [],
        duration: Number.isFinite(Number(item && item.duration)) ? Math.max(2, Math.min(20, Number(item.duration))) : 5,
        media: cleanText(item && item.media, 1000),
        presenter: cleanText(item && item.presenter, 1000),
        zoom: Number.isFinite(Number(item && item.zoom)) ? Math.max(1, Math.min(1.35, Number(item.zoom))) : 1,
        export_url: cleanText(item && item.export_url, 1000)
      })).filter(item => item.label) : [];

      const normalisePresenter = (item) => ({
          url: cleanText(item && item.url, 1000)
        });

        const media = {
          who: normaliseGroup(input.media && input.media.who),
          how: normaliseGroup(input.media && input.media.how),
          presenters: {
            who: normalisePresenter(input.media && input.media.presenters && input.media.presenters.who),
            how: normalisePresenter(input.media && input.media.presenters && input.media.presenters.how)
          }
        };

        // FRONTLINE_DEMO_MEDIA_PRESENTERS_API_V3

        fs.writeFileSync(DEMO_VIDEO_MEDIA_FILE, JSON.stringify(media, null, 2), "utf8");
      return sendJson(res, 200, { ok: true, media });
    }

    if (req.method === "POST" && url.pathname === "/api/demo-video-media-upload") {
      let input = {};
      try {
        const raw = await readBody(req, 100_000_000);
        input = JSON.parse(raw || "{}");
      } catch {
        return sendJson(res, 400, { ok: false, errors: ["Invalid upload JSON."] });
      }

      const originalName = cleanText(input.filename, 180) || "demo-media.mp4";
      const ext = path.extname(originalName).toLowerCase();
      const allowed = new Set([".mp4", ".webm", ".mov", ".m4v", ".png", ".jpg", ".jpeg", ".webp"]);
      if (!allowed.has(ext)) return sendJson(res, 400, { ok: false, errors: ["Unsupported file type."] });

      const rawData = String(input.base64 || input.data || "");
      const base64 = rawData.replace(/^data:[^;]+;base64,/, "");
      if (!base64) return sendJson(res, 400, { ok: false, errors: ["Missing file data."] });

      const safeName = originalName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const finalName = Date.now() + "-" + safeName;
      fs.mkdirSync(DEMO_VIDEO_UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(DEMO_VIDEO_UPLOAD_DIR, finalName), Buffer.from(base64, "base64"));

      return sendJson(res, 200, { ok: true, url: "/assets/demo-video-media/" + finalName });
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, service: "frontline-ai-api", time: new Date().toISOString() });
    }

    if (req.method === "GET" && url.pathname === "/api/available-slots") {
      return sendJson(res, 200, {
        ok: true,
        timezone: "Europe/London",
        duration_minutes: SLOT_MINUTES,
        slots: generateSlots()
      });
    }

    if (url.pathname === "/api/assistant/query" && req.method !== "POST") {
      return sendJson(res, 405, { ok: false, errors: ["Method not allowed."] });
    }

    if (req.method === "POST" && url.pathname === "/api/assistant/query") {
      if (!isAllowedAssistantOrigin(req)) {
        console.warn("[frontline-ai-api] blocked_origin", getClientIp(req));
        return sendJson(res, 403, assistantBlockedAnswer("blocked_origin"));
      }

      if (isBotishAssistantRequest(req)) {
        console.warn("[frontline-ai-api] botish_request", getClientIp(req));
        return sendJson(res, 403, assistantBlockedAnswer("blocked_request"));
      }

      if (isAssistantRateLimited(req)) {
        return sendJson(res, 200, assistantBlockedAnswer("rate_limited"));
      }

      let raw = "";
      try {
        raw = await readBody(req, ASSISTANT_BODY_LIMIT_BYTES);
      } catch {
        return sendJson(res, 413, assistantBlockedAnswer("message_too_large"));
      }

      let input = {};
      try { input = JSON.parse(raw || "{}"); }
      catch { return sendJson(res, 400, assistantBlockedAnswer("invalid_json")); }

      const rawMessage = String(input.message ?? "");
      const message = cleanText(rawMessage, ASSISTANT_MESSAGE_LIMIT + 1);
      if (!message) return sendJson(res, 400, assistantBlockedAnswer("empty_message"));
      if (message.length > ASSISTANT_MESSAGE_LIMIT) {
        return sendJson(res, 413, assistantBlockedAnswer("message_too_long"));
      }

      const answer = await findAssistantAnswerWithKnowledge(message);
      return sendJson(res, 200, {
        ok: true,
        mode: process.env.OPENAI_API_KEY ? "controlled_llm_knowledge_v1" : "controlled_knowledge_fallback_v1",
        answer,
        reply: answer
      });
    }

    if (req.method === "GET" && url.pathname === "/api/ms/status") {
      const token = readGraphToken();
      return sendJson(res, 200, {
        ok: true,
        configured: graphIsConfigured(),
        connected: Boolean(token && token.refresh_token),
        expires_at: token && token.expires_at ? token.expires_at : null
      });
    }

    if (req.method === "GET" && url.pathname === "/api/ms/connect") {
      const suppliedSecret = cleanText(url.searchParams.get("secret"), 500);
      const adminSecret = cleanText(process.env.FRONTLINE_MS_CONNECT_ADMIN_SECRET, 500);
      if (!adminSecret || suppliedSecret !== adminSecret) {
        return sendJson(res, 403, { ok: false, error: "Invalid Microsoft connect secret." });
      }
      if (!graphIsConfigured()) {
        return sendJson(res, 500, { ok: false, error: "MICROSOFT_GRAPH_NOT_CONFIGURED" });
      }
      const authUrl = new URL(graphAuthEndpoint());
      authUrl.searchParams.set("client_id", cleanText(process.env.FRONTLINE_MS_CLIENT_ID, 200));
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", graphRedirectUri());
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("scope", FRONTLINE_MS_SCOPES);
      authUrl.searchParams.set("state", createGraphOauthState());
      res.writeHead(302, { Location: authUrl.toString() });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/api/ms/callback") {
      if (!graphIsConfigured()) {
        return sendJson(res, 500, { ok: false, error: "MICROSOFT_GRAPH_NOT_CONFIGURED" });
      }
      const error = cleanText(url.searchParams.get("error"), 200);
      if (error) {
        return sendJson(res, 400, { ok: false, error, error_description: cleanText(url.searchParams.get("error_description"), 1000) });
      }
      const code = cleanText(url.searchParams.get("code"), 2000);
      const state = cleanText(url.searchParams.get("state"), 300);
      if (!code || !isValidGraphOauthState(state)) {
        return sendJson(res, 400, { ok: false, error: "Invalid Microsoft OAuth callback." });
      }
      try {
        const token = await exchangeGraphCodeForToken(code);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(`<!doctype html><html><head><title>Microsoft connected</title></head><body><h1>Microsoft Graph connected</h1><p>Frontline AI can now send report request emails through Microsoft Graph.</p><p>Token expires at ${escapeHtml(token.expires_at || "")}.</p></body></html>`);
      } catch (err) {
        console.error("[frontline-ai-api] MICROSOFT_GRAPH_CALLBACK_FAILED", err && err.message ? err.message : err);
        return sendJson(res, 500, { ok: false, error: "MICROSOFT_GRAPH_CALLBACK_FAILED" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/business-fact-find/report-request") {
      let raw = "";
      try {
        raw = await readBody(req, REPORT_REQUEST_BODY_LIMIT_BYTES);
      } catch {
        return sendJson(res, 413, { ok: false, errors: ["Report request is too large."] });
      }

      let input = {};
      try { input = JSON.parse(raw || "{}"); }
      catch { return sendJson(res, 400, { ok: false, errors: ["Invalid JSON."] }); }

      const { record, errors } = validateBusinessFactFindReportRequest(input);
      if (errors.length) return sendJson(res, 400, { ok: false, errors });

      const salesInbox = cleanEmail(process.env.FRONTLINE_SALES_INBOX);
      const isCallRequest = /^Frontline AI call request\b/i.test(record.draft_subject) || /^Frontline AI call request\b/i.test(normalizeEmailText(record.draft_body, 500));
      const emailRecipient = isCallRequest ? salesInbox : record.visitor_email;
      if (isCallRequest && !salesInbox) {
        return sendJson(res, 500, { ok: false, error: "MISSING_FRONTLINE_SALES_INBOX" });
      }
      if (!emailRecipient || !isValidEmail(emailRecipient)) {
        return sendJson(res, 500, { ok: false, error: "MISSING_EMAIL_RECIPIENT" });
      }

      const formattedReport = buildBusinessFactFindReportEmail(record);
      const salesNotification = formattedReport.text;

      const graphStatus = {
        configured: graphIsConfigured(),
        connected: Boolean(readGraphToken()?.refresh_token)
      };
      if (!graphStatus.configured || !graphStatus.connected) {
        fs.appendFileSync(REPORT_REQUESTS_FILE, JSON.stringify({
          ...record,
          sales_inbox: salesInbox,
          email_recipient: emailRecipient,
          email_target: isCallRequest ? "frontline_sales_inbox" : "requester",
          sales_subject: record.draft_subject,
          sales_body: salesNotification
        }) + "\n", "utf8");
        fs.appendFileSync(REPORT_REQUESTS_FILE, JSON.stringify({
          id: record.id,
          created_at: new Date().toISOString(),
          event: "sales_email_failed",
          provider: "microsoft_graph",
          error: graphStatus.configured ? "MICROSOFT_GRAPH_NOT_CONNECTED" : "MICROSOFT_GRAPH_NOT_CONFIGURED",
          sales_inbox: salesInbox,
          email_recipient: emailRecipient,
          email_target: isCallRequest ? "frontline_sales_inbox" : "requester"
        }) + "\n", "utf8");
        return sendJson(res, 500, {
          ok: false,
          error: graphStatus.configured ? "MICROSOFT_GRAPH_NOT_CONNECTED" : "MICROSOFT_GRAPH_NOT_CONFIGURED",
          email: {
            ok: false,
            provider: "microsoft_graph",
            mode: graphStatus.configured ? "not_connected" : "not_configured"
          }
        });
      }

      const logBody = [
        salesNotification,
        "",
        "Draft subject:",
        record.draft_subject,
        "",
        "Source:",
        record.source,
        "",
        "Timestamp:",
        record.created_at
      ].join("\n");

      fs.appendFileSync(REPORT_REQUESTS_FILE, JSON.stringify({
        ...record,
        sales_inbox: salesInbox,
        email_recipient: emailRecipient,
        email_target: isCallRequest ? "frontline_sales_inbox" : "requester",
        sales_subject: record.draft_subject,
        sales_body: logBody
      }) + "\n", "utf8");

      try {
        const emailResult = await sendMicrosoftGraphMail({
          to: emailRecipient,
          subject: record.draft_subject,
          text: salesNotification,
          html: formattedReport.html,
          replyTo: isValidEmail(record.visitor_email) ? record.visitor_email : undefined
        });

        fs.appendFileSync(REPORT_REQUESTS_FILE, JSON.stringify({
          id: record.id,
          created_at: new Date().toISOString(),
          event: "sales_email_sent",
          provider: emailResult.provider,
          sales_inbox: salesInbox,
          email_recipient: emailRecipient,
          email_target: isCallRequest ? "frontline_sales_inbox" : "requester"
        }) + "\n", "utf8");

        return sendJson(res, 200, {
          ok: true,
          email: emailResult
        });
      } catch (emailError) {
        console.error("[frontline-ai-api] FACT_FIND_REPORT_GRAPH_EMAIL_FAILED", emailError && emailError.message ? emailError.message : emailError);

        fs.appendFileSync(REPORT_REQUESTS_FILE, JSON.stringify({
          id: record.id,
          created_at: new Date().toISOString(),
          event: "sales_email_failed",
          provider: "microsoft_graph",
          error: emailError && emailError.message ? emailError.message : String(emailError),
          sales_inbox: salesInbox,
          email_recipient: emailRecipient,
          email_target: isCallRequest ? "frontline_sales_inbox" : "requester"
        }) + "\n", "utf8");

        return sendJson(res, 500, {
          ok: false,
          error: "MICROSOFT_GRAPH_SENDMAIL_FAILED",
          email: {
            ok: false,
            provider: "microsoft_graph",
            mode: "failed"
          }
        });
      }
    }

    if (req.method === "POST" && (url.pathname === "/api/demo-request" || url.pathname === "/api/book-demo")) {
      const raw = await readBody(req);
      let input = {};
      try { input = JSON.parse(raw || "{}"); }
      catch { return sendJson(res, 400, { ok: false, errors: ["Invalid JSON."] }); }

      const { record, errors } = validateBooking(input);
      if (errors.length) return sendJson(res, 400, { ok: false, errors });

      fs.appendFileSync(REQUESTS_FILE, JSON.stringify(record) + "\n", "utf8");

      const salesInbox = configuredSalesInbox();
      const salesNotification = buildDemoBookingSalesNotification(record);
      let salesEmailSent = false;

      try {
        const emailResult = await sendSalesNotificationEmail({
          to: salesInbox,
          subject: "New Frontline AI demo booking",
          text: salesNotification,
          replyTo: isValidEmail(record.email) ? record.email : undefined
        });

        fs.appendFileSync(REQUESTS_FILE, JSON.stringify({
          id: record.id,
          created_at: new Date().toISOString(),
          event: "sales_email_sent",
          provider: emailResult.provider,
          sales_inbox: salesInbox
        }) + "\n", "utf8");
        salesEmailSent = true;
      } catch (emailError) {
        console.error("[frontline-ai-api] BOOK_DEMO_EMAIL_FAILED", emailError && emailError.message ? emailError.message : emailError);

        fs.appendFileSync(REQUESTS_FILE, JSON.stringify({
          id: record.id,
          created_at: new Date().toISOString(),
          event: "sales_email_failed",
          provider: "microsoft_graph",
          error: emailError && emailError.message ? emailError.message : String(emailError),
          sales_inbox: salesInbox
        }) + "\n", "utf8");
      }

      if (record.email && isValidEmail(record.email)) {
        try {
          const customerEmailResult = await sendMicrosoftGraphMail({
            to: record.email,
            cc: "gary@frontline-ai.co.uk",
            subject: "Your Frontline AI fact-find request",
            text: buildDemoBookingCustomerConfirmation(record)
          });

          fs.appendFileSync(REQUESTS_FILE, JSON.stringify({
            id: record.id,
            created_at: new Date().toISOString(),
            event: "customer_confirmation_sent",
            provider: customerEmailResult.provider,
            email_recipient: record.email,
            cc_recipient: "gary@frontline-ai.co.uk"
          }) + "\n", "utf8");
        } catch (customerEmailError) {
          console.error("[frontline-ai-api] BOOK_DEMO_CUSTOMER_CONFIRMATION_FAILED", customerEmailError && customerEmailError.message ? customerEmailError.message : customerEmailError);

          fs.appendFileSync(REQUESTS_FILE, JSON.stringify({
            id: record.id,
            created_at: new Date().toISOString(),
            event: "customer_confirmation_failed",
            provider: "microsoft_graph",
            error: customerEmailError && customerEmailError.message ? customerEmailError.message : String(customerEmailError),
            email_recipient: record.email,
            cc_recipient: "gary@frontline-ai.co.uk"
          }) + "\n", "utf8");
        }
      }

      return sendJson(res, 200, {
        ok: true,
        emailed: salesEmailSent,
        id: record.id,
        slot_label: record.slot_label,
        slot_start: record.slot_start,
        message: salesEmailSent ? "Demo booking received." : "Demo booking received, but email notification failed."
      });
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    console.error("[frontline-ai-api]", err);
    sendJson(res, 500, { ok: false, error: "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`frontline-ai-api listening on 127.0.0.1:${PORT}`);
});
