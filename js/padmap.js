/*
 * A controller, drawn: the picture of one on the pause screen (an Xbox pad, with what each button does by it), and
 * the little button pictures that stand in for the keys on screen while you're playing on one (see Input.usePad:
 * the page gets the class `pad`, and the CSS swaps `.kb` things for `.pd` ones).
 */

// the face buttons' letters, in their colours
const FACE = { a: '#6ccf2c', b: '#f0453f', x: '#3b8cf0', y: '#f5c531' };

// the little icons on the View and Menu buttons, and the D-pad (with the arms that are meant lit up)
const ICON = {
  view: '<rect x="3" y="2.5" width="6" height="5" rx="1"/><rect x="5.5" y="4.8" width="6" height="5" rx="1"/>',
  menu: '<path d="M3.5 4h7M3.5 7h7M3.5 10h7"/>',
};
const dpad = (lit) => `<svg viewBox="0 0 14 14" class="dpad">${[['up', 5, 0], ['down', 5, 9], ['left', 0, 5], ['right', 9, 5]].map(([k, x, y]) => `<rect x="${x}" y="${y}" width="4" height="5" rx="1"${lit.includes(k) ? ' class="lit"' : ''}/>`).join('')}<rect x="5" y="5" width="4" height="4"/></svg>`;

/** what goes inside a button's picture (the HTML of a <kbd class="pad">): a letter, a name, or an icon */
function face(name) {
  if (FACE[name]) return name.toUpperCase();
  if (ICON[name]) return `<svg viewBox="0 0 14 14" class="ico">${ICON[name]}</svg>`;
  if (name === 'dpad') return dpad(['left', 'right']);
  if (name === 'dpad-ud') return dpad(['up', 'down']);
  return name.toUpperCase(); // (LB, RT, LS and so on)
}

/** a button's picture, as HTML, for putting in a prompt: shown only while you're playing on a controller */
export function cap(name) { return `<kbd class="pd pad pad-${name}">${face(name)}</kbd>`; }

/** every <kbd data-pad="..."> in `root` gets its picture (the ones written into the page, in index.html) */
export function fillCaps(root = document) {
  for (const el of root.querySelectorAll('kbd[data-pad]')) {
    el.classList.add('pd', 'pad', `pad-${el.dataset.pad}`);
    el.innerHTML = face(el.dataset.pad);
  }
}

/* ---------------------------------------------------------------- the picture on the pause screen */

// how far out the labels go either side of the middle (and above it, for View and Menu), in the picture's units
const OUT = 210, GLYPH = 18, GAP = 34, TOP = -150;

// each button's label: [side, button, words, label's y, where the line starts (x, y)]. Those sharing one line
// (the D-pad's two, the face buttons) have it start from the first of them
const LABELS = [
  [-1, 'lt', 'Whistle (hold)', -122, -114, -106],
  [-1, 'lb', 'Turn the camera', -88, -146, -60],
  [-1, 'ls', 'Walk', -30, -122, -30],
  [-1, 'dpad', 'Pick which kind to throw', 18, -82, 30],
  [-1, 'dpad-ud', 'Zoom in and out', 46],
  [1, 'rt', 'Throw (hold for more)', -122, 114, -106],
  [1, 'rb', 'Turn the camera', -88, 146, -60],
  [1, 'y', 'Scratch up a mound', -60, 138, -30],
  [1, 'x', 'Dive into a mound, pull a lever', -34],
  [1, 'b', 'Dismiss your squad', -8],
  [1, 'a', 'Pluck (hold for the next)', 18],
  [1, 'rs', 'Aim', 54, 80, 34],
];

/** a button's picture inside the SVG, centred on x, y */
function glyph(name, x, y) {
  if (FACE[name]) return `<g class="g-face"><circle cx="${x}" cy="${y}" r="11"/><text x="${x}" y="${y + 4.5}" fill="${FACE[name]}">${name.toUpperCase()}</text></g>`;
  if (name === 'ls' || name === 'rs') return `<g class="g-stick"><circle cx="${x}" cy="${y}" r="11"/><text x="${x}" y="${y + 3.5}">${name.toUpperCase()}</text></g>`;
  if (name.startsWith('dpad')) return `<g transform="translate(${x - 10} ${y - 10}) scale(${20 / 14})" class="g-dpad">${dpad(name === 'dpad' ? ['left', 'right'] : ['up', 'down']).replace(/<\/?svg[^>]*>/g, '')}</g>`;
  if (ICON[name]) return `<g class="g-small"><circle cx="${x}" cy="${y}" r="11"/><g transform="translate(${x - 7} ${y - 7})" class="ico">${ICON[name]}</g></g>`;
  return `<g class="g-pill"><rect x="${x - 15}" y="${y - 9.5}" width="30" height="19" rx="7"/><text x="${x}" y="${y + 4}">${name.toUpperCase()}</text></g>`;
}

