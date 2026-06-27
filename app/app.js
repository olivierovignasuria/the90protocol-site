/* =====================================================================
   THE 90 PROTOCOL: Cockpit hub engine
   Self-contained. No external dependencies. localStorage for persistence.
   Aesthetic: glass-cockpit instrument panel.
   ===================================================================== */

/* ---- WIRE-LATER CONSTANTS (placeholders) ---- */
var CHECKOUT_URL = "https://the90protocol.lemonsqueezy.com/checkout/custom/acd48a1c-2741-4b4a-9a3b-3a6d5cd73c25?signature=0b5d9246dd9fb6d7deb02d9883b06bf44145b6e09ef26a50656cbf4de95dc3ee";  // Lemon Squeezy $39 (Merchant of Record); redirect baked in -> https://the90protocol.com/?ok=t90 (unlock)
var CALL_URL     = "https://source.dynamitelifestyle.com/book-discovery-call-40/appointment/o-galaxy";  // Dynamite discovery call: books under Oliviero, manual handoff to Lindsay (closer)
var PRICE        = "$39";
var STORE_KEY    = "the90_v2";

/* ---- FREE vs PAID (SPEC sec.4) ---- */
var FREE_TOOLS = ["read-your-dashboard","sleep-and-state","stop-the-bleed","three-small-wins"];

/* ---- preview unlock (?preview=1) for our own review ---- */
function qs(k){return new URLSearchParams(location.search).get(k);}
var PREVIEW = qs("preview")==="1";

/* =====================================================================
   FIRST-PARTY ANALYTICS BEACON
   ---------------------------------------------------------------------
   Anonymous, cookieless, no PII. Sends only event names + the route/tool
   id to our own endpoint, so we can read the funnel. It NEVER sends field
   contents, names, or any answer the founder typed. Do-Not-Track is honored.
   Analytics must NEVER break the app: every path is wrapped in try/catch.
   sid lives in sessionStorage (per tab, cleared when the tab closes), so it
   is not a persistent identifier and not a cookie.
   ===================================================================== */
var ANALYTICS_ENDPOINT = "/.netlify/functions/t90event";
function dntOn(){
  try{
    var d = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    return d==="1" || d===1 || d==="yes";
  }catch(e){ return false; }
}
function sessionId(){
  try{
    var k="t90_sid", s=sessionStorage.getItem(k);
    if(!s){
      var a=new Uint8Array(8);
      if(window.crypto&&crypto.getRandomValues){ crypto.getRandomValues(a); }
      else { for(var i=0;i<8;i++) a[i]=Math.floor(Math.random()*256); }
      s=Array.prototype.map.call(a,function(b){return ("0"+b.toString(16)).slice(-2);}).join("");
      sessionStorage.setItem(k,s);
    }
    return s;
  }catch(e){ return "nosid"; }
}
function track(event, data){
  try{
    if(dntOn()) return;                 // respect Do-Not-Track: send nothing
    var h=(location.hash||"#cockpit").replace(/^#/,"");
    var payload={ ev:String(event), path:h, sid:sessionId(), ts:Date.now() };
    if(data){ for(var k in data){ if(Object.prototype.hasOwnProperty.call(data,k)) payload[k]=data[k]; } }
    var body=JSON.stringify(payload);
    if(navigator.sendBeacon){
      var blob=new Blob([body],{type:"application/json"});
      if(navigator.sendBeacon(ANALYTICS_ENDPOINT, blob)) return;
    }
    // fallback when sendBeacon is unavailable or returns false
    if(window.fetch){
      fetch(ANALYTICS_ENDPOINT,{method:"POST",body:body,keepalive:true,
        headers:{"content-type":"application/json"}}).catch(function(){});
    }
  }catch(e){ /* analytics is best-effort, never throw */ }
}

/* =====================================================================
   BOOKING DISCLOSURE + CONSENT GATE  (COND.3 / GDPR + commercial firewall)
   ---------------------------------------------------------------------
   No path to CALL_URL may bypass this. Both CTAs (locked-tool overlay and
   the final bridge) open this disclosure instead of linking straight out.
   The book button stays disabled until the consent box is ticked. The
   call_click event fires ONCE, at the consented navigation. "Not now"
   closes the disclosure (fires call_dismiss). Faceless: only "Kim Calvert's
   team (Dynamite Lifestyle)" and "we" are named; no scarcity or urgency.
   ===================================================================== */
function closeBookModal(){
  var m=document.getElementById("bookModal");
  if(m){ m.classList.remove("show"); m.innerHTML=""; }
}
function bookCall(srcPath){
  var m=document.getElementById("bookModal");
  if(!m) return;
  m.innerHTML =
    '<div class="sheet">'
    + '<h3 id="bookModalH">Before you book: what this call is</h3>'
    + '<p>Booking takes you to a separate page run by Kim Calvert\'s team (Dynamite Lifestyle). '
      + 'The call is a 30-minute strategy conversation with a coach from that team. Any details you enter '
      + 'on that page are shared with them, under their privacy policy, to arrange and run the call.</p>'
    + '<p>The call discusses Kim\'s paid program. If you decide to go further, we earn a referral fee. '
      + 'We tell you now so this is a choice, not a catch.</p>'
    + '<p>The instrument is yours either way, whether or not you book.</p>'
    + '<label class="consent"><input type="checkbox" id="bookConsent">'
      + '<span>I understand I will be taken to Kim Calvert\'s team (Dynamite Lifestyle) and my details '
      + 'will be shared with them to arrange this call.</span></label>'
    + '<div class="acts">'
      + '<button class="cta" id="bookGo" disabled>Book a call with Kim\'s team</button>'
      + '<button class="bk-not" id="bookNot">Not now</button>'
    + '</div>'
    + '</div>';
  m.classList.add("show");
  var cb=document.getElementById("bookConsent");
  var goBtn=document.getElementById("bookGo");
  var notBtn=document.getElementById("bookNot");
  if(cb&&goBtn){ cb.onchange=function(){ goBtn.disabled=!cb.checked; }; }
  if(goBtn){ goBtn.onclick=function(){
    if(goBtn.disabled) return;
    track("call_click",{path:srcPath, consented:true});
    window.location.href = CALL_URL;
  }; }
  if(notBtn){ notBtn.onclick=function(){
    track("call_dismiss",{path:srcPath});
    closeBookModal();
  }; }
}

/* =====================================================================
   REFERRAL COPY-LINK  (Move 4a: pure gift, no incentive, no PII)
   ---------------------------------------------------------------------
   Shares a public URL to our own site (?ref=cockpit lets t90stats attribute
   referred visits first-party; the app ignores unknown query params). No
   reward, no popup, no consent gate (no personal data leaves, no third party).
   ===================================================================== */
function shareCockpit(srcPath, btn){
  var url = "https://the90protocol.com/?ref=cockpit";
  function done(){
    track("referral_copy",{path:srcPath});
    if(btn){
      var orig=btn.textContent;
      btn.textContent="Link copied"; btn.classList.add("copied");
      setTimeout(function(){ btn.textContent=orig||"Copy link"; btn.classList.remove("copied"); },2000);
    }
  }
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(done, function(){ done(); });
    } else { done(); }
  }catch(e){ done(); }
}

