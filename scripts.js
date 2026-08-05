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
