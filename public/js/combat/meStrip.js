// Phones, players: a strip fixed above the bottom bar with whose turn it is
// and your own character's HP, so you don't scroll the initiative list to
// find them. Tap the turn line to jump to your row (conditions, actions…).
// CSS shows it at ≤ 600 px only (combat.css .me-strip).
//
// `mine`: your combatant (or undefined); `mayAdvance`: you may end the turn.

function hpButton(label, delta, title, send, id) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'me-hp-btn';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', () => send('adjustHP', { id, delta }));
  return b;
}

// "Your turn!" / "Goblin's turn · you're next" / "… · 3 turns until you".
function turnText(state, myIdx) {
  const n = state.combatants.length;
  const active = state.combatants[state.activeIndex];
  if (state.activeIndex === myIdx) return { text: 'Your turn!', mine: true };
  if (!active) return { text: 'Waiting for the next turn', mine: false };
  const gap = (myIdx - state.activeIndex + n) % n;
  return { text: `${active.name}'s turn · ` + (gap === 1 ? "you're next" : `${gap} turns until you`), mine: false };
}

export function renderMeStrip(state, { mine, send, mayAdvance }) {
  let strip = document.getElementById('meStrip');
  if (!mine) {
    strip?.remove();
    document.body.classList.remove('has-me-strip');
    return;
  }
  if (!strip) {
    strip = document.createElement('section');
    strip.id = 'meStrip';
    strip.className = 'me-strip';
    strip.setAttribute('aria-label', 'Your turn and hit points');
    document.body.appendChild(strip);
  }
  document.body.classList.add('has-me-strip');
  strip.innerHTML = '';
  const myIdx = state.combatants.indexOf(mine);
  const turn = turnText(state, myIdx);
  strip.classList.toggle('my-turn', turn.mine);

  const top = document.createElement('div');
  top.className = 'me-turn';
  // Tap the line to jump to your row (conditions, actions…).
  const txt = document.createElement('button');
  txt.type = 'button';
  txt.className = 'me-turn-text';
  txt.title = 'Show your row';
  txt.textContent = (turn.mine ? '▶ ' : '') + turn.text + ` · round ${state.round}`;
  txt.addEventListener('click', () => {
    document.querySelector(`#list .row[data-id="${CSS.escape(mine.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  top.appendChild(txt);
  if (turn.mine && mayAdvance) {
    const end = document.createElement('button');
    end.type = 'button';
    end.className = 'btn small me-end';
    end.textContent = 'End turn →';
    end.addEventListener('click', () => send('nextTurn'));
    top.appendChild(end);
  }

  const hp = document.createElement('div');
  hp.className = 'me-hp';
  const val = document.createElement('span');
  const pct = mine.maxHp ? Math.max(0, Math.min(100, (mine.hp / mine.maxHp) * 100)) : 100;
  val.className = 'me-hp-val' + (mine.hp <= 0 ? ' down' : pct <= 25 ? ' low' : pct <= 55 ? ' mid' : '');
  val.textContent = `${Math.max(mine.hp, 0)}/${mine.maxHp}` + (mine.tempHp > 0 ? ` +${mine.tempHp}` : '');
  val.title = mine.tempHp > 0 ? 'Hit points / max + temporary' : 'Hit points / max';
  val.setAttribute('aria-label', `${mine.name}: ${val.textContent} hit points`);
  hp.append(
    hpButton('−5', -5, '5 damage', send, mine.id),
    hpButton('−1', -1, '1 damage', send, mine.id),
    val,
    hpButton('+1', 1, 'Heal 1', send, mine.id),
    hpButton('+5', 5, 'Heal 5', send, mine.id),
  );
  strip.append(top, hp);
}
