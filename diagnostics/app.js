(function () {
  'use strict';

  var ALLOWED = ['workplan_basic', 'budget_basic'];
  var app = document.getElementById('diagnostic-app');
  var params = new URLSearchParams(window.location.search);
  var assessmentId = params.get('id');
  var data;
  var assessment;
  var answers = {};
  var currentIndex = 0;
  var milestones = {};

  function track(name, values) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, Object.assign({ assessment_id: assessmentId }, values || {}));
  }

  function fail(message) {
    app.innerHTML = '<section class="diagnostic-panel error-panel"><p class="eyebrow">משהו השתבש</p><h1>' +
      message + '</h1><p>אפשר לחזור לבחירת המסלול ולנסות שוב.</p><a class="btn primary" href="index.html">לבחירת מסלול</a></section>';
  }

  function cloneTemplate(id) {
    var template = document.getElementById(id);
    return template.content.cloneNode(true);
  }

  function field(root, name) {
    return root.querySelector('[data-field="' + name + '"]');
  }

  function sortedQuestions() {
    return assessment.questions.slice().sort(function (a, b) { return a.display_order - b.display_order; });
  }

  function categoryById(id) {
    return assessment.categories.find(function (category) { return category.category_id === id; });
  }

  function responseOptions(question) {
    var setId = question.response_set_id || assessment.default_response_set_id;
    return data.response_sets[setId].options.slice().sort(function (a, b) { return a.display_order - b.display_order; });
  }

  function showIntro() {
    var view = cloneTemplate('intro-template');
    field(view, 'title').textContent = assessment.short_title_he;
    field(view, 'description').textContent = assessment.description_he;
    field(view, 'question-count').textContent = assessment.question_count;
    field(view, 'minutes').textContent = assessment.estimated_minutes;
    view.querySelector('.diagnostic-start').addEventListener('click', function () {
      track('diagnostic_start', { question_count: assessment.question_count });
      showQuestion(0);
    });
    app.replaceChildren(view);
  }

  function showQuestion(index) {
    var questions = sortedQuestions();
    currentIndex = index;
    var question = questions[index];
    var category = categoryById(question.category_id);
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
    responseOptions(question).forEach(function (option) {
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
            track('diagnostic_progress', { percent_complete: mark });
          }
        });
        window.setTimeout(function () {
          if (index + 1 < questions.length) showQuestion(index + 1);
          else showResults();
        }, 120);
      });
      optionsRoot.appendChild(button);
    });

    var back = view.querySelector('.diagnostic-back');
    if (index === 0) back.disabled = true;
    back.addEventListener('click', function () { if (index > 0) showQuestion(index - 1); });
    app.replaceChildren(view);
    app.focus({ preventScroll: true });
  }

  function scoreClass(score) {
    if (score < 40) return 'low';
    if (score < 70) return 'mid';
    return 'high';
  }

  function showResults() {
    var result = window.HatazpitDiagnosticsEngine.scoreAssessment(data, assessment, answers);
    if (!result.valid) {
      fail('אין עדיין מספיק תשובות להפקת הדוח');
      return;
    }
    track('diagnostic_complete');
    var view = cloneTemplate('results-template');
    field(view, 'result-title').textContent = 'תמונת המצב שלכם: ' + assessment.short_title_he;
    field(view, 'score').textContent = Math.round(result.score);
    field(view, 'band').textContent = result.band.label_he;
    field(view, 'summary').textContent = result.band.summary_he;
    view.querySelector('.score-ring').classList.add(scoreClass(result.score));

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

    var linkIds = assessment.actions.map(function (action) { return action.content_link_id; }).filter(Boolean);
    var uniqueLink = linkIds.find(function (id) { return data.content_links[id]; });
    var contentRoot = view.querySelector('.content-recommendations');
    if (uniqueLink) {
      var link = data.content_links[uniqueLink];
      contentRoot.innerHTML = '<a class="content-card no-print" href="..' + link.path + '"><span>מדריך מעשי</span><strong>' + link.title_he + '</strong><em>לקריאת המאמר ←</em></a>' +
        '<p class="print-only">להעמקה: ' + link.title_he + ' — ' + window.location.origin + link.path + '</p>';
    } else {
      view.querySelector('.content-section').hidden = true;
    }

    var disclaimer = data.disclaimers[assessment.disclaimer_id];
    field(view, 'disclaimer').textContent = disclaimer ? disclaimer.text_he : '';
    view.querySelector('.print-report').addEventListener('click', function () {
      track('diagnostic_report_print');
      window.print();
    });
    view.querySelector('.restart-diagnostic').addEventListener('click', function () {
      answers = {};
      milestones = {};
      track('diagnostic_restart');
      showIntro();
    });
    app.replaceChildren(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!ALLOWED.includes(assessmentId)) {
    fail('המסלול המבוקש אינו זמין כרגע');
    return;
  }

  fetch('../data/diagnostics-v1.json', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('Could not load diagnostics data');
      return response.json();
    })
    .then(function (payload) {
      data = payload;
      assessment = data.assessments.find(function (item) { return item.assessment_id === assessmentId; });
      if (!assessment || assessment.status !== 'launch_ready') throw new Error('Assessment unavailable');
      document.title = assessment.short_title_he + ' — מסלול הבהירות';
      showIntro();
    })
    .catch(function () { fail('לא הצלחנו לטעון את המסלול'); });
})();
