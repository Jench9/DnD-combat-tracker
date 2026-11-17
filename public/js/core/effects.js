// Icons for conditions, concentration and spell effects, shared by the
// combat tracker, the battle map and the TV view.
export const CONCENTRATION_ICON = '🔮';

export const CONDITION_ICONS = {
  Blinded: '🙈', Charmed: '💕', Deafened: '🔇', Frightened: '😱', Grappled: '✊',
  Incapacitated: '💫', Invisible: '👻', Paralyzed: '🧊', Petrified: '🗿', Poisoned: '🤢',
  Prone: '🛌', Restrained: '⛓️', Stunned: '😵', Unconscious: '💤',
};
export const conditionIcon = (name) => CONDITION_ICONS[name] || '❗';

// Spell effects by name (an edition suffix like "(2014)" and case ignored); anything else ✨.
const SPELL_ICONS = {
  bless: '🙏', bane: '👎', hex: '🧿', "hunter's mark": '🎯', haste: '⚡', slow: '🐌',
  'shield of faith': '🛡️', shield: '🛡️', 'mage armor': '🔷', 'hold person': '🧊', 'hold monster': '🧊',
  'faerie fire': '🔆', invisibility: '👻', 'greater invisibility': '👻', fly: '🪽', 'heroism': '🦸',
  'protection from evil and good': '✝️', 'protection from energy': '🔰', 'enlarge/reduce': '↕️',
  'barkskin': '🌳', 'blur': '🌫️', 'mirror image': '🪞', 'sanctuary': '🕊️', 'aid': '➕',
  'longstrider': '👟', 'spider climb': '🕷️', 'water breathing': '🫧', 'darkvision': '🌙',
  'charm person': '💕', 'command': '🗣️', 'suggestion': '🗣️', 'fear': '😱', 'sleep': '💤',
  'entangle': '🌿', 'web': '🕸️', 'blindness/deafness': '🙈', 'polymorph': '🐑', 'banishment': '🌀',
  'compelled duel': '⚔️', 'heat metal': '🔥', 'witch bolt': '⚡', 'stoneskin': '🪨', 'death ward': '💀',
  'freedom of movement': '🕊️', 'resistance': '🔰', 'guidance': '🧭', 'divine favor': '✨',
};
export function effectIcon(name) {
  const key = String(name || '').toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').trim();
  return SPELL_ICONS[key] || '✨';
}

// Everything to show as small badges on a token: Heroic Inspiration and
// exhaustion (from the character sheet, if given), concentration, then
// conditions, then spell effects. [{ icon, label }]
export function badgesFor(c, sheet = null) {
  const out = [];
  if (sheet && sheet.inspiration) out.push({ icon: '⭐', label: 'Heroic Inspiration' });
  if (sheet && sheet.exhaustion > 0) out.push({ icon: '😩', label: `Exhaustion ${sheet.exhaustion}` });
  if (c.concentration) out.push({ icon: CONCENTRATION_ICON, label: 'Concentrating on ' + c.concentration });
  (c.conditions || []).forEach((n) => out.push({ icon: conditionIcon(n), label: n }));
  (c.effects || []).forEach((e) => out.push({ icon: effectIcon(e.name), label: e.name }));
  return out;
}
