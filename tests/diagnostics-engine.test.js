const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../diagnostics/engine.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/diagnostics-v1.json'), 'utf8'));

function assessment(id) {
  return data.assessments.find((item) => item.assessment_id === id);
}

function answersFor(item, optionId) {
  return Object.fromEntries(item.questions.map((question) => [question.question_id, optionId]));
}

for (const id of ['workplan_basic', 'budget_basic']) {
  const item = assessment(id);
  const high = engine.scoreAssessment(data, item, answersFor(item, 'yes'));
  assert.equal(high.valid, true);
  assert.equal(high.score, 100);
  assert.equal(high.band.label_he, 'חזק');

  const low = engine.scoreAssessment(data, item, answersFor(item, 'no'));
  assert.equal(low.score, 0);
  assert.equal(low.band.label_he, 'דורש תשומת לב');
  assert.ok(low.actions.length >= 2);

  const insufficient = engine.scoreAssessment(data, item, Object.fromEntries(item.questions.slice(0, 3).map((q) => [q.question_id, 'yes'])));
  assert.equal(insufficient.valid, false);
}

// מקרי גבול נוספים על נתוני אמת
(function () {
  var item = assessment('workplan_basic');
  var mixed = Object.fromEntries(item.questions.map((q, i) => [q.question_id, i % 2 === 0 ? 'yes' : 'no']));
  var result = engine.scoreAssessment(data, item, mixed);
  assert.equal(result.valid, true);
  assert.ok(result.score > 0 && result.score < 100);

  // קטגוריה שלא קיבלה אף תשובה (כל 3 השאלות הלא-נענות מאותה קטגוריה) — עדיין עומד במינימום 7/10
  var noCat3 = {};
  item.questions.forEach(function (q) {
    if (q.category_id === 'cat_workplan_basic_3') return;
    noCat3[q.question_id] = 'yes';
  });
  var partial = engine.scoreAssessment(data, item, noCat3);
  assert.equal(partial.valid, true);
  var unratedCategory = partial.categories.find((c) => c.category_id === 'cat_workplan_basic_3');
  assert.equal(unratedCategory.score, null);
  assert.equal(unratedCategory.band, null);
  assert.equal(unratedCategory.insight, null);
  // קטגוריה ללא נתונים לא אמורה לתרום פעולות
  assert.ok(!partial.actions.some((a) => a.category_id === 'cat_workplan_basic_3'));
})();

// מזהה מסלול לא חוקי
(function () {
  assert.equal(assessment('no_such_id'), undefined);
})();

// שאלה הפוכה (direction=reverse) על נתוני סינתטיים
(function () {
  var synthetic = {
    minimum_answered_questions: 1,
    default_response_set_id: 'std_no_sometimes_yes',
    categories: [{ category_id: 'c1', weight: 1 }],
    questions: [{ question_id: 'q1', category_id: 'c1', weight: 1, direction: 'reverse', response_set_id: 'std_no_sometimes_yes' }],
    result_bands: data.assessments[0].result_bands,
    insights: [],
    actions: []
  };
  var reversedHigh = engine.scoreAssessment(data, synthetic, { q1: 'no' });
  assert.equal(reversedHigh.score, 100); // "לא" הופך ל-100 בשאלה הפוכה
  var reversedLow = engine.scoreAssessment(data, synthetic, { q1: 'yes' });
  assert.equal(reversedLow.score, 0);
})();

// גבולות דיוק בין הבנדים (39/40 ו-69/70) — נבדק ישירות מול הגדרות ה-bands בנתונים
(function () {
  var bands = assessment('workplan_basic').result_bands;
  var low = bands.find((b) => b.label_he === 'דורש תשומת לב');
  var mid = bands.find((b) => b.label_he === 'מתבסס');
  var high = bands.find((b) => b.label_he === 'חזק');
  assert.equal(low.max_score_inclusive, 39);
  assert.equal(mid.min_score_inclusive, 40);
  assert.equal(mid.max_score_inclusive, 69);
  assert.equal(high.min_score_inclusive, 70);
})();

console.log('Diagnostics engine tests passed');
