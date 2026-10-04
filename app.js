const YEAR=2026,RATE=.15,KEY="rental-tax-demo-2026-v1";
const fresh=()=>({master:{acquisitionDate:"",acquisitionValue:"",depreciationBasis:"",depreciationRate:"",rentalStart:"",rentalEnd:"",wholeApartment:false,wholeKnown:false,rentedShare:""},docs:[],payments:[]});
let state=(()=>{try{return {...fresh(),...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return fresh()}})();
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const money=n=>new Intl.NumberFormat("hu-HU",{style:"currency",currency:"HUF",maximumFractionDigits:0}).format(n||0);
const dt=s=>s?new Date(s+"T12:00:00"):null;
const q=s=>Math.floor(dt(s).getMonth()/3);
const days=(a,b)=>Math.round((b-a)/86400000)+1;
const overlap=(a,b,l,r)=>{const x=new Date(Math.max(a,l)),y=new Date(Math.min(b,r));return y<x?0:days(x,y)};
function missing(){const m=state.master,o=[];if(!m.acquisitionDate)o.push("Szerzés dátuma");if(!m.acquisitionValue)o.push("Vételár");if(!m.depreciationBasis)o.push("ÉCS-alap");if(!m.depreciationRate)o.push("ÉCS-kulcs");if(!m.rentalStart)o.push("Bérbeadás kezdete");if(!m.rentalEnd)o.push("Bérbeadás vége");if(!m.wholeKnown)o.push("Teljes/részleges bérbeadás");if(m.wholeKnown&&!m.wholeApartment&&!m.rentedShare)o.push("Bérbeadott hányad");return o}
function annualDep(){if(missing().length)return 0;const m=state.master,a=dt(m.rentalStart),b=dt(m.rentalEnd),r=overlap(a,b,new Date(YEAR,0,1,12),new Date(YEAR,11,31,12)),share=m.wholeApartment?1:Number(m.rentedShare)/100;return Math.round(Number(m.depreciationBasis)*Number(m.depreciationRate)/100*r/365*share)}
function depQs(){const a=annualDep();if(!a)return[0,0,0,0];const m=state.master,s=dt(m.rentalStart),e=dt(m.rentalEnd),total=overlap(s,e,new Date(YEAR,0,1,12),new Date(YEAR,11,31,12));let used=0;return[0,1,2,3].map(i=>{const d=overlap(s,e,new Date(YEAR,i*3,1,12),new Date(YEAR,i*3+3,0,12)),v=i===3?a-used:Math.round(a*d/total);used+=v;return v})}
function rows(){const dep=depQs(),r=[0,1,2,3].map(i=>({income:0,expense:0,dep:dep[i],tax:0,paid:0,delta:0}));state.docs.forEach(x=>{if(!x.taxDate.startsWith("2026-"))return;const z=r[q(x.taxDate)];if(x.treatment==="income")z.income+=Number(x.amount);if(x.treatment==="expense")z.expense+=Number(x.amount)});state.payments.forEach(x=>{if(x.paidAt.startsWith("2026-"))r[q(x.paidAt)].paid+=Number(x.amount)});r.forEach(x=>{x.tax=Math.round(Math.max(0,x.income-x.expense-x.dep)*RATE);x.delta=x.tax-x.paid});return r}
function render(){
 const m=missing();nextQuestion.innerHTML=m.length?'<b class="warn">Következő szükséges adat: '+m[0]+'</b><br><span class="small">A már megadott fix adatokat nem kérjük újra.</span>':'<b class="ok">A szükséges fix adatok rendelkezésre állnak.</b>';
 const r=rows(),sum=k=>r.reduce((a,x)=>a+x[k],0);
 annualIncome.textContent=money(sum("income"));annualExpense.textContent=money(sum("expense"));annualDep.textContent=money(sum("dep"));annualTax.textContent=money(sum("tax"));annualPaid.textContent=money(sum("paid"));annualDelta.textContent=money(sum("delta"));
 quarterTable.innerHTML=r.map((x,i)=>'<tr><td>Q'+(i+1)+'</td><td>'+money(x.income)+'</td><td>'+money(x.expense)+'</td><td>'+money(x.dep)+'</td><td>'+money(x.tax)+'</td><td>'+money(x.paid)+'</td><td>'+money(x.delta)+'</td></tr>').join("");
 docsTable.innerHTML=state.docs.length?state.docs.map(x=>'<tr><td>'+x.documentId+'</td><td>'+x.file+'</td><td>'+money(x.amount)+'</td><td>'+x.taxDate+'</td><td>'+x.treatment+'</td></tr>').join(""):'<tr><td colspan="5">Még nincs tétel.</td></tr>';
 const f=masterForm,s=state.master;["acquisitionDate","acquisitionValue","depreciationBasis","depreciationRate","rentalStart","rentalEnd","rentedShare"].forEach(k=>f[k].value=s[k]||"");f.wholeApartment.checked=!!s.wholeApartment;
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab,.view").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.getElementById(b.dataset.tab).classList.add("active")});
masterForm.onsubmit=e=>{e.preventDefault();const f=e.currentTarget;state.master={acquisitionDate:f.acquisitionDate.value,acquisitionValue:f.acquisitionValue.value,depreciationBasis:f.depreciationBasis.value,depreciationRate:f.depreciationRate.value,rentalStart:f.rentalStart.value,rentalEnd:f.rentalEnd.value,wholeApartment:f.wholeApartment.checked,wholeKnown:true,rentedShare:f.wholeApartment.checked?"100":f.rentedShare.value};save();render()};
docForm.onsubmit=e=>{e.preventDefault();const f=e.currentTarget,file=f.file.files[0],x={documentId:f.documentId.value.trim(),file:file?file.name:"kézi",amount:Number(f.amount.value),taxDate:f.taxDate.value,serviceStart:f.serviceStart.value,serviceEnd:f.serviceEnd.value,treatment:f.treatment.value};if(state.docs.some(y=>y.documentId===x.documentId)){alert("Ez az azonosító már létezik.");return}state.docs.push(x);save();f.reset();render()};
paymentForm.onsubmit=e=>{e.preventDefault();const f=e.currentTarget,x={paymentId:f.paymentId.value.trim(),paidAt:f.paidAt.value,amount:Number(f.amount.value)};if(state.payments.some(y=>y.paymentId===x.paymentId)){alert("Ez az azonosító már létezik.");return}state.payments.push(x);save();f.reset();render()};
render();


state.candidates = state.candidates || [];
state.autoAccepted = state.autoAccepted || [];

const AUTO_MONTHS = {"január":1,"február":2,"március":3,"április":4,"május":5,"június":6,"július":7,"augusztus":8,"szeptember":9,"október":10,"november":11,"december":12};

function autoIso(v){const m=(v||"").match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);return m?m[1]+"-"+m[2]+"-"+m[3]:""}
function autoNum(v){return Number(String(v||"").replace(/[^\d]/g,""))||0}
function autoPeriod(text){
  const m=text.match(/(\d{4})\.\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)\s*[-–]\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)/i);
  if(!m)return["",""];
  const y=Number(m[1]),sm=AUTO_MONTHS[m[2].toLowerCase()],em=AUTO_MONTHS[m[3].toLowerCase()];
  return [y+"-"+String(sm).padStart(2,"0")+"-01",y+"-"+String(em).padStart(2,"0")+"-"+String(new Date(y,em,0).getDate()).padStart(2,"0")];
}
async function autoExtractPdfText(file){
  if(!window.pdfjsLib)throw new Error("PDF feldolgozó nem érhető el");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  let text="";
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),tc=await page.getTextContent();
    tc.items.forEach(x=>text+=x.str+(x.hasEOL?"\n":" "));
    text+="\n";
  }
  return text.replace(/[ \t]+/g," ");
}
function autoFamily(text){
  if(/Lakásbérleti díj/i.test(text)&&/SZÁMLA/i.test(text))return"RENTAL_INVOICE";
  if(/Terhelési összesítő/i.test(text)&&/(FVV\/|FCS\/)/i.test(text))return"UTILITY_BUNDLE";
  if(/Teljes elszámolás/i.test(text)&&/Közösköltség/i.test(text))return"COMMON_COST_STATEMENT";
  return"UNKNOWN";
}
function autoLineAmount(text,label){
  const m=text.match(new RegExp(label+"[^\\n]*?([0-9][0-9 ]{1,})\\s+AAM","i"));
  if(!m)return 0;
  const nums=(m[0].match(/[0-9][0-9 ]*/g)||[]).map(autoNum).filter(Boolean);
  return nums.length?nums[nums.length-1]:0;
}
function autoCandidate(file,mode,suffix,label,amount,taxDate,start,end,treatment,family){
  return {id:[file.name,file.size,file.lastModified,suffix].join(":"),file:file.name,mode,label,amount,taxDate,start,end,treatment,family,status:"PENDING"};
}
function autoParseRental(text,file,mode){
  const date=autoIso((text.match(/Teljesítés dátuma:\s*([0-9.\-]+)/i)||[,""])[1]);
  const [start,end]=autoPeriod(text),out=[];
  const rent=autoLineAmount(text,"Lakásbérleti díj"),common=autoLineAmount(text,"Közös költség"),utility=autoLineAmount(text,"Közüzemi díjak");
  if(rent)out.push(autoCandidate(file,mode,"rent","Lakásbérleti díj",rent,date,start,end,"income","RENTAL_INVOICE"));
  if(common)out.push(autoCandidate(file,mode,"common","Közös költség megtérítés",common,date,start,end,"income","RENTAL_INVOICE"));
  if(utility)out.push(autoCandidate(file,mode,"utility","Közüzemi megtérítés",utility,date,start,end,"review","RENTAL_INVOICE"));
  return out;
}
function autoParseUtility(text,file,mode){
  const ids=[...new Set(text.match(/(?:FVV|FCS)\/\d+/g)||[])],out=[];
  ids.forEach((id,i)=>{
    const p=text.indexOf("Számla sorszáma: "+id),seg=p>=0?text.slice(p,p+6500):text;
    const am=seg.match(/Fizetendő összeg:\s*([0-9 ]+)\s*Ft/i),pm=seg.match(/Elszámolási időszak:\s*(\d{4}\.\d{2}\.\d{2})\s*[-–]\s*(\d{4}\.\d{2}\.\d{2})/i),dm=seg.match(/Teljesítés időpontja:\s*([0-9.]+)/i);
    const amount=am?autoNum(am[1]):0;if(!amount)return;
    out.push(autoCandidate(file,mode,"u"+i,(id.startsWith("FVV/")?"Víz":"Csatorna")+" · "+id,amount,dm?autoIso(dm[1]):"",pm?autoIso(pm[1]):"",pm?autoIso(pm[2]):"","review","UTILITY_BUNDLE"));
  });
  return out;
}
function autoParseCommon(text,file,mode){
  const out=[],ym=text.match(/(20\d{2})\.01\.01/),y=ym?Number(ym[1]):2026,re=/(\d{1,2})\.\s*hó\s+([0-9 ]+)\s+([0-9 ]+)\s+([0-9 ]+)\s+([0-9 ]+)/g;
  let m;while((m=re.exec(text))){const mo=Number(m[1]),amount=autoNum(m[5]);if(!amount||mo<1||mo>12)continue;out.push(autoCandidate(file,mode,"cc"+mo,"Társasházi előírás · "+mo+". hó",amount,"",y+"-"+String(mo).padStart(2,"0")+"-01",y+"-"+String(mo).padStart(2,"0")+"-"+String(new Date(y,mo,0).getDate()).padStart(2,"0"),"review","COMMON_COST_STATEMENT"))}
  return out;
}
function autoParse(text,file,mode){
  const family=autoFamily(text);
  if(family==="RENTAL_INVOICE")return autoParseRental(text,file,mode);
  if(family==="UTILITY_BUNDLE")return autoParseUtility(text,file,mode);
  if(family==="COMMON_COST_STATEMENT")return autoParseCommon(text,file,mode);
  return [autoCandidate(file,mode,"unknown","Ismeretlen dokumentumtípus",0,"","","","review","UNKNOWN")];
}
function renderAutoCandidates(){
  if(!window.candidatePanel||!window.candidateTable)return;
  candidatePanel.hidden=!state.candidates.length;
  candidateTable.innerHTML=state.candidates.map(x=>{
    const done=x.status!=="PENDING",opts=[["income","Adóköteles bevétel"],["expense","Elszámolható költség"],["pass","Nem adóköteles átterhelés"],["review","Ellenőrzést igényel"]].map(([v,l])=>'<option value="'+v+'"'+(x.treatment===v?" selected":"")+'>'+l+'</option>').join("");
    return '<tr data-id="'+x.id.replace(/"/g,"&quot;")+'"><td><b>'+x.label+'</b><br><span class="small">'+x.file+' · '+x.family+' · '+x.mode+'</span></td><td>'+money(x.amount)+'</td><td><input class="auto-date" type="date" value="'+(x.taxDate||"")+'" '+(done?"disabled":"")+'></td><td><select class="auto-treatment" '+(done?"disabled":"")+'>'+opts+'</select></td><td><button class="primary auto-approve" '+(done?"disabled":"")+'>'+(x.mode==="TEST_SAMPLE"?"Teszt rendben":"Jóváhagyás")+'</button><br><span class="small">'+x.status+'</span></td></tr>';
  }).join("");
  candidateTable.querySelectorAll(".auto-approve").forEach(b=>b.onclick=()=>{
    const tr=b.closest("tr"),x=state.candidates.find(c=>c.id===tr.dataset.id);if(!x)return;
    x.taxDate=tr.querySelector(".auto-date").value;x.treatment=tr.querySelector(".auto-treatment").value;
    if(x.mode==="TEST_SAMPLE"){x.status="TEST_ACCEPTED";state.autoAccepted.push(x.id);save();renderAutoCandidates();return}
    if(x.treatment==="review"){alert("Előbb válassz jóváhagyott kezelést.");return}
    if(!x.taxDate.startsWith("2026-")||!x.start.startsWith("2026-")||!x.end.startsWith("2026-")){alert("LIVE_2026 tételnél minden dátumnak 2026-osnak kell lennie.");return}
    const doc={documentId:"AUTO-"+btoa(unescape(encodeURIComponent(x.id))).replace(/=/g,"").slice(-18),file:x.file,amount:x.amount,taxDate:x.taxDate,serviceStart:x.start,serviceEnd:x.end,treatment:x.treatment};
    if(!state.docs.some(d=>d.documentId===doc.documentId))state.docs.push(doc);
    x.status="APPROVED";state.autoAccepted.push(x.id);save();render();renderAutoCandidates();
  });
}
if(window.autoDocumentForm){
  autoDocumentForm.onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,files=[...form.files.files],mode=form.mode.value;autoStatus.textContent=files.length+" PDF feldolgozása…";let added=0,errors=[];
    for(const file of files){try{const text=await autoExtractPdfText(file);if(text.replace(/\s/g,"").length<40){errors.push(file.name+": OCR szükséges");continue}for(const x of autoParse(text,file,mode)){if(!state.candidates.some(c=>c.id===x.id)){state.candidates.push(x);added++}}}catch(err){errors.push(file.name+": "+err.message)}}
    save();renderAutoCandidates();autoStatus.textContent=added+" új javaslat készült"+(errors.length?". "+errors.join("; "):".");form.files.value="";
  };
}
renderAutoCandidates();
