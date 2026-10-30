// Public metadata from the authenticated API; no answer keys are bundled.
export let topics = [],
  questions = [],
  questionById = {},
  topicById = {};
export const levelNames = { 1: "Cơ bản", 2: "Trung bình", 3: "Nâng cao" };
export function hydrateCatalog(catalog, draft) {
  topics = catalog.topics;
  questions = catalog.questions;
  topicById = Object.fromEntries(topics.map((t) => [t.id, t]));
  questionById = Object.fromEntries(
    (draft?.questions || []).map((q) => [q.id, q]),
  );
}
