const pg=page("office-states",0,1000,1440,{});const body=pageBody(pg,{pad:[32,24,32,24]});
const hd=pageHeader(body,"sparkles","細狀態 × 角色動作 × 頭頂標記","8 種細狀態；標記色只用五種語意色。紅色兩種（等你、錯誤）一定要一眼看到");
const pr=row(hd,{gap:6});tx(pr,"優先序",{fontSize:12,fontWeight:"700",fill:"$muted-foreground"});["等你","錯誤","中斷","執行","回覆","思考","完成","閒置"].forEach((t,i)=>{tag(pr,t,i<2?"danger":(i===2?"warn":(i<7?"ok":"neutral")))});
const S=[
 {k:"waiting",zh:"等你",en:"waiting for you",tone:"danger",pose:"wave",stand:1,act:"站起來、轉向鏡頭揮手（Kenney wave 迴圈）",mk:"實心紅膠囊「等你」＋地面紅色雙圈脈動（1.6s）",pos:"留在自己座位旁（站著）",rule:"永遠在最上層、不隨距離縮小（最小高 28）；在畫面外時畫面邊緣出現紅色方向箭頭"},
 {k:"error",zh:"錯誤",en:"error",tone:"danger",pose:"slump",act:"趴在桌上、頭上冒一縷紅煙",mk:"實心紅「錯誤」＋地面紅圈（不脈動）",pos:"自己座位",rule:"同「等你」置頂；hover 卡顯示錯誤原文第一行（mono）"},
 {k:"interrupted",zh:"中斷",en:"interrupted",tone:"warn",pose:"sit",act:"坐著，雙手停在鍵盤上方不動",mk:"琥珀淡底「■ 中斷」",pos:"自己座位",rule:"10 分鐘沒新動作就轉成閒置"},
 {k:"running",zh:"執行工具",en:"running tool",tone:"ok",pose:"type",act:"打字（interact 迴圈），螢幕往上捲程式碼",mk:"線框膠囊＋工具名（mono，Bash／Edit／Read…，最多 12 字）",pos:"自己座位",rule:"subagent 執行中加 Tag「×2」表示並行數"},
 {k:"writing",zh:"寫回覆",en:"writing reply",tone:"ok",pose:"type",act:"慢速打字＋點頭",mk:"線框膠囊「✎ 回覆中」",pos:"自己座位",rule:"—"},
 {k:"thinking",zh:"思考中",en:"thinking",tone:"ok",pose:"think",act:"手托下巴、頭左右輕擺",mk:"思考泡泡，三點依序淡入淡出（1.2s）",pos:"自己座位",rule:"讀工具結果也算思考"},
 {k:"done",zh:"完成",en:"done",tone:"ok",pose:"coffee",stand:1,act:"起身走去休息區（walk），拿咖啡站著或坐沙發",mk:"綠淡底「✓ 完成」",pos:"休息區",rule:"10 分鐘後轉閒置、走回座位"},
 {k:"idle",zh:"閒置",en:"idle",tone:"idle",pose:"nap",act:"在座位打盹：頭低、身體慢呼吸縮放，螢幕暗、角色 55% 透明",mk:"預設不顯示；hover 才出灰「☾ 閒置」",pos:"自己座位",rule:"閒置超過 2 小時視為下班：不畫，工具列顯示「N 位已下班」"}
];
const grid=col(body,{name:"StateGrid",width:"fill_container",gap:16});let r;
S.forEach((s,i)=>{if(i%4===0)r=row(grid,{name:"row",width:"fill_container",gap:16,alignItems:"start"});const c=card(r,{name:"StateCard "+s.k,padding:0,gap:0});
const st=fr(c,{name:"closeup",layout:"none",width:"fill_container",height:230,fill:s.k==="done"?"$scene-lounge":"$scene-sky",clip:true});
ISO.s=46;ISO.ox=168;ISO.oy=118;quad(st,[0,0,0],[3,0,0],[3,3,0],[0,3,0],s.k==="done"?"$scene-couch-t":"$scene-floor",{name:"tile",opacity:s.k==="done"?0.5:1});
if(["waiting","error"].includes(s.k)){fEll(st,1.5,1.5,s.k==="waiting"?1.25:0.9,"$status-danger",{opacity:0.14});fEll(st,1.5,1.5,0.85,undefined,{stroke:"$status-danger",sw:3});if(s.k==="waiting")fEll(st,1.5,1.5,1.25,undefined,{stroke:"$status-danger",sw:2,opacity:0.4})}
const [sx,sy]=IS(1.5,1.5,0);
if(!s.stand){box(st,1.85,0.2,0,1.0,1.1,0.55,DESK,{name:"side desk"});const mon=fr(st,{name:"screen",x:sx+44,y:sy-112,width:58,height:42,cornerRadius:6,fill:"$scene-monitor",padding:6,layout:"vertical",gap:4});const on=s.k!=="idle";[34,22,40,18].forEach((w,j)=>Insert(mon,{type:"rectangle",name:"code",width:w,height:3,cornerRadius:2,fill:on?(j%2?"$scene-screen-on":"#7ee0b5"):"$scene-screen-off",opacity:s.k==="interrupted"&&j>1?0.3:1}))}
const h=chibi(st,sx,sy+10,{k:2.4,pose:s.pose,front:1,shirt:["$shirt-1","$shirt-3","$shirt-4","$shirt-2"][i%4],dim:s.k==="idle",mouth:s.k==="waiting"?"o":undefined});
if(s.k==="error"){Insert(st,{type:"ellipse",name:"smoke",x:sx-6,y:h.y-30,width:14,height:14,fill:"$status-danger",opacity:0.35});Insert(st,{type:"ellipse",name:"smoke",x:sx+4,y:h.y-44,width:10,height:10,fill:"$status-danger",opacity:0.2})}
if(s.k==="idle")tx(st,"z z",{x:sx+22,y:h.y-6,fontSize:16,fontWeight:"800",fill:"$status-idle"});
marker(st,sx,h.y-(s.k==="error"?44:4),s.k,{scale:1.25,label:s.k==="running"?"Bash":undefined,mono:s.k==="running"});
if(s.k==="idle"){tx(st,"（hover 時）",{x:sx-130,y:h.y-28,fontSize:11,fill:"$muted-foreground"})}
const b=col(c,{name:"spec",width:"fill_container",padding:16,gap:10});const t=row(b,{width:"fill_container",gap:8});tx(t,s.zh,{fontSize:16,fontWeight:"800"});tag(t,s.en,"neutral",{mono:true});sp(t);pill(t,s.tone,s.tone,{sm:true,check:s.k==="done"});
dl(b,[["動作",rr=>wrap(rr,s.act,{fontSize:12,textAlign:"right",width:210})],["標記",rr=>wrap(rr,s.mk,{fontSize:12,textAlign:"right",width:210})],["位置",rr=>tx(rr,s.pos,{fontSize:12})]]);
wrap(b,s.rule,{fontSize:12,fill:s.tone==="danger"?"$status-danger-fg":"$muted-foreground",fontWeight:s.tone==="danger"?"600":"400"})});
const note=card(body,{name:"Notes",gap:10});cardHead(note,"標記共通規則",null,{icon:"tag"});
["標記是 DOM 疊層（three.js CSS2DRenderer），不是 3D 貼圖：字清楚、吃 token、亮暗自動換色、可被螢幕報讀（每個標記 aria-label＝「dev-a，等你審批，3 分 12 秒」）。","尺寸：一般 24 高（StatusPill 尺寸），紅色兩種 28 高＋shadow-pop；鏡頭拉遠時一般標記縮到 0.8、低於 0.6 倍時只留色點，紅色永遠不縮。","同一位置重疊時依優先序只畫最上面一個；被家具遮住的紅色標記仍置頂（depthTest 關閉）。","prefers-reduced-motion：角色停在該狀態的關鍵影格（揮手停在舉手、打字停在手放鍵盤），脈動圈改成靜態雙圈。"].forEach(t=>{const rr=row(note,{width:"fill_container",gap:8,alignItems:"start"});dot(rr,"info",6);wrap(rr,t,{fontSize:13})});
STATES=pg;