/* =====================================================================
   STATE / PERSISTENCE
   Shape: { tools: { <id>: { fields:{stepIdx:value}, complete:bool } },
            streak: {count, last}, paid:bool }
   ===================================================================== */
var STATE = loadState();
function loadState(){
  try{ var s=JSON.parse(localStorage.getItem(STORE_KEY)); if(s&&s.tools) return s; }catch(e){}
  return { tools:{}, streak:{count:0,last:null}, paid:false };
}
function saveState(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); }catch(e){} }
function toolState(id){ if(!STATE.tools[id]) STATE.tools[id]={fields:{},complete:false}; return STATE.tools[id]; }
function isPaidUnlocked(){ return PREVIEW || STATE.paid===true; }
function isLocked(id){ return FREE_TOOLS.indexOf(id)===-1 && !isPaidUnlocked(); }

/* daily streak: increments once per calendar day on any save/complete activity */
function touchStreak(){
  var today = new Date().toISOString().slice(0,10);
  var s = STATE.streak;
  if(s.last === today) return;
  if(s.last){
    var prev = new Date(s.last); var d = new Date(today);
    var gap = Math.round((d-prev)/86400000);
    s.count = (gap===1) ? s.count+1 : 1;
  } else { s.count = 1; }
  s.last = today;
}

/* =====================================================================
   TINY MARKDOWN-ISH RENDERER (we ship our own, no CDN)
   Handles paragraphs split on blank lines + **bold** + escaping.
   Content is plain text from tools.js, so this is deliberately minimal.
   ===================================================================== */
