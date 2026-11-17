#!/usr/bin/env python3
"""Export the three demonstration hypergraphs to the compact shape js/gallery.js reads.

    python3 tools/export_demo_graphs.py OUT_DIR      # writes OUT_DIR/<id>.json (no layout yet)
    node tools/layout_demo_graphs.mjs OUT_DIR data   # adds 2D/3D positions, writes data/<id>.js

Sources (local paths, override with the environment variables):
    ZOTERO_DB    HyperKG-Zotero  db/hyperkg.sqlite          claims + incidences
    ONTO_DB      ontotipohypergraph  data/exp04.sqlite      L2 content hyperedges, same_as merged
    S2D_KG       HarnessKG  logs/harnesskg/s2d_s42/best/kg.json   best of seeds 42/43/44 on the S2D test set

Shape:  { id, title, short, blurb, source, stats:[[k,v]], groups:[{label,color,dark}], kinds:[label],
          papers:[label], nodes:[{l,k,d?}], edges:[{t,g,m:[[node,role]],pp?,p:{…}}] }
"""
import json, os, sqlite3, sys
from collections import Counter

HOME = os.path.expanduser('~')
ZOTERO_DB = os.environ.get('ZOTERO_DB', HOME + '/Desktop/startup/HyperKG-Zotero/db/hyperkg.sqlite')
ONTO_DB = os.environ.get('ONTO_DB', HOME + '/Desktop/startup/ontotipohypergraph/data/exp04.sqlite')
S2D_KG = os.environ.get('S2D_KG', HOME + '/Desktop/meta-harness/AAAI_submitted/HarnessKG/logs/harnesskg/s2d_s42/best/kg.json')

PALETTE = [('#1d5bd6', '#6f9bff'), ('#1f8a55', '#4cc38a'), ('#6b3fc9', '#a78bfa'), ('#0f8f9c', '#39c5cf'),
           ('#d93025', '#ef6b6b'), ('#b3307f', '#f58fc0'), ('#b85c0a', '#f29a2e')]
groups = lambda labels: [{'label': l, 'color': PALETTE[i % 7][0], 'dark': PALETTE[i % 7][1]} for i, l in enumerate(labels)]
cut = lambda s, n: (s if len(s) <= n else s[:n - 1].rstrip() + '…') if s else ''
one = lambda s: ' '.join((s or '').split())


def zotero():
    c = sqlite3.connect(f'file:{ZOTERO_DB}?mode=ro&immutable=1', uri=True)
    types = ['Result', 'Causal', 'Contribution', 'Comparison', 'Limitation']
    kinds = ['System', 'Method', 'Concept', 'Dataset', 'Metric', 'Task']
    nodes, nidx, papers, pidx, edges = [], {}, [], {}, []
    inc = {}
    for cid, eid, role in c.execute('select claim_id, entity_id, role from incidences order by claim_id, rowid'):
        inc.setdefault(cid, []).append((eid, role))
    ents = {i: (n, t, d) for i, n, t, d in c.execute('select id, name, etype, definition from entities')}
    rows = c.execute("""select c.id, c.claim_type, c.claim_text, c.predicate, c.qualifiers, c.confidence, c.section, c.quote,
                               p.id, p.title, p.year, p.authors
                        from claims c join papers p on p.id = c.paper_id where c.status = 'live' order by c.id""")
    for cid, ctype, text, pred, quals, conf, section, quote, pid, title, year, authors in rows:
        ms = []
        for eid, role in inc.get(cid, []):
            if eid not in nidx:
                n, t, d = ents[eid]
                nidx[eid] = len(nodes)
                node = {'l': one(n), 'k': kinds.index(t)}
                if d: node['d'] = cut(one(d), 200)
                nodes.append(node)
            ms.append([nidx[eid], role])
        if not ms: continue
        if pid not in pidx:
            au = json.loads(authors or '[]')
            who = (au[0].split()[-1] + (' et al.' if len(au) > 1 else '')) if au else ''
            pidx[pid] = len(papers)
            papers.append(one(title) + (f' ({who}{", " if who and year else ""}{year or ""})' if who or year else ''))
        p = {}
        if pred: p['predicate'] = pred
        for k, v in (json.loads(quals or '{}') or {}).items():
            if v not in (None, '', [], {}): p[k] = cut(one(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)), 120)
        if section: p['section'] = cut(one(section), 60)
        if conf is not None: p['confidence'] = round(conf, 2)
        if quote: p['quote'] = cut(one(quote), 220)
        edges.append({'t': one(text), 'g': types.index(ctype), 'm': ms, 'pp': pidx[pid], 'p': p})
    return {
        'id': 'zotero', 'title': 'Zotero KG', 'short': f'Zotero KG · {len(papers)} papers',
        'blurb': 'A hyper-relational knowledge graph of a research library. Each hyperedge is one claim extracted from a paper '
                 'and checked against a verbatim quote; its members are the systems, methods, datasets, metrics and concepts '
                 'the claim is about, each in a role.',
        'source': 'HyperKG-Zotero', 'unit': 'claim',
        'stats': [['papers', len(papers)], ['claims (hyperedges)', len(edges)], ['entities', len(nodes)],
                  ['memberships', sum(len(e['m']) for e in edges)]],
        'groups': groups(types), 'kinds': kinds, 'papers': papers, 'nodes': nodes, 'edges': edges,
    }


