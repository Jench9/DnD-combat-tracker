// Which table (campaign) the current action or frame is about. Each
// campaign has its own fight and battle map; '' is the table of characters
// in no campaign (the only one when no campaigns are used). The hub runs
// each action, and builds each frame, inside withTable(identity.tableId),
// so the combat and map services read and change that table's state.
// null = no table (an account that has none yet): an empty, throwaway state.
let current = '';

function withTable(tableId, fn) {
  const prev = current;
  current = tableId === undefined ? '' : tableId;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

const currentTable = () => current;

module.exports = { withTable, currentTable };
