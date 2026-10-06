const key=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
// Explicit aliases verified against the EFC archive; never merge by similarity.
const pairs=[
 ['ANDERSON DE ARAUJO ALGADO','ANDERSON DE ARAUJO SALGADO'],
 ['WESDILLEY BORGES GERALDO','WEDISLLEY BORGES GERALDO'],
 ['YURI TAVARES DE O. DOROW','YURI TAVARES DE OLIVEIRA DOROW'],
 ['ANDREI SILVA','ANDREI SILVA DA CONCEIÇÃO'],
 ['FABIO LUCAS','FÁBIO LUCAS DOS SANTOS QUINTANILHA'],
 ['F.LUCAS','FÁBIO LUCAS DOS SANTOS QUINTANILHA'],
 ['BRYAN CESAR S. DA CONCEIÇÃO','BRYAN CESAR SANTOS DA CONCEIÇÃO'],
 ['RICHARDES GABRIEL DIAS','RICHARD GABRIEL DIAS']
];
const aliases=new Map(pairs.flatMap(([a,b])=>[[key(a),b],[key(b),b]]));
export function personName(v){if(!v)return v;return aliases.get(key(v))||String(v).trim().replace(/\s+/g,' ').toUpperCase();}
export function normalizePeople(data){return Object.fromEntries(Object.entries(data).map(([kind,rows])=>[kind,rows.map(row=>{const result={...row};for(const field of ['name','helper','checker'])if(row[field]){const canonical=personName(row[field]);if(canonical!==row[field])result['source_'+field]=row[field];result[field]=canonical;}return result;})]));}

