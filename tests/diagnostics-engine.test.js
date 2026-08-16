const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../diagnostics/engine.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/diagnostics-v2.json'), 'utf8'));

function answersFor(item, optionId) {
  return Object.fromEntries(item.questions.map((question) => [question.question_id, optionId]));
}

// בוחר את האופציה עם הציון המנורמל הגבוה/נמוך ביותר בסט התשובות בפועל של השאלה
// (תומך בסטים שונים מ-yes/no, למשל recency_check_3), ומתחשב בכיוון reverse
function extremeAnswers(item, wantHighest) {
  return Object.fromEntries(item.questions.map((question) => {
    var set = data.response_sets[question.response_set_id || item.default_response_set_id];
    var reverse = question.direction === 'reverse';
    var takeHighest = reverse ? !wantHighest : wantHighest;
    var sorted = set.options.slice().sort((a, b) => (takeHighest ? b.normalized_score - a.normalized_score : a.normalized_score - b.normalized_score));
    return [question.question_id, sorted[0].option_id];
  }));
}
function bestAnswers(item) { return extremeAnswers(item, true); }
function worstAnswers(item) { return extremeAnswers(item, false); }

// ---------- generic domain-assessment acceptance checks ----------
function testDomainAssessment(assessmentId, expectedQuestionCount) {
  var item = data.assessments[assessmentId];
  assert.equal(item.level, 'domain');
  assert.equal(item.questions.length, expectedQuestionCount);

  var high = engine.scoreAssessment(data, item, bestAnswers(item));
  assert.equal(high.valid, true);
  assert.equal(high.score, 100);
  assert.equal(high.band.label_he, 'חזק');

  var low = engine.scoreAssessment(data, item, worstAnswers(item));
  assert.equal(low.score, 0);
  assert.equal(low.band.label_he, 'דורש תשומת לב');
  assert.ok(low.actions.length >= 2);

  var best = bestAnswers(item);
  var worst = worstAnswers(item);
  var mixed = Object.fromEntries(item.questions.map((q, i) => [q.question_id, i % 2 === 0 ? best[q.question_id] : worst[q.question_id]]));
  var mixedResult = engine.scoreAssessment(data, item, mixed);
  assert.equal(mixedResult.valid, true);
  assert.ok(mixedResult.score > 0 && mixedResult.score < 100);

  var insufficient = engine.scoreAssessment(data, item, Object.fromEntries(item.questions.slice(0, 5).map((q) => [q.question_id, best[q.question_id]])));
  assert.equal(insufficient.valid, false);

  // קטגוריה שלא קיבלה אף תשובה (הקטגוריה האחרונה חסרה כולה), עדיין עומד במינימום
  var lastCat = item.categories.slice().sort((a, b) => b.sort_order - a.sort_order)[0].category_id;
  var partialAnswers = {};
  item.questions.forEach(function (q) {
    if (q.category_id === lastCat) return;
    partialAnswers[q.question_id] = best[q.question_id];
  });
  var partial = engine.scoreAssessment(data, item, partialAnswers);
  assert.equal(partial.valid, true);
  var unrated = partial.categories.find((c) => c.category_id === lastCat);
  assert.equal(unrated.score, null);
  assert.equal(unrated.band, null);
  assert.ok(!partial.actions.some((a) => a.category_id === lastCat));

  // גבולות 39/40 ו-69/70
  var bands = item.result_bands;
  var lowBand = bands.find((b) => b.label_he === 'דורש תשומת לב');
  var midBand = bands.find((b) => b.label_he === 'מתבסס');
  var highBand = bands.find((b) => b.label_he === 'חזק');
  assert.equal(lowBand.max_score_inclusive, 39);
  assert.equal(midBand.min_score_inclusive, 40);
  assert.equal(midBand.max_score_inclusive, 69);
  assert.equal(highBand.min_score_inclusive, 70);

  // כל קטגוריה מקבלת פעולות לכל שלושת הטווחים (0-39/40-69/70-100) — לא רק ל-0-39
  item.categories.forEach(function (cat) {
    var tiers = item.actions.filter((a) => a.category_id === cat.category_id).map((a) => [a.trigger_min_score, a.trigger_max_score]);
    assert.ok(tiers.some(([min, max]) => min === 0 && max === 39), 'missing low-tier action for ' + cat.category_id);
    assert.ok(tiers.some(([min, max]) => min === 40 && max === 69), 'missing mid-tier action for ' + cat.category_id);
    assert.ok(tiers.some(([min, max]) => min === 70 && max === 100), 'missing high-tier action for ' + cat.category_id);
  });

  // כל band מקבל insight בכל קטגוריה
  item.categories.forEach(function (cat) {
    item.result_bands.forEach(function (band) {
      var ins = item.insights.find((i) => i.category_id === cat.category_id && i.band_id === band.band_id);
      assert.ok(ins, 'missing insight for ' + cat.category_id + '/' + band.band_id);
    });
  });
}

testDomainAssessment('operations_domain', 22);
testDomainAssessment('governance_domain', 21);
testDomainAssessment('finance_domain', 24);
testDomainAssessment('cyber_domain', 19);
testDomainAssessment('risk_legal_domain', 18);