def ontotipo():
    c = sqlite3.connect(f'file:{ONTO_DB}?mode=ro', uri=True)
    kinds_e = ['mechanism', 'result', 'definition', 'card', 'limitation', 'contribution', 'detail']
    kinds_n = ['entity', 'type', 'document', 'agent', 'value']
    info = {i: (k, l, d) for i, k, l, d in c.execute('select id, kind, label, description from nodes where retracted_in is null')}
    parent = {}                                  # same_as alignments merge mentions of one thing across papers
    def find(x):
        while parent.get(x, x) != x: parent[x] = parent.get(parent[x], parent[x]); x = parent[x]
        return x
    merged = 0
    for s, o in c.execute("select subject, object from alignments where relation = 'same_as' and retracted_in is null"):
        a, b = find(s), find(o)
        if a != b and a in info and b in info: parent[max(a, b)] = min(a, b); merged += 1
    inc = {}
    for eid, nid, side, role, value, surface in c.execute('select edge_id, node_id, side, role, value, surface from incidence order by edge_id, position'):
        inc.setdefault(eid, []).append((nid, side, role, value, surface))
    nodes, nidx, papers, pidx, edges = [], {}, [], {}, []
    rows = c.execute("""select id, relation, claim, attribution, kind, confidence, doc_id, evidence, page
                        from hyperedges where layer = 'L2' and retracted_in is null order by id""")
    for eid, relation, claim, attribution, kind, conf, doc, evidence, page in rows:
        ms, seen = [], set()
        for nid, side, role, value, surface in inc.get(eid, []):
            key = find(nid) if nid in info else 'value:' + one(value or surface or nid)
            if key in seen: continue
            seen.add(key)
            if key not in nidx:
                k, l, d = info.get(key, ('value', None, None))
                nidx[key] = len(nodes)
                node = {'l': cut(one(l or value or surface or nid), 90), 'k': kinds_n.index(k)}
                if d: node['d'] = cut(one(d), 200)
                nodes.append(node)
            ms.append([nidx[key], (side + ' · ' + role) if role else side])
        if len(ms) < 1: continue
        if doc not in pidx:
            pidx[doc] = len(papers)
            papers.append(one(info.get(doc, (0, doc, 0))[1] or doc))
        p = {'relation': one(relation), 'attribution': (attribution or '').replace('_', ' ')}
        if page: p['page'] = page
        if conf is not None: p['confidence'] = round(conf, 2)
        if evidence: p['quote'] = cut(one(evidence), 220)
        edges.append({'t': cut(one(claim or relation), 260), 'g': kinds_e.index(kind), 'm': ms, 'pp': pidx[doc], 'p': p})
    return {
        'id': 'ontotipo', 'title': 'Ontotipo', 'short': f'Ontotipo · {len(papers)} papers',
        'blurb': 'A knowledge hypergraph with a fixed grammar and an induced schema, built from papers on knowledge hypergraphs. '
                 'Each hyperedge is one statement as its source wrote it; members sit on a fixed side (source, target, '
                 'condition, quantity) with a free role. Only the content layer (L2) is drawn; mentions the pipeline '
                 'aligned as the same thing are merged.',
        'source': 'ontotipohypergraph · exp04', 'unit': 'statement',
        'stats': [['papers', len(papers)], ['statements (hyperedges)', len(edges)], ['nodes', len(nodes)],
                  ['memberships', sum(len(e['m']) for e in edges)], ['same-as merges applied', merged]],
        'groups': groups(kinds_e), 'kinds': kinds_n, 'papers': papers, 'nodes': nodes, 'edges': edges,
    }


