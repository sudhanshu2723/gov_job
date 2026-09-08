/* Triage logic shared by notifications.html and applied.html.
 *
 * State lives in localStorage because the site is static on GitHub Pages -
 * there is no server to write decisions back to. Consequences worth knowing:
 * decisions are per-browser, do not sync between devices, and are lost if
 * site data is cleared. Everything below is wrapped so a blocked or full
 * localStorage degrades to "no decisions recorded" rather than a blank page.
 *
 * Each decision stores a snapshot of the listing, so the Applied page still
 * renders correctly even if a posting later drops out of listings.json.
 */
(function (global) {
  'use strict';

  var KEY = 'govjob.decisions.v1';
  var FEED = 'data/listings.json';

  /* ---------- persistence ---------- */

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};                       // private mode, blocked storage, bad JSON
    }
  }

  function save(map) {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      return false;                    // quota exceeded or storage disabled
    }
  }

  /* ---------- helpers ---------- */

  var fmt = function (n) { return n.toLocaleString('en-IN'); };

  function ago(iso) {
    var h = Math.round((Date.now() - new Date(iso)) / 3.6e6);
    if (h < 1) return 'just now';
    if (h < 24) return h + 'h ago';
    var d = Math.round(h / 24);
    return d + ' day' + (d > 1 ? 's' : '') + ' ago';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function el(id) { return document.getElementById(id); }

  /* ---------- app ---------- */

  function Triage(mode) {
    this.mode = mode;                  // 'inbox' | 'applied'
    this.decisions = load();
    this.feed = null;
    this.latest = '';
    this.cseOnly = false;
    this.newOnly = false;
    this.lastAction = null;            // for undo
  }

  Triage.prototype.start = function () {
    var self = this;
    fetch(FEED, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (d) {
        self.feed = d;
        self.latest = d.listings.reduce(function (m, r) {
          return r.first_seen > m ? r.first_seen : m;
        }, '');
        self.bind();
        self.render();
      })
      .catch(function () {
        el('list').innerHTML =
          '<div class="empty"><b>Listings unavailable</b>' +
          'This page reads <code>data/listings.json</code>, so it needs the site to be served over ' +
          'HTTP. Run <code>python serve.py</code> and open <b>localhost:3000</b>, or use the ' +
          'published GitHub Pages URL.</div>';
        if (el('meta')) el('meta').textContent = '';
      });
  };

  Triage.prototype.bind = function () {
    var self = this;
    var cse = el('fCse'), nw = el('fNew');
    if (cse) cse.addEventListener('click', function () {
      self.cseOnly = !self.cseOnly;
      this.setAttribute('aria-pressed', self.cseOnly);
      self.render();
    });
    if (nw) nw.addEventListener('click', function () {
      self.newOnly = !self.newOnly;
      this.setAttribute('aria-pressed', self.newOnly);
      self.render();
    });
    el('list').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (!b) return;
      self.decide(b.dataset.url, b.dataset.act);
    });
    var u = el('undoBtn');
    if (u) u.addEventListener('click', function () { self.undo(); });
    var r = el('restoreBtn');
    if (r) r.addEventListener('click', function () { self.restoreRejected(); });
  };

  /* jobs that have not been decided on yet */
  Triage.prototype.pending = function () {
    var self = this;
    return this.feed.listings.filter(function (r) {
      return r.is_job && !self.decisions[r.url];
    });
  };

  Triage.prototype.applied = function () {
    var self = this;
    return Object.keys(this.decisions)
      .filter(function (u) { return self.decisions[u].status === 'applied'; })
      .map(function (u) { return self.decisions[u]; })
      .sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
  };

  Triage.prototype.rejectedCount = function () {
    var self = this;
    return Object.keys(this.decisions).filter(function (u) {
      return self.decisions[u].status === 'rejected';
    }).length;
  };

  Triage.prototype.decide = function (url, act) {
    var row = this.feed.listings.find(function (r) { return r.url === url; });
    if (!row) return;
    this.decisions[url] = {
      status: act === 'yes' ? 'applied' : 'rejected',
      at: new Date().toISOString(),
      title: row.title,
      url: row.url,
      vacancies: row.vacancies,
      tags: row.tags
    };
    var ok = save(this.decisions);
    this.lastAction = { url: url, act: act };
    this.render();
    this.showUndo(act, ok);
  };

  Triage.prototype.undo = function () {
    if (!this.lastAction) return;
    delete this.decisions[this.lastAction.url];
    save(this.decisions);
    this.lastAction = null;
    this.render();
    el('undo').hidden = true;
  };

  Triage.prototype.restoreRejected = function () {
    var self = this;
    Object.keys(this.decisions).forEach(function (u) {
      if (self.decisions[u].status === 'rejected') delete self.decisions[u];
    });
    save(this.decisions);
    this.render();
  };

  Triage.prototype.showUndo = function (act, saved) {
    var bar = el('undo');
    if (!bar) return;
    el('undoMsg').textContent = !saved
      ? 'Could not save — browser storage is blocked, so this decision will not persist.'
      : (act === 'yes' ? 'Moved to Applied.' : 'Rejected and removed from the inbox.');
    bar.hidden = false;
  };

  Triage.prototype.render = function () {
    var self = this;
    var rows;

    if (this.mode === 'inbox') {
      rows = this.pending();
      if (this.cseOnly) rows = rows.filter(function (r) {
        return r.tags.length && !r.sub_graduate;
      });
      if (this.newOnly) rows = rows.filter(function (r) {
        return r.first_seen === self.latest;
      });
      rows.sort(function (a, b) {
        return (b.first_seen || '').localeCompare(a.first_seen || '')
            || (b.vacancies || 0) - (a.vacancies || 0);
      });
    } else {
      rows = this.applied();
    }

    el('list').innerHTML = rows.length
      ? rows.map(function (r) { return self.card(r); }).join('')
      : this.emptyState();

    this.chrome(rows.length);
  };

  Triage.prototype.card = function (r) {
    var isNew = r.first_seen === this.latest;
    var acts = this.mode === 'inbox'
      ? '<button class="btn btn-yes" data-act="yes" data-url="' + esc(r.url) + '">Accept</button>' +
        '<button class="btn btn-no"  data-act="no"  data-url="' + esc(r.url) + '">Reject</button>'
      : '<button class="btn btn-plain" data-act="undo" data-url="' + esc(r.url) + '">Back to inbox</button>';

    return '<div class="item">' +
      '<span class="vac' + (r.vacancies ? '' : ' none') + '">' +
        (r.vacancies ? fmt(r.vacancies) : '—') + '</span>' +
      '<span>' +
        '<h3><a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(r.title) + '</a></h3>' +
        '<span class="tags">' +
          (this.mode === 'inbox' && isNew ? '<span class="tag new">new today</span>' : '') +
          (this.mode === 'applied' && r.at
            ? '<span class="tag">accepted ' + ago(r.at) + '</span>' : '') +
          (r.tags || []).map(function (t) {
            return '<span class="tag ' + t + '">' + t + '</span>';
          }).join('') +
          (r.sub_graduate ? '<span class="tag sub">below graduate</span>' : '') +
        '</span>' +
      '</span>' +
      '<span class="acts">' + acts + '</span>' +
    '</div>';
  };

  Triage.prototype.emptyState = function () {
    if (this.mode === 'applied') {
      return '<div class="empty"><b>Nothing accepted yet</b>' +
        'Postings you accept in <a href="notifications.html">Notifications</a> collect here.</div>';
    }
    var anyFilter = this.cseOnly || this.newOnly;
    return '<div class="empty"><b>' +
      (anyFilter ? 'Nothing matches these filters' : 'Inbox clear') + '</b>' +
      (anyFilter
        ? 'Turn off a filter to see the rest.'
        : 'Every current posting has been accepted or rejected. New ones appear here after the ' +
          'next daily scrape.') + '</div>';
  };

  /* counts in the nav, the meta line, and the restore affordance */
  Triage.prototype.chrome = function (shown) {
    var pend = this.pending().length,
        app = this.applied().length,
        rej = this.rejectedCount();

    if (el('nInbox')) el('nInbox').textContent = pend ? ' ' + pend : '';
    if (el('nApplied')) el('nApplied').textContent = app ? ' ' + app : '';

    if (el('meta')) {
      el('meta').innerHTML = this.mode === 'inbox'
        ? shown + ' shown · ' + pend + ' undecided · ' + app + ' applied · ' + rej + ' rejected'
        : app + ' accepted';
    }
    if (el('updated') && this.feed) {
      el('updated').innerHTML = 'Listings last scraped <b>' + ago(this.feed.fetched_at) +
        '</b> · refreshes daily at 07:30 IST';
    }
    var fn = el('restoreWrap');
    if (fn) fn.hidden = !(this.mode === 'inbox' && rej > 0);
    if (el('rejCount')) el('rejCount').textContent = rej;
  };

  /* applied page: "back to inbox" reuses the same click handler */
  var origDecide = Triage.prototype.decide;
  Triage.prototype.decide = function (url, act) {
    if (act === 'undo') {
      delete this.decisions[url];
      save(this.decisions);
      this.render();
      return;
    }
    origDecide.call(this, url, act);
  };

  global.Triage = Triage;
})(window);
