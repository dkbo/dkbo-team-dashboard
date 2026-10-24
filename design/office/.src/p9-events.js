const pg=page("office-events",3080,2100,1440,{});const body=pageBody(pg,{pad:[32,24,32,24]});
pageHeader(body,"clapperboard","角色互動事件：分鏡","資料來自 dk-status：waves[]（review spawned／verdict、wave-close）、messages（ESCALATE）、task close；只在即時收到時播，載入或切回分頁不重播歷史");
const isoLine=(p,pts,o={})=>{const P=pts.map(q=>IS(...q));const xs=P.map(q=>q[0]),ys=P.map(q=>q[1]);const x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x0),h=Math.max(1,Math.max(...ys)-y0);return Insert(p,{type:"path",name:o.name||"walk path",x:x0,y:y0,width:w,height:h,viewBox:[0,0,w,h],geometry:"M"+P.map(q=>(q[0]-x0).toFixed(1)+" "+(q[1]-y0).toFixed(1)).join(" L"),stroke:o.c||"$status-info",strokeWidth:o.sw||2.5,opacity:o.op})};
const footDot=(p,x,y,c)=>fEll(p,x,y,0.18,c||"$status-info",{name:"waypoint"});
// cluster: leader (0.95,1.25) big desk (0,0); dev-a desk (2.4,0) char (3.1,1.15); dev-b desk (4.0,0) char (4.7,1.15); reviewer desk (4.0,2.8) char (4.7,2.55 seated facing back); board (0.1,3.0)
const cluster=(f,o={})=>{tile2(f);const it=[];it.push([0.5,()=>bigDesk(f,0,0,"$scene-screen-on")]);it.push([2.8,()=>desk(f,2.4,0,"$scene-screen-on")]);it.push([4.4,()=>desk(f,4.0,0,"$scene-screen-on")]);it.push([7.2,()=>desk(f,4.0,2.8,o.revAway?"$scene-screen-off":"$scene-screen-on")]);
 it.push([4.0,()=>whiteboard(f,0.1,3.0,{tone:o.bt,done:o.done??2,total:5})]);
 (o.chars||[]).forEach(c=>it.push([c.x+c.y,()=>{const [sx,sy]=IS(c.x,c.y,0);const h=chibi(f,sx,sy,{k:1.25,pose:c.pose,shirt:RANK[c.rk||"mid"].c,crown:c.crown,name:c.n});c.hx=h.x;c.hy=h.y}]));
 it.sort((a,b)=>a[0]-b[0]).forEach(x=>x[1]());return o.chars};
