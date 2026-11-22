// Who may see and run what across campaigns (accounts mode). Every
// campaign is a table — its own fight and battle map — plus '' for
// characters in no campaign. In open mode (no login) everything is allowed,
// as before.
//
//   admin   DM of every table, sees everything
//   dm      may create campaigns
//   player  plays its characters
// Being DM is per campaign: any account in a campaign's dmIds runs that
// table (a "player" account too), and plays its characters at the others.
//
// An account sits at the tables it DMs, plus the ones it plays at: the
// campaigns of its characters (''  for a character in none) and those it
// was invited to (account.campaignIds). A player with nothing yet sits at ''.
// A character is seen by the accounts at one of its tables (and its owner);
// it's run (DM rights) by the DMs of one of its tables.
const { AUTH_MODE } = require('../config');

// Lazy: these modules load identity.js, which loads this one.
const campaigns = () => require('../features/campaigns/service');
const characters = () => require('../features/characters/service');
const accounts = () => require('../features/accounts/service');

const open = () => AUTH_MODE === 'open';
const campaignIdsOf = () => new Set(campaigns().all().map((c) => c.id));

// The tables a character is at: its (existing) campaigns, or ''.
function tablesOfCharacter(ch) {
  if (!ch) return [];
  const known = campaignIdsOf();
  const ids = (Array.isArray(ch.campaignIds) ? ch.campaignIds : []).filter((id) => known.has(id));
  return ids.length ? ids : [''];
}

const isAdmin = (account) => !!account && account.role === 'admin';
const mayCreateCampaigns = (account) => open() || (!!account && (account.role === 'admin' || account.role === 'dm'));

// Tables this account is DM of.
function dmTables(account) {
  if (!account) return [];
  if (isAdmin(account)) return ['', ...campaigns().all().map((c) => c.id)];
  return campaigns().all().filter((c) => c.dmIds.includes(account.id)).map((c) => c.id);
}

// Tables it plays at (as a player).
function playTables(account) {
  if (!account) return [];
  const known = campaignIdsOf();
  const out = new Set((account.campaignIds || []).filter((id) => known.has(id)));
  (account.characterIds || []).forEach((id) => tablesOfCharacter(characters().find(id)).forEach((t) => out.add(t)));
  return [...out];
}

// Every table, as [{ id, name, dm }]: the active campaign first, then the
// others in their order, '' ("No campaign") last.
function tablesFor(account) {
  const dm = new Set(dmTables(account));
  const play = new Set(playTables(account));
  if (!dm.size && !play.size && account && account.role === 'player') play.add(''); // a new player starts there
  // An account that runs a campaign and has characters in none plays them at ''.
  const list = campaigns().all();
  const ordered = [...list.filter((c) => c.active), ...list.filter((c) => !c.active)];
  const out = ordered.filter((c) => dm.has(c.id) || play.has(c.id)).map((c) => ({ id: c.id, name: c.name, dm: dm.has(c.id) }));
  if (dm.has('') || play.has('')) out.push({ id: '', name: 'No campaign', dm: dm.has('') });
  return out;
}

function canSeeCharacter(account, ch) {
  if (open() || isAdmin(account)) return true;
  if (!account || !ch) return false;
  if ((account.characterIds || []).includes(ch.id)) return true;
  const mine = new Set(tablesFor(account).map((t) => t.id));
  return tablesOfCharacter(ch).some((t) => mine.has(t));
}

function canDmCharacter(account, ch) {
  if (open() || isAdmin(account)) return true;
  if (!account || !ch) return false;
  const dm = new Set(dmTables(account));
  return tablesOfCharacter(ch).some((t) => dm.has(t));
}

const canSeeCampaign = (account, campaign) => open() || isAdmin(account) || tablesFor(account).some((t) => t.id === campaign.id);
const canDmCampaign = (account, campaignId) => open() || dmTables(account).includes(campaignId);

const accountOf = (identity) => (identity && identity.accountId ? accounts().find(identity.accountId) : null);

// The campaign a new character goes into. The DM's choice if it's one of
// their tables; a player's new character joins the table they are at
// (so its DM sees it). '' = none.
function campaignForNewCharacter(identity, requested) {
  if (open()) return typeof requested === 'string' ? requested : '';
  const account = accountOf(identity);
  if (!account) return '';
  const want = typeof requested === 'string' ? requested : '';
  const allowed = new Set(tablesFor(account).map((t) => t.id));
  if (want && allowed.has(want)) return want;
  return identity.tableId && allowed.has(identity.tableId) ? identity.tableId : '';
}

// A sheet edit's campaign list, limited to what the editor may change: the
// admin anything; a DM adds or removes only the campaigns it runs (the
// others stay as they are); a player can't move characters between tables.
function allowedCampaignIds(identity, ch, wanted) {
  if (open()) return wanted;
  const account = accountOf(identity);
  const current = Array.isArray(ch.campaignIds) ? ch.campaignIds : [];
  if (isAdmin(account)) return wanted;
  if (!account || identity.role !== 'dm') return current;
  const mine = new Set(dmTables(account));
  const want = Array.isArray(wanted) ? wanted : [];
  return [...current.filter((id) => !mine.has(id)), ...want.filter((id) => mine.has(id))];
}

module.exports = {
  isAdmin, mayCreateCampaigns, dmTables, playTables, tablesFor, tablesOfCharacter,
  canSeeCharacter, canDmCharacter, canSeeCampaign, canDmCampaign, accountOf, campaignForNewCharacter, allowedCampaignIds,
};
