// Campaign helpers shared by the "Who are you?" screen, the Characters page
// and the Allies list. A character may be in several campaigns
// (`campaignIds`); older data only has `campaignId`.
export const campaignsOf = (ch) => (Array.isArray(ch.campaignIds) ? ch.campaignIds : ch.campaignId ? [ch.campaignId] : []);
export const inCampaign = (ch, id) => campaignsOf(ch).includes(id);

// [{ id, name, active, characters }]: the active campaign first, the others
// in their order, then the characters in none of the existing campaigns
// (id ''; `noneFirst` puts that group first instead). A character in two
// campaigns is listed in both. Empty groups are skipped.
export function groupByCampaign(characters, campaigns, { noneLabel = 'No campaign', noneFirst = false } = {}) {
  const known = new Set(campaigns.map((c) => c.id));
  const ordered = [...campaigns.filter((c) => c.active), ...campaigns.filter((c) => !c.active)];
  const groups = ordered.map((c) => ({
    id: c.id, name: c.name, active: !!c.active, characters: characters.filter((ch) => inCampaign(ch, c.id)),
  }));
  const none = { id: '', name: noneLabel, active: false, characters: characters.filter((ch) => !campaignsOf(ch).some((id) => known.has(id))) };
  return (noneFirst ? [none, ...groups] : [...groups, none]).filter((g) => g.characters.length);
}
