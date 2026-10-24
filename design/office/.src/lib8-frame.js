const officeFrame=(name,x,y,dark,o={})=>{
const pg=toolPage(name,x,y,dark);topbar(pg,1,{blocked:2,dark});const body=toolBody(pg);
const a=compactHeader(body,"辦公室","3D 即時：12 個 session · 2 個需要你 · 拖曳旋轉、滾輪縮放");
seg(a,["全部|12","Claude|9","Codex|3"],0,{sm:true});field(a,null,"專案：全部");
const ny=row(a,{name:"Button 只看需要你",height:28,cornerRadius:999,padding:[0,12],gap:6,fill:"$card",stroke:"$input",strokeWidth:1});dot(ny,"danger",8);tx(ny,"只看需要你",{fontSize:13,fontWeight:"600"});tag(ny,"2","danger");
seg(a,["3D","清單"],0,{sm:true});const rb=btn(a,"重設視角","ghost",{icon:"rotate-ccw",size:"sm"});iconBtn(a,"maximize-2");
if(o.banner)banner(body,"warn","herdr 訂閱斷線，每 5 秒輪詢中","細狀態最多延遲 5 秒；場景照常顯示",{sm:true});
const g=row(body,{name:"OfficeGrid",width:"fill_container",height:"fill_container",gap:12});
const cp=pane(g,{name:"Canvas pane"});const cv=fr(cp,{name:"Canvas (three.js)",layout:"none",width:"fill_container",height:"fill_container",fill:"$scene-sky",clip:true});
return {pg,g,cv}};
