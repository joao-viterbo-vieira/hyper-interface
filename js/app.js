// Hyper Interface: the window around the drawings. Rail modes follow the paper's four capabilities:
// graph = visualize · pencil = manage · clock = memory states · branch = review and provenance.
(function () {
  const { store, canvas, view3d, gallery } = window.HI;
  const { KINDS, FAMILIES } = store;
  const { ICONS, POSTER_BOX } = window.HI_DATA;
  const { esc, styleOf, famColor } = canvas;
  const $ = (s) => document.querySelector(s);
  const MODES = [['graph', 'graph', 'Explore the hypergraph', 'Explore'], ['edit', 'pencil', 'Create and edit knowledge', 'Edit'],
                 ['history', 'clock', 'Memory states over time', 'History'], ['review', 'branch', 'Review proposals and provenance', 'Review'], ['about', 'info', 'About', 'About']];
  const VIEWS = [['hull', 'Hypergraph', 'Each fact is a region around its members; arrows read as its sentence'],
                 ['bipartite', 'Bipartite', 'Each fact is a node linked to its members, by role'],
                 ['pairwise', 'Pairwise', 'What an ordinary graph keeps: one link per pair'], ['3d', '3D', 'The memory in 3D']];
  const SCENES = [['all', 'Whole memory'], ['poster', 'Poster example'], ['cup', 'Where is the cup?'], ['r2', 'Robot R2']];
  const S = { at: 'now', mode: 'graph', view: 'hull', scene: 'all', focus: null, hops: 1, hidden: new Set(), showDeprecated: true, robotView: false,
              sel: { type: 'edge', id: 'e2' }, form: null, playing: null,
              sheet: false };   // phone: is the bottom sheet (the side panel) pulled up?
  let cv = null, v3 = null, v3key = null;
  const inSet = () => !!gallery.state.id;          // a demonstration graph is open instead of the robot's memory

  const C = () => (S.at === 'now' ? store.head() : S.at);
  const live = () => S.at === 'now';
  const label = (id) => store.entity(id)?.label || id;
  const commit = (c) => store.db.commits[c];
  const tName = (c) => (c <= 1 ? 't<sub>' + c + '</sub>' : esc(commit(c).t));
  const sub = (id) => esc(id).replace(/^e(\d+)$/, 'e<sub>$1</sub>');
  const subs = (s) => esc(s).replace(/\be(\d+)\b/g, 'e<sub>$1</sub>');
  const svgIcon = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.box}</svg>`;

  // ───────────────────────────── what is on screen ─────────────────────────────
  const allEdges = () => store.edgesAt(C()).sort((a, b) => (+a.id.slice(1) || 0) - (+b.id.slice(1) || 0)).map((e) => ({ ...e, conflict: store.conflictOf(e, C())?.id || null }));
  function edges() {
    let list = allEdges().filter((e) => !S.hidden.has(e.family));
    if (S.scene === 'poster') list = list.filter((e) => e.core);
    if (S.robotView) list = list.filter((e) => e.status === 'validated');
    else if (!S.showDeprecated) list = list.filter((e) => e.status !== 'deprecated');
    if (S.focus) {                                   // the facts within `hops` of the focused entity
      let frontier = new Set([S.focus]); const keep = new Set();
      for (let h = 0; h < S.hops; h++) {
        const next = new Set();
        for (const e of list) if (!keep.has(e.id) && e.members.some((m) => frontier.has(m.node))) { keep.add(e.id); e.members.forEach((m) => next.add(m.node)); }
        frontier = next;
      }
      list = list.filter((e) => keep.has(e.id));
    }
    return list;
  }
  const filtered = () => S.scene !== 'all' || S.focus || S.hidden.size || S.robotView;
  function nodes(es) {
    const ids = new Set(es.flatMap((e) => e.members.map((m) => m.node)));
    return store.entitiesAt(C()).filter((n) => ids.has(n.id) || !filtered()).map((n) => ({ ...n, focus: n.id === S.focus }));
  }
  const pending = () => store.edgesAt(store.head()).filter((e) => e.status === 'proposed');
  const capKey = () => (S.scene === 'poster' ? 'caption' : 'caption2');

  // ───────────────────────────── drawing ─────────────────────────────
  const hooks = {
    onNode: (id) => select({ type: 'node', id }), onEdge: (id) => select({ type: 'edge', id }), onBackground: () => { S.sheet = false; select(null); }, onFocus: (id) => focus(id),
    onMove: (id, x, y) => store.actions.move(id, x, y), onMoveCaption: (id, key, x, y) => store.actions.moveCaption(id, key, x, y),
  };
  // a demonstration graph: read-only, 2D or 3D only, drawn by gallery.js
  function renderSet() {
    $('#canvas').toggleAttribute('hidden', true); $('#stage3d').hidden = false;      // an <svg> has no .hidden property
    for (const id of ['#zoom', '#empty', '#readonly', '#note']) $(id).hidden = true;
    v3?.stop(); v3 = null; v3key = null;
    const n = gallery.draw($('#stage3d')), set = gallery.state.set;
    $('#views').innerHTML = gallery.viewsHTML(); $('#options').innerHTML = gallery.optionsHTML(); $('#legend').innerHTML = gallery.legendHTML();
    $('#count').textContent = set ? `${n.edges.toLocaleString('en')} hyperedges · ${n.nodes.toLocaleString('en')} nodes` : '';
    $('#timeline').innerHTML = gallery.footHTML();
    $('#titlebar h1 span').textContent = '· ' + (set ? set.title + ' · demonstration' : 'loading…');
    writeHash();
  }
  function renderCanvas() {
    if (inSet()) return renderSet();
    $('#titlebar h1 span').textContent = '· knowledge hypergraph of robot R1';
    const es = edges(), ns = nodes(es), is3d = S.view === '3d';
    $('#canvas').toggleAttribute('hidden', is3d);   // an <svg> has no .hidden property
    $('#stage3d').hidden = !is3d; $('#zoom').hidden = is3d;
    // the 3D scene is rebuilt only when what it shows changes; a new selection just restyles it
    const key = is3d && JSON.stringify([canvas.theme(), ns.map((n) => n.id), es.map((e) => [e.id, e.status, e.members])]);
    if (v3 && key === v3key) v3.select(S.sel);
    else {
      v3?.stop(); v3 = null; v3key = null;
      if (is3d) { v3 = view3d.render($('#stage3d'), { nodes: ns, edges: es }, { ...hooks, sel: S.sel }); v3key = key; }
    }
    if (!is3d) cv.render({ nodes: ns, edges: es.map((e) => ({ ...e, caption: e.caption && { ...e.caption }, caption2: e.caption2 && { ...e.caption2 } })), sel: S.sel, mode: S.view, capKey: capKey() });
    $('#empty').hidden = es.length > 0;
    const ro = $('#readonly'); ro.hidden = live();
    if (!live()) ro.innerHTML = `Memory as it was at <b>${tName(S.at)}</b> · ${esc(commit(S.at).t)} — read-only. <button data-act="goto" data-id="now">Back to now</button>`;
    renderBar(es, ns); renderLegend(es); renderTimeline(); writeHash();
  }
  function fit() {
    if (S.view === '3d' || inSet()) return;
    const r = $('#canvas').getBoundingClientRect(), es = edges();
    const e = S.sel?.type === 'edge' && es.find((x) => x.id === S.sel.id);
    // a phone in portrait cannot show the whole canvas legibly: open on the selected fact instead
    if (r.width < 620 && e) cv.fit(cv.boxOf(e.members.map((m) => m.node), 95));
    else cv.fit(S.scene === 'poster' && !S.focus && S.view === 'hull' ? POSTER_BOX : null);
  }
  function renderBar(es, ns) {
    const pairs = es.reduce((s, e) => s + e.members.length * (e.members.length - 1) / 2, 0);
    $('#views').innerHTML = VIEWS.map(([id, name, title]) => `<button data-act="view" data-id="${id}" title="${title}" class="${id === S.view ? 'active' : ''}">${name}</button>`).join('');
    $('#options').innerHTML = `${gallery.memorySelect()}<label>scene <select id="scene">${SCENES.map(([id, name]) => `<option value="${id}" ${id === S.scene ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      ${S.focus ? `<span class="focus">${svgIcon(store.entity(S.focus)?.icon, 13)} ${esc(label(S.focus))}<button data-act="unfocus" title="Clear the focus" aria-label="Clear the focus">✕</button></span>
        <label>hops <select id="hops">${[1, 2, 3].map((h) => `<option ${h === S.hops ? 'selected' : ''}>${h}</option>`).join('')}</select></label>` : ''}
      <label title="Only validated knowledge: what the robot retrieves for planning"><input type="checkbox" id="robot-view" ${S.robotView ? 'checked' : ''}> robot view</label>
      ${S.robotView ? '' : `<label title="Draw the facts the operator has deprecated"><input type="checkbox" id="show-dep" ${S.showDeprecated ? 'checked' : ''}> deprecated</label>`}
      ${S.view === '3d' ? '<button data-act="rotate" class="link" title="Start or stop the slow turn">rotate / pause</button>' : ''}`;
    $('#note').hidden = S.view !== 'pairwise';
    $('#note').innerHTML = `<b>${pairs} pairwise links</b> stand in for ${es.length} fact${es.length === 1 ? '' : 's'}. Arrows, words and colours survive; which fact a link belongs to and its roles do not. Hover a link to see its fact.`;
    $('#opt-toggle').classList.toggle('on', !!filtered() || !S.showDeprecated);
    $('#count').textContent = `${es.length} fact${es.length === 1 ? '' : 's'} · ${ns.length} entities`;
  }
  function renderLegend(es) {
    const all = allEdges(), T = canvas.theme();
    $('#legend').innerHTML = Object.entries(FAMILIES).filter(([f]) => all.some((e) => e.family === f)).map(([f, v]) =>
        `<button class="ctx${S.hidden.has(f) ? ' off' : ''}" data-act="family" data-id="${f}" title="Click: show or hide · Alt-click: only this"><i style="background:${famColor(f)}"></i>${esc(v.label)} <em>${all.filter((e) => e.family === f).length}</em></button>`).join('') +
      `<div class="keys"><span><svg width="26" height="8"><line x1="1" y1="4" x2="25" y2="4" stroke="${T.ink}" stroke-width="3"/></svg>validated</span>
        <span><svg width="26" height="8"><line x1="1" y1="4" x2="25" y2="4" stroke="${T.proposed}" stroke-width="3" stroke-dasharray="7 5"/></svg>proposed</span>
        <span><svg width="26" height="8"><line x1="1" y1="4" x2="25" y2="4" stroke="${T.grey}" stroke-width="2" stroke-dasharray="3 5"/></svg>deprecated</span></div>`;
  }
  function renderTimeline() {
    const cs = store.db.commits, p = pending(), n = cs.length + 1, active = live() ? cs.length : S.at;
    const now = p.length ? 'operator reviews ' + p.map((e) => sub(e.id)).join(', ') : 'memory reviewed';
    const tick = (i, cls, id, title, text) => `<button class="tick ${cls}${i === active ? ' active' : ''}" data-act="goto" data-id="${id}" style="left:${((i + 0.5) / n * 100).toFixed(2)}%" title="${esc(title)}"><i></i><span>${text}</span></button>`;
    $('#timeline').innerHTML = `<button data-act="play" class="play" title="Replay the memory from t0" aria-label="Replay">${S.playing ? '<b>❚❚</b>' : '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 4.5l12 7.5-12 7.5Z" fill="#fff"/></svg>'}</button>
      <div class="track${n > 3 ? ' dense' : ''}"><div class="rail"></div><div class="rail on" style="width:${((active + 0.5) / n * 100).toFixed(2)}%"></div>
      ${cs.map((c, i) => tick(i, c.by === 'operator' ? 'op' : 'robot', i, `${c.t} · ${c.by} · ${c.label}`, `<em>${tName(i)}</em><u> · ${subs(c.label)}</u>`)).join('')}
      ${tick(cs.length, 'now', 'now', 'The live memory', `<em>now</em><u> · ${now}</u>`)}</div>`;
  }

  // ───────────────────────────── side panel ─────────────────────────────
  const STATUS_TEXT = { proposed: 'proposed · awaiting operator', validated: 'validated', deprecated: 'deprecated' };
  const badge = (s) => `<span class="badge ${s}">${STATUS_TEXT[s]}</span>`;
  function factCard(e) {
    const k = store.conflictOf(e, C());
    return `<button class="fact${S.sel?.type === 'edge' && S.sel.id === e.id ? ' current' : ''}" data-act="select-edge" data-id="${e.id}" style="--c:${styleOf(e).stroke}">
      <span class="fid">${sub(e.id)}</span><span><b>${esc(e.sentence)}</b>
      <span class="fmeta">${esc(FAMILIES[e.family]?.label || e.family)} · ${e.status}${k ? ' · contradicts ' + sub(k.id) : ''}</span></span></button>`;
  }
  const rows = (list) => `<dl class="kv">${list.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const chip = (id) => `<button class="chip" data-act="select-node" data-id="${id}">${svgIcon(store.entity(id)?.icon, 13)}${esc(label(id))}</button>`;
  function reviewButtons(e) {
    if (!live()) return '<p class="muted">Go back to “now” to change this fact.</p>';
    const k = store.conflictOf(e, C()), b = [];
    if (e.status !== 'validated') b.push(`<button class="primary" data-act="validate" data-id="${e.id}">✓ Validate</button>`);
    if (e.status !== 'deprecated') b.push(`<button class="outline" data-act="deprecate" data-id="${e.id}">✕ Deprecate</button>`);
    return `<div class="review">${b.join('')}</div>` + (k && e.status === 'proposed' ? `<p class="muted note">Validating ${sub(e.id)} deprecates ${sub(k.id)}: both cannot hold.</p>` : '');
  }
  function edgeNote(e) {
    const col = styleOf(e).stroke, p = e.provenance, k = store.conflictOf(e, C()), q = Object.entries(e.qualifiers || {});
    return `<div class="eyebrow">Selected hyperedge</div>
      <h1 style="color:${col}">${sub(e.id)} ${esc(e.sentence)}</h1>
      <div class="badges"><span class="badge" style="color:${famColor(e.family)}">${esc(FAMILIES[e.family]?.label || e.family)}</span>${badge(e.status)}</div>
      ${k ? `<div class="callout"><b>Contradiction.</b> Memory also holds:${factCard(k)}</div>` : ''}
      <h2>Roles</h2>${rows(e.members.map((m) => [esc(m.role), chip(m.node)]))}
      ${q.length ? `<h2>Also records</h2>${rows(q.map(([a, b]) => [esc(a), esc(b)]))}` : ''}
      <h2>Temporal validity</h2>${rows([['since', `<a data-act="goto" data-id="${e.since}">${tName(e.since)}</a> · ${esc(commit(e.since).t)}`],
        ['until', e.until != null ? `<a data-act="goto" data-id="${e.until}">${tName(e.until)}</a> · ${esc(commit(e.until).t)}` : 'still held']])}
      <h2>Provenance</h2>${rows([['proposed by', esc(p.by)], ['through', esc(p.via)],
        ['confidence', `<span class="conf"><i style="width:${Math.round(e.confidence * 100)}%"></i></span>${e.confidence.toFixed(2)}`], p.evidence ? ['evidence', esc(p.evidence)] : null])}
      <h2>Validation status</h2><div class="badges">${badge(e.status)}</div>${reviewButtons(e)}
      <h2>History</h2>${e.history.map((h) => `<div class="step"><b>${esc(h.op)}</b> <span class="muted">${tName(h.c)} · ${esc(commit(h.c).t)} · ${esc(h.by)}</span><div>${subs(h.note || '')}</div></div>`).join('')}`;
  }
  function nodeNote(n) {
    const es = allEdges().filter((e) => e.members.some((m) => m.node === n.id));
    return `<div class="eyebrow">Entity</div><h1>${svgIcon(n.icon, 20)} ${esc(n.label)}</h1>
      <div class="badges"><span class="badge">${esc(KINDS[n.kind]?.label || n.kind)}</span><span class="badge">in ${es.length} fact${es.length === 1 ? '' : 's'}</span></div>
      <div class="review"><button data-act="focus" data-id="${n.id}">Show only its neighbourhood</button></div>
      <h2>Facts about ${esc(n.label)}</h2>${es.map(factCard).join('') || '<p class="muted">None in this memory state.</p>'}
      ${es.length > 1 ? `<p class="muted note">${esc(n.label)} takes part in ${es.length} facts. Each one stays whole: a hyperedge is not split into pairs.</p>` : ''}`;
  }
  function overview() {
    const es = edges(), ents = nodes(es);
    return `<div class="eyebrow">Memory of robot R1${S.robotView ? ' · robot view' : ''}</div>
      <h1>${es.length} fact${es.length === 1 ? '' : 's'}, ${ents.length} entities</h1>
      <p class="muted">Each region is one fact. Its arrows read as its sentence.</p>${es.map(factCard).join('')}
      <h2>Entities</h2><div class="chips">${ents.map((n) => chip(n.id)).join('')}</div>
      <p class="muted note">Click a region or an entity to inspect it. Double-click an entity to show only its neighbourhood. Drag to move; scroll or pinch to zoom.</p>`;
  }
  function form(f) {
    const ents = store.entitiesAt(C()), opt = (sel) => ents.map((n) => `<option value="${n.id}" ${n.id === sel ? 'selected' : ''}>${esc(n.label)}</option>`).join('');
    return `<div class="eyebrow">${f.id ? 'Edit hyperedge ' + sub(f.id) : 'New hyperedge'}</div><h1>${f.id ? 'Edit fact' : 'New fact'}</h1>
      <label class="field">sentence<input id="f-sentence" type="text" value="${esc(f.sentence)}" placeholder="Robot R1 put the book on table A"></label>
      <label class="field">context<select id="f-family">${Object.entries(FAMILIES).map(([k, v]) => `<option value="${k}" ${k === f.family ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <div class="field">participants and roles<div id="f-members">${f.members.map((m) => `<div class="mrow"><select class="m-node" aria-label="entity">${opt(m.node)}</select>
        <input class="m-role" value="${esc(m.role)}" placeholder="role" aria-label="role"><button data-act="form-del" title="Remove">✕</button></div>`).join('')}</div>
        <button data-act="form-add" data-id="member">+ participant</button></div>
      <div class="field">arrows, in reading order<div id="f-flow">${f.flow.map((a) => `<div class="mrow"><select class="a-from" aria-label="from">${opt(a.from)}</select>
        <input class="a-word" value="${esc(a.word)}" placeholder="word" aria-label="linking word"><select class="a-to" aria-label="to">${opt(a.to)}</select><button data-act="form-del" title="Remove">✕</button></div>`).join('')}</div>
        <button data-act="form-add" data-id="arrow">+ arrow</button></div>
      <div id="f-error" class="error" role="alert"></div>
      <div class="review"><button class="primary" data-act="form-save">Save as a new memory state</button><button class="outline" data-act="form-cancel">Cancel</button></div>`;
  }
  const PANELS = {
    graph() {
      if (S.sel?.type === 'edge') { const e = allEdges().find((x) => x.id === S.sel.id); if (e) return edgeNote(e); }
      if (S.sel?.type === 'node') { const n = store.entitiesAt(C()).find((x) => x.id === S.sel.id); if (n) return nodeNote(n); }
      return overview();
    },
    edit() {
      if (S.form) return form(S.form);
      const e = S.sel?.type === 'edge' && allEdges().find((x) => x.id === S.sel.id), n = S.sel?.type === 'node' && store.entity(S.sel.id), off = live() ? '' : 'disabled';
      return `<div class="eyebrow">Knowledge management</div><h1>Create and edit</h1>
        <p class="muted">Every change is saved as a new memory state, so it can be traced by going back in time.</p>
        ${live() ? '' : '<p class="error">You are reading a past state. Go back to “now” to edit.</p>'}
        <h2>Add</h2><div class="review"><button data-act="new-edge" ${off}>+ Hyperedge</button><button data-act="new-entity" ${off}>+ Entity</button></div>
        <h2>Selected</h2>
        ${e ? `${factCard(e)}<div class="review"><button data-act="edit-edge" data-id="${e.id}" ${off}>✎ Edit</button><button data-act="remove-edge" data-id="${e.id}" ${off}>Remove</button></div>`
          : n ? `<p><b>${esc(n.label)}</b> · ${esc(n.kind)}</p><div class="review"><button data-act="rename-entity" data-id="${n.id}" ${off}>Rename</button><button data-act="remove-entity" data-id="${n.id}" ${off}>Remove</button></div>`
          : '<p class="muted">Click a region or an entity in the drawing to edit or remove it.</p>'}`;
    },
    history() {
      const cs = store.db.commits, c = C(), d = store.diff(c - 1, c);
      const OPS = { propose: 'proposed', assert: 'added', validate: 'validated', deprecate: 'deprecated', edit: 'edited', remove: 'removed', 'add entity': 'entity added', 'remove entity': 'entity removed' };
      return `<div class="eyebrow">Temporal exploration</div><h1>Memory states</h1>
        ${cs.slice().reverse().map((k) => `<button class="state${k.id === c ? ' current' : ''}" data-act="goto" data-id="${k.id === store.head() ? 'now' : k.id}">
          <b>${tName(k.id)} · ${subs(k.label)}</b><span class="fmeta">${esc(k.t)} · by ${esc(k.by)}${k.id === store.head() ? ' · current' : ''}</span></button>`).join('')}
        <h2>What changed at ${tName(c)}</h2>
        ${d.map((r) => { const e = r.edge && (store.edgeAt(r.edge, c) || store.edgeAt(r.edge, r.c - 1));
          return `<div class="step"><b>${OPS[r.op] || r.op}</b> ${r.edge ? sub(r.edge) + (e ? ' · ' + esc(e.sentence) : '') : esc(label(r.entity))}<div class="muted">by ${esc(r.by)}${r.note ? ' — ' + subs(r.note) : ''}</div></div>`; }).join('') || '<p class="muted">Nothing.</p>'}
        <h2>Memory file</h2><div class="review"><button data-act="export">Export JSON</button><button data-act="import">Import…</button><button data-act="reset">Reset demo</button></div>
        <p class="muted note">Stored in ${esc(store.backendName)}.</p><input type="file" id="import-file" accept="application/json,.json" hidden>`;
    },
    review() {
      const all = allEdges(), p = all.filter((e) => e.status === 'proposed');
      return `<div class="eyebrow">Collaboration and provenance</div><h1>Review</h1>
        <p class="muted">Robots propose updates. A proposal is not used for planning until an operator validates it.</p>
        <h2>Awaiting the operator (${p.length})</h2>
        ${p.map((e) => factCard(e) + reviewButtons(e)).join('') || '<p class="muted">Nothing to review.</p>'}
        <h2>Where each fact comes from</h2>
        <table class="prov"><tr><th></th><th>proposed by</th><th>through</th><th>status</th></tr>
        ${all.map((e) => `<tr data-act="select-edge" data-id="${e.id}"><td style="color:${styleOf(e).stroke}">${sub(e.id)}</td><td>${esc(e.provenance.by)}</td><td>${esc(e.provenance.via)}</td><td>${e.status}</td></tr>`).join('')}</table>
        <h2>What the robot retrieves</h2>
        <label class="toggle"><input type="checkbox" id="robot-view-2" ${S.robotView ? 'checked' : ''}> Robot view: show only validated knowledge</label>`;
    },
    about() {
      return `<div class="eyebrow">About</div><h1>Hyper Interface</h1>
        <p><b>Human-Supervised Knowledge Hypergraph Memory for Autonomous Robots</b></p>
        <p class="muted">João Viterbo Vieira · José Pedro Carvalho · A. Pedro Aguiar<br>Faculty of Engineering, University of Porto · SYSTEC-ARISE<br>ROBOT2026 · 9th Iberian Robotics Conference</p>
        <p><a href="https://github.com/joao-viterbo-vieira/hyper-interface" target="_blank" rel="noopener">Code on GitHub ↗</a></p>
        <p>A robot's persistent memory is a knowledge hypergraph. A hyperedge keeps a whole fact and its context as one unit: who did what to which object, where, since when, and who said so. Hyper Interface lets an operator see that memory, correct it, and trace how it changed.</p>
        <h2>Four capabilities</h2>
        ${[['graph', 'Higher-order visualization', 'Explore entities and hyperedges; filter by context.'], ['pencil', 'Interactive knowledge management', 'Create, edit, validate and remove.'],
           ['clock', 'Temporal knowledge exploration', 'Compare memory states; trace what changed.'], ['branch', 'Collaboration and provenance', 'Robots propose updates; operators supervise.']]
          .map(([ic, t, d], i) => `<button class="cap" data-act="mode" data-id="${MODES[i][0]}">${svgIcon(ic, 18)}<span><b>${t}</b><br><span class="muted">${d}</span></span></button>`).join('')}
        <h2>Demonstration graphs</h2>
        <p class="muted">Three real knowledge hypergraphs, read-only, drawn in 2D and 3D.</p>
        <div class="review">${gallery.LIST.map(([id, name]) => `<button data-act="memory" data-id="${id}">${esc(name)}</button>`).join('')}</div>
        <p class="muted note">The memory shown is an illustrative scenario built around the example on the poster, not a recording from a real robot. Your edits stay in this browser.</p>`;
    },
  };
  function renderPanel() {
    const todo = inSet() ? 0 : pending().length;
    document.querySelectorAll('#rail button').forEach((b) => {
      b.classList.toggle('active', b.dataset.id === S.mode);
      if (b.dataset.id === 'review') { if (todo) b.dataset.badge = todo; else delete b.dataset.badge; }
    });
    // on a phone the panel is a bottom sheet: collapsed it shows only its title, the grab bar pulls it up
    document.body.classList.toggle('sheet-open', S.sheet);
    const body = !inSet() || S.mode === 'about' ? PANELS[S.mode]() : S.mode === 'graph' ? gallery.panelHTML()
      : `<div class="eyebrow">Read-only demonstration</div><h1>Not available for this graph</h1>
         <p class="muted">Editing, memory states and review work on the robot's memory. A demonstration graph can only be explored, in 2D and 3D.</p>
         <div class="review"><button data-act="mode" data-id="graph">Explore the graph</button><button data-act="memory" data-id="">Back to robot R1</button></div>`;
    $('#panel').innerHTML = `<button class="grab" data-act="sheet" aria-expanded="${S.sheet}" aria-label="${S.sheet ? 'Collapse' : 'Expand'} the panel"></button>` + body;
  }
  function refresh() { renderCanvas(); renderPanel(); }
  const refit = () => { refresh(); fit(); };

  // ───────────────────────────── state ↔ URL ─────────────────────────────
  let wanted = null;                                 // #set=… in the URL: opened once the page is up
  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.get('set')) { wanted = q.get('set'); if (q.get('view') === '2d') gallery.state.dim = 2; }
    if (VIEWS.some((v) => v[0] === q.get('view'))) S.view = q.get('view');
    if (q.has('scene')) applyScene(q.get('scene'));
    if (q.get('focus') && store.entity(q.get('focus'))) S.focus = q.get('focus');
    if (q.has('at')) { const a = +q.get('at'); if (a >= 0 && a < store.head()) S.at = a; }
    if (q.has('edge')) S.sel = q.get('edge') ? { type: 'edge', id: q.get('edge') } : null;
    if (MODES.some((m) => m[0] === q.get('mode'))) { S.mode = q.get('mode'); S.sheet = S.mode !== 'graph'; }
  }
  function writeHash() {
    const q = new URLSearchParams();
    if (inSet()) {
      q.set('set', gallery.state.id); if (gallery.state.dim === 2) q.set('view', '2d'); if (S.mode !== 'graph') q.set('mode', S.mode);
      return history.replaceState(null, '', '#' + q);
    }
    if (S.view !== 'hull') q.set('view', S.view);
    if (S.scene !== 'all') q.set('scene', S.scene);
    if (S.focus && S.scene === 'all') q.set('focus', S.focus);
    if (!live()) q.set('at', S.at);
    if (S.sel?.type === 'edge' && S.sel.id !== 'e2') q.set('edge', S.sel.id);
    if (S.mode !== 'graph') q.set('mode', S.mode);
    history.replaceState(null, '', q.toString() ? '#' + q : location.pathname + location.search);
  }

  // ───────────────────────────── actions ─────────────────────────────
  function setMemory(id) {
    stopPlay(); S.form = null; S.sheet = false; $('#search').value = ''; $('#results').hidden = true;
    if (id) { if (S.mode !== 'about') S.mode = 'graph'; gallery.open(id); }
    else { gallery.close(); refit(); }
  }
  function applyScene(id) {
    if (!SCENES.some((s) => s[0] === id)) return;
    S.scene = id; S.hidden.clear(); S.hops = 1;
    S.focus = id === 'cup' ? 'cup' : id === 'r2' ? 'robot-r2' : null;
  }
  function select(sel) {
    S.sel = sel; S.form = null;
    if (sel && (S.mode === 'about' || S.mode === 'history')) S.mode = 'graph';
    // a fact picked from a list may be filtered out of the drawing: bring it back
    if (sel?.type === 'edge' && !edges().some((e) => e.id === sel.id)) { const e = allEdges().find((x) => x.id === sel.id); if (e) { applyScene('all'); S.robotView = false; S.showDeprecated = true; return refit(); } }
    refresh();
  }
  function focus(id) { S.sheet = false; S.focus = id; S.scene = S.scene === 'poster' ? 'poster' : 'all'; S.sel = { type: 'node', id }; S.form = null; if (S.view === '3d') S.view = 'hull'; refit(); }
  function goto(id) { S.at = id === 'now' || +id >= store.head() ? 'now' : Math.max(0, +id); S.form = null; refresh(); }
  function stopPlay() { clearInterval(S.playing); S.playing = null; }
  function readForm() {
    const members = [...document.querySelectorAll('#f-members .mrow')].map((r) => ({ node: r.querySelector('.m-node').value, role: r.querySelector('.m-role').value.trim() || 'participant' }));
    const flow = [...document.querySelectorAll('#f-flow .mrow')].map((r) => ({ from: r.querySelector('.a-from').value, word: r.querySelector('.a-word').value.trim(), to: r.querySelector('.a-to').value }));
    return { ...S.form, sentence: $('#f-sentence').value.trim(), family: $('#f-family').value, members, flow };
  }
  const ACT = {
    mode: (id) => { S.sheet = id === S.mode ? !S.sheet : true; S.mode = id; S.form = null; renderPanel(); $('#panel').scrollTop = 0; writeHash(); },
    sheet: () => { S.sheet = !S.sheet; renderPanel(); $('#panel').scrollTop = 0; },
    options: () => { const open = $('#bar').classList.toggle('open'); $('#opt-toggle').setAttribute('aria-expanded', open); },
    memory: (id) => setMemory(id),
    view: (id) => { S.view = id; refit(); },
    'select-edge': (id) => select({ type: 'edge', id }),
    'select-node': (id) => select({ type: 'node', id }),
    focus: (id) => focus(id),
    unfocus: () => { S.focus = null; if (S.scene !== 'poster') S.scene = 'all'; refit(); },
    family: (id, ev) => {
      const all = Object.keys(FAMILIES);
      if (ev.altKey) S.hidden = new Set(S.hidden.size === all.length - 1 && !S.hidden.has(id) ? [] : all.filter((f) => f !== id));
      else S.hidden.has(id) ? S.hidden.delete(id) : S.hidden.add(id);
      refit();
    },
    rotate: () => v3?.toggleRotate(),
    goto: (id) => { stopPlay(); goto(id); },
    play: () => {
      if (S.playing) { stopPlay(); return renderTimeline(); }
      if (store.head() === 0) return;
      S.sel = null; goto(0);
      S.playing = setInterval(() => { if (live()) { stopPlay(); renderTimeline(); } else goto(S.at + 1 >= store.head() ? 'now' : S.at + 1); }, 1900);
      renderTimeline();
    },
    zoom: (id) => (id === 'fit' ? fit() : cv.zoom(id === 'in' ? 1.25 : 0.8)),
    theme: () => { const r = document.documentElement, next = r.dataset.theme === 'light' ? 'dark' : 'light'; r.dataset.theme = next;
      try { localStorage.setItem('hyper-interface/theme', next); } catch (e) { /* ignore */ } refresh(); },
    validate: (id) => { S.sel = { type: 'edge', id }; store.actions.validate(id); },
    deprecate: (id) => { S.sel = { type: 'edge', id }; S.showDeprecated = true; store.actions.deprecate(id); },
    'remove-edge': (id) => { if (confirm('Remove ' + id + ' from memory? It stays readable in earlier states.')) { S.sel = null; store.actions.remove(id); } },
    'edit-edge': (id) => { const e = store.edgeAt(id, C()); S.form = { id, sentence: e.sentence, family: e.family, members: e.members.map((m) => ({ ...m })), flow: e.flow.map((a) => ({ ...a })) }; renderPanel(); },
    'new-edge': () => { const ns = store.entitiesAt(C()), a = S.sel?.type === 'node' ? S.sel.id : ns[0].id, b = ns.find((n) => n.id !== a).id;
      S.form = { id: null, sentence: '', family: 'observation', members: [a, b].map((id) => ({ node: id, role: KINDS[store.entity(id).kind]?.role || 'participant' })), flow: [{ from: a, word: '', to: b }] }; renderPanel(); },
    'form-add': (id) => { const f = readForm(), ns = store.entitiesAt(C()), used = new Set(f.members.map((m) => m.node));
      if (id === 'member') { const n = ns.find((x) => !used.has(x.id)) || ns[0]; f.members.push({ node: n.id, role: KINDS[n.kind]?.role || '' }); }
      else f.flow.push({ from: f.members[f.members.length - 2]?.node || ns[0].id, word: '', to: f.members[f.members.length - 1]?.node || ns[0].id });
      S.form = f; renderPanel(); },
    'form-del': (id, ev) => { ev.target.closest('.mrow').remove(); S.form = readForm(); renderPanel(); },
    'form-cancel': () => { S.form = null; renderPanel(); },
    'form-save': () => {
      const f = readForm(), ids = f.members.map((m) => m.node), set = new Set(ids);
      const err = !f.sentence ? 'Write the sentence this fact asserts.' : ids.length < 2 ? 'A fact needs at least two participants.' : set.size !== ids.length ? 'A participant appears twice.'
        : f.flow.some((a) => !set.has(a.from) || !set.has(a.to) || a.from === a.to) ? 'Each arrow must link two different participants of this fact.' : f.flow.some((a) => !a.word) ? 'Give every arrow its linking word.' : '';
      if (err) { $('#f-error').textContent = err; return; }
      const patch = { sentence: f.sentence, family: f.family, members: f.members, flow: f.flow };
      S.form = null; S.mode = 'graph'; S.sheet = false;
      if (f.id) { S.sel = { type: 'edge', id: f.id }; store.actions.edit(f.id, patch); }
      else { applyScene('all'); S.sel = { type: 'edge', id: store.actions.addEdge(patch) }; refit(); }
    },
    'new-entity': () => { const name = prompt('Name of the new entity'); if (!name || !name.trim()) return;
      const kind = prompt('Kind: ' + Object.keys(KINDS).join(', '), 'object'); if (!KINDS[kind]) return alert('Unknown kind.');
      applyScene('all'); S.sel = { type: 'node', id: store.actions.addEntity(name.trim(), kind) }; refit(); },
    'rename-entity': (id) => { const name = prompt('New name', label(id)); if (name && name.trim()) store.actions.renameEntity(id, name.trim()); },
    'remove-entity': (id) => { if (confirm('Remove ' + label(id) + '? Facts left with one participant are removed too.')) { S.sel = null; if (S.focus === id) S.focus = null; store.actions.removeEntity(id); } },
    export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' })); a.download = 'robot-memory.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    import: () => $('#import-file').click(),
    reset: () => { if (confirm('Discard your edits and restore the demo memory?')) { S.at = 'now'; S.sel = { type: 'edge', id: 'e2' }; S.robotView = false; applyScene('all'); store.reset().then(fit); } },
  };
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.disabled) { if (!ev.target.closest('#search-wrap')) $('#results').hidden = true; return; }
    if (t.tagName === 'A') ev.preventDefault();
    const act = t.dataset.act;
    if (inSet() && (act === 'set-edge' || act === 'set-node' || act === 'set-focus')) S.mode = 'graph';
    (ACT[act] || gallery.act[act])?.(t.dataset.id, ev);
    if (t.closest('#results')) { $('#results').hidden = true; $('#search').value = ''; }
  });
  document.addEventListener('change', (ev) => {
    const id = ev.target.id;
    if (id === 'memory') setMemory(ev.target.value);
    else if (id === 'set-hops') gallery.setHops(+ev.target.value);
    else if (id === 'robot-view' || id === 'robot-view-2') { S.robotView = ev.target.checked; refit(); }
    else if (id === 'show-dep') { S.showDeprecated = ev.target.checked; refresh(); }
    else if (id === 'scene') { applyScene(ev.target.value); S.sel = null; refit(); }
    else if (id === 'hops') { S.hops = +ev.target.value; refit(); }
    else if (id === 'import-file' && ev.target.files[0]) ev.target.files[0].text().then((txt) => store.importJSON(txt)).then(() => { S.at = 'now'; S.sel = null; refit(); }).catch((e) => alert('Could not import: ' + e.message));
  });
  function search(q) {
    const box = $('#results'); q = q.trim().toLowerCase();
    if (!q) { box.hidden = true; return; }
    if (inSet()) { box.innerHTML = gallery.searchHTML(q); box.hidden = false; return; }
    const ents = store.entitiesAt(C()).filter((n) => n.label.toLowerCase().includes(q)).slice(0, 6);
    const es = allEdges().filter((e) => (e.id + ' ' + e.sentence + ' ' + e.members.map((m) => label(m.node) + ' ' + m.role).join(' ')).toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = ents.map((n) => `<button data-act="focus" data-id="${n.id}">${svgIcon(n.icon, 14)} ${esc(n.label)} <em>${esc(n.kind)}</em></button>`).join('') +
      es.map((e) => `<button data-act="select-edge" data-id="${e.id}"><b style="color:${styleOf(e).stroke}">${sub(e.id)}</b> ${esc(e.sentence)}</button>`).join('') || '<p>Nothing matches in this memory state.</p>';
    box.hidden = false;
  }

  async function start() {
    try { const t = localStorage.getItem('hyper-interface/theme'); if (t === 'light') document.documentElement.dataset.theme = 'light'; } catch (e) { /* ignore */ }
    await store.init();
    readHash();
    $('#rail').innerHTML = MODES.map(([id, ic, title, name]) => `<button data-act="mode" data-id="${id}" title="${title}" aria-label="${title}">${svgIcon(ic, 19)}<span>${name}</span></button>`).join('');
    cv = canvas.create($('#canvas'), hooks);
    store.subscribe(() => { S.at = 'now'; refresh(); });
    gallery.onChange(refresh);
    $('#search').addEventListener('input', (ev) => search(ev.target.value));
    $('#search').addEventListener('focus', (ev) => search(ev.target.value));
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('#results').hidden = true; });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (inSet()) gallery.resize($('#stage3d')); else if (S.view === '3d') renderCanvas(); else fit(); }, 150); });
    refit();
    if (wanted) setMemory(wanted);
    window.HI.app = { state: S, refresh, select, goto, setMemory };
  }
  start();
})();
