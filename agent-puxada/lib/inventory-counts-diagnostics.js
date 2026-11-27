function inventoryCountErrorCode(message) {
  const raw = String(message || "unknown");
  if (/CONTAGEM de Estoque.*não está acessível|Pasta-base de contagens não acessível/i.test(raw)) return "PASTA_BASE_NAO_ACESSIVEL";
  if (/021101_EDGE_NATIVE_UNAVAILABLE|EDGE_NATIVE_ACTION_UNAVAILABLE/i.test(raw)) return "EDGE_NATIVO_INDISPONIVEL";
  if (/window-not-found|JANELA_021101_NAO_ENCONTRADA/i.test(raw)) return "JANELA_021101_NAO_ENCONTRADA";
  if (/count-selection-mismatch|count-selection-total|count-checkbox-state-unavailable|count-checkbox-readback-unavailable/i.test(raw)) return "CONTAGEM_6_NAO_MARCADA";
  const gridDiag=raw.match(/count-column-(?:header-or-rows|ambiguous):h=(\d+):n=(\d+):u=(\d+):c=(\d+):a=(\d+):m=(\d+)/i);
  if(gridDiag) return "GRADE_H"+gridDiag[1]+"N"+gridDiag[2]+"U"+gridDiag[3]+"C"+gridDiag[4]+"A"+gridDiag[5]+"M"+gridDiag[6];
  if (/count-row-ambiguous/i.test(raw)) return "CONTAGEM_6_AMBIGUA";
  if (/count-column-ambiguous|count-column-header-or-rows/i.test(raw)) return "GRADE_CONTAGEM_NAO_RECONHECIDA";
  if (/visualizar-click-failed/i.test(raw)) return "CLIQUE_VISUALIZAR_FALHOU";
  if (/visualizar-results-timeout/i.test(raw)) return "RESULTADO_NAO_CARREGOU_APOS_VISUALIZAR";
  const overlap = raw.match(/filter-fields-overlap:(\d+):(\d+)/i);
  if (overlap) return "FILTER_OVERLAP_" + overlap[1] + "_" + overlap[2];
  if (/filter-fields-overlap/i.test(raw)) return "FILTER_FIELDS_OVERLAP";
  const readback = raw.match(/filter-readback-(warehouse|deposit-from|deposit-to|area-from|area-to)/i);
  if (readback) return "FILTER_READBACK_" + readback[1].replace(/-/g, "_").toUpperCase();
  const filterCounts = raw.match(/filter-fields:warehouse=(\d+):deposit=(\d+):area=(\d+):edits=(\d+):combos=(\d+):wlabels=(\d+):dlabels=(\d+):alabels=(\d+):returned=(\d+):sector=(\d+):local=(\d+):zone=(\d+):street=(\d+):aisle=(\d+):rack=(\d+):address=(\d+)(?::streetfields=(\d+):geometryarea=(\d+):endereco=(\d+):posicao=(\d+))?/i);
  if (filterCounts) {
    const [,w,d,a,e,c,wl,dl,al,rb,se,lo,zo,st,ai,ra,en,ruaFields,geometryArea,endereco,posicao] = filterCounts;
    // Compact code keeps every counter below the telemetry value limit.
    return "F_W" + w + "D" + d + "A" + a + "E" + e + "C" + c +
      "WL" + wl + "DL" + dl + "AL" + al + "B" + rb +
      "S" + se + "L" + lo + "Z" + zo + "R" + st + "I" + ai + "P" + ra + "N" + en +
      (ruaFields !== undefined ? "U" + ruaFields : "") +
      (geometryArea !== undefined ? "G" + geometryArea : "") +
      (endereco !== undefined ? "X" + endereco : "") +
      (posicao !== undefined ? "Y" + posicao : "");
  }
  const filterDetail = raw.match(/021101-filter-controls-not-found:(filter-fields:[A-Za-z0-9_=:-]+)/i);
  if (filterDetail) {
    const detail = filterDetail[1].replace(/^filter-fields:/i, "")
      .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
    return ("FILTROS_" + detail).slice(0, 75);
  }
  if (/filter-fields|filter-controls-not-found/i.test(raw)) return "FILTROS_NAO_IDENTIFICADOS";
  if (/count-row-not-found/i.test(raw)) return "CONTAGEM_6_NAO_LOCALIZADA";
  if (/visualizar-button|visualizar-not-found/i.test(raw)) return "BOTAO_VISUALIZAR_NAO_LOCALIZADO";
  if (/csv-not-found/i.test(raw)) return "BOTAO_CSV_NAO_LOCALIZADO";
  if (/pdf-not-found/i.test(raw)) return "BOTAO_PDF_NAO_LOCALIZADO";
  if (/CSV_DOWNLOAD_TIMEOUT/i.test(raw)) return "DOWNLOAD_CSV_TIMEOUT";
  const downloadTimeout=raw.match(/021101_(CSV|PDF)_DOWNLOAD_TIMEOUT:\s*([^;]+);\s*hotkey=([^;]+);\s*recent=(\d+);\s*partial=(\d+)/i);
  if(downloadTimeout){
    const format=downloadTimeout[1].toUpperCase();
    const status=downloadTimeout[2].normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,16)||"UNKNOWN";
    const hotkey=downloadTimeout[3].toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,14)||"NONE";
    return "DOWNLOAD_"+format+"_TIMEOUT_"+status+"_"+hotkey+"_N"+downloadTimeout[4]+"_P"+downloadTimeout[5];
  }
  if (/CSV_DOWNLOAD_TIMEOUT/i.test(raw)) return "DOWNLOAD_CSV_TIMEOUT";
  if (/PDF_DOWNLOAD_TIMEOUT/i.test(raw)) return "DOWNLOAD_PDF_TIMEOUT";
  if (/PDF.*(válido|valido)|PDF vazio/i.test(raw)) return "PDF_INVALIDO";
  if (/ENOENT|EACCES|EPERM|access denied|acesso negado/i.test(raw)) return "ACESSO_ARQUIVO_NEGADO";
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 55) || "UNKNOWN";
}

module.exports={inventoryCountErrorCode};
