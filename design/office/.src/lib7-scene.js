const AG=[
 {n:"leader",z:"A",rk:"senior",ef:3,x:1.85,y:2.65,st:"thinking",sh:"$shirt-2",crown:1,desk:["big",0.9,1.4]},
 {n:"dev-a",z:"A",rk:"senior",ef:2,x:4.3,y:2.55,st:"waiting",pose:"wave",sh:"$shirt-1",desk:["d",3.6,1.4]},
 {n:"dev-b",z:"A",rk:"mid",ef:3,x:6.1,y:2.55,st:"running",label:"Bash",pose:"type",sh:"$shirt-3",desk:["d",5.4,1.4]},
 {n:"qa",z:"A",rk:"mid",ef:2,x:7.9,y:2.55,st:"idle",pose:"nap",sh:"$shirt-4",dim:1,desk:["d",7.2,1.4]},
 {n:"",z:"A",desk:["d",3.6,4.4]},{n:"",z:"A",desk:["d",5.4,4.4]},
 {n:"leader",z:"B",rk:"senior",ef:4,bang:1,x:11.95,y:2.65,st:"writing",sh:"$shirt-2",crown:1,desk:["big",11.0,1.4]},
 {n:"backend",z:"B",rk:"senior",ef:3,x:14.5,y:2.55,st:"running",label:"Edit",pose:"type",sh:"$shirt-4",desk:["d",13.8,1.4]},
 {n:"frontend",z:"B",rk:"mid",ef:2,x:16.3,y:2.55,st:"thinking",pose:"think",sh:"$shirt-1",desk:["d",15.6,1.4]},
 {n:"qa",z:"B",rk:"senior",ef:2,x:18.1,y:2.55,st:"error",pose:"slump",sh:"$shirt-3",desk:["d",17.4,1.4]},
 {n:"claude",z:"C",rk:"mid",ef:2,x:1.9,y:10.15,st:"interrupted",pose:"sit",sh:"$shirt-4",desk:["d",1.2,9.0]},
 {n:"codex",z:"C",rk:"visitor",ef:0,x:3.9,y:10.15,st:"running",label:"shell",pose:"type",sh:"$shirt-1",desk:["d",3.2,9.0]},
 {n:"",z:"C",desk:["d",5.2,9.0]},{n:"",z:"C",desk:["d",7.2,9.0]},
 {n:"designer",z:"L",rk:"senior",ef:2,x:15.6,y:12.2,st:"done",pose:"coffee",sh:"$shirt-3"},
 {n:"claude",z:"L",rk:"junior",ef:1,x:17.6,y:10.0,st:"done",pose:"sit",sh:"$shirt-2"}
];
const BOARDS=[{x:0.7,y:6.2,task:"結帳流程改版",done:2,total:5,tone:"danger",chips:[["1 等你","danger","hand"]]},{x:10.5,y:6.2,task:"API 速率限制",done:1,total:3,tone:"danger",chips:[["1 錯誤","danger","circle-alert"],["ESCALATE","warn"]]}];
const scene=(cv,o={})=>{LBL.length=0;ISO.s=o.s||28;ISO.ox=o.ox;ISO.oy=o.oy;const sel=o.sel,hov=o.hov,trip=o.trip!==false;
room(cv,24.4,14,{windows:[[2,4.5],[6,8.5],[12,14.5],[16,18.5]]});
zoneRug(cv,0.5,0.6,9.2,6.6);zoneRug(cv,10.3,0.6,9.2,6.6);zoneRug(cv,0.5,8.0,9.2,5.6,"$scene-zone");zoneRug(cv,10.3,8.0,9.2,5.6,"$scene-lounge");zoneRug(cv,22.4,12.6,1.8,1.0,"$scene-zone-edge");
fEll(cv,14.6,11.3,1.6,"$scene-couch-t",{opacity:0.35,name:"round rug"});
monitorWall(cv,20.6,23.6,[5]);
if(o.night)AG.forEach(a=>{if(a.desk&&a.st&&!["idle","done"].includes(a.st))fEll(cv,a.desk[1]+0.7,a.desk[2]+1.0,1.1,"$scene-screen-on",{opacity:0.16,name:"screen glow"})});
const items=[];
AG.forEach((a,i)=>{if(a.desk){const [t,dx,dy]=a.desk;const on=a.st&&!["idle","done"].includes(a.st)?"$scene-screen-on":"$scene-screen-off";items.push([dx+dy+(t==="big"?0.5:0.4),()=>t==="big"?bigDesk(cv,dx,dy,on):desk(cv,dx,dy,on)])}if(a.st){items.push([a.x+a.y,()=>{if(["waiting","error"].includes(a.st))alertRing(cv,a.x,a.y);if(sel===i)selRing(cv,a.x,a.y);const [sx,sy]=IS(a.x,a.y,a.pose==="sit"&&a.z==="L"?0.3:0);const h=chibi(cv,sx,sy,{k:o.k||1.1,pose:a.pose||"sit",shirt:RANK[a.rk].c,lanyard:a.rk==="visitor",crown:a.crown,dim:a.dim&&!o.noDim,name:a.n});a.hx=h.x;a.hy=h.y}])}});
BOARDS.forEach(b=>items.push([b.x+b.y+0.9,()=>whiteboard(cv,b.x,b.y,{tone:b.tone,done:b.done,total:b.total})]));
items.push([22+4.5,()=>shelvesY(cv,20.5,23.9,4.2)]);items.push([21+6.8,()=>cabinet(cv,20.6,6.4,"$status-warn")]);items.push([23.8+9.6,()=>plant(cv,23.8,9.4)]);items.push([21+11.5,()=>bulletinStand(cv,21.0,11.4)]);
items.push([8.6+11.0,()=>{box(cv,11.0,8.6,0,2.2,0.7,0.9,DESK,{name:"pantry counter"});box(cv,11.3,8.7,0.9,0.5,0.4,0.5,{t:"$scene-monitor",l:trip?"$scene-monitor":"$scene-screen-off",r:"$scene-monitor"},{name:"coffee machine"});box(cv,12.2,8.75,0.9,0.35,0.35,0.35,{t:"#ffffff",l:"$scene-wall-r",r:"$scene-wall-top"},{name:"water"})}]);
items.push([22.5,()=>meter(cv,14.0,8.4,trip)]);
items.push([16.5+9.4,()=>{box(cv,16.5,8.85,0,2.6,0.35,0.95,{t:"$scene-couch-t",l:"$scene-couch-l",r:"$scene-couch-r"},{name:"couch back"});box(cv,16.5,9.2,0,2.6,0.8,0.42,{t:"$scene-couch-t",l:"$scene-couch-l",r:"$scene-couch-r"},{name:"couch seat"})}]);
items.push([19.0+8.7,()=>plant(cv,18.9,8.6)]);items.push([9.1+0.9,()=>plant(cv,9.0,0.9)]);
items.push([13.6+12.6,()=>{box(cv,13.9,11.0,0,1.0,0.6,0.35,DESK,{name:"coffee table"})}]);
items.sort((a,b)=>a[0]-b[0]).forEach(f=>f[1]());
if(!o.bare){zoneSign(cv,1.0,0.02,"atlas","結帳流程改版 · 波 3",{z:2.25,icon:"folder-kanban",tag:["4","neutral"]});
zoneSign(cv,10.8,0.02,"beacon","API 速率限制 · 波 2",{z:2.25,icon:"folder-kanban",tag:["4","neutral"]});
zoneSign(cv,0.6,13.0,"無任務 session",null,{icon:"laptop",tag:["2","neutral"]});
zoneSign(cv,10.4,13.3,"休息區",null,{icon:"coffee",tag:["2","neutral"]});
const L=(x,y,z,f)=>{const [sx,sy]=IS(x,y,z);f(sx,sy)};const cp=!!o.compact;
const PRI=["waiting","error","interrupted","running","writing","thinking","done","idle"];AG.map((a,i)=>[a,i]).filter(([a])=>a.st).sort((x,y)=>{const nx=(x[1]===hov||x[1]===sel)?-1:0,ny=(y[1]===hov||y[1]===sel)?-1:0;return nx-ny||PRI.indexOf(x[0].st)-PRI.indexOf(y[0].st)}).forEach(([a,i])=>{const show=a.st!=="idle"||hov===i;const near=hov===i||sel===i;headStack(cv,a.hx,a.hy,show?a.st:null,{yield:!near,who:a.n+"#"+i,label:a.label,ef:show&&near?a.ef:0,bang:a.bang&&o.esc!==false})});
const OL=o.objLabels||{};const ol=(k,x,y,z,props)=>{const q=OL[k]||{};if(q.hide)return;L(x+(q.dx||0),y+(q.dy||0),z,(sx,sy)=>objLabel(cv,sx+(q.px||0),sy+(q.py||0),{compact:cp,yield:1,...props,...(q.align?{align:q.align}:{})}))};
ol("herdr",22.1,0,2.3,{align:"end",icon:"monitor-play",page:"herdr",value:"14",unit:"pane",chip:"2 卡住",tone:"danger"});
ol("總覽",21.8,11.46,1.85,{icon:"layout-dashboard",page:"總覽",value:"2",unit:"個任務進行中"});
ol("歷史",22.2,4.7,1.95,{icon:"archive",page:"歷史",value:"23",unit:"已結案"});
ol("git",21.0,6.7,0,{below:1,icon:"git-branch",page:"git",value:"3",unit:"未推送",chip:cp?"未推送":null,tone:"warn",lamp:"warn"});
ol("趨勢",14.25,8.55,1.6,trip?{icon:"zap-off",page:"趨勢",value:"$42.10",unit:"今日",chip:cp?"跳電":"跳電 · codex",tone:"warn"}:{icon:"zap",page:"趨勢",value:"$42.10",unit:"今日 · 額度 37%"});
BOARDS.forEach((b,k)=>{const q=OL["board"+k]||{};L(b.x+0.9+(q.dx||0),b.y+0.06,1.75,(x,y)=>boardLabel(cv,x+(q.px||0),y+(q.py||0),{...b,compact:cp,below:false,yield:1}))});}
};
const hoverCard=(p,x,y,o)=>{const c=col(p,{name:"HoverCard",x,y,width:280,fill:"$popover",cornerRadius:20,padding:16,gap:10,effect:POP});const h=row(c,{name:"head",width:"fill_container",gap:10});avatar(h,o.emoji,"$accent",28);const t=col(h,{name:"who",gap:0,width:"fill_container"});const r1=row(t,{gap:6});tx(r1,o.name,{fontSize:14,fontWeight:"800"});tag(r1,o.kind,"neutral",{mono:true});tx(t,o.where,{fontSize:12,fill:"$muted-foreground"});if(o.rank)rankTag(c,o.rank[0],o.rank[1],{ef:o.ef});
const r2=row(c,{name:"state",gap:8,width:"fill_container"});pill(r2,o.pill[0],o.pill[1]);sp(r2);tx(r2,o.timer,{fontSize:12,fontWeight:"600",fill:"$muted-foreground"});
if(o.tool){const tl=row(c,{name:"tool",width:"fill_container",fill:"$muted",cornerRadius:14,padding:[6,10],gap:6});ic(tl,"terminal",12,"$muted-foreground");tx(tl,o.tool,{fontFamily:M,fontSize:12})}
tx(c,"點一下看詳情",{fontSize:11,fill:"$muted-foreground"});return c};
const legend=(p,o={})=>{const c=col(p,{name:"Legend",x:o.x,y:o.y,width:o.w||300,fill:"$popover",cornerRadius:20,padding:14,gap:8,effect:POP});const h=row(c,{width:"fill_container",gap:6});ic(h,"info",14,"$muted-foreground");tx(h,"圖例",{fontSize:13,fontWeight:"800"});sp(h);ic(h,"chevron-down",14,"$muted-foreground");
[["waiting","等你回覆或審批",null],["error","這輪出錯停下",null],["thinking","思考中",null],["running","執行工具（顯示工具名）","Bash"],["writing","正在寫回覆",null],["interrupted","被中斷（10 分後轉閒置）",null],["done","完成，去休息區",null],["idle","閒置（只在 hover 顯示）",null]].forEach(([k,t,l])=>{const r=row(c,{name:"legend "+k,width:"fill_container",gap:10,height:30});const slot=fr(r,{name:"slot",layout:"none",width:96,height:30});marker(slot,48,34,k,{label:l,mono:!!l,scale:0.85});tx(r,t,{fontSize:12,fill:"$foreground"})});
tx(c,"紅圈＝要你處理；紫圈＝目前選取",{fontSize:11,fill:"$muted-foreground"});return c};
const SUB={waiting:["等你","danger"],error:["錯誤","danger"],interrupted:["中斷","warn"],running:["執行","ok"],writing:["回覆中","ok"],thinking:["思考中","ok"],done:["完成","ok"],idle:["閒置","idle"]};
const sessionRow=(p,o)=>{const d=SUB[o.st];const r=row(p,{name:"SessionRow "+o.n,width:"fill_container",padding:[10,12],gap:10,cornerRadius:14,fill:d[1]==="danger"?"$status-danger-soft":(o.sel?"$accent":undefined)});avatar(r,o.e||"🐱","$accent",28);const t=col(r,{gap:2,width:"fill_container"});const a=row(t,{gap:6});tx(a,o.n,{fontSize:14,fontWeight:"700"});if(o.crown)tx(a,"👑",{fontSize:11,fill:"#000000"});tag(a,o.kind||"claude","neutral",{mono:true});if(o.rk){rankDot(a,o.rk,9);if(o.ef)miniStars(a,o.ef)}wrap(t,o.where,{fontSize:12,fill:"$muted-foreground"});if(o.tool){const tl=row(t,{gap:4});ic(tl,"terminal",11,"$muted-foreground");tx(tl,o.tool,{fontFamily:M,fontSize:11,fill:"$muted-foreground"})}
const rr=col(r,{gap:4,alignItems:"end"});pill(rr,o.lbl||d[0],d[1],{sm:true,check:o.st==="done"});tx(rr,o.t,{fontSize:12,fontWeight:"600",fill:d[1]==="danger"?"$status-danger-fg":"$muted-foreground"});return r};
const SESS=[
 {rk:"senior",ef:2,n:"dev-a",e:"🦊",st:"waiting",lbl:"等你 · 審批",where:"atlas · 結帳流程改版 · dev",tool:"Edit package.json",t:"3 分 12 秒"},
 {rk:"senior",ef:2,n:"qa",e:"🐰",st:"error",kind:"codex",where:"beacon · API 速率限制 · qa",tool:"API 529 overloaded",t:"1 分"},
 {rk:"mid",ef:3,n:"dev-b",e:"🐱",st:"running",lbl:"執行 Bash",where:"atlas · 結帳流程改版 · dev",tool:"pnpm -C apps/web test -- cart",t:"1 分 08 秒"},
 {rk:"senior",ef:3,n:"backend",e:"🐻",st:"running",lbl:"執行 Edit",kind:"codex",where:"beacon · API 速率限制 · backend",tool:"src/limit.ts",t:"42 秒"},
 {rk:"visitor",ef:0,n:"codex",e:"🤖",st:"running",lbl:"執行 shell",kind:"codex",where:"atlas · 無任務 session",tool:"rg \"rateLimit\"",t:"12 秒"},
 {rk:"senior",ef:4,n:"leader",e:"👑",st:"writing",crown:0,where:"beacon · API 速率限制 · leader",t:"20 秒"},
 {rk:"senior",ef:3,n:"leader",e:"👑",st:"thinking",where:"atlas · 結帳流程改版 · leader",t:"2 分 40 秒"},
 {rk:"mid",ef:2,n:"frontend",e:"🐼",st:"thinking",where:"beacon · API 速率限制 · frontend",t:"35 秒"},
 {rk:"mid",ef:2,n:"claude",e:"🐧",st:"interrupted",where:"cedar · 無任務 session",t:"6 分前"},
 {rk:"senior",ef:2,n:"designer",e:"🎨",st:"done",where:"atlas · 雜務 chore-designer-1",t:"4 分前"},
 {rk:"junior",ef:1,n:"claude",e:"🐨",st:"done",where:"beacon · 無任務 session",t:"8 分前"},
 {rk:"mid",ef:2,n:"qa",e:"🐰",st:"idle",where:"atlas · 結帳流程改版 · qa",t:"閒置 25 分"}];
