import { normalizeEntry, parseCsvRows, summarizeBusiness, toCsvRows } from "./analytics.js";

const STORAGE_KEY = "boss-daily-brief-entries";

const sampleEntries = [
  { date: "2026-07-07", stall: "Night Market", units: 42, price: 8000, cost: 3300, extraCost: 15000, weather: "rain", traffic: "low", staff: 1, inventory: 25, returningCustomers: 3, promo: false, note: "Rain started after 18:00" },
  { date: "2026-07-08", stall: "Night Market", units: 49, price: 8000, cost: 3300, extraCost: 11000, weather: "cloudy", traffic: "normal", staff: 1, inventory: 31, returningCustomers: 4, promo: false, note: "Normal day" },
  { date: "2026-07-09", stall: "Roadside", units: 53, price: 8000, cost: 3300, extraCost: 13000, weather: "sunny", traffic: "normal", staff: 2, inventory: 22, returningCustomers: 5, promo: true, note: "Small bundle promo" },
  { date: "2026-07-10", stall: "Night Market", units: 61, price: 8000, cost: 3300, extraCost: 12000, weather: "sunny", traffic: "high", staff: 2, inventory: 20, returningCustomers: 6, promo: false, note: "High student traffic" },
  { date: "2026-07-11", stall: "Night Market", units: 57, price: 8000, cost: 3300, extraCost: 14000, weather: "rain", traffic: "normal", staff: 2, inventory: 19, returningCustomers: 6, promo: false, note: "Rain at night" },
  { date: "2026-07-12", stall: "Roadside", units: 64, price: 8000, cost: 3300, extraCost: 12000, weather: "sunny", traffic: "high", staff: 2, inventory: 17, returningCustomers: 8, promo: false, note: "BBQ sold fast" },
  { date: "2026-07-13", stall: "Night Market", units: 51, price: 8000, cost: 3300, extraCost: 12000, weather: "cloudy", traffic: "normal", staff: 2, inventory: 40, returningCustomers: 5, promo: true, note: "Bundle promo" },
  { date: "2026-07-14", stall: "Night Market", units: 58, price: 8000, cost: 3300, extraCost: 10000, weather: "sunny", traffic: "high", staff: 2, inventory: 18, returningCustomers: 7, promo: false, note: "BBQ sold fastest" }
];

const elements = {
  todayLabel: document.querySelector("#todayLabel"),
  businessIndex: document.querySelector("#businessIndex"),
  briefTitle: document.querySelector("#briefTitle"),
  briefReason: document.querySelector("#briefReason"),
  unitsMetric: document.querySelector("#unitsMetric"),
  revenueMetric: document.querySelector("#revenueMetric"),
  profitMetric: document.querySelector("#profitMetric"),
  unitsDelta: document.querySelector("#unitsDelta"),
  revenueDelta: document.querySelector("#revenueDelta"),
  profitDelta: document.querySelector("#profitDelta"),
  statusChip: document.querySelector("#statusChip"),
  trendChart: document.querySelector("#trendChart"),
  riskList: document.querySelector("#riskList"),
  reasonList: document.querySelector("#reasonList"),
  entryForm: document.querySelector("#entryForm"),
  dateInput: document.querySelector("#dateInput"),
  sampleButton: document.querySelector("#sampleButton"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  clearButton: document.querySelector("#clearButton")
};

let entries = loadEntries();

elements.todayLabel.textContent = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "2-digit",
  month: "short"
}).format(new Date());
elements.dateInput.value = new Date().toISOString().slice(0, 10);

render();
registerServiceWorker();

elements.entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.entryForm).entries());
  data.promo = elements.entryForm.elements.promo.checked;
  const nextEntry = normalizeEntry(data);
  entries = upsertEntry(entries, nextEntry);
  saveEntries(entries);
  elements.entryForm.reset();
  elements.dateInput.value = nextEntry.date;
  render();
});

