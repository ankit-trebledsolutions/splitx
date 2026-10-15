// Activities as PATCH /itinerary-days/:dayId sends them back, matched against
// the day's current ones. Pure, so it can be tested without a database.
//
// An activity keeps its _id only when that id really is one of this day's (and
// is sent once); anything else gets a fresh id, so a client can never plant an
// id of its choosing. A kept activity also keeps its `done` mark unless the
// payload sets one: the day editor saves every row without it, and a save
// there must not quietly untick what the group ticked off on the roadmap.
const reconcileActivities = (current = [], incoming = []) => {
  const kept = new Set();
  return incoming.map(({ _id, ...activity }) => {
    const id = _id ? String(_id).toLowerCase() : null;
    const existing =
      id && !kept.has(id) ? current.find((a) => String(a._id).toLowerCase() === id) : null;
    if (!existing) return activity;
    kept.add(id);
    return { _id: id, done: existing.done ?? null, ...activity };
  });
};

module.exports = { reconcileActivities };
