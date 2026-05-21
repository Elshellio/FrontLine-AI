"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUTPUT_FILE = path.join(ROOT, "api", "site-knowledge.json");

const pages = [
  "index.html",
  "websites.html",
  "managed-ai-services.html",
  "custom-ai-builds.html",
  "ad-engine.html",
  "lawflow-pro.html",
  "garagepro.html",
  "propertydesk.html",
  "salonboss.html",
  "tableboss.html",
  "plumberpro.html",
  "locksmithpro.html",
  "maintenancedesk.html",
  "builderdesk.html",
  "electriciandesk.html",
  "clinics.html",
  "controlled-build-method.html",
  "change-control-procedure.html",
  "demo-portal.html",
  "book-demo.html",
  "about.html",
  "hub.html"
];

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&rarr;/g, "->")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-");
}

function cleanText(value) {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNoise(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ");
}

function extractTitle(html, fallback) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(match ? match[1] : fallback.replace(/\.html$/, "").replace(/-/g, " "));
}

function extractLinks(html) {
  const links = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    const label = cleanText(match[2]);
    if (!label || label.length > 90) continue;
    links.push({ label, href });
  }
  return links.slice(0, 18);
}

function extractContentBlocks(html) {
  const blocks = [];
  const blockPattern = /<(h1|h2|h3|h4|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = blockPattern.exec(html))) {
    const text = cleanText(match[2]);
    if (!text || text.length < 18) continue;
    if (/^(home|start|products|use cases|process|trust|links|hub|who|calendar|terms|data)$/i.test(text)) continue;
    blocks.push({ type: match[1].toLowerCase(), text });
  }
  return blocks;
}

function chunkBlocks(blocks, maxLength = 1200) {
  const chunks = [];
  let current = [];
  let length = 0;

  for (const block of blocks) {
    const prefix = /^h[1-4]$/.test(block.type) ? "\n" : "";
    const text = `${prefix}${block.text}`;
    if (length && length + text.length > maxLength) {
      chunks.push(current.join(" ").replace(/\s+/g, " ").trim());
      current = [];
      length = 0;
    }
    current.push(text);
    length += text.length + 1;
  }

  if (current.length) chunks.push(current.join(" ").replace(/\s+/g, " ").trim());
  return chunks.filter(chunk => chunk.length >= 80);
}

function tagsForPage(filename, title, blocks) {
  const seed = `${filename} ${title} ${blocks.slice(0, 6).map(block => block.text).join(" ")}`.toLowerCase();
  const tags = [];
  const candidates = [
    ["websites", "website"],
    ["managed-ai-services", "managed"],
    ["custom-ai-builds", "custom"],
    ["ad-engine", "ads"],
    ["rag", "rag"],
    ["knowledge", "knowledge"],
    ["booking", "booking"],
    ["fact-find", "fact-find"],
    ["lawflow", "legal"],
    ["garage", "garage"],
    ["property", "property"],
    ["salon", "salon"],
    ["table", "hospitality"],
    ["plumber", "trades"],
    ["locksmith", "emergency"],
    ["maintenance", "maintenance"],
    ["builder", "builder"],
    ["electrician", "electrician"],
    ["clinic", "clinic"],
    ["change control", "change-control"],
    ["controlled build", "controlled-build"]
  ];

  for (const [needle, tag] of candidates) {
    if (seed.includes(needle)) tags.push(tag);
  }
  return [...new Set(tags)];
}

const chunks = [];
const sourcePages = [];

for (const filename of pages) {
  const file = path.join(PUBLIC_DIR, filename);
  if (!fs.existsSync(file)) {
    console.warn(`[site-knowledge] skipped missing ${filename}`);
    continue;
  }

  const html = fs.readFileSync(file, "utf8");
  const title = extractTitle(html, filename);
  const contentHtml = stripNoise(html);
  const blocks = extractContentBlocks(contentHtml);
  const links = extractLinks(contentHtml);
  const tags = tagsForPage(filename, title, blocks);
  const pageChunks = chunkBlocks(blocks);
  const url = filename === "index.html" ? "/" : `/${filename}`;

  sourcePages.push({ page: filename, url, title, chunks: pageChunks.length });

  pageChunks.forEach((text, index) => {
    chunks.push({
      id: `${filename.replace(/\.html$/, "")}-${index + 1}`,
      page: filename,
      url,
      title,
      text,
      tags,
      links
    });
  });
}

const payload = {
  generatedAt: new Date().toISOString(),
  sourcePages,
  chunks
};

fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[site-knowledge] wrote ${chunks.length} chunks from ${sourcePages.length} pages`);
console.log(`[site-knowledge] output ${OUTPUT_FILE}`);
for (const page of sourcePages) {
  console.log(`[site-knowledge] ${page.page}: ${page.chunks} chunks`);
}
