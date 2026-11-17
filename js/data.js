// Seed memory: the example on the poster. Four facts about robot R1, one of them a new observation that
// contradicts what memory already holds. It is an illustrative scenario, not a recording from a real robot.
//
// The shape below is the contract a robot-side service has to honour:
//   entities    { id, label, kind, icon, x, y }
//   hyperedges  { id, family, sentence, members:[{node, role}], flow:[{from, to, word}], qualifiers,
//                 confidence, provenance:{by, via, evidence}, contradicts, history:[…] }
//   history     { c: commit index, op: propose|assert|validate|deprecate|edit|remove, by, note, patch? }
//   commits     { id, t, label, by }        one memory state per commit, append-only
(function () {
  const NAVY = '#101b3d', BLUE = '#1d5bd6', GREEN = '#1f8a55', PURPLE = '#6b3fc9', RUST = '#b85c0a', ORANGE = '#f29a2e';

  const FAMILIES = {
    manipulation: { label: 'manipulation',    color: BLUE },
    task:         { label: 'task context',    color: GREEN },
    spatial:      { label: 'spatial context', color: PURPLE },
    observation:  { label: 'observation',     color: '#0f8f9c' },
    constraint:   { label: 'constraint',      color: '#d93025' },
  };
  const KINDS = {
    agent:    { label: 'agent',    icon: 'user',   role: 'agent' },
    object:   { label: 'object',   icon: 'box',    role: 'object' },
    location: { label: 'location', icon: 'pin',    role: 'location' },
    sensor:   { label: 'sensor',   icon: 'camera', role: 'observer' },
    task:     { label: 'task',     icon: 'task',   role: 'task' },
  };
  // 24×24 stroke icons, the ones drawn on the poster
  const ICONS = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4.5M2 14h2M20 14h2"/><circle cx="12" cy="3.4" r="1.2"/><circle cx="9" cy="14" r="1.3" fill="currentColor"/><circle cx="15" cy="14" r="1.3" fill="currentColor"/>',
    task: '<rect x="8.5" y="2.5" width="7" height="4" rx="1"/><path d="M15.5 4.5H17a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h1.5M9 14l2 2 4-4.5"/>',
    cup: '<path d="M4.5 7.5h12.5v8a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5ZM17 9.5h1.3a3 3 0 0 1 0 6H17"/>',
    shelf: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M4.5 9h15M4.5 15h15"/>',
    pin: '<path d="M19.5 10c0 5.5-7.5 11.5-7.5 11.5S4.5 15.5 4.5 10a7.5 7.5 0 0 1 15 0Z"/><circle cx="12" cy="10" r="2.7"/>',
    door: '<path d="M7 20.5V5.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M3.5 20.5h17"/><circle cx="14" cy="12.5" r=".9" fill="currentColor"/>',
    camera: '<path d="M9.3 4.5h5.4l2 2.8H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.3a2 2 0 0 1 2-2h3.3Z"/><circle cx="12" cy="13.3" r="3.3"/>',
    table: '<path d="M3.5 7h17M6.5 7v13M17.5 7v13M6.5 12.5h11"/>',
    box: '<path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.500 16ZM3.500 8 12 12.5 20.5 8M12 12.5v8"/>',
    graph: '<circle cx="5.5" cy="6" r="2.3"/><circle cx="18.5" cy="6" r="2.3"/><circle cx="12" cy="18.5" r="2.3"/><path d="M7.8 6h8.400M6.700 8l4.100 8.400M17.300 8l-4.100 8.400"/>',
    pencil: '<path d="M4 20l1-4.5L16.5 4a2.100 2.100 0 0 1 3 3L8 18.5ZM14.5 6l3 3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.300 2"/>',
    branch: '<circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="12" r="2.2"/><path d="M6 7.200v9.600M6 12h9.800"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.500M12 7.600v.2"/>',
  };

  function build() {
    return {
      version: 2,
      meta: { robot: 'robot R1', illustrative: true },
      // positions are the poster's, in the poster's own coordinates
      entities: [
        { id: 'operator', label: 'operator',       kind: 'agent',    icon: 'user',   x: 610,  y: 430 },
        { id: 'robot-r1', label: 'robot R1',       kind: 'agent',    icon: 'bot',    x: 772,  y: 497 },
        { id: 'tidy-lab', label: 'task: tidy lab', kind: 'task',     icon: 'task',   x: 646,  y: 570 },
        { id: 'cup',      label: 'cup',            kind: 'object',   icon: 'cup',    x: 978,  y: 546 },
        { id: 'shelf-b',  label: 'shelf B',        kind: 'location', icon: 'shelf',  x: 1228, y: 520 },
        { id: 'room-2',   label: 'room 2',         kind: 'location', icon: 'pin',    x: 1378, y: 440 },
        { id: 'door-d1',  label: 'door D1',        kind: 'location', icon: 'door',   x: 1364, y: 603 },
        { id: 'camera',   label: 'camera',         kind: 'sensor',   icon: 'camera', x: 828,  y: 661 },
        { id: 'table-a',  label: 'table A',        kind: 'location', icon: 'table',  x: 1082, y: 655 },
      ],
      hyperedges: [
        { id: 'e1', family: 'manipulation', sentence: 'Robot R1 put the cup on shelf B',
          members: [{ node: 'robot-r1', role: 'agent' }, { node: 'cup', role: 'object' }, { node: 'shelf-b', role: 'target' }],
          flow: [{ from: 'robot-r1', to: 'cup', word: 'put', t: 0.3 }, { from: 'cup', to: 'shelf-b', word: 'on' }],
          qualifiers: { manner: 'upright', where: 'room 2' },
          confidence: 0.97, provenance: { by: 'robot R1', via: 'action log', evidence: 'Place action completed; gripper released over shelf B.' },
          caption: { x: 868, y: 410, anchor: 'start' },
          history: [{ c: 0, op: 'propose', by: 'robot R1', note: 'Reported after completing the action.' },
                    { c: 0, op: 'validate', by: 'operator', note: 'Confirmed by the operator.' }] },
        { id: 'e2', family: 'observation', sentence: 'Camera sees the cup on table A', contradicts: 'e1',
          members: [{ node: 'camera', role: 'observer' }, { node: 'cup', role: 'object' }, { node: 'table-a', role: 'location' }],
          flow: [{ from: 'camera', to: 'cup', word: 'sees', dist: 15, t: 0.3 }, { from: 'cup', to: 'table-a', word: 'on', dist: 11 }],
          qualifiers: {},
          confidence: 0.91, provenance: { by: 'robot R1', via: 'camera', evidence: 'Detection “cup” (0.91), projected onto table A.' },
          caption: { x: 1404, y: 706, anchor: 'end' },
          history: [{ c: 1, op: 'propose', by: 'robot R1', note: 'New observation. It contradicts e1: the cup cannot be in both places.' }] },
        { id: 'e3', family: 'task', sentence: 'Operator asks robot R1 to tidy the lab',
          members: [{ node: 'operator', role: 'requester' }, { node: 'robot-r1', role: 'agent' }, { node: 'tidy-lab', role: 'task' }],
          flow: [{ from: 'operator', to: 'robot-r1', word: 'asks' }, { from: 'robot-r1', to: 'tidy-lab', word: 'to do', side: 1, dist: 17, t: 0.62 }],
          qualifiers: {},
          confidence: 1, provenance: { by: 'operator', via: 'spoken request', evidence: 'Request confirmed on the operator’s tablet.' },
          caption: { x: 556, y: 350, anchor: 'start' },
          history: [{ c: 0, op: 'assert', by: 'operator', note: 'Stated by the operator.' }] },
        { id: 'e4', family: 'spatial', sentence: 'Shelf B is in room 2, through door D1',
          members: [{ node: 'shelf-b', role: 'place' }, { node: 'room-2', role: 'room' }, { node: 'door-d1', role: 'access' }],
          flow: [{ from: 'shelf-b', to: 'room-2', word: 'in' }, { from: 'shelf-b', to: 'door-d1', word: 'through', dist: 27 }],
          qualifiers: {},
          confidence: 1, provenance: { by: 'operator', via: 'site map', evidence: 'Imported from the building map.' },
          caption: { x: 1440, y: 362, anchor: 'end' },
          history: [{ c: 0, op: 'assert', by: 'operator', note: 'Imported from the site map.' }] },
      ],
      commits: [
        { id: 0, t: '09:00', label: 'e1 validated: cup on shelf B', by: 'operator' },
        { id: 1, t: '10:12', label: 'camera sees cup on table A: conflicts with e1', by: 'robot R1' },
      ],
    };
  }

  window.HI_DATA = { FAMILIES, KINDS, ICONS, build, COLORS: { NAVY, BLUE, GREEN, PURPLE, RUST, ORANGE },
    slug: (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
})();
