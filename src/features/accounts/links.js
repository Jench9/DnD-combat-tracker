// A character made from a player view (the "+ New character" of a table,
// a player's guided creation) joins the creator's account, so they play it
// — a DM or the admin too, playing at someone's table or their own. Made
// from the DM view (NPCs, pregens, imports): not linked; the DM gives it to
// a player on the Players page.
const accounts = require('./service');

function linkToCreator(identity, characterId) {
  if (!identity || !identity.accountId || identity.role === 'dm') return; // open mode / the DM view
  if (accounts.find(identity.accountId)) accounts.linkCharacter(identity.accountId, characterId);
}

module.exports = { linkToCreator };
