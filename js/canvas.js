// The hypergraph drawing, as on the poster: every hyperedge is a rubber band around its members, the arrows
// inside it link the members in reading order, and its caption is the sentence it asserts.
// No layout engine: entities stay where they are placed (drag one to move it), so the picture is stable.
(function () {
  const { ICONS, FAMILIES, COLORS } = window.HI_DATA;
  const { NAVY, RUST, ORANGE } = COLORS;
  const VB = { x: 539, y: 304, w: 944, h: 440 };            // the poster's canvas, in the poster's coordinates
  const GREY = '#8a93ab';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (v) => v.toFixed(1);
  // e1 → e with a subscript 1, as the poster writes it
  const ids = (id) => (/^e\d+$/.test(id) ? 'e<tspan class="sub" dy="3">' + id.slice(1) + '</tspan>' : esc(id));

  function convexHull(pts) {                                  // Andrew's monotone chain
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (const q of p.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  // HyperNetX-style rubber band: the convex hull of padded circles around the member nodes
  function rubber(circles, n = 48) {
    const pts = [];
    for (const [x, y, r] of circles) for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
    return convexHull(pts);
  }
  const icon = (name, cx, cy, size = 26, color = NAVY, sw = 1.9) =>
    `<g transform="translate(${f1(cx - size / 2)},${f1(cy - size / 2)}) scale(${(size / 24).toFixed(3)})" fill="none" stroke="${color}" color="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.box}</g>`;

  // line style says validation status; colour says context once an assertion is validated
  function styleOf(e) {
    if (e.status === 'proposed') return { stroke: RUST, fill: ORANGE, fo: 0.16, dash: '11 8' };
    if (e.status === 'deprecated') return { stroke: GREY, fill: GREY, fo: 0.04, dash: '3 7' };
    const c = (FAMILIES[e.family] || {}).color || NAVY;
    return { stroke: c, fill: c, fo: 0.10, dash: null };
  }

  function create(svg, ctx) {
    svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
    svg.innerHTML = `<defs><pattern id="dots" width="20.5" height="20.5" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="#c3cbe2"/></pattern></defs>
      <g id="root"><rect x="-6000" y="-6000" width="14000" height="14000" fill="#fff"/><rect x="-6000" y="-6000" width="14000" height="14000" fill="url(#dots)"/><g id="scene"></g></g>`;
    const root = svg.querySelector('#root'), scene = svg.querySelector('#scene');
    const view = { k: 1, tx: 0, ty: 0 };
    let model = { nodes: [], edges: [], sel: null }, hover = null;
    const applyView = () => root.setAttribute('transform', `translate(${f1(view.tx)},${f1(view.ty)}) scale(${view.k.toFixed(4)})`);

    function draw() {
      const N = new Map(model.nodes.map((n) => [n.id, n]));
      const selEdge = model.sel?.type === 'edge' ? model.edges.find((e) => e.id === model.sel.id) : null;
      const haloed = new Set(selEdge ? selEdge.members.map((m) => m.node) : model.sel?.type === 'node' ? [model.sel.id] : []);
      const dimEdge = (e) => (hover && hover !== e.id ? ' opacity=".28"' : '');
      const o = ['<g transform="translate(0,1)" stroke-linejoin="round">'], rank = new Map(), hulls = new Map();

      // hulls: concentric where a node belongs to several hyperedges, so no outline hides another
      for (const e of model.edges) {
        const circles = [];
        for (const m of e.members) { const n = N.get(m.node); if (!n) continue; const k = rank.get(n.id) || 0; rank.set(n.id, k + 1); circles.push([n.x, n.y + 9, 58 + 11 * k]); }
        if (!circles.length) continue;
        const hp = rubber(circles), st = styleOf(e), on = selEdge?.id === e.id;
        hulls.set(e.id, hp);
        o.push(`<path class="hull" data-edge="${e.id}" d="M${hp.map((p) => f1(p[0]) + ',' + f1(p[1])).join(' L')}Z" fill="${st.fill}" fill-opacity="${st.fo}" stroke="${st.stroke}" stroke-width="${on ? 4.6 : 3}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}${dimEdge(e)}/>`);
      }
      // arrows: the members in reading order, with the word that links them
      for (const e of model.edges) {
        const col = styleOf(e).stroke;
        o.push(`<g data-edge="${e.id}" class="flow"${dimEdge(e)}>`);
        for (const f of e.flow) {
          const a = N.get(f.from), b = N.get(f.to); if (!a || !b) continue;
          const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
          const ga = haloed.has(a.id) ? 34 : 29.5, gb = haloed.has(b.id) ? 35.5 : 31;
          const x1 = a.x + ux * ga, y1 = a.y + uy * ga, x2 = b.x - ux * gb, y2 = b.y - uy * gb, hx = x2 - ux * 9, hy = y2 - uy * 9;
          const side = f.side ?? -1, dist = f.dist ?? 10, t = f.t ?? 0.5;
          const mx = x1 + (x2 - x1) * t - uy * dist * side, my = y1 + (y2 - y1) * t + ux * dist * side;
          o.push(`<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(hx)}" y2="${f1(hy)}" stroke="${col}" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M${f1(x2)},${f1(y2)} L${f1(hx - uy * 4.6)},${f1(hy + ux * 4.6)} L${f1(hx + uy * 4.6)},${f1(hy - ux * 4.6)}Z" fill="${col}" stroke="${col}" stroke-width="1"/>
            <text x="${f1(mx)}" y="${f1(my + 3.6)}" class="word" fill="${col}">${esc(f.word)}</text>`);
        }
        o.push('</g>');
      }
      // captions: the sentence the hyperedge asserts, then its context and status
      for (const e of model.edges) {
        const hp = hulls.get(e.id); if (!hp) continue;
        const col = styleOf(e).stroke;
        const cap = e.caption || { x: hp.reduce((s, p) => s + p[0], 0) / hp.length, y: Math.min(...hp.map((p) => p[1])) - 26, anchor: 'middle' };
        const meta = e.status === 'proposed' ? 'proposed' + (e.conflict ? ' · contradicts ' + e.conflict : ' · awaiting operator')
          : ((FAMILIES[e.family] || {}).label || e.family) + ' · ' + e.status + (e.conflict ? ' · contradicted by ' + e.conflict : '');
        o.push(`<g class="caption" data-edge="${e.id}" data-cap="${e.id}" text-anchor="${cap.anchor || 'start'}" fill="${col}"${dimEdge(e)}>
          <text x="${cap.x}" y="${cap.y}" class="fact"><tspan class="mono">${ids(e.id)}</tspan><tspan dy="${/^e\d+$/.test(e.id) ? -3 : 0}"> ${esc(e.sentence)}</tspan></text>
          <text x="${cap.x}" y="${cap.y + 16}" class="mono meta">${esc(meta).replace(/\be(\d+)\b/g, 'e<tspan class="sub" dy="3">$1</tspan><tspan dy="-3"></tspan>')}</text></g>`);
      }
      const members = hover ? new Set(model.edges.find((e) => e.id === hover)?.members.map((m) => m.node)) : null;
      for (const n of model.nodes) {
        o.push(`<g class="node" data-node="${n.id}"${members && !members.has(n.id) ? ' opacity=".35"' : ''}>
          ${haloed.has(n.id) ? `<circle cx="${n.x}" cy="${n.y}" r="29.5" fill="none" stroke="#9db7ee" stroke-width="5"/>` : ''}
          <circle cx="${n.x}" cy="${n.y}" r="25" fill="#fff" stroke="${NAVY}" stroke-width="2.6"/>${icon(n.icon, n.x, n.y)}
          <text x="${n.x}" y="${n.y + 42}" class="nl">${esc(n.label)}</text></g>`);
      }
      o.push('</g>');
      scene.innerHTML = o.join('');
    }

    // ───────────── pointer handling: click to select, drag a node to move it, drag the background to pan ─────────────
    const toScene = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(scene.getScreenCTM().inverse()); };
    const toViewBox = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const pointers = new Map();
    let gesture = null;
    svg.addEventListener('pointerdown', (ev) => {
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic pointer */ }
      pointers.set(ev.pointerId, toViewBox(ev));
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...view } };
        return;
      }
      const t = ev.target.closest('[data-node],[data-cap],[data-edge]');
      const kind = !t ? 'bg' : t.dataset.node ? 'node' : t.dataset.cap ? 'cap' : 'edge';
      const id = t && (t.dataset.node || t.dataset.cap || t.dataset.edge);
      const item = kind === 'node' ? model.nodes.find((n) => n.id === id) : kind === 'cap' ? model.edges.find((e) => e.id === id) : null;
      gesture = { type: kind, id, moved: false, x: ev.clientX, y: ev.clientY, start: toScene(ev), vb: toViewBox(ev), view: { ...view },
                  ox: item ? (kind === 'node' ? item.x : item.caption?.x) : 0, oy: item ? (kind === 'node' ? item.y : item.caption?.y) : 0, item };
    });
    svg.addEventListener('pointermove', (ev) => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, toViewBox(ev));
      if (!gesture) {                                              // hover: emphasise the hyperedge under the pointer
        const t = ev.target.closest('[data-edge]'), h = t ? t.dataset.edge : null;
        if (h !== hover) { hover = h; draw(); }
        return;
      }
      if (gesture.type === 'pinch' && pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), f = d / (gesture.d || 1), m = gesture.mid;
        view.k = Math.min(6, Math.max(0.4, gesture.view.k * f));
        const r = view.k / gesture.view.k;
        view.tx = m.x - (m.x - gesture.view.tx) * r; view.ty = m.y - (m.y - gesture.view.ty) * r;
        return applyView();
      }
      if (!gesture.moved && Math.hypot(ev.clientX - gesture.x, ev.clientY - gesture.y) < 4) return;
      gesture.moved = true;
      if (gesture.type === 'node' && gesture.item) {
        const p = toScene(ev); gesture.item.x = Math.round(gesture.ox + p.x - gesture.start.x); gesture.item.y = Math.round(gesture.oy + p.y - gesture.start.y); draw();
      } else if (gesture.type === 'cap' && gesture.item?.caption) {
        const p = toScene(ev); gesture.item.caption = { ...gesture.item.caption, x: Math.round(gesture.ox + p.x - gesture.start.x), y: Math.round(gesture.oy + p.y - gesture.start.y) }; draw();
      } else {
        const p = toViewBox(ev); view.tx = gesture.view.tx + p.x - gesture.vb.x; view.ty = gesture.view.ty + p.y - gesture.vb.y; applyView();
      }
    });
    const end = (ev) => {
      pointers.delete(ev.pointerId);
      const g = gesture; gesture = pointers.size ? gesture : null;
      if (!g || g.type === 'pinch') return;
      if (!g.moved) { if (g.type === 'node') ctx.onNode(g.id); else if (g.type === 'bg') ctx.onBackground(); else ctx.onEdge(g.id); return; }
      if (g.type === 'node' && g.item) ctx.onMove(g.id, g.item.x, g.item.y);
      if (g.type === 'cap' && g.item?.caption) ctx.onMoveCaption(g.id, g.item.caption.x, g.item.caption.y);
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', () => { if (!gesture && hover) { hover = null; draw(); } });
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = toViewBox(ev), k = Math.min(6, Math.max(0.4, view.k * Math.exp(-ev.deltaY * 0.0015))), r = k / view.k;
      view.tx = p.x - (p.x - view.tx) * r; view.ty = p.y - (p.y - view.ty) * r; view.k = k; applyView();
    }, { passive: false });
    svg.addEventListener('dblclick', (ev) => { if (!ev.target.closest('[data-node],[data-edge]')) fit(); });

    // show a region of the scene (default: the poster's whole canvas) as large as the element allows
    function fit(box) {
      const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return;
      const s = Math.min(r.width / VB.w, r.height / VB.h), visW = r.width / s, visH = r.height / s;   // viewBox units on screen
      const b = box || { x: VB.x, y: VB.y, w: VB.w, h: VB.h };
      view.k = Math.min(3, visW / b.w, visH / b.h);
      view.tx = VB.x + VB.w / 2 - view.k * (b.x + b.w / 2); view.ty = VB.y + VB.h / 2 - view.k * (b.y + b.h / 2);
      applyView();
    }
    function boxOf(ids, pad = 110) {
      const ns = model.nodes.filter((n) => ids.includes(n.id)); if (!ns.length) return null;
      const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y);
      return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad + 20 };
    }
    return { render(m) { model = m; if (hover && !m.edges.some((e) => e.id === hover)) hover = null; draw(); }, fit, boxOf, VB,
             zoom(f) { const c = { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 }, k = Math.min(6, Math.max(0.4, view.k * f)), r = k / view.k;
               view.tx = c.x - (c.x - view.tx) * r; view.ty = c.y - (c.y - view.ty) * r; view.k = k; applyView(); } };
  }

  window.HI = window.HI || {};
  window.HI.canvas = { create, icon, styleOf, esc };
})();