elements.sampleButton.addEventListener("click", () => {
  entries = sampleEntries;
  saveEntries(entries);
  render();
});

elements.clearButton.addEventListener("click", () => {
  if (!confirm("Clear all local Boss records on this device?")) return;
  entries = [];
  saveEntries(entries);
  render();
});

elements.exportButton.addEventListener("click", () => {
  const blob = new Blob([toCsvRows(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `boss-data-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

elements.importInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const text = await file.text();
  entries = mergeEntries(entries, parseCsvRows(text));
  saveEntries(entries);
  event.target.value = "";
  render();
});

function render() {
  const summary = summarizeBusiness(entries);
  const firstReason = summary.reasons[0] || "Add more records to improve Boss recommendations.";

  elements.businessIndex.textContent = summary.businessIndex;
  elements.briefTitle.textContent = summary.oneThing;
  elements.briefReason.textContent = firstReason;
  elements.unitsMetric.textContent = number(summary.today.units);
  elements.revenueMetric.textContent = rupiah(summary.today.revenue);
  elements.profitMetric.textContent = rupiah(summary.today.profit);
  elements.unitsDelta.textContent = deltaText(summary.comparison.previousDay.unitsDelta, "units");
  elements.revenueDelta.textContent = deltaText(summary.comparison.previousDay.revenueDelta, "Rp");
  elements.profitDelta.textContent = deltaText(summary.comparison.previousDay.profitDelta, "Rp");
  elements.statusChip.textContent = summary.status;

  renderList(elements.riskList, summary.risks, "No major risk detected yet.");
  renderList(elements.reasonList, summary.reasons, "Boss needs more records to explain trends.");
  renderChart(summary.trend30);
}

function renderChart(trend) {
  if (!trend.length) {
    elements.trendChart.innerHTML = `<text x="24" y="110" fill="#637069" font-size="24">No data yet</text>`;
    return;
  }

  const width = 640;
  const height = 220;
  const padding = 26;
  const values = trend.map((entry) => entry.units);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const points = trend.map((entry, index) => {
    const x = padding + (index / Math.max(trend.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((entry.units - min) / range) * (height - padding * 2);
    return [x, y];
  });
  const path = points.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${path} L ${points.at(-1)[0].toFixed(1)} ${height - padding} L ${points[0][0].toFixed(1)} ${height - padding} Z`;
  const [lastX, lastY] = points.at(-1);

  elements.trendChart.innerHTML = `
    <line class="chart-axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}"></line>
    <path class="chart-area" d="${area}"></path>
    <path class="chart-line" d="${path}"></path>
    <circle class="chart-dot" cx="${lastX}" cy="${lastY}" r="8"></circle>
    <text x="${padding}" y="24" fill="#637069" font-size="18">High ${max}</text>
    <text x="${padding}" y="${height - 4}" fill="#637069" font-size="18">Low ${min}</text>
  `;
}

function renderList(container, items, fallback) {
  container.innerHTML = "";
  const values = items.length ? items : [fallback];
  for (const item of values) {
    const li = document.createElement("li");
    li.textContent = item;
    container.append(li);
  }
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveEntries(nextEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

function upsertEntry(currentEntries, entry) {
  return mergeEntries(currentEntries.filter((item) => !(item.date === entry.date && item.stall === entry.stall)), [entry]);
}

function mergeEntries(currentEntries, newEntries) {
  const map = new Map();
  for (const entry of [...currentEntries, ...newEntries]) {
    const normalized = normalizeEntry(entry);
    map.set(`${normalized.date}-${normalized.stall}`, normalized);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function rupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function number(value) {
  return new Intl.NumberFormat("id-ID").format(value || 0);
}

function deltaText(value, suffix) {
  if (!value) return "No change";
  const sign = value > 0 ? "+" : "";
  if (suffix === "Rp") return `${sign}${rupiah(value)} vs previous`;
  return `${sign}${number(value)} ${suffix} vs previous`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
