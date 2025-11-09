// Advanced indoor routing with touch, PWA, animated walker
const cvs = document.getElementById('canvas');
const ctx = cvs.getContext('2d');
const wrap = document.getElementById('canvasWrap');

const fromSel = document.getElementById('fromSel');
const toSel = document.getElementById('toSel');
const startFloorSel = document.getElementById('startFloorSel');
const endFloorSel = document.getElementById('endFloorSel');
const accessible = document.getElementById('accessible');
const routeBtn = document.getElementById('routeBtn');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const stepsList = document.getElementById('stepsList');
const etaBadge = document.getElementById('etaBadge');

let G=null, nodesById=new Map(), adj=new Map();
let floors=[0,1,2], bgImgs={}, currentFloor=0;
let routePolyline=[], instructions=[], activeStep=0;
let anim={{ playing:false, t:0, speed:80 }}; // px/sec
let camera={{ x:0, y:0, z:1 }};
const PX_PER_STEP = 3.75;

// Touch pan & pinch
let touchState = {{ panning:false, last:null, pinchDist:null, startCam:null }};
wrap.addEventListener('touchstart', (e) => {{
  if (e.touches.length === 1) {{
    touchState.panning = true;
    touchState.last = {{ x: e.touches[0].clientX, y: e.touches[0].clientY }};
  }} else if (e.touches.length === 2) {{
    const [t1, t2] = e.touches;
    touchState.pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    touchState.startCam = {{ x: camera.x, y: camera.y, z: camera.z }};
  }}
}});
wrap.addEventListener('touchmove', (e) => {{
  if (e.touches.length === 1 && touchState.panning) {{
    const cur = {{ x: e.touches[0].clientX, y: e.touches[0].clientY }};
    camera.x += cur.x - touchState.last.x;
    camera.y += cur.y - touchState.last.y;
    touchState.last = cur;
    render();
  }} else if (e.touches.length === 2 && touchState.pinchDist) {{
    const [t1, t2] = e.touches;
    const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const factor = d / touchState.pinchDist;
    camera.z = Math.max(0.5, Math.min(2.0, touchState.startCam.z * factor));
    render();
  }}
}});
wrap.addEventListener('touchend', () => {{ touchState = {{ panning:false, last:null, pinchDist:null, startCam:null }}; }});

function drawImageFit(img){{
  const w = 1024*camera.z, h = 640*camera.z;
  ctx.drawImage(img, camera.x, camera.y, w, h);
}}

