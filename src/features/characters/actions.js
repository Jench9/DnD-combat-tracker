// Client -> server character actions.
const { uid } = require('../../core/ids');
const characters = require('./service');
const { syncCombatantsFromSheets } = require('../combat/characterSync');
const rest = require('./rest');
const { linkToCreator } = require('../accounts/links');
const accounts = require('../accounts/service');
const access = require('../../core/access');

// Apply a rest patch and keep the combat tracker in step (HP).
function applyRest(id, makePatch) {
  const ch = characters.find(id);
  if (!ch) return;
  const result = makePatch(ch);
  if (!result) return;
  characters.update(id, result.patch || result);
  syncCombatantsFromSheets();
}

module.exports = {
  // Client generates the id (so it can open the editor immediately
  // without waiting on a round trip) and just asks the server to
  // register it.
  // A player's new character belongs to their account.
  addCharacter(payload, identity) {
    const id = (payload && typeof payload.id === 'string' && payload.id) || uid();
    const campaignId = access.campaignForNewCharacter(identity, payload && payload.campaignId);
    if (characters.addBlank(id, campaignId)) linkToCreator(identity, id);
  },

  // DM only: { id, newId } — the client picks newId so it can open the copy.
  duplicateCharacter(payload) {
    const { id, newId } = payload || {};
    if (typeof newId !== 'string' || !/^[\w-]{1,64}$/.test(newId)) return;
    characters.duplicate(id, newId);
  },

  updateCharacter(payload, identity) {
    const { id } = payload || {};
    let { patch } = payload || {};
    if (!patch || typeof patch !== 'object') return;
    // Which campaigns (tables) it's in: only what this editor may change.
    if (patch.campaignIds !== undefined || patch.campaignId !== undefined) {
      const ch = characters.find(id);
      const wanted = Array.isArray(patch.campaignIds) ? patch.campaignIds : (typeof patch.campaignId === 'string' ? (patch.campaignId ? [patch.campaignId] : []) : undefined);
      const { campaignId, ...rest } = patch;
      patch = ch && wanted ? { ...rest, campaignIds: access.allowedCampaignIds(identity, ch, wanted) } : { ...rest, campaignIds: undefined };
    }
    // Retiring (dead, left the party): the DM's call.
    if (patch.retired !== undefined && identity.role !== 'dm') patch = { ...patch, retired: undefined };
    // A familiar's stat block comes from the library (POST /api/familiars);
    // edits only change its name, creature type and HP, or release it (null).
    if (patch.familiar && typeof patch.familiar === 'object') {
      const { name, creatureType, hp } = patch.familiar;
      const ch = characters.find(id);
      patch = ch && ch.familiar ? { ...patch, familiar: { name, creatureType, hp } } : { ...patch, familiar: undefined };
    }
    characters.update(id, patch);
    syncCombatantsFromSheets(); // AC (armor, Shield, Haste…) and HP
  },

  // Short rest, step 1 (repeatable): spend one Hit Die { id, die: 6|8|10|12,
  // roll? } — roll is the die result the player's screen showed.
  spendHitDie(payload) {
    applyRest(payload.id, (ch) => rest.spendHitDie(ch, parseInt(payload.die, 10), payload.roll));
  },

  // Short rest, step 2: short-rest resources and pact slots come back.
  shortRest(payload) {
    applyRest(payload.id, rest.shortRest);
  },

  longRest(payload) {
    applyRest(payload.id, rest.longRest);
  },

  deleteCharacter(payload) {
    characters.remove(payload && payload.id);
    accounts.unlinkCharacter(payload && payload.id);
  },
};
