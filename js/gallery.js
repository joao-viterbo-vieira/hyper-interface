// Demonstration graphs: three real knowledge hypergraphs, shown read-only next to the robot's memory.
// They are far too large for the poster's region drawing, so they are drawn only as a 2D or a 3D node-link
// picture: every hyperedge is a small coloured hub linked to its members. Positions are precomputed
// (tools/layout_demo_graphs.mjs), so a graph of ten thousand points appears at once and always looks the same.
// Exploring follows the Ontotipo interface: every node, hyperedge and paper has a note whose names are links, with
// back and forward; a double click draws only a node's neighbourhood; and a shortest path can be asked between two nodes.
// Each graph is a data/<id>.js file, loaded with a script tag the first time it is opened (works from file://).
(function () {
  const { theme, esc } = window.HI.canvas;
  const LIST = [['zotero', 'Zotero KG · 271 papers'], ['ontotipo', 'Ontotipo · 16 papers'], ['s2d', 'HarnessKG · S2D']];
  // sel: what the panel shows, { type: 'node' | 'edge' | 'paper', id } or { type: 'path', from, to, steps }
  // focus: what the canvas is cut down to, { type: 'node' | 'paper', id } or { type: 'path', edges }
  const G = { id: null, set: null, dim: 3, hidden: new Set(), sel: null, focus: null, hops: 1, error: null, pathFrom: null, all: false, wanted: null };
  let hist = [null], at = 0;                               // the notes visited, for back and forward
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
    s.byPaper = s.papers.map(() => []); s.edges.forEach((e, j) => { if (e.pp != null) s.byPaper[e.pp].push(j); });
    s.np = s.of.map((es) => new Set(es.map((j) => s.edges[j].pp)).size);        // how many papers speak of each node
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
    if (G.id !== id) { Object.assign(G, { id, set: null, hidden: new Set(), sel: null, focus: null, hops: 1, error: null, pathFrom: null, all: false }); hist = [null]; at = 0; }
    onChange();                                             // paints "Loading…"
    try { const s = await load(id); if (G.id === id) { G.set = s; restore(); } } catch (err) { if (G.id === id) G.error = err.message; }
    if (G.id === id) onChange();
    return true;
  }
  function close() { view?.stop(); view = null; Object.assign(G, { id: null, set: null, sel: null, focus: null, error: null, pathFrom: null, wanted: null }); }

  // the hyperedges on screen: all of them, those within `hops` of the focused node, one paper's, or a path; minus the hidden types
  function visibleEdges() {
    const s = G.set, ok = (j) => !G.hidden.has(s.edges[j].g), f = G.focus;
    if (!f) return s.edges.map((_, j) => j).filter(ok);
    if (f.type === 'path') return [...f.edges].sort((a, b) => a - b);
    if (f.type === 'paper') return s.byPaper[f.id].filter(ok);
    const keep = new Set(); let frontier = [f.id];
    for (let h = 0; h < G.hops; h++) {
      const next = new Set();
      for (const i of frontier) for (const j of s.of[i]) if (!keep.has(j) && ok(j)) { keep.add(j); for (const [k] of s.edges[j].m) next.add(k); }
      frontier = [...next];
    }
    return [...keep].sort((a, b) => a - b);
  }

  // ───────────────────────────── drawing ─────────────────────────────
  const focusKey = () => (G.focus ? G.focus.type + (G.focus.id ?? G.focus.edges.join('.')) : '');
  const key = () => [G.id, G.dim, [...G.hidden].sort().join(','), focusKey(), G.hops, dark()].join('|');
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
    const big = nodes.length > 3000, live = !!G.focus && nodes.length < 1500;   // a neighbourhood is small: lay it out afresh
    const r = (n) => (n.hub ? (big ? 1.5 : 2.2) : Math.min(15, 2.4 + 1.25 * Math.sqrt(n.deg)));
    let H = null, hk = null, lastClick = null;                  // the node the last click landed on
    const nodeColor = (n) => { const c = n.hub ? colorOf(s.edges[n.j].g) : T.ink; return !H || H.nodes.has(n.id) ? c : rgba(c, 0.1); };
    const linkColor = (l) => { const c = colorOf(s.edges[l.j].g); return !H || H.edges.has(l.j) ? c : rgba(c, 0.04); };
    const linkWidth = (l) => (H && H.edges.has(l.j) ? (big ? 2.6 : 1) : 0);
    const tip = (n) => `<div class="tip3d">${n.hub ? `<b style="color:${colorOf(s.edges[n.j].g)}">${esc(s.groups[s.edges[n.j].g].label)}</b><br>${esc(s.edges[n.j].t)}`
      : `<b>${esc(s.nodes[n.i].l)}</b><br>${esc(s.kinds[s.nodes[n.i].k])} · in ${plural(s.deg[n.i], s.unit)}`}</div>`;
    fg.width(el.clientWidth).height(el.clientHeight).backgroundColor('rgba(0,0,0,0)').showNavInfo(false).numDimensions(d)
      .nodeId('id').nodeRelSize(1).nodeVal((n) => Math.pow(r(n), 3)).nodeOpacity(0.95).nodeResolution(big ? 6 : 14)
      .nodeColor(nodeColor).nodeLabel(tip).linkColor(linkColor).linkOpacity(big ? 0.32 : 0.6).linkWidth(linkWidth)
      .onNodeClick((n) => {                             // click: its note
        lastClick = n.hub ? null : n.i;
        pick(n.hub ? { type: 'edge', id: n.j } : { type: 'node', id: n.i }, false);
      })
      .onBackgroundClick(() => { lastClick = null; if (G.sel?.type === 'node' || G.sel?.type === 'edge') pick(null, false); })
      .enableNodeDrag(false).warmupTicks(live ? 140 : 0).cooldownTicks(0).d3VelocityDecay(0.4).graphData({ nodes, links });
    if (live) {
      fg.d3Force('charge').strength((n) => (n.hub ? -50 : -150)); fg.d3Force('link').distance(34).strength(0.5);
      // a pull to the middle, so that the pieces of a part that is not connected do not drift out of sight
      fg.d3Force('gravity', (alpha) => { for (const n of nodes) { n.vx -= n.x * 0.07 * alpha; n.vy -= n.y * 0.07 * alpha; if (d === 3) n.vz -= n.z * 0.07 * alpha; } });
    }
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
      if (sel.type !== 'edge' && sel.type !== 'node') return;
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
      for (const n of [...byNode.values()].sort((a, b) => b.deg - a.deg).slice(0, el.clientWidth < 500 ? 12 : big ? 26 : 34)) pick.set(n.id, n);
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
      else if (sel?.type === 'paper' && G.focus?.type !== 'paper') {
        const es = s.byPaper[sel.id].filter((j) => shown.has(j));
        if (es.length) { h = { nodes: new Set(), edges: new Set(es) }; for (const j of es) { h.nodes.add('h' + j); for (const [i] of s.edges[j].m) h.nodes.add('n' + i); } }
      }
      const k = h ? sel.type + sel.id : '';
      if (k === hk) return;
      const first = hk === null; hk = k; H = h;
      if (!first || h) fg.nodeColor((n) => nodeColor(n)).linkColor((l) => linkColor(l)).linkWidth((l) => linkWidth(l)).linkOpacity(h ? 0.8 : big ? 0.32 : 0.6);
      setLabels();
    }
    fg.onEngineStop(() => { if (ready) return; measure(); ready = true; home(0); if (queued) { flyTo(queued); queued = null; } });
    const pause = () => { rotating = false; };
    host.addEventListener('dblclick', () => {             // double click on a node: draw only its neighbourhood
      if (lastClick != null && G.pathFrom == null) ACT['set-focus'](lastClick);
    });
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

  // ───────────────────────────── selection, history, paths and filters ─────────────────────────────
  const same = (a, b) => a === b || (!!a && !!b && a.type === b.type && a.id === b.id && a.from === b.from && a.to === b.to);
  function show(sel, fly, push) {
    G.sel = sel; G.all = false;
    if (push !== false && !same(hist[at], sel)) { hist = hist.slice(0, at + 1); hist.push(sel); at = hist.length - 1; }
    if (sel && G.set) {
      const s = G.set;
      if (sel.type === 'path') G.focus = sel.steps ? { type: 'path', edges: sel.steps.map((p) => p.edge) } : G.focus?.type === 'path' ? null : G.focus;
      else if (sel.type !== 'paper') {                      // something picked from a list may be filtered out: bring it back
        const vis = new Set(visibleEdges());
        if (!(sel.type === 'edge' ? vis.has(sel.id) : s.of[sel.id].some((j) => vis.has(j)))) { G.focus = null; G.hidden.clear(); }
      }
    }
    onChange();
    document.getElementById('panel')?.scrollTo(0, 0);
    if (fly && sel) view?.flyTo(sel);
  }
  // a node picked while a path is being asked for is the path's other end
  function pick(sel, fly) {
    if (sel?.type === 'node' && G.pathFrom != null && sel.id !== G.pathFrom) {
      const from = G.pathFrom; G.pathFrom = null;
      return show({ type: 'path', from, to: sel.id, steps: route(from, sel.id) }, false);
    }
    show(sel, fly);
  }
  // shortest hyperpath: the fewest hyperedges that lead from one node to the other
  function route(a, b) {
    const s = G.set, prev = new Map([[a, null]]), used = new Set(); let q = [a];
    while (q.length && !prev.has(b)) {
      const next = [];
      for (const i of q) for (const j of s.of[i]) { if (used.has(j)) continue; used.add(j); for (const [k] of s.edges[j].m) if (!prev.has(k)) { prev.set(k, [i, j]); next.push(k); } }
      q = next;
    }
    if (!prev.has(b)) return null;
    const steps = []; for (let k = b; prev.get(k); k = prev.get(k)[0]) steps.unshift({ from: prev.get(k)[0], edge: prev.get(k)[1], to: k });
    return steps;
  }
  const code = (x) => (x && x.id != null ? x.type[0] + x.id : '');
  function decode(v, types) {
    const s = G.set, t = { n: 'node', e: 'edge', p: 'paper' }[v?.[0]], id = +v?.slice(1), max = t && { node: s.nodes, edge: s.edges, paper: s.papers }[t].length;
    return t && types.includes(t) && Number.isInteger(id) && id >= 0 && id < max ? { type: t, id } : null;
  }
  function restore() {                                      // what the URL asked for, once the graph is loaded
    if (!G.wanted) return;
    const sel = decode(G.wanted.sel, ['node', 'edge', 'paper']); G.focus = decode(G.wanted.focus, ['node', 'paper']); G.wanted = null;
    if (sel) { G.sel = sel; hist = [null, sel]; at = 1; setTimeout(() => view?.flyTo(sel), 0); }
  }
  const ACT = {
    'set-view': (id) => { G.dim = id === '2d' ? 2 : 3; onChange(); },
    'set-edge': (id) => pick({ type: 'edge', id: +id }, true),
    'set-node': (id) => pick({ type: 'node', id: +id }, true),
    'set-paper': (id) => { G.pathFrom = null; show({ type: 'paper', id: +id }, false); },
    'set-focus': (id) => { G.focus = { type: 'node', id: +id }; G.pathFrom = null; show({ type: 'node', id: +id }, false); },
    'set-focus-paper': (id) => { G.focus = { type: 'paper', id: +id }; show({ type: 'paper', id: +id }, false); },
    'set-unfocus': () => { G.focus = null; onChange(); },
    'set-path-from': (id) => { G.pathFrom = G.pathFrom === +id ? null : +id; onChange(); },
    'set-back': () => { if (at > 0) show(hist[--at], true, false); },
    'set-fwd': () => { if (at < hist.length - 1) show(hist[++at], true, false); },
    'set-home': () => { G.pathFrom = null; show(null, false); },
    'set-more': () => { G.all = !G.all; onChange(); },
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
  function focusName() {
    const s = G.set, f = G.focus;
    if (f.type === 'paper') return short(s.papers[f.id]);
    if (f.type === 'node') return s.nodes[f.id].l;
    return G.sel?.type === 'path' ? short(s.nodes[G.sel.from].l) + ' → ' + short(s.nodes[G.sel.to].l) : 'path';
  }
  const optionsHTML = () => memorySelect() + (G.set && G.focus ? `<span class="focus" title="Only this part of the graph is drawn">${esc(focusName())}<button data-act="set-unfocus" title="Show the whole graph" aria-label="Show the whole graph">✕</button></span>
      ${G.focus.type === 'node' ? `<label>hops <select id="set-hops">${[1, 2].map((h) => `<option ${h === G.hops ? 'selected' : ''}>${h}</option>`).join('')}</select></label>` : ''}` : '') +
    (G.dim === 3 ? '<button data-act="set-rotate" class="link" title="Start or stop the slow turn">rotate / pause</button>' : '') + '<button data-act="set-reset" class="link">fit ⤢</button>';
  function legendHTML() {
    if (!G.set) return '';
    const n = G.set.groups.map(() => 0); for (const e of G.set.edges) n[e.g]++;
    return G.set.groups.map((g, i) => `<button class="ctx${G.hidden.has(i) ? ' off' : ''}" data-act="set-group" data-id="${i}" title="Click: show or hide · Alt-click: only this"><i style="background:${colorOf(i)}"></i>${esc(g.label)} <em>${n[i].toLocaleString('en')}</em></button>`).join('') +
      `<div class="keys"><span><svg width="26" height="10"><circle cx="13" cy="5" r="4.5" fill="${theme().ink}"/></svg>node, sized by its ${esc(G.set.unit)}s</span>
        <span><svg width="26" height="10"><circle cx="13" cy="5" r="2.6" fill="${colorOf(0)}"/></svg>one ${esc(G.set.unit)}, linked to its members</span></div>`;
  }
  const rows = (list) => `<dl class="kv">${list.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const chip = (i, n) => `<button class="chip" data-act="set-node" data-id="${i}">${esc(G.set.nodes[i].l)}${n ? ` <em>${n}</em>` : ''}</button>`;
  const paperChip = (i, n) => `<button class="chip paper" data-act="set-paper" data-id="${i}" title="${esc(G.set.papers[i])}">${esc(short(G.set.papers[i]))}${n ? ` <em>${n}</em>` : ''}</button>`;
  // the statement, with the members it names turned into links (longest name first, no overlaps)
  function linked(e) {
    const s = G.set, text = e.t, low = text.toLowerCase(), taken = [];
    const names = e.m.map(([i]) => [s.nodes[i].l.replace(/…$/, '').toLowerCase(), i]).filter(([n]) => n.length > 2).sort((a, b) => b[0].length - a[0].length);
    for (const [name, i] of names) {
      for (let p = low.indexOf(name); p >= 0; p = low.indexOf(name, p + name.length)) {
        const q = p + name.length;
        if (!taken.some(([a, b]) => p < b && q > a)) { taken.push([p, q, i]); break; }
      }
    }
    taken.sort((a, b) => a[0] - b[0]);
    let out = '', k = 0;
    for (const [p, q, i] of taken) { out += esc(text.slice(k, p)) + `<a href="#" data-act="set-node" data-id="${i}">${esc(text.slice(p, q))}</a>`; k = q; }
    return out + esc(text.slice(k));
  }
  function card(j) {
    const s = G.set, e = s.edges[j];
    return `<div class="fact${G.sel?.type === 'edge' && G.sel.id === j ? ' current' : ''}" role="button" tabindex="0" data-act="set-edge" data-id="${j}" style="--c:${colorOf(e.g)}"><span class="fid">${j + 1}</span><span><b>${linked(e)}</b>
      <span class="fmeta">${esc(s.groups[e.g].label)}${e.pp != null ? ` · <a href="#" data-act="set-paper" data-id="${e.pp}">${esc(s.papers[e.pp])}</a>` : ''}</span></span></div>`;
  }
  // statements grouped by type, the largest group first; the first `max` unless everything was asked for
  function statements(es, max = 40) {
    const s = G.set, by = new Map(); for (const j of es) { const g = s.edges[j].g; by.set(g, [...(by.get(g) || []), j]); }
    let left = G.all ? Infinity : max, out = '';
    for (const [g, js] of [...by].sort((a, b) => b[1].length - a[1].length)) {
      if (left <= 0) break;
      out += `<h3 class="grp" style="color:${colorOf(g)}">■ ${esc(s.groups[g].label)} <em>${js.length}</em></h3>` + js.slice(0, left).map(card).join('');
      left -= js.length;
    }
    return out + more(es.length, max);
  }
  const more = (n, max) => (n > max ? `<p class="muted note">${G.all ? `All ${n.toLocaleString('en')} shown.` : `The first ${max} of ${n.toLocaleString('en')}.`} <button class="textlink" data-act="set-more">${G.all ? 'Show fewer' : 'Show all'}</button></p>` : '');
  const tally = (ids) => { const c = new Map(); for (const i of ids) c.set(i, (c.get(i) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1]); };
  const navHTML = () => (hist.length > 1 || G.sel ? `<div class="navrow"><button data-act="set-back" title="Back" aria-label="Back" ${at > 0 ? '' : 'disabled'}>←</button><button data-act="set-fwd" title="Forward" aria-label="Forward" ${at < hist.length - 1 ? '' : 'disabled'}>→</button>
    <button data-act="set-home" ${G.sel ? '' : 'disabled'}>Overview</button></div>` : '') +
    (G.pathFrom != null ? `<p class="armed">Path from <b>${esc(G.set.nodes[G.pathFrom].l)}</b>: pick where it should end. Click a node in the graph, a name in this panel, or search. <button class="textlink" data-act="set-path-from" data-id="${G.pathFrom}">Cancel</button></p>` : '');
  const focusButton = (type, id) => (G.focus?.type === type && G.focus.id === id ? '<button data-act="set-unfocus">Show the whole graph</button>'
    : `<button class="primary" data-act="${type === 'node' ? 'set-focus' : 'set-focus-paper'}" data-id="${id}">View in the hypergraph</button>`);
  function panelHTML() {
    const s = G.set;
    if (!s) return `<div class="eyebrow">Demonstration · read-only</div><h1>${esc((LIST.find((l) => l[0] === G.id) || [])[1] || '')}</h1><p class="muted">${G.error ? esc(G.error) : 'Loading…'}</p>`;
    if (G.sel?.type === 'edge') {
      const e = s.edges[G.sel.id], col = colorOf(e.g), p = e.p || {};
      return `${navHTML()}<div class="eyebrow">Hyperedge · ${esc(s.unit)} ${G.sel.id + 1}</div><h1 style="color:${col}">${linked(e)}</h1>
        <div class="badges"><span class="badge" style="color:${col}">${esc(s.groups[e.g].label)}</span><span class="badge">${plural(e.m.length, 'member')}</span><span class="badge">read-only</span></div>
        <h2>Roles</h2>${rows(e.m.map(([i, role]) => [esc(role), chip(i)]))}
        <h2>Provenance</h2>${rows([e.pp != null ? ['source', `<a href="#" data-act="set-paper" data-id="${e.pp}">${esc(s.papers[e.pp])}</a>`] : null,
          ...Object.entries(p).filter(([k]) => k !== 'quote' && k !== 'confidence').map(([k, v]) => [esc(k), esc(v)]),
          p.confidence != null ? ['confidence', `<span class="conf"><i style="width:${Math.round(p.confidence * 100)}%"></i></span>${(+p.confidence).toFixed(2)}`] : null,
          p.quote ? ['quote', '“' + esc(p.quote) + '”'] : null])}
        <p class="muted note">From ${esc(s.source)}. Shown for demonstration: it cannot be edited or reviewed here.</p>`;
    }
    if (G.sel?.type === 'node') {
      const i = G.sel.id, n = s.nodes[i], es = s.of[i];
      const papers = s.papers.length ? tally(es.map((j) => s.edges[j].pp)) : [];
      const related = tally(es.flatMap((j) => s.edges[j].m.map(([k]) => k)).filter((k) => k !== i)).slice(0, 16);
      return `${navHTML()}<div class="eyebrow">Node</div><h1>${esc(n.l)}</h1>
        <div class="badges"><span class="badge">${esc(s.kinds[n.k])}</span><span class="badge">in ${plural(es.length, s.unit)}</span>${papers.length ? `<span class="badge">${plural(papers.length, 'paper')}</span>` : ''}</div>
        ${n.d ? `<p>${esc(n.d)}</p>` : ''}
        <div class="review">${focusButton('node', i)}<button data-act="set-path-from" data-id="${i}">${G.pathFrom === i ? 'Cancel the path' : 'Path from here'}</button></div>
        ${papers.length ? `<h2>Backlinks · the papers that speak of it</h2><div class="chips">${papers.slice(0, G.all ? Infinity : 12).map(([p, c]) => paperChip(p, c)).join('')}</div>${more(papers.length, 12)}` : ''}
        <h2>${plural(es.length, s.unit)} about it</h2>${statements(es)}
        ${related.length ? `<h2>Related · named in the same ${esc(s.unit)}s</h2><div class="chips">${related.map(([k, c]) => chip(k, c)).join('')}</div>` : ''}`;
    }
    if (G.sel?.type === 'paper') {
      const p = G.sel.id, es = s.byPaper[p], top = tally(es.flatMap((j) => s.edges[j].m.map(([k]) => k)));
      return `${navHTML()}<div class="eyebrow">Paper · ${p + 1} of ${s.papers.length}</div><h1>${esc(s.papers[p])}</h1>
        <div class="badges"><span class="badge">${plural(es.length, s.unit)}</span><span class="badge">${plural(top.length, 'node')}</span></div>
        <div class="review">${focusButton('paper', p)}</div>
        <h2>Main concepts</h2><div class="chips">${top.slice(0, 18).map(([k, c]) => chip(k, c)).join('')}</div>
        <h2>${plural(es.length, s.unit)}</h2>${statements(es)}`;
    }
    if (G.sel?.type === 'path') {
      const { from, to, steps } = G.sel;
      return `${navHTML()}<div class="eyebrow">Shortest path</div><h1>${esc(s.nodes[from].l)} → ${esc(s.nodes[to].l)}</h1>
        ${steps ? `<div class="badges"><span class="badge">${plural(steps.length, 'hyperedge')}</span></div>
          <p class="muted note">The fewest ${esc(s.unit)}s that lead from one to the other. Only these are drawn.</p>
          <div class="pathsteps">${chip(from)}${steps.map((st) => card(st.edge) + chip(st.to)).join('')}</div>
          <div class="review"><button data-act="set-unfocus">Show the whole graph</button><button data-act="set-path-from" data-id="${from}">Another path from ${esc(short(s.nodes[from].l))}</button></div>`
        : `<p>No chain of ${esc(s.unit)}s connects them.</p><div class="chips">${chip(from)}${chip(to)}</div>`}`;
    }
    const perPaper = s.byPaper.map((es) => es.length);
    const papers = s.papers.map((_, i) => i).sort((a, b) => perPaper[b] - perPaper[a]);
    const shared = s.papers.length ? s.top.filter((i) => s.np[i] >= 2).sort((a, b) => s.np[b] - s.np[a] || s.deg[b] - s.deg[a]) : [];
    return `${navHTML()}<div class="eyebrow">Demonstration · read-only</div><h1>${esc(s.title)}</h1><p>${esc(s.blurb)}</p>
      ${rows(s.stats.map(([k, v]) => [esc(k), typeof v === 'number' ? v.toLocaleString('en') : esc(v)]))}
      ${papers.length ? `<h2>Papers</h2>${papers.slice(0, G.all ? Infinity : 12).map((i) => `<button class="paperrow" data-act="set-paper" data-id="${i}"><b>${esc(s.papers[i])}</b><span class="muted">${plural(perPaper[i], s.unit)}</span></button>`).join('')}${more(papers.length, 12)}` : ''}
      ${shared.length ? `<h2>Ideas in common · ${shared.length.toLocaleString('en')} nodes in two or more papers</h2><div class="chips">${shared.slice(0, 24).map((i) => chip(i, s.np[i])).join('')}</div>` : ''}
      <h2>Most connected</h2><div class="chips">${s.top.slice(0, 18).map((i) => chip(i, s.deg[i])).join('')}</div>
      <h2>How to explore</h2>
      <p class="muted note">Click a node or a hub to open its note; double-click a node to draw only its neighbourhood. In a note, every name is a link, ← and → walk back through what you opened, and “Path from here” finds the shortest chain of ${esc(s.unit)}s to another node. Drag to ${G.dim === 3 ? 'turn' : 'pan'}; scroll to zoom. This graph is shown for demonstration, in 2D and 3D only: the region drawing, editing, the timeline and review belong to the robot's memory. Source: ${esc(s.source)}.</p>`;
  }
  function searchHTML(q) {
    const s = G.set; if (!s) return '<p>The graph is still loading.</p>';
    const ns = [], es = [];
    for (const i of s.top) { if (s.nodes[i].l.toLowerCase().includes(q)) { ns.push(i); if (ns.length === 7) break; } }
    for (let j = 0; j < s.edges.length && es.length < 8; j++) if (s.edges[j].t.toLowerCase().includes(q)) es.push(j);
    const ps = []; for (let i = 0; i < s.papers.length && ps.length < 4; i++) if (s.papers[i].toLowerCase().includes(q)) ps.push(i);
    return ns.map((i) => `<button data-act="set-node" data-id="${i}">${esc(s.nodes[i].l)} <em>${esc(s.kinds[s.nodes[i].k])} · ${s.deg[i]}</em></button>`).join('') +
      ps.map((i) => `<button data-act="set-paper" data-id="${i}">${esc(s.papers[i])} <em>paper</em></button>`).join('') +
      es.map((j) => `<button data-act="set-edge" data-id="${j}"><b style="color:${colorOf(s.edges[j].g)}">${j + 1}</b> ${esc(s.edges[j].t)}</button>`).join('') || '<p>Nothing matches in this graph.</p>';
  }

  window.HI.gallery = { LIST, state: G, open, close, draw, act: ACT, memorySelect, viewsHTML, optionsHTML, legendHTML, panelHTML, searchHTML,
    setHops(h) { G.hops = h; onChange(); }, want(sel, focus) { G.wanted = sel || focus ? { sel, focus } : null; },
    hash: () => ({ sel: code(G.sel), focus: code(G.focus) }), resize() { view?.resize(); }, onChange(f) { onChange = f; },
    footHTML: () => (G.set ? `<p class="setnote"><b>${esc(G.set.title)}</b><span> · a snapshot shown for demonstration, read-only. It has no memory states to replay.</span> <button data-act="memory" data-id="">Back to robot R1</button></p>` : '') };
})();
