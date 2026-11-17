// Seed memory. The four facts marked `core` are the example on the poster, at the poster's own coordinates;
// the others extend it to a fuller memory, laid out by hand around it. It is an illustrative scenario, not a
// recording from a real robot.
//
// The shape below is the contract a robot-side service has to honour:
//   entities    { id, label, kind, icon, x, y }
//   hyperedges  { id, family, sentence, members:[{node, role}], flow:[{from, to, word}], qualifiers,
//                 confidence, provenance:{by, via, evidence}, contradicts, history:[…] }
//   history     { c: commit index, op: propose|assert|validate|deprecate|edit|remove, by, note, patch? }
//   commits     { id, t, label, by }        one memory state per commit, append-only
(function () {
  // every colour has a light value (the poster's) and a dark one
  const FAMILIES = {
    manipulation: { label: 'manipulation',    color: '#1d5bd6', dark: '#6f9bff' },
    task:         { label: 'task context',    color: '#1f8a55', dark: '#4cc38a' },
    spatial:      { label: 'spatial context', color: '#6b3fc9', dark: '#a78bfa' },
    observation:  { label: 'observation',     color: '#0f8f9c', dark: '#39c5cf' },
    constraint:   { label: 'constraint',      color: '#d93025', dark: '#ef6b6b' },
    perception:   { label: 'perception',      color: '#b3307f', dark: '#f58fc0' },
  };
  const KINDS = {
    agent:      { label: 'agent',      icon: 'user',   role: 'agent' },
    object:     { label: 'object',     icon: 'box',    role: 'object' },
    location:   { label: 'location',   icon: 'pin',    role: 'location' },
    sensor:     { label: 'sensor',     icon: 'camera', role: 'observer' },
    task:       { label: 'task',       icon: 'task',   role: 'task' },
    constraint: { label: 'constraint', icon: 'up',     role: 'constraint' },
    software:   { label: 'software',   icon: 'chip',   role: 'component' },
  };
  // 24×24 stroke icons; the first eleven are the ones drawn on the poster
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
    up: '<path d="M12 17V3.5M6.5 9 12 3.5 17.5 9M5.5 21h13"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.3 2"/>',
    box: '<path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16ZM3.5 8 12 12.5 20.5 8M12 12.5v8"/>',
    chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21"/>',
    radar: '<path d="M12 20.5V12M4.5 12a7.5 7.5 0 0 1 15 0M8 12a4 4 0 0 1 8 0M8.5 20.5h7"/>',
    map: '<path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.500L15 20l-6-2.500L3.500 20ZM9 4v13.500M15 6.500V20"/>',
    layers: '<path d="M12 3.500 3.500 8 12 12.500 20.500 8ZM3.500 12 12 16.500 20.500 12M3.500 16 12 20.500 20.500 16"/>',
    route: '<circle cx="6" cy="18.500" r="2.200"/><circle cx="18" cy="5.500" r="2.200"/><path d="M8.200 18.500H15a3.500 3.500 0 0 0 0-7H9a3.500 3.500 0 0 1 0-7h6.800"/>',
    graph: '<circle cx="5.5" cy="6" r="2.3"/><circle cx="18.5" cy="6" r="2.3"/><circle cx="12" cy="18.5" r="2.3"/><path d="M7.800 6h8.400M6.700 8l4.100 8.400M17.300 8l-4.100 8.400"/>',
    pencil: '<path d="M4 20l1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500ZM14.500 6l3 3"/>',
    branch: '<circle cx="6" cy="5" r="2.200"/><circle cx="6" cy="19" r="2.200"/><circle cx="18" cy="12" r="2.200"/><path d="M6 7.200v9.600M6 12h9.800"/>',
    info: '<circle cx="12" cy="12" r="8.500"/><path d="M12 11v5.500M12 7.600v.200"/>',
  };

  const OP = 'operator', R1 = 'robot R1', R2 = 'robot R2';
  const said = (by, note) => [{ c: 0, op: 'assert', by, note }];

  function build() {
    return {
      version: 3,
      meta: { robot: 'robot R1', illustrative: true },
      entities: [
        // the poster's nine, at the poster's coordinates
        { id: 'operator', label: 'operator',       kind: 'agent',    icon: 'user',   x: 610,  y: 430 },
        { id: 'robot-r1', label: 'robot R1',       kind: 'agent',    icon: 'bot',    x: 772,  y: 497 },
        { id: 'tidy-lab', label: 'task: tidy lab', kind: 'task',     icon: 'task',   x: 646,  y: 570 },
        { id: 'cup',      label: 'cup',            kind: 'object',   icon: 'cup',    x: 978,  y: 546 },
        { id: 'shelf-b',  label: 'shelf B',        kind: 'location', icon: 'shelf',  x: 1228, y: 520 },
        { id: 'room-2',   label: 'room 2',         kind: 'location', icon: 'pin',    x: 1378, y: 440 },
        { id: 'door-d1',  label: 'door D1',        kind: 'location', icon: 'door',   x: 1364, y: 603 },
        { id: 'camera',   label: 'camera',         kind: 'sensor',   icon: 'camera', x: 828,  y: 661 },
        { id: 'table-a',  label: 'table A',        kind: 'location', icon: 'table',  x: 1082, y: 655 },
        // the rest of the memory, placed outwards so that no region swallows an entity it does not contain
        { id: 'fragile',  label: 'fragile objects', kind: 'object',    icon: 'box',    x: 1150, y: 300 },
        { id: 'upright',  label: 'upright',         kind: 'constraint', icon: 'up',    x: 1280, y: 285 },
        { id: 'lab',      label: 'lab',             kind: 'location',  icon: 'map',    x: 1565, y: 395 },
        { id: 'floor-1',  label: 'floor 1',         kind: 'location',  icon: 'layers', x: 1440, y: 262 },
        { id: 'robot-r2', label: 'robot R2',        kind: 'agent',     icon: 'bot',    x: 1520, y: 745 },
        { id: 'lidar',    label: 'LiDAR',           kind: 'sensor',    icon: 'radar',  x: 1375, y: 800 },
        { id: 'technician', label: 'technician',    kind: 'agent',     icon: 'user',   x: 1690, y: 650 },
        { id: 'corridor', label: 'corridor',        kind: 'location',  icon: 'route',  x: 1660, y: 850 },
        { id: 'detector', label: 'object detector', kind: 'software',  icon: 'chip',   x: 715,  y: 835 },
        { id: 'semantic-map', label: 'semantic map', kind: 'software', icon: 'map',    x: 905,  y: 865 },
        { id: 'deadline', label: 'deadline 18:00',  kind: 'constraint', icon: 'clock', x: 462,  y: 520 },
      ],
      hyperedges: [
        { id: 'e1', core: true, family: 'manipulation', sentence: 'Robot R1 put the cup on shelf B',
          members: [{ node: 'robot-r1', role: 'agent' }, { node: 'cup', role: 'object' }, { node: 'shelf-b', role: 'target' }],
          flow: [{ from: 'robot-r1', to: 'cup', word: 'put', t: 0.3 }, { from: 'cup', to: 'shelf-b', word: 'on' }],
          qualifiers: { manner: 'upright', where: 'room 2' },
          confidence: 0.97, provenance: { by: R1, via: 'action log', evidence: 'Place action completed; gripper released over shelf B.' },
          caption: { x: 868, y: 410, anchor: 'start' }, caption2: { x: 850, y: 410, anchor: 'start' },
          history: [{ c: 0, op: 'propose', by: R1, note: 'Reported after completing the action.' }, { c: 0, op: 'validate', by: OP, note: 'Confirmed by the operator.' }] },
        { id: 'e2', core: true, family: 'observation', sentence: 'Camera sees the cup on table A', contradicts: 'e1',
          members: [{ node: 'camera', role: 'observer' }, { node: 'cup', role: 'object' }, { node: 'table-a', role: 'location' }],
          flow: [{ from: 'camera', to: 'cup', word: 'sees', dist: 15, t: 0.3 }, { from: 'cup', to: 'table-a', word: 'on', dist: 11 }],
          confidence: 0.91, provenance: { by: R1, via: 'camera', evidence: 'Detection “cup” (0.91), projected onto table A.' },
          caption: { x: 1404, y: 706, anchor: 'end' }, caption2: { x: 1000, y: 770, anchor: 'start' },
          history: [{ c: 1, op: 'propose', by: R1, note: 'New observation. It contradicts e1: the cup cannot be in both places.' }] },
        { id: 'e3', core: true, family: 'task', sentence: 'Operator asks robot R1 to tidy the lab',
          members: [{ node: 'operator', role: 'requester' }, { node: 'robot-r1', role: 'agent' }, { node: 'tidy-lab', role: 'task' }],
          flow: [{ from: 'operator', to: 'robot-r1', word: 'asks' }, { from: 'robot-r1', to: 'tidy-lab', word: 'to do', side: 1, dist: 17, t: 0.62 }],
          confidence: 1, provenance: { by: OP, via: 'spoken request', evidence: 'Request confirmed on the operator’s tablet.' },
          caption: { x: 556, y: 350, anchor: 'start' },
          history: said(OP, 'Stated by the operator.') },
        { id: 'e4', core: true, family: 'spatial', sentence: 'Shelf B is in room 2, through door D1',
          members: [{ node: 'shelf-b', role: 'place' }, { node: 'room-2', role: 'room' }, { node: 'door-d1', role: 'access' }],
          flow: [{ from: 'shelf-b', to: 'room-2', word: 'in' }, { from: 'shelf-b', to: 'door-d1', word: 'through', dist: 27 }],
          confidence: 1, provenance: { by: OP, via: 'site map', evidence: 'Imported from the building map.' },
          caption: { x: 1440, y: 362, anchor: 'end' }, caption2: { x: 1452, y: 526, anchor: 'start' },
          history: said(OP, 'Imported from the site map.') },

        { id: 'e5', family: 'constraint', sentence: 'Fragile objects on shelf B stay upright',
          members: [{ node: 'fragile', role: 'object' }, { node: 'shelf-b', role: 'place' }, { node: 'upright', role: 'constraint' }],
          flow: [{ from: 'fragile', to: 'shelf-b', word: 'on', side: 1 }, { from: 'fragile', to: 'upright', word: 'stay' }],
          confidence: 1, provenance: { by: OP, via: 'handling rules', evidence: 'Lab handling rules, section 2.' },
          caption: { x: 1352, y: 212, anchor: 'end' },
          history: said(OP, 'Stated by the operator.') },
        { id: 'e6', family: 'observation', sentence: 'Robot R2’s LiDAR sees door D1 open',
          members: [{ node: 'robot-r2', role: 'agent' }, { node: 'lidar', role: 'observer' }, { node: 'door-d1', role: 'object' }],
          flow: [{ from: 'robot-r2', to: 'lidar', word: 'scans with', side: 1, dist: 13 }, { from: 'lidar', to: 'door-d1', word: 'sees open', side: 1, dist: 30 }],
          confidence: 0.72, provenance: { by: R2, via: 'LiDAR', evidence: 'Doorway free in 3 consecutive scans (0.72).' },
          caption: { x: 1290, y: 882, anchor: 'start' },
          history: [{ c: 1, op: 'propose', by: R2, note: 'Seen while patrolling.' }] },
        { id: 'e7', family: 'task', sentence: 'Technician asks robot R2 to patrol the corridor',
          members: [{ node: 'technician', role: 'requester' }, { node: 'robot-r2', role: 'agent' }, { node: 'corridor', role: 'place' }],
          flow: [{ from: 'technician', to: 'robot-r2', word: 'asks' }, { from: 'robot-r2', to: 'corridor', word: 'to patrol', side: 1, dist: 14 }],
          confidence: 1, provenance: { by: 'technician', via: 'task console', evidence: 'Recurring task, every 30 minutes.' },
          caption: { x: 1772, y: 944, anchor: 'end' },
          history: said('technician', 'Stated by the technician.') },
        { id: 'e8', family: 'spatial', sentence: 'Room 2 is part of the lab, on floor 1',
          members: [{ node: 'room-2', role: 'room' }, { node: 'lab', role: 'area' }, { node: 'floor-1', role: 'floor' }],
          flow: [{ from: 'room-2', to: 'lab', word: 'part of', side: 1 }, { from: 'lab', to: 'floor-1', word: 'on', side: 1 }],
          confidence: 1, provenance: { by: OP, via: 'site map', evidence: 'Imported from the building map.' },
          caption: { x: 1400, y: 190, anchor: 'start' },
          history: said(OP, 'Imported from the site map.') },
        { id: 'e9', family: 'perception', sentence: 'Object detector turns camera frames into map updates',
          members: [{ node: 'camera', role: 'source' }, { node: 'detector', role: 'component' }, { node: 'semantic-map', role: 'target' }],
          flow: [{ from: 'camera', to: 'detector', word: 'feeds' }, { from: 'detector', to: 'semantic-map', word: 'updates', side: 1, dist: 12 }],
          confidence: 1, provenance: { by: R1, via: 'system configuration', evidence: 'Perception pipeline, as deployed.' },
          caption: { x: 640, y: 940, anchor: 'start' },
          history: [{ c: 0, op: 'propose', by: R1, note: 'Reported at start-up.' }, { c: 0, op: 'validate', by: OP, note: 'Confirmed by the operator.' }] },
        { id: 'e10', family: 'task', sentence: 'Operator sets 18:00 as the deadline to tidy the lab',
          members: [{ node: 'operator', role: 'requester' }, { node: 'tidy-lab', role: 'task' }, { node: 'deadline', role: 'constraint' }],
          flow: [{ from: 'operator', to: 'deadline', word: 'sets' }, { from: 'tidy-lab', to: 'deadline', word: 'due by', side: 1, dist: 12 }],
          confidence: 1, provenance: { by: OP, via: 'spoken request', evidence: 'Given with the task.' },
          caption: { x: 392, y: 680, anchor: 'start' },
          history: said(OP, 'Stated by the operator.') },
      ],
      commits: [
        { id: 0, t: '09:00', label: 'e1 validated: cup on shelf B', by: OP },
        { id: 1, t: '10:12', label: 'camera sees cup on table A: conflicts with e1', by: R1 },
      ],
    };
  }

  window.HI_DATA = { FAMILIES, KINDS, ICONS, build,
    POSTER_BOX: { x: 539, y: 304, w: 944, h: 440 },          // the poster's canvas
    slug: (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
})();
