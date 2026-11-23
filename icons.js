/* useAnimations icons (Lottie JSON vendored under assets/icons/).
   One set, 18px, currentColor. Loop-type icons play on hover only —
   nothing loops on its own. Menu icons are driven by UA.setMenu so
   the header button and the drawer close button stay in sync. */
(function () {
  'use strict';
  var menuAnims = [];
  function recolor(el) {
    el.querySelectorAll('svg [stroke]').forEach(function (n) {
      var s = (n.getAttribute('stroke') || '').replace(/\s/g, '').toLowerCase();
      if (s === 'rgb(0,0,0)' || s === '#000000' || s === 'black') n.setAttribute('stroke', 'currentColor');
    });
  }
  function init() {
    if (!window.lottie) return;
    document.querySelectorAll('.ua-icon[data-ua]').forEach(function (el) {
      var id = el.getAttribute('data-ua');
      var mode = el.getAttribute('data-ua-mode') || 'hover';
      var anim = window.lottie.loadAnimation({
        container: el, renderer: 'svg', loop: false, autoplay: false,
        path: 'assets/icons/' + id + '.json'
      });
      anim.addEventListener('DOMLoaded', function () { recolor(el); });
      if (id === 'menu-v2') { menuAnims.push(anim); return; }
      var host = el.closest('button, a') || el;
      if (mode === 'hover') host.addEventListener('mouseenter', function () { anim.goToAndPlay(0); });
      else if (mode === 'click') host.addEventListener('click', function () { anim.goToAndPlay(0); });
      else if (mode === 'toggle') {
        host.addEventListener('click', function () {
          anim.setDirection(anim.playDirection === 1 ? -1 : 1);
          anim.play();
        });
      }
    });
  }
  window.UA = {
    setMenu: function (open) {
      menuAnims.forEach(function (a) { a.setDirection(open ? 1 : -1); a.play(); });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
