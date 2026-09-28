const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");

let bridge;
try { bridge = require("./existing_edge.node"); } catch (_) { bridge = null; }

function probe() {
  if (!bridge) return { available: false, ieModeSurfaces: 0, accessibleSurfaces: 0, promaxSurfaces: 0, reportWindows: 0, homeWindows: 0, uiaElements: 0, csvControls: 0, visualizeControls: 0 };
  try {
    const result = bridge.probe();
    return {
      available: true,
      ieModeSurfaces: Math.max(0, Number(result.ieModeSurfaces) || 0),
      accessibleSurfaces: Math.max(0, Number(result.accessibleSurfaces) || 0),
      promaxSurfaces: Math.max(0, Number(result.promaxSurfaces) || 0),
      reportWindows: Math.max(0, Number(result.reportWindows) || 0),
      homeWindows: Math.max(0, Number(result.homeWindows) || 0),
      shortcutControls: Math.max(0, Number(result.shortcutControls) || 0),
      uiaElements: Math.max(0, Number(result.uiaElements) || 0),
      csvControls: Math.max(0, Number(result.csvControls) || 0),
      visualizeControls: Math.max(0, Number(result.visualizeControls) || 0),
      layout: Array.isArray(result.layout) ? result.layout.filter(x => /^(?:H)?\d+:[ECKB]:-?\d+:-?\d+:\d+:\d+$/.test(x)).slice(0, 90) : []
    };
  } catch (_) {
    return { available: false, ieModeSurfaces: 0, accessibleSurfaces: 0, promaxSurfaces: 0, reportWindows: 0, homeWindows: 0, uiaElements: 0, csvControls: 0, visualizeControls: 0 };
  }
}

function act(stage, values = {}) {
  if (stage === "save") throw new Error("EDGE_SAVE_REQUIRES_DIALOG");
  if (!bridge || typeof bridge.act !== "function") throw new Error("EDGE_NATIVE_ACTION_UNAVAILABLE");
  const result = bridge.act({ stage }, values);
  if (result !== "ok") throw new Error("EDGE_NATIVE_" + String(result || "unknown"));
}

// The old native save action clicked any button named Salvar in the active
// Promax page. Only a dedicated Windows download/save dialog is eligible.
function saveDialog(target) {
  if (process.platform !== "win32") throw new Error("EDGE_SAVE_WINDOWS_ONLY");
  const script = path.join(os.tmpdir(), "agente-puxada-save-dialog-v3.ps1");
  fs.writeFileSync(script, String.raw`
param([string]$Target)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$trueCondition=[System.Windows.Automation.Condition]::TrueCondition
function Controls($w){$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,$trueCondition)}
function Name($e){try{return [string]$e.Current.Name}catch{return ''}}
function Invoke($e){
  try{$p=$e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern);$p.Invoke();return $true}catch{return $false}
}
$deadline=[DateTime]::UtcNow.AddSeconds(15)
$sawDownload=$false
while([DateTime]::UtcNow -lt $deadline){
  if(Test-Path -LiteralPath $Target){Write-Output 'saved';exit 0}
  $windows=$root.FindAll([System.Windows.Automation.TreeScope]::Children,$trueCondition)
  foreach($w in $windows){
    $title=Name $w
    if($title -notmatch '^(Salvar como|Save As)(\s|$)'){continue}
    $edit=$null;$button=$null
    foreach($e in (Controls $w)){
      $type=$e.Current.ControlType
      $name=Name $e
      if($type -eq [System.Windows.Automation.ControlType]::Edit -and
         ($e.Current.AutomationId -eq '1001' -or $name -match '^(Nome do arquivo|File name)')){$edit=$e}
      if($type -eq [System.Windows.Automation.ControlType]::Button -and
         $name -match '^&?(Salvar|Save)$'){$button=$e}
    }
    if(!$edit -or !$button){Write-Output 'save-dialog-controls-missing';exit 2}
    try{$p=$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern);$p.SetValue($Target)}
    catch{Write-Output 'save-dialog-filename-unavailable';exit 2}
    if(!(Invoke $button)){Write-Output 'save-dialog-button-unavailable';exit 2}
    Write-Output 'save-as-confirmed';exit 0
  }
  foreach($w in $windows){
    $title=Name $w
    if($title -notmatch '^(Download de Arquivo|File Download)(\s|$)'){continue}
    foreach($e in (Controls $w)){
      if($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
         (Name $e) -match '^&?(Salvar|Save)$'){
        if(!$sawDownload -and (Invoke $e)){$sawDownload=$true;break}
      }
    }
  }
  Start-Sleep -Milliseconds 300
}
Write-Output $(if($sawDownload){'download-prompt-handled-no-save-as'}else{'save-dialog-not-found'})
exit 2
`, "utf8");
  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", script, "-Target", target],
    { encoding: "utf8", timeout: 20000, windowsHide: true });
  const status = String(result.stdout || "").trim().split(/\r?\n/).pop() || String(result.error && result.error.code || "save-helper-failed");
  if (result.status !== 0) throw new Error("EDGE_SAVE_DIALOG: " + status);
  return status;
}

module.exports = { probe, act, saveDialog };
