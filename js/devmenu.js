import { ZONES } from './world.js';

/* A hidden developer panel: press ~ (backquote) to show / hide it. */
export class DevMenu {
  constructor(game, actions) {
    this.game = game;
    const el = document.createElement('div');
    el.id = 'dev';
    el.className = 'hidden';
    const zoneBtns = ZONES.map((z, i) => `<button data-a="goto" data-v="${i}">${z.name}</button>`).join('');
    el.innerHTML = `
      <h4>DEV MENU <span>~ to close</span></h4>
      <div class="dev-lbl">Skip to</div>
      <div class="dev-row">${zoneBtns}</div>
      <div class="dev-lbl">Spawn into your squad</div>
      <div class="dev-row">
        <button data-a="spawn" data-v="normal:0">+10 chicks</button>
        <button data-a="spawn" data-v="normal:2">+10 adults</button>
        <button data-a="spawn" data-v="beach:2">+10 beach turkeys</button>
      </div>
      <div class="dev-lbl">Cheats</div>
      <div class="dev-row">
        <button data-a="unlockAll">Unlock all gates</button>
        <button data-a="killNearby">Clear nearby foes</button>
        <button data-a="hatch">Hatch nearest mound</button>
        <button data-a="invincible" class="toggle">Invincible: off</button>
      </div>
      <div class="dev-lbl">You</div>
      <div class="dev-row">
        <button data-a="hurtMe">Hurt me (25)</button>
        <button data-a="healMe">Heal me</button>
        <button data-a="wasteMe">Get wasted</button>
      </div>
      <div class="dev-lbl">Saved game</div>
      <div class="dev-row">
        <button data-a="saveNow">Save now</button>
        <button data-a="wipeSave">Delete the save and start again</button>
      </div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const res = actions[b.dataset.a]?.(b.dataset.v);
      if (b.dataset.a === 'invincible') b.textContent = `Invincible: ${res ? 'on' : 'off'}`;
      b.blur();
    });
    document.body.appendChild(el);
    this.el = el;
    addEventListener('keydown', (e) => {
      if (e.code !== 'Backquote' && e.key !== '`' && e.key !== '~') return;
      e.preventDefault();
      el.classList.toggle('hidden');
    });
  }
}
