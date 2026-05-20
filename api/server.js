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
