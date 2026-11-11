(function () {
  var armed = false;

  function isTypingTarget(el) {
    if (!el || el === document || el === document.body || el === document.documentElement) {
      return false;
    }
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest("[contenteditable='true'], [contenteditable='']")) return true;
    return false;
  }

  function isSpace(e) {
    return e.key === " " || e.code === "Space" || e.key === "Spacebar";
  }

  document.addEventListener(
    "keydown",
    function (e) {
      if (!isSpace(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;
      var play = document.querySelector('[data-testid="play"]');
      if (!play) return;
      // 擋住空白鍵預設行為：頁面捲動、以及焦點在按鈕上時的啟動
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      e.stopPropagation();
      if (e.repeat || play.disabled) {
        armed = true;
        return;
      }
      armed = true;
      play.click();
    },
    true
  );

  document.addEventListener(
    "keyup",
    function (e) {
      if (!isSpace(e) || !armed) return;
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      e.stopPropagation();
      armed = false;
    },
    true
  );
})();
