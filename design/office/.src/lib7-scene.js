const AG=[
 {n:"leader",z:"A",x:1.85,y:2.65,st:"thinking",sh:"$shirt-2",crown:1,desk:["big",0.9,1.4]},
 {n:"dev-a",z:"A",x:4.3,y:2.55,st:"waiting",pose:"wave",sh:"$shirt-1",desk:["d",3.6,1.4]},
 {n:"dev-b",z:"A",x:6.1,y:2.55,st:"running",label:"Bash",pose:"type",sh:"$shirt-3",desk:["d",5.4,1.4]},
 {n:"qa",z:"A",x:7.9,y:2.55,st:"idle",pose:"nap",sh:"$shirt-4",dim:1,desk:["d",7.2,1.4]},
 {n:"",z:"A",desk:["d",3.6,4.4]},{n:"",z:"A",desk:["d",5.4,4.4]},
 {n:"leader",z:"B",x:11.95,y:2.65,st:"writing",sh:"$shirt-2",crown:1,desk:["big",11.0,1.4]},
 {n:"backend",z:"B",x:14.5,y:2.55,st:"running",label:"Edit",pose:"type",sh:"$shirt-4",desk:["d",13.8,1.4]},
 {n:"frontend",z:"B",x:16.3,y:2.55,st:"thinking",pose:"think",sh:"$shirt-1",desk:["d",15.6,1.4]},
 {n:"qa",z:"B",x:18.1,y:2.55,st:"error",pose:"slump",sh:"$shirt-3",desk:["d",17.4,1.4]},
 {n:"claude",z:"C",x:1.9,y:10.15,st:"interrupted",pose:"sit",sh:"$shirt-4",desk:["d",1.2,9.0]},
 {n:"codex",z:"C",x:3.9,y:10.15,st:"running",label:"shell",pose:"type",sh:"$shirt-1",desk:["d",3.2,9.0]},
 {n:"",z:"C",desk:["d",5.2,9.0]},{n:"",z:"C",desk:["d",7.2,9.0]},
 {n:"designer",z:"L",x:12.6,y:10.2,st:"done",pose:"coffee",sh:"$shirt-3"},
 {n:"claude",z:"L",x:17.6,y:10.0,st:"done",pose:"sit",sh:"$shirt-2"}
];
const scene=(cv,o={})=>{ISO.s=o.s||28;ISO.ox=o.ox;ISO.oy=o.oy;const sel=o.sel,hov=o.hov;
room(cv,20,14,{windows:[[2,4.5],[6,8.5],[12,14.5],[16,18.5]]});
zoneRug(cv,0.5,0.6,9.2,6.6);zoneRug(cv,10.3,0.6,9.2,6.6);zoneRug(cv,0.5,8.0,9.2,5.6,"$scene-zone");zoneRug(cv,10.3,8.0,9.2,5.6,"$scene-lounge");
fEll(cv,14.6,11.3,1.6,"$scene-couch-t",{opacity:0.35,name:"round rug"});
if(o.night)AG.forEach(a=>{if(a.desk&&a.st&&!["idle","done"].includes(a.st))fEll(cv,a.desk[1]+0.7,a.desk[2]+1.0,1.1,"$scene-screen-on",{opacity:0.16,name:"screen glow"})});
const items=[];
AG.forEach((a,i)=>{if(a.desk){const [t,dx,dy]=a.desk;const on=a.st&&!["idle","done"].includes(a.st)?"$scene-screen-on":"$scene-screen-off";items.push([dx+dy+(t==="big"?0.5:0.4),()=>t==="big"?bigDesk(cv,dx,dy,on):desk(cv,dx,dy,on)])}if(a.st){items.push([a.x+a.y,()=>{if(["waiting","error"].includes(a.st))alertRing(cv,a.x,a.y);if(sel===i)selRing(cv,a.x,a.y);const [sx,sy]=IS(a.x,a.y,a.pose==="sit"&&a.z==="L"?0.3:0);const h=chibi(cv,sx,sy,{k:o.k||1.1,pose:a.pose||"sit",shirt:a.sh,crown:a.crown,dim:a.dim&&!o.noDim,name:a.n});a.hx=h.x;a.hy=h.y}])}});
items.push([8.6+11.0,()=>{box(cv,11.0,8.6,0,2.2,0.7,0.9,DESK,{name:"pantry counter"});box(cv,11.3,8.7,0.9,0.5,0.4,0.5,{t:"$scene-monitor",l:"$scene-screen-off",r:"$scene-monitor"},{name:"coffee machine"});box(cv,12.2,8.75,0.9,0.35,0.35,0.35,{t:"#ffffff",l:"$scene-wall-r",r:"$scene-wall-top"},{name:"water"})}]);
items.push([16.5+9.4,()=>{box(cv,16.5,8.85,0,2.6,0.35,0.95,{t:"$scene-couch-t",l:"$scene-couch-l",r:"$scene-couch-r"},{name:"couch back"});box(cv,16.5,9.2,0,2.6,0.8,0.42,{t:"$scene-couch-t",l:"$scene-couch-l",r:"$scene-couch-r"},{name:"couch seat"})}]);
items.push([19.0+8.7,()=>plant(cv,18.9,8.6)]);items.push([0.7+13.0,()=>plant(cv,0.8,12.9)]);items.push([9.1+0.9,()=>plant(cv,9.0,0.9)]);
items.push([13.6+12.6,()=>{box(cv,13.9,11.0,0,1.0,0.6,0.35,DESK,{name:"coffee table"})}]);
items.sort((a,b)=>a[0]-b[0]).forEach(f=>f[1]());
if(!o.bare){zoneSign(cv,1.0,0.02,"atlas","結帳流程改版 · 波 3",{z:2.25,icon:"folder-kanban",tag:["4","neutral"]});
zoneSign(cv,10.8,0.02,"beacon","API 速率限制 · 波 2",{z:2.25,icon:"folder-kanban",tag:["4","neutral"]});
zoneSign(cv,0.02,8.4,"無任務 session",null,{z:2.25,icon:"laptop",tag:["2","neutral"]});
zoneSign(cv,10.4,8.05,"休息區",null,{icon:"coffee",tag:["2","neutral"]});
}if(!o.bare)AG.forEach((a,i)=>{if(!a.st)return;if(a.st==="idle"&&hov!==i)return;marker(cv,a.hx,a.hy-2,a.st,{label:a.label,mono:!!a.label})});
};
const hoverCard=(p,x,y,o)=>{const c=col(p,{name:"HoverCard",x,y,width:280,fill:"$popover",cornerRadius:20,padding:16,gap:10,effect:POP});const h=row(c,{name:"head",width:"fill_container",gap:10});avatar(h,o.emoji,"$accent",28);const t=col(h,{name:"who",gap:0,width:"fill_container"});const r1=row(t,{gap:6});tx(r1,o.name,{fontSize:14,fontWeight:"800"});tag(r1,o.kind,"neutral",{mono:true});tx(t,o.where,{fontSize:12,fill:"$muted-foreground"});
const r2=row(c,{name:"state",gap:8,width:"fill_container"});pill(r2,o.pill[0],o.pill[1]);sp(r2);tx(r2,o.timer,{fontSize:12,fontWeight:"600",fill:"$muted-foreground"});
if(o.tool){const tl=row(c,{name:"tool",width:"fill_container",fill:"$muted",cornerRadius:14,padding:[6,10],gap:6});ic(tl,"terminal",12,"$muted-foreground");tx(tl,o.tool,{fontFamily:M,fontSize:12})}
tx(c,"點一下看詳情",{fontSize:11,fill:"$muted-foreground"});return c};
const legend=(p,o={})=>{const c=col(p,{name:"Legend",x:o.x,y:o.y,width:o.w||300,fill:"$popover",cornerRadius:20,padding:14,gap:8,effect:POP});const h=row(c,{width:"fill_container",gap:6});ic(h,"info",14,"$muted-foreground");tx(h,"圖例",{fontSize:13,fontWeight:"800"});sp(h);ic(h,"chevron-down",14,"$muted-foreground");
[["waiting","等你回覆或審批",null],["error","這輪出錯停下",null],["thinking","思考中",null],["running","執行工具（顯示工具名）","Bash"],["writing","正在寫回覆",null],["interrupted","被中斷（10 分後轉閒置）",null],["done","完成，去休息區",null],["idle","閒置（只在 hover 顯示）",null]].forEach(([k,t,l])=>{const r=row(c,{name:"legend "+k,width:"fill_container",gap:10,height:30});const slot=fr(r,{name:"slot",layout:"none",width:96,height:30});marker(slot,48,34,k,{label:l,mono:!!l,scale:0.85});tx(r,t,{fontSize:12,fill:"$foreground"})});
tx(c,"紅圈＝要你處理；紫圈＝目前選取",{fontSize:11,fill:"$muted-foreground"});return c};
const SUB={waiting:["等你","danger"],error:["錯誤","danger"],interrupted:["中斷","warn"],running:["執行","ok"],writing:["回覆中","ok"],thinking:["思考中","ok"],done:["完成","ok"],idle:["閒置","idle"]};
const sessionRow=(p,o)=>{const d=SUB[o.st];const r=row(p,{name:"SessionRow "+o.n,width:"fill_container",padding:[10,12],gap:10,cornerRadius:14,fill:d[1]==="danger"?"$status-danger-soft":(o.sel?"$accent":undefined)});avatar(r,o.e||"🐱","$accent",28);const t=col(r,{gap:2,width:"fill_container"});const a=row(t,{gap:6});tx(a,o.n,{fontSize:14,fontWeight:"700"});if(o.crown)tx(a,"👑",{fontSize:11,fill:"#000000"});tag(a,o.kind||"claude","neutral",{mono:true});wrap(t,o.where,{fontSize:12,fill:"$muted-foreground"});if(o.tool){const tl=row(t,{gap:4});ic(tl,"terminal",11,"$muted-foreground");tx(tl,o.tool,{fontFamily:M,fontSize:11,fill:"$muted-foreground"})}
const rr=col(r,{gap:4,alignItems:"end"});pill(rr,o.lbl||d[0],d[1],{sm:true,check:o.st==="done"});tx(rr,o.t,{fontSize:12,fontWeight:"600",fill:d[1]==="danger"?"$status-danger-fg":"$muted-foreground"});return r};
const SESS=[
 {n:"dev-a",e:"🦊",st:"waiting",lbl:"等你 · 審批",where:"atlas · 結帳流程改版 · dev",tool:"Edit package.json",t:"3 分 12 秒"},
 {n:"qa",e:"🐰",st:"error",kind:"codex",where:"beacon · API 速率限制 · qa",tool:"API 529 overloaded",t:"1 分"},
 {n:"dev-b",e:"🐱",st:"running",lbl:"執行 Bash",where:"atlas · 結帳流程改版 · dev",tool:"pnpm -C apps/web test -- cart",t:"1 分 08 秒"},
 {n:"backend",e:"🐻",st:"running",lbl:"執行 Edit",kind:"codex",where:"beacon · API 速率限制 · backend",tool:"src/limit.ts",t:"42 秒"},
 {n:"codex",e:"🤖",st:"running",lbl:"執行 shell",kind:"codex",where:"atlas · 無任務 session",tool:"rg \"rateLimit\"",t:"12 秒"},
 {n:"leader",e:"👑",st:"writing",crown:0,where:"beacon · API 速率限制 · leader",t:"20 秒"},
 {n:"leader",e:"👑",st:"thinking",where:"atlas · 結帳流程改版 · leader",t:"2 分 40 秒"},
 {n:"frontend",e:"🐼",st:"thinking",where:"beacon · API 速率限制 · frontend",t:"35 秒"},
 {n:"claude",e:"🐧",st:"interrupted",where:"cedar · 無任務 session",t:"6 分前"},
 {n:"designer",e:"🎨",st:"done",where:"atlas · 雜務 chore-designer-1",t:"4 分前"},
 {n:"claude",e:"🐨",st:"done",where:"beacon · 無任務 session",t:"8 分前"},
 {n:"qa",e:"🐰",st:"idle",where:"atlas · 結帳流程改版 · qa",t:"閒置 25 分"}];
