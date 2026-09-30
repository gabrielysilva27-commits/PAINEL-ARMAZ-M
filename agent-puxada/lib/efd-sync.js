const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const ENDPOINT='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efd-api';
async function call(api,action,payload={}){
 const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action,...payload})});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Erro na leitura PCD');return d;
}
function inventory(root){
 const files=[],directories=[],errors=[];
 function visit(dir,depth){if(depth>6||files.length>=5000)return;
  let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch(e){errors.push(path.relative(root,dir)+': '+e.message);return}
  for(const e of entries){if(e.isSymbolicLink())continue;const p=path.join(dir,e.name);
   if(e.isDirectory()){directories.push(path.relative(root,p));visit(p,depth+1)}
   else if(/\.(xlsx?|csv|txt)$/i.test(e.name)&&!e.name.startsWith('~$')){const s=fs.statSync(p);files.push({relative_path:path.relative(root,p),name:e.name,size:s.size,modified_at:s.mtime.toISOString()})}
  }
 }
 if(!fs.existsSync(root))throw Error('PCD_PATH_UNAVAILABLE: o usuário que executa o agente ADM não consegue acessar '+root);
 visit(root,0);return{files,directories,errors};
}
function preview(root,file){
 const p=path.join(root,file.relative_path);
 if(file.size>15*1024*1024)return{file:file.relative_path,note:'Arquivo acima do limite de leitura inicial.'};
 if(/\.(csv|txt)$/i.test(p)){const fd=fs.openSync(p,'r');try{const b=Buffer.alloc(16384),n=fs.readSync(fd,b,0,b.length,0);return{file:file.relative_path,lines:b.subarray(0,n).toString('latin1').split(/\r?\n/).slice(0,8)}}finally{fs.closeSync(fd)}}
 if(/\.xlsx$/i.test(p)&&process.platform==='win32'){
  // Read the OpenXML archive without opening Excel or changing the source file.
  const script=`Add-Type -AssemblyName System.IO.Compression.FileSystem
  $z=[IO.Compression.ZipFile]::OpenRead($env:EFD_PREVIEW_PATH)
  function Read-Entry($n){$e=$z.GetEntry($n);if(!$e){return $null};$r=[IO.StreamReader]::new($e.Open());try{return $r.ReadToEnd()}finally{$r.Dispose()}}
  try{
   $strings=@();$text=Read-Entry 'xl/sharedStrings.xml';if($text){[xml]$x=$text;$strings=@($x.sst.si|ForEach-Object {($_.SelectNodes('.//*[local-name()="t"]')|ForEach-Object {$_.InnerText}) -join ''})}
   $entries=@($z.Entries|Where-Object {$_.FullName -match '^xl/worksheets/sheet[0-9]+.xml$'}|Select-Object -First 2)
   $out=@();foreach($e in $entries){[xml]$x=Read-Entry $e.FullName;$rows=@();foreach($row in ($x.worksheet.sheetData.row|Select-Object -First 8)){$cells=@();foreach($c in $row.c){$v=[string]$c.v;if($c.t -eq 's' -and $v -match '^\\d+$'){$v=$strings[[int]$v]}elseif($c.t -eq 'inlineStr'){$v=$c.is.InnerText};if($v){$cells+=([string]$c.r+':'+$v.Substring(0,[Math]::Min(180,$v.Length)))}};$rows+=($cells -join ' | ')};$out+=@{sheet=$e.FullName;rows=$rows}}
   ConvertTo-Json -InputObject @($out) -Depth 5 -Compress
  }finally{$z.Dispose()}`;
  try{return{file:file.relative_path,sheets:JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,EFD_PREVIEW_PATH:p},timeout:30000,maxBuffer:200000,encoding:'utf8',windowsHide:true}))}}
  catch(e){return{file:file.relative_path,error:String(e.message).slice(0,500)}}
 }
 return{file:file.relative_path,note:'Formato identificado; leitura de conteúdo pendente.'};
}
async function sync(api,log){
 let config;try{const r=await call(api,'agent_status');config=r.config}catch(e){if(/reservada/.test(e.message))return;throw e}
 if(!config.diagnostic_requested)return;
 if(log)log('EFD: lendo PCD pelo Computador ADM em '+config.root_path);
 try{
  const result=inventory(config.root_path),january=result.files.filter(f=>/janeiro|(^|[\\/])0?1([ ._\\/-]|$)/i.test(f.relative_path));
  const samples=(january.length?january:result.files).filter(f=>!/\.xls$/i.test(f.name)).slice(0,3).map(f=>preview(config.root_path,f));
  const diagnostic={files_count:result.files.length,directories:result.directories.slice(0,120),files:result.files.slice(0,150),samples,errors:result.errors.slice(0,10),truncated:result.files.length>=5000};
  await call(api,'agent_diagnostic',{diagnostic,error:result.errors.length?result.errors.slice(0,3).join(' | '):null});
  if(log)log('EFD: diagnóstico PCD enviado, '+result.files.length+' arquivo(s).');
 }catch(e){await call(api,'agent_diagnostic',{diagnostic:{files_count:0},error:e.message});if(log)log('EFD: '+e.message,true)}
}
module.exports={sync,inventory,preview};
