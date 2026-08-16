(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HatazpitDiagnosticsEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function getResponseSet(data, question, assessment) {
    return data.response_sets[question.response_set_id || assessment.default_response_set_id];
  }

  function normalizeAnswer(data, assessment, question, optionId) {
    var set = getResponseSet(data, question, assessment);
    if (!set) throw new Error('Missing response set: ' + question.response_set_id);
    var option = set.options.find(function (item) { return item.option_id === optionId; });
    if (!option) throw new Error('Missing option: ' + optionId);
    if (option.excluded_from_denominator) return null;
    var score = Number(option.normalized_score);
    return question.direction === 'reverse' ? 100 - score : score;
  }

  function scoreAssessment(data, assessment, answers) {
    var answeredCount = Object.keys(answers).filter(function (id) { return answers[id] != null; }).length;
    if (answeredCount < assessment.minimum_answered_questions) {
      return { valid: false, answeredCount: answeredCount, required: assessment.minimum_answered_questions };
    }

    var categories = assessment.categories
      .slice()
      .sort(function (a, b) { return a.sort_order - b.sort_order; })
      .map(function (category) {
        var weighted = 0;
        var denominator = 0;
        assessment.questions
          .filter(function (question) { return question.category_id === category.category_id; })
          .forEach(function (question) {
            if (answers[question.question_id] == null) return;
            var value = normalizeAnswer(data, assessment, question, answers[question.question_id]);
            if (value == null) return;
            var weight = Number(question.weight || 1);
            weighted += value * weight;
            denominator += weight;
          });
        return Object.assign({}, category, { score: denominator ? round(weighted / denominator) : null });
      });

    var total = 0;
    var totalWeight = 0;
    categories.forEach(function (category) {
      if (category.score == null) return;
      var weight = Number(category.weight || 1);
      total += category.score * weight;
      totalWeight += weight;
    });
    var score = totalWeight ? round(total / totalWeight) : null;
    var bandScore = Math.round(score);
    var band = assessment.result_bands.find(function (item) {
      return bandScore >= item.min_score_inclusive && bandScore <= item.max_score_inclusive;
    });
    if (!band) throw new Error('No result band for score ' + score);

    var categoryResults = categories.map(function (category) {
      if (category.score == null) {
        return Object.assign({}, category, { band: null, insight: null });
      }
      var categoryBand = assessment.result_bands.find(function (item) {
        var categoryScore = Math.round(category.score);
        return categoryScore >= item.min_score_inclusive && categoryScore <= item.max_score_inclusive;
      });
      var insight = assessment.insights.find(function (item) {
        return item.category_id === category.category_id && item.band_id === categoryBand.band_id;
      });
      return Object.assign({}, category, { band: categoryBand, insight: insight || null });
    });

    var actions = [];
    categoryResults
      .filter(function (category) { return category.score != null; })
      .slice()
      .sort(function (a, b) { return a.score - b.score; })
      .forEach(function (category) {
        assessment.actions
          .filter(function (action) {
            return action.category_id === category.category_id &&
              category.score >= action.trigger_min_score && category.score <= action.trigger_max_score;
          })
          .sort(function (a, b) { return a.priority - b.priority; })
          .forEach(function (action) { actions.push(action); });
      });

    return {
      valid: true,
      answeredCount: answeredCount,
      score: score,
      band: band,
      categories: categoryResults,
      actions: actions.slice(0, 5)
    };
  }

  return {
    normalizeAnswer: normalizeAnswer,
    scoreAssessment: scoreAssessment
  };
});
