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

  function computeRouting(data, screener, answers) {
    var answeredCount = Object.keys(answers).filter(function (id) { return answers[id] != null; }).length;
    if (answeredCount < screener.minimum_answered_questions) {
      return { valid: false, answeredCount: answeredCount, required: screener.minimum_answered_questions };
    }

    var categories = screener.categories
      .slice()
      .sort(function (a, b) { return a.sort_order - b.sort_order; })
      .map(function (category) {
        var weighted = 0;
        var denominator = 0;
        screener.questions
          .filter(function (question) { return question.category_id === category.category_id; })
          .forEach(function (question) {
            if (answers[question.question_id] == null) return;
            var value = normalizeAnswer(data, screener, question, answers[question.question_id]);
            if (value == null) return;
            weighted += (100 - value);
            denominator += 1;
          });
        return Object.assign({}, category, { needScore: denominator ? round(weighted / denominator) : null });
      })
      .filter(function (category) { return category.needScore != null; });

    var maxNeed = Math.max.apply(null, categories.map(function (c) { return c.needScore; }));
    var leaders = categories.filter(function (c) { return c.needScore === maxNeed; });
    var fallbackRule = screener.routing.find(function (r) { return r.operator === 'fallback'; });

    function ruleFor(categoryId) {
      return screener.routing.find(function (r) { return r.source_category_id === categoryId && r.status === 'active'; });
    }

    if (leaders.length === categories.length) {
      return {
        valid: true,
        tie: 'full',
        target_assessment_id: fallbackRule.target_assessment_id,
        explanation_he: fallbackRule.explanation_he,
        categories: categories
      };
    }

    if (leaders.length === 1) {
      var rule = ruleFor(leaders[0].category_id);
      return {
        valid: true,
        tie: 'none',
        target_assessment_id: rule.target_assessment_id,
        explanation_he: rule.explanation_he,
        category: leaders[0],
        categories: categories
      };
    }

    var candidates = leaders
      .map(function (c) { return { category: c, rule: ruleFor(c.category_id) }; })
      .sort(function (a, b) { return a.rule.tie_break_order - b.rule.tie_break_order; });

    return {
      valid: true,
      tie: 'partial',
      candidates: candidates,
      categories: categories
    };
  }

  return {
    normalizeAnswer: normalizeAnswer,
    scoreAssessment: scoreAssessment,
    computeRouting: computeRouting
  };
});
