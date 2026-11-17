// Hyper Interface: the window around the drawing. Rail modes follow the paper's four capabilities:
// graph = visualize · pencil = manage · clock = memory states · branch = review and provenance.
(function () {
  const { store, canvas } = window.HI;
  const { KINDS, FAMILIES } = store;
  const { ICONS } = window.HI_DATA;
  const { esc, styleOf } = canvas;
  const $ = (s) => document.querySelector(s);
  const MODES = [['graph', 'graph', 'Explore the hypergraph'], ['edit', 'pencil', 'Create and edit knowledge'],
                 ['history', 'clock', 'Memory states over time'], ['review', 'branch', 'Review proposals and provenance'], ['about', 'info', 'About']];
  const S = { at: 'now', mode: 'graph', sel: { type: 'edge', id: 'e2' }, form: null, robotView: false, playing: null };
  let cv = null;

  const C = () => (S.at === 'now' ? store.head() : S.at);
  const live = () => S.at === 'now';
  const label = (id) => store.entity(id)?.label || id;
  const commit = (c) => store.db.commits[c];
  const tName = (c) => (c <= 1 ? 't<sub>' + c + '</sub>' : esc(commit(c).t));
  const sub = (id) => esc(id).replace(/^e(\d+)$/, 'e<sub>$1</sub>');
  const subs = (s) => esc(s).replace(/\be(\d+)\b/g, 'e<sub>$1</sub>');
  const svgIcon = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

  function edges() {
    let list = store.edgesAt(C()).sort((a, b) => (+a.id.slice(1) || 0) - (+b.id.slice(1) || 0));
    if (S.robotView) list = list.filter((e) => e.status === 'validated');
    return list.map((e) => ({ ...e, conflict: store.conflictOf(e, C())?.id || null }));
  }
  const pending = () => store.edgesAt(store.head()).filter((e) => e.status === 'proposed');

  // ───────────────────────────── drawing and timeline ─────────────────────────────
  function renderCanvas() {
    cv.render({ nodes: store.entitiesAt(C()).map((n) => ({ ...n })), edges: edges().map((e) => ({ ...e, caption: e.caption && { ...e.caption } })), sel: S.sel });
    $('#robot-view').checked = S.robotView;
    $('#readonly').hidden = live();
    if (!live()) $('#readonly').innerHTML = `Memory as it was at <b>${tName(S.at)}</b> · ${esc(commit(S.at).t)} — read-only. <button data-act="goto" data-id="now">Back to now</button>`;
    renderTimeline(); writeHash();
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
    const col = styleOf(e).stroke, k = store.conflictOf(e, C());
    return `<button class="fact${S.sel?.type === 'edge' && S.sel.id === e.id ? ' current' : ''}" data-act="select-edge" data-id="${e.id}" style="--c:${col}">
      <span class="fid">${sub(e.id)}</span><span><b>${esc(e.sentence)}</b>
      <span class="fmeta">${esc(FAMILIES[e.family]?.label || e.family)} · ${e.status}${k ? ' · contradicts ' + sub(k.id) : ''}</span></span></button>`;
  }
  const rows = (list) => `<dl class="kv">${list.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const chip = (id) => `<button class="chip" data-act="select-node" data-id="${id}">${svgIcon(store.entity(id)?.icon || 'box', 13)}${esc(label(id))}</button>`;
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
      <div class="badges"><span class="badge" style="color:${(FAMILIES[e.family] || {}).color}">${esc(FAMILIES[e.family]?.label || e.family)}</span>${badge(e.status)}</div>
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
    const es = edges().filter((e) => e.members.some((m) => m.node === n.id));
    return `<div class="eyebrow">Entity</div><h1>${svgIcon(n.icon, 20)} ${esc(n.label)}</h1>
      <div class="badges"><span class="badge">${esc(KINDS[n.kind]?.label || n.kind)}</span><span class="badge">in ${es.length} fact${es.length === 1 ? '' : 's'}</span></div>
      <h2>Facts about ${esc(n.label)}</h2>${es.map(factCard).join('') || '<p class="muted">None in this memory state.</p>'}
      ${es.length > 1 ? `<p class="muted note">${esc(n.label)} takes part in ${es.length} facts. Each one stays whole: a hyperedge is not split into pairs.</p>` : ''}`;
  }
  function overview() {
    const es = edges();
    return `<div class="eyebrow">Memory of robot R1${S.robotView ? ' · robot view' : ''}</div>
      <h1>${es.length} fact${es.length === 1 ? '' : 's'}, ${store.entitiesAt(C()).length} entities</h1>
      <p class="muted">Each region is one fact. Its arrows read as its sentence.</p>${es.map(factCard).join('')}
      <p class="muted note">Click a region to inspect it. Drag an entity to move it. Scroll or pinch to zoom.</p>`;
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
      if (S.sel?.type === 'edge') { const e = edges().find((x) => x.id === S.sel.id); if (e) return edgeNote(e); }
      if (S.sel?.type === 'node') { const n = store.entitiesAt(C()).find((x) => x.id === S.sel.id); if (n) return nodeNote(n); }
      return overview();
    },
    edit() {
      if (S.form) return form(S.form);
      const e = S.sel?.type === 'edge' && edges().find((x) => x.id === S.sel.id), n = S.sel?.type === 'node' && store.entity(S.sel.id), off = live() ? '' : 'disabled';
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
      const p = store.edgesAt(C()).filter((e) => e.status === 'proposed'), all = edges();
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
        <p>A robot's persistent memory is a knowledge hypergraph. A hyperedge keeps a whole fact and its context as one unit: who did what to which object, where, since when, and who said so. Hyper Interface lets an operator see that memory, correct it, and trace how it changed.</p>
        <h2>Four capabilities</h2>
        ${[['graph', 'Higher-order visualization', 'Explore entities and hyperedges.'], ['pencil', 'Interactive knowledge management', 'Create, edit, validate and remove.'],
           ['clock', 'Temporal knowledge exploration', 'Compare memory states; trace what changed.'], ['branch', 'Collaboration and provenance', 'Robots propose updates; operators supervise.']]
          .map(([ic, t, d], i) => `<button class="cap" data-act="mode" data-id="${MODES[i][0]}">${svgIcon(ic, 18)}<span><b>${t}</b><br><span class="muted">${d}</span></span></button>`).join('')}
        <p class="muted note">The memory shown is the illustrative example from the poster, not a recording from a real robot. Your edits stay in this browser.</p>`;
    },
  };
  function renderPanel() {
    document.querySelectorAll('#rail button').forEach((b) => b.classList.toggle('active', b.dataset.id === S.mode));
    $('#panel').innerHTML = PANELS[S.mode]();
  }
  function refresh() { renderCanvas(); renderPanel(); }

  // ───────────────────────────── state ↔ URL ─────────────────────────────
  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.has('at')) { const a = +q.get('at'); if (a >= 0 && a < store.head()) S.at = a; }
    if (q.has('edge')) S.sel = q.get('edge') ? { type: 'edge', id: q.get('edge') } : null;
    if (MODES.some((m) => m[0] === q.get('mode'))) S.mode = q.get('mode');
  }
  function writeHash() {
    const q = new URLSearchParams();
    if (!live()) q.set('at', S.at);
    if (S.sel?.type === 'edge' && S.sel.id !== 'e2') q.set('edge', S.sel.id);
    if (S.mode !== 'graph') q.set('mode', S.mode);
    history.replaceState(null, '', q.toString() ? '#' + q : location.pathname + location.search);
  }

  // ───────────────────────────── actions ─────────────────────────────
  function select(sel) { S.sel = sel; S.form = null; if (sel && (S.mode === 'about' || S.mode === 'history')) S.mode = 'graph'; refresh(); }
  function goto(id) { S.at = id === 'now' || +id >= store.head() ? 'now' : Math.max(0, +id); S.form = null; refresh(); }
  function stopPlay() { clearInterval(S.playing); S.playing = null; }
  function readForm() {
    const members = [...document.querySelectorAll('#f-members .mrow')].map((r) => ({ node: r.querySelector('.m-node').value, role: r.querySelector('.m-role').value.trim() || 'participant' }));
    const flow = [...document.querySelectorAll('#f-flow .mrow')].map((r) => ({ from: r.querySelector('.a-from').value, word: r.querySelector('.a-word').value.trim(), to: r.querySelector('.a-to').value }));
    return { ...S.form, sentence: $('#f-sentence').value.trim(), family: $('#f-family').value, members, flow };
  }
  const ACT = {
    mode: (id) => { S.mode = id; S.form = null; renderPanel(); writeHash(); },
    'select-edge': (id) => select({ type: 'edge', id }),
    'select-node': (id) => select({ type: 'node', id }),
    goto: (id) => { stopPlay(); goto(id); },
    play: () => {
      if (S.playing) { stopPlay(); return renderTimeline(); }
      if (store.head() === 0) return;
      S.sel = null; goto(0);
      S.playing = setInterval(() => { if (live()) { stopPlay(); renderTimeline(); } else goto(S.at + 1 >= store.head() ? 'now' : S.at + 1); }, 1900);
      renderTimeline();
    },
    zoom: (id) => (id === 'fit' ? cv.fit() : cv.zoom(id === 'in' ? 1.25 : 0.8)),
    validate: (id) => { S.sel = { type: 'edge', id }; store.actions.validate(id); },
    deprecate: (id) => { S.sel = { type: 'edge', id }; store.actions.deprecate(id); },
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
      S.form = null; S.mode = 'graph';
      if (f.id) { S.sel = { type: 'edge', id: f.id }; store.actions.edit(f.id, patch); }
      else { const id = store.actions.addEdge(patch); S.sel = { type: 'edge', id }; refresh(); }
    },
    'new-entity': () => { const name = prompt('Name of the new entity'); if (!name || !name.trim()) return;
      const kind = prompt('Kind: ' + Object.keys(KINDS).join(', '), 'object'); if (!KINDS[kind]) return alert('Unknown kind.');
      const id = store.actions.addEntity(name.trim(), kind); S.sel = { type: 'node', id }; refresh(); },
    'rename-entity': (id) => { const name = prompt('New name', label(id)); if (name && name.trim()) store.actions.renameEntity(id, name.trim()); },
    'remove-entity': (id) => { if (confirm('Remove ' + label(id) + '? Facts left with one participant are removed too.')) { S.sel = null; store.actions.removeEntity(id); } },
    export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' })); a.download = 'robot-memory.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    import: () => $('#import-file').click(),
    reset: () => { if (confirm('Discard your edits and restore the poster example?')) { S.at = 'now'; S.sel = { type: 'edge', id: 'e2' }; S.robotView = false; store.reset().then(() => cv.fit()); } },
  };
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.disabled) return;
    if (t.tagName === 'A') ev.preventDefault();
    ACT[t.dataset.act]?.(t.dataset.id, ev);
  });
  document.addEventListener('change', (ev) => {
    const id = ev.target.id;
    if (id === 'robot-view' || id === 'robot-view-2') { S.robotView = ev.target.checked; refresh(); }
    else if (id === 'import-file' && ev.target.files[0]) ev.target.files[0].text().then((txt) => store.importJSON(txt)).then(() => { S.at = 'now'; S.sel = null; refresh(); }).catch((e) => alert('Could not import: ' + e.message));
  });

  function firstFit() {
    // a phone in portrait cannot show the whole canvas legibly: open on the fact under review instead
    const r = $('#canvas').getBoundingClientRect(), e = S.sel?.type === 'edge' && edges().find((x) => x.id === S.sel.id);
    if (r.width < 620 && e) cv.fit(cv.boxOf(e.members.map((m) => m.node), 95)); else cv.fit();
  }
  async function start() {
    await store.init();
    readHash();
    $('#rail').innerHTML = MODES.map(([id, ic, title]) => `<button data-act="mode" data-id="${id}" title="${title}" aria-label="${title}">${svgIcon(ic, 19)}</button>`).join('');
    cv = canvas.create($('#canvas'), {
      onNode: (id) => select({ type: 'node', id }), onEdge: (id) => select({ type: 'edge', id }), onBackground: () => select(null),
      onMove: (id, x, y) => store.actions.move(id, x, y), onMoveCaption: (id, x, y) => store.actions.moveCaption(id, x, y),
    });
    store.subscribe(() => { S.at = 'now'; refresh(); });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(firstFit, 150); });
    refresh(); firstFit();
    window.HI.app = { state: S, refresh, select, goto };
  }
  start();
})();
