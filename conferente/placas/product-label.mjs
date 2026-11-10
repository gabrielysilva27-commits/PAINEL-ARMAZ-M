export function productLabel(product){
  const original=String(product.description||'').trim().toUpperCase();
  const volume=original.match(/\b\d+(?:[.,]\d+)?\s*(?:ML|L|LT|LITROS?)\b/);
  const size=volume?volume[0].replace(/\s+/g,'').replace(/LITROS?$/,'L').replace(/LT$/,'L'):'';
  const multipack=/\b(?:MULTI[ -]?PACK|MULTPACK|MUL|MP)\b/.test(original);
  const zero=/\bZERO\b|\bSEM A[ÇC][ÚU]CAR\b/.test(original);
  let packaging=/\b(?:LATA|LT)\b/.test(original)?'LATA':/\bPET\b/.test(original)?'PET':/\b(?:LN|LONG NECK)\b/.test(original)?'LONG NECK':/\b(?:GRF|GARRAFA)\b/.test(original)?'GARRAFA':String(product.packaging||'').toUpperCase();
  let name=original;
  if(volume)name=name.replace(volume[0],' ');
  // Strip only known packaging/logistics markers. Unknown distinctions stay visible.
  name=name.replace(/\b(?:MULTI[ -]?PACK|MULTPACK|MUL|MP)\s*\d*\b/g,' ')
    .replace(/\b(?:LATA|LT|PET|LN|LONG NECK|GRF|GARRAFA|NPAL|SH)\b/g,' ')
    .replace(/\bC\s*\/\s*(\d+)\b/g,' ').replace(/GUARANA CHP\b/g,'GUARANÁ').replace(/\s+/g,' ').trim();
  const count=original.match(/\bC\s*\/\s*(\d+)\b/);
  if(zero&&!/\bZERO\b/.test(name))name+=' ZERO';
  return {code:String(product.code),name:name||original,details:[packaging,multipack?'MP':'',count?'C/'+count[1]:''].filter(Boolean).join(' · '),size,original};
}
