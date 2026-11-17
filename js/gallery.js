// Demonstration graphs: three real knowledge hypergraphs, shown read-only next to the robot's memory.
// They are far too large for the poster's region drawing, so they are drawn only as a 2D or a 3D node-link
// picture: every hyperedge is a small coloured hub linked to its members. Positions are precomputed
// (tools/layout_demo_graphs.mjs), so a graph of ten thousand points appears at once and always looks the same.
// Each graph is a data/<id>.js file, loaded with a script tag the first time it is opened (works from file://).
(function () {
  const { theme, esc } = window.HI.canvas;
  const LIST = [['zotero', 'Zotero KG · 271 papers'], ['ontotipo', 'Ontotipo · 16 papers'], ['s2d', 'HarnessKG · S2D']];
  const G = { id: null, set: null, dim: 3, hidden: new Set(), sel: null, focus: null, hops: 1, error: null };
  const loading = {};
  let view = null, onChange = () => {};
  const dark = () => document.documentElement.dataset.theme !== 'light';
  const colorOf = (g) => { const v = G.set.groups[g]; return dark() ? v.dark : v.color; };
  const rgba = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; };
  const short = (t) => (t.length > 44 ? t.slice(0, 42).trimEnd() + '…' : t);
  const plural = (n, w) => n.toLocaleString('en') + ' ' + w + (n === 1 ? '' : 's');

  function prep(s) {
    if (s.deg) return s;
    s.deg = new Array(s.nodes.length).fill(0); s.of = s.nodes.map(() => []);
    s.edges.forEach((e, j) => { for (const [i] of e.m) { s.deg[i]++; s.of[i].push(j); } });
    s.top = s.nodes.map((_, i) => i).sort((a, b) => s.deg[b] - s.deg[a]);
    return s;
  }
  function load(id) {
    return loading[id] || (loading[id] = new Promise((res, rej) => {
      if (window.HI_SETS?.[id]) return res(prep(window.HI_SETS[id]));
      const el = document.createElement('script'); el.src = 'data/' + id + '.js';
      el.onload = () => (window.HI_SETS?.[id] ? res(prep(window.HI_SETS[id])) : rej(new Error('data/' + id + '.js is empty')));
      el.onerror = () => { delete loading[id]; rej(new Error('could not load data/' + id + '.js')); };
      document.head.appendChild(el);
    }));
  }
  async function open(id) {
    if (!LIST.some((l) => l[0] === id)) return false;
    if (G.id !== id) Object.assign(G, { id, set: null, hidden: new Set(), sel: null, focus: null, hops: 1, error: null });
    onChange();                                             // paints "Loading…"
    try { const s = await load(id); if (G.id === id) G.set = s; } catch (err) { if (G.id === id) G.error = err.message; }
    if (G.id === id) onChange();
    return true;
  }
  function close() { view?.stop(); view = null; Object.assign(G, { id: null, set: null, sel: null, focus: null, error: null }); }

  // the hyperedges on screen: all of them, or those within `hops` of the focused node; minus the hidden types
  function visibleEdges() {
    const s = G.set, ok = (j) => !G.hidden.has(s.edges[j].g);
    if (G.focus == null) return s.edges.map((_, j) => j).filter(ok);
    const keep = new Set(); let frontier = [G.focus];
    for (let h = 0; h < G.hops; h++) {
      const next = new Set();
      for (const i of frontier) for (const j of s.of[i]) if (!keep.has(j) && ok(j)) { keep.add(j); for (const [k] of s.edges[j].m) next.add(k); }
      frontier = [...next];
    }
    return [...keep].sort((a, b) => a - b);
  }

  // ───────────────────────────── drawing ─────────────────────────────
  const key = () => [G.id, G.dim, [...G.hidden].sort().join(','), G.focus, G.hops, dark()].join('|');
  function draw(el) {
    if (!G.set) {
      view?.stop(); view = null;
      el.innerHTML = `<p class="nogl">${G.error ? esc(G.error) + '. Serve the folder or open index.html from the repository so that data/ is next to it.' : 'Loading the graph…'}</p>`;
      return { edges: 0, nodes: 0 };
    }
    if (!view || view.key !== key()) { view?.stop(); view = build(el); }
    view.highlight();
    return view.count;
  }

  function build(el) {
    el.innerHTML = '';
    const host = document.createElement('div'), layer = document.createElement('div');
    host.className = 'g3d'; layer.className = 'labels3d'; el.append(host, layer);
    const s = G.set, T = theme(), N = s.nodes.length, d = G.dim, P = d === 3 ? s.p3 : s.p2;
    const pos = (k) => (d === 3 ? { x: P[3 * k], y: P[3 * k + 1], z: P[3 * k + 2] } : { x: P[2 * k], y: P[2 * k + 1], z: 0 });
    const js = visibleEdges(), shown = new Set(js), nodes = [], links = [], byNode = new Map(), hubs = new Map();
    for (const j of js) {
      const hub = { id: 'h' + j, j, hub: true, ...pos(N + j) }; nodes.push(hub); hubs.set(j, hub);
      for (const [i] of s.edges[j].m) {
        let n = byNode.get(i);
        if (!n) { n = { id: 'n' + i, i, hub: false, deg: 0, ...pos(i) }; byNode.set(i, n); nodes.push(n); }
        n.deg++; links.push({ source: hub.id, target: n.id, j });
      }
    }
    const count = { edges: js.length, nodes: byNode.size }, base = { key: key(), count };
    let fg;
    try { fg = ForceGraph3D({ rendererConfig: { antialias: true, alpha: true } })(host); }
    catch (err) {
      el.innerHTML = '<p class="nogl">These graphs are drawn with WebGL, which this browser has switched off.</p>';
      return { ...base, stop() {}, highlight() {}, flyTo() {}, toggleRotate() {}, reset() {}, resize() {} };
    }
    const big = nodes.length > 3000, live = G.focus != null && nodes.length < 1500;   // a neighbourhood is small: lay it out afresh
    const r = (n) => (n.hub ? (big ? 1.5 : 2.2) : Math.min(15, 2.4 + 1.25 * Math.sqrt(n.deg)));
    let H = null, hk = null;
    const nodeColor = (n) => { const c = n.hub ? colorOf(s.edges[n.j].g) : T.ink; return !H || H.nodes.has(n.id) ? c : rgba(c, 0.1); };
    const linkColor = (l) => { const c = colorOf(s.edges[l.j].g); return !H || H.edges.has(l.j) ? c : rgba(c, 0.04); };
    const linkWidth = (l) => (H && H.edges.has(l.j) ? (big ? 2.6 : 1) : 0);
    const tip = (n) => `<div class="tip3d">${n.hub ? `<b style="color:${colorOf(s.edges[n.j].g)}">${esc(s.groups[s.edges[n.j].g].label)}</b><br>${esc(s.edges[n.j].t)}`
      : `<b>${esc(s.nodes[n.i].l)}</b><br>${esc(s.kinds[s.nodes[n.i].k])} · in ${plural(s.deg[n.i], s.unit)}`}</div>`;
    fg.width(el.clientWidth).height(el.clientHeight).backgroundColor('rgba(0,0,0,0)').showNavInfo(false).numDimensions(d)
      .nodeId('id').nodeRelSize(1).nodeVal((n) => Math.pow(r(n), 3)).nodeOpacity(0.95).nodeResolution(big ? 6 : 14)
      .nodeColor(nodeColor).nodeLabel(tip).linkColor(linkColor).linkOpacity(big ? 0.32 : 0.6).linkWidth(linkWidth)
      .onNodeClick((n) => select(n.hub ? { type: 'edge', id: n.j } : { type: 'node', id: n.i }, false))
      .onBackgroundClick(() => select(null, false))
      .enableNodeDrag(false).warmupTicks(live ? 140 : 0).cooldownTicks(0).d3VelocityDecay(0.4).graphData({ nodes, links });
    if (live) { fg.d3Force('charge').strength((n) => (n.hub ? -50 : -150)); fg.d3Force('link').distance(34).strength(0.5); }
    const ctl = fg.controls();
    if (d === 2 && ctl) { ctl.noRotate = true; if (ctl.mouseButtons) { ctl.mouseButtons.LEFT = 2; ctl.mouseButtons.RIGHT = 0; } }   // flat: drag pans

    let centre = { x: 0, y: 0, z: 0 }, radius = 200, dist = 600, ready = false, rotating = d === 3, phase = 0, last = performance.now(), alive = true, queued = null;
    let labelled = [];
    function measure() {
      const ns = nodes.filter((n) => isFinite(n.x)); if (!ns.length) return;
      const mean = (k) => ns.reduce((a, n) => a + (n[k] || 0), 0) / ns.length;
      centre = { x: mean('x'), y: mean('y'), z: d === 3 ? mean('z') : 0 };
      const ds = ns.map((n) => Math.hypot(n.x - centre.x, n.y - centre.y, (n.z || 0) - centre.z)).sort((a, b) => a - b);
      radius = Math.max(60, ds[Math.floor((ds.length - 1) * 0.97)] * 1.18);                 // a few stragglers must not shrink the picture
      const cam = fg.camera(), v = cam.fov * Math.PI / 180, h = 2 * Math.atan(Math.tan(v / 2) * cam.aspect);
      dist = d === 3 ? (radius * 1.1) / Math.sin(Math.min(v, h) / 2) : radius / Math.tan(Math.min(v, h) / 2);
    }
    function home(ms) {
      if (d === 2) return fg.cameraPosition({ x: centre.x, y: centre.y, z: dist }, { x: centre.x, y: centre.y, z: 0 }, ms);
      const a = phase * Math.PI * 2, elev = 0.22 * Math.sin(a) + 0.12;
      fg.cameraPosition({ x: centre.x + dist * Math.cos(elev) * Math.sin(a), y: centre.y + dist * Math.sin(elev), z: centre.z + dist * Math.cos(elev) * Math.cos(a) }, centre, ms);
    }
    function flyTo(sel) {                       // frame a node, or a hyperedge with all its members
      if (!ready) { queued = sel; return; }
      const n = sel.type === 'edge' ? hubs.get(sel.id) : byNode.get(sel.id); if (!n) return;
      rotating = false;
      const pts = sel.type === 'edge' ? [n, ...s.edges[sel.id].m.map(([i]) => byNode.get(i))] : [n];
      const c = { x: 0, y: 0, z: 0 }; for (const q of pts) { c.x += q.x / pts.length; c.y += q.y / pts.length; c.z += (q.z || 0) / pts.length; }
      const span = Math.max(...pts.map((q) => Math.hypot(q.x - c.x, q.y - c.y, (q.z || 0) - c.z)));
      const cam = fg.camera(), half = Math.min(cam.fov * Math.PI / 360, Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect));
      const D = Math.max(Math.max(170, radius * 0.3), span * 1.5 / Math.tan(half));
      if (d === 2) return fg.cameraPosition({ x: c.x, y: c.y, z: D }, { x: c.x, y: c.y, z: 0 }, 700);
      let v = { x: c.x - centre.x, y: c.y - centre.y, z: c.z - centre.z }, L = Math.hypot(v.x, v.y, v.z);
      if (L < 1) { v = { x: 0, y: 0, z: 1 }; L = 1; }
      fg.cameraPosition({ x: c.x + v.x / L * D, y: c.y + v.y / L * D, z: c.z + v.z / L * D }, c, 700);
    }
    // names: the best-connected nodes on screen, plus the members of whatever is selected
    function setLabels() {
      const pick = new Map();
      for (const n of [...byNode.values()].sort((a, b) => b.deg - a.deg).slice(0, big ? 26 : 34)) pick.set(n.id, n);
      if (H) { let k = 0; for (const id of H.nodes) { const n = id[0] === 'n' && byNode.get(+id.slice(1)); if (n && !pick.has(id) && k++ < 30) pick.set(id, n); } }
      layer.innerHTML = ''; labelled = [...pick.values()];
      for (const n of labelled) { const e = document.createElement('div'); e.className = 'lbl3d'; e.textContent = short(s.nodes[n.i].l); layer.appendChild(e); n._el = e; }
    }
    function labels() {
      const camera = fg.camera(), cam = camera.position, px = el.clientHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
      for (const n of labelled) {
        const dd = Math.hypot(n.x - cam.x, n.y - cam.y, (n.z || 0) - cam.z), p = fg.graph2ScreenCoords(n.x, n.y, n.z || 0);
        const size = Math.max(9, Math.min(14.5, 11 * Math.sqrt(dist / dd))), dim = H && !H.nodes.has(n.id);
        n._el.style.opacity = dim ? '0.16' : '1';
        n._el.style.fontSize = size.toFixed(1) + 'px';
        n._el.style.transform = `translate(${(p.x + r(n) * px / dd + 4).toFixed(1)}px,${(p.y - size * 0.62).toFixed(1)}px)`;
      }
    }
    function highlight() {
      const sel = G.sel; let h = null;
      if (sel?.type === 'edge' && shown.has(sel.id)) h = { nodes: new Set(['h' + sel.id, ...s.edges[sel.id].m.map(([i]) => 'n' + i)]), edges: new Set([sel.id]) };
      else if (sel?.type === 'node' && byNode.has(sel.id)) {
        const es = s.of[sel.id].filter((j) => shown.has(j));
        h = { nodes: new Set(['n' + sel.id]), edges: new Set(es) };
        for (const j of es) { h.nodes.add('h' + j); for (const [i] of s.edges[j].m) h.nodes.add('n' + i); }
      }
      const k = h ? sel.type + sel.id : '';
      if (k === hk) return;
      const first = hk === null; hk = k; H = h;
      if (!first || h) fg.nodeColor((n) => nodeColor(n)).linkColor((l) => linkColor(l)).linkWidth((l) => linkWidth(l)).linkOpacity(h ? 0.8 : big ? 0.32 : 0.6);
      setLabels();
    }
    fg.onEngineStop(() => { if (ready) return; measure(); ready = true; home(0); if (queued) { flyTo(queued); queued = null; } });
    const pause = () => { rotating = false; };
    host.addEventListener('pointerdown', pause); host.addEventListener('wheel', pause, { passive: true });
    (function loop(now) {
      if (!alive) return;
      if (ready) { if (rotating) { phase = (phase + (now - last) / 70000) % 1; home(0); } labels(); }
      last = now; requestAnimationFrame(loop);
    })(performance.now());
    return { ...base, highlight, flyTo, resize() { fg.width(el.clientWidth).height(el.clientHeight); },
      stop() { alive = false; fg.pauseAnimation(); fg._destructor?.(); el.innerHTML = ''; },
      toggleRotate() { if (d === 3) rotating = !rotating; },
      reset() { rotating = false; if (ready) home(600); } };
  }

  // ───────────────────────────── selection and filters ─────────────────────────────
  function select(sel, fly) {
    G.sel = sel;
    if (sel && G.set) {                                     // something picked from a list may be filtered out: bring it back
      const vis = new Set(visibleEdges()), s = G.set;
      const on = sel.type === 'edge' ? vis.has(sel.id) : s.of[sel.id].some((j) => vis.has(j));
      if (!on) { G.focus = null; G.hidden.clear(); }
    }
    onChange();
    if (fly && sel) view?.flyTo(sel);
  }
  const ACT = {
    'set-view': (id) => { G.dim = id === '2d' ? 2 : 3; onChange(); },
    'set-edge': (id) => select({ type: 'edge', id: +id }, true),
    'set-node': (id) => select({ type: 'node', id: +id }, true),
    'set-focus': (id) => { G.focus = +id; G.sel = { type: 'node', id: +id }; onChange(); },
    'set-unfocus': () => { G.focus = null; onChange(); },
    'set-group': (id, ev) => {
      const all = G.set.groups.map((_, i) => i); id = +id;
      if (ev.altKey) G.hidden = new Set(G.hidden.size === all.length - 1 && !G.hidden.has(id) ? [] : all.filter((g) => g !== id));
      else G.hidden.has(id) ? G.hidden.delete(id) : G.hidden.add(id);
      onChange();
    },
    'set-rotate': () => view?.toggleRotate(),
    'set-reset': () => view?.reset(),
  };

  // ───────────────────────────── the window around it ─────────────────────────────
  const memorySelect = () => `<label title="The robot's memory, or a real knowledge hypergraph shown for demonstration">memory <select id="memory">
    <option value="">Robot R1 (poster example)</option><optgroup label="Demonstrations · read-only, 2D and 3D">
    ${LIST.map(([id, name]) => `<option value="${id}" ${id === G.id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</optgroup></select></label>`;
  const viewsHTML = () => [['2d', '2D', 'The graph laid flat'], ['3d', '3D', 'The graph in space']]
    .map(([id, name, title]) => `<button data-act="set-view" data-id="${id}" title="${title}" class="${(id === '2d') === (G.dim === 2) ? 'active' : ''}">${name}</button>`).join('');
  const optionsHTML = () => memorySelect() + (G.set && G.focus != null ? `<span class="focus">${esc(G.set.nodes[G.focus].l)}<button data-act="set-unfocus" title="Clear the focus" aria-label="Clear the focus">✕</button></span>
      <label>hops <select id="set-hops">${[1, 2].map((h) => `<option ${h === G.hops ? 'selected' : ''}>${h}</option>`).join('')}</select></label>` : '') +
    (G.dim === 3 ? '<button data-act="set-rotate" class="link" title="Start or stop the slow turn">rotate / pause</button>' : '') + '<button data-act="set-reset" class="link">fit ⤢</button>';
  function legendHTML() {
    if (!G.set) return '';
    const n = G.set.groups.map(() => 0); for (const e of G.set.edges) n[e.g]++;
    return G.set.groups.map((g, i) => `<button class="ctx${G.hidden.has(i) ? ' off' : ''}" data-act="set-group" data-id="${i}" title="Click: show or hide · Alt-click: only this"><i style="background:${colorOf(i)}"></i>${esc(g.label)} <em>${n[i].toLocaleString('en')}</em></button>`).join('') +
      `<div class="keys"><span><svg width="26" height="10"><circle cx="13" cy="5" r="4.5" fill="${theme().ink}"/></svg>node, sized by its ${esc(G.set.unit)}s</span>
        <span><svg width="26" height="10"><circle cx="13" cy="5" r="2.6" fill="${colorOf(0)}"/></svg>one ${esc(G.set.unit)}, linked to its members</span></div>`;
  }
  const rows = (list) => `<dl class="kv">${list.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const chip = (i) => `<button class="chip" data-act="set-node" data-id="${i}">${esc(G.set.nodes[i].l)}</button>`;
  function card(j) {
    const s = G.set, e = s.edges[j];
    return `<button class="fact${G.sel?.type === 'edge' && G.sel.id === j ? ' current' : ''}" data-act="set-edge" data-id="${j}" style="--c:${colorOf(e.g)}"><span class="fid">${j + 1}</span><span><b>${esc(e.t)}</b>
      <span class="fmeta">${esc(s.groups[e.g].label)}${e.pp != null ? ' · ' + esc(s.papers[e.pp]) : ''}</span></span></button>`;
  }
  function panelHTML() {
    const s = G.set;
    if (!s) return `<div class="eyebrow">Demonstration · read-only</div><h1>${esc((LIST.find((l) => l[0] === G.id) || [])[1] || '')}</h1><p class="muted">${G.error ? esc(G.error) : 'Loading…'}</p>`;
    if (G.sel?.type === 'edge') {
      const e = s.edges[G.sel.id], col = colorOf(e.g), p = e.p || {};
      return `<div class="eyebrow">Selected hyperedge · ${esc(s.unit)} ${G.sel.id + 1}</div><h1 style="color:${col}">${esc(e.t)}</h1>
        <div class="badges"><span class="badge" style="color:${col}">${esc(s.groups[e.g].label)}</span><span class="badge">${plural(e.m.length, 'member')}</span><span class="badge">read-only</span></div>
        <h2>Roles</h2>${rows(e.m.map(([i, role]) => [esc(role), chip(i)]))}
        <h2>Provenance</h2>${rows([e.pp != null ? ['source', esc(s.papers[e.pp])] : null,
          ...Object.entries(p).filter(([k]) => k !== 'quote' && k !== 'confidence').map(([k, v]) => [esc(k), esc(v)]),
          p.confidence != null ? ['confidence', `<span class="conf"><i style="width:${Math.round(p.confidence * 100)}%"></i></span>${(+p.confidence).toFixed(2)}`] : null,
          p.quote ? ['quote', '“' + esc(p.quote) + '”'] : null])}
        <p class="muted note">From ${esc(s.source)}. Shown for demonstration: it cannot be edited or reviewed here.</p>`;
    }
    if (G.sel?.type === 'node') {
      const i = G.sel.id, n = s.nodes[i], es = s.of[i], max = 60;
      return `<div class="eyebrow">Node</div><h1>${esc(n.l)}</h1>
        <div class="badges"><span class="badge">${esc(s.kinds[n.k])}</span><span class="badge">in ${plural(es.length, s.unit)}</span></div>
        ${n.d ? `<p>${esc(n.d)}</p>` : ''}
        <div class="review">${G.focus === i ? '<button data-act="set-unfocus">Show the whole graph</button>' : `<button data-act="set-focus" data-id="${i}">Show only its neighbourhood</button>`}</div>
        <h2>${plural(es.length, s.unit)} about it</h2>${es.slice(0, max).map(card).join('')}
        ${es.length > max ? `<p class="muted note">The first ${max} of ${es.length.toLocaleString('en')}.</p>` : ''}`;
    }
    const perPaper = s.papers.map(() => 0); for (const e of s.edges) if (e.pp != null) perPaper[e.pp]++;
    const papers = s.papers.map((_, i) => i).sort((a, b) => perPaper[b] - perPaper[a]);
    return `<div class="eyebrow">Demonstration · read-only</div><h1>${esc(s.title)}</h1><p>${esc(s.blurb)}</p>
      ${rows(s.stats.map(([k, v]) => [esc(k), typeof v === 'number' ? v.toLocaleString('en') : esc(v)]))}
      <h2>Most connected</h2><div class="chips">${s.top.slice(0, 18).map(chip).join('')}</div>
      ${papers.length ? `<h2>Sources</h2>${papers.slice(0, 10).map((i) => `<div class="step"><b>${esc(s.papers[i])}</b><div class="muted">${plural(perPaper[i], s.unit)}</div></div>`).join('')}
        ${papers.length > 10 ? `<p class="muted note">and ${papers.length - 10} more.</p>` : ''}` : ''}
      <p class="muted note">Click a node or a hub to inspect it, or search by name. Drag to ${G.dim === 3 ? 'turn' : 'pan'}; scroll to zoom. This graph is shown for demonstration, in 2D and 3D only: the region drawing, editing, the timeline and review belong to the robot's memory. Source: ${esc(s.source)}.</p>`;
  }
  function searchHTML(q) {
    const s = G.set; if (!s) return '<p>The graph is still loading.</p>';
    const ns = [], es = [];
    for (const i of s.top) { if (s.nodes[i].l.toLowerCase().includes(q)) { ns.push(i); if (ns.length === 7) break; } }
    for (let j = 0; j < s.edges.length && es.length < 8; j++) if (s.edges[j].t.toLowerCase().includes(q)) es.push(j);
    return ns.map((i) => `<button data-act="set-node" data-id="${i}">${esc(s.nodes[i].l)} <em>${esc(s.kinds[s.nodes[i].k])} · ${s.deg[i]}</em></button>`).join('') +
      es.map((j) => `<button data-act="set-edge" data-id="${j}"><b style="color:${colorOf(s.edges[j].g)}">${j + 1}</b> ${esc(s.edges[j].t)}</button>`).join('') || '<p>Nothing matches in this graph.</p>';
  }

  window.HI.gallery = { LIST, state: G, open, close, draw, act: ACT, memorySelect, viewsHTML, optionsHTML, legendHTML, panelHTML, searchHTML,
    setHops(h) { G.hops = h; onChange(); }, resize() { view?.resize(); }, onChange(f) { onChange = f; },
    footHTML: () => (G.set ? `<p class="setnote"><b>${esc(G.set.title)}</b> · a snapshot shown for demonstration, read-only. It has no memory states to replay. <button data-act="memory" data-id="">Back to robot R1</button></p>` : '') };
})();
