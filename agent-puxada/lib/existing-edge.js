let bridge;
try { bridge = require("./existing_edge.node"); } catch (_) { bridge = null; }

function probe() {
  if (!bridge) return { available: false, ieModeSurfaces: 0, accessibleSurfaces: 0, promaxSurfaces: 0 };
  try {
    const result = bridge.probe();
    return {
      available: true,
      ieModeSurfaces: Math.max(0, Number(result.ieModeSurfaces) || 0),
      accessibleSurfaces: Math.max(0, Number(result.accessibleSurfaces) || 0),
      promaxSurfaces: Math.max(0, Number(result.promaxSurfaces) || 0)
    };
  } catch (_) {
    return { available: false, ieModeSurfaces: 0, accessibleSurfaces: 0, promaxSurfaces: 0 };
  }
}

module.exports = { probe };
