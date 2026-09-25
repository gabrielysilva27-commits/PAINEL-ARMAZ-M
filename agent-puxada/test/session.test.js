const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const existingEdge = require("../lib/existing-edge");
const promax = require("../lib/promax");

async function run() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "puxada-normal-edge-"));
  const app = path.join(base, "app");
  fs.mkdirSync(app, { recursive: true });
  fs.mkdirSync(path.join(base, "data"), { recursive: true });

  // Simula vestígios da antiga sessão controlada. A nova lógica deve
  // descartá-los e decidir prontidão somente pela janela normal do Edge.
  fs.writeFileSync(path.join(base, "data", "promax-session.json"),
    JSON.stringify({ session_id: "old-managed-session", driver_pid: 999999999 }));
  fs.writeFileSync(path.join(base, "data", "promax-native-session.json"),
    JSON.stringify({ enabled: true }));

  const originalProbe = existingEdge.probe;
  try {
    existingEdge.probe = () => ({
      available: true,
      ieModeSurfaces: 1,
      accessibleSurfaces: 0,
      promaxSurfaces: 1,
      reportWindows: 0,
      homeWindows: 1,
      shortcutControls: 0,
      uiaElements: 120,
      csvControls: 0,
      visualizeControls: 0,
      layout: []
    });

    assert.equal(
      await promax.isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app),
      true,
      "Promax aberto no Edge normal deve ser considerado pronto sem IEDriver"
    );
    assert.equal(
      fs.existsSync(path.join(base, "data", "promax-native-session.json")),
      false,
      "marcador da antiga sessão controlada deve ser removido"
    );

    existingEdge.probe = () => ({
      available: true,
      ieModeSurfaces: 0,
      accessibleSurfaces: 0,
      promaxSurfaces: 0,
      reportWindows: 0,
      homeWindows: 0,
      shortcutControls: 0,
      uiaElements: 0,
      csvControls: 0,
      visualizeControls: 0,
      layout: []
    });

    assert.equal(
      await promax.isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app),
      false,
      "sem PromaxWEB na janela normal do Edge o agente não deve recorrer ao IEDriver"
    );
    assert.match(promax.readinessError(), /janela normal do Microsoft Edge/i);

    console.log("Edge normal exclusivo e descarte da sessão controlada: OK");
  } finally {
    existingEdge.probe = originalProbe;
    fs.rmSync(base, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
