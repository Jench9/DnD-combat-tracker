// D&D 5e conditions: [name, short rules text].
export const CONDITIONS = [
  ['Blinded', "Can't see; auto-fails sight checks; attacks against you have advantage, yours have disadvantage."],
  ['Charmed', "Can't attack the charmer; charmer has advantage on social checks with you."],
  ['Deafened', "Can't hear; auto-fails hearing checks."],
  ['Frightened', "Disadvantage on checks/attacks while the source is in sight; can't move closer to it."],
  ['Grappled', "Speed becomes 0; ends if the grappler is incapacitated."],
  ['Incapacitated', "Can't take actions or reactions."],
  ['Invisible', "Can't be seen without special sense; attacks against you have disadvantage, yours have advantage."],
  ['Paralyzed', "Incapacitated, can't move/speak; auto-fails STR/DEX saves; hits within 5ft are crits."],
  ['Poisoned', "Disadvantage on attack rolls and ability checks."],
  ['Prone', "Disadvantage on attacks; melee attacks against you have advantage, ranged have disadvantage."],
  ['Restrained', "Speed 0; disadvantage on attacks and DEX saves; attacks against you have advantage."],
  ['Stunned', "Incapacitated, can't move; auto-fails STR/DEX saves; attacks against you have advantage."],
  ['Unconscious', "Incapacitated, prone, unaware; auto-fails STR/DEX saves; nearby hits are crits."],
];

export function conditionDescription(name) {
  const found = CONDITIONS.find((x) => x[0] === name);
  return found ? found[1] : '';
}
