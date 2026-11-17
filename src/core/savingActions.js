// Wraps a feature's actions so `save()` runs after each one (for features
// whose state lives in a module and is saved with a jsonStore).
function savingActions(actions, save) {
  return Object.fromEntries(Object.entries(actions).map(([type, fn]) => [type, (payload, identity) => {
    const result = fn(payload, identity);
    save();
    return result;
  }]));
}

module.exports = { savingActions };
