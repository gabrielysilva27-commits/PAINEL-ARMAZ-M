const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parse020502 } = require("../lib/csv020502");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oor020502-"));
const file = path.join(dir, "Estoque_22-09-2026.csv");
fs.writeFileSync(file,
  "Relatório 02.05.02;22/09/2026\n" +
  "ITEM;DESCRICAO;UNIDADE;QTDE DISPONIVEL\n" +
  "00988;BRAHMA 600;CX;1.234,5\n" +
  "988;BRAHMA 600;CX;5,5\n" +
  "504;PEPSI 2L;CX;0\n",
  "utf8"
);
const parsed = parse020502(file);
assert.strictEqual(parsed.reference_date, "2026-09-22");
assert.strictEqual(parsed.aggregated_rows, 2);
assert.strictEqual(parsed.quantity_column, "QTDE DISPONIVEL");
assert.strictEqual(parsed.rows.find(x => x.sku_code === "988").available_qty, 1240);
assert.strictEqual(parsed.rows.find(x => x.sku_code === "504").available_qty, 0);
console.log("020502 parser OK");
