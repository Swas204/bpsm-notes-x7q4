/* ===========================================================
   Audit, Tax and Assurance Guide : reading tools
   (same tools as the OB Study Guide, plus short-video links
   and per-page progress on the home page)
   - hide / show the contents sidebar
   - "Mark as done" check after every section
   - All / Undone switch for a final pass over skipped parts
   - light / dark theme
   Progress is saved in this browser (localStorage).
   =========================================================== */

(function () {
  var page = location.pathname.split('/').pop() || 'index.html';
  var KEY = 'bpsm:';
  var store = {
    get: function (k) { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(KEY + k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(KEY + k); } catch (e) {} }
  };

  // theme and sidebar state are applied before paint so the page does not flicker.
  // Dark is the default; the light theme is one click away.
  var root = document.documentElement;
  root.setAttribute('data-theme', store.get('theme') === 'light' ? 'light' : 'dark');
  // Sidebar: your last choice wins. With no choice yet it starts open on wide screens and
  // closed on phones, where it sits above the page instead of beside it.
  var narrow = window.matchMedia('(max-width: 1080px)');
  var navPref = store.get('navHidden');
  if (navPref === '1' || (navPref === null && narrow.matches)) root.classList.add('nav-hidden');

  // always print in the light theme
  var themeBeforePrint = null;
  window.addEventListener('beforeprint', function () {
    themeBeforePrint = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
  });
  window.addEventListener('afterprint', function () {
    if (themeBeforePrint) root.setAttribute('data-theme', themeBeforePrint);
  });

  // stroke icons, drawn in currentColor so they follow the theme
  function svg(body) {
    return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  var ICON = {
    panel: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="9.5" y1="4" x2="9.5" y2="20"/>'),
    sun:   svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>'),
    moon:  svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------- highlighter ----------
     Select text inside a section, pick a colour. Click a highlight to recolour or remove it.
     Each highlight is saved as (section id, start, end) character offsets within that section's text,
     counting only text outside buttons, so the Done / Show answer buttons changing their labels
     never shifts a saved highlight. */
  var HL_COLORS = ['yellow', 'green', 'pink', 'blue'];
  var HL_ICON = svg('<path d="M9 11l-5 5v4h4l5-5"/><path d="M14.5 5.5l4 4L11 17l-4-4z"/><path d="M13 7l4 4"/>');

  function initHighlighter(bar) {
    var KEYH = 'hl:' + page;
    var list;
    try { list = JSON.parse(store.get(KEYH) || '[]'); } catch (e) { list = []; }
    var lastColor = store.get('hlColor') || 'yellow';
    function save() { store.set(KEYH, JSON.stringify(list)); paintCount(); renderPanel(); }

    function rootOf(node) {
      var el = node && (node.nodeType === 1 ? node : node.parentNode);
      return el && el.closest ? el.closest('.topic') : null;
    }
    function skipped(t) { var p = t.parentNode; return !p || !!p.closest('button, .done-bar, .hl-pop, .hl-panel'); }
    function textNodes(root) {
      var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
      while ((n = w.nextNode())) if (!skipped(n)) out.push(n);
      return out;
    }
    // character offset of a range boundary point within root's countable text
    function offsetOf(root, node, off) {
      var p = document.createRange();
      p.setStart(node, off); p.collapse(true);
      var total = 0, nodes = textNodes(root);
      for (var i = 0; i < nodes.length; i++) {
        var t = nodes[i];
        if (t === node) return total + off;
        if (p.comparePoint(t, t.length) <= 0) total += t.length; else break;
      }
      return total;
    }
    function apply(h) {
      var root = document.querySelector('.topic[data-id="' + h.t + '"]');
      if (!root) return;
      var pos = 0;
      textNodes(root).forEach(function (t) {
        var len = t.length, a = pos, b = pos + len;
        pos = b;
        if (b <= h.s || a >= h.e) return;
        var s = Math.max(h.s, a) - a, e = Math.min(h.e, b) - a;
        if (e < len) t.splitText(e);
        var mid = s > 0 ? t.splitText(s) : t;
        if (!mid.textContent.trim()) return;
        var m = document.createElement('mark');
        m.className = 'hl hl-' + h.c;
        m.setAttribute('data-hid', h.id);
        mid.parentNode.insertBefore(m, mid);
        m.appendChild(mid);
      });
    }
    function marksOf(id) { return document.querySelectorAll('mark.hl[data-hid="' + id + '"]'); }
    function unwrap(id) {
      Array.prototype.forEach.call(marksOf(id), function (m) {
        var parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize();
      });
    }

    // restore in the order they were made
    list.forEach(apply);

    /* popup */
    var pop = document.createElement('div');
    pop.className = 'hl-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
    pop.addEventListener('mousedown', function (e) { e.preventDefault(); });
    function place(rect) {
      pop.hidden = false;
      var top = rect.top + window.scrollY - pop.offsetHeight - 8;
      if (top < window.scrollY + 60) top = rect.bottom + window.scrollY + 8;
      var left = rect.left + window.scrollX + rect.width / 2 - pop.offsetWidth / 2;
      left = Math.max(8, Math.min(left, document.documentElement.clientWidth - pop.offsetWidth - 8));
      pop.style.top = top + 'px';
      pop.style.left = left + 'px';
    }
    function hidePop() { pop.hidden = true; pop.innerHTML = ''; }
    function swatches(current, onPick) {
      HL_COLORS.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sw sw-' + c + (c === current ? ' on' : '');
        b.title = 'Highlight ' + c;
        b.addEventListener('click', function () { lastColor = c; store.set('hlColor', c); onPick(c); });
        pop.appendChild(b);
      });
    }

    function newFromSelection() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
      var r = sel.getRangeAt(0);
      var root = rootOf(r.startContainer);
      if (!root || root !== rootOf(r.endContainer)) return false;
      var text = r.toString().replace(/\s+/g, ' ').trim();
      if (!text) return false;
      var s = offsetOf(root, r.startContainer, r.startOffset);
      var e = offsetOf(root, r.endContainer, r.endOffset);
      if (e <= s) return false;
      pop.innerHTML = '';
      swatches(null, function (c) {
        var h = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: root.dataset.id, s: s, e: e, c: c, x: text.slice(0, 160) };
        list.push(h);
        apply(h);
        save();
        sel.removeAllRanges();
        hidePop();
      });
      place(r.getBoundingClientRect());
      return true;
    }

    function editMark(m) {
      var id = m.getAttribute('data-hid');
      var h = list.filter(function (x) { return x.id === id; })[0];
      if (!h) return;
      pop.innerHTML = '';
      swatches(h.c, function (c) {
        h.c = c;
        Array.prototype.forEach.call(marksOf(id), function (el) { el.className = 'hl hl-' + c; });
        save();
        hidePop();
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'hl-del';
      del.textContent = 'Remove';
      del.addEventListener('click', function () {
        unwrap(id);
        list = list.filter(function (x) { return x.id !== id; });
        save();
        hidePop();
      });
      pop.appendChild(del);
      place(m.getBoundingClientRect());
    }

    function onUp(e) {
      if (pop.contains(e.target) || panel.contains(e.target)) return;
      setTimeout(function () {
        if (newFromSelection()) return;
        var m = e.target.closest && e.target.closest('mark.hl');
        if (m && window.getSelection().isCollapsed) { editMark(m); return; }
        hidePop();
      }, 0);
    }
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hidePop(); panel.hidden = true; } });
    window.addEventListener('resize', hidePop);

    /* top-bar button + list of highlights on this page */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sb-icon sb-hl';
    btn.title = 'Highlights on this page';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = HL_ICON + '<span class="hl-count"></span>';
    var themeBtn = bar.querySelector('#sbTheme');
    bar.insertBefore(btn, themeBtn);

    var panel = document.createElement('div');
    panel.className = 'hl-panel';
    panel.hidden = true;
    document.body.appendChild(panel);
    btn.addEventListener('click', function () { panel.hidden = !panel.hidden; if (!panel.hidden) renderPanel(); });

    function paintCount() {
      var c = btn.querySelector('.hl-count');
      c.textContent = list.length ? String(list.length) : '';
      btn.classList.toggle('on', list.length > 0);
    }
    function renderPanel() {
      if (panel.hidden) return;
      panel.innerHTML = '<div class="hl-head"><b>Highlights on this page</b><button type="button" class="hl-close" aria-label="Close">×</button></div>';
      panel.querySelector('.hl-close').addEventListener('click', function () { panel.hidden = true; });
      if (!list.length) {
        panel.insertAdjacentHTML('beforeend', '<p class="hl-empty">Nothing yet. Select any text on the page and pick a colour.</p>');
        return;
      }
      // in page order, not creation order
      var order = Array.prototype.map.call(document.querySelectorAll('.topic'), function (t) { return t.dataset.id; });
      var sorted = list.slice().sort(function (a, b) { return (order.indexOf(a.t) - order.indexOf(b.t)) || (a.s - b.s); });
      sorted.forEach(function (h) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'hl-item';
        var topic = document.querySelector('.topic[data-id="' + h.t + '"]');
        var where = topic ? topic.dataset.name : '';
        row.innerHTML = '<span class="dot hl-' + h.c + '"></span><span class="hl-txt"></span><span class="hl-where"></span>';
        row.querySelector('.hl-txt').textContent = h.x;
        row.querySelector('.hl-where').textContent = where;
        row.addEventListener('click', function () {
          var m = marksOf(h.id)[0];
          if (!m) return;
          if (topic && topic.hidden) { alert('This section is marked done and hidden. Switch the top bar to All to see it.'); return; }
          var ans = m.closest('.answer');
          if (ans && ans.hidden) { var ab = ans.previousElementSibling; if (ab && ab.classList.contains('ans-btn')) ab.click(); }
          m.scrollIntoView({ behavior: 'smooth', block: 'center' });
          Array.prototype.forEach.call(marksOf(h.id), function (el) {
            el.classList.add('hl-flash');
            setTimeout(function () { el.classList.remove('hl-flash'); }, 1400);
          });
        });
        panel.appendChild(row);
      });
      var clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'hl-clear';
      clear.textContent = 'Clear all highlights on this page';
      clear.addEventListener('click', function () {
        if (!confirm('Remove all ' + list.length + ' highlights on this page?')) return;
        list.forEach(function (h) { unwrap(h.id); });
        list = [];
        save();
      });
      panel.appendChild(clear);
    }
    paintCount();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var wrap = document.querySelector('main .wrap');
    if (!wrap) return;
    var unit = document.body.getAttribute('data-unit');
    var isUnit = unit && unit !== '0';

    /* ---------- toolbar ---------- */
    // "Unit 2A · Individual Behaviour & Personality", built from the current sidebar entry
    var cur = document.querySelector('.side-unit.current');
    var label = 'Business Policy & Strategic Management · Start here';

    /* ---------- short-video links ---------- */
    // <a class="vid" data-q="..."> becomes a YouTube search filtered to videos under 4 minutes,
    // so whatever comes up stays at the basic level.
    Array.prototype.forEach.call(document.querySelectorAll('a.vid[data-q]'), function (a) {
      a.href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(a.getAttribute('data-q')) +
        '&sp=EgIYAQ%253D%253D';
      a.target = '_blank';
      a.rel = 'noopener';
      if (!a.textContent.trim()) a.textContent = 'Watch a short video (under 4 min)';
    });

    /* ---------- home page: progress on each chapter card ---------- */
    Array.prototype.forEach.call(document.querySelectorAll('.unit-card[data-page]'), function (c) {
      var p = c.getAttribute('data-page');
      var tot = store.get('total:' + p), dn = store.get('done:' + p);
      var el = document.createElement('span');
      el.className = 'uc-prog';
      el.textContent = tot ? (dn || 0) + ' of ' + tot + ' sections done' : 'Not started';
      c.appendChild(el);
    });
    if (document.body.getAttribute('data-title')) {
      label = document.body.getAttribute('data-title');
    } else if (cur && isUnit) {
      var code = cur.querySelector('.su-n').textContent.replace('U', '').replace('·', '');
      label = 'Unit ' + code + ' · ' + cur.lastElementChild.textContent.trim();
    }

    var bar = document.createElement('div');
    bar.className = 'study-bar';
    bar.innerHTML =
      '<button type="button" class="sb-icon" id="sbNav"></button>' +
      '<span class="sb-title"></span>' +
      '<span class="sb-spacer"></span>' +
      (isUnit
        ? '<span class="sb-count" id="sbProg"></span>' +
          '<div class="sb-seg" role="group" aria-label="Show sections">' +
            '<button type="button" data-f="all">All</button>' +
            '<button type="button" data-f="undone">Undone</button>' +
          '</div>'
        : '') +
      '<button type="button" class="sb-icon" id="sbTheme"></button>' +
      (isUnit ? '<span class="sb-meter"><span id="sbMeter"></span></span>' : '');
    wrap.parentNode.insertBefore(bar, wrap);
    bar.querySelector('.sb-title').textContent = label;

    var themeBtn = bar.querySelector('#sbTheme');
    function paintTheme() {
      var dark = root.getAttribute('data-theme') === 'dark';
      themeBtn.innerHTML = dark ? ICON.sun : ICON.moon;
      themeBtn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
      themeBtn.setAttribute('aria-label', themeBtn.title);
    }
    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store.set('theme', next);
      paintTheme();
    });
    paintTheme();

    var navBtn = bar.querySelector('#sbNav');
    navBtn.innerHTML = ICON.panel;
    function paintNav() {
      var hidden = root.classList.contains('nav-hidden');
      navBtn.title = hidden ? 'Show contents' : 'Hide contents';
      navBtn.setAttribute('aria-label', navBtn.title);
      navBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
      navBtn.classList.toggle('on', !hidden);
    }
    navBtn.addEventListener('click', function () {
      var hidden = root.classList.toggle('nav-hidden');
      store.set('navHidden', hidden ? '1' : '0');
      paintNav();
      if (!hidden && narrow.matches) window.scrollTo(0, 0);
    });
    paintNav();

    // on a phone, picking a section from the sidebar closes it and lands on the section
    Array.prototype.forEach.call(document.querySelectorAll('.side-toc a'), function (a) {
      a.addEventListener('click', function (e) {
        if (!narrow.matches) return;
        var target = document.getElementById(a.getAttribute('href').slice(1));
        if (!target) return;
        e.preventDefault();
        root.classList.add('nav-hidden');
        store.set('navHidden', '1');
        paintNav();
        history.replaceState(null, '', a.getAttribute('href'));
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    });

    /* ---------- show / hide answer buttons (question bank) ---------- */
    Array.prototype.forEach.call(document.querySelectorAll('.answer'), function (ans) {
      ans.hidden = true;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ans-btn';
      btn.textContent = 'Show answer';
      btn.setAttribute('aria-expanded', 'false');
      ans.parentNode.insertBefore(btn, ans);
      btn.addEventListener('click', function () {
        var open = ans.hidden;
        ans.hidden = !open;
        btn.textContent = open ? 'Hide answer' : 'Show answer';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.classList.toggle('open', open);
      });
    });

    if (!isUnit) return;

    /* ---------- split the page into sections ---------- */
    // A new section starts at every numbered h2 and every h3 that has an id
    // (the sidebar sub-entries, e.g. 4.4 Roles / Norms, 5.1 to 5.5).
    var topics = [];
    var current = null;
    Array.prototype.slice.call(wrap.children).forEach(function (el) {
      if (el.classList.contains('pager')) { current = null; return; }
      // a heading without an id (e.g. "Section A · 5 marks") is a divider, not a trackable section
      if (el.matches('h2.sec:not([id])')) { current = null; return; }
      var starts = (el.matches('h2.sec[id]') || el.matches('h3[id]'));
      if (starts) {
        current = document.createElement('section');
        current.className = 'topic';
        current.dataset.id = el.id;
        wrap.insertBefore(current, el);
        topics.push(current);
      }
      if (current) current.appendChild(el);
    });

    var empty = document.createElement('div');
    empty.className = 'box key all-done';
    empty.innerHTML = '<span class="box-label">Nothing left here</span>' +
      '<p>Every section on this page is marked done. Switch to <strong>All</strong> to see the full page again.</p>';
    var pager = wrap.querySelector('.pager');
    wrap.insertBefore(empty, pager);

    function isDone(id) { return store.get(page + ':' + id) === '1'; }

    // short name for the done row, e.g. "1.4" or "Roles"
    function shortName(t) {
      var h = t.firstElementChild;
      var num = h.querySelector('.num');
      if (num) return num.textContent.trim();
      var txt = h.textContent.replace(/\s+/g, ' ').trim();
      var m = txt.match(/^(\d+\.\d+)/);
      if (m) return m[1];
      return txt.replace(/^Property \d+ · /, '').replace(/ · .*$/, '');
    }

    topics.forEach(function (t) {
      var id = t.dataset.id;
      t.dataset.name = shortName(t);
      var foot = document.createElement('div');
      foot.className = 'done-bar';
      foot.innerHTML = '<button type="button" class="done-btn">' +
        '<span class="done-box">' + ICON.check + '</span><span class="done-lbl"></span></button>';
      t.appendChild(foot);
      foot.querySelector('button').addEventListener('click', function () {
        if (isDone(id)) store.del(page + ':' + id); else store.set(page + ':' + id, '1');
        var nowDone = isDone(id);
        paintTopic(t);
        paintProgress();
        if (nowDone && filterOn()) {
          // brief pause so you can see it register before it drops out
          t.classList.add('leaving');
          setTimeout(function () { t.classList.remove('leaving'); applyFilter(); }, 550);
        } else {
          applyFilter();
        }
      });
      paintTopic(t);
    });

    function tocLink(id) {
      return document.querySelector('.side-toc a[href="#' + id + '"]');
    }

    function paintTopic(t) {
      var done = isDone(t.dataset.id);
      t.classList.toggle('is-done', done);
      var b = t.querySelector('.done-bar .done-btn');
      b.querySelector('.done-lbl').textContent = done
        ? t.dataset.name + ' done'
        : 'Mark ' + t.dataset.name + ' as done';
      b.title = done ? 'Click to mark as not done' : '';
      b.setAttribute('aria-pressed', done ? 'true' : 'false');
      var a = tocLink(t.dataset.id);
      if (a) a.classList.toggle('toc-done', done);
    }

    var prog = bar.querySelector('#sbProg');
    var meter = bar.querySelector('#sbMeter');
    function paintProgress() {
      var n = topics.filter(function (t) { return isDone(t.dataset.id); }).length;
      prog.textContent = n + ' of ' + topics.length + ' done';
      store.set('total:' + page, String(topics.length));
      store.set('done:' + page, String(n));
      meter.style.width = (topics.length ? (100 * n / topics.length) : 0) + '%';
    }

    /* ---------- All / Undone switch ---------- */
    var segBtns = bar.querySelectorAll('.sb-seg button');
    function filterOn() { return document.body.classList.contains('undone-only'); }
    function applyFilter() {
      var on = filterOn();
      var left = 0;
      topics.forEach(function (t) {
        var hide = on && isDone(t.dataset.id);
        t.hidden = hide;
        if (!hide) left++;
        var a = tocLink(t.dataset.id);
        if (a) a.parentNode.hidden = hide;
      });
      empty.hidden = !(on && left === 0);
      Array.prototype.forEach.call(segBtns, function (b) {
        var active = (b.dataset.f === 'undone') === on;
        b.classList.toggle('on', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    Array.prototype.forEach.call(segBtns, function (b) {
      b.addEventListener('click', function () {
        var want = b.dataset.f === 'undone';
        if (want === filterOn()) return;
        document.body.classList.toggle('undone-only', want);
        if (want) store.set('filter', '1'); else store.del('filter');
        applyFilter();
        window.scrollTo(0, 0);
      });
    });

    if (store.get('filter') === '1') document.body.classList.add('undone-only');
    paintProgress();
    applyFilter();

    initHighlighter(bar);

    // the done bars shift content down, so re-land on a #section link
    if (location.hash) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
})();
