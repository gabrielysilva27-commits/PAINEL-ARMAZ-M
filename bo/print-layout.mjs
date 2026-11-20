// Physical A4 form. These rules deliberately override responsive screen rules.
export const BO_PRINT_CSS=`
.bo-paper,.bo-paper *{box-sizing:border-box}
.bo-paper{width:100%!important;max-width:none!important;margin:0!important;border:1px solid #111;font:9pt/1.2 Arial,sans-serif;break-inside:avoid;color:#111;background:#fff}
.bo-paper-title{font-size:14pt;padding:2.5mm 2mm 1mm}
.bo-paper-subtitle{font-size:11pt;padding-bottom:2mm}
.bo-paper-top{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;border-top:1px solid #111;border-bottom:1px solid #111}
.bo-paper-box{padding:2mm 2.5mm;min-height:0!important}
.bo-paper-box+ .bo-paper-box{border-top:0!important;border-left:1px solid #111!important}
.bo-paper-box>div[style]{margin-bottom:1mm!important}
.bo-paper-line{display:flex;gap:2mm;margin:1mm 0;flex-wrap:wrap;align-items:center}
.bo-paper-check{display:inline-flex;gap:1mm;margin-right:2mm;font-size:8.5pt;line-height:1.2;align-items:center;white-space:nowrap}
.bo-paper-check i{flex:none;width:3mm;height:3mm;border:1px solid #111;box-sizing:border-box}
.bo-paper-check.active i{box-shadow:inset 0 0 0 .65mm #fff;background:#111}
.bo-paper-band{padding:1mm 2mm;font-size:9pt;background:#111;color:#fff}
.bo-paper-local{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
.bo-paper-local>div{padding:2mm 2.5mm;min-height:17mm!important;display:block}
.bo-paper-local>div+div{border-top:0!important;border-left:1px solid #111!important}
.bo-paper-local h4{margin:0 0 1.5mm;font-size:8.5pt}
.bo-paper-local .bo-paper-check{display:flex;margin:0 0 1mm;white-space:normal;font-size:8pt;line-height:1.1}
.bo-paper-table{table-layout:fixed;width:100%;border-collapse:collapse}
.bo-paper-table th,.bo-paper-table td{padding:1mm;font-size:8pt;line-height:1.15;border:1px solid #111;overflow-wrap:anywhere}
.bo-paper-table th:nth-child(1){width:12%}.bo-paper-table th:nth-child(2){width:46%}.bo-paper-table th:nth-child(n+3){width:14%}
.bo-paper-table tr{break-inside:avoid}
.bo-paper-comments{min-height:16mm;padding:2mm 2.5mm;font-size:9pt;border-top:1px solid #111;overflow-wrap:anywhere;white-space:pre-wrap}
.bo-paper-meta-row{display:grid!important;grid-template-columns:28mm minmax(0,1fr)!important;border-top:1px solid #111}
.bo-paper-meta-row strong,.bo-paper-meta-row span{padding:1mm 2mm;font-size:9pt;overflow-wrap:anywhere}
.bo-paper-reasons{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:1.5mm 2mm;padding:2.5mm}
.bo-paper-reasons .bo-paper-check{white-space:normal;font-size:8pt;margin:0;align-items:flex-start;break-inside:avoid}
.bo-paper-footer{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;border-top:1px solid #111;break-inside:avoid}
.bo-paper-footer>div{padding:2mm 2.5mm;min-height:13mm!important}
.bo-paper-footer>div+div{border-top:0!important;border-left:1px solid #111!important}
.bo-paper-footer>div>div[style]{margin-top:2mm!important}
.bo-paper-note{padding:1mm 2mm;font-size:7pt;line-height:1.2;border-top:1px solid #111;break-inside:avoid}
.bo-paper-flow{padding:1mm 2mm;font-size:7pt;border-top:1px solid #111}
.bo-paper-dense .bo-paper-table th,.bo-paper-dense .bo-paper-table td{font-size:7.5pt;padding:.65mm 1mm;line-height:1.1}
.bo-paper-dense .bo-paper-comments{min-height:9mm}
`;
