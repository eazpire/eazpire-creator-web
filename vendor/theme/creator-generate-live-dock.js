/**
 * Floating live-generate dock — stream partials, Save / Discard after complete.
 */
(function (global) {
  "use strict";

  var jobs = [];
  var activeId = null;
  var minimized = false;
  var root = null;
  var dragState = null;

  function t(key, fallback) {
    var i18n = global.CreatorI18n || {};
    var aliases = {
      liveGenOpen: ["liveGenOpen", "live_gen_open", "creator.generator.live_gen_open"],
      liveGenMinimize: ["liveGenMinimize", "live_gen_minimize", "creator.generator.live_gen_minimize"],
      liveGenGenerating: ["liveGenGenerating", "live_gen_generating", "creator.generator.live_gen_generating"],
      liveGenGeneratingShort: ["liveGenGeneratingShort", "live_gen_generating_short", "creator.generator.live_gen_generating_short"],
      liveGenReady: ["liveGenReady", "live_gen_ready", "creator.generator.live_gen_ready"],
      liveGenReadyShort: ["liveGenReadyShort", "live_gen_ready_short", "creator.generator.live_gen_ready_short"],
      liveGenError: ["liveGenError", "live_gen_error", "creator.generator.live_gen_error"],
      liveGenSave: ["liveGenSave", "live_gen_save", "creator.generator.live_gen_save"],
      liveGenDiscard: ["liveGenDiscard", "live_gen_discard", "creator.generator.live_gen_discard"],
      liveGenHistoryEmptyPrompt: ["liveGenHistoryEmptyPrompt", "history_empty_prompt", "creator.generator.history_empty_prompt"],
    };
    var keys = aliases[key] || [key];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof i18n[k] === "string" && i18n[k] && i18n[k].indexOf("Translation missing") === -1) return i18n[k];
    }
    if (i18n.generator && typeof i18n.generator[keys[1]] === "string" && i18n.generator[keys[1]]) {
      return i18n.generator[keys[1]];
    }
    return fallback;
  }

  function apiBase() {
    var base = (global.CREATOR_API_CONFIG && global.CREATOR_API_CONFIG.BASE_URL)
      ? global.CREATOR_API_CONFIG.BASE_URL
      : "https://creator-engine.eazpire.workers.dev";
    return base.replace(/\/$/, "") + "/apps/creator-dispatch";
  }

  function ownerId() {
    return String(
      global.__EAZ_OWNER_ID ||
        global.CREATOR_OWNER_ID ||
        (global.CreatorPortalAuth && global.CreatorPortalAuth.ownerId) ||
        ""
    ).trim();
  }

  function ensureRoot() {
    if (root && document.body.contains(root)) return root;
    root = document.createElement("div");
    root.className = "cgl-root";
    root.hidden = true;
    root.innerHTML =
      '<button type="button" class="cgl-fab" data-cgl-fab hidden aria-label="' +
      t("liveGenOpen", "Open generation") +
      '">' +
      '<span class="cgl-fab__icon" data-cgl-fab-icon></span>' +
      '<span class="cgl-fab__count" data-cgl-fab-count hidden></span>' +
      "</button>" +
      '<div class="cgl-dock" data-cgl-dock hidden>' +
      '<div class="cgl-dock__head">' +
      '<span class="cgl-dock__title" data-cgl-title></span>' +
      '<button type="button" class="cgl-dock__min" data-cgl-min aria-label="' +
      t("liveGenMinimize", "Minimize") +
      '">─</button>' +
      "</div>" +
      '<div class="cgl-dock__carousel" data-cgl-carousel></div>' +
      "</div>";
    document.body.appendChild(root);
    bindRoot(root);
    restoreFabPos();
    return root;
  }

  function bindRoot(el) {
    var fab = el.querySelector("[data-cgl-fab]");
    var minBtn = el.querySelector("[data-cgl-min]");
    fab.addEventListener("click", function (e) {
      if (fab.dataset.dragged === "1") {
        e.preventDefault();
        fab.dataset.dragged = "0";
        return;
      }
      minimized = false;
      render();
    });
    minBtn.addEventListener("click", function () {
      minimized = true;
      render();
    });
    bindFabDrag(fab);
  }

  function bindFabDrag(fab) {
    fab.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      dragState = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        sl: fab.offsetLeft,
        st: fab.offsetTop,
        moved: false,
      };
      fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener("pointermove", function (e) {
      if (!dragState || dragState.id !== e.pointerId) return;
      var dx = e.clientX - dragState.x;
      var dy = e.clientY - dragState.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) dragState.moved = true;
      if (!dragState.moved) return;
      fab.classList.add("cgl-fab--custom");
      var left = Math.max(8, Math.min(window.innerWidth - fab.offsetWidth - 8, dragState.sl + dx));
      var top = Math.max(8, Math.min(window.innerHeight - fab.offsetHeight - 8, dragState.st + dy));
      fab.style.left = left + "px";
      fab.style.top = top + "px";
      fab.style.right = "auto";
      fab.style.bottom = "auto";
    });
    function endDrag(e) {
      if (!dragState || dragState.id !== e.pointerId) return;
      if (dragState.moved) {
        fab.dataset.dragged = "1";
        try {
          localStorage.setItem(
            "cgl_fab_pos",
            JSON.stringify({ x: parseFloat(fab.style.left), y: parseFloat(fab.style.top) })
          );
        } catch (_e) {}
      }
      dragState = null;
    }
    fab.addEventListener("pointerup", endDrag);
    fab.addEventListener("pointercancel", endDrag);
  }

  function restoreFabPos() {
    var fab = root && root.querySelector("[data-cgl-fab]");
    if (!fab) return;
    try {
      var pos = JSON.parse(localStorage.getItem("cgl_fab_pos") || "null");
      if (pos && isFinite(pos.x) && isFinite(pos.y)) {
        fab.classList.add("cgl-fab--custom");
        fab.style.left = pos.x + "px";
        fab.style.top = pos.y + "px";
        fab.style.right = "auto";
        fab.style.bottom = "auto";
      }
    } catch (_e) {}
  }

  function visibleJobs() {
    return jobs.filter(function (j) {
      return j && !j.removed && j.status !== "discarded" && j.status !== "saved";
    });
  }

  function findJob(id) {
    return jobs.find(function (j) {
      return j.jobId === id;
    });
  }

  function setStatus(job, status, extra) {
    job.status = status;
    if (extra) Object.assign(job, extra);
    render();
  }

  function streamJob(job) {
    var u = new URL(apiBase());
    u.searchParams.set("op", "generate-live-stream");
    u.searchParams.set("job_id", job.jobId);
    var oid = ownerId();
    if (oid) {
      u.searchParams.set("owner_id", oid);
      u.searchParams.set("logged_in_customer_id", oid);
    }
    job.abort = new AbortController();
    fetch(u.toString(), { credentials: "include", signal: job.abort.signal })
      .then(function (res) {
        if (!res.ok || !res.body) throw new Error("stream_http_" + res.status);
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (chunk) {
            if (chunk.done) return;
            buf += decoder.decode(chunk.value, { stream: true });
            var lines = buf.split("\n");
            buf = lines.pop() || "";
            lines.forEach(function (line) {
              if (!line.trim()) return;
              try {
                var ev = JSON.parse(line);
                handleEvent(job, ev);
              } catch (_e) {}
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        setStatus(job, "error", { error: (err && err.message) || "stream_failed" });
      });
  }

  function handleEvent(job, ev) {
    if (!ev || ev.job_id && ev.job_id !== job.jobId) return;
    if (ev.type === "partial" && ev.image && ev.image.url) {
      setStatus(job, "partial", { previewUrl: ev.image.url });
    } else if (ev.type === "completed") {
      setStatus(job, "ready", {
        previewUrl: ev.image && ev.image.url,
        awaitingSave: true,
      });
    } else if (ev.type === "error") {
      setStatus(job, "error", { error: ev.message || "error" });
    }
  }

  function saveJob(job) {
    job.busy = true;
    render();
    var oid = ownerId();
    fetch(apiBase() + "?op=save-design", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: job.jobId,
        owner_id: oid,
        library_status: "inactive",
      }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok && data && data.ok !== false, data: data };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error((res.data && (res.data.message || res.data.error)) || "save_failed");
        setStatus(job, "saved", { busy: false, removed: true });
        prune();
      })
      .catch(function (err) {
        setStatus(job, "ready", { busy: false, error: err.message });
      });
  }

  function discardJob(job) {
    job.busy = true;
    render();
    if (job.abort) try { job.abort.abort(); } catch (_e) {}
    if (job.pending) {
      setStatus(job, "discarded", { busy: false, removed: true });
      prune();
      return;
    }
    fetch(apiBase() + "?op=discard-generated-job", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.jobId, owner_id: ownerId() }),
    })
      .catch(function () {})
      .finally(function () {
        setStatus(job, "discarded", { busy: false, removed: true });
        prune();
      });
  }

  function prune() {
    jobs = jobs.filter(function (j) {
      return !j.removed;
    });
    if (activeId && !findJob(activeId)) {
      activeId = jobs[0] ? jobs[0].jobId : null;
    }
    render();
  }

  function render() {
    var el = ensureRoot();
    var vis = visibleJobs();
    var fab = el.querySelector("[data-cgl-fab]");
    var dock = el.querySelector("[data-cgl-dock]");
    var countEl = el.querySelector("[data-cgl-fab-count]");
    var iconEl = el.querySelector("[data-cgl-fab-icon]");
    var titleEl = el.querySelector("[data-cgl-title]");
    var carousel = el.querySelector("[data-cgl-carousel]");
    if (!vis.length) {
      el.hidden = true;
      fab.hidden = true;
      dock.hidden = true;
      return;
    }
    el.hidden = false;
    var running = vis.filter(function (j) {
      return j.status === "generating" || j.status === "partial";
    }).length;
    var ready = vis.filter(function (j) {
      return j.status === "ready";
    }).length;
    fab.hidden = false;
    countEl.hidden = vis.length < 2;
    countEl.textContent = String(vis.length);
    iconEl.textContent = running ? "…" : ready ? "✓" : "!";
    fab.classList.toggle("is-ready", running === 0 && ready > 0);
    fab.classList.toggle("is-busy", running > 0);
    if (minimized) {
      dock.hidden = true;
      return;
    }
    dock.hidden = false;
    titleEl.textContent =
      running > 0
        ? t("liveGenGenerating", "Generating…")
        : t("liveGenReady", "Generation complete");
    if (!activeId || !vis.some(function (j) { return j.jobId === activeId; })) {
      activeId = vis[0].jobId;
    }
    carousel.innerHTML = "";
    vis.forEach(function (job, idx) {
      var card = document.createElement("article");
      card.className = "cgl-card" + (job.jobId === activeId ? " is-active" : "");
      var img = job.previewUrl
        ? '<img class="cgl-card__img" alt="" src="' + job.previewUrl.replace(/"/g, "") + '">'
        : '<div class="cgl-card__ph"></div>';
      var prompt = (job.prompt || "").slice(0, 72);
      var status =
        job.status === "ready"
          ? t("liveGenReadyShort", "Done")
          : job.status === "error"
            ? t("liveGenError", "Error")
            : t("liveGenGeneratingShort", "Live");
      card.innerHTML =
        img +
        '<div class="cgl-card__meta">' +
        '<div class="cgl-card__status">' +
        status +
        (vis.length > 1 ? " · " + (idx + 1) + "/" + vis.length : "") +
        "</div>" +
        '<div class="cgl-card__prompt">' +
        escapeHtml(prompt || t("liveGenHistoryEmptyPrompt", "No prompt")) +
        "</div>" +
        (job.error ? '<div class="cgl-card__err">' + escapeHtml(job.error) + "</div>" : "") +
        (job.status === "ready"
          ? '<div class="cgl-card__actions">' +
            '<button type="button" class="cgl-btn cgl-btn--save" data-cgl-save>' +
            t("liveGenSave", "Save") +
            "</button>" +
            '<button type="button" class="cgl-btn" data-cgl-discard>' +
            t("liveGenDiscard", "Discard") +
            "</button>" +
            "</div>"
          : "") +
        "</div>";
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-cgl-save],[data-cgl-discard]")) return;
        activeId = job.jobId;
        render();
      });
      var saveBtn = card.querySelector("[data-cgl-save]");
      var discBtn = card.querySelector("[data-cgl-discard]");
      if (saveBtn) {
        saveBtn.disabled = !!job.busy;
        saveBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          saveJob(job);
        });
      }
      if (discBtn) {
        discBtn.disabled = !!job.busy;
        discBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          discardJob(job);
        });
      }
      carousel.appendChild(card);
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function attach(opts) {
    opts = opts || {};
    var jobId = String(opts.jobId || "").trim();
    if (!jobId) return;
    if (findJob(jobId)) {
      minimized = false;
      activeId = jobId;
      render();
      return;
    }
    var job = {
      jobId: jobId,
      prompt: opts.prompt || "",
      status: "generating",
      previewUrl: "",
      liveStream: opts.liveStream !== false,
    };
    jobs.push(job);
    activeId = jobId;
    minimized = false;
    render();
    if (job.liveStream) streamJob(job);
  }

  function attachPending(opts) {
    opts = opts || {};
    var id = "pending_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8);
    var job = {
      jobId: id,
      prompt: opts.prompt || "",
      status: "generating",
      previewUrl: "",
      liveStream: false,
      pending: true,
    };
    jobs.push(job);
    activeId = id;
    minimized = false;
    render();
    return id;
  }

  function promote(pendingId, opts) {
    opts = opts || {};
    var jobId = String(opts.jobId || "").trim();
    var job = findJob(pendingId);
    if (!jobId) {
      drop(pendingId);
      return;
    }
    if (!job) {
      attach({ jobId: jobId, prompt: opts.prompt || "", liveStream: opts.liveStream !== false });
      return;
    }
    job.jobId = jobId;
    job.prompt = opts.prompt != null ? opts.prompt : job.prompt;
    job.pending = false;
    job.liveStream = opts.liveStream !== false;
    if (activeId === pendingId) activeId = jobId;
    render();
    if (job.liveStream) streamJob(job);
  }

  function drop(pendingId) {
    var job = findJob(pendingId);
    if (!job) return;
    if (job.abort) try { job.abort.abort(); } catch (_e) {}
    job.removed = true;
    prune();
  }

  global.CreatorGenerateLiveDock = {
    attach: attach,
    attachPending: attachPending,
    promote: promote,
    drop: drop,
    minimize: function () {
      minimized = true;
      render();
    },
  };
})(typeof window !== "undefined" ? window : this);
