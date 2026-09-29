const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const oorSync = require("../lib/oor-sync");

function dmy(iso) {
  const p = iso.split("-");
  return p[2] + "." + p[1] + "." + p[0];
}

(async function () {
  assert.strictEqual(oorSync.localDateIso(new Date(2026, 8, 28, 10, 0, 0)), "2026-09-28");

  const today = oorSync.localDateIso();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oor-once-"));
  const csvDir = path.join(root, "CSV");
  fs.mkdirSync(csvDir, { recursive: true });

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = oorSync.localDateIso(yesterdayDate);

  const body =
    "ARMAZEM;DEPOSITO;;PRODUTO;DESCRICAO;UNIDADE;DISPONIVEL;FATOR\n" +
    "01;01;000;00000988;BRAHMA 600;cx;10/00;1\n";

  fs.writeFileSync(path.join(csvDir, dmy(yesterday) + " - LIBERAÇÃO CHEIO.inf"), body, "utf8");
  fs.writeFileSync(path.join(csvDir, dmy(today) + " - LIBERAÇÃO CHEIO.inf"), body, "utf8");

  let latest = yesterday;
  let imports = 0;
  const api = {
    async oorStatus() { return { oor: { enabled: true, root_path: root, latest_date: latest, diagnostic_requested: false } }; },
    async oorScanState() { return {}; },
    async oorImport(payload) {
      imports++;
      latest = payload.reference_date;
      return { result: { rows: payload.rows.length } };
    },
    async oorDiagnostic() { throw new Error("diagnostic not expected"); }
  };

  const first = await oorSync.sync(api, root, function(){});
  assert.strictEqual(first.imported, 1);
  assert.strictEqual(first.completed_today, true);
  assert.strictEqual(first.reference_date, today);
  assert.strictEqual(imports, 1);

  const second = await oorSync.sync(api, root, function(){});
  assert.strictEqual(second.imported, 0);
  assert.strictEqual(second.completed_today, true);
  assert.strictEqual(imports, 1);

  console.log("020502 once-per-day OK");
})().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
