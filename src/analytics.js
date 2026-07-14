const CSV_HEADERS = [
  "date",
  "vehicle",
  "stall",
  "product",
  "units",
  "price",
  "cost",
  "extraCost",
  "weather",
  "traffic",
  "staff",
  "inventory",
  "returningCustomers",
  "sauceCount",
  "promo",
  "note"
];

export function summarizeBusiness(entries, today = new Date()) {
  const normalized = aggregateEntriesByDate(normalizeEntries(entries)).sort((a, b) => a.date.localeCompare(b.date));
  const todayKey = toDateKey(today);
  const todayEntry = findEntryForDate(normalized, todayKey) ?? normalized.at(-1);

  if (!todayEntry) {
    return {
      empty: true,
      today: emptyEntry(todayKey),
      comparison: {
        previousDay: { unitsDelta: 0, profitDelta: 0 },
        previousWeek: { unitsDelta: 0, profitDelta: 0 }
      },
      businessIndex: 0,
      status: "empty",
      oneThing: "Add today's first sales record.",
      reasons: ["Boss needs at least one record before it can learn your pattern."],
      risks: [],
      trend7: [],
      trend30: []
    };
  }

  const previousDay = previousEntry(normalized, todayEntry.date);
  const previousWeek = findEntryForDate(normalized, shiftDate(todayEntry.date, -7));
  const trend7 = normalized.slice(-7);
  const trend30 = normalized.slice(-30);
  const businessIndex = calculateBusinessIndex(todayEntry, previousDay, previousWeek, trend7);
  const status = calculateStatus(todayEntry, previousDay);
  const risks = buildRisks(todayEntry, previousDay);
  const reasons = buildReasons(todayEntry, previousDay, previousWeek, trend7);

  return {
    empty: false,
    today: todayEntry,
    comparison: {
      previousDay: compareEntries(todayEntry, previousDay),
      previousWeek: compareEntries(todayEntry, previousWeek)
    },
    businessIndex,
    status,
    oneThing: buildOneThing(todayEntry, previousDay, risks),
    reasons,
    risks,
    trend7,
    trend30
  };
}

export function parseCsvRows(csvText) {
  const rows = parseCsv(csvText.trim());
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => canonicalHeader(header.trim()));
  return rows.slice(1).filter((row) => row.some(Boolean)).filter((row) => hasRecordedUnits(headers, row)).map((row) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    return normalizeEntry(record);
  });
}

