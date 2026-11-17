// Adds a precomputed 2D and 3D force layout to each exported graph and writes data/<id>.js, so the page
// draws a large graph at once and always the same way.
//
//   npm install d3-force-3d            (in any folder; run this script from that folder)
//   node /path/to/tools/layout_demo_graphs.mjs IN_DIR /path/to/data
//
// Every hyperedge becomes a hub linked to its members; positions are stored as integers, entities first, then hubs.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
const d3 = createRequire(process.cwd() + '/')('d3-force-3d');
const [inDir, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

function layout(set, dims) {
  const N = set.nodes.length, deg = new Array(N).fill(0);
  for (const e of set.edges) for (const [i] of e.m) deg[i]++;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // deterministic start
  const R = 30 * Math.cbrt(N + set.edges.length);
  const at = () => ({ x: (rnd() - 0.5) * R, y: (rnd() - 0.5) * R, z: dims === 3 ? (rnd() - 0.5) * R : 0 });
  const nodes = set.nodes.map((n, i) => ({ id: i, hub: false, ...at() }));
  const links = [];
  set.edges.forEach((e, j) => { nodes.push({ id: N + j, hub: true, ...at() }); for (const [i] of e.m) links.push({ source: N + j, target: i }); });
  const sim = d3.forceSimulation(nodes, dims)
    .force('charge', d3.forceManyBody().strength((n) => (n.hub ? -14 : -38 - 6 * Math.sqrt(deg[n.id]))).theta(0.9).distanceMax(900))
    .force('link', d3.forceLink(links).distance(22).strength((l) => 1 / Math.min(3 + Math.sqrt(deg[l.target.id]), 9)))
    .force('x', d3.forceX().strength(0.012)).force('y', d3.forceY().strength(0.012))
    .alphaDecay(1 - Math.pow(0.001, 1 / 400)).stop();
  if (dims === 3) sim.force('z', d3.forceZ().strength(0.012));
  for (let i = 0; i < 400; i++) sim.tick();
  const out = [];
  for (const n of nodes) { out.push(Math.round(n.x), Math.round(n.y)); if (dims === 3) out.push(Math.round(n.z)); }
  return out;
}

for (const f of readdirSync(inDir).filter((f) => f.endsWith('.json'))) {
  const set = JSON.parse(readFileSync(`${inDir}/${f}`, 'utf8')), t = Date.now();
  set.p2 = layout(set, 2); set.p3 = layout(set, 3);
  const js = `(window.HI_SETS = window.HI_SETS || {})[${JSON.stringify(set.id)}] = ${JSON.stringify(set)};\n`;
  writeFileSync(`${outDir}/${set.id}.js`, js);
  console.log(set.id, set.nodes.length + set.edges.length, 'points', ((Date.now() - t) / 1000).toFixed(1) + 's', (js.length / 1e6).toFixed(2) + ' MB');
}
