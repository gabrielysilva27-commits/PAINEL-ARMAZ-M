const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

function psQuote(value) {
  return String(value).replace(/'/g, "''");
}

function loadAgentToken(rootDir) {
  if (process.env.AGENTE_PUXADA_TOKEN) {
    return process.env.AGENTE_PUXADA_TOKEN.trim();
  }

  const secretPath = path.join(rootDir, "agent-token.dat");
  if (!fs.existsSync(secretPath)) {
    throw new Error("Token do Agente Puxada nao configurado. Execute install.ps1 e informe o token gerado no ADM.");
  }

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

module.exports = { loadAgentToken: loadAgentToken };
