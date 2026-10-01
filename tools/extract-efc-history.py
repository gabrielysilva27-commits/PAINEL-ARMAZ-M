"""Extract saved Excel results without recalculating closed historical months.
Outputs contain private employee data and must stay outside the public repository.
"""
import importlib.util,zipfile,json,pathlib,re,datetime,sys
spec=importlib.util.spec_from_file_location('reader',pathlib.Path(__file__).with_name('efc-workbook-read.py'));reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
BASE=datetime.datetime(1899,12,30)
def date(v):return (BASE+datetime.timedelta(days=v)).date().isoformat() if isinstance(v,(int,float)) and 45000<v<50000 else None
def col(i):
 s=''
 while i:i,r=divmod(i-1,26);s=chr(65+r)+s
 return s
def build(sheets,month,source):
 d=sheets['DASHBOARD'];r=sheets['Reabastecimento'];v=lambda cells,ref:cells.get(ref,{}).get('v')
 number=lambda cells,ref:v(cells,ref) if isinstance(v(cells,ref),(int,float)) else None
 total_row=next(int(re.search(r'\d+',ref)[0]) for ref,c in d.items() if re.fullmatch(r'I\d+',ref) and c['v']=='ACUMULADO');stat=lambda label:next(('J'+re.search(r'\d+',ref)[0] for ref,c in d.items() if c['v']==label),None)
 refs={'efc':'H9','planned':'R9','approved':'R11','wms':'S9','priority':'U9','pallets':stat('PALETES POR PERÍODO'),'ranked_pallets':'J'+str(total_row),'boxes':'K'+str(total_row),'efm':'Q'+str(total_row),'helpers':stat('TT AJUDANTES'),'pallets_per_helper':stat('PALETES POR AJUDANTE'),'boxes_per_pallet':stat('ITEM POR PALETE'),'payment':'Z'+str(total_row)}
 summary={key:number(d,ref) for key,ref in refs.items()};total_col=next(re.match(r'[A-Z]+',ref)[0] for ref,c in r.items() if ref.endswith('2') and re.fullmatch(r'SUM\(D2:[A-Z]+2\)',c.get('f') or ''));summary.update(estimated_pallets=number(r,total_col+'2'),picking_positions=number(r,total_col+'3'),resupply_rate=number(r,total_col+'4'))
 daily=[]
 for rn in range(2,34):
  dt=date(v(d,'CE'+str(rn)))
  if dt and dt.startswith(month):daily.append(dict(date=dt,label=dt[-2:],planned=number(d,'CF'+str(rn)),approved=number(d,'CG'+str(rn)),efc=number(d,'CH'+str(rn))))
 supply_days=[]
 for i in range(4,35):
  c=col(i);dt=date(v(r,c+'6'))
  if dt and dt.startswith(month):supply_days.append(dict(date=dt,label=dt[-2:],estimated=number(r,c+'2'),positions=number(r,c+'3'),rate=number(r,c+'4'),source=c+'2:'+c+'4'))
 supply_rows=[]
 for rn in range(7,257):
  sku=v(r,'B'+str(rn))
  if isinstance(sku,(int,float)):
   supply_rows.append(dict(sku=str(int(sku)),positions=number(r,'C'+str(rn)),total=next((cell['v'] for ref,cell in r.items() if ref.endswith(str(rn)) and re.fullmatch(r'SUM\(D'+str(rn)+r':[A-Z]+'+str(rn)+r'\)',cell.get('f') or '')),None),daily=[number(r,col(i)+str(rn)) for i in range(4,35)],source_row=rn))
 top_col=next((re.match(r'[A-Z]+',ref)[0] for ref,c in r.items() if ref.endswith('2') and (c.get('f') or '').startswith('LARGE(')),'CA');ci=0
 for ch in top_col:ci=ci*26+ord(ch)-64
 top=[dict(sku=str(int(v(r,col(ci+1)+str(rn)))) if isinstance(v(r,col(ci+1)+str(rn)),(int,float)) else str(v(r,col(ci+1)+str(rn)) or ''),label=v(r,col(ci+2)+str(rn)),value=number(r,top_col+str(rn))) for rn in range(2,12)]
 ranking=[]
 for rn in range(94,total_row):
  name=v(d,'I'+str(rn))
  if not isinstance(name,str):continue
  keys={'pallets':'J','boxes':'K','average_time':'L','pallets_per_hour':'M','errors':'N','error_rate':'O','damage_value':'P','efm':'Q','pallets_per_day':'R','absences':'S','compensation':'T','base_payment':'U','error_bonus':'V','damage_bonus':'W','efficiency_bonus':'X','absence_bonus':'Y','payment':'Z'}
  ranking.append(dict(name=name.strip(),source_row=rn,**{key:number(d,c+str(rn)) for key,c in keys.items()}))
 profiles=[]
 for label,lc,vc,start,end in [('Dia','I','J',38,43),('Semana','N','O',37,42),('Mês','U','V',36,41)]:profiles.append(dict(label=label,bands=[dict(label=str(v(d,lc+str(rn)) or ''),value=number(d,vc+str(rn))) for rn in range(start,end+1)]))
 helpers=[]
 sn=next(x for x in sheets if x in ['PRODUTIVIDADE','PRODUTIVIDADE - AJUDANTES']);h=sheets[sn]
 for ref,cell in h.items():
  if re.fullmatch(r'D\d+',ref):
   rn=int(ref[1:]);dt=date(cell['v'])
   if rn>=4 and dt and v(h,'F'+str(rn)):
    helpers.append(dict(id=f'{month}:helpers:{rn}',date=dt,week=number(h,'C'+str(rn)),duration=number(h,'L'+str(rn)),average=number(h,'M'+str(rn)),standard=number(h,'P'+str(rn)),efm=number(h,'Q'+str(rn)),boxes=number(h,'I'+str(rn)),items_per_pallet=number(h,'O'+str(rn))))
 histogram=[dict(label=str(v(d,col(i)+'75') or ''),value=number(d,col(i)+'76')) for i in range(9,23)]
 hour_cars=[dict(label=str(v(sheets['Priorização e Análises'],'O'+str(rn)) or ''),value=number(sheets['Priorização e Análises'],'P'+str(rn))) for rn in range(2,13)]
 replenishment_days=[];replenishment_summary=None
 reb_total=next((re.match(r'[A-Z]+',ref)[0] for ref,cell in r.items() if ref.endswith('1') and str(cell['v']).strip().upper()=='ACUM'),None)
 if reb_total:
  replenishment_summary=dict(boxes=number(r,reb_total+'2'),capacity=number(r,reb_total+'3'),rate=number(r,reb_total+'4'),source=reb_total+'2:'+reb_total+'4')
  for ref,cell in r.items():
   if re.fullmatch(r'[A-Z]+9',ref) and date(cell['v']):
    dt=date(cell['v']);cc=re.match(r'[A-Z]+',ref)[0]
    if dt.startswith(month) and number(r,cc+'2') is not None:replenishment_days.append(dict(date=dt,label=dt[-2:],boxes=number(r,cc+'2'),capacity=number(r,cc+'3'),rate=number(r,cc+'4'),source=cc+'2:'+cc+'4'))
 controls={ref:d[ref] for ref in [*refs.values(),'J5','K91','J34','P34','J73','K55'] if ref in d};controls.update({'Reabastecimento!'+ref:r[ref] for ref in [total_col+'2',total_col+'3',total_col+'4'] if ref in r})
 return dict(version=2,month=month,source=source,mode='saved_excel_results',summary=summary,daily=daily,supply_days=supply_days,supply_rows=supply_rows,supply_top=top,replenishment_summary=replenishment_summary,replenishment_days=replenishment_days,ranking=ranking,profiles=profiles,histogram=histogram,hour_cars=hour_cars,helpers=helpers,controls=controls)
if __name__=='__main__':
 z=zipfile.ZipFile(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(exist_ok=True)
 for name in z.namelist():
  if not name.endswith('.xlsx'):continue
  month='2026-'+re.search(r'/(\d{2})',name)[1]
  if month>'2026-09':continue
  snapshot=build(reader.workbook(z.read(name)),month,pathlib.PurePosixPath(name).name)
  (out/(month+'.json')).write_text(json.dumps(snapshot,ensure_ascii=False,separators=(',',':')))
  print(month,json.dumps(snapshot['summary'],ensure_ascii=False),flush=True)
