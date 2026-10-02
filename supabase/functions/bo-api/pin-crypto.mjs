const ITERATIONS=200000;
const encode=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');};
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const equal=(a,b)=>{let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
async function derive(pin,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);return encode(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},key,256)));}
export async function createPinRecord(pin){if(!/^\d{6}$/.test(pin))throw new Error('PIN deve ter 6 dígitos.');const salt=encode(crypto.getRandomValues(new Uint8Array(16))),now=new Date().toISOString();return {pin_salt:salt,pin_hash:`pbkdf2-sha256$${ITERATIONS}$${await derive(pin,decode(salt))}`,pin_updated_at:now,failed_attempts:0,locked_until:null,updated_at:now};}
export async function verifyPinRecord(pin,row){
 if(!/^\d{6}$/.test(pin)||!row?.pin_hash||!row.pin_salt)return {valid:false,legacy:false};
 const parts=String(row.pin_hash).split('$');
 if(parts.length!==3||parts[0]!=='pbkdf2-sha256'||Number(parts[1])!==ITERATIONS||!/^[A-Za-z0-9_-]{43}$/.test(parts[2])||!/^[A-Za-z0-9_-]{22}$/.test(row.pin_salt))return {valid:false,legacy:false};
 if(equal(parts[2],await derive(pin,decode(row.pin_salt))))return {valid:true,legacy:false};
 // Earlier imported records may have used the serialized salt as UTF-8 bytes.
 // They still require the full PBKDF2 hash match, then are upgraded on login.
 return {valid:equal(parts[2],await derive(pin,new TextEncoder().encode(row.pin_salt))),legacy:true};
}
