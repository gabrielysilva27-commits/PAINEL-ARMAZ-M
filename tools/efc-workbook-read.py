import zipfile,io,xml.etree.ElementTree as E,re,json,datetime
N={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def workbook(blob):
 z=zipfile.ZipFile(io.BytesIO(blob)); ss=[''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml'))];rels={x.get('Id'):x.get('Target').lstrip('/') for x in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))};out={}
 for sh in E.fromstring(z.read('xl/workbook.xml')).find('s:sheets',N):
  target=rels[sh.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')];target=target if target.startswith('xl/') else 'xl/'+target
  if sh.get('name') not in ['DASHBOARD','Reabastecimento','PRODUTIVIDADE','PRODUTIVIDADE - AJUDANTES','PRODUTIVIDADE - CONFERENTES','Priorização e Análises','Marketplace e Chopp']:continue
  cells={}
  for c in E.fromstring(z.read(target)).findall('.//s:sheetData/s:row/s:c',N):
   v=c.find('s:v',N); f=c.find('s:f',N);value=v.text if v is not None else None
   if c.get('t')=='s' and value is not None:value=ss[int(value)]
   elif c.get('t')=='inlineStr':value=''.join(c.find('s:is',N).itertext())
   elif value is not None and c.get('t')!='e':
    try:value=float(value)
    except:pass
   if value is not None or f is not None:cells[c.get('r')]={'v':value,'f':f.text if f is not None else None,'t':c.get('t')}
  out[sh.get('name')]=cells
 return out