def s2d():
    d = json.load(open(S2D_KG))
    g, prefix = d['graph'], d['affixes'][0]
    kinds_n = ['label', 'concept', 'example', 'error_pattern', 'lesson']
    rel = ['supports_label', 'confusion_cluster']
    by = {n['id']: n for n in g['nodes']}
    text = lambda n: one(n['text'][len(prefix):] if n['text'].startswith(prefix) else n['text'])
    nodes, nidx, edges = [], {}, []
    for e in g['hyperedges']:
        ms = []
        for m in e['members']:
            n = by[m]
            if m not in nidx:
                nidx[m] = len(nodes); t = text(n)
                node = {'l': cut(t, 70), 'k': kinds_n.index(n['type'])}
                if len(t) > 70: node['d'] = cut(t, 420)
                nodes.append(node)
            ms.append([nidx[m], n['type'].replace('_', ' ')])
        labels = [text(by[m]) for m in e['members'] if by[m]['type'] == 'label']
        others = Counter(by[m]['type'] for m in e['members'] if by[m]['type'] != 'label')
        if e['relation_type'] == 'confusion_cluster': t = 'Confusable: ' + ' vs '.join(labels)
        elif others.get('example'): t = 'Training example of ' + labels[0]
        else: t = f"{others.get('concept', 0)} cues support {labels[0]}"
        edges.append({'t': t, 'g': rel.index(e['relation_type']), 'm': ms,
                      'p': {'relation': e['relation_type'], **{k: v for k, v in e.get('qualifiers', {}).items()}}})
    loose = Counter(n['type'] for n in g['nodes'] if n['id'] not in nidx)
    return {
        'id': 's2d', 'title': 'HarnessKG · S2D', 'short': 'HarnessKG · Symptom2Disease',
        'blurb': 'The task memory an evolutionary search built for a frozen LLM on Symptom2Disease (22 diagnoses). '
                 'Hyperedges tie a diagnosis to the cues that support it, to its training examples, and to the pairs it is '
                 'confused with. This is the frozen winner of seed 42, the best of the three seeds on the held-out test set '
                 '(88.7% at temperature 0; 87.7% and 85.8% for seeds 43 and 44).',
        'source': 'HarnessKG · logs/harnesskg/s2d_s42/best/kg.json', 'unit': 'hyperedge',
        'stats': [['hyperedges', len(edges)], ['nodes', len(nodes)], ['diagnoses', sum(n['k'] == 0 for n in nodes)],
                  ['memberships', sum(len(e['m']) for e in edges)]] +
                 ([['global rules, not in any hyperedge', loose['lesson']]] if loose.get('lesson') else []),
        'groups': groups(['supports label', 'confusion cluster']), 'kinds': [k.replace('_', ' ') for k in kinds_n],
        'papers': [], 'nodes': nodes, 'edges': edges,
    }


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for build in (zotero, ontotipo, s2d):
        s = build()
        with open(f"{out}/{s['id']}.json", 'w') as f: json.dump(s, f, ensure_ascii=False, separators=(',', ':'))
        print(s['id'], dict((k, v) for k, v in s['stats']), f"{os.path.getsize(f.name) / 1e6:.2f} MB")
