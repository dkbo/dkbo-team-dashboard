const pg=page("office-identity",3080,3800,1440,{});const body=pageBody(pg,{pad:[32,24,32,24]});
pageHeader(body,"id-card","角色識別：職等、effort、找人","職等＝襯衫色（深到淺＝資深到初階）；effort＝頭頂 1–5 顆星；跟頭頂狀態標記疊在同一個 DOM 物件裡，不會打架");
let R=row(body,{name:"row1",width:"fill_container",gap:16,alignItems:"start"});
// ranks
const rk=card(R,{name:"Ranks",gap:12});cardHead(rk,"職等＝襯衫色","Kenney 角色的衣服貼圖換成四張職等色版本（每職等一份共用材質）；明度由深到淺，色弱也分得出階",{icon:"shirt"});
const rr=row(rk,{width:"fill_container",gap:12});
[["senior","資深","opus · gpt-5.5"],["mid","中階","sonnet"],["junior","初階","haiku · *-mini"],["visitor","訪客","讀不到 model／不在表上"]].forEach(([k,zh,m])=>{const c=col(rr,{name:"rank "+k,width:"fill_container",gap:6,alignItems:"center",fill:"$muted",cornerRadius:14,padding:[0,0,12,0]});const st=fr(c,{name:"stage",layout:"none",width:"fill_container",height:150});chibi(st,92,140,{k:2.0,pose:k==="visitor"?"stand":"stand",front:1,shirt:RANK[k].c,lanyard:k==="visitor"});const t=row(c,{gap:6});Insert(t,{type:"ellipse",name:"sw",width:12,height:12,fill:RANK[k].c,stroke:"$border",strokeWidth:1});tx(t,zh,{fontSize:14,fontWeight:"800"});tx(c,"rank-"+k,{fontSize:11,fontFamily:M,fill:"$muted-foreground"});wrap(c,m,{fontSize:11,fill:"$muted-foreground",textAlign:"center",width:"fill_container"})});
tbl(rk,[{l:"kind",w:90},{l:"model 規則（依序比對，第一個命中）"},{l:"職等",w:80}],[
 {c:[r=>tag(r,"claude","neutral",{mono:true}),"opus*",r=>rankTag(r,"senior")]},
 {c:[r=>tag(r,"claude","neutral",{mono:true}),"sonnet*",r=>rankTag(r,"mid")]},
 {c:[r=>tag(r,"claude","neutral",{mono:true}),"haiku*",r=>rankTag(r,"junior")]},
 {c:[r=>tag(r,"codex","neutral",{mono:true}),"*-mini、*-nano",r=>rankTag(r,"junior")]},
 {c:[r=>tag(r,"codex","neutral",{mono:true}),"*-codex（非 max）",r=>rankTag(r,"mid")]},
 {c:[r=>tag(r,"codex","neutral",{mono:true}),"gpt-5.5、gpt-*（旗艦，無後綴）、*-codex-max",r=>rankTag(r,"senior")]},
 {c:["其他","讀不到 model、未知 kind",r=>rankTag(r,"visitor")]}],{dense:true});
