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
  // reading time badge, only on knowledge/*.html article pages (not the hub, not about/contact/home)
  if (window.location.pathname.indexOf('/knowledge/') === -1) return;
  if (document.querySelector('.knowledge-screen')) return;
  var mainEl = document.querySelector('main');
  var subheroEl = document.querySelector('.subhero .wrap');
  if (!mainEl || !subheroEl) return;
  var words = mainEl.innerText.trim().split(/\s+/).length;
  if (words < 150) return;
  var minutes = Math.max(1, Math.round(words / 200));
  var badge = document.createElement('p');
  badge.className = 'reading-time';
  badge.textContent = '⏱ ' + minutes + ' דקות קריאה';
  subheroEl.appendChild(badge);
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

(function () {
  // read tracking: mark article pages as read (localStorage), show a badge on the hub
  if (window.location.pathname.indexOf('/knowledge/') === -1) return;
  var STORAGE_KEY = 'hatazpit_read_articles';

  function getRead() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function setRead(map) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); }
    catch (e) {}
  }

  var isHub = !!document.querySelector('.knowledge-screen');

  if (!isHub) {
    // article page: mark this article read after a moment of actual reading
    var slug = window.location.pathname.split('/').pop();
    setTimeout(function () {
      var map = getRead();
      if (!map[slug]) {
        map[slug] = true;
        setRead(map);
      }
    }, 4000);
    return;
  }

  // hub page: badge each card whose article was already read
  var map = getRead();
  document.querySelectorAll('.article-card').forEach(function (card) {
    var href = card.getAttribute('href');
    if (!href || !map[href]) return;
    card.classList.add('is-read');
    var badge = document.createElement('span');
    badge.className = 'read-badge';
    badge.textContent = '✓ נקרא';
    var body = card.querySelector('.card-body');
    if (body) body.insertBefore(badge, body.firstChild);
  });
})();
