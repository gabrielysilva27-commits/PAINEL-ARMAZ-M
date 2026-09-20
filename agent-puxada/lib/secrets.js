const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

function loadAgentToken(rootDir) {
  if (process.env.AGENTE_PUXADA_TOKEN) {
    return process.env.AGENTE_PUXADA_TOKEN.trim();
  }

  const portableLauncher =
    process.env.AGENTE_PUXADA_LAUNCHER ||
    path.resolve(rootDir, "..", "AgentePuxada.exe");

  if (fs.existsSync(portableLauncher)) {
    const token = childProcess.execFileSync(
      portableLauncher,
      ["--get-token"],
      { encoding: "utf8", windowsHide: true }
    ).trim();
    if (token) return token;
  }

  // Fallback only for development / legacy installation.
  const secretPath = path.join(rootDir, "agent-token.dat");
  if (!fs.existsSync(secretPath)) {
    throw new Error("Token do Agente Puxada nao configurado. Abra AgentePuxada.exe e configure este computador.");
  }

  const psQuote = value => String(value).replace(/'/g, "''");
  const command =
    "$p='" + psQuote(secretPath) + "';" +
    "$e=Get-Content -Raw -LiteralPath $p;" +
    "$s=ConvertTo-SecureString $e;" +
    "$b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);" +
    "try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}";

  return childProcess.execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", windowsHide: true }
  ).trim();
}

module.exports = { loadAgentToken };
