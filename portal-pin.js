// Keep each portal's numeric policy; only the named master identity uses text.
(() => {
  const pin=document.getElementById('pinInput');
  const select=document.querySelector('#conferencerSelect,#gateUserSelect,#operatorSelect');
  if(!pin||!select)return;
  const original={pattern:pin.pattern,maxLength:pin.maxLength,minLength:pin.minLength,placeholder:pin.placeholder};
  function update(){
    const master=/^ADM\s*[·|—-]/i.test(select.selectedOptions[0]?.textContent||'');
    pin.inputMode=master?'text':'numeric';pin.pattern=master?'[A-Za-z0-9]{3,12}':original.pattern;
    pin.maxLength=master?12:original.maxLength;pin.minLength=master?3:Math.max(0,original.minLength);
    pin.placeholder=master?'PIN do ADM':original.placeholder;pin.value='';
  }
  select.addEventListener('change',update);
})();