wrap(rk,"訪客另掛白色識別證（lanyard），不只靠顏色。hover 卡、詳情窗、清單用 RankTag 寫出文字「資深 · opus/medium」。",{fontSize:12,fill:"$muted-foreground"});
// effort
const ef=card(R,{name:"Effort",gap:12,width:440});cardHead(ef,"effort＝頭頂星數","EffortStars：5 格，實心＝等級；只在 hover／選取時出現；讀不到 effort 不畫",{icon:"star"});
[["low",1,"minimal、low"],["medium",2,"medium"],["high",3,"high"],["xhigh",4,"xhigh"],["max",5,"—"]].forEach(([k,n,cx])=>{const r=row(ef,{width:"fill_container",gap:12,height:30});effortStars(r,n,{flat:1});tx(r,k,{fontSize:13,fontWeight:"700",fontFamily:M});sp(r);tx(r,"codex："+cx,{fontSize:12,fill:"$muted-foreground"})});
fr(ef,{name:"divider",width:"fill_container",height:1,fill:"$border"});
["尺寸：高 14、radius-full、bg popover＋shadow-soft、左右 padding 5；星 8 × 8、間距 1.5；實心 accent-foreground，空格同色 22%。","不用 warn 琥珀當星色（會被讀成警告），也不用 ok 綠。","只在 hover／選取時畫（E11 定案），其他時候場景裡都不畫；找人清單、hover 卡、詳情窗、清單模式照常顯示星數。"].forEach(t=>{const r=row(ef,{width:"fill_container",gap:8,alignItems:"start"});dot(r,"info",6);wrap(r,t,{fontSize:12})});
// stacking
const sk=card(body,{name:"HeadStack",gap:12});cardHead(sk,"頭頂堆疊：狀態標記、星數、皇冠、事件「!」怎麼並存","同一個 CSS2D 物件內由下往上排；位置用固定間距，不靠避讓演算法",{icon:"layers"});
const sr=row(sk,{width:"fill_container",gap:12,alignItems:"start"});
const cell=(t,n,fn)=>{const c=col(sr,{name:"stack "+t,width:"fill_container",gap:6,fill:"$scene-sky",cornerRadius:14,padding:[0,0,12,0],clip:true});const st=fr(c,{name:"stage",layout:"none",width:"fill_container",height:220});fn(st);tx(c,t,{fontSize:13,fontWeight:"800",x:0});wrap(c,n,{fontSize:11,fill:"$muted-foreground",textAlign:"center",width:"fill_container"});};
const P=(st,o,stk)=>{const h=chibi(st,88,208,{k:2.2,pose:o.pose||"sit",front:1,shirt:RANK[o.rk].c,crown:o.crown,dim:o.dim});stk(h);};
cell("預設（沒 hover）","不畫星：頭 → 指向三角 → 標記",st=>P(st,{rk:"mid",pose:"type"},h=>headStack(st,h.x,h.y,"running",{label:"Bash"})));
cell("hover／選取","頭 → 星（3）→ 指向三角 → 標記",st=>P(st,{rk:"mid",pose:"type"},h=>headStack(st,h.x,h.y,"running",{ef:3,label:"Bash"})));
cell("領導 · 選取","皇冠 → 星 → 標記（整疊再高 space-2）",st=>P(st,{rk:"senior",crown:1,pose:"think"},h=>headStack(st,h.x,h.y,"thinking",{ef:4})));
cell("等你","alert 標記不縮、永遠置頂；沒 hover 不畫星",st=>P(st,{rk:"senior",pose:"wave"},h=>headStack(st,h.x,h.y,"waiting",{})));
cell("ESCALATE","「!」掛在標記左上角（-9, -9），不佔高度",st=>P(st,{rk:"senior",crown:1,pose:"think"},h=>headStack(st,h.x,h.y,"writing",{bang:1})));
cell("事件 bubble","EventBubble 在頭部右側，與標記不同列",st=>P(st,{rk:"mid",pose:"thumb"},h=>{headStack(st,h.x,h.y,"done",{});emote(st,h.x+30,h.y+4,"👍","通過","ok")}));
cell("閒置／讓位","閒置：全不畫（hover 才出）；互撞或 < 0.6 倍：縮成色點",st=>{P(st,{rk:"junior",pose:"nap",dim:1},h=>{});Insert(st,{type:"ellipse",name:"far dot",x:150,y:40,width:8,height:8,fill:"$status-ok"});tx(st,"遠景",{x:140,y:52,fontSize:10,fill:"$muted-foreground"})});
// finder
const fd=card(body,{name:"Finder",gap:12});cardHead(fd,"找人清單（FinderPanel，取代左上「需要你」）","分組＝需要你／工作中／完成 · 中斷 · 閒置；篩選＝專案、任務、角色；點一列＝選取＋鏡頭飛過去（motion-camera-fly）",{icon:"users"});
const fr2=row(fd,{width:"fill_container",gap:16,alignItems:"start"});
const s1=fr(fr2,{name:"finder expanded",layout:"none",width:320,height:620});finder(s1,0,0,{});
const s2=fr(fr2,{name:"finder filtered",layout:"none",width:320,height:620});
{const c=col(s2,{name:"FinderPanel filtered",x:0,y:0,width:304,fill:"$popover",cornerRadius:20,padding:[12,8,8,8],gap:2,effect:POP});const h=row(c,{width:"fill_container",padding:[0,8,6,8],gap:8});ic(h,"users",16,"$brand-violet");tx(h,"找人",{fontSize:14,fontWeight:"800"});tag(h,"3 / 12");sp(h);tx(h,"清除",{fontSize:12,fontWeight:"600",fill:"$primary"});
 const fl=row(c,{width:"fill_container",padding:[0,8,6,8],gap:6});fChip(fl,"專案","atlas");fChip(fl,"任務");fChip(fl,"角色","dev");fr(c,{width:"fill_container",height:1,fill:"$border"});
 fGroup(c,"需要你","danger",1,true);findRow(c,FIND[0]);fGroup(c,"工作中","ok",1,true);findRow(c,FIND[2]);fGroup(c,"完成 · 中斷 · 閒置","neutral",1,false);
 const dd=col(s2,{name:"Select 任務 (open)",x:96,y:96,width:220,fill:"$popover",cornerRadius:14,padding:6,gap:2,effect:POP,stroke:"$border",strokeWidth:1});[["全部任務",1],["結帳流程改版",0,"atlas · 4"],["無任務 session",0,"atlas · 1"]].forEach(([t,on,sub])=>{const r=row(dd,{width:"fill_container",height:32,cornerRadius:10,padding:[0,10],gap:8,fill:on?"$accent":undefined});tx(r,t,{fontSize:13,fontWeight:"600",fill:on?"$accent-foreground":"$foreground"});sp(r);if(sub)tx(r,sub,{fontSize:11,fill:"$muted-foreground"});if(on)ic(r,"check",14,"$accent-foreground")})}
const s3=col(fr2,{name:"collapsed + rules",width:"fill_container",gap:12});const s3f=fr(s3,{name:"finder collapsed",layout:"none",width:320,height:190});finder(s3f,0,0,{collapsed:1});
["展開／收合：canvas 寬 ≥ 1200（沒開詳情窗）預設展開，否則收合成「需要你」一組（等於原 NeedsYouOverlay）；使用者切過就記 localStorage。","高度上限＝canvas 高 − Legend chip − 3 × overlay-inset，內部捲動；組標題 sticky。","篩選只縮清單、不改場景（場景篩選仍是工具列的 kind／專案）；任務選單只列目前專案範圍內的任務＋「無任務」；角色選單列 leader、dev、qa、reviewer、designer…（現場有的才列）。","列：頭像 24＋職等色點 10（右下）＋細狀態 dot＋名字＋星（7）＋[!]；第二行「專案 · 任務 · 細狀態／計時」，需要你那組用 status-danger-fg。","點列＝選取＋鏡頭飛過去；角色在別層樓時先切樓層再飛。鍵盤：f 聚焦清單，↑↓ 移動，Enter 飛過去。","「完成 · 中斷 · 閒置」預設收合；底部「N 位已下班 · 顯示」。"].forEach(t=>{const r=row(s3,{width:"fill_container",gap:8,alignItems:"start"});dot(r,"info",6);wrap(r,t,{fontSize:12})});
IDENT=pg;
