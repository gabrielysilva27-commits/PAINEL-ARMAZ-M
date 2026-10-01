"""Extract source inputs from EFC XLSX archives; never evaluate cached Excel KPIs.
Produces private import batches, outside the public repository.
"""
import zipfile,io,re,json,datetime,html,sys,pathlib,hashlib
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
import xml.etree.ElementTree as ET
BASE=datetime.datetime(1899,12,30)
def num(v):
 try:return float(v)
 except:return None
def day(v):
 n=num(v)
 if n is not None and 45000<n<50000:return (BASE+datetime.timedelta(days=int(n))).date().isoformat()
 return None
def clock(v):
 n=num(v)
 if n is not None and 0<=n<1:
  secs=round(n*86400)%86400;return '%02d:%02d:%02d'%(secs//3600,secs//60%60,secs%60)
 s=str(v or '').strip();return s if re.fullmatch(r'\d{2}:\d{2}(:\d{2})?',s) else None
def clean(v):return re.sub(r'\s+',' ',str(v or '')).strip()
def code(v):
 n=num(v);return str(int(n)) if n is not None and n.is_integer() else clean(v)
def extract(path,out):
 z=zipfile.ZipFile(path);out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);summary=[]
 for name in sorted(n for n in z.namelist() if n.endswith('.xlsx')):
  month='2026-'+re.search(r'/(\d{2})',name)[1];w=zipfile.ZipFile(io.BytesIO(z.read(name)))
  ss=[''.join(e.itertext()) for e in ET.fromstring(w.read('xl/sharedStrings.xml'))]
  rels={e.get('Id'):e.get('Target').lstrip('/') for e in ET.fromstring(w.read('xl/_rels/workbook.xml.rels'))}
  sheets=ET.fromstring(w.read('xl/workbook.xml')).find('s:sheets',NS)
  data={k:[] for k in ['helpers','checkers','events','pcd','priority','errors','damages','special','capacity','items','demand','legacy_pay']};maps={};demand={};source=pathlib.PurePosixPath(name).name
  for sh in sheets:
   sn=sh.get('name');kind={'PRODUTIVIDADE':'helpers','PRODUTIVIDADE - AJUDANTES':'helpers','PRODUTIVIDADE - CONFERENTES':'checkers','03.11.20':'events','PCD':'pcd','Priorização e Análises':'priority','ERRO DE CARREGAMENTO':'errors','Avarias':'damages','Marketplace e Chopp':'special','Reabastecimento':'capacity','03.02.36.01':'items','DASHBOARD':'legacy_pay'}.get(sn)
   if not kind:continue
   target=rels[sh.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')];target=target if target.startswith('xl/') else 'xl/'+target
   xml=w.read(target).decode();headers={}
   for erow in ET.fromstring(xml).find('s:sheetData',NS):
    rn=int(erow.get('r'));c={}
    for cell in erow:
     ref=re.match(r'([A-Z]+)',cell.get('r',''));v=cell.find('s:v',NS)
     if not ref or v is None or v.text is None or cell.get('t')=='e':continue
     val=ss[int(v.text)] if cell.get('t')=='s' else v.text
     if val!='':c[ref[1]]=val
    if rn==1:headers=c
    row=None
    if kind=='events' and rn>1 and clean(c.get('I')).upper()=='SIM' and (day(c.get('D')) or '').startswith(month):
     data[kind].append(dict(id=f'{month}:events:{rn}:waiver',date=day(c.get('D')),vehicle=code(c.get('E')),plate=clean(c.get('F')),phase='Dispensa EFC',time=None,map='',reason='rec=SIM no Excel'))
    if kind in ['helpers','checkers'] and rn>=4 and day(c.get('D')) and clean(c.get('F')):
     row=dict(date=day(c.get('D')),map=code(c.get('E')),name=clean(c.get('F')),vehicle=code(c.get('G')),pallets=num(c.get('H')),cached_boxes=num(c.get('I')),start=clock(c.get('J')) if kind=='helpers' else None,end=clock(c.get('K')) if kind=='helpers' else None,cached_efm=num(c.get('Q')) if kind=='helpers' else None)
    elif kind=='events' and rn>1 and code(c.get('P')) and clean(c.get('Q')) and day(c.get('X')):
     row=dict(date=day(c.get('X')),map=code(c.get('P')),phase=clean(c.get('Q')),vehicle=code(c.get('R')),plate=clean(c.get('S')),time=clock(c.get('Y')),user=clean(c.get('Z')),system=clean(c.get('AN')),map_type=clean(c.get('U')),fleet=clean(c.get('AP') or c.get('T')),boxes=num(c.get('AR')),emission=day(c.get('W')))
    elif kind=='pcd' and rn>1 and day(c.get('D')) and clean(c.get('J')):
     row=dict(date=day(c.get('D')),plate=clean(c.get('J')),route=clean(c.get('H')),session=clean(c.get('E')),eligible=num(c.get('B'))==1)
    elif kind=='priority' and rn>1 and day(c.get('B')) and clean(c.get('C')):
     row=dict(date=day(c.get('B')),plate=clean(c.get('C')),vehicle=code(c.get('E')),route=clean(c.get('F')),occupation=num(c.get('G')),priority=num(c.get('J')),cached_sequence=num(c.get('K')),cached_status=clean(c.get('L')))
    elif kind=='errors' and rn>1 and day(c.get('K')) and num(c.get('H')) is not None:
     row=dict(date=day(c.get('K')),map=code(c.get('D')),vehicle=code(c.get('E')),sku=code(c.get('F')),inverted_sku=code(c.get('G')),quantity=num(c.get('H')),type=clean(c.get('I')),checker=clean(c.get('J')),helper=clean(c.get('L')))
    elif kind=='damages' and rn>1 and day(c.get('B')):
     row=dict(date=day(c.get('B')),name=clean(c.get('C')),sku=code(c.get('D')),description=clean(c.get('E')),quantity=num(c.get('F')),reason=clean(c.get('G')),status=clean(c.get('H')),location=clean(c.get('I')),checker=clean(c.get('J')),shift=clean(c.get('K')),hl=num(c.get('L')),value=num(c.get('M')),lot=clean(c.get('N')),expiry=day(c.get('O')))
    elif kind=='special' and rn>=6:
     for prefix,label in [('','marketplace'),('chopp','chopp')]:
      dc,sc,ec,nc=('B','C','D','H') if not prefix else ('N','O','P','T')
      if day(c.get(dc)) and (clock(c.get(sc)) or clock(c.get(ec))):
       data[kind].append(dict(id=f'{month}:{kind}:{rn}:{label}',date=day(c.get(dc)),area=label,start=clock(c.get(sc)),end=clock(c.get(ec)),names=clean(c.get(nc))))
    elif kind=='capacity' and rn>1 and num(c.get('BT')) is not None:
     row=dict(sku=code(c.get('BT')),positions=num(c.get('BU')),palletization=num(c.get('BV')),cached_capacity=num(c.get('BW')))
    elif kind=='items' and rn>1:
     # Header names survive inserted volume column in April and June onward.
     inv={re.sub(r'[^a-z0-9]', '', clean(v).lower()):k for k,v in headers.items()}
     def get(label):return c.get(inv.get(re.sub(r'[^a-z0-9]', '', label.lower()),''))
     dt=day(get('Data Emissão Mapa') or get('Data Emisssão Mapa'))
     mp=code(get('Nr.Mapa'));sku=code(get('Cód.Produto'));boxes=num(get('Qt.Caixas Pallet'));closed=num(c.get('D'))
     if dt and mp and sku and boxes is not None:
      key=dt+'|'+mp
      item=maps.setdefault(key,dict(id=month+':items:'+key,date=dt,map=mp,boxes=0,closed_boxes=0,lines=0))
      item['lines']+=1;item['closed_boxes' if closed==1 else 'boxes']+=boxes
      if closed!=1:
       k=dt+'|'+sku;d=demand.setdefault(k,dict(id=month+':demand:'+k,date=dt,sku=sku,description=clean(get('Desc.Produto')),boxes=0));d['boxes']+=boxes
    elif kind=='legacy_pay' and 94<=rn<=106 and clean(c.get('I')):
     row=dict(name=clean(c.get('I')),cached_pallets=num(c.get('J')),cached_boxes=num(c.get('K')),cached_payment=num(c.get('Z')),absences=num(c.get('S')),compensation=num(c.get('T')),cached_tariff=None)
    if row is not None:
     row['id']=f'{month}:{kind}:{rn}';row['sheet_row']=rn;data[kind].append(row)
  data['items']=list(maps.values());data['demand']=list(demand.values());n=0
  for kind,rows in data.items():
   for chunk in range(max(1,(len(rows)+249)//250)):
    record=dict(month=month,kind=kind,chunk=chunk,source=source,payload=rows[chunk*250:(chunk+1)*250])
    p=out/f'{month}-{kind}-{chunk}.json';p.write_text(json.dumps(record,ensure_ascii=False));n+=1
  counts={k:len(v) for k,v in data.items()};summary.append(dict(month=month,counts=counts));print(month,counts,flush=True)
 (out/'manifest.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__':extract(sys.argv[1],sys.argv[2])
