import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, normalizeDataset, normalizeVariableName, parseNumber } from "./dataset";

test("parseNumber handles English and Indonesian formats", () => {
  assert.equal(parseNumber("1234.5"), 1234.5);
  assert.equal(parseNumber("1,234.5"), 1234.5);
  assert.equal(parseNumber("1.234,5"), 1234.5);
  assert.equal(parseNumber("2,5"), 2.5);
  assert.equal(parseNumber("1,234"), 1234);
  assert.equal(parseNumber("1,234,567"), 1234567);
  assert.equal(parseNumber("1.234.567"), 1234567);
  assert.equal(parseNumber("-0.75"), -0.75);
  assert.equal(parseNumber("5.3%"), 5.3);
  assert.equal(parseNumber(" 12 345 "), 12345);
  assert.equal(parseNumber("n/a"), null);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("1,2,3"), null);
  assert.equal(parseNumber("."), null);
});

test("normalizeVariableName produces legal unique SPSS names", () => {
  const used = new Set<string>();
  assert.equal(normalizeVariableName("GDP per capita", used, 0), "GDP_per_capita");
  assert.equal(normalizeVariableName("gdp per capita", used, 1), "gdp_per_capita_2");
  assert.equal(normalizeVariableName("2020", used, 2), "v_2020");
  assert.equal(normalizeVariableName("", used, 3), "var4");
  assert.equal(normalizeVariableName("by", used, 4), "by_");
});

test("normalizeDataset aligns rows, converts numbers and filters sources", () => {
  const ds = normalizeDataset({
    title: "T",
    sources: ["https://example.org/a", "javascript:alert(1)", "not a url"],
    variables: [
      { name: "year", type: "Numeric", label: "Year", measure: "Ordinal" },
      { name: "year", type: "Numeric", label: "GDP", measure: "Scale" },
      { name: "note", type: "String", label: "Note", measure: "Scale" },
    ],
    observations: [
      { values: ["2020", "1.234,56", "<img src=x onerror=alert(1)>"] },
      { values: ["2021", "abc"] },
    ],
  });
  assert.deepEqual(ds.variables.map((v) => v.name), ["year", "year_2", "note"]);
  assert.equal(ds.variables[2].measure, "Nominal");
  assert.equal(ds.data[0].year_2, 1234.56);
  assert.equal(ds.variables[1].decimals, 2);
  assert.equal(ds.data[1].year_2, null);
  assert.equal(ds.data[1].note, null);
  assert.deepEqual(ds.sources.map((s) => s.url), ["https://example.org/a"]);
  assert.equal(ds.warnings.length, 2);
});

test("normalizeDataset rejects output without variables", () => {
  assert.throws(() => normalizeDataset({ title: "x" }));
});

test("extractJson tolerates code fences", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
});
