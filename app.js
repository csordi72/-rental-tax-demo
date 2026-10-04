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