/** a thumbstick (its well, and the cap in it) */
const thumb = (x, y) => `<circle cx="${x}" cy="${y}" r="26" class="well"/><circle cx="${x}" cy="${y}" r="19" class="stick"/><circle cx="${x}" cy="${y}" r="12" class="stick-top"/>`;

/** the whole picture, as SVG markup: the controller, front on, with every button labelled */
export function diagram() {
  const parts = [];
  // the triggers, and the bumpers in front of them (behind the body, which hides their bottoms)
  for (const s of [-1, 1]) {
    parts.push(`<rect x="-26" y="-15" width="52" height="30" rx="11" class="trigger" transform="translate(${s * 112} -102) rotate(${s * 14})"/>`);
    parts.push(`<path d="M${s * 154},-40 C${s * 142},-68 ${s * 120},-82 ${s * 62},-91" class="bumper"/>`);
  }
  // the body: across the top, down round each grip, and back up between them
  parts.push('<path class="body" d="M-95,-80 C-40,-90 40,-90 95,-80 C125,-75 142,-62 152,-37 C167,0 184,60 188,96 C192,126 176,146 150,141 C128,137 114,116 100,92 C88,72 70,60 45,60 L-45,60 C-70,60 -88,72 -100,92 C-114,116 -128,137 -150,141 C-176,146 -192,126 -188,96 C-184,60 -167,0 -152,-37 C-142,-62 -125,-75 -95,-80 Z"/>');
  // the sticks, the D-pad, the face buttons, and the little ones up the middle
  parts.push(thumb(-100, -30), thumb(55, 30));
  parts.push('<circle cx="-55" cy="30" r="27" class="well"/><g class="dpad-big"><rect x="-62" y="9" width="14" height="42" rx="3"/><rect x="-76" y="23" width="42" height="14" rx="3"/></g>');
  for (const [k, dx, dy] of [['y', 0, -22], ['x', -22, 0], ['b', 22, 0], ['a', 0, 22]]) {
    parts.push(`<g class="face"><circle cx="${100 + dx}" cy="${-30 + dy}" r="11.5"/><text x="${100 + dx}" y="${-30 + dy + 4.5}" fill="${FACE[k]}">${k.toUpperCase()}</text></g>`);
  }
  parts.push('<circle cx="100" cy="-30" r="38" class="group"/>'); // (the face buttons' line comes off a ring round the lot)
  parts.push('<circle cx="0" cy="-58" r="14" class="guide"/><circle cx="0" cy="-58" r="9" class="guide-in"/>');
  parts.push('<rect x="-7" y="-28" width="14" height="7" rx="3.5" class="small"/>'); // (the share button)
  for (const [k, x] of [['view', -34], ['menu', 34]]) parts.push(`<circle cx="${x}" cy="-30" r="8" class="small"/><g transform="translate(${x - 5.6} -35.6) scale(0.8)" class="ico">${ICON[k]}</g>`);

  // the lines out to the labels, and the labels
  const lines = [], words = [];
  let last = 0;
  for (const [s, k, text, y, sx, sy] of LABELS) {
    const x = s * OUT, end = x - s * 8;
    // (a line from the button; or, for the next of those sharing one, on down from the last)
    if (sx !== undefined) lines.push(`<circle cx="${sx}" cy="${sy}" r="2.5" class="dot"/><path d="M${sx},${sy} L${end},${y}"/>`);
    else lines.push(`<path d="M${end},${last} L${end},${y}"/>`);
    lines.push(`<path d="M${end},${y} L${x + s * 5},${y}"/>`);
    last = y;
    words.push(glyph(k, x + s * GLYPH, y));
    words.push(`<text x="${x + s * GAP}" y="${y + 5}" text-anchor="${s < 0 ? 'end' : 'start'}">${text}</text>`);
  }
  // (and View and Menu, straight up from the middle)
  for (const [s, k, text] of [[-1, 'view', 'Show the controls'], [1, 'menu', 'Pause']]) {
    const x = s * 34;
    lines.push(`<circle cx="${x}" cy="-30" r="2.5" class="dot"/><path d="M${x},-38 L${x},${TOP + 12}"/>`);
    words.push(glyph(k, x, TOP));
    words.push(`<text x="${x + s * 18}" y="${TOP + 5}" text-anchor="${s < 0 ? 'end' : 'start'}">${text}</text>`);
  }
  return `<svg class="pad-diagram" viewBox="-432 -168 905 318" role="img" aria-label="Controller layout">${parts.join('')}<g class="lines">${lines.join('')}</g><g class="words">${words.join('')}</g></svg>`;
}
