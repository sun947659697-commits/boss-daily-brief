import test from "node:test";
import assert from "node:assert/strict";
import { translate, translateList } from "../src/i18n.js";

test("translate returns English labels by default", () => {
  assert.equal(translate("app.title"), "Daily Brief");
  assert.equal(translate("metric.units"), "Units");
});

test("translate supports Chinese interface labels", () => {
  assert.equal(translate("app.title", "zh"), "每日简报");
  assert.equal(translate("action.save", "zh"), "保存今日记录");
});

test("translate supports Indonesian interface labels", () => {
  assert.equal(translate("app.title", "id"), "Ringkasan Harian");
  assert.equal(translate("action.save", "id"), "Simpan catatan hari ini");
});

test("translateList translates generated Boss advice", () => {
  const advice = ["Prepare more stock before the next rush hour."];
  assert.deepEqual(translateList(advice, "zh"), ["高峰期前多准备一些库存。"]);
  assert.deepEqual(translateList(advice, "id"), ["Siapkan stok lebih banyak sebelum jam ramai berikutnya."]);
});

test("translateList translates dynamic evidence text", () => {
  const evidence = ["Up 7 units versus previous record.", "7-day average is 52 units."];

  assert.deepEqual(translateList(evidence, "zh"), ["比上一条记录多 7 份。", "7天平均销量是 52 份。"]);
  assert.deepEqual(translateList(evidence, "id"), [
    "Naik 7 unit dibanding catatan sebelumnya.",
    "Rata-rata 7 hari adalah 52 unit."
  ]);
});
