import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterEntriesByVehicle, parseCsvRows, summarizeBusiness, toCsvRows } from "../src/analytics.js";

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

test("parseCsvRows imports the real sosis sales headers", () => {
  const rows = parseCsvRows(`date,location,product,price,quantity,sauce_count
2026-07-12,夜市,Sosis 4 Sisi,8000,87,
2026-07-12,路边,普通淀粉肠,5000,36,8`);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].stall, "夜市");
  assert.equal(rows[0].vehicle, "1号车");
  assert.equal(rows[0].product, "Sosis 4 Sisi");
  assert.equal(rows[0].units, 87);
  assert.equal(rows[0].sauceCount, 0);
  assert.equal(rows[1].stall, "路边");
  assert.equal(rows[1].vehicle, "2号车");
  assert.equal(rows[1].product, "普通淀粉肠");
  assert.equal(rows[1].sauceCount, 8);
});

test("parseCsvRows skips real sales rows without a recorded quantity", () => {
  const rows = parseCsvRows(`date,location,product,price,quantity,sauce_count
2026-06-07,夜市,普通淀粉肠,5000,, 
2026-06-08,夜市,普通淀粉肠,5000,20,3`);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-06-08");
  assert.equal(rows[0].units, 20);
});

test("real sosis sales seed imports into analysis entries", () => {
  const rows = parseCsvRows(readFileSync("data/sosis-sales.csv", "utf8"));

  assert.equal(rows.length, 65);
  assert.equal(rows.reduce((sum, row) => sum + row.units, 0), 2845);
  assert.equal(rows.at(-1).product, "普通淀粉肠");
  assert.equal(rows.at(-1).sauceCount, 9);
});

test("filterEntriesByVehicle returns one car or all cars", () => {
  const rows = parseCsvRows(`date,location,product,price,quantity,sauce_count
2026-07-13,夜市,Sosis 4 Sisi,8000,22,
2026-07-13,路边,普通淀粉肠,5000,30,9`);

  assert.equal(filterEntriesByVehicle(rows, "all").length, 2);
  assert.equal(filterEntriesByVehicle(rows, "1号车").length, 1);
  assert.equal(filterEntriesByVehicle(rows, "1号车")[0].units, 22);
  assert.equal(filterEntriesByVehicle(rows, "2号车")[0].units, 30);
});

test("summarizeBusiness aggregates same-day rows when viewing all cars", () => {
  const rows = parseCsvRows(`date,location,product,price,quantity,sauce_count
2026-07-12,夜市,Sosis 4 Sisi,8000,87,
2026-07-12,路边,普通淀粉肠,5000,36,8
2026-07-13,夜市,Sosis 4 Sisi,8000,22,
2026-07-13,路边,普通淀粉肠,5000,30,9`);

  const allCars = summarizeBusiness(rows, new Date("2026-07-14T08:00:00+07:00"));
  const carOne = summarizeBusiness(filterEntriesByVehicle(rows, "1号车"), new Date("2026-07-14T08:00:00+07:00"));
  const carTwo = summarizeBusiness(filterEntriesByVehicle(rows, "2号车"), new Date("2026-07-14T08:00:00+07:00"));

  assert.equal(allCars.today.units, 52);
  assert.equal(allCars.today.revenue, 326000);
  assert.equal(carOne.today.units, 22);
  assert.equal(carTwo.today.units, 30);
});

test("toCsvRows exports rows that can be imported again", () => {
  const csv = toCsvRows(sampleEntries);
  const imported = parseCsvRows(csv);

  assert.equal(imported.length, sampleEntries.length);
  assert.equal(imported[2].profit, 262600);
  assert.equal(imported[2].returningCustomers, 7);
});
