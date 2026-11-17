// Memory store: an append-only log of commits. Nothing is overwritten, so every memory state can be read back.
// The interface talks only to this object; replacing localStorage with a robot-side service means replacing
// `backend` below (see README, "Connecting a real robot").
(function () {
  const { KINDS, FAMILIES, build, slug } = window.HI_DATA;
  const KEY = 'hyper-interface/v3';
  const listeners = new Set();
  let db = null;

  const LocalBackend = {
    name: 'this browser (demo data)',
    async load() {
      try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); if (d && d.version === 3) return d; } } catch (e) { /* private mode */ }
      return build();
    },
    async save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* quota or private mode: stay in memory */ } },
    async reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } return build(); },
  };
  // ?api=https://robot.local:8000  →  GET {api}/memory returns the whole document, PUT {api}/memory stores it.
  function RestBackend(api) {
    const url = api.replace(/\/$/, '') + '/memory';
    return {
      name: api,
      async load() { const r = await fetch(url); if (!r.ok) throw new Error('GET ' + url + ' → ' + r.status); return r.json(); },
      async save(d) { const r = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) });
        if (!r.ok) throw new Error('PUT ' + url + ' → ' + r.status); },
      async reset() { return this.load(); },
    };
  }
  const api = new URLSearchParams(location.search).get('api');
  let backend = api ? RestBackend(api) : LocalBackend;

  // ───────────── reading a memory state ─────────────
  const head = () => db.commits.length - 1;
  const STATUS = { propose: 'proposed', assert: 'validated', validate: 'validated', deprecate: 'deprecated', edit: 'validated' };
  const entity = (id) => db.entities.find((n) => n.id === id);
  const rawEdge = (id) => db.hyperedges.find((e) => e.id === id);
  const entitiesAt = (c) => db.entities.filter((n) => (n.added || 0) <= c && (n.removed == null || n.removed > c));

  // the hyperedge as it was at commit c, or null if it did not exist (yet, or any more)
  function edgeAt(e, c) {
    let status = null, statusSince = null, until = null, cur = { sentence: e.sentence, family: e.family, members: e.members, flow: e.flow };
    const history = [];
    for (const h of e.history) {
      if (h.c > c) continue;
      history.push(h);
      if (h.op === 'remove') return null;
      if (h.op === 'edit' && h.patch) cur = { ...cur, ...h.patch };
      status = STATUS[h.op]; statusSince = h.c; until = h.op === 'deprecate' ? h.c : null;
    }
    if (!history.length) return null;
    const alive = new Set(entitiesAt(c).map((n) => n.id));
    const members = cur.members.filter((m) => alive.has(m.node));
    const other = e.contradicts && rawEdge(e.contradicts) ? e.contradicts : null;
    return { id: e.id, ...cur, members, flow: cur.flow.filter((f) => alive.has(f.from) && alive.has(f.to)),
             status, statusSince, since: history[0].c, until, history, qualifiers: e.qualifiers || {},
             confidence: e.confidence, provenance: e.provenance, contradicts: other, core: !!e.core,
             caption: e.caption || null, caption2: e.caption2 || null };
  }
  const edgesAt = (c) => db.hyperedges.map((e) => edgeAt(e, c)).filter(Boolean);
  // an unresolved contradiction: both sides are still held in memory
  function conflictOf(v, c) {
    if (!v || v.status === 'deprecated') return null;
    const ids = [v.contradicts, ...db.hyperedges.filter((x) => x.contradicts === v.id).map((x) => x.id)].filter(Boolean);
    for (const id of ids) { const o = edgeAt(rawEdge(id), c); if (o && o.status !== 'deprecated') return o; }
    return null;
  }

  function diff(a, b) {            // one row per change in (a, b]
    const rows = [];
    for (const e of db.hyperedges) for (const h of e.history) if (h.c > a && h.c <= b) rows.push({ edge: e.id, ...h });
    for (const n of db.entities) {
      if ((n.added || 0) > a && n.added <= b) rows.push({ entity: n.id, op: 'add entity', c: n.added, by: 'operator' });
      if (n.removed != null && n.removed > a && n.removed <= b) rows.push({ entity: n.id, op: 'remove entity', c: n.removed, by: 'operator' });
    }
    return rows.sort((x, y) => x.c - y.c);
  }

  // ───────────── writing: every change is a new commit ─────────────
  const save = () => backend.save(db).catch((err) => console.warn('save failed', err));
  function commit(label, by, fn) {
    // the demo runs on the scenario's clock: each new state is a few minutes after the previous one
    const c = db.commits.length, [h, m] = db.commits[c - 1].t.split(':').map(Number), mins = (h * 60 + m + 4) % 1440;
    db.commits.push({ id: c, t: String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'), label, by });
    fn(c); save();
    listeners.forEach((f) => f());
    return c;
  }
  const nextEdgeId = () => 'e' + (Math.max(0, ...db.hyperedges.map((e) => +e.id.slice(1) || 0)) + 1);
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

  const actions = {
    // accepting an assertion retires the one it contradicts, in the same commit
    validate(id) {
      const e = rawEdge(id), other = conflictOf(edgeAt(e, head()), head());
      return commit('operator validated ' + id + (other ? ', deprecated ' + other.id : ''), 'operator', (c) => {
        e.history.push({ c, op: 'validate', by: 'operator', note: 'Validated by the operator.' });
        if (other) rawEdge(other.id).history.push({ c, op: 'deprecate', by: 'operator', note: 'Superseded by ' + id + ': ' + lower(edgeAt(e, c).sentence) + '.' });
      });
    },
    deprecate(id) { const e = rawEdge(id);
      return commit('operator deprecated ' + id, 'operator', (c) => e.history.push({ c, op: 'deprecate', by: 'operator', note: 'Deprecated by the operator.' })); },
    remove(id) { const e = rawEdge(id);
      return commit('operator removed ' + id, 'operator', (c) => e.history.push({ c, op: 'remove', by: 'operator', note: 'Removed from memory.' })); },
    edit(id, patch) { const e = rawEdge(id);
      return commit('operator edited ' + id, 'operator', (c) => e.history.push({ c, op: 'edit', by: 'operator', note: 'Edited by the operator.', patch })); },
    addEdge({ family, sentence, members, flow }) {
      const id = nextEdgeId();
      commit('operator added ' + id + ': ' + lower(sentence), 'operator', (c) => db.hyperedges.push({
        id, family, sentence, members, flow, qualifiers: {}, confidence: 1,
        provenance: { by: 'operator', via: 'Hyper Interface', evidence: 'Entered by the operator.' },
        history: [{ c, op: 'assert', by: 'operator', note: 'Created in Hyper Interface.' }] }));
      return id;
    },
    addEntity(label, kind) {
      let id = slug(label) || 'entity', k = 2; const base = id;
      while (entity(id)) id = base + '-' + k++;
      // drop it on a free spot along the bottom of the canvas; the operator drags it where it belongs
      const used = entitiesAt(head()).filter((n) => n.y > 690).length;
      commit('operator added entity ' + label, 'operator', (c) => db.entities.push({ id, label, kind, icon: KINDS[kind].icon, x: 600 + used * 92, y: 712, added: c }));
      return id;
    },
    renameEntity(id, label) { const n = entity(id), old = n.label; return commit('operator renamed ' + old + ' to ' + label, 'operator', () => { n.label = label; }); },
    removeEntity(id) { const n = entity(id);
      return commit('operator removed entity ' + n.label, 'operator', (c) => {
        n.removed = c;
        for (const e of db.hyperedges) {     // an assertion left with a single participant says nothing: retire it too
          const v = edgeAt(e, c - 1);
          if (v && v.members.some((m) => m.node === id) && v.members.length <= 2) e.history.push({ c, op: 'remove', by: 'operator', note: 'Lost a participant: ' + n.label + '.' });
        }
      }); },
    // where a node is drawn is not knowledge: it is saved, but it is not a memory state
    move(id, x, y) { const n = entity(id); n.x = Math.round(x); n.y = Math.round(y); save(); },
    moveCaption(id, key, x, y) { const e = rawEdge(id); e[key] = { ...(e[key] || e.caption || { anchor: 'start' }), x: Math.round(x), y: Math.round(y) }; save(); },
  };

  window.HI = window.HI || {};
  window.HI.store = {
    KINDS, FAMILIES, actions,
    async init() { try { db = await backend.load(); } catch (err) { console.warn('backend unavailable, using demo data', err); backend = LocalBackend; db = await backend.load(); } return db; },
    async reset() { db = await backend.reset(); listeners.forEach((f) => f()); },
    get db() { return db; }, get backendName() { return backend.name; },
    head, edgeAt: (id, c) => { const e = rawEdge(id); return e ? edgeAt(e, c) : null; }, edgesAt, entitiesAt, entity, diff, conflictOf,
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    exportJSON: () => JSON.stringify(db, null, 2),
    async importJSON(text) { const d = JSON.parse(text); if (!d || !Array.isArray(d.hyperedges) || !Array.isArray(d.commits) || !Array.isArray(d.entities)) throw new Error('not a Hyper Interface memory file');
      d.version = 3; db = d; await backend.save(db); listeners.forEach((f) => f()); },
  };
})();
