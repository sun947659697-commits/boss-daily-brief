import { normalizeEntry, parseCsvRows, summarizeBusiness, toCsvRows } from "./analytics.js";
import { translate, translateGeneratedText, translateList } from "./i18n.js";

const STORAGE_KEY = "boss-daily-brief-entries";
const LANGUAGE_KEY = "boss-daily-brief-language";
const REAL_DATA_URL = "./data/sosis-sales.csv?v=0.3";

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
  clearButton: document.querySelector("#clearButton"),
  languageSelect: document.querySelector("#languageSelect")
};

let entries = loadEntries();
let language = loadLanguage();

elements.languageSelect.value = language;
elements.dateInput.value = new Date().toISOString().slice(0, 10);

render();
hydrateRealSalesData();
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

elements.sampleButton.addEventListener("click", async () => {
  await loadRealSalesData({ overwrite: false });
});

elements.languageSelect.addEventListener("change", (event) => {
  language = event.target.value;
  localStorage.setItem(LANGUAGE_KEY, language);
  render();
});

elements.clearButton.addEventListener("click", () => {
  if (!confirm(translate("confirm.clear", language))) return;
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
  applyTranslations();
  const summary = summarizeBusiness(entries);
  const firstReason = translateGeneratedText(summary.reasons[0], language) || translate("fallback.reason", language);

  elements.businessIndex.textContent = summary.businessIndex;
  elements.briefTitle.textContent = translateGeneratedText(summary.oneThing, language);
  elements.briefReason.textContent = firstReason;
  elements.unitsMetric.textContent = number(summary.today.units);
  elements.revenueMetric.textContent = rupiah(summary.today.revenue);
  elements.profitMetric.textContent = rupiah(summary.today.profit);
  elements.unitsDelta.textContent = deltaText(summary.comparison.previousDay.unitsDelta, translate("metric.units", language));
  elements.revenueDelta.textContent = deltaText(summary.comparison.previousDay.revenueDelta, "Rp");
  elements.profitDelta.textContent = deltaText(summary.comparison.previousDay.profitDelta, "Rp");
  elements.statusChip.textContent = translate(`status.${summary.status}`, language);

  renderList(elements.riskList, translateList(summary.risks, language), translate("fallback.risk", language));
  renderList(elements.reasonList, translateList(summary.reasons, language), translate("fallback.evidence", language));
  renderChart(summary.trend30);
}

async function hydrateRealSalesData() {
  if (entries.length) return;
  await loadRealSalesData({ overwrite: true });
}

async function loadRealSalesData({ overwrite }) {
  elements.sampleButton.disabled = true;
  try {
    const response = await fetch(REAL_DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load sales data: ${response.status}`);
    const realEntries = parseCsvRows(await response.text());
    entries = overwrite ? realEntries : mergeEntries(entries, realEntries);
    saveEntries(entries);
    render();
  } catch (error) {
    console.error(error);
  } finally {
    elements.sampleButton.disabled = false;
  }
}

function renderChart(trend) {
  if (!trend.length) {
    elements.trendChart.innerHTML = `<text x="24" y="110" fill="#637069" font-size="24">${translate("chart.empty", language)}</text>`;
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
    <text x="${padding}" y="24" fill="#637069" font-size="18">${translate("chart.high", language)} ${max}</text>
    <text x="${padding}" y="${height - 4}" fill="#637069" font-size="18">${translate("chart.low", language)} ${min}</text>
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

function loadLanguage() {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (["zh", "id", "en"].includes(stored)) return stored;
  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith("zh")) return "zh";
  if (browserLanguage.startsWith("id")) return "id";
  return "en";
}

function applyTranslations() {
  document.documentElement.lang = language;
  document.title = `Boss ${translate("app.title", language)}`;
  elements.todayLabel.textContent = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, {
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(new Date());

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = translate(node.dataset.i18n, language);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", translate(node.dataset.i18nPlaceholder, language));
  });
}

function saveEntries(nextEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

function upsertEntry(currentEntries, entry) {
  return mergeEntries(currentEntries.filter((item) => {
    const normalized = normalizeEntry(item);
    return !(normalized.date === entry.date && normalized.stall === entry.stall && normalized.product === entry.product);
  }), [entry]);
}

function mergeEntries(currentEntries, newEntries) {
  const map = new Map();
  for (const entry of [...currentEntries, ...newEntries]) {
    const normalized = normalizeEntry(entry);
    map.set(`${normalized.date}-${normalized.stall}-${normalized.product}`, normalized);
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
  if (!value) return translate("delta.noChange", language);
  const sign = value > 0 ? "+" : "";
  if (suffix === "Rp") return `${sign}${rupiah(value)} ${translate("delta.previous", language)}`;
  return `${sign}${number(value)} ${suffix} ${translate("delta.previous", language)}`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
