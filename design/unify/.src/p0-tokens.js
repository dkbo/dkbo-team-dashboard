const C=(l,d)=>({type:"color",value:[{value:l,theme:{mode:"light"}},{value:d,theme:{mode:"dark"}}]});
SetVariables({
background:C("#eef0fb","#1e2142"),foreground:C("#1d2045","#eceeff"),card:C("#ffffff","#282b55"),popover:C("#ffffff","#2e3260"),
muted:C("#f3f4fc","#31356a"),"muted-foreground":C("#565b82","#aeb2dc"),accent:C("#ece8ff","#3a3577"),"accent-foreground":C("#3d2c8a","#e0d9ff"),
secondary:C("#f1edff","#353a6e"),primary:C("#5b8cff","#5b8cff"),"primary-foreground":C("#10163a","#0f1433"),
border:C("#e2e5f5","#aab4ff1a"),input:C("#d6daf0","#aab4ff29"),ring:C("#7b5cff","#7b5cff"),"soft-shadow":C("#505ab433","#080a1e8c"),
topbar:C("#eef0fbe6","#1e2142e6"),"seg-active":C("#ffffff","#353a6e"),field:C("#ffffff","#aab4ff0d"),
"brand-blue":C("#5b8cff","#5b8cff"),"brand-violet":C("#7b5cff","#7b5cff"),"brand-coral":C("#ff5a6e","#ff5a6e"),
"status-danger":C("#e0434f","#ff6b7f"),"status-danger-fg":C("#c62a44","#ff8a9a"),"status-danger-soft":C("#fbe5e6","#46345b"),
"status-warn":C("#b07800","#e9a520"),"status-warn-fg":C("#8a5300","#ffc76b"),"status-warn-soft":C("#fcf2e0","#433c4e"),
"status-ok":C("#1a9a74","#2cb68a"),"status-ok-fg":C("#0f7a5a","#5fdcae"),"status-ok-soft":C("#e1f5ef","#293e5c"),
"status-idle":C("#7a7fa8","#7d82b0"),"status-idle-fg":C("#565b82","#aeb2dc"),"status-idle-soft":C("#efeff5","#343762"),
"status-info":C("#7b5cff","#7b5cff"),"status-info-fg":C("#5b3fd9","#b9a8ff"),"status-info-soft":C("#ede8ff","#34326d"),
"chart-1":C("#3d8fe0","#4290e2"),"chart-2":C("#f0804f","#dc6a3c"),"chart-3":C("#2cb68a","#1a9e74"),"chart-4":C("#e9a520","#c4880f"),"chart-5":C("#de7fb0","#d0659a"),"chart-6":C("#7a6ad8","#8a7ce6"),
"terminal-bg":{type:"color",value:"#0b0b10"},"terminal-chrome":{type:"color",value:"#17171f"},"terminal-line":{type:"color",value:"#26262f"},"terminal-fg":{type:"color",value:"#e4e4e7"},"terminal-dim":{type:"color",value:"#8b8b96"},
"grad-ok-from":{type:"color",value:"#157f5f"},"grad-ok-to":{type:"color",value:"#0e6b50"},"grad-warn-from":{type:"color",value:"#a05f00"},"grad-warn-to":{type:"color",value:"#7a4400"},
"grad-danger-from":{type:"color",value:"#d6344d"},"grad-danger-to":{type:"color",value:"#a8243f"},"grad-brand-from":{type:"color",value:"#6a4cf0"},"grad-brand-to":{type:"color",value:"#4a2fc0"}
})
Print("vars ok")
