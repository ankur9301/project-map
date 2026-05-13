let captured = null;

const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");
const saveButton = document.getElementById("save");
const apiBaseInput = document.getElementById("apiBase");

chrome.storage.local.get(["apiBase"], (data) => {
  if (data.apiBase) apiBaseInput.value = data.apiBase;
});

apiBaseInput.addEventListener("change", () => {
  chrome.storage.local.set({ apiBase: apiBaseInput.value.trim() });
});

document.getElementById("capture").addEventListener("click", async () => {
  status("Capturing current tab...");
  saveButton.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractListingFromPage,
    });
    captured = normalizePayload(result);
    renderPreview(captured);
    saveButton.disabled = !captured.address;
    status(captured.address ? "Ready to save." : "Could not find an address on this page.");
  } catch (error) {
    status(error.message || "Capture failed.");
  }
});

saveButton.addEventListener("click", async () => {
  if (!captured?.address) return;
  const apiBase = apiBaseInput.value.trim().replace(/\/$/, "");
  chrome.storage.local.set({ apiBase });
  status("Saving to local tracker...");
  try {
    const response = await fetch(`${apiBase}/apartments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(captured),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `Save failed: ${response.status}`);
    }
    status("Saved. Open the tracker to see commute status.");
    saveButton.disabled = true;
  } catch (error) {
    status(error.message || "Save failed.");
  }
});

function status(message) {
  statusEl.textContent = message;
}

function renderPreview(data) {
  preview.innerHTML = `
    <strong>${escapeHtml(data.address || "No address found")}</strong>
    <span>${escapeHtml(formatPrice(data.price) || "No price")} / ${escapeHtml(formatBedsBaths(data))}</span>
    <span>${escapeHtml(data.agent_name || data.agent_broker || "No agent captured")}</span>
    <span>${escapeHtml(data.source || "Current page")}</span>
  `;
}

function normalizePayload(data) {
  return {
    address: clean(data.address),
    price: toNumber(data.price),
    features: clean(data.features),
    bed: toNumber(data.bed),
    bath: toNumber(data.bath),
    vibe: clean(data.vibe),
    notes: clean(data.notes),
    agent_name: clean(data.agent_name) || "N/A",
    agent_phone: clean(data.agent_phone) || "N/A",
    agent_broker: clean(data.agent_broker) || "N/A",
    listing_url: clean(data.listing_url),
    source: clean(data.source),
    favorite: false,
  };
}

function clean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text === "[object Object]") return null;
  return text || null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function formatPrice(value) {
  const number = toNumber(value);
  return number ? `$${number.toLocaleString()}` : "";
}

function formatBedsBaths(data) {
  return `${data.bed ?? "-"} bed / ${data.bath ?? "-"} bath`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractListingFromPage() {
  const text = document.body?.innerText || "";
  const title = document.title || "";
  const url = location.href;
  const source = location.hostname.replace(/^www\./, "");
  const jsonObjects = [];

  for (const script of document.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__, script[type="application/json"]')) {
    const raw = script.textContent?.trim();
    if (!raw || raw.length > 5000000) continue;
    try {
      jsonObjects.push(JSON.parse(raw));
    } catch {
      // Ignore non-JSON script payloads.
    }
  }

  const values = flattenValues(jsonObjects);
  const allText = [title, ...values.slice(0, 2500), text.slice(0, 20000)].join("\n");
  const structured = findStructuredListing(jsonObjects);
  const visible = findVisibleFacts(text, title);

  return {
    address: visible.address || structured.address || findAddress(allText, title),
    price: visible.price || structured.price || matchFirst(allText, [/\$[\d,]+(?:\s*\/\s*mo)?/i]),
    bed: visible.bed ?? structured.bed ?? matchNumber(allText, [/(\d+(?:\.\d+)?)[\s\n]*(?:bd|bed|beds|bedroom|bedrooms)\b/i]),
    bath: visible.bath ?? structured.bath ?? matchNumber(allText, [/(\d+(?:\.\d+)?)[\s\n]*(?:ba|bath|baths|bathroom|bathrooms)\b/i]),
    features: visible.features || findFeatures(allText),
    vibe: null,
    notes: visible.notes || `Captured from ${source}`,
    agent_name: visible.agent_name || structured.agent_name || findAgentName(allText),
    agent_phone: visible.agent_phone || structured.agent_phone || matchFirst(allText, [/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/]),
    agent_broker: visible.agent_broker || structured.agent_broker || findBroker(allText),
    listing_url: url,
    source,
  };

  function findVisibleFacts(pageText, pageTitle) {
    const lines = pageText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const joined = lines.join("\n");
    const facts = {};

    facts.address = findAddress(joined, pageTitle);
    facts.price = lines.find((line) => /^\$[\d,]+(?:\/mo)?$/i.test(line)) || matchFirst(joined, [/\$[\d,]+(?:\/mo)?/i]);
    facts.bed = numberBeforeLabel(lines, /^beds?$/i);
    facts.bath = numberBeforeLabel(lines, /^baths?$/i);
    facts.sqft = numberBeforeLabel(lines, /^sqft$/i);

    const specialIndex = lines.findIndex((line) => /^what'?s special$/i.test(line));
    if (specialIndex >= 0) {
      const specialLines = [];
      for (let i = specialIndex + 1; i < Math.min(lines.length, specialIndex + 9); i += 1) {
        if (/^(show more|property|facts|price history|neighborhood|listing by)/i.test(lines[i])) break;
        specialLines.push(lines[i]);
      }
      facts.features = formatFeatures(specialLines.join(" ")) || null;
    }

    const listingIndex = lines.findIndex((line) => /^(listing by:|listed by)/i.test(line));
    if (listingIndex >= 0) {
      Object.assign(facts, parseListingContact(lines, listingIndex));
    }

    const notes = [];
    if (facts.sqft) notes.push(`${facts.sqft} sqft`);
    const available = lines.find((line) => /^available/i.test(line));
    if (available) notes.push(available);
    notes.push(`Captured from ${source}`);
    facts.notes = notes.join(" / ");

    return facts;
  }

  function numberBeforeLabel(lines, labelPattern) {
    for (let i = 1; i < lines.length; i += 1) {
      if (labelPattern.test(lines[i])) {
        const number = Number(lines[i - 1].replace(/,/g, ""));
        if (Number.isFinite(number)) return number;
      }
    }
    return null;
  }

  function parseListingContact(lines, listingIndex) {
    const marker = lines[listingIndex] || "";
    const contactLines = lines.slice(listingIndex + 1, listingIndex + 16);
    const phonePattern = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
    const phone = contactLines.find((line) => phonePattern.test(line)) || null;
    const cleaned = [];

    for (const line of contactLines) {
      if (phonePattern.test(line)) continue;
      if (isContactNoise(line)) continue;
      if (/^[A-Z][A-Za-z .&'-]{2,100}$/.test(line) && !cleaned.includes(line)) {
        cleaned.push(line);
      }
    }

    const company = cleaned.find((line, index) => index > 0 && looksLikeCompany(line));
    const person = cleaned.find((line) => !looksLikeCompany(line)) || null;
    const fallbackBroker = /management company/i.test(marker) ? "management company" : null;

    return {
      agent_name: person || null,
      agent_phone: phone,
      agent_broker: company || fallbackBroker,
    };
  }

  function isContactNoise(line) {
    return /^(listing by:|listed by|listing agent|management company|property manager|contact manager|zillow|licenses|reviews?|contacts?|on zillow|zillow last checked|listing updated|price may|learn more|show more)$/i.test(line)
      || /\d+\s*\/\s*5/i.test(line)
      || /\b\d+\s+reviews?\b/i.test(line)
      || /\b\d+\s+contacts?\b/i.test(line)
      || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(line);
  }

  function looksLikeCompany(line) {
    return /(Compass|Corcoran|Elliman|Realty|Group|Properties|Management|Rentals|LLC|Inc|Broker|RE\/MAX|Keller Williams|Sotheby|Coldwell|Douglas|Company|NJ)$/i.test(line);
  }

  function findStructuredListing(objects) {
    const out = {};
    walk(objects, (key, value, parent) => {
      const lower = String(key || "").toLowerCase();
      const scalar = typeof value === "string" || typeof value === "number";
      if (!out.price && ["price", "unformattedprice", "rentzestimate"].includes(lower)) out.price = value;
      if (!out.bed && ["numberofbedrooms", "bedrooms", "beds", "bed"].includes(lower)) out.bed = value;
      if (!out.bath && ["numberofbathrooms", "bathrooms", "baths", "bath"].includes(lower)) out.bath = value;
      if (!out.agent_name && scalar && /(agent|contact).*name|name/.test(lower) && looksLikePerson(value, parent)) out.agent_name = value;
      if (!out.agent_phone && scalar && /(phone|telephone)/.test(lower)) out.agent_phone = value;
      if (!out.agent_broker && scalar && /(broker|brokerage|provider|company|businessname)/.test(lower)) out.agent_broker = value;
      if (!out.address && lower === "address") out.address = stringifyAddress(value);
      if (!out.address && ["streetaddress", "fulladdress"].includes(lower)) out.address = value;
    });
    return out;
  }

  function stringifyAddress(value) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return null;
    return [
      value.streetAddress,
      value.addressLocality || value.city,
      value.addressRegion || value.state,
      value.postalCode || value.zipcode,
    ].filter(Boolean).join(", ");
  }

  function flattenValues(input) {
    const out = [];
    walk(input, (_key, value) => {
      if (typeof value === "string" && value.length < 400) out.push(value);
      if (typeof value === "number") out.push(String(value));
    });
    return [...new Set(out)];
  }

  function walk(input, visit, parent = null, key = "") {
    if (Array.isArray(input)) {
      for (const item of input) walk(item, visit, input, key);
      return;
    }
    if (!input || typeof input !== "object") {
      visit(key, input, parent);
      return;
    }
    for (const [childKey, value] of Object.entries(input)) {
      visit(childKey, value, input);
      walk(value, visit, input, childKey);
    }
  }

  function findAddress(blob, pageTitle) {
    const titleAddress = pageTitle.split("|")[0]?.trim();
    if (/\d+.+,\s*[A-Z]{2}\s+\d{5}/.test(titleAddress)) return titleAddress;
    return matchFirst(blob, [
      /\d{1,6}\s+[A-Za-z0-9 .#'-]+,\s*[A-Za-z .'-]+,\s*(?:NY|NJ|CT|PA)\s*\d{5}/,
      /\d{1,6}\s+[A-Za-z0-9 .#'-]+\s+(?:Apt|Unit|#)?\s*[A-Za-z0-9-]*,\s*[A-Za-z .'-]+,\s*(?:NY|NJ|CT|PA)/i,
    ]);
  }

  function findAgentName(blob) {
    return matchFirst(blob, [
      /(?:Listed by|Listing provided by|Presented by|Contact agent)\s*:?\s*([A-Z][A-Za-z .'-]{2,80})/i,
      /(?:Leasing Agent|Property Manager)\s*:?\s*([A-Z][A-Za-z .'-]{2,80})/i,
    ], 1);
  }

  function findBroker(blob) {
    return matchFirst(blob, [
      /(?:Brokered by|Brokerage|Property Manager|Managed by)\s*:?\s*([A-Z0-9][A-Za-z0-9 &.,'-]{2,100})/i,
      /(Compass|Douglas Elliman|Corcoran|EXP Realty|Keller Williams|RE\/MAX|Zillow Rentals|StreetEasy)/i,
    ], 1);
  }

  function findFeatures(blob) {
    const features = [];
    for (const keyword of [
      "in-unit laundry",
      "washer/dryer",
      "central ac",
      "air conditioning",
      "doorman",
      "elevator",
      "parking",
      "dishwasher",
      "microwave",
      "stainless steel appliances",
      "gym",
      "pets allowed",
      "no fee",
      "balcony",
      "terrace",
      "hardwood",
      "closet space",
      "private entrance",
    ]) {
      if (new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(blob)) features.push(toTitle(keyword));
    }
    return features.join(" | ") || null;
  }

  function formatFeatures(value) {
    if (!value) return null;
    const known = findFeatures(value);
    const split = value
      .replace(/([a-z])([A-Z])/g, "$1 | $2")
      .replace(/\s{2,}/g, " ")
      .split(/\s*\|\s*|(?<=[a-z])(?=[A-Z][A-Z]+(?:\s|$))/)
      .map((item) => item.trim())
      .filter((item) => item.length > 2 && item.length < 70);
    const merged = [...new Set([...(known ? known.split(" | ") : []), ...split.map(toTitle)])];
    return merged.slice(0, 12).join(" | ") || null;
  }

  function toTitle(value) {
    return String(value)
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .replace(/\bAc\b/g, "AC");
  }

  function matchNumber(blob, patterns) {
    const value = matchFirst(blob, patterns, 1);
    return value ? Number(value) : null;
  }

  function matchFirst(blob, patterns, group = 0) {
    for (const pattern of patterns) {
      const match = blob.match(pattern);
      if (match?.[group]) return match[group].trim();
    }
    return null;
  }

  function looksLikePerson(value, parent) {
    if (typeof value !== "string") return false;
    if (!/^[A-Z][A-Za-z .'-]{2,80}$/.test(value.trim())) return false;
    const parentText = JSON.stringify(parent || {}).toLowerCase();
    return /agent|contact|broker|attribution|listing|provider/.test(parentText);
  }
}
