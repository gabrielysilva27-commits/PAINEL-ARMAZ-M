// Measure text independently of flex/grid scroll geometry and scaled previews.
export function fittedFont(text,width,height,max,measure,lineHeight=1.04){
 for(let size=Math.floor(max);size>=10;size--){
  let lines=1,line='';let fits=true;
  for(const word of String(text).split(/\s+/)){
   if(measure(word,size)>width){fits=false;break;}
   const candidate=line?line+' '+word:word;
   if(measure(candidate,size)>width){lines++;line=word;}else line=candidate;
  }
  if(fits&&lines*size*lineHeight<=height)return size;
 }
 return 10;
}
