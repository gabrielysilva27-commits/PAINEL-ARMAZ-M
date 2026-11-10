import {productLabel} from './product-label.mjs?v=20261110-fit-2';
import {fittedFont} from './text-fit.mjs';
import {batchLabels,batchDocument,printBatch} from './batch-print.mjs?v=20261110-batch-1';
const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
const $=id=>document.getElementById(id);
let token=sessionStorage.getItem('bo_token')||sessionStorage.getItem('nri_conf_token')||'',sequence=0;
async function call(action,payload={},auth=true){const headers={'Content-Type':'application/json'};if(auth&&token)headers['x-bo-token']=token;const response=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...payload})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível concluir. Tente novamente.');return data;}
function enter(user){$('loginView').hidden=true;$('workView').hidden=false;$('identity').hidden=false;$('userName').textContent=user.display_name;$('message').textContent='';$('codeInput').focus();}
const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
const measure=(text,size)=>{context.font='900 '+size+'px Arial';return context.measureText(text).width;};
function fitSign(){
 if($('preview').hidden)return;
 for(const [id,max,ratio] of [['name',132,1.04],['details',65,1.04],['size',250,1]]){
  const box=$(id),span=box.firstElementChild;
  const padding=id==='details'?14:8;
  const size=fittedFont(span.textContent,box.clientWidth-4,box.clientHeight-padding,max,measure,ratio);
  span.style.fontSize=size+'px';
 }
 const text=$('skuText'),height=$('sku').clientHeight-30,width=$('sku').clientWidth-8;
 let size=Math.floor(width);
 while(size>10&&(measure(text.textContent,size)>height||size>width))size--;
 text.style.fontSize=size+'px';
}
function scalePreview(){
 const box=$('preview'),scale=Math.max(.05,Math.min((box.clientWidth-24)/1062,(box.clientHeight-24)/733));
 $('sign').style.setProperty('--preview-scale',scale);
}
new ResizeObserver(scalePreview).observe($('preview'));
function resetProduct(){sequence++;$('preview').hidden=true;$('originalWrap').hidden=true;$('printButton').disabled=true;$('source').textContent='';}
$('codeInput').addEventListener('input',resetProduct);
$('productForm').onsubmit=async event=>{event.preventDefault();resetProduct();const current=sequence;$('message').textContent='Buscando na OCP…';$('searchButton').disabled=true;try{const {product}=await call('picking_product',{code:$('codeInput').value.trim()});if(current!==sequence)return;if(!product){$('message').textContent='Código não encontrado na base OCP. Nenhuma placa foi gerada.';return;}const label=productLabel(product);$('skuText').textContent=label.code;$('name').firstElementChild.textContent=label.name;$('details').firstElementChild.textContent=label.details;$('size').firstElementChild.textContent=label.size;$('original').textContent=label.original;$('originalWrap').hidden=false;$('preview').hidden=false;$('source').textContent='Base OCP · '+product.reference_date.split('-').reverse().join('/');fitSign();scalePreview();$('printButton').disabled=!label.size;$('message').textContent=label.size?'':'O volume não está identificado na OCP. Verifique o cadastro antes de imprimir.';}catch(error){if(current===sequence)$('message').textContent=error.message;}finally{$('searchButton').disabled=false;}};
$('printButton').onclick=()=>{if(!$('printButton').disabled)window.print();};
$('printPickingButton').onclick=async()=>{
 const button=$('printPickingButton');button.disabled=true;$('message').textContent='Preparando as placas do layout…';
 try{
  const response=await fetch('https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/layout-api',{method:'POST',headers:{'Content-Type':'application/json','x-bo-token':token},body:JSON.stringify({action:'picking_plates'})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar o layout.');
  const labels=batchLabels(data.positions||[]);
  $('message').textContent=labels.length+' placas · layout '+data.month.split('-').reverse().join('/')+' · uma folha A4 paisagem por posição.';
  await printBatch(batchDocument(labels,measure));
 }catch(error){$('message').textContent=error.message;}finally{button.disabled=false;}
};
window.addEventListener('beforeprint',fitSign);window.addEventListener('afterprint',fitSign);
$('loginForm').onsubmit=async event=>{event.preventDefault();$('loginButton').disabled=true;try{const data=await call('pin_login',{conferencer_id:$('conferencerSelect').value,pin:$('pinInput').value},false);token=data.token;sessionStorage.setItem('bo_token',token);$('pinInput').value='';enter(data.conferencer);}catch(error){$('message').textContent=error.message;}finally{$('loginButton').disabled=false;}};
$('logout').onclick=async()=>{try{await call('bo_logout');}catch{}token='';sessionStorage.removeItem('bo_token');sessionStorage.removeItem('nri_conf_token');resetProduct();$('workView').hidden=true;$('identity').hidden=true;$('loginView').hidden=false;};
try{const data=await call('conferencers',{},false);$('conferencerSelect').replaceChildren(new Option('Selecione…',''),...data.conferencers.map(user=>new Option(user.display_name,user.id)));if(token){try{enter((await call('bo_session')).conferencer);}catch{token='';sessionStorage.removeItem('bo_token');sessionStorage.removeItem('nri_conf_token');}}}catch(error){$('message').textContent=error.message;}
