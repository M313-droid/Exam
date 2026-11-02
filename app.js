import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, runTransaction } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ضع إعدادات مشروع Firebase هنا بعد إنشائه */
const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = id => document.getElementById(id);
let me=null, profile=null, selectedExam=null, activeQuestion=null, unsubExam=null, unsubQuestion=null, tick=null;
const show=(id,on=true)=>$(id).classList.toggle("hidden",!on);
const msg=(id,t)=>$(id).textContent=t;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isAdmin=()=>profile && ["mainAdmin","admin"].includes(profile.role);

$("loginBtn").onclick=async()=>{
 try{const c=await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);me=c.user;await start();}
 catch(e){msg("loginMsg",friendly(e));}
};
$("logout").onclick=async()=>{if(unsubExam)unsubExam();if(unsubQuestion)unsubQuestion();if(tick)clearInterval(tick);await signOut(auth);location.reload();};
function friendly(e){return e.code==="auth/invalid-credential"?"بيانات الدخول غير صحيحة.":e.message||"حدث خطأ."}
async function start(){
 const p=await getDoc(doc(db,"users",me.uid));
 if(!p.exists()||p.data().enabled!==true){await signOut(auth);throw new Error("الحساب غير مفعل. راجع المدير الرئيسي.");}
 profile=p.data();show("login",false);show("app");show("logout");$("hello").textContent="مرحباً "+(profile.displayName||"");$("roleLine").textContent=profile.role==="mainAdmin"?"المدير الرئيسي":profile.role==="admin"?"مدير مساعد":"حساب طالب";
 if(isAdmin()){show("adminPanel");show("studentPanel",false);loadExams();}
 else{show("studentPanel");show("adminPanel",false);watchStudentExams();}
}
$("createExam").onclick=async()=>{
 try{const title=$("examTitle").value.trim();if(!title)throw Error("أدخل اسم الامتحان.");const r=await addDoc(collection(db,"exams"),{title,status:"draft",createdBy:me.uid,createdAt:serverTimestamp(),questionCount:0,activeQuestionId:null,activeIndex:-1});$("examTitle").value="";msg("userMsg","تم إنشاء الامتحان.");loadExams();}
 catch(e){msg("userMsg",friendly(e));}
};
async function loadExams(){
 const snap=await getDocs(query(collection(db,"exams"),orderBy("createdAt","desc")));
 $("examList").innerHTML="";
 snap.forEach(d=>{const x=d.data(),el=document.createElement("div");el.className="exam";el.innerHTML=`<b>${esc(x.title)}</b> · ${esc(x.status)}<div><button data-edit="${d.id}">إعداد الأسئلة</button><button data-monitor="${d.id}" class="secondary">لوحة الامتحان</button></div>`;$("examList").append(el);});
 document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEditor(b.dataset.edit));
 document.querySelectorAll("[data-monitor]").forEach(b=>b.onclick=()=>openMonitor(b.dataset.monitor));
}
async function openEditor(id){selectedExam=id;show("editor");show("monitor",false);$("editorTitle").textContent="إعداد الأسئلة · "+id;await renderQuestions();}
async function renderQuestions(){
 const snap=await getDocs(query(collection(db,"exams",selectedExam,"questions"),orderBy("order")));
 $("questionList").innerHTML="";snap.forEach(d=>{let x=d.data(),el=document.createElement("div");el.className="question";el.textContent=`${x.order+1}. ${x.prompt} (${x.points} درجات · ${x.durationSec} ثانية)`;$("questionList").append(el);});
}
$("qType").onchange=()=>show("optionsBox",$("qType").value==="mcq"||$("qType").value==="truefalse");
$("addQuestion").onclick=async()=>{
 try{
  const snap=await getDocs(collection(db,"exams",selectedExam,"questions")),order=snap.size,type=$("qType").value,prompt=$("qText").value.trim(),points=Number($("qPoints").value),durationSec=Number($("qDuration").value);
  if(!prompt||points<1||durationSec<10)throw Error("تحقق من نص السؤال والدرجة والوقت.");
  let options=type==="truefalse"?["صح","خطأ"]:type==="mcq"?$("qOptions").value.split("\n").map(s=>s.trim()).filter(Boolean):[];
  if(type==="mcq"&&options.length<2)throw Error("أدخل خيارين على الأقل.");
  const qref=await addDoc(collection(db,"exams",selectedExam,"questions"),{order,type,prompt,options,points,durationSec,status:"draft",createdAt:serverTimestamp()});
  const correct=$("qCorrect").value.trim();
  if(correct)await setDoc(doc(db,"exams",selectedExam,"questions",qref.id,"answerKeys","key"),{correct});
  await updateDoc(doc(db,"exams",selectedExam),{questionCount:order+1});
  $("qText").value="";$("qCorrect").value="";msg("questionMsg","تمت إضافة السؤال.");renderQuestions();
 }catch(e){msg("questionMsg",friendly(e));}
};
async function openMonitor(id){
 selectedExam=id;show("monitor");show("editor",false);const ref=doc(db,"exams",id);
 if(unsubExam)unsubExam();unsubExam=onSnapshot(ref,s=>{const x=s.data();if(!x)return;$("liveInfo").innerHTML=`<b>${esc(x.title)}</b><p>الحالة: ${esc(x.status)}</p>`;});
 $("closeQuestion").onclick=()=>closeActive();
 $("publishResults").onclick=()=>publishActive();
}
async function launchNext(){
 const exRef=doc(db,"exams",selectedExam),qs=await getDocs(query(collection(db,"exams",selectedExam,"questions"),orderBy("order")));
 const arr=qs.docs;if(!arr.length)throw Error("أضف الأسئلة أولاً.");
 const examSnap=await getDoc(exRef),next=(examSnap.data().activeIndex??-1)+1;
 if(next>=arr.length)throw Error("انتهت أسئلة الامتحان.");
 const q=arr[next],deadline=Timestamp.fromMillis(Date.now()+q.data().durationSec*1000);
 await runTransaction(db,async tx=>{const e=await tx.get(exRef);if(e.data().activeQuestionId)throw Error("يوجد سؤال مفتوح. أغلقه أولاً.");tx.update(exRef,{status:"live",activeQuestionId:q.id,activeIndex:next,deadline});tx.update(doc(db,"exams",selectedExam,"questions",q.id),{status:"active"});});
}
async function closeActive(){
 const ex=await getDoc(doc(db,"exams",selectedExam)),qid=ex.data()?.activeQuestionId;if(!qid)return;
 await updateDoc(doc(db,"exams",selectedExam),{activeQuestionId:null,status:"review"});
 await updateDoc(doc(db,"exams",selectedExam,"questions",qid),{status:"closed"});
 await showResponses(qid);
}
async function showResponses(qid){
 const s=await getDocs(collection(db,"exams",selectedExam,"questions",qid,"responses"));let html="<h3>الإجابات المستلمة</h3>";
 for(const d of s.docs){const u=await getDoc(doc(db,"users",d.id));html+=`<div class="question"><b>${esc(u.data()?.displayName||"طالب")}</b><p>${esc(d.data().answer)}</p><label>الدرجة<input type="number" min="0" max="100" id="score_${d.id}" value="${d.data().score??0}"></label><button data-grade="${d.id}">حفظ الدرجة</button></div>`;}
 $("responses").innerHTML=html;
 document.querySelectorAll("[data-grade]").forEach(b=>b.onclick=async()=>{const uid=b.dataset.grade;await updateDoc(doc(db,"exams",selectedExam,"questions",qid,"responses",uid),{score:Number($("score_"+uid).value),graded:true});});
}
async function publishActive(){
 const qs=await getDocs(query(collection(db,"exams",selectedExam,"questions"),orderBy("order")));const ex=(await getDoc(doc(db,"exams",selectedExam))).data();const q=qs.docs[ex.activeIndex];if(!q)throw Error("لا يوجد سؤال محدد.");
 const qid=q.id,rs=await getDocs(collection(db,"exams",selectedExam,"questions",qid,"responses"));
 for(const r of rs.docs){const u=await getDoc(doc(db,"users",r.id));await setDoc(doc(db,"exams",selectedExam,"questions",qid,"results",r.id),{displayName:u.data()?.displayName||"طالب",score:r.data().score??0,publishedAt:serverTimestamp()});}
 await updateDoc(doc(db,"exams",selectedExam,"questions",qid),{status:"published"});$("responses").innerHTML+="<p class='pill'>تم نشر النتائج للطلاب.</p>";
}
async function watchStudentExams(){
 const s=await getDocs(query(collection(db,"exams"),orderBy("createdAt","desc")));$("studentExam").innerHTML="";
 s.forEach(d=>{let el=document.createElement("div");el.className="exam";el.innerHTML=`<b>${esc(d.data().title)}</b> · ${esc(d.data().status)}`;$("studentExam").append(el);if(d.data().status==="live"||d.data().status==="review")watchExam(d.id);});
}
function watchExam(id){
 selectedExam=id;if(unsubExam)unsubExam();
 unsubExam=onSnapshot(doc(db,"exams",id),async s=>{
  const e=s.data();if(!e)return;
  if(e.activeQuestionId){const qref=doc(db,"exams",id,"questions",e.activeQuestionId);if(unsubQuestion)unsubQuestion();unsubQuestion=onSnapshot(qref,async q=>{if(!q.exists())return;activeQuestion={id:q.id,...q.data()};renderStudentQuestion(e.deadline);});}
  else{show("answerPanel",false);$("studentExam").textContent=e.status==="review"?"أغلق المدير السؤال ويجري التصحيح.":"بانتظار السؤال التالي...";}
  showStudentResults(id);
 });
}
async function renderStudentQuestion(deadline){
 const q=activeQuestion;if(!q)return;show("answerPanel",q.status==="active");$("studentQuestion").textContent=q.prompt;
 const existing=await getDoc(doc(db,"exams",selectedExam,"questions",q.id,"responses",me.uid));
 if(existing.exists()){$("answerInput").textContent="تم إرسال إجابتك."; $("sendAnswer").disabled=true;return;}
 $("sendAnswer").disabled=false;
 $("answerInput").innerHTML="";
 if(q.type==="mcq"||q.type==="truefalse")q.options.forEach((o,i)=>{$("answerInput").innerHTML+=`<label class="student-option"><input type="radio" name="ans" value="${esc(o)}">${esc(o)}</label>`;});
 else $("answerInput").innerHTML='<textarea id="writtenAnswer" rows="5" placeholder="اكتب إجابتك هنا"></textarea>';
 if(tick)clearInterval(tick);
 tick=setInterval(()=>{const sec=Math.max(0,Math.floor((deadline.toMillis()-Date.now())/1000));$("timer").textContent=`${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;if(sec===0){clearInterval(tick);$("sendAnswer").disabled=true;msg("answerMsg","انتهى وقت السؤال.");}},500);
}
$("sendAnswer").onclick=async()=>{
 try{const q=activeQuestion;if(!q||q.status!=="active")throw Error("السؤال مغلق.");
 const ex=await getDoc(doc(db,"exams",selectedExam));if(!ex.data().deadline||ex.data().deadline.toMillis()<=Date.now())throw Error("انتهى الوقت.");
 let answer=(q.type==="mcq"||q.type==="truefalse")?document.querySelector('input[name="ans"]:checked')?.value:$("writtenAnswer")?.value?.trim();
 if(!answer)throw Error("اختر أو اكتب الإجابة أولاً.");
 let score=null,graded=false;
 const key=await getDoc(doc(db,"exams",selectedExam,"questions",q.id,"answerKeys","key"));
 if(key.exists()&&(q.type==="mcq"||q.type==="truefalse")){score=String(answer).trim().toLowerCase()===String(key.data().correct).trim().toLowerCase()?q.points:0;graded=true;}
 await setDoc(doc(db,"exams",selectedExam,"questions",q.id,"responses",me.uid),{answer,submittedAt:serverTimestamp(),score,graded});
 $("sendAnswer").disabled=true;msg("answerMsg","تم استلام إجابتك بنجاح.");
 }catch(e){msg("answerMsg",friendly(e));}
};
async function showStudentResults(id){
 const qs=await getDocs(query(collection(db,"exams",id,"questions"),orderBy("order")));let html="";
 for(const q of qs.docs){if(q.data().status!=="published")continue;const r=await getDoc(doc(db,"exams",id,"questions",q.id,"results",me.uid));if(r.exists())html+=`<div class="question"><b>${esc(q.data().prompt)}</b><p>درجتك: <b>${esc(r.data().score)} / ${esc(q.data().points)}</b></p></div>`;}
 $("studentResults").innerHTML=html||"لم تُعلن نتائج بعد.";
}
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
