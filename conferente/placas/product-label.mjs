export function productLabel(product){
  const original=String(product.description||'').trim().toUpperCase();
  const volume=original.match(/\b\d+(?:[.,]\d+)?\s*(?:ML|L|LT|LITROS?)\b/);
  // Promax's PET 1,5 packaging label expresses litres without the unit suffix.
  const petLitres=String(product.packaging||'').toUpperCase().match(/\bPET\s+(1(?:[,.]5)?|2(?:[,.]5)?|3)\s*$/);
  const size=volume?volume[0].replace(/\s+/g,'').replace(/LITROS?$/,'L').replace(/LT$/,'L'):petLitres?petLitres[1]+'L':'';
  const multipack=/\b(?:MULTI[ -]?PACK|MULTPACK|MUL|MP)\b/.test(original);
  const zero=/\bZERO\b|\bSEM A[ÇC][ÚU]CAR\b/.test(original);
  let packaging=/\b(?:LATA|LT)\b/.test(original)?'LATA':/\bPET\b/.test(original)?'PET':/\b(?:LN|LONG NECK)\b/.test(original)?'LONG NECK':/\b(?:GRF|GARRAFA|GFA)\b/.test(original)?'GARRAFA':String(product.packaging||'').toUpperCase();
  packaging=packaging.replace(/\b\d+(?:[.,]\d+)?\s*(?:ML|L|LT)\b/g,'').replace(/\s+/g,' ').trim();
  let name=original;
  if(volume)name=name.replace(volume[0],' ');
  else if(petLitres)name=name.replace(/\bPET\s+\d+(?:[,.]\d+)?\b/,' ');
  // Strip only known packaging/logistics markers. Unknown distinctions stay visible.
  name=name.replace(/\b(?:MULTI[ -]?PACK|MULTPACK|MUL|MP)\s*\d*\b/g,' ')
    .replace(/\b(?:LATA|LT|PET|LN|LONG NECK|GRF|GARRAFA|GFA|VD|NPAL|SHRINK|SH|HF)\b/g,' ')
    .replace(/\b(?:C\s*\/\s*|CX\s*|FD\s+C)(\d+)\b/g,' ').replace(/\bCX\b/g,' ').replace(/GUARANA CHP\b/g,'GUARANÁ').replace(/\s+/g,' ').trim();
  const count=original.match(/\b(?:C\s*\/\s*|CX\s*|FD\s+C)(\d+)\b/);
  if(zero&&!/\bZERO\b/.test(name))name+=' ZERO';
  return {code:String(product.code),name:name||original,details:[packaging,multipack?'MP':'',count?'C/'+count[1]:''].filter(Boolean).join(' · '),size,original};
}