const tile2=(f)=>{quad(f,[-0.4,-0.4,0],[6.0,-0.4,0],[6.0,4.6,0],[-0.4,4.6,0],"$scene-zone",{name:"zone"})};
const panel=(r,n,title,key)=>{const c=card(r,{name:"Event "+n,padding:0,gap:0});const h=row(c,{width:"fill_container",padding:[14,16,10,16],gap:8});const b=row(h,{width:22,height:22,cornerRadius:999,fill:"$accent",justifyContent:"center"});tx(b,String(n),{fontSize:12,fontWeight:"800",fill:"$accent-foreground"});tx(h,title,{fontSize:15,fontWeight:"800"});sp(h);tag(h,key,"neutral",{mono:true});const f=fr(c,{name:"stage",layout:"none",width:"fill_container",height:270,fill:"$scene-sky",clip:true});ISO.s=40;ISO.ox=205;ISO.oy=96;const sp2=col(c,{name:"spec",width:"fill_container",padding:[12,16,16,16],gap:6});return {f,s:sp2}};
const line=(c,k,v,o={})=>{const r=row(c,{width:"fill_container",gap:10,alignItems:"start"});tx(r,k,{fontSize:12,fontWeight:"700",fill:o.c||"$muted-foreground",textGrowth:"fixed-width",width:52});wrap(r,v,{fontSize:12,fill:o.c?"$foreground":"$foreground"})};
const BL=(f,o)=>{const [x,y]=IS(1.0,3.06,1.75);boardLabel(f,x-28,y,{task:"結帳流程改版",total:5,below:false,w:150,...o})};
let R=row(body,{name:"row1",width:"fill_container",gap:16,alignItems:"start"});
// 1 reviewer dispatched
let P=panel(R,1,"reviewer 出動","review N spawned");
let ch=cluster(P.f,{revAway:1,chars:[{n:"leader",x:0.95,y:1.25,pose:"sit",rk:"senior",crown:1},{n:"dev-a",x:3.1,y:1.15,pose:"type",rk:"senior"},{n:"dev-b",x:4.7,y:1.15,pose:"type",rk:"mid"},{n:"reviewer",x:1.7,y:3.55,pose:"clip",rk:"senior"}]});
isoLine(P.f,[[4.7,3.75,0],[3.4,3.75,0],[3.4,3.6,0],[1.9,3.6,0]]);footDot(P.f,4.7,3.75);isoLine(P.f,[[4.7,3.75,0],[3.6,3.75,0],[3.6,1.9,0]],{op:0.4,c:"$muted-foreground"});footDot(P.f,3.6,1.9,"$muted-foreground");
BL(P.f,{done:2});emote(P.f,ch[3].hx+14,ch[3].hy-30,"🔍","審查 波 3","info");
const t1=row(P.f,{x:206,y:228,height:22,cornerRadius:999,fill:"$popover",padding:[0,8],gap:4,opacity:0.9});tx(t1,"淡線＝只有 1 位 dev 時走到他桌邊",{fontSize:11,fill:"$muted-foreground"});
line(P.s,"觸發","waves[N].review_spawned_at（dk-status 事件 review N spawned）");line(P.s,"動作","reviewer 起身 walk：本波 dev ≥ 2 → 走到任務白板前（實線）；只有 1 位 dev → 走到該 dev 桌右側（淡線）；到了改 clip（拿板子）站著面向目標");line(P.s,"時長","走路 ≤ 4 秒（超過就加速），停留到 verdict；座位螢幕暗");line(P.s,"DOM","EventBubble info「🔍 審查 波 N」顯示 3 秒；之後 reviewer 的細狀態標記照常");
// 2 pass
P=panel(R,2,"審查通過","review N verdict（無 Important）");
ch=cluster(P.f,{chars:[{n:"leader",x:0.95,y:1.25,pose:"sit",rk:"senior",crown:1},{n:"dev-a",x:3.1,y:1.15,pose:"thumb",rk:"senior"},{n:"dev-b",x:4.7,y:1.15,pose:"thumb",rk:"mid"},{n:"reviewer",x:2.8,y:3.6,pose:"walk",rk:"senior"}]});
isoLine(P.f,[[2.8,3.6,0],[3.4,3.75,0],[4.7,3.75,0]]);footDot(P.f,4.7,3.75);BL(P.f,{done:2});
emote(P.f,ch[1].hx+12,ch[1].hy-36,"👍","通過","ok");emote(P.f,ch[2].hx+12,ch[2].hy-36,"👍","通過","ok");
line(P.s,"觸發","waves[N].review_verdict_at，verdict 無 Important（或 skipped）");line(P.s,"動作","本波每位 dev 比讚（thumb，1.5 秒）；reviewer walk 回座位、坐下轉回自己的細狀態");line(P.s,"時長","比讚 1.5 秒＋bubble 3 秒");line(P.s,"DOM","dev 頭旁 EventBubble ok「👍 通過」");
// 3 fix
P=panel(R,3,"審查要修","review N verdict（Important K）");
ch=cluster(P.f,{chars:[{n:"leader",x:0.95,y:1.25,pose:"sit",rk:"senior",crown:1},{n:"dev-a",x:3.1,y:1.15,pose:"down",rk:"senior"},{n:"dev-b",x:4.7,y:1.15,pose:"type",rk:"mid"},{n:"reviewer",x:2.8,y:3.6,pose:"walk",rk:"senior"}]});
isoLine(P.f,[[2.8,3.6,0],[3.4,3.75,0],[4.7,3.75,0]]);footDot(P.f,4.7,3.75);BL(P.f,{done:2});
emote(P.f,ch[1].hx+12,ch[1].hy-36,"😓","要修 2 條","warn");
line(P.s,"觸發","verdict 有 Important K > 0；被點名的 dev（BUG 收件人）垂頭，其他 dev 不動");line(P.s,"動作","dev 垂頭＋汗滴（down，2 秒）後回到工作姿勢；reviewer 回座");line(P.s,"時長","2 秒＋bubble 3 秒");line(P.s,"DOM","EventBubble warn「😓 要修 K 條」（不是 danger：不用人處理，領導會轉 BUG）");
R=row(body,{name:"row2",width:"fill_container",gap:16,alignItems:"start"});
// 4 escalate
P=panel(R,4,"ESCALATE","messages type=ESCALATE");
ch=cluster(P.f,{bt:"warn",chars:[{n:"leader",x:0.95,y:1.25,pose:"think",rk:"senior",crown:1},{n:"dev-a",x:3.1,y:1.15,pose:"sit",rk:"senior"},{n:"dev-b",x:4.7,y:1.15,pose:"type",rk:"mid"},{n:"reviewer",x:4.7,y:3.75,pose:"sit",rk:"senior"}]});
BL(P.f,{done:2,tone:"warn",chips:[["ESCALATE","warn"]]});headStack(P.f,ch[0].hx,ch[0].hy,"thinking",{bang:1});
line(P.s,"觸發","任務 messages 出現 ESCALATE、且之後沒有對應的 DECISION／ruling");line(P.s,"動作","領導頭上標記左上角出 EventBadge「!」（warn 圓 20），進場彈一下（scale 0 → 1.15 → 1，300ms）；白板面變 status-warn-soft，標籤 chip ESCALATE");line(P.s,"持續","直到 DECISION 落地才消失（不是 3 秒就走）");line(P.s,"DOM","找人清單該 leader 名字旁同一顆「!」");
// 5 wave close
P=panel(R,5,"波關閉","wave-close N");
ch=cluster(P.f,{done:3,chars:[{n:"leader",x:0.95,y:1.25,pose:"sit",rk:"senior",crown:1},{n:"dev-a",x:3.1,y:1.15,pose:"sit",rk:"senior"},{n:"dev-b",x:4.7,y:1.15,pose:"sit",rk:"mid"},{n:"reviewer",x:4.7,y:3.75,pose:"sit",rk:"senior"}]});
BL(P.f,{done:3,flash:2});{const [a,b]=IS(1.0,3.0,2.0);const sg=fr(P.f,{name:"sparkle",layout:"none",x:a-40,y:b-50,width:80,height:30});[[4,10,10],[34,0,12],[64,14,9]].forEach(([x,y,s])=>Insert(sg,{type:"path",name:"spark",x,y,width:s,height:s,viewBox:[0,0,10,10],geometry:STARP,fill:"$brand-violet"}))}
emote(P.f,ch[0].hx+30,ch[0].hy-10,"✅","波 3 關閉","ok");
line(P.s,"觸發","dk-status wave-close N（waves_closed +1）");line(P.s,"動作","白板進度條第 N 格由 40% 填滿（600ms 由左往右掃），格子外框閃一次 status-ok-fg；白板上方 3 顆星點；領導點頭");line(P.s,"時長","600ms＋星點 1.2 秒");line(P.s,"DOM","標籤「波 2/5」→「波 3/5」數字翻轉；EventBubble ok「✅ 波 N 關閉」掛在領導旁");
// 6 task close
P=panel(R,6,"任務結案","task close（close_result）");
ch=cluster(P.f,{done:5,chars:[{n:"leader",x:0.95,y:1.45,pose:"jump",rk:"senior",crown:1},{n:"dev-a",x:3.1,y:1.35,pose:"jump",rk:"senior"},{n:"dev-b",x:4.7,y:1.35,pose:"jump",rk:"mid"},{n:"reviewer",x:4.7,y:3.6,pose:"jump",rk:"senior"}]});
BL(P.f,{done:5,closed:1});
{const C=["$brand-blue","$brand-violet","$brand-coral","$shirt-3","$brand-blue","$brand-violet"];for(let i=0;i<26;i++){Insert(P.f,{type:"rectangle",name:"confetti",x:30+(i*53)%400,y:14+(i*37)%120,width:6,height:10,cornerRadius:1.5,fill:C[i%6],rotation:(i*47)%90-45,opacity:0.85})}}
line(P.s,"觸發","task close（close_result done）；abandoned 不慶祝，只把白板標成「已放棄」idle");line(P.s,"動作","桌群全員站起 jump ×2＋彩帶 3 秒（brand 三色，不用狀態色）；白板標籤「🎉 結案 ✓」");line(P.s,"之後","10 分鐘後桌群收掉：還開著的 session 移到散座區，白板與區牌消失（同 Q7 的 10 分鐘窗口）");
// rules
R=row(body,{name:"rules row",width:"fill_container",gap:16,alignItems:"start"});
const ru=card(R,{name:"EventRules",gap:10,width:520});cardHead(ru,"事件規則",null,{icon:"list-ordered"});
["只播即時事件：SSE 推進來、ts 在 10 秒內的才播動畫；首次載入、重連、背景分頁切回時直接畫最終狀態（白板格數、! 是否在），不補播。","每個角色一條事件佇列，依 ts 依序播；同一角色 30 秒內超過 3 個事件只播最後一個。","細狀態優先：等你／錯誤的角色不起身、不比讚，只出 EventBubble；事件播完回到細狀態該有的姿勢與位置。","reviewer 走路中途若變成等你：立即停在原地揮手（不走回去），標記照等你規則。","EventBubble 與 AgentMarker 不疊：bubble 放在頭部右側 space-4，碰邊翻左；同時最多 1 顆。","每個事件同步寫進隱藏 live region（polite）：「atlas 結帳流程改版：波 3 審查通過」。","這些動畫是 on-demand render 唯一會主動要求連續幀的來源（§4.7）：事件開始時 start、全部播完 stop。"].forEach(t=>{const r=row(ru,{width:"fill_container",gap:8,alignItems:"start"});dot(r,"info",6);wrap(r,t,{fontSize:12})});
const rm=card(R,{name:"ReducedMotion",gap:10});cardHead(rm,"prefers-reduced-motion 的退化",null,{icon:"accessibility"});
tbl(rm,[{l:"事件",w:110},{l:"一般",w:170},{l:"reduced motion"}],[
 {c:["reviewer 出動","走到白板／dev 桌邊","不走：直接出現在目的地（淡入 0ms），座位留空"]},
 {c:["審查通過","比讚 1.5 秒＋回座","不比讚；只出 bubble「👍 通過」6 秒；reviewer 直接回到座位"]},
 {c:["審查要修","垂頭 2 秒","不垂頭；bubble「😓 要修 K 條」6 秒"]},
 {c:["ESCALATE","「!」彈入","「!」直接出現，不彈"]},
 {c:["波關閉","進度格掃入＋星點","格子直接填滿，無星點；bubble 6 秒"]},
 {c:["任務結案","跳＋彩帶","不跳、無彩帶；白板標籤「🎉 結案 ✓」＋bubble 6 秒"]}],{dense:true});
wrap(rm,"bubble 停留在 reduced motion 加長到 6 秒（沒有動作提示，靠文字）；live region 播報兩種模式都有。",{fontSize:12,fill:"$muted-foreground"});
EVENTS=pg;