export function toCsvRows(entries) {
  const lines = [CSV_HEADERS.join(",")];
  for (const entry of normalizeEntries(entries)) {
    lines.push(CSV_HEADERS.map((header) => escapeCsv(entry[header] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function filterEntriesByVehicle(entries, vehicle = "all") {
  const normalized = normalizeEntries(entries);
  if (!vehicle || vehicle === "all") return normalized;
  return normalized.filter((entry) => entry.vehicle === vehicle);
}

export function normalizeEntry(entry) {
  const units = toNumber(entry.units);
  const price = toNumber(entry.price);
  const cost = toNumber(entry.cost);
  const extraCost = toNumber(entry.extraCost);
  const revenue = units * price;
  const profit = revenue - units * cost - extraCost;

  return {
    date: String(entry.date || toDateKey(new Date())),
    vehicle: String(entry.vehicle || inferVehicle(entry.stall)),
    stall: String(entry.stall || "Main Stall"),
    product: String(entry.product || "Sosis"),
    units,
    price,
    cost,
    extraCost,
    weather: String(entry.weather || "normal"),
    traffic: String(entry.traffic || "normal"),
    staff: toNumber(entry.staff || 1),
    inventory: toNumber(entry.inventory),
    returningCustomers: toNumber(entry.returningCustomers),
    sauceCount: toNumber(entry.sauceCount ?? entry.sauce_count),
    promo: parseBoolean(entry.promo),
    note: String(entry.note || ""),
    revenue,
    profit
  };
}

export function normalizeEntries(entries) {
  return Array.isArray(entries) ? entries.map(normalizeEntry).filter((entry) => entry.date) : [];
}

function emptyEntry(date) {
  return normalizeEntry({ date, units: 0, price: 0, cost: 0, extraCost: 0 });
}

function aggregateEntriesByDate(entries) {
  const map = new Map();
  for (const entry of entries) {
    const current = map.get(entry.date) || {
      ...entry,
      vehicle: "all",
      stall: "All",
      product: "Mixed",
      units: 0,
      price: 0,
      cost: 0,
      extraCost: 0,
      staff: 0,
      inventory: 0,
      returningCustomers: 0,
      sauceCount: 0,
      promo: false,
      revenue: 0,
      profit: 0
    };

    current.units += entry.units;
    current.extraCost += entry.extraCost;
    current.staff += entry.staff;
    current.inventory += entry.inventory;
    current.returningCustomers += entry.returningCustomers;
    current.sauceCount += entry.sauceCount;
    current.promo = current.promo || entry.promo;
    current.revenue += entry.revenue;
    current.profit += entry.profit;
    current.price = current.units ? Math.round(current.revenue / current.units) : 0;
    current.cost = current.units ? Math.round((current.revenue - current.profit - current.extraCost) / current.units) : 0;
    current.weather = mergeWeather(current.weather, entry.weather);
    current.traffic = mergeTraffic(current.traffic, entry.traffic);
    map.set(entry.date, current);
  }
  return [...map.values()];
}

function calculateBusinessIndex(today, previousDay, previousWeek, trend7) {
  let score = 55;
  if (previousDay?.units) score += clamp(((today.units - previousDay.units) / previousDay.units) * 30, -18, 18);
  if (previousWeek?.units) score += clamp(((today.units - previousWeek.units) / previousWeek.units) * 20, -12, 12);
  if (today.traffic === "high") score += 8;
  if (today.weather === "sunny") score += 4;
  if (today.weather === "rain") score -= 10;
  if (today.inventory > 0 && today.inventory < Math.max(12, today.units * 0.35)) score -= 8;

  const average7 = average(trend7.map((entry) => entry.units));
  if (average7 && today.units > average7) score += 6;
  if (average7 && today.units < average7 * 0.85) score -= 8;

  return Math.round(clamp(score, 0, 100));
}

function buildOneThing(today, previousDay, risks) {
  if (today.inventory > 0 && today.inventory < Math.max(20, today.units * 0.4)) {
    return "Prepare more stock before the next rush hour.";
  }
  if (today.traffic === "high" && !today.promo) {
    return "Push the best-selling menu now while traffic is high.";
  }
  if (previousDay?.units && today.units < previousDay.units * 0.85) {
    return "Run one simple promo before closing to recover sales.";
  }
  if (today.weather === "rain") {
    return "Reduce fresh prep and focus on fast-selling items.";
  }
  if (risks.length) {
    return "Fix the highest risk before adding new promotion.";
  }
  return "Keep the current setup and protect today's margin.";
}

function buildRisks(today, previousDay) {
  const risks = [];
  if (today.inventory > 0 && today.inventory < Math.max(20, today.units * 0.4)) {
    risks.push("Inventory is low compared with today's sales pace.");
  }
  if (today.weather === "rain") {
    risks.push("Rain can reduce walk-in traffic and increase waste risk.");
  }
  if (previousDay?.units && today.units < previousDay.units * 0.85) {
    risks.push("Sales are below the previous recorded day.");
  }
  if (today.staff < 1) {
    risks.push("No staff coverage recorded for today.");
  }
  return risks;
}

function buildReasons(today, previousDay, previousWeek, trend7) {
  const reasons = [];
  if (previousDay) {
    const delta = today.units - previousDay.units;
    reasons.push(`${delta >= 0 ? "Up" : "Down"} ${Math.abs(delta)} units versus previous record.`);
  }
  if (previousWeek) {
    const delta = today.units - previousWeek.units;
    reasons.push(`${delta >= 0 ? "Up" : "Down"} ${Math.abs(delta)} units versus the same day last week.`);
  }
  const average7 = average(trend7.map((entry) => entry.units));
  if (average7) reasons.push(`7-day average is ${Math.round(average7)} units.`);
  if (today.returningCustomers) reasons.push(`${today.returningCustomers} returning customers recorded today.`);
  if (today.promo) reasons.push("Promotion was active, so compare margin carefully.");
  return reasons;
}

function calculateStatus(today, previousDay) {
  if (!previousDay?.units) return "new";
  if (today.units > previousDay.units * 1.05) return "up";
  if (today.units < previousDay.units * 0.95) return "down";
  return "steady";
}

function compareEntries(today, baseline) {
  return {
    unitsDelta: baseline ? today.units - baseline.units : 0,
    profitDelta: baseline ? today.profit - baseline.profit : 0,
    revenueDelta: baseline ? today.revenue - baseline.revenue : 0
  };
}

function previousEntry(entries, date) {
  const before = entries.filter((entry) => entry.date < date);
  return before.at(-1);
}

function findEntryForDate(entries, date) {
  return entries.find((entry) => entry.date === date);
}

function toDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  return value.toISOString().slice(0, 10);
}

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "y"].includes(String(value).trim().toLowerCase());
}

function canonicalHeader(header) {
  const normalized = header.trim().toLowerCase();
  const aliases = {
    location: "stall",
    car: "vehicle",
    quantity: "units",
    sauce_count: "sauceCount",
    saucecount: "sauceCount"
  };
  return aliases[normalized] || header;
}

function inferVehicle(stall) {
  const value = String(stall || "").trim().toLowerCase();
  if (["夜市", "night market", "pasar malam"].includes(value)) return "1号车";
  if (["路边", "roadside", "pinggir jalan"].includes(value)) return "2号车";
  return "1号车";
}

function mergeWeather(current, next) {
  if (current === "rain" || next === "rain") return "rain";
  if (current === "cloudy" || next === "cloudy") return "cloudy";
  if (current === "sunny" || next === "sunny") return "sunny";
  return "normal";
}

function mergeTraffic(current, next) {
  if (current === "high" || next === "high") return "high";
  if (current === "low" || next === "low") return "low";
  return "normal";
}

function hasRecordedUnits(headers, row) {
  const unitsIndex = headers.indexOf("units");
  if (unitsIndex === -1) return true;
  return String(row[unitsIndex] ?? "").trim() !== "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function escapeCsv(value) {
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
