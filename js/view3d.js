// The same memory state in 3D: entities are spheres, each hyperedge is a small hub linked to its members.
// It starts from the 2D positions, so the picture is recognisable, and turns slowly until you touch it.
(function () {
  const { styleOf, theme, esc } = window.HI.canvas;

  function render(el, model, ctx) {
    el.innerHTML = '';
    const host = document.createElement('div'), layer = document.createElement('div');
    host.className = 'g3d'; layer.className = 'labels3d'; el.append(host, layer);
    const T = theme();
    const nodes = model.nodes.map((n) => ({ id: n.id, type: 'entity', label: n.label, x: (n.x - 1050) * 0.55, y: -(n.y - 560) * 0.55, z: 0, deg: 0 }));
    const byId = new Map(nodes.map((n) => [n.id, n])), links = [];
    for (const e of model.edges) {
      const ms = e.members.map((m) => byId.get(m.node)).filter(Boolean); if (!ms.length) continue;
      const hub = { id: 'h' + e.id, type: 'hub', edge: e, label: e.id + ' · ' + e.sentence,
                    x: ms.reduce((s, n) => s + n.x, 0) / ms.length, y: ms.reduce((s, n) => s + n.y, 0) / ms.length, z: (links.length % 2 ? 1 : -1) * 40 };
      nodes.push(hub);
      for (const n of ms) { n.deg++; links.push({ source: hub.id, target: n.id, edge: e }); }
    }
    let fg;
    try { fg = ForceGraph3D({ rendererConfig: { antialias: true, alpha: true } })(host); }
    catch (err) {
      el.innerHTML = '<p class="nogl">3D needs WebGL, which this browser has switched off. The other views show the same memory.</p>';
      return { stop() {}, toggleRotate() {} };
    }
    const r3 = (n) => (n.type === 'hub' ? 2.6 : 4.2 + 1.6 * Math.sqrt(n.deg || 1));
    fg.width(el.clientWidth).height(el.clientHeight).backgroundColor('rgba(0,0,0,0)').showNavInfo(false)
      .graphData({ nodes, links }).nodeId('id').nodeRelSize(1).nodeVal((n) => Math.pow(r3(n), 3)).nodeOpacity(0.96).nodeResolution(18)
      .nodeColor((n) => (n.type === 'hub' ? styleOf(n.edge).stroke : T.ink))
      .nodeLabel((n) => `<div class="tip3d">${esc(n.label)}</div>`)
      .linkColor((l) => styleOf(l.edge).stroke).linkOpacity(0.75).linkWidth((l) => (l.edge.status === 'deprecated' ? 0.3 : 0.9))
      .linkDirectionalParticles((l) => (l.edge.status === 'deprecated' ? 0 : 1)).linkDirectionalParticleWidth(2.2).linkDirectionalParticleSpeed(0.005)
      .onNodeClick((n) => (n.type === 'hub' ? ctx.onEdge(n.edge.id) : ctx.onNode(n.id)))
      .onBackgroundClick(() => ctx.onBackground())
      .enableNodeDrag(false).warmupTicks(160).cooldownTicks(0).d3VelocityDecay(0.4);
    fg.d3Force('charge').strength((n) => (n.type === 'hub' ? -60 : -170));
    fg.d3Force('link').distance(46).strength(0.6);

    const labelled = nodes.filter((n) => n.type === 'entity');
    for (const n of labelled) { const d = document.createElement('div'); d.className = 'lbl3d'; d.textContent = n.label; layer.appendChild(d); n._el = d; }
    let centre = { x: 0, y: 0, z: 0 }, radius = 200, dist = 600, ready = false, rotating = true, phase = 0, last = performance.now(), alive = true;
    function measure() {
      const ns = nodes.filter((n) => isFinite(n.x)); if (!ns.length) return;
      const mean = (k) => ns.reduce((s, n) => s + n[k], 0) / ns.length;
      centre = { x: mean('x'), y: mean('y'), z: mean('z') };
      radius = Math.max(60, ...ns.map((n) => Math.hypot(n.x - centre.x, n.y - centre.y, n.z - centre.z)));
      const cam = fg.camera(), v = cam.fov * Math.PI / 180, h = 2 * Math.atan(Math.tan(v / 2) * cam.aspect);
      dist = (radius * 1.12) / Math.sin(Math.min(v, h) / 2);
    }
    function orbit(p) {
      const a = p * Math.PI * 2, elev = 0.22 * Math.sin(a) + 0.12;
      fg.cameraPosition({ x: centre.x + dist * Math.cos(elev) * Math.sin(a), y: centre.y + dist * Math.sin(elev), z: centre.z + dist * Math.cos(elev) * Math.cos(a) }, centre, 0);
    }
    function labels() {
      const camera = fg.camera(), cam = camera.position, H = el.clientHeight, px = H / (2 * Math.tan(camera.fov * Math.PI / 360));
      for (const n of labelled) {
        const d = Math.hypot(n.x - cam.x, n.y - cam.y, n.z - cam.z), p = fg.graph2ScreenCoords(n.x, n.y, n.z);
        const depth = Math.min(1, Math.max(0, (d - (dist - radius)) / (2 * radius))), size = Math.min(20, 13 * (dist / d));
        n._el.style.opacity = (1 - 0.6 * depth).toFixed(2);
        n._el.style.fontSize = size.toFixed(1) + 'px';
        n._el.style.transform = `translate(${(p.x + r3(n) * px / d + 5).toFixed(1)}px,${(p.y - size * 0.62).toFixed(1)}px)`;
      }
    }
    fg.onEngineStop(() => { if (!ready) { measure(); ready = true; } });
    const pause = () => { rotating = false; };
    host.addEventListener('pointerdown', pause); host.addEventListener('wheel', pause, { passive: true });
    (function loop(now) {
      if (!alive) return;
      if (ready) { if (rotating) { phase = (phase + (now - last) / 50000) % 1; orbit(phase); } labels(); }
      last = now; requestAnimationFrame(loop);
    })(performance.now());
    return { stop() { alive = false; fg.pauseAnimation(); fg._destructor?.(); el.innerHTML = ''; }, toggleRotate() { rotating = !rotating; } };
  }

  window.HI.view3d = { render };
})();
