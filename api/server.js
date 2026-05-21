"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3401);
const DATA_DIR = process.env.DATA_DIR || "/opt/frontline-ai/data";
const REQUESTS_FILE = path.join(DATA_DIR, "demo-requests.jsonl");

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
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

function cleanEmail(value) {
  return cleanText(value, 254).toLowerCase();
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

function findAssistantAnswer(message) {
  const normalized = normalizeAssistantQuery(message);
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");

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

    if (req.method === "POST" && url.pathname === "/api/assistant/query") {
      const raw = await readBody(req);
      let input = {};
      try { input = JSON.parse(raw || "{}"); }
      catch { return sendJson(res, 400, { ok: false, errors: ["Invalid JSON."] }); }

      const message = cleanText(input.message, 1200);
      if (!message) return sendJson(res, 400, { ok: false, errors: ["Message is required."] });

      return sendJson(res, 200, {
        ok: true,
        mode: "controlled_knowledge_v1",
        answer: findAssistantAnswer(message)
      });
    }

    if (req.method === "POST" && (url.pathname === "/api/demo-request" || url.pathname === "/api/book-demo")) {
      const raw = await readBody(req);
      let input = {};
      try { input = JSON.parse(raw || "{}"); }
      catch { return sendJson(res, 400, { ok: false, errors: ["Invalid JSON."] }); }

      const { record, errors } = validateBooking(input);
      if (errors.length) return sendJson(res, 400, { ok: false, errors });

      fs.appendFileSync(REQUESTS_FILE, JSON.stringify(record) + "\n", "utf8");

      return sendJson(res, 200, {
        ok: true,
        id: record.id,
        slot_label: record.slot_label,
        slot_start: record.slot_start,
        message: "Demo booking received."
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
