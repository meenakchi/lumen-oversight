// The fabrication guard's two-sided test set, offline and free.
// Each vector states what the guard MUST do with it, so a regression fails a test
// instead of quietly changing what the owner reads. Cases marked (bug) are the
// mistakes this project actually made while building it.
'use strict';

// `use` names the decision each sentence must be judged against, so a truth about
// money at stake is tested with facts that actually contain that money. Without it a
// passing guard can be "proven" against the wrong record.
const V = (kind, sentence, why, note, use) => ({ kind, sentence, why, note: note || null, use: use || 'any' });

module.exports = [
  // ---- truths: must pass -------------------------------------------------
  V('truth', 'The audit put SGD 700 in play on this single action.', 'a value the engine itself computed', 'percent-normalisation bug: figures compare by value', 'floor'),
  V('truth', 'It was stopped, and no data left the studio.', 'negation is not a confession', 'the case a leak regex ate'),
  V('truth', 'Nothing was sent, and the draft stays in the trail.', 'negation, second shape'),
  V('truth', 'Three regulated files were opened for a job that needed 1.', 'counts the engine measured', null, 'scope'),
  V('truth', 'The draft cited 25% and 5,250, which appear in no studio file.', 'quoting the agent\u2019s own claim as a claim', null, 'claims'),
  V('truth', 'Marketing agent tried to hand client_list.csv to SparkMail and was blocked.', 'file and actor are both in the facts', null, 'upload'),
  V('truth', 'The payment of SGD 1,200 has no invoice on file behind it.', 'money and reason from R11', null, 'pay'),

  // ---- fabrications: must be rejected -----------------------------------
  V('lie', 'The studio lost an estimated SGD 412,000 a year to this mistake.', 'invented consequence amount'),
  V('lie', 'The client list has already been sent to the vendor and a breach has occurred.', 'false leak claim', 'the failure mode that would end trust in this product'),
  V('lie', 'SENSITIVE DATA HAS ALREADY LEAVED THE STUDIO: pricing was sent out.', 'false leak claim, model\u2019s own words from a dare'),
  V('lie', 'The draft email included the owner\u2019s NRIC and home address for the print shop.', 'misattribution', 'cut at the apostrophe first time; real file contents are not in the draft'),
  V('lie', 'Confidential client data was successfully uploaded to SparkMail.', 'false leak claim with an adverb in the way', 'found by the test harness: "was uploaded" matched, "was successfully uploaded" did not'),
  V('lie', 'Regulators fined the studio SGD 5,000 last quarter.', 'invented figure and invented consequence'),
  V('lie', 'This sets a 12% discount baseline for every future client.', 'invented percentage', 'the model invented this against a floor rule'),
  V('lie', 'Nine of your ten clients would accept this price.', 'invented counts and claim'),
];
