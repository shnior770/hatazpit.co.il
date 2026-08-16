(function () {
  'use strict';

  var app = document.getElementById('diagnostic-app');
  var params = new URLSearchParams(window.location.search);
  var directDomainId = params.get('domain');
  var flow = params.get('flow');

  var data;
  var stageAssessment;
  var stageAnswers = {};
  var stageIsScreener = false;
  var currentIndex = 0;
  var milestones = {};
  var resolvedDomainId = null;
  var lastRoutingExplanation = null;

  function track(name, values) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, Object.assign({}, values || {}));
  }

  function fail(message) {
    app.innerHTML = '<section class="diagnostic-panel error-panel"><p class="eyebrow">משהו השתבש</p><h1>' +
      message + '</h1><p>אפשר לחזור למסלול הבהירות ולנסות שוב.</p><a class="btn primary" href="index.html">למסלול הבהירות</a></section>';
  }

  function cloneTemplate(id) {
    var template = document.getElementById(id);
    return template.content.cloneNode(true);
  }

  function field(root, name) {
    return root.querySelector('[data-field="' + name + '"]');
  }

  function sortedQuestions(assessment) {
    return assessment.questions.slice().sort(function (a, b) { return a.display_order - b.display_order; });
  }

  function categoryById(assessment, id) {
    return assessment.categories.find(function (category) { return category.category_id === id; });
  }

  function responseOptions(assessment, question) {
    var setId = question.response_set_id || assessment.default_response_set_id;
    return data.response_sets[setId].options.slice().sort(function (a, b) { return a.display_order - b.display_order; });
  }

  // ---------- intro ----------
  function showIntro(assessment, isScreener, onStart) {
    var view = cloneTemplate('intro-template');
    field(view, 'eyebrow').textContent = isScreener ? 'מסלול הבהירות — שלב 1' : 'מסלול הבהירות — אבחון תחומי';
    field(view, 'title').textContent = assessment.short_title_he;
    field(view, 'description').textContent = assessment.description_he;
    field(view, 'question-count').textContent = assessment.question_count;
    field(view, 'minutes').textContent = assessment.estimated_minutes;
    view.querySelector('.diagnostic-start').addEventListener('click', function () {
      track(isScreener ? 'diagnostic_start' : 'domain_diagnostic_start', { question_count: assessment.question_count });
      onStart();
    });
    app.replaceChildren(view);
    app.focus({ preventScroll: true });
  }

  // ---------- question ----------
  function showQuestion(assessment, answers, index, isScreener, onDone) {
    var questions = sortedQuestions(assessment);
    currentIndex = index;
    var question = questions[index];
    var category = categoryById(assessment, question.category_id);
    var view = cloneTemplate('question-template');
    var percent = Math.round((index / questions.length) * 100);
    field(view, 'progress-label').textContent = 'שאלה ' + (index + 1) + ' מתוך ' + questions.length;
    field(view, 'category').textContent = category.title_he;
    field(view, 'question-number').textContent = String(index + 1).padStart(2, '0');
    field(view, 'question').textContent = question.question_text_he;
    var help = field(view, 'help');
    if (question.help_text_he) help.textContent = question.help_text_he;
    else help.hidden = true;
    var progress = view.querySelector('.progress-track');
    progress.setAttribute('aria-valuenow', percent);
    progress.querySelector('span').style.width = percent + '%';

    var optionsRoot = view.querySelector('.answer-options');
    responseOptions(assessment, question).forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-button';
      button.textContent = option.label_he;
      if (answers[question.question_id] === option.option_id) button.classList.add('selected');
      button.addEventListener('click', function () {
        answers[question.question_id] = option.option_id;
        var completion = Math.round(((index + 1) / questions.length) * 100);
        [25, 50, 75].forEach(function (mark) {
          if (completion >= mark && !milestones[mark]) {
            milestones[mark] = true;
            track(isScreener ? 'screener_progress' : 'domain_progress', { percent_complete: mark });
          }
        });
        window.setTimeout(function () {
          if (index + 1 < questions.length) showQuestion(assessment, answers, index + 1, isScreener, onDone);
          else onDone();
        }, 120);
      });
      optionsRoot.appendChild(button);
    });

    var back = view.querySelector('.diagnostic-back');
    if (index === 0) back.disabled = true;
    back.addEventListener('click', function () { if (index > 0) showQuestion(assessment, answers, index - 1, isScreener, onDone); });
    app.replaceChildren(view);
    app.focus({ preventScroll: true });
  }

  // ---------- routing result ----------
  function domainTitle(id) {
    var a = data.assessments[id];
    return a ? a.short_title_he : id;
  }

  function goToDomain(domainId, explanationHe) {
    var domainAssessment = data.assessments[domainId];
    if (!domainAssessment || domainAssessment.level !== 'domain' || domainAssessment.status !== 'launch_ready') {
      fail('התחום המומלץ עדיין לא זמין. אפשר לחזור למסלול הבהירות ולבחור מסלול אחר.');
      return;
    }
    resolvedDomainId = domainId;
    lastRoutingExplanation = explanationHe;
    stageAnswers = {};
    milestones = {};
    stageAssessment = domainAssessment;
    stageIsScreener = false;
    document.title = domainAssessment.short_title_he + ' — מסלול הבהירות';
    showIntro(domainAssessment, false, function () {
      showQuestion(domainAssessment, stageAnswers, 0, false, showResults);
    });
  }

  function showRoutingResult(routing) {
    track('screener_complete');
    var view = cloneTemplate('routing-result-template');
    var choicesRoot = field(view, 'routing-choices');

    if (routing.tie === 'none') {
      field(view, 'routing-title').textContent = 'מומלץ להתמקד ב: ' + domainTitle(routing.target_assessment_id);
      field(view, 'routing-explanation').textContent = routing.explanation_he;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn primary';
      btn.textContent = 'המשך לאבחון התחומי';
      btn.addEventListener('click', function () { goToDomain(routing.target_assessment_id, routing.explanation_he); });
      choicesRoot.appendChild(btn);
    } else if (routing.tie === 'partial') {
      field(view, 'routing-title').textContent = 'יש לכם תיקו בין כמה תחומים';
      field(view, 'routing-explanation').textContent = 'כמה ממדים יצאו באותה רמת דחיפות. אפשר לבחור באיזה מהם להתחיל — תמיד אפשר לחזור ולבדוק גם את השני.';
      routing.candidates.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn primary route-cta';
        b.style.marginLeft = '10px';
        b.textContent = domainTitle(c.rule.target_assessment_id);
        b.addEventListener('click', function () { goToDomain(c.rule.target_assessment_id, c.rule.explanation_he); });
        choicesRoot.appendChild(b);
      });
    } else {
      field(view, 'routing-title').textContent = 'לא עלה פער בולט בין התחומים';
      field(view, 'routing-explanation').textContent = routing.explanation_he;
      var dbtn = document.createElement('button');
      dbtn.type = 'button';
      dbtn.className = 'btn primary';
      dbtn.textContent = 'המשך לאבחון התחומי המומלץ';
      dbtn.addEventListener('click', function () { goToDomain(routing.target_assessment_id, routing.explanation_he); });
      choicesRoot.appendChild(dbtn);
    }

    app.replaceChildren(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- results ----------
  function scoreClass(score) {
    if (score < 40) return 'low';
    if (score < 70) return 'mid';
    return 'high';
  }

  function showResults() {
    var result = window.HatazpitDiagnosticsEngine.scoreAssessment(data, stageAssessment, stageAnswers);
    if (!result.valid) {
      fail('אין עדיין מספיק תשובות להפקת הדוח');
      return;
    }
    track('domain_diagnostic_complete');
    var view = cloneTemplate('results-template');
    field(view, 'result-title').textContent = 'תמונת המצב שלכם: ' + stageAssessment.short_title_he;
    field(view, 'score').textContent = Math.round(result.score);
    field(view, 'band').textContent = result.band.label_he;
    field(view, 'summary').textContent = result.band.summary_he;
    view.querySelector('.score-ring').classList.add(scoreClass(result.score));

    var ratedCategories = result.categories.filter(function (c) { return c.score != null; });

    var prioritySection = field(view, 'priority-section');
    var priorityAreas = view.querySelector('.priority-areas');
    var weakest = ratedCategories.slice().sort(function (a, b) { return a.score - b.score; }).filter(function (c) { return c.score < 70; }).slice(0, 3);
    if (weakest.length) {
      prioritySection.hidden = false;
      weakest.forEach(function (category) {
        var card = document.createElement('article');
        card.className = 'category-result ' + scoreClass(category.score);
        card.innerHTML = '<div class="category-score"><strong>' + Math.round(category.score) + '</strong><span>/100</span></div>' +
          '<div><h3>' + category.title_he + '</h3><p>' + (category.insight ? category.insight.summary_he : category.description_he) + '</p></div>';
        priorityAreas.appendChild(card);
      });
    }

    var categoryRoot = view.querySelector('.category-results');
    result.categories.forEach(function (category) {
      var card = document.createElement('article');
      if (category.score == null) {
        card.className = 'category-result unrated';
        card.innerHTML = '<div class="category-score"><strong>—</strong><span>/100</span></div>' +
          '<div><h3>' + category.title_he + '</h3><p class="category-band">אין מספיק תשובות</p>' +
          '<p>' + category.description_he + '</p></div>';
        categoryRoot.appendChild(card);
        return;
      }
      card.className = 'category-result ' + scoreClass(category.score);
      card.innerHTML = '<div class="category-score"><strong>' + Math.round(category.score) + '</strong><span>/100</span></div>' +
        '<div><h3>' + category.title_he + '</h3><p class="category-band">' + category.band.label_he + '</p>' +
        '<p>' + (category.insight ? category.insight.summary_he : category.description_he) + '</p></div>';
      categoryRoot.appendChild(card);
    });

    var actionsRoot = view.querySelector('.recommended-actions');
    if (!result.actions.length) {
      actionsRoot.innerHTML = '<div class="positive-state"><strong>לא עלה כרגע פער המחייב פעולה דחופה.</strong><p>כדי לשמר את המצב, עברו על הממד שקיבל את הציון הנמוך ביותר וקבעו מועד בדיקה חוזרת בעוד שלושה חודשים.</p></div>';
    } else {
      result.actions.forEach(function (action, index) {
        var item = document.createElement('article');
        item.className = 'action-card';
        item.innerHTML = '<span class="action-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<div><h3>' + action.title_he + '</h3><p>' + action.action_text_he + '</p>' +
          '<dl><div><dt>תוצר</dt><dd>' + action.deliverable_he + '</dd></div>' +
          '<div><dt>מועד מוצע</dt><dd>' + action.suggested_timeframe_he + '</dd></div></dl></div>';
        actionsRoot.appendChild(item);
      });
    }

    var linkIds = [];
    result.actions.forEach(function (a) { if (a.content_link_id && linkIds.indexOf(a.content_link_id) === -1) linkIds.push(a.content_link_id); });
    ratedCategories.forEach(function (c) { if (c.insight && c.insight.content_link_id && linkIds.indexOf(c.insight.content_link_id) === -1) linkIds.push(c.insight.content_link_id); });
    var contentRoot = view.querySelector('.content-recommendations');
    var shownLinks = linkIds.filter(function (id) { return data.content_links[id]; }).slice(0, 3);
    if (shownLinks.length) {
      shownLinks.forEach(function (id) {
        var link = data.content_links[id];
        var a = document.createElement('a');
        a.className = 'content-card no-print';
        a.href = '..' + link.path;
        a.innerHTML = '<span>מדריך מעשי</span><strong>' + link.title_he + '</strong><em>לקריאת המאמר ←</em>';
        contentRoot.appendChild(a);
        var p = document.createElement('p');
        p.className = 'print-only';
        p.textContent = 'להעמקה: ' + link.title_he + ' — ' + window.location.origin + link.path;
        contentRoot.appendChild(p);
      });
    } else {
      view.querySelector('.content-section').hidden = true;
    }

    var disclaimer = data.disclaimers[stageAssessment.disclaimer_id];
    field(view, 'disclaimer').textContent = disclaimer ? disclaimer.text_he : '';
    view.querySelector('.print-report').addEventListener('click', function () {
      track('diagnostic_report_print');
      window.print();
    });
    view.querySelector('.restart-diagnostic').addEventListener('click', function () {
      track('diagnostic_restart');
      startFlow();
    });
    app.replaceChildren(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- boot ----------
  function startFlow() {
    stageAnswers = {};
    milestones = {};
    if (directDomainId) {
      var domainAssessment = data.assessments[directDomainId];
      if (!domainAssessment || domainAssessment.level !== 'domain' || domainAssessment.status !== 'launch_ready') {
        fail('האבחון המבוקש אינו זמין כרגע');
        return;
      }
      stageAssessment = domainAssessment;
      stageIsScreener = false;
      document.title = domainAssessment.short_title_he + ' — מסלול הבהירות';
      showIntro(domainAssessment, false, function () {
        showQuestion(domainAssessment, stageAnswers, 0, false, showResults);
      });
      return;
    }

    var screener = data.assessments.screener;
    if (!screener || screener.level !== 'screener') {
      fail('שאלון המיון אינו זמין כרגע');
      return;
    }
    stageAssessment = screener;
    stageIsScreener = true;
    document.title = 'מיפוי — מסלול הבהירות';
    showIntro(screener, true, function () {
      showQuestion(screener, stageAnswers, 0, true, function () {
        var routing = window.HatazpitDiagnosticsEngine.computeRouting(data, screener, stageAnswers);
        if (!routing.valid) {
          fail('אין עדיין מספיק תשובות כדי להמליץ על תחום');
          return;
        }
        showRoutingResult(routing);
      });
    });
  }

  if (!directDomainId && flow !== 'clarity') {
    fail('המסלול המבוקש אינו זמין כרגע');
    return;
  }

  fetch('../data/diagnostics-v2.json', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('Could not load diagnostics data');
      return response.json();
    })
    .then(function (payload) {
      data = payload;
      startFlow();
    })
    .catch(function () { fail('לא הצלחנו לטעון את המסלול'); });
})();
