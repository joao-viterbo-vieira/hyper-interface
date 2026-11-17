// The 2D drawings. Entities stay where they are placed (no layout engine), so the picture is stable.
//   hull       as on the poster: each hyperedge is a rubber band around its members, the arrows inside it link
//              the members in reading order, and its caption is the sentence it asserts
//   bipartite  each hyperedge is a diamond linked to its members, every link labelled with the member's role
//   pairwise   what an ordinary graph keeps: one link per pair of members, the facts themselves are gone
(function () {
  const { ICONS, FAMILIES } = window.HI_DATA;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (v) => v.toFixed(1);
  // e1 → e with a subscript 1, as the poster writes it
  const ids = (id) => (/^e\d+$/.test(id) ? 'e<tspan class="sub" dy="3">' + id.slice(1) + '</tspan><tspan dy="-3">​</tspan>' : esc(id));

  const THEMES = {
    light: { ink: '#101b3d', paper: '#ffffff', dots: '#c3cbe2', halo: '#9db7ee', proposed: '#b85c0a', proposedFill: '#f29a2e', grey: '#8a93ab', fo: 0.10, pfo: 0.16 },
    dark:  { ink: '#e7eaf3', paper: '#17181d', dots: '#2e313c', halo: '#5c7fd9', proposed: '#f29a2e', proposedFill: '#f29a2e', grey: '#6d7489', fo: 0.13, pfo: 0.15 },
  };
  const themeName = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const theme = () => THEMES[themeName()];
  const famColor = (f) => { const v = FAMILIES[f]; return v ? (themeName() === 'dark' ? v.dark : v.color) : theme().ink; };

  // line style says validation status; colour says context once an assertion is validated
  function styleOf(e) {
    const T = theme();
    if (e.status === 'proposed') return { stroke: T.proposed, fill: T.proposedFill, fo: T.pfo, dash: '11 8' };
    if (e.status === 'deprecated') return { stroke: T.grey, fill: T.grey, fo: 0.04, dash: '3 7' };
    const c = famColor(e.family);
    return { stroke: c, fill: c, fo: T.fo, dash: null };
  }

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
  const icon = (name, cx, cy, size, color, sw = 1.9) =>
    `<g transform="translate(${f1(cx - size / 2)},${f1(cy - size / 2)}) scale(${(size / 24).toFixed(3)})" fill="none" stroke="${color}" color="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.box}</g>`;
  function arrow(o, a, b, col, ga, gb, width = 2.2) {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    const x1 = a.x + ux * ga, y1 = a.y + uy * ga, x2 = b.x - ux * gb, y2 = b.y - uy * gb, hx = x2 - ux * 9, hy = y2 - uy * 9;
    o.push(`<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(hx)}" y2="${f1(hy)}" stroke="${col}" stroke-width="${width}" stroke-linecap="round"/>
      <path d="M${f1(x2)},${f1(y2)} L${f1(hx - uy * 4.6)},${f1(hy + ux * 4.6)} L${f1(hx + uy * 4.6)},${f1(hy - ux * 4.6)}Z" fill="${col}" stroke="${col}" stroke-width="1"/>`);
    return { x1, y1, x2, y2, ux, uy };
  }

  function create(svg, ctx) {
    const BASE = { x: 0, y: 0, w: 1000, h: 600 };
    svg.setAttribute('viewBox', `${BASE.x} ${BASE.y} ${BASE.w} ${BASE.h}`);
    svg.innerHTML = `<defs><pattern id="dots" width="20.5" height="20.5" patternUnits="userSpaceOnUse"><circle id="dot" cx="10" cy="10" r="1"/></pattern></defs>
      <g id="root"><rect id="paper" x="-9000" y="-9000" width="20000" height="20000"/><rect x="-9000" y="-9000" width="20000" height="20000" fill="url(#dots)"/><g id="scene"></g></g>`;
    const root = svg.querySelector('#root'), scene = svg.querySelector('#scene');
    const view = { k: 1, tx: 0, ty: 0 };
    let model = { nodes: [], edges: [], sel: null, mode: 'hull', capKey: 'caption' }, hover = null;
    const applyView = () => root.setAttribute('transform', `translate(${f1(view.tx)},${f1(view.ty)}) scale(${view.k.toFixed(4)})`);
    const capOf = (e) => e[model.capKey] || e.caption;

    function hubOf(e, N) {                       // bipartite: where the hyperedge's own node sits
      const ms = e.members.map((m) => N.get(m.node)).filter(Boolean);
      let x = ms.reduce((s, n) => s + n.x, 0) / ms.length, y = ms.reduce((s, n) => s + n.y, 0) / ms.length;
      for (const n of N.values()) {              // nudge it off any entity it would sit on
        const d = Math.hypot(x - n.x, y - n.y);
        if (d < 62) { const ux = d > 1 ? (x - n.x) / d : 0, uy = d > 1 ? (y - n.y) / d : -1; x = n.x + ux * 72; y = n.y + uy * 72; }
      }
      return { x, y };
    }

    function draw() {
      const T = theme(), N = new Map(model.nodes.map((n) => [n.id, n])), mode = model.mode;
      svg.querySelector('#paper').setAttribute('fill', T.paper); svg.querySelector('#dot').setAttribute('fill', T.dots);
      const selEdge = model.sel?.type === 'edge' ? model.edges.find((e) => e.id === model.sel.id) : null;
      const haloed = new Set(selEdge ? selEdge.members.map((m) => m.node) : model.sel?.type === 'node' ? [model.sel.id] : []);
      const dimEdge = (e) => (hover && hover !== e.id ? ' opacity=".25"' : '');
      const o = ['<g transform="translate(0,1)" stroke-linejoin="round">'], rank = new Map(), hulls = new Map();

      if (mode === 'hull') {
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
            const g = arrow(o, a, b, col, haloed.has(a.id) ? 34 : 29.5, haloed.has(b.id) ? 35.5 : 31);
            const side = f.side ?? -1, dist = f.dist ?? 10, t = f.t ?? 0.5;
            const mx = g.x1 + (g.x2 - g.x1) * t - g.uy * dist * side, my = g.y1 + (g.y2 - g.y1) * t + g.ux * dist * side;
            o.push(`<text x="${f1(mx)}" y="${f1(my + 3.6)}" class="word" fill="${col}" stroke="${T.paper}">${esc(f.word)}</text>`);
          }
          o.push('</g>');
        }
      } else if (mode === 'bipartite') {
        for (const e of model.edges) {
          const st = styleOf(e), h = hubOf(e, N), on = selEdge?.id === e.id;
          o.push(`<g data-edge="${e.id}" class="flow"${dimEdge(e)}>`);
          for (const m of e.members) {
            const n = N.get(m.node); if (!n) continue;
            o.push(`<line x1="${f1(n.x)}" y1="${f1(n.y)}" x2="${f1(h.x)}" y2="${f1(h.y)}" stroke="${st.stroke}" stroke-width="${on ? 3 : 2}"${st.dash ? ' stroke-dasharray="7 5"' : ''}/>
              <text x="${f1(n.x + (h.x - n.x) * 0.52)}" y="${f1(n.y + (h.y - n.y) * 0.52 - 5)}" class="role" fill="${st.stroke}" stroke="${T.paper}">${esc(m.role)}</text>`);
          }
          o.push(`<path d="M${f1(h.x)},${f1(h.y - 13)} l13,13 l-13,13 l-13,-13Z" fill="${st.stroke}" stroke="${on ? T.ink : T.paper}" stroke-width="${on ? 2.5 : 2}"/>
            <text x="${f1(h.x)}" y="${f1(h.y - 19)}" class="hubid" fill="${st.stroke}" stroke="${T.paper}">${ids(e.id)}</text></g>`);
        }
      } else {                                    // pairwise
        // every pair of members gets a link; pairs the fact reads in order get an arrow with its word
        for (const e of model.edges) {
          const col = styleOf(e).stroke, w = selEdge?.id === e.id ? 3.4 : 2.2;
          const ms = e.members.map((m) => N.get(m.node)).filter(Boolean), flowed = new Set();
          o.push(`<g data-edge="${e.id}" class="flow"${dimEdge(e)}>`);
          for (const f of e.flow) {
            const a = N.get(f.from), b = N.get(f.to); if (!a || !b) continue;
            flowed.add(a.id + '|' + b.id); flowed.add(b.id + '|' + a.id);
            const g = arrow(o, a, b, col, haloed.has(a.id) ? 34 : 29.5, haloed.has(b.id) ? 35.5 : 31, w);
            const side = f.side ?? -1, dist = f.dist ?? 10, t = f.t ?? 0.5;
            const mx = g.x1 + (g.x2 - g.x1) * t - g.uy * dist * side, my = g.y1 + (g.y2 - g.y1) * t + g.ux * dist * side;
            if (f.word) o.push(`<text x="${f1(mx)}" y="${f1(my + 3.6)}" class="word" fill="${col}" stroke="${T.paper}">${esc(f.word)}</text>`);
          }
          for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++)
            if (!flowed.has(ms[i].id + '|' + ms[j].id))
              o.push(`<line x1="${ms[i].x}" y1="${ms[i].y}" x2="${ms[j].x}" y2="${ms[j].y}" stroke="${col}" stroke-width="${w}" stroke-opacity=".7"/>`);
          o.push('</g>');
        }
      }
      // captions: the sentence the hyperedge asserts, then its context and status
      for (const e of model.edges) {
        const hp = hulls.get(e.id), col = styleOf(e).stroke;
        let cap = capOf(e);
        if (!cap) {
          const ms = e.members.map((m) => N.get(m.node)).filter(Boolean); if (!ms.length) continue;
          cap = { x: Math.round(ms.reduce((s, n) => s + n.x, 0) / ms.length), y: Math.round(Math.min(...ms.map((n) => n.y)) - 92), anchor: 'middle' };
        }
        const meta = e.status === 'proposed' ? 'proposed' + (e.conflict ? ' · contradicts ' + e.conflict : ' · awaiting operator')
          : ((FAMILIES[e.family] || {}).label || e.family) + ' · ' + e.status + (e.conflict ? ' · contradicted by ' + e.conflict : '');
        o.push(`<g class="caption" data-edge="${e.id}" data-cap="${e.id}" text-anchor="${cap.anchor || 'start'}" fill="${col}" stroke="${T.paper}"${dimEdge(e)}>
          <text x="${cap.x}" y="${cap.y}" class="fact"><tspan class="mono">${ids(e.id)}</tspan> ${esc(e.sentence)}</text>
          <text x="${cap.x}" y="${cap.y + 16}" class="mono meta">${esc(meta).replace(/\be(\d+)\b/g, 'e<tspan class="sub" dy="3">$1</tspan><tspan dy="-3">​</tspan>')}</text></g>`);
      }
      const members = hover ? new Set(model.edges.find((e) => e.id === hover)?.members.map((m) => m.node)) : null;
      for (const n of model.nodes) {
        o.push(`<g class="node" data-node="${n.id}"${members && !members.has(n.id) ? ' opacity=".3"' : ''}>
          ${haloed.has(n.id) || n.focus ? `<circle cx="${n.x}" cy="${n.y}" r="29.5" fill="none" stroke="${T.halo}" stroke-width="5"/>` : ''}
          <circle cx="${n.x}" cy="${n.y}" r="25" fill="${T.paper}" stroke="${T.ink}" stroke-width="2.6"/>${icon(n.icon, n.x, n.y, 26, T.ink)}
          <text x="${n.x}" y="${n.y + 42}" class="nl" fill="${T.ink}" stroke="${T.paper}">${esc(n.label)}</text></g>`);
      }
      o.push('</g>');
      scene.innerHTML = o.join('');
    }

    // ───────────── pointer handling: click to select, drag a node to move it, drag the background to pan ─────────────
    const pt = (ev, el) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(el.getScreenCTM().inverse()); };
    const toScene = (ev) => pt(ev, scene), toViewBox = (ev) => pt(ev, svg);
    const pointers = new Map();
    let gesture = null, lastTap = { t: 0, id: null };
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
      const c = kind === 'cap' && item ? capOf(item) : null;
      gesture = { type: kind, id, moved: false, x: ev.clientX, y: ev.clientY, start: toScene(ev), vb: toViewBox(ev), view: { ...view },
                  ox: kind === 'node' && item ? item.x : c ? c.x : 0, oy: kind === 'node' && item ? item.y : c ? c.y : 0, item, cap: c };
    });
    svg.addEventListener('pointermove', (ev) => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, toViewBox(ev));
      if (!gesture) {                                              // hover: emphasise the hyperedge under the pointer
        const t = ev.target.closest('[data-edge]'), h = t ? t.dataset.edge : null;
        if (h !== hover) { hover = h; draw(); }
        return;
      }
      if (gesture.type === 'pinch' && pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = gesture.mid;
        view.k = Math.min(8, Math.max(0.2, gesture.view.k * d / (gesture.d || 1)));
        const r = view.k / gesture.view.k;
        view.tx = m.x - (m.x - gesture.view.tx) * r; view.ty = m.y - (m.y - gesture.view.ty) * r;
        return applyView();
      }
      if (!gesture.moved && Math.hypot(ev.clientX - gesture.x, ev.clientY - gesture.y) < 4) return;
      gesture.moved = true;
      const p = toScene(ev);
      if (gesture.type === 'node' && gesture.item) { gesture.item.x = Math.round(gesture.ox + p.x - gesture.start.x); gesture.item.y = Math.round(gesture.oy + p.y - gesture.start.y); draw(); }
      else if (gesture.type === 'cap' && gesture.cap) { gesture.cap.x = Math.round(gesture.ox + p.x - gesture.start.x); gesture.cap.y = Math.round(gesture.oy + p.y - gesture.start.y); draw(); }
      else { const q = toViewBox(ev); view.tx = gesture.view.tx + q.x - gesture.vb.x; view.ty = gesture.view.ty + q.y - gesture.vb.y; applyView(); }
    });
    const end = (ev) => {
      pointers.delete(ev.pointerId);
      const g = gesture; gesture = pointers.size ? gesture : null;
      if (!g || g.type === 'pinch') return;
      if (!g.moved) {
        const now = Date.now(), dbl = g.type === 'node' && lastTap.id === g.id && now - lastTap.t < 380;
        lastTap = { t: now, id: g.type === 'node' ? g.id : null };
        if (dbl) return ctx.onFocus(g.id);
        if (g.type === 'node') ctx.onNode(g.id); else if (g.type === 'bg') ctx.onBackground(); else ctx.onEdge(g.id);
        return;
      }
      if (g.type === 'node' && g.item) ctx.onMove(g.id, g.item.x, g.item.y);
      if (g.type === 'cap' && g.cap) ctx.onMoveCaption(g.id, model.capKey, g.cap.x, g.cap.y);
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', () => { if (!gesture && hover) { hover = null; draw(); } });
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = toViewBox(ev), k = Math.min(8, Math.max(0.2, view.k * Math.exp(-ev.deltaY * 0.0015))), r = k / view.k;
      view.tx = p.x - (p.x - view.tx) * r; view.ty = p.y - (p.y - view.ty) * r; view.k = k; applyView();
    }, { passive: false });

    // everything drawn, with room for the captions (their width is estimated from the sentence)
    function contentBox() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (ax, ay, bx, by) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
      for (const n of model.nodes) add(n.x - 82, n.y - 74, n.x + 82, n.y + 96);
      for (const e of model.edges) {
        const c = capOf(e); if (!c) continue;
        const w = 7.3 * (e.sentence.length + e.id.length + 1) + 8;
        const left = c.anchor === 'end' ? c.x - w : c.anchor === 'middle' ? c.x - w / 2 : c.x;
        add(left - 14, c.y - 24, left + w + 14, c.y + 30);
      }
      return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
    }
    function fit(box) {
      const r = svg.getBoundingClientRect(), b = box || contentBox(); if (!r.width || !r.height || !b) return;
      const s = Math.min(r.width / BASE.w, r.height / BASE.h), visW = r.width / s, visH = r.height / s;   // viewBox units on screen
      view.k = Math.min(2.6, visW / b.w, visH / b.h);
      view.tx = BASE.x + BASE.w / 2 - view.k * (b.x + b.w / 2); view.ty = BASE.y + BASE.h / 2 - view.k * (b.y + b.h / 2);
      applyView();
    }
    function boxOf(nodeIds, pad = 110) {
      const ns = model.nodes.filter((n) => nodeIds.includes(n.id)); if (!ns.length) return null;
      const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y);
      return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad + 20 };
    }
    return { render(m) { model = m; if (hover && !m.edges.some((e) => e.id === hover)) hover = null; draw(); }, fit, boxOf, contentBox,
             zoom(f) { const c = { x: BASE.x + BASE.w / 2, y: BASE.y + BASE.h / 2 }, k = Math.min(8, Math.max(0.2, view.k * f)), r = k / view.k;
               view.tx = c.x - (c.x - view.tx) * r; view.ty = c.y - (c.y - view.ty) * r; view.k = k; applyView(); } };
  }

  window.HI = window.HI || {};
  window.HI.canvas = { create, styleOf, famColor, theme, esc };
})();
