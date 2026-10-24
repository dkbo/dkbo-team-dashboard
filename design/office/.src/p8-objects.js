const pg=page("office-objects",3080,0,1440,{});const body=pageBody(pg,{pad:[32,24,32,24]});
pageHeader(body,"building-2","頁面物件：辦公室當 dashboard 大廳","每個既有頁面一件 3D 物件；物件上方的 DOM 標籤顯示關鍵數字與燈號，點了開那頁。標籤沿用 AgentMarker 的膠囊與語意色");
const vig=(c,h,ox,oy,s)=>{const f=fr(c,{name:"vignette",layout:"none",width:"fill_container",height:h,fill:"$scene-sky",cornerRadius:14,clip:true});ISO.s=s;ISO.ox=ox;ISO.oy=oy;return f};
const tile=(f,x0,y0,x1,y1)=>quad(f,[x0,y0,0],[x1,y0,0],[x1,y1,0],[x0,y1,0],"$scene-floor",{name:"floor tile"});
const wallB=(f,x0,x1)=>quad(f,[x0,0,0],[x1,0,0],[x1,0,2.4],[x0,0,2.4],"$scene-wall-r",{name:"back wall"});
const spec=(c,rows)=>{const d=col(c,{name:"spec",width:"fill_container",gap:0});rows.forEach(([k,v],i)=>{const r=row(d,{name:"spec "+k,width:"fill_container",gap:10,alignItems:"start",padding:[8,0],stroke:i<rows.length-1?"$border":undefined,strokeWidth:i<rows.length-1?{bottom:1}:undefined});tx(r,k,{fontSize:12,fontWeight:"700",fill:"$muted-foreground",textGrowth:"fixed-width",width:36});wrap(r,v,{fontSize:12})});return d};
const variants=(c,title,fn)=>{const v=col(c,{name:"variants",width:"fill_container",gap:6});tx(v,title,{fontSize:11,fontWeight:"700",fill:"$muted-foreground"});const r=col(v,{name:"variant list",gap:6,width:"fill_container",alignItems:"start"});fn(r);return v};
const ocard=(r,title,route,icon)=>{const c=card(r,{name:"ObjectCard "+title,gap:12,padding:16});const h=row(c,{width:"fill_container",gap:8});ic(h,icon,16,"$brand-violet");tx(h,title,{fontSize:15,fontWeight:"800"});sp(h);tag(h,route,"neutral",{mono:true});return c};
let R=row(body,{name:"row1",width:"fill_container",gap:16,alignItems:"start"});
// 1 whiteboard
let c=ocard(R,"白板 → 任務詳情","/p/:project/t/:dir","list-checks");let f=vig(c,250,190,186,56);tile(f,-0.6,-0.4,2.6,1.6);whiteboard(f,0,0.5,{done:2,total:5});
let [sx,sy]=IS(0.9,0.56,1.75);boardLabel(f,sx,sy,{task:"結帳流程改版",done:2,total:5,below:false});
variants(c,"狀態（白板面＋標籤框同色；danger 優先於 warn）",r=>{boardLabel(r,0,0,{task:"API 速率限制",done:1,total:3,tone:"danger",chips:[["1 錯誤","danger","circle-alert"]],below:false,w:176});boardLabel(r,0,0,{task:"API 速率限制",done:1,total:3,tone:"warn",chips:[["ESCALATE","warn"]],below:false,w:176})});
variants(c,"compact（鏡頭 fit 全部時）",r=>{boardLabel(r,0,0,{task:"結帳流程改版",done:2,total:5,compact:1,below:false});boardLabel(r,0,0,{task:"API 速率限制",done:1,total:3,tone:"danger",chips:[["1 錯誤","danger","circle-alert"],["ESCALATE","warn"]],compact:1,below:false})});
spec(c,[["位置","每個任務桌群左前方一塊（桌群原點 +0.2, +5.6），朝鏡頭"],["數字","波 已關閉／計畫（waves_closed／waves_planned）；進度條一格一波：已關 ok、進行中 ok 40%、未開 muted"],["燈號","卡住（桌群有人等你／錯誤，或 BLOCKED／TIMEOUT 未解）＝danger；有未回的 ESCALATE＝warn；白板面改 status-X-soft、下緣色條 status-X"],["點擊","開任務詳情；hover 出 Tooltip「任務詳情 · 波 2 進行中」"]]);
// 2 monitor wall
c=ocard(R,"監控牆 → herdr","/herdr","monitor-play");f=vig(c,250,128,214,52);tile(f,-0.3,0,3.6,1.6);wallB(f,-0.3,3.6);monitorWall(f,0.2,3.2,[5]);
[sx,sy]=IS(1.7,0,2.3);objLabel(f,sx,sy,{icon:"monitor-play",page:"herdr",value:"14",unit:"pane",chip:"2 卡住",tone:"danger"});
variants(c,"狀態",r=>{objLabel(r,0,0,{icon:"monitor-play",page:"herdr",value:"14",unit:"pane"});objLabel(r,0,0,{icon:"monitor-play",page:"herdr",value:"—",unit:"herdr 離線",chip:"輪詢",tone:"warn"})});
variants(c,"compact",r=>{objLabel(r,0,0,{compact:1,icon:"monitor-play",page:"herdr",value:"14",unit:"pane",chip:"2 卡住",tone:"danger"})});
spec(c,[["位置","大廳後牆（x 20.6–23.6、離地 0.9–2.1），3 × 2 螢幕"],["數字","pane 數；卡住數（PaneStatus blocked，含等你／錯誤）＞0 才出 chip"],["燈號","卡住＞0＝danger（標籤框）；herdr 斷線輪詢＝warn；螢幕：每格對一個 pane，暗＝閒置（不用狀態色）"],["點擊","開 herdr 頁"]]);
// 3 meter
c=ocard(R,"茶水間電表 → 趨勢","/trends","zap");f=vig(c,250,230,206,52);tile(f,-2.0,-0.4,1.2,1.4);box(f,-1.8,0,0,1.5,0.6,0.9,DESK,{name:"pantry counter"});box(f,-1.6,0.08,0.9,0.45,0.36,0.45,{t:"$scene-monitor",l:"$scene-monitor",r:"$scene-monitor"},{name:"coffee machine (off)"});meter(f,0,0,true);
[sx,sy]=IS(0.25,0.15,1.6);objLabel(f,sx,sy,{icon:"zap-off",page:"趨勢",value:"$42.10",unit:"今日",chip:"跳電 · codex",tone:"warn"});
variants(c,"狀態",r=>{objLabel(r,0,0,{icon:"zap",page:"趨勢",value:"$42.10",unit:"今日 · 額度 37%"});objLabel(r,0,0,{icon:"zap",page:"趨勢",value:"$42.10",unit:"今日",chip:"額度 84%",tone:"warn"})});
variants(c,"compact",r=>{objLabel(r,0,0,{compact:1,icon:"zap",page:"趨勢",value:"$42.10"});objLabel(r,0,0,{compact:1,icon:"zap-off",page:"趨勢",value:"$42.10",chip:"跳電",tone:"warn"})});
spec(c,[["位置","休息區茶水台右側（14.0, 8.4），立柱＋電表箱"],["數字","今日花費（所有 kind 加總）＋最高額度 %（同 TopBar UsageChip 的最高項）"],["燈號","額度 ≥ 80%＝warn；任一 kind 熔斷＝「跳電」warn：斷路燈亮琥珀、錶面暗、咖啡機螢幕暗（不變紅，同 unify 熔斷規則）"],["點擊","開趨勢頁"]]);
R=row(body,{name:"row2",width:"fill_container",gap:16,alignItems:"start"});
// 4 archive
c=ocard(R,"檔案室 → 歷史","/history","archive");f=vig(c,250,110,190,50);tile(f,-0.3,-0.3,3.8,1.6);shelvesY(f,0,3.4,0);
[sx,sy]=IS(1.7,0.3,1.95);objLabel(f,sx,sy,{icon:"archive",page:"歷史",value:"23",unit:"已結案"});
variants(c,"狀態",r=>{objLabel(r,0,0,{icon:"archive",page:"歷史",value:"23",unit:"已結案",chip:"今天 +2"})});
variants(c,"compact",r=>{objLabel(r,0,0,{compact:1,icon:"archive",page:"歷史",value:"23",unit:"已結案"})});
spec(c,[["位置","大廳中段（x 20.5–23.9, y 4.2）一排書櫃，面向鏡頭"],["數字","已結案任務數（done＋abandoned）；今天有結案時加 neutral chip「今天 +N」"],["燈號","無（歷史不需要人處理）；書櫃格數不跟數字連動"],["點擊","開歷史頁"]]);
// 5 cabinet
c=ocard(R,"檔案櫃燈號 → git","/git","git-branch");f=vig(c,250,200,200,64);tile(f,-0.6,-0.4,1.5,1.3);cabinet(f,0,0,"$status-warn");
[sx,sy]=IS(0.4,0.3,1.5);objLabel(f,sx,sy,{icon:"git-branch",page:"git",value:"3",unit:"未推送",tone:"warn",lamp:"warn"});
variants(c,"狀態（櫃頂燈＝最嚴重的一項）",r=>{objLabel(r,0,0,{icon:"git-branch",page:"git",value:"乾淨",lamp:"idle"});objLabel(r,0,0,{icon:"git-branch",page:"git",value:"1",unit:"衝突",tone:"danger",lamp:"danger"})});
variants(c,"compact",r=>{objLabel(r,0,0,{compact:1,icon:"git-branch",page:"git",value:"3",chip:"未推送",tone:"warn",lamp:"warn"})});
spec(c,[["位置","大廳書櫃前（20.6, 6.4）"],["數字","所有 dashboard.config 專案加總：衝突數 → 未推送 commit 數 → 未提交檔數，只顯示最嚴重的一項"],["燈號","衝突＝danger（燈紅＋標籤框紅）；未推送／未提交／detached＝warn；乾淨＝燈熄（scene-lamp-off）、標籤無框"],["點擊","開 git 頁（有衝突時帶 ?project= 第一個衝突專案）"]]);
// 6 bulletin
c=ocard(R,"大廳公告板 → 總覽","/","layout-dashboard");f=vig(c,250,190,196,58);tile(f,-0.5,-0.5,2.1,1.2);bulletinStand(f,0,0);
[sx,sy]=IS(0.8,0.06,1.85);objLabel(f,sx,sy,{icon:"layout-dashboard",page:"總覽",value:"2",unit:"個任務進行中"});
variants(c,"狀態",r=>{objLabel(r,0,0,{icon:"layout-dashboard",page:"總覽",value:"2",unit:"個任務進行中",chip:"1 卡住",tone:"danger"});objLabel(r,0,0,{icon:"layout-dashboard",page:"總覽",value:"0",unit:"沒有進行中任務",dim:1})});
variants(c,"compact",r=>{objLabel(r,0,0,{compact:1,icon:"layout-dashboard",page:"總覽",value:"2",unit:"任務"})});
spec(c,[["位置","大廳前段立式軟木板（21.0, 11.4），入口地墊旁"],["數字","進行中任務數（status running／planning）"],["燈號","有任務卡住＝danger chip「N 卡住」；有 ESCALATE 沒卡住＝warn chip；0 個任務＝標籤 60% 透明"],["點擊","開總覽"]]);
// label anatomy
const an=card(body,{name:"LabelSpec",gap:14});cardHead(an,"物件標籤（ObjectLabel／TaskBoardLabel）樣式",null,{icon:"tag"});
const ar=row(an,{width:"fill_container",gap:24,alignItems:"start"});
const al=col(ar,{width:520,gap:14});
const ex=(t,fn)=>{const r=row(al,{width:"fill_container",gap:12,alignItems:"center"});tx(r,t,{fontSize:12,fontWeight:"700",fill:"$muted-foreground",textGrowth:"fixed-width",width:120});fn(r)};
ex("full · 一般",r=>objLabel(r,0,0,{icon:"archive",page:"歷史",value:"23",unit:"已結案"}));
ex("full · 異常",r=>objLabel(r,0,0,{icon:"monitor-play",page:"herdr",value:"14",unit:"pane",chip:"2 卡住",tone:"danger"}));
ex("full · 燈號",r=>objLabel(r,0,0,{icon:"git-branch",page:"git",value:"3",unit:"未推送",tone:"warn",lamp:"warn"}));
ex("compact（預設視角）",r=>{objLabel(r,0,0,{compact:1,icon:"monitor-play",page:"herdr",value:"14",unit:"pane",chip:"2 卡住",tone:"danger"});objLabel(r,0,0,{compact:1,icon:"archive",page:"歷史",value:"23"})});
ex("讓位",r=>{Insert(r,{type:"ellipse",name:"ObjectLabel yielded",width:12,height:12,fill:"$popover",stroke:"$status-danger",strokeWidth:2,effect:SH});tx(r,"與角色標記重疊時縮成點；點也壓到就隱藏",{fontSize:12,fill:"$muted-foreground"})});
ex("hover",r=>{const t=row(r,{name:"Tooltip",height:28,cornerRadius:10,fill:"$foreground",padding:[0,10],gap:6});tx(t,"開 herdr 頁 · 14 個 pane、2 個卡住",{fontSize:12,fontWeight:"600",fill:"$background"});ic(t,"arrow-up-right",12,"$background")});
const rl=col(ar,{width:"fill_container",gap:8});
["DOM 疊層（同 AgentMarker，decisions Q4）：高 marker-alert-h 28、radius-full、bg popover＋shadow-soft、inset-pill；圖示 icon-xs 14 brand-violet＋頁名 micro 粗 muted-foreground＋主數字 body-bold +num＋單位 caption muted-foreground。","異常時加框 border-w-pill status-X＋尾端 Tag（danger／warn），指向三角同框色；底色不變（不搶等你的實心紅）。燈號物件（git 櫃、電表）前面多一顆 dot（燈的顏色）。","密度（E2 定案）：預設視角（fit 全部）用 compact＝只留圖示＋主數字，有異常才加 chip；拉近到 ≥ fit 距離 × 0.8 才用 full；< 0.6 倍只留有異常的物件。","碰撞（E2 定案）：物件標籤與角色標記重疊時，物件標籤讓位——先縮成 12 圓點（popover 底＋語意色框），點也壓到就整個隱藏；角色標記互撞時，優先序低的縮成 8 色點（hover／選取中的人最優先，其次照 §1.2）。預設視角下任何標籤不得互相壓到或被 canvas 邊切掉。","白板標籤 TaskBoardLabel：full 寬 200、radius-lg、card-pad-sm 的 8／12；第一行任務名 caption-bold＋「波 2/5」caption-strong；第二行進度條（每段高 6、間距 3、radius-full）；第三行 chip。compact 一列：圖示＋「2/5」，有異常才加 chip（ESCALATE 縮成 18 圓「!」），不畫進度條。","層級：頁面物件標籤 z 低於 AgentMarker（角色優先），alert 標記永遠在最上；同一點多個標籤時物件標籤往上錯開 space-1。","互動：標籤與 3D 物件都可點（cursor-pointer）；hover 物件時 3D 物件外框 0.04 格 ring 色描邊＋Tooltip；標籤是 <a>（tab 可達，Enter 開頁），aria-label「herdr：14 個 pane，2 個卡住，開 herdr 頁」。⌘/Ctrl＋click 開新分頁。"].forEach(t=>{const r=row(rl,{width:"fill_container",gap:8,alignItems:"start"});dot(r,"info",6);wrap(r,t,{fontSize:12})});
OBJECTS=pg;
