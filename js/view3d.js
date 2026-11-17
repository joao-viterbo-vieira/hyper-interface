// The same memory state in 3D: entities are spheres, each hyperedge is a small hub linked to its members.
// It starts from the 2D positions, so the picture is recognisable, and turns slowly until you touch it.
// Selecting something only restyles the scene: the layout and the camera stay where they are.
(function () {
  const { styleOf, theme, esc } = window.HI.canvas;
  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

  function render(el, model, ctx) {
    el.innerHTML = '';
    const host = document.createElement('div'), layer = document.createElement('div'), hint = document.createElement('p');
    host.className = 'g3d'; layer.className = 'labels3d'; hint.className = 'hint3d';
    hint.textContent = 'drag to orbit · scroll to zoom · right-drag to pan · click a sphere or a fact to inspect it';
    el.append(host, layer, hint);
    const T = theme();
    // entities keep their 2D place and get a little depth, so the turning picture is really three-dimensional
    const nodes = model.nodes.map((n) => ({ id: n.id, type: 'entity', label: n.label, deg: 0,
      x: (n.x - 1050) * 0.4, y: -(n.y - 560) * 0.4, z: ((hash(n.id) % 200) - 100) * 1.2 }));
    const byId = new Map(nodes.map((n) => [n.id, n])), links = [];
    for (const e of model.edges) {
      const ms = e.members.map((m) => byId.get(m.node)).filter(Boolean); if (!ms.length) continue;
      const mean = (k) => ms.reduce((s, n) => s + n[k], 0) / ms.length;
      nodes.push({ id: 'h' + e.id, type: 'hub', edge: e, label: e.id, x: mean('x'), y: mean('y'), z: mean('z') });
      for (const n of ms) { n.deg++; links.push({ source: 'h' + e.id, target: n.id, edge: e, role: e.members.find((m) => m.node === n.id)?.role }); }
    }
    let sel = ctx.sel || null;
    const isSel = (n) => sel && (n.type === 'hub' ? sel.type === 'edge' && sel.id === n.edge.id : sel.type === 'node' && sel.id === n.id);
    const linkSel = (l) => sel && (sel.type === 'edge' ? sel.id === l.edge.id : (l.target.id ?? l.target) === sel.id);

    let fg;
    try { fg = ForceGraph3D({ rendererConfig: { antialias: true, alpha: true } })(host); }
    catch (err) {
      el.innerHTML = '<p class="nogl">3D needs WebGL, which this browser has switched off. The other views show the same memory.</p>';
      return { stop() {}, toggleRotate() {}, select() {} };
    }
    const r3 = (n) => (n.type === 'hub' ? 4 : 6 + 2 * Math.sqrt(n.deg || 1)) * (isSel(n) ? 1.35 : 1);
    const nodeColor = (n) => (n.type === 'hub' ? styleOf(n.edge).stroke : T.ink);
    fg.width(el.clientWidth).height(el.clientHeight).backgroundColor('rgba(0,0,0,0)').showNavInfo(false)
      .graphData({ nodes, links }).nodeId('id').nodeRelSize(1).nodeVal((n) => Math.pow(r3(n), 3)).nodeOpacity(0.95).nodeResolution(20)
      .nodeColor(nodeColor)
      .nodeLabel((n) => `<div class="tip3d">${n.type === 'hub' ? `<b>${esc(n.edge.id)}</b> · ${esc(n.edge.sentence)}<br><small>${esc(n.edge.status)}</small>` : esc(n.label)}</div>`)
      .linkColor((l) => styleOf(l.edge).stroke)
      .linkOpacity(0.8).linkWidth((l) => (linkSel(l) ? 2.4 : l.edge.status === 'deprecated' ? 0.3 : 1))
      .linkLabel((l) => `<div class="tip3d"><b>${esc(l.edge.id)}</b> · ${esc(l.role || '')}</div>`)
      .linkDirectionalParticles((l) => (l.edge.status === 'deprecated' ? 0 : linkSel(l) ? 3 : 1)).linkDirectionalParticleWidth(2.4).linkDirectionalParticleSpeed(0.005)
      .onNodeClick((n) => (n.type === 'hub' ? ctx.onEdge(n.edge.id) : ctx.onNode(n.id)))
      .onLinkClick((l) => ctx.onEdge(l.edge.id))
      .onBackgroundClick(() => ctx.onBackground())
      .enableNodeDrag(false).warmupTicks(200).cooldownTicks(0).d3VelocityDecay(0.4);
    fg.d3Force('charge').strength((n) => (n.type === 'hub' ? -50 : -140));
    fg.d3Force('link').distance(40).strength(0.7);

    // HTML labels: every entity by name, every fact by its id in its own colour
    for (const n of nodes) {
      const d = document.createElement('div');
      d.className = n.type === 'hub' ? 'lbl3d hub' : 'lbl3d';
      if (n.type === 'hub') { d.innerHTML = 'e<sub>' + esc(n.edge.id.slice(1)) + '</sub>'; d.style.color = styleOf(n.edge).stroke; }
      else d.textContent = n.label;
      layer.appendChild(d); n._el = d;
    }
    let centre = { x: 0, y: 0, z: 0 }, radius = 200, dist = 600, ready = false, rotating = true, phase = 0, last = performance.now(), alive = true;
    function measure() {
      const ns = nodes.filter((n) => isFinite(n.x)); if (!ns.length) return;
      const mean = (k) => ns.reduce((s, n) => s + n[k], 0) / ns.length;
      centre = { x: mean('x'), y: mean('y'), z: mean('z') };
      radius = Math.max(60, ...ns.map((n) => Math.hypot(n.x - centre.x, n.y - centre.y, n.z - centre.z)));
      const cam = fg.camera(), v = cam.fov * Math.PI / 180, h = 2 * Math.atan(Math.tan(v / 2) * cam.aspect);
      dist = (radius + 12) / Math.tan(Math.min(v, h) / 2);
    }
    function orbit(p) {
      const a = p * Math.PI * 2, elev = 0.22 * Math.sin(a) + 0.12;
      fg.cameraPosition({ x: centre.x + dist * Math.cos(elev) * Math.sin(a), y: centre.y + dist * Math.sin(elev), z: centre.z + dist * Math.cos(elev) * Math.cos(a) }, centre, 0);
    }
    function labels() {
      const camera = fg.camera(), cam = camera.position, H = el.clientHeight, px = H / (2 * Math.tan(camera.fov * Math.PI / 360));
      for (const n of nodes) {
        const d = Math.hypot(n.x - cam.x, n.y - cam.y, n.z - cam.z), p = fg.graph2ScreenCoords(n.x, n.y, n.z);
        const depth = Math.min(1, Math.max(0, (d - (dist - radius)) / (2 * radius))), size = Math.min(19, (n.type === 'hub' ? 12 : 13) * (dist / d));
        n._el.style.opacity = (isSel(n) ? 1 : 1 - 0.65 * depth).toFixed(2);
        n._el.style.fontSize = size.toFixed(1) + 'px';
        n._el.style.zIndex = String(Math.round(100 * (1 - depth)) + (isSel(n) ? 200 : 0));
        n._el.classList.toggle('sel', !!isSel(n));
        n._el.style.transform = `translate(${(p.x + r3(n) * px / d + 4).toFixed(1)}px,${(p.y - size * 0.62).toFixed(1)}px)`;
      }
    }
    fg.onEngineStop(() => { if (!ready) { measure(); orbit(phase); ready = true; } });
    const pause = () => { rotating = false; };
    host.addEventListener('pointerdown', pause); host.addEventListener('wheel', pause, { passive: true });
    (function loop(now) {
      if (!alive) return;
      if (ready) { if (rotating) { phase = (phase + (now - last) / 60000) % 1; orbit(phase); } labels(); }
      last = now; requestAnimationFrame(loop);
    })(performance.now());
    return {
      stop() { alive = false; fg.pauseAnimation(); fg._destructor?.(); el.innerHTML = ''; },
      toggleRotate() { if (!rotating) { // resume the orbit from wherever the operator left the camera
        const c = fg.camera().position; phase = ((Math.atan2(c.x - centre.x, c.z - centre.z) / (2 * Math.PI)) + 1) % 1; dist = Math.hypot(c.x - centre.x, c.y - centre.y, c.z - centre.z); }
        rotating = !rotating; return rotating; },
      select(s) { sel = s; fg.nodeVal(fg.nodeVal()).linkWidth(fg.linkWidth()).linkDirectionalParticles(fg.linkDirectionalParticles()); },
    };
  }

  window.HI.view3d = { render };
})();
