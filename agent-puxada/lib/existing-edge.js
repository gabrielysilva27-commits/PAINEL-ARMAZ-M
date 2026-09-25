let bridge;
try { bridge = require("./existing_edge.node"); } catch (_) { bridge = null; }

function probe() {
  if (!bridge) return { available: false, ieModeSurfaces: 0, accessibleSurfaces: 0, promaxSurfaces: 0, reportWindows: 0, uiaElements: 0, csvControls: 0, visualizeControls: 0 };
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
    return { available: false, ieModeSurfaces: 0, accessibleSurfaces: 0, promaxSurfaces: 0, reportWindows: 0, uiaElements: 0, csvControls: 0, visualizeControls: 0 };
  }
}

module.exports = { probe };