function esc(t){ return String(t==null?"":t)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function inline(t){ return esc(t).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>"); }
function paras(t){
  if(!t) return "";
  return String(t).split(/\n{2,}|\\n\\n/).map(function(p){
    return "<p>"+inline(p.trim().replace(/\n/g,"<br>"))+"</p>";
  }).join("");
}

/* =====================================================================
   TOOL DATA INDEX
   TOOLS_DATA comes from tools.js (array). Build lookup + phase grouping.
   ===================================================================== */
var PHASES = [
  {id:"module0", label:"Module 0 · State before strategy", sub:"days 1-3"},
  {id:"phase1",  label:"Phase 1 · Stabilize", sub:"weeks 1-2"},
  {id:"phase2",  label:"Phase 2 · Reframe + extract", sub:"weeks 3-6"},
  {id:"phase3",  label:"Phase 3 · Rebuild + next bet", sub:"weeks 7-12"}
];
var BY_ID = {};
TOOLS_DATA.forEach(function(t){ BY_ID[t.id]=t; });
function orderedTools(){ return TOOLS_DATA.slice().sort(function(a,b){ return a.num.localeCompare(b.num); }); }

/* =====================================================================
   PSYCAP SCORING HEURISTIC  (honest, activity-derived, documented)
   ---------------------------------------------------------------------
   PsyCap = Hope, Efficacy, Resilience, Optimism (Luthans).
   We DO NOT claim a validated psychometric. This is a transparent
   "have you done the work that builds this capacity" meter. Each lane is
   the % of its contributing tools the founder has marked complete, lightly
   weighted by the keystone tool of that lane. Range 0-100.

     EFFICACY   = mastery built by doing concrete, completable work.
                  tools: mastery-ladder (keystone), three-small-wins,
                         stop-the-bleed, land-the-plane.
     RESILIENCE = capacity to absorb a setback and pre-plan the next one.
                  tools: premortem-card (keystone), conditional-next-bet,
                         rumination-circuit-breaker, grief-on-a-schedule.
     HOPE       = goals with pathways + agency (will + ways).
                  tools: if-then-builder (keystone), conditional-next-bet,
                         three-small-wins.
     OPTIMISM   = realistic, balanced attribution (not blind positivity).
                  tools: blameless-post-mortem (keystone, attribution),
                         failure-spectrum, who-am-i-without-it,
                         the-story-you-tell, shame-vs-guilt.

   Keystone counts double in its lane's denominator weighting so the lane
   only fills meaningfully once the defining tool is actually done.
   ===================================================================== */
var PSYCAP = {
  efficacy:   {label:"Efficacy",   sub:"mastery / can-do",   keystone:"mastery-ladder",
               tools:["mastery-ladder","three-small-wins","stop-the-bleed","land-the-plane"]},
  resilience: {label:"Resilience", sub:"absorb / bounce",    keystone:"premortem-card",
               tools:["premortem-card","conditional-next-bet","rumination-circuit-breaker","grief-on-a-schedule"]},
  hope:       {label:"Hope",       sub:"goals + pathways",   keystone:"if-then-builder",
               tools:["if-then-builder","conditional-next-bet","three-small-wins"]},
  optimism:   {label:"Optimism",   sub:"balanced attribution",keystone:"blameless-post-mortem",
               tools:["blameless-post-mortem","failure-spectrum","who-am-i-without-it","the-story-you-tell","shame-vs-guilt"]}
};
function laneScore(def){
  var W=2; // keystone weight
  var num=0, den=0;
  def.tools.forEach(function(id){
    var w = (id===def.keystone)?W:1;
    den += w;
    var ts = STATE.tools[id];
    if(ts && ts.complete) num += w;
  });
  return den ? Math.round((num/den)*100) : 0;
}

/* STATE score: derived from Module 0 'read-your-dashboard' self-assessment
   inputs when present, mapped to 0-100. Falls back to 0 until done.
   Heuristic: average of (10 - stress)/10, sleep band, (100-rumination)/100,
   self-recognition. We pull the numeric hints from saved field text where the
   user typed a number; otherwise we credit completion as a neutral 55. */
/* Read a saved field value for a tool by the step's declared `key`.
   Returns the raw string, or null if not present. */
function fieldByKey(id,key){
  var t=BY_ID[id], ts=STATE.tools[id];
  if(!t||!ts) return null;
  var idx=null;
  (t.steps||[]).forEach(function(s,i){ if(s.key===key) idx=i; });
  if(idx==null) return null;
  var v=ts.fields[idx];
  return (v==null||v==="") ? null : v;
}
/* Numeric value for a tool field by key (parsed leniently). null if absent. */
function numByKey(id,key){
  var v=fieldByKey(id,key);
  if(v==null) return null;
  var n=numFromValue(v);
  return isFinite(n) ? n : null;
}

function stateScore(){
  var ts = STATE.tools["read-your-dashboard"];
  if(!ts) return null;
  // Preferred path: structured Module 0 values read directly by key.
  var stress = numByKey("read-your-dashboard","stress");
  var sleep  = numByKey("read-your-dashboard","sleep");
  var rum    = numByKey("read-your-dashboard","rumination");
  // Backward-tolerant fallback: regex-scan saved text from older sessions.
  function num(re){ for(var k in ts.fields){ var m=String(ts.fields[k]).match(re); if(m) return parseFloat(m[1]); } return null; }
  if(stress==null) stress = num(/(\d+(?:\.\d+)?)\s*\/\s*10/);   // "8/10"
  if(sleep==null)  sleep  = num(/(\d+(?:\.\d+)?)\s*hour/i);     // "4.5 hours"
  if(rum==null)    rum    = num(/(\d+(?:\.\d+)?)\s*%/);         // "60%"
  var parts=[], hadSignal=false;
  if(stress!=null){ parts.push((10-Math.min(10,stress))/10); hadSignal=true; }
  if(sleep!=null){ parts.push(sleep>=7?1:(sleep>=5?0.5:0.1)); hadSignal=true; }
  if(rum!=null){ parts.push((100-Math.min(100,rum))/100); hadSignal=true; }
  if(!hadSignal){ return ts.complete ? 55 : 30; }
  var avg = parts.reduce(function(a,b){return a+b;},0)/parts.length;
  return Math.round(avg*100);
}

function completionPct(){
  var total = TOOLS_DATA.length, done=0;
  TOOLS_DATA.forEach(function(t){ if(STATE.tools[t.id] && STATE.tools[t.id].complete) done++; });
  return { done:done, total:total, pct:Math.round((done/total)*100) };
}

/* =====================================================================
   GAUGE ENGINE  (SVG semicircle dials)
   ===================================================================== */
var CX=110, CY=110, A0=-120, A1=120;
function polar(r,deg){var a=(deg-90)*Math.PI/180;return[CX+r*Math.cos(a),CY+r*Math.sin(a)];}
function v2deg(v){return A0+(Math.max(0,Math.min(100,v))/100)*(A1-A0);}
function arc(r,a0,a1){var p0=polar(r,a1),p1=polar(r,a0),large=(a1-a0)<=180?0:1;
  return"M "+p0[0]+" "+p0[1]+" A "+r+" "+r+" 0 "+large+" 0 "+p1[0]+" "+p1[1];}
function bezelMarkup(){
  var s=['<circle cx="110" cy="110" r="104" fill="url(#bezel)" stroke="#05080c" stroke-width="2"/>',
         '<circle cx="110" cy="110" r="92" fill="url(#gglass)" stroke="#05080c" stroke-width="3"/>'];
  return s.join('');
}
function glassHilite(){return '<ellipse cx="110" cy="80" rx="64" ry="40" fill="url(#hilite)"/>';}
function dial(svg,opts){
  var s=[bezelMarkup()];
  (opts.zones||[]).forEach(function(z){
    s.push('<path d="'+arc(78,v2deg(z[0]),v2deg(z[1]))+'" fill="none" stroke="'+z[2]+'" stroke-width="7" opacity=".85"/>');
  });
  for(var i=0;i<=10;i++){
    var d=A0+i*(A1-A0)/10, maj=(i%5===0);
    var p1=polar(86,d), p2=polar(maj?70:76,d);
    s.push('<line x1="'+p1[0]+'" y1="'+p1[1]+'" x2="'+p2[0]+'" y2="'+p2[1]+'" stroke="#cdd8e8" stroke-width="'+(maj?2.2:1.1)+'"/>');
  }
  s.push('<g class="needle" id="'+opts.nid+'" filter="url(#nsh)">'
    +'<polygon points="110,28 105,112 115,112" fill="'+opts.col+'"/>'
    +'<polygon points="110,148 107,112 113,112" fill="#2a3344"/></g>');
  s.push('<circle cx="110" cy="110" r="8" fill="#39435a" stroke="#0a0d12" stroke-width="2"/>');
  s.push('<circle cx="110" cy="110" r="3" fill="#0a0d12"/>');
  s.push(glassHilite());
  svg.innerHTML=s.join('');
}
function setNeedle(id,v){ var e=document.getElementById(id); if(e) e.style.transform='rotate('+v2deg(v)+'deg)'; }

/* =====================================================================
   ROUTING
   ===================================================================== */
function route(){
  var h = (location.hash||"#cockpit").replace(/^#/,"");
  track("view", {path:h});
  if(h==="welcome") return renderWelcome();
  if(h==="cockpit") return renderCockpit();
  if(h==="about")   return renderAbout();
  if(BY_ID[h])      return renderTool(h);
  return renderCockpit();
}
function go(target){ location.hash = "#"+target; closeNav(); }

/* =====================================================================
   SIDEBAR
   ===================================================================== */
function buildNav(){
  var tree = document.getElementById("navtree");
  var html = "";
  PHASES.forEach(function(ph){
    var tools = orderedTools().filter(function(t){ return t.phase===ph.id; });
    if(!tools.length) return;
    html += '<div class="navsec"><div class="h">'+esc(ph.label.split(" · ")[0])
          + '<span style="font-weight:400;color:#3a4658">'+esc(ph.sub)+'</span></div>';
    tools.forEach(function(t){
      var done = STATE.tools[t.id] && STATE.tools[t.id].complete;
      var free = FREE_TOOLS.indexOf(t.id)!==-1;
      var locked = isLocked(t.id);
      html += '<div class="navitem" data-go="'+t.id+'" id="nav-'+t.id+'">'
            + '<span class="chk'+(done?' done':'')+'" >'+(done?'✓':'')+'</span>'
            + '<span class="num">'+esc(t.num)+'</span>'
            + '<span class="lbl">'+esc(t.title)+'</span>'
            + (free?'<span class="freepill">free</span>':(locked?'<span class="lock">🔒</span>':''))
            + '</div>';
    });
    html += '</div>';
  });
  tree.innerHTML = html;
}
function refreshNavActive(){
  var h=(location.hash||"#cockpit").replace(/^#/,"");
  document.querySelectorAll(".navitem").forEach(function(el){
    el.classList.toggle("active", el.getAttribute("data-go")===h);
  });
  // cockpit check reflects overall completion
  var cp=completionPct();
  var c=document.getElementById("chk-cockpit");
  if(c){ c.classList.toggle("done", cp.pct===100); }
}

/* =====================================================================
   WELCOME / HOW IT WORKS VIEW
   First screen on a first visit. Honest, succinct, scannable. One CTA.
   ===================================================================== */
function startProtocol(){
  track("start_clicked");
  STATE.seenWelcome = true; saveState();
  go("read-your-dashboard");
}
function renderWelcome(){
  var v=document.getElementById("view");
  v.innerHTML =
    '<div class="wel">'
    + '<div class="wel-head">'
      + '<div class="crumb">The 90 Protocol · how it works</div>'
      + '<h1>A private cockpit for your first 90 days after the close</h1>'
      + '<p class="lede">This is not a pep talk. It is an instrument. It reads your current state, '
        + 'steadies the floor under you, extracts the real lessons, and tracks your progress, '
        + 'so you can make an honest call on the next bet. You operate it a little each day for 90 days.</p>'
    + '</div>'

    + '<div class="wel-card">'
      + '<div class="wel-k">What you walk away with</div>'
      + '<ul class="wel-list">'
        + '<li><b>A real runway number.</b> How much time you actually have, as a countdown, not a guess.</li>'
        + '<li><b>A blameless post-mortem.</b> The real lessons and the causes you control, without the shame.</li>'
        + '<li><b>Your reframed failure story.</b> One coherent account of the closure, so it stops draining you.</li>'
        + '<li><b>If-then plans and an honest go or no-go.</b> Pre-committed next steps and a clear-eyed read on the next bet, with an off-ramp you are not ashamed to use.</li>'
        + '<li><b>The Cockpit.</b> A panel that tracks your state, your progress, and your streak as you work.</li>'
      + '</ul>'
    + '</div>'

    + '<div class="wel-card">'
      + '<div class="wel-k">How to use it</div>'
      + '<ul class="wel-list">'
        + '<li><b>Start with Module 0:</b> read your own state and set an honest baseline.</li>'
        + '<li><b>Work the phases a little each day,</b> paced by time, not speed: stabilize, then reframe, then rebuild.</li>'
        + '<li><b>Return to the Cockpit</b> to watch your state, progress and streak. The lowest lane is this week\'s focus.</li>'
        + '<li><b>Free to start, no account needed.</b> Your answers stay in your browser.</li>'
      + '</ul>'
    + '</div>'

    + '<div class="wel-card">'
      + '<div class="wel-k">Free vs the full kit</div>'
      + '<p class="wel-p">Four tools are open for free: read your dashboard, sleep and state, stop the bleed, and three small wins. '
        + 'If it helps you, the full 90-day kit unlocks the rest for '+PRICE+': the post-mortem and attribution audit, '
        + 'the if-then builder, the mastery ladder, and the conditional next bet.</p>'
    + '</div>'

    + '<div class="wel-cta-row">'
      + '<button class="cta" id="welStart">Start with Module 0</button>'
      + '<a class="wel-skip" data-go="cockpit">skip to the cockpit</a>'
    + '</div>'

    + '<p class="wel-foot">Structured practice, not therapy. No income claims, no guaranteed comeback. '
      + 'The aim is to raise your odds and think clearly about what comes next.</p>'
    + '</div>';

  var b=document.getElementById("welStart");
  if(b) b.onclick=startProtocol;
  refreshNavActive();
  window.scrollTo(0,0);
}

/* =====================================================================
   COCKPIT VIEW
   ===================================================================== */
function renderCockpit(){
  var cp = completionPct();
  var st = stateScore();
  var lanes = {};
  for(var k in PSYCAP){ lanes[k]=laneScore(PSYCAP[k]); }
  var streak = STATE.streak.count||0;
  var locked = !isPaidUnlocked();

  var v = document.getElementById("view");
  v.innerHTML =
    '<div class="ck-glare">'
    + '<div class="t">THE COCKPIT <small>· first 90 days after the close</small></div>'
    + '<div class="ck-who">restore operational lucidity<br><b>raise the odds, no guaranteed comeback</b></div>'
    + '</div>'
    + '<div class="ck-tabs"><button id="tabDash" class="active">Dashboard</button><button id="tabCard">Weekly card</button></div>'
    + '<div class="dash" id="ckDash"></div>'
    + '<div class="dash hidden" id="ckCard" style="display:none"></div>'
    + '<p class="ck-foot">Structured self-assessment, not a clinical diagnosis or a validated psychometric. '
      + 'It measures whether you have done the work that rebuilds operational lucidity, not external results. '
      + 'Base rate, stated plainly: roughly <code>20%</code> of founders who close succeed at the next venture, '
      + 'and only <code>3-8%</code> restart within a meaningful window. The goal is to raise your odds, not to promise the 20%.</p>';

  // ----- dashboard tab -----
  var stateBox = (st==null)
    ? '<div class="v"><small>not set</small></div><div class="sub">complete Module 0, tool 1</div>'
    : '<div class="v">'+st+'<small>/100</small></div>'
      + '<div class="bar"><span style="width:'+st+'%"></span></div>'
      + '<div class="sub">'+(st>=66?'lucidity returning':(st>=40?'fog thinning':'fog: structure first'))+'</div>';

  document.getElementById("ckDash").innerHTML =
    '<div class="toprow">'
    + '<div class="stat"><div class="k">State score</div>'+stateBox+'</div>'
    + '<div class="stat"><div class="k">90-day progress</div>'
        + '<div class="v">'+cp.pct+'<small>%</small></div>'
        + '<div class="bar"><span style="width:'+cp.pct+'%"></span></div>'
        + '<div class="sub">'+cp.done+' of '+cp.total+' instruments live</div></div>'
    + '<div class="stat"><div class="k">Daily streak</div>'
        + '<div class="v">'+streak+'<small> day'+(streak===1?'':'s')+'</small></div>'
        + '<div class="sub">'+(streak?'momentum, the Progress Principle':'log one thing to start')+'</div></div>'
    + '</div>'
    + '<div class="lanes-h">PsyCap rebuild · 4-lane meter</div>'
    + '<div class="lanes">'
      + lane("hope",lanes.hope) + lane("efficacy",lanes.efficacy)
      + lane("resilience",lanes.resilience) + lane("optimism",lanes.optimism)
    + '</div>'
    + '<div class="annun">'
      + ann("STATE", st==null?'' : (st>=66?'g':(st>=40?'a':'r')))
      + ann("SLEEP", sleepFlag())
      + ann("RUNWAY", runwayFlag())
      + ann("MOMENTUM", streak>=3?'g':(streak>=1?'a':''))
    + '</div>'
    + '<div class="reading'+(st!=null&&st<40?' warn':'')+'" id="ckReading">'+cockpitReading(st,cp,lanes)+'</div>'
    + (locked
        ? '<div class="gate"><div class="lockoverlay"><div class="ico">🔒</div>'
          + '<h3>The full instrument panel is part of the kit</h3>'
          + '<p>Four instruments are open. The remaining '+(cp.total-FREE_TOOLS.length)+' light up the full 90-day Cockpit: '
          + 'post-mortem and attribution, the if-then builder, the mastery ladder, the premortem and the conditional next bet.</p>'
          + '<a class="cta" href="'+CHECKOUT_URL+'">Unlock the full 90-day kit, '+PRICE+'</a></div></div>'
        : '');

  // wire lane gauges
  for(var key in PSYCAP){
    var svg=document.getElementById("g-"+key);
    if(svg){ dial(svg,{nid:"n-"+key,col:"#5ad1ff",
      zones:[[0,40,'#5a3030'],[40,70,'#5a5230'],[70,100,'#2f6a48']]}); }
  }
  // animate needles next frame
  requestAnimationFrame(function(){ for(var key in PSYCAP){ setNeedle("n-"+key, lanes[key]); } });

  // ----- weekly card tab -----
  document.getElementById("ckCard").innerHTML = weeklyCard(st,cp,streak,lanes);

  // tab handlers
  var tabDash=document.getElementById("tabDash"), tabCard=document.getElementById("tabCard");
  var dDash=document.getElementById("ckDash"), dCard=document.getElementById("ckCard");
  tabDash.onclick=function(){ tabDash.classList.add("active");tabCard.classList.remove("active");
    dDash.style.display="";dCard.style.display="none"; };
  tabCard.onclick=function(){ tabCard.classList.add("active");tabDash.classList.remove("active");
    dCard.style.display="";dDash.style.display="none"; };

  refreshNavActive();
}

function lane(key,score){
  var d=PSYCAP[key];
  return '<div class="lane"><div class="cap">'+esc(d.label)+'</div><div class="sub">'+esc(d.sub)+'</div>'
    + '<svg width="150" height="150" viewBox="0 0 220 220" id="g-'+key+'"></svg>'
    + '<div class="digi">'+score+'<small>/100</small></div></div>';
}
function ann(label,cls){ return '<div class="ann'+(cls?(' '+cls):'')+'">'+esc(label)+'</div>'; }

function sleepFlag(){
  // Preferred: structured sleep-hours number from Module 0 (or Sleep & State).
  var h=numByKey("read-your-dashboard","sleep");
  if(h==null) h=numByKey("sleep-and-state","sleep");
  if(h!=null) return h>=7?'g':(h>=5?'a':'r');
  // Backward-tolerant fallback: scan saved text.
  var ts=STATE.tools["read-your-dashboard"]||STATE.tools["sleep-and-state"];
  if(!ts) return '';
  for(var k in ts.fields){
    var t=String(ts.fields[k]).toLowerCase();
    var m=t.match(/(\d+(?:\.\d+)?)\s*hour/);
    if(m){ var hh=parseFloat(m[1]); return hh>=7?'g':(hh>=5?'a':'r'); }
    if(/under 5|broken|fragmented|3 ?am|4 ?am/.test(t)) return 'a';
  }
  return STATE.tools["sleep-and-state"]&&STATE.tools["sleep-and-state"].complete?'g':'';
}
function runwayFlag(){
  var ts=STATE.tools["stop-the-bleed"];
  if(!ts) return '';
  // Preferred: reflect the computed runway in months if it calculated cleanly.
  var rw=numByKey("stop-the-bleed","runway_months");
  if(rw!=null) return rw>=6?'g':(rw>=3?'a':'r');
  // Fallback: completion-based signal.
  return ts.complete?'g':'a';
}

function cockpitReading(st,cp,lanes){
  if(st==null){
    return '<b>Start with the instrument check.</b> Open Module 0, tool 1 (Read Your Own Dashboard). '
      + 'You cannot fly a fogged panel: it reads your current state so the rest of the protocol starts from an honest baseline, not a wishful one.';
  }
  if(st<40){
    return '<b>State is low, and that is data, not a verdict.</b> Under acute stress, sleep loss and rumination, '
      + 'cognitive bandwidth drops measurably (g=-0.43). The move now is structure, not strategy: sleep baseline, '
      + 'stop the bleed, three small wins. Lucidity follows the structure, in that order.';
  }
  var weakest=null,wv=101;
  for(var k in lanes){ if(lanes[k]<wv){wv=lanes[k];weakest=PSYCAP[k].label;} }
  return '<b>Lucidity is returning (state '+st+'/100) and '+cp.done+' of '+cp.total+' instruments are live.</b> '
    + 'Lowest PsyCap lane right now: '+weakest+' at '+wv+'/100. The instruments feeding it are the highest-leverage work this week. '
    + 'No comeback is promised here: the aim is to raise the odds you can think clearly about the next bet.';
}

function weeklyCard(st,cp,streak,lanes){
  var avg=Math.round((lanes.hope+lanes.efficacy+lanes.resilience+lanes.optimism)/4);
  return '<div class="card">'
    + '<div class="ttl">The 90 Protocol · weekly</div>'
    + '<div class="big">'+(st==null?'n/a':st)+'<span style="font-size:18px;color:var(--faint)">/100 state</span></div>'
    + '<div style="font-size:12px;color:var(--muted)">'+(st==null?'baseline not set yet':(st>=66?'lucidity returning':(st>=40?'fog thinning':'structure first, lucidity after')))+'</div>'
    + '<div class="crow">'
      + '<div class="cell"><div class="n">'+cp.pct+'%</div><div class="l">90-day</div></div>'
      + '<div class="cell"><div class="n">'+streak+'</div><div class="l">day streak</div></div>'
      + '<div class="cell"><div class="n">'+avg+'</div><div class="l">PsyCap avg</div></div>'
    + '</div>'
    + '<div class="ln">Hope '+lanes.hope+' · Efficacy '+lanes.efficacy+' · Resilience '+lanes.resilience+' · Optimism '+lanes.optimism+'</div>'
    + '<div class="mk">restore lucidity · raise the odds · no guaranteed comeback</div>'
    + '</div>'
    + '<p style="text-align:center;font-size:11.5px;color:var(--faint);margin-top:14px">Screenshot this card to mark the week. It tracks the work, not a promise.</p>'
    + '<div class="refline"><span class="reftxt">Know a founder in the same stretch? This is a private instrument, not a pitch. Send them the cockpit.</span>'
      + '<button class="refbtn" data-act="share" data-src="weekly-card">Copy link</button></div>';
}

/* =====================================================================
   TOOL VIEW
   ===================================================================== */
function renderTool(id){
  var t=BY_ID[id]; if(!t) return renderCockpit();
  track("tool_open", {tool:id});
  var ts=toolState(id);
  var locked=isLocked(id);
  var free=FREE_TOOLS.indexOf(id)!==-1;
  var ph=PHASES.filter(function(p){return p.id===t.phase;})[0]||{label:""};
  var isFinal = (id==="conditional-next-bet");

  var v=document.getElementById("view");
  var html =
    '<div class="toolhead">'
    + '<div class="crumb">'+esc(ph.label)+'</div>'
    + '<h1>'+esc(t.title)+'</h1>'
    + '<div class="tags"><span class="tag '+(free?'free':'paid')+'">'+(free?'Free':'Full kit')+'</span>'
      + '<span class="tag">Tool '+esc(t.num)+'</span>'
      + (ts.complete?'<span class="tag" style="color:var(--green);border-color:#1f5a3a">✓ Complete</span>':'')+'</div>'
    + '</div>'
    + '<div class="intro">'+paras(t.intro)+'</div>'
    + (t.mechanism?'<div class="mech"><b>The mechanism:</b> '+inline(t.mechanism)+'</div>':'');

  if(locked){
    html += '<div class="gate"><div class="lockoverlay"><div class="ico">🔒</div>'
      + '<h3>This instrument is part of the full kit</h3>'
      + '<p>You can read what it does above. The guided prompts, the worked example, and the saved artifact '
      + 'that feeds your Cockpit are part of the complete 90-day system.</p>'
      + '<a class="cta" href="'+CHECKOUT_URL+'">Unlock the full 90-day kit, '+PRICE+'</a>'
      + '<button class="cta sec" data-act="book" data-src="locked:'+esc(id)+'">Talk it through first</button>'
      + '</div></div>';
  } else {
    // guided steps
    (t.steps||[]).forEach(function(step,i){
      var saved = ts.fields[i];
      html += renderStep(id,step,i,saved);
    });
    if(t.marco){
      html += '<details class="marco"><summary>See how Marco answered</summary>'
            + '<div class="body">'+esc(t.marco)+'</div></details>';
    }
    if(isFinal){
      html += '<div class="bridge"><h3>The honest bridge</h3>'
        + '<p>This tool ends on a precondition, not a push: earn the relaunch, do not assume it. '
        + 'If your go conditions are met and you want to pressure-test the next bet with someone, that is the next step. '
        + 'If they are not met yet, the off-ramp is the right call, and that is a result too.</p>'
        + '<button class="cta" data-act="book" data-src="bridge">Book the conversation</button></div>';
    }
    if(t.cockpit){
      html += '<div class="mech" style="border-left-color:var(--green)"><b>Cockpit output:</b> '+inline(t.cockpit)+'</div>';
    }
  }

  // footer
  var order=orderedTools(), idx=order.findIndex(function(x){return x.id===id;});
  var prev=idx>0?order[idx-1]:null, next=idx<order.length-1?order[idx+1]:null;
  html += '<div class="toolfoot">'
    + '<div class="navbtns">'
      + (prev?'<button data-go="'+prev.id+'">← '+esc(prev.title)+'</button>':'')
      + (next?'<button data-go="'+next.id+'">'+esc(next.title)+' →</button>':'')
    + '</div>'
    + (locked? '<span class="savestate">Unlock to save your work</span>'
             : '<div style="display:flex;align-items:center;gap:12px">'
                 + '<span class="savestate" id="saveState">'+(ts.complete?'Saved · complete':'Your work autosaves')+'</span>'
                 + '<button class="markbtn'+(ts.complete?' done':'')+'" id="markBtn">'+(ts.complete?'✓ Completed':'Mark complete')+'</button>'
               + '</div>')
    + '</div>';

  v.innerHTML=html;

  if(!locked){
    // wire inputs
    (t.steps||[]).forEach(function(step,i){ wireStep(id,step,i); });
    recomputeAll(id); // populate + persist computed fields from current values
    var mb=document.getElementById("markBtn");
    if(mb) mb.onclick=function(){
      ts.complete=!ts.complete; touchStreak(); saveState();
      if(ts.complete) track("tool_complete", {tool:id});
      buildNav(); renderTool(id); // re-render to reflect state + cockpit checks
    };
  }
  refreshNavActive();
  window.scrollTo(0,0);
}

/* ---- COMPUTED FIELDS: tiny safe evaluator ----
   A formula references input steps by their `key` and supports + - * / and
   parentheses only. Keys resolve to the current numeric value of the step
   whose `key` matches (read live from the DOM, falling back to saved state).
   Divide-by-zero or any non-finite result returns null -> rendered as "n/a". */
function toolKeyMap(t){
  // map: key -> step index (for steps that declare a `key`)
  var m={};
  (t.steps||[]).forEach(function(s,i){ if(s.key) m[s.key]=i; });
  return m;
}
function numFromValue(v){
  if(v==null) return NaN;
  // strip currency symbols, commas, spaces, units; keep digits, sign, dot
  var s=String(v).replace(/[^0-9.\-]/g,"");
  if(s==="" || s==="-" || s===".") return NaN;
  return parseFloat(s);
}
function liveKeyValue(id,t,key){
  var km=toolKeyMap(t); var idx=km[key];
  if(idx==null) return NaN;
  // prefer a live DOM input if present
  var el=document.querySelector('.step [data-step="'+idx+'"][data-kind="num"], .step [data-step="'+idx+'"][data-kind="scale"]');
  if(el && el.value!=="") return numFromValue(el.value);
  var ts=STATE.tools[id];
  if(ts && ts.fields[idx]!=null) return numFromValue(ts.fields[idx]);
  return NaN;
}
function evalFormula(id,t,formula){
  if(!formula) return null;
  // replace bareword keys with their live numeric value
  var km=toolKeyMap(t), bad=false;
  var expr=String(formula).replace(/[A-Za-z_][A-Za-z0-9_]*/g,function(tok){
    if(!(tok in km)){ bad=true; return "NaN"; }
    var v=liveKeyValue(id,t,tok);
    if(!isFinite(v)){ bad=true; return "NaN"; }
    return "("+v+")";
  });
  if(bad) return null;
  // whitelist: digits, operators, parens, dot, whitespace only
  if(!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
  var r;
  try { r = Function('"use strict";return ('+expr+');')(); }
  catch(e){ return null; }
  if(typeof r!=="number" || !isFinite(r)) return null; // guards /0 -> Infinity
  return r;
}
function fmtComputed(step,n){
  if(n==null) return "n/a";
  var rounded = (step.decimals!=null) ? n.toFixed(step.decimals) : (Math.round(n*100)/100);
  return (step.prefix||"") + rounded + (step.unit?(" "+step.unit):"");
}

function renderStep(id,step,i,saved){
  var t=BY_ID[id];
  var type=step.type||"textarea";
  var val = (saved!=null && saved!=="") ? saved : (step.default||"");
  var field;
  if(type==="scale"){
    var num = parseInt(String(val).match(/\d+/)?String(val).match(/\d+/)[0]:5,10);
    field = '<div class="scalewrap">'
      + '<input type="range" min="1" max="10" value="'+num+'" data-step="'+i+'" data-kind="scale">'
      + '<span class="scaleval" id="sv-'+id+'-'+i+'">'+num+'</span></div>'
      + '<textarea data-step="'+i+'" data-kind="text" placeholder="One line of context (optional)">'+esc(typeof saved==="string"&&saved.replace?saved.replace(/^\d+\s*[-·]?\s*/,""):(step.default||""))+'</textarea>';
  } else if(type==="date"){
    field = '<input type="date" data-step="'+i+'" data-kind="text" value="'+esc(val)+'">';
  } else if(type==="number"){
    var inAttrs='type="number" data-step="'+i+'" data-kind="num" value="'+esc(val)+'"'
      + ' inputmode="decimal"'
      + (step.min!=null?(' min="'+esc(step.min)+'"'):'')
      + (step.step!=null?(' step="'+esc(step.step)+'"'):' step="any"')
      + (step.placeholder?(' placeholder="'+esc(step.placeholder)+'"'):'');
    field = '<div class="numwrap">'
      + (step.prefix?'<span class="numfix pre">'+esc(step.prefix)+'</span>':'')
      + '<input '+inAttrs+'>'
      + (step.unit?'<span class="numfix unit">'+esc(step.unit)+'</span>':'')
      + '</div>';
  } else if(type==="computed"){
    var n=evalFormula(id,t,step.formula);
    field = '<div class="computed" data-step="'+i+'" data-kind="computed" data-formula="'+esc(step.formula||"")+'">'
      + '<span class="cval" id="cv-'+id+'-'+i+'">'+esc(fmtComputed(step,n))+'</span>'
      + '<span class="ctag">auto</span></div>';
  } else if(type==="text"){
    field = '<input type="text" data-step="'+i+'" data-kind="text" value="'+esc(val)+'">';
  } else {
    field = '<textarea data-step="'+i+'" data-kind="text">'+esc(val)+'</textarea>';
  }
  var labelFl = (type==="computed")
    ? '<label class="fl">Calculated for you</label>'
    : (type==="date"||type==="number")
      ? '<label class="fl">Enter the number, we handle the rest</label>'
      : '<label class="fl">Your answer (the default is editable)</label>';
  return '<div class="step">'
    + '<div class="lab">'+esc(step.label||("Step "+(i+1)))+'</div>'
    + (step.question?'<div class="q">'+inline(step.question)+'</div>':'')
    + labelFl
    + field
    + '</div>';
}

function wireStep(id,step,i){
  var ts=toolState(id);
  var els=document.querySelectorAll('.step [data-step="'+i+'"]');
  els.forEach(function(el){
    var kind=el.getAttribute("data-kind");
    if(kind==="computed") return; // read-only output, nothing to wire
    if(kind==="scale"){
      el.addEventListener("input",function(){
        var sv=document.getElementById("sv-"+id+"-"+i); if(sv) sv.textContent=el.value;
        commit(id,i, el.value);
        recomputeAll(id); // scale values can feed a formula
      });
    } else if(kind==="num"){
      el.addEventListener("input",function(){
        recomputeAll(id);              // recalc live, every keystroke
        commit(id,i, el.value);        // persist the raw number
      });
    } else {
      var timer=null;
      el.addEventListener("input",function(){
        clearTimeout(timer);
        timer=setTimeout(function(){ commit(id,i, el.value); },300);
      });
    }
  });
}
/* Recalculate every computed field in the current tool, update the DOM,
   and persist the formatted result so the Cockpit can read it back. */
function recomputeAll(id){
  var t=BY_ID[id]; if(!t) return;
  var ts=toolState(id), changed=false;
  (t.steps||[]).forEach(function(step,idx){
    if((step.type||"")!=="computed") return;
    var n=evalFormula(id,t,step.formula);
    var out=fmtComputed(step,n);
    var cv=document.getElementById("cv-"+id+"-"+idx); if(cv) cv.textContent=out;
    if(ts.fields[idx]!==out){ ts.fields[idx]=out; changed=true; }
  });
  if(changed){ saveState(); }
}
function commit(id,i,val){
  var ts=toolState(id);
  ts.fields[i]=val; touchStreak(); saveState();
  var ss=document.getElementById("saveState"); if(ss && !ts.complete) ss.textContent="Saved just now";
}

/* =====================================================================
   ABOUT VIEW (positioning honesty, hard rules)
   ===================================================================== */
function renderAbout(){
  var v=document.getElementById("view");
  v.innerHTML =
    '<div class="toolhead"><div class="crumb">The 90 Protocol</div>'
    + '<h1>An instrument, not an ebook</h1></div>'
    + '<div class="intro">'
    + '<p>Most advice says failure is a gift, that the lesson arrives on its own. The evidence does not support that. '
    + 'Failure does not automatically teach: the often-cited rebound is small, shaped by survivorship bias, and only a '
    + 'minority of founders ever restart. Roughly 20% succeed at the next venture, and only 3 to 8% restart within a '
    + 'meaningful window.</p>'
    + '<p>So this is the honest promise: in 90 days we work to restore operational lucidity and raise your odds. '
    + 'We do not guarantee a comeback. The wedge is simple: structure first, lucidity after. The fog after a shutdown is '
    + 'a measurable, reversible cognitive state, not a character flaw, and you rebuild the instrument panel before you '
    + 'try to fly.</p>'
    + '<p>No income claims. No guru certainty. Every tool names its mechanism and cites it. The final tool ends on a '
    + 'precondition, not a sales push: earn the relaunch, do not assume it. If you want to think the next bet through '
    + 'with someone, there is a door for that, and walking past it is also a valid choice.</p>'
    + '</div>'
    + '<div class="mech"><b>How the Cockpit scores you:</b> the State score comes from your Module 0 self-assessment. '
    + 'The PsyCap meter (Hope, Efficacy, Resilience, Optimism) fills as you complete the tools that build each capacity. '
    + 'It is a structured self-assessment of work done, not a validated clinical psychometric, and it measures your process, not external results.</div>'
    + '<div class="toolfoot"><div class="navbtns"><button data-go="cockpit">← Back to the Cockpit</button></div></div>';
  refreshNavActive();
}

/* =====================================================================
   NAV / MOBILE WIRING + BOOT
   ===================================================================== */
function openNav(){ document.getElementById("nav").classList.add("open"); document.getElementById("backdrop").classList.add("show"); }
function closeNav(){ document.getElementById("nav").classList.remove("open"); document.getElementById("backdrop").classList.remove("show"); }

document.addEventListener("click",function(e){
  // data-act buttons take priority over data-go navigation
  var act=e.target.closest("[data-act]");
  if(act){
    var kind=act.getAttribute("data-act");
    var src=act.getAttribute("data-src")||"";
    if(kind==="book"){ bookCall(src); return; }
    if(kind==="share"){ shareCockpit(src, act); return; }
  }
  var item=e.target.closest("[data-go]");
  if(item){ go(item.getAttribute("data-go")); }
});
/* Delegated CTA tracking: fire when the checkout link is clicked, identified by
   its href (no PII, anchor target only). The call path is NOT tracked here:
   every route to CALL_URL now passes through bookCall(), which fires
   call_click exactly once at the consented navigation (see bookCall). */
document.addEventListener("click",function(e){
  try{
    var a=e.target.closest("a[href]");
    if(!a) return;
    var href=a.getAttribute("href")||"";
    if(href.indexOf(CHECKOUT_URL)===0) track("checkout_click",{path:(location.hash||"#cockpit").replace(/^#/,"")});
  }catch(err){ /* never block navigation */ }
});
document.getElementById("menuBtn").addEventListener("click",openNav);
document.getElementById("backdrop").addEventListener("click",closeNav);
window.addEventListener("hashchange",route);

(function boot(){
  // Post-purchase unlock: Stripe success redirect appends ?ok=t90 -> persist paid.
  // Cosmetic gate for v1 (tools.js ships all content); server-side gating is the post-ads upgrade.
  if(qs("ok")==="t90"){ STATE.paid=true; saveState(); track("unlock"); }
  buildNav();
  // First-visit onboarding: show #welcome unless this is a deep-link, a preview,
  // a purchase return (?ok), or the founder has already seen it.
  var deepLink = !!location.hash;
  var bypass = deepLink || PREVIEW || qs("ok")==="t90" || STATE.seenWelcome===true;
  if(!location.hash) location.hash = bypass ? "#cockpit" : "#welcome";
  route();
})();