function worldToScreen(p){{ return {{ x: p.x*camera.z + camera.x, y: p.y*camera.z + camera.y }}; }}
function totalLengthPx(poly){{ let L=0; for (let i=1;i<poly.length;i++){{ const a=nodesById.get(poly[i-1].id), b=nodesById.get(poly[i].id); L+=Math.hypot(b.x-a.x, b.y-a.y); }} return L; }}
function positionAlongPolyline(t){{
  if (!routePolyline.length) return null;
  let rem=t;
  for (let i=1;i<routePolyline.length;i++){{
    const a=nodesById.get(routePolyline[i-1].id);
    const b=nodesById.get(routePolyline[i].id);
    const d=Math.hypot(b.x-a.x, b.y-a.y);
    if (rem<=d){{ const u=Math.max(0,Math.min(1,rem/d)); return {{ x:a.x+(b.x-a.x)*u, y:a.y+(b.y-a.y)*u, floor:b.floor }}; }}
    rem-=d;
  }}
  const last=nodesById.get(routePolyline[routePolyline.length-1].id);
  return {{ x:last.x, y:last.y, floor:last.floor }};
}

async function loadBackgrounds(fs) {{
  for (let f of fs) {{
    const img = new Image();
    await new Promise((resolve) => {{ img.onload=resolve; img.onerror=resolve; img.src=`floor${{f}}.svg`; }});
    if (img.naturalWidth) bgImgs[f]=img;
  }}
}}

function render(){{
  ctx.clearRect(0,0,cvs.width,cvs.height);
  const img = bgImgs[currentFloor] || bgImgs[0];
  if (img) drawImageFit(img);

  // graph (current floor)
  ctx.save(); ctx.globalAlpha=0.2; ctx.strokeStyle='#777'; ctx.lineWidth=2;
  G.edges.forEach(e=>{{
    const a=nodesById.get(e.from), b=nodesById.get(e.to);
    if (!a||!b) return;
    if (a.floor!==currentFloor || b.floor!==currentFloor) return;
    const A=worldToScreen(a), B=worldToScreen(b);
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
  }});
  ctx.restore();

  // route
  if (routePolyline.length){{
    ctx.lineWidth=5; ctx.strokeStyle='#1a73e8';
    for (let f of floors){{
      ctx.globalAlpha=(f===currentFloor)?1:0.15;
      ctx.beginPath();
      let started=false;
      for (let p of routePolyline){{
        const node = nodesById.get(p.id);
        if (!node || node.floor!==f) continue;
        const s = worldToScreen(node);
        if (!started){{ ctx.moveTo(s.x,s.y); started=true; }} else ctx.lineTo(s.x,s.y);
      }}
      ctx.stroke();
    }}
    ctx.globalAlpha=1;
    const pos = positionAlongPolyline(anim.t);
    if (pos){{
      const s = worldToScreen(pos);
      ctx.beginPath(); ctx.fillStyle = '#1a73e8'; ctx.arc(s.x,s.y,6,0,Math.PI*2); ctx.fill();
      ctx.fillText('🏃', s.x+8, s.y-8);
      currentFloor = pos.floor;
    }}
  }}
}

function resize(){{ cvs.width = wrap.clientWidth; cvs.height = wrap.clientHeight; render(); }}
window.addEventListener('resize', resize); resize();

fetch('building.geojson').then(r=>r.json()).then(async graph => {{
  G=graph; floors=G.floors;
  G.nodes.forEach(n => nodesById.set(n.id,n));
  G.nodes.forEach(n => adj.set(n.id,[]));
  G.edges.forEach(e => {{ adj.get(e.from).push(e); if (adj.has(e.to)) adj.get(e.to).push({{ ...e, from:e.to, to:e.from }}); }});
  await loadBackgrounds(floors);

  const rooms = G.nodes.filter(n=>n.type==='room');
  [fromSel,toSel].forEach(sel => {{ rooms.forEach(n => sel.add(new Option(`${{n.label||n.id}} (F${{n.floor}})`, n.id))); }});
  floors.forEach(f => {{ startFloorSel.add(new Option(`F${{f}}`, f)); endFloorSel.add(new Option(`F${{f}}`, f)); }});
  startFloorSel.value=floors[0]; endFloorSel.value=floors[floors.length-1];
  fromSel.value=rooms[0]?.id || ''; toSel.value=rooms[rooms.length-1]?.id || '';

  routeBtn.onclick = computeRoute;
  playBtn.onclick = ()=>{{ anim.playing=true; }};
  pauseBtn.onclick = ()=>{{ anim.playing=false; }};
  resetBtn.onclick = ()=>{{ anim.t=0; anim.playing=false; activeStep=0; renderInstructions(); render(); }};

  window.addEventListener('keydown', (e)=>{{
    if (e.code==='Space'){{ anim.playing=!anim.playing; e.preventDefault(); }}
  }});

  computeRoute();
}});

function totalSteps(px){{ return Math.round(px / PX_PER_STEP); }}

function computeRoute(){{
  const start=fromSel.value, goal=toSel.value;
  const path = aStar(start, goal, accessible.checked);
  routePolyline = path.map(id => ({{id}}));
  instructions = buildInstructions(path);
  anim.t=0; anim.playing=false; currentFloor = nodesById.get(path[0])?.floor || floors[0];
  renderInstructions(); render();
}}

function renderInstructions(){{
  stepsList.innerHTML='';
  const totalPx = totalLengthPx(routePolyline);
  etaBadge.textContent = `ETA ~${{Math.max(1, Math.round((totalPx/anim.speed)/60))}} min, ${{totalSteps(totalPx)}} steps`;
  instructions.forEach((ins)=>{{ const li=document.createElement('li'); li.textContent=ins.text; stepsList.appendChild(li); }});
}}

function aStar(start, goal, banStairs){{
  const h=(a,b)=>{{ const A=nodesById.get(a), B=nodesById.get(b); return Math.hypot(A.x-B.x, A.y-B.y) + Math.abs((A.floor||0)-(B.floor||0))*60; }};
  const open=new Set([start]), came=new Map();
  const g=new Map([[start,0]]), f=new Map([[start,h(start,goal)]]);
  const lowest=()=>{{ let best=null,val=Infinity; for (let n of open){{ const v=f.get(n)??Infinity;if(v<val){{val=v;best=n;}} }} return best; }};
  while(open.size){{
    const cur=lowest(); if (!cur) break;
    if (cur===goal){{ const out=[]; let c=cur; while(c){{ out.push(c); c=came.get(c); }} return out.reverse(); }}
    open.delete(cur);
    for (let e of adj.get(cur)){{
      if (banStairs && e.modes?.includes('stairs')) continue;
      const w=(e.weight??1)+(e.modes?.includes('stairs')?10:0);
      const cand=(g.get(cur)??Infinity)+w;
      if (cand < (g.get(e.to)??Infinity)){{ came.set(e.to,cur); g.set(e.to,cand); f.set(e.to,cand+h(e.to,goal)); open.add(e.to); }}
    }}
  }}
  return [start];
}}

function buildInstructions(path){{
  const ins=[];
  const startNode=nodesById.get(path[0]);
  ins.push({{text:`Start at ${{startNode.label||startNode.id}} (Floor ${{startNode.floor}})`}});

  for (let i=1;i<path.length;i++){{
    const A=nodesById.get(path[i-1]), B=nodesById.get(path[i]);
    const vertical = (A.type?.match(/STAIR|LIFT/i) || B.type?.match(/STAIR|LIFT/i)) && (A.floor!==B.floor);
    const dist = Math.hypot(B.x-A.x, B.y-A.y);
    const steps = Math.max(1, Math.round(dist / PX_PER_STEP));
    if (vertical){{
      const via = (A.type?.includes('LIFT')||B.type?.includes('LIFT'))?'lift':'stairs';
      const dir = (B.floor>A.floor)?'up':'down';
      ins.push({{text:`Take the ${{via}} ${{dir}} to Floor ${{B.floor}}`}});
    }} else {{
      ins.push({{text:`Go ${{steps}} steps straight`}});
    }}
  }}

  const endNode=nodesById.get(path[path.length-1]);
  ins.push({{text:`Arrive at ${{endNode.label||endNode.id}} (Floor ${{endNode.floor}})`}});
  return ins;
}
