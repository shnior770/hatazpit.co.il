(function () {
  var path = window.location.pathname;
  var current = null;
  if (path.indexOf('/knowledge/') !== -1) current = 'מרכז ידע';
  else if (/about\.html$/.test(path)) current = 'אודות';
  else if (/contact\.html$/.test(path)) current = 'צור קשר';
  if (!current) return;
  document.querySelectorAll('nav.links a').forEach(function (a) {
    if (a.textContent.trim() === current) a.classList.add('active');
  });
})();

(function () {
  var header = document.querySelector('header.site');
  if (!header) return;
  var timer;
  window.addEventListener('scroll', function () {
    header.classList.add('is-scrolling');
    clearTimeout(timer);
    timer = setTimeout(function () {
      header.classList.remove('is-scrolling');
    }, 400);
  }, { passive: true });
})();

(function () {
  // article step rail: only on article pages with enough sections, skip the knowledge hub
  if (document.querySelector('.knowledge-screen')) return;
  var mainEl = document.querySelector('main');
  if (!mainEl) return;
  var headings = mainEl.querySelectorAll('h2');
  if (headings.length < 2) return;

  var rail = document.createElement('nav');
  rail.className = 'toc-rail';
  var dots = [];
  headings.forEach(function (h, i) {
    if (!h.id) h.id = 'section-' + i;
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.setAttribute('aria-label', h.textContent);
    rail.appendChild(a);
    dots.push(a);
  });
  document.body.appendChild(rail);

  if (typeof IntersectionObserver === 'undefined') return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var idx = Array.prototype.indexOf.call(headings, entry.target);
      dots.forEach(function (d) { d.classList.remove('active'); });
      dots[idx].classList.add('active');
    });
  }, { rootMargin: '-40% 0px -50% 0px' });

  headings.forEach(function (h) { observer.observe(h); });
})();