// שאלה הפוכה אמיתית (לא סינתטית) ב-finance_domain
(function () {
  var item = data.assessments.finance_domain;
  var reverseQ = item.questions.find((qq) => qq.direction === 'reverse');
  assert.ok(reverseQ, 'expected at least one reverse question in finance_domain');
  var allYesExceptReverseNo = {};
  item.questions.forEach(function (qq) {
    allYesExceptReverseNo[qq.question_id] = qq.question_id === reverseQ.question_id ? 'no' : 'yes';
  });
  var result = engine.scoreAssessment(data, item, allYesExceptReverseNo);
  // "לא" בשאלה הפוכה אמור לתרום 100 (טוב), ולכן הציון הכולל עדיין 100
  assert.equal(result.score, 100);
})();

// ---------- screener routing ----------
(function () {
  var screener = data.assessments.screener;
  assert.equal(screener.level, 'screener');
  assert.equal(screener.questions.length, 12);

  // כל השאלות "כן" חוץ מציר תכנון-עבודה (cat_screener_1) שקיבל "לא" -> ניתוב יחיד לאותו ציר
  var answers = {};
  screener.questions.forEach(function (q) {
    answers[q.question_id] = q.category_id === 'cat_screener_1' ? 'no' : 'yes';
  });
  var routing = engine.computeRouting(data, screener, answers);
  assert.equal(routing.valid, true);
  assert.equal(routing.tie, 'none');
  assert.equal(routing.target_assessment_id, 'operations_domain');

  // אותו דבר עם ציר מתנדבים (cat_screener_4) חלש -> גם מנותב ל-operations_domain (שני צירים, יעד אחד)
  var answers2 = {};
  screener.questions.forEach(function (q) {
    answers2[q.question_id] = q.category_id === 'cat_screener_4' ? 'no' : 'yes';
  });
  var routing2 = engine.computeRouting(data, screener, answers2);
  assert.equal(routing2.tie, 'none');
  assert.equal(routing2.target_assessment_id, 'operations_domain');

  // תיקו חלקי: שני צירים חלשים באותה מידה (governance ו-budget), לא כל הצירים
  var answers3 = {};
  screener.questions.forEach(function (q) {
    answers3[q.question_id] = (q.category_id === 'cat_screener_2' || q.category_id === 'cat_screener_3') ? 'no' : 'yes';
  });
  var routing3 = engine.computeRouting(data, screener, answers3);
  assert.equal(routing3.tie, 'partial');
  assert.equal(routing3.candidates.length, 2);

  // תיקו מלא: כל התשובות זהות (כולן "לפעמים") -> נופל לברירת המחדל operations_domain
  var answersFlat = {};
  screener.questions.forEach(function (q) { answersFlat[q.question_id] = 'sometimes'; });
  var routingFlat = engine.computeRouting(data, screener, answersFlat);
  assert.equal(routingFlat.tie, 'full');
  assert.equal(routingFlat.target_assessment_id, 'operations_domain');

  // מספר תשובות קטן מהמינימום
  var insufficientScreener = engine.computeRouting(data, screener, Object.fromEntries(screener.questions.slice(0, 3).map((q) => [q.question_id, 'yes'])));
  assert.equal(insufficientScreener.valid, false);

  // ציר governance חלש -> מנותב כעת ל-governance_domain (checkpoint שני)
  var answers4 = {};
  screener.questions.forEach(function (q) {
    answers4[q.question_id] = q.category_id === 'cat_screener_2' ? 'no' : 'yes';
  });
  var routing4 = engine.computeRouting(data, screener, answers4);
  assert.equal(routing4.tie, 'none');
  assert.equal(routing4.target_assessment_id, 'governance_domain');

  // ציר תקציב חלש -> מנותב כעת ל-finance_domain (checkpoint שלישי)
  var answers5 = {};
  screener.questions.forEach(function (q) {
    answers5[q.question_id] = q.category_id === 'cat_screener_3' ? 'no' : 'yes';
  });
  var routing5 = engine.computeRouting(data, screener, answers5);
  assert.equal(routing5.tie, 'none');
  assert.equal(routing5.target_assessment_id, 'finance_domain');

  // ציר סיכונים חלש -> מנותב כעת ל-risk_legal_domain (checkpoint חמישי)
  var answers6 = {};
  screener.questions.forEach(function (q) {
    answers6[q.question_id] = q.category_id === 'cat_screener_6' ? 'no' : 'yes';
  });
  var routing6 = engine.computeRouting(data, screener, answers6);
  assert.equal(routing6.tie, 'none');
  assert.equal(routing6.target_assessment_id, 'risk_legal_domain');

  // כל 6 יעדי הניתוב הראשיים מצביעים כעת על אבחוני domain קיימים בפועל
  screener.routing.filter((r) => r.operator === 'argmax').forEach(function (r) {
    var target = data.assessments[r.target_assessment_id];
    assert.ok(target, 'routing target missing: ' + r.target_assessment_id);
    assert.equal(target.level, 'domain');
  });
})();

// מזהה תחום לא חוקי
(function () {
  assert.equal(data.assessments.no_such_domain, undefined);
})();

console.log('Diagnostics engine tests passed');
