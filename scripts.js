(function () {
  // cookie consent banner
  var KEY = 'hatazpit_cookie_consent';
  var current = null;
  try { current = localStorage.getItem(KEY); } catch (e) {}

  function grantAnalytics() {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
    }
  }
  function setConsent(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    if (value === 'accepted') grantAnalytics();
    hideBanner();
  }

  var banner;
  function showBanner() {
    document.body.classList.add('cookie-banner-open');
    banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'הסכמה לעוגיות');
    var privacyHref = (window.location.pathname.indexOf('/knowledge/') !== -1 ? '../' : '') + 'privacy.html';
    banner.innerHTML =
      '<p>האתר משתמש בעוגיות אנליטיקה כדי להבין איך משתמשים בו ולשפר אותו. פרטים ב<a href="' + privacyHref + '">מדיניות הפרטיות</a>.</p>' +
      '<div class="cookie-banner-actions">' +
        '<button type="button" class="cookie-decline">דוחה</button>' +
        '<button type="button" class="cookie-accept">מאשר/ת</button>' +
      '</div>';
    document.body.appendChild(banner);
    banner.querySelector('.cookie-accept').addEventListener('click', function () { setConsent('accepted'); });
    banner.querySelector('.cookie-decline').addEventListener('click', function () { setConsent('declined'); });
    void banner.offsetHeight;
    requestAnimationFrame(function () { banner.classList.add('is-visible'); });
  }
  function hideBanner() {
    document.body.classList.remove('cookie-banner-open');
    if (!banner || !banner.parentNode) return;
    var el = banner;
    el.classList.remove('is-visible');
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  if (current === 'accepted') {
    grantAnalytics();
  } else if (current !== 'declined') {
    showBanner();
  }

  // footer link to reopen the choice at any time
  document.querySelectorAll('a[href$="privacy.html"]').forEach(function (a) {
    a.addEventListener('click', function () {}, { passive: true });
  });
  var reopen = document.getElementById('cookie-settings');
  if (reopen) reopen.addEventListener('click', function (e) { e.preventDefault(); showBanner(); });
})();

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
  badge.textContent = '⏱ ' + (minutes === 1 ? 'דקת קריאה אחת' : minutes + ' דקות קריאה');
  subheroEl.appendChild(badge);
})();

(function () {
  // mark this article as read (localStorage only, no server) — read by the hub below to show a "read" strip
  if (window.location.pathname.indexOf('/knowledge/') === -1) return;
  if (document.querySelector('.knowledge-screen')) return;
  var slug = window.location.pathname.split('/').pop();
  if (!slug) return;
  var KEY = 'hatazpit_read_articles';
  try {
    var read = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (read.indexOf(slug) === -1) {
      read.push(slug);
      localStorage.setItem(KEY, JSON.stringify(read));
    }
  } catch (e) {}
})();

(function () {
  // knowledge hub: add a "read" strip to cards whose article was already visited
  if (!document.querySelector('.knowledge-screen')) return;
  var read = [];
  try { read = JSON.parse(localStorage.getItem('hatazpit_read_articles') || '[]'); } catch (e) {}
  if (!read.length) return;
  document.querySelectorAll('.article-card').forEach(function (card) {
    var href = card.getAttribute('href');
    var slug = href ? href.split('/').pop() : null;
    if (!slug || read.indexOf(slug) === -1) return;
    card.classList.add('is-read');
    var strip = document.createElement('span');
    strip.className = 'read-strip';
    strip.textContent = 'נקרא';
    card.insertBefore(strip, card.firstChild);
  });
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

  // back-to-top button (mobile only, via CSS) — same "long article" pages as the rail above
  var toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'back-to-top';
  toTop.setAttribute('aria-label', 'חזרה לראש העמוד');
  toTop.innerHTML = '↑';
  document.body.appendChild(toTop);
  toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  window.addEventListener('scroll', function () {
    toTop.classList.toggle('is-visible', window.scrollY > 600);
  }, { passive: true });

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
  // copy-to-clipboard button next to mailto: links, so visitors who don't want
  // the OS/browser account-chooser can just copy the address instead
  if (!navigator.clipboard) return;
  document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
    var address = a.href.replace(/^mailto:/, '').split('?')[0];
    if (!address) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-email-btn';
    btn.textContent = 'העתק';
    btn.setAttribute('aria-label', 'העתק את כתובת המייל');
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(address).then(function () {
        var original = btn.textContent;
        btn.textContent = 'הועתק!';
        setTimeout(function () { btn.textContent = original; }, 1800);
      });
    });
    a.insertAdjacentElement('afterend', btn);
  });
})();

