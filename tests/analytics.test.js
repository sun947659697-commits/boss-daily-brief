import test from "node:test";
import assert from "node:assert/strict";
import { parseCsvRows, summarizeBusiness, toCsvRows } from "../src/analytics.js";

const sampleEntries = [
  {
    date: "2026-07-07",
    stall: "Night Market",
    units: 42,
    price: 8000,
    cost: 3300,
    extraCost: 15000,
    weather: "rain",
    traffic: "low",
    staff: 1,
    inventory: 25,
    returningCustomers: 3,
    promo: false,
    note: "Rain started after 18:00"
  },
  {
    date: "2026-07-13",
    stall: "Night Market",
    units: 51,
    price: 8000,
    cost: 3300,
    extraCost: 12000,
    weather: "cloudy",
    traffic: "normal",
    staff: 2,
    inventory: 40,
    returningCustomers: 5,
    promo: true,
    note: "Bundle promo"
  },
  {
    date: "2026-07-14",
    stall: "Night Market",
    units: 58,
    price: 8000,
    cost: 3300,
    extraCost: 10000,
    weather: "sunny",
    traffic: "high",
    staff: 2,
    inventory: 18,
    returningCustomers: 7,
    promo: false,
    note: "BBQ sold fastest"
  }
];

test("summarizeBusiness calculates revenue, profit, trend, index, and recommendation", () => {
  const summary = summarizeBusiness(sampleEntries, new Date("2026-07-14T12:00:00+07:00"));

  assert.equal(summary.today.units, 58);
  assert.equal(summary.today.revenue, 464000);
  assert.equal(summary.today.profit, 262600);
  assert.equal(summary.comparison.previousDay.unitsDelta, 7);
  assert.equal(summary.comparison.previousWeek.unitsDelta, 16);
  assert.equal(summary.status, "up");
  assert.ok(summary.businessIndex >= 70);
  assert.match(summary.oneThing, /prepare|stock|promote|push|focus/i);
  assert.ok(summary.risks.some((risk) => /inventory|stock/i.test(risk)));
});

test("summarizeBusiness returns an empty state when there are no entries", () => {
  const summary = summarizeBusiness([], new Date("2026-07-14T12:00:00+07:00"));

  assert.equal(summary.empty, true);
  assert.equal(summary.today.units, 0);
  assert.equal(summary.oneThing, "Add today's first sales record.");
});

test("parseCsvRows imports numeric and boolean fields", () => {
  const rows = parseCsvRows(`date,stall,units,price,cost,extraCost,weather,traffic,staff,inventory,returningCustomers,promo,note
2026-07-14,Night Market,58,8000,3300,10000,sunny,high,2,18,7,false,BBQ sold fastest`);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].units, 58);
  assert.equal(rows[0].promo, false);
  assert.equal(rows[0].note, "BBQ sold fastest");
});

test("toCsvRows exports rows that can be imported again", () => {
  const csv = toCsvRows(sampleEntries);
  const imported = parseCsvRows(csv);

  assert.equal(imported.length, sampleEntries.length);
  assert.equal(imported[2].profit, 262600);
  assert.equal(imported[2].returningCustomers, 7);
});
