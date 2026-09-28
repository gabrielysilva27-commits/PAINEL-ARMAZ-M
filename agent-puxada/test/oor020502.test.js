const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parse020502, discover020502Files, parseOorQuantity } = require("../lib/csv020502");

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


const nested = path.join(dir, "2026", "09 - Setembro - 2026", "CSV");
fs.mkdirSync(nested, { recursive: true });
const file2 = path.join(nested, "23 - estoque.csv");
fs.writeFileSync(file2,
  "Relatório 02.05.02;00306720\n" +
  "ITEM;DESCRICAO;QTDE DISPONIVEL\n" +
  "988;BRAHMA 600;10\n" +
  "504;PEPSI 2L;4\n",
  "utf8"
);
const parsed2 = parse020502(file2);
assert.strictEqual(parsed2.reference_date, "2026-09-23");
assert.strictEqual(parsed2.aggregated_rows, 2);
console.log("020502 date guard OK");

const root = path.join(dir, "liberacao");
const csvDir = path.join(root, "2026", "09 - Setembro - 2026", "CSV");
fs.mkdirSync(csvDir, { recursive: true });
for (const name of ["28.09 - LIBERAÇÃO CHEIO.inf","28.09 - LIBERAÇÃO DEVOLUÇÃO.inf","28.09 - LIBERAÇÃO ANÁLISE (PNC).inf"]) {
  fs.writeFileSync(path.join(csvDir, name), "ITEM;QTDE DISPONIVEL\n988;1\n", "utf8");
}
const found = discover020502Files(root).map(x => x.name);
assert.deepStrictEqual(found, ["28.09 - LIBERAÇÃO CHEIO.inf"]);
console.log("020502 CHEIO-only discovery OK");


assert.strictEqual(parseOorQuantity("5.908/03", "cx"), 5908);
assert.strictEqual(parseOorQuantity("4.652/02", "cx"), 4652);
assert.strictEqual(parseOorQuantity("255/10", "Dz"), 127.5);
assert.strictEqual(parseOorQuantity("30/00", "L"), 30);
assert.strictEqual(parseOorQuantity("1.100/00", "L"), 1100);

const packed = path.join(csvDir, "28.09 - LIBERAÇÃO CHEIO - oor.inf");
fs.writeFileSync(packed,
  "ARMAZEM;DEPOSITO;;PRODUTO;DESCRICAO;UNIDADE;SALDO ANTERIOR;ENTRADAS;SAIDAS;SALDO ATUAL;TRANSITO;DISPONIVEL;INVENTARIO;DIFERENCA;DIFERENCA CONGELAMENTO;TRANS_ANT;TRANS_ANT_NAO_CARREGADO;TRANS_DIA_NAO_CARREGADO;COMODATO OP03;VENDA VAS OP85;VALORIZACAO;SINAL;TIPO;FATOR\n" +
  "01;01;000;00000503;SUKITA PET 2L CAIXA C/6;cx;6.000/04;0/00;0/00;6.000/04;92/01;5.908/03;5.913/02;;;0/00;0/00;0/00;0/00;0/00;00000000133,7383333;;PA;6\n" +
  "01;01;000;00000982;SKOL 600ML;Dz;259/10;0/00;0/00;259/10;4/00;255/10;255/10;;;0/00;0/00;0/00;0/00;0/00;0;;PA;12\n" +
  "01;01;000;00000838;CHOPP BRAHMA CLARO BARRIL KEG 50L;L;1.550/00;0/00;0/00;1.550/00;450/00;1.100/00;1.100/00;;;0/00;0/00;0/00;0/00;0/00;0;;PA;1\n",
  "utf8"
);
const packedParsed = parse020502(packed);
assert.strictEqual(packedParsed.quantity_column, "DISPONIVEL");
assert.strictEqual(packedParsed.rows.find(x => x.sku_code === "503").available_qty, 5908);
assert.strictEqual(packedParsed.rows.find(x => x.sku_code === "982").available_qty, 127.5);
assert.strictEqual(packedParsed.rows.find(x => x.sku_code === "838").available_qty, 1100);
console.log("020502 OOR original quantity rule OK");
