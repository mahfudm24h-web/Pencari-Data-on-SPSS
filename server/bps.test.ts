import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://unused";
const { buildBpsDataset } = await import("./bps");

// Shape and values of the example in the official documentation.
const docExample = {
  status: "OK",
  "data-availability": "available",
  var: [{ val: 145, label: "Persentase Rumah Tangga Menurut Provinsi dan Sumber Penerangaan", unit: "Persen", subj: "Lingkungan Hidup", def: "", decimal: "", note: "- Sumber: Susenas, BPS." }],
  turvar: [{ val: 289, label: "Listrik PLN" }],
  labelvervar: "Provinsi",
  vervar: [{ val: 9999, label: "INDONESIA" }],
  tahun: [{ val: 100, label: "2000" }],
  turtahun: [{ val: 0, label: "Tahun" }],
  datacontent: { "99991452891000": 83.68 },
};

test("reads the documented example", () => {
  const ds = buildBpsDataset(docExample, "Indonesia");
  assert.deepEqual(ds.variables.map((v) => v.name), ["wilayah", "tahun", "nilai"]);
  assert.deepEqual(ds.data, [{ wilayah: "INDONESIA", tahun: 2000, nilai: 83.68 }]);
  assert.equal(ds.variables[2].label, "Persentase Rumah Tangga Menurut Provinsi dan Sumber Penerangaan (Persen)");
  assert.equal(ds.variables[0].label, "Provinsi");
});

test("several derived variables become columns; missing cells stay empty", () => {
  const ds = buildBpsDataset(
    {
      ...docExample,
      turvar: [{ val: 289, label: "Listrik PLN" }, { val: 290, label: "Listrik Non PLN" }],
      vervar: [{ val: 7300, label: "SULAWESI SELATAN" }, { val: 9999, label: "INDONESIA" }],
      tahun: [{ val: 100, label: "2000" }, { val: 101, label: "2001" }],
      datacontent: {
        "73001452891000": "80,5",
        "73001452901000": 3.2,
        "73001452891010": 82,
        "99991452891000": 83.68,
        "99991452901010": null,
      },
    },
    "Indonesia"
  );
  assert.deepEqual(ds.variables.map((v) => v.name), ["wilayah", "tahun", "Listrik_PLN", "Listrik_Non_PLN"]);
  assert.deepEqual(ds.data, [
    { wilayah: "SULAWESI SELATAN", tahun: 2000, Listrik_PLN: 80.5, Listrik_Non_PLN: 3.2 },
    { wilayah: "SULAWESI SELATAN", tahun: 2001, Listrik_PLN: 82, Listrik_Non_PLN: null },
    { wilayah: "INDONESIA", tahun: 2000, Listrik_PLN: 83.68, Listrik_Non_PLN: null },
  ]);
});

test("monthly data keeps the period column", () => {
  const ds = buildBpsDataset(
    {
      ...docExample,
      turvar: [{ val: 0, label: "Tidak ada" }],
      turtahun: [{ val: 1, label: "Januari" }, { val: 2, label: "Februari" }],
      datacontent: { "999914501001": 1.1, "999914501002": 1.2 },
    },
    "Indonesia"
  );
  assert.deepEqual(ds.data, [
    { wilayah: "INDONESIA", tahun: 2000, periode: "Januari", nilai: 1.1 },
    { wilayah: "INDONESIA", tahun: 2000, periode: "Februari", nilai: 1.2 },
  ]);
});

test("fails instead of returning a table when keys cannot be matched", () => {
  assert.throws(() => buildBpsDataset({ ...docExample, datacontent: { "123": 1 } }, "Indonesia"), /belum didukung/);
  assert.throws(() => buildBpsDataset({ ...docExample, datacontent: {} }, "Indonesia"), /tidak punya data/);
});
