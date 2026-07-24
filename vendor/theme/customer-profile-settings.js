(function () {
  "use strict";

  if (window.__customerProfileSettingsLoaded) return;
  window.__customerProfileSettingsLoaded = true;

  var API_BASE = (function () {
    if (window.__CREATOR_PORTAL_HOST__) {
      return (window.location.origin || "").replace(/\/$/, "") + "/api/dispatch";
    }
    if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) {
      return window.CREATOR_API_CONFIG.BASE_URL + "/apps/creator-dispatch";
    }
    return "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  })();

  function getOwnerId() {
    return String(
      window.__EAZ_OWNER_ID ||
      window.ownerId ||
      (window.Shopify && window.Shopify.customerId) ||
      ""
    );
  }

  function isLoggedIn() {
    return !!getOwnerId();
  }

  function setStatus(root, text, kind) {
    var el = root.querySelector("[data-cps-status]");
    if (!el) return;
    el.classList.remove("is-success", "is-error");
    if (kind === "success") el.classList.add("is-success");
    if (kind === "error") el.classList.add("is-error");
    el.textContent = text || "";
  }

  function setGender(root, value) {
    var hidden = root.querySelector('[data-cps-input="gender"]');
    if (hidden) hidden.value = value || "";

    var buttons = root.querySelectorAll("[data-cps-gender-btn]");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var active = btn.getAttribute("data-cps-gender-btn") === value;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function setLoading(root, loading) {
    var buttons = getSaveButtons(root);
    for (var i = 0; i < buttons.length; i++) {
      if (loading) buttons[i].disabled = true;
      else updateDirtyState(root);
    }
  }

  function getSaveButtons(root) {
    var list = [];
    var inline = root.querySelectorAll("[data-cps-save-btn]");
    for (var i = 0; i < inline.length; i++) list.push(inline[i]);
    var panel = root.closest('[data-csm-panel="profile"]');
    if (panel) {
      var footerBtn = panel.querySelector(".csm-profile-footer [data-cps-save-btn]");
      if (footerBtn && list.indexOf(footerBtn) < 0) list.push(footerBtn);
    }
    return list;
  }

  function setFooterStatus(root, text, kind) {
    var panel = root.closest('[data-csm-panel="profile"]');
    var el = panel ? panel.querySelector("[data-cps-footer-status]") : null;
    if (!el) return;
    el.classList.remove("is-success", "is-error");
    if (kind === "success") el.classList.add("is-success");
    if (kind === "error") el.classList.add("is-error");
    el.textContent = text || "";
  }

  var FIELD_LABEL_ATTR = {
    first_name: "data-label-first-name",
    last_name: "data-label-last-name",
    address_line: "data-label-address",
    city: "data-label-city",
    country: "data-label-country",
    birth_date: "data-label-birth-date",
    gender: "data-label-gender",
    username: "data-label-username"
  };

  function getSnapshot(root) {
    var payload = getPayload(root);
    var usernameInput = root.querySelector('[data-cps-input="username"]');
    return {
      first_name: payload.first_name,
      last_name: payload.last_name,
      address_line: payload.address_line,
      city: payload.city,
      country: payload.country,
      birth_date: payload.birth_date,
      gender: payload.gender,
      username: usernameInput ? String(usernameInput.value || "").trim() : "",
      profile_picture_url: root.__cpsSavedAvatarUrl || ""
    };
  }

  function commitSnapshot(root) {
    root.__cpsSavedSnapshot = getSnapshot(root);
    updateDirtyState(root);
  }

  function snapshotsEqual(a, b) {
    if (!a || !b) return true;
    var keys = Object.keys(a);
    for (var i = 0; i < keys.length; i++) {
      if (String(a[keys[i]] || "") !== String(b[keys[i]] || "")) return false;
    }
    return true;
  }

  function isDirty(root) {
    if (!root || !root.__cpsSavedSnapshot) return false;
    return !snapshotsEqual(getSnapshot(root), root.__cpsSavedSnapshot);
  }

  function getFieldLabel(root, key) {
    var attr = FIELD_LABEL_ATTR[key];
    if (attr && root.getAttribute(attr)) return root.getAttribute(attr);
    var defaults = {
      first_name: "First name",
      last_name: "Last name",
      address_line: "Address",
      city: "City",
      country: "Country",
      birth_date: "Birth date",
      gender: "Gender",
      username: "Username",
      profile_picture_url: "Profile picture"
    };
    return defaults[key] || key;
  }

  function getChangedFields(root) {
    var saved = root.__cpsSavedSnapshot || {};
    var current = getSnapshot(root);
    var changed = [];
    var keys = Object.keys(current);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (String(saved[key] || "") !== String(current[key] || "")) {
        changed.push({ key: key, label: getFieldLabel(root, key) });
      }
    }
    return changed;
  }

  function updateDirtyState(root) {
    var dirty = isDirty(root);
    var buttons = getSaveButtons(root);
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = !dirty;
    }
    root.__cpsDirty = dirty;
  }

  function setAvatarPreview(root, url) {
    var img = root.querySelector("[data-cps-avatar-img]");
    var placeholder = root.querySelector("[data-cps-avatar-placeholder]");
    if (!img) return;
    if (url) {
      img.src = url;
      img.hidden = false;
      if (placeholder) placeholder.style.display = "none";
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      if (placeholder) placeholder.style.display = "";
    }
  }

  function bindAvatarField(root) {
    if (root.getAttribute("data-context") !== "creator") return;
    var btn = root.querySelector("[data-cps-avatar-btn]");
    var input = root.querySelector("[data-cps-avatar-input]");
    if (!btn || !input || btn.dataset.cpsAvatarBound === "1") return;
    btn.dataset.cpsAvatarBound = "1";
    btn.addEventListener("click", function () {
      input.click();
    });
    input.addEventListener("change", function () {
      if (!input.files || !input.files[0]) return;
      uploadAvatar(root, input.files[0]).finally(function () {
        input.value = "";
      });
    });
  }

  function uploadAvatar(root, file) {
    var ownerId = getOwnerId();
    if (!ownerId) return Promise.reject(new Error("missing_owner"));
    setFooterStatus(root, "", "");
    var formData = new FormData();
    formData.append("photo", file);
    return fetch(buildUrl("upload-account-profile-picture"), {
      method: "POST",
      credentials: "include",
      body: formData
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok || !data || data.ok !== true) throw new Error((data && data.error) || "upload_failed");
          return data;
        });
      })
      .then(function (data) {
        root.__cpsSavedAvatarUrl = data.profile_picture_url || "";
        setAvatarPreview(root, root.__cpsSavedAvatarUrl);
        commitSnapshot(root);
        setFooterStatus(root, root.getAttribute("data-msg-saved") || "Saved.", "success");
      })
      .catch(function () {
        setFooterStatus(
          root,
          root.getAttribute("data-msg-avatar-failed") || "Could not upload profile picture.",
          "error"
        );
      });
  }

  function bindDirtyTracking(root) {
    if (root.dataset.cpsDirtyBound === "1") return;
    root.dataset.cpsDirtyBound = "1";
    var form = root.querySelector("[data-cps-form]");
    if (!form) return;
    form.addEventListener("input", function () {
      updateDirtyState(root);
    });
    form.addEventListener("change", function () {
      updateDirtyState(root);
    });
    var genderBtns = root.querySelectorAll("[data-cps-gender-btn]");
    for (var i = 0; i < genderBtns.length; i++) {
      genderBtns[i].addEventListener("click", function () {
        setTimeout(function () {
          updateDirtyState(root);
        }, 0);
      });
    }
    var usernameInput = root.querySelector("[data-cps-username-input]");
    if (usernameInput) {
      usernameInput.addEventListener("input", function () {
        updateDirtyState(root);
      });
    }
  }

  function fillChangesList(listEl, changes) {
    if (!listEl) return;
    listEl.innerHTML = "";
    for (var i = 0; i < changes.length; i++) {
      var li = document.createElement("li");
      li.textContent = changes[i].label;
      listEl.appendChild(li);
    }
  }

  function openDialog(dialog) {
    if (!dialog || typeof dialog.showModal !== "function") return Promise.resolve(false);
    return new Promise(function (resolve) {
      dialog.__cpsResolve = resolve;
      dialog.showModal();
    });
  }

  function closeDialog(dialog, result) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    if (typeof dialog.__cpsResolve === "function") {
      dialog.__cpsResolve(result);
      dialog.__cpsResolve = null;
    }
  }

  function bindProfileDialogs() {
    if (window.__cpsDialogsBound) return;
    window.__cpsDialogsBound = true;
    var unsaved = document.querySelector("[data-cps-unsaved-dialog]");
    var confirmSave = document.querySelector("[data-cps-confirm-save-dialog]");
    if (unsaved) {
      unsaved.querySelector("[data-cps-unsaved-save]")?.addEventListener("click", function () {
        closeDialog(unsaved, "save");
      });
      unsaved.querySelector("[data-cps-unsaved-discard]")?.addEventListener("click", function () {
        closeDialog(unsaved, "discard");
      });
      unsaved.querySelector("[data-cps-unsaved-cancel]")?.addEventListener("click", function () {
        closeDialog(unsaved, "cancel");
      });
    }
    if (confirmSave) {
      confirmSave.querySelector("[data-cps-confirm-save-apply]")?.addEventListener("click", function () {
        closeDialog(confirmSave, "apply");
      });
      confirmSave.querySelector("[data-cps-confirm-save-cancel]")?.addEventListener("click", function () {
        closeDialog(confirmSave, "cancel");
      });
    }
  }

  function promptConfirmSave(root) {
    var changes = getChangedFields(root);
    if (!changes.length) return Promise.resolve(true);
    var dialog = document.querySelector("[data-cps-confirm-save-dialog]");
    fillChangesList(dialog ? dialog.querySelector("[data-cps-confirm-save-list]") : null, changes);
    return openDialog(dialog).then(function (result) {
      return result === "apply";
    });
  }

  function promptUnsaved(root, onProceed) {
    var changes = getChangedFields(root);
    if (!changes.length) {
      if (onProceed) onProceed();
      return Promise.resolve(true);
    }
    var dialog = document.querySelector("[data-cps-unsaved-dialog]");
    fillChangesList(dialog ? dialog.querySelector("[data-cps-unsaved-list]") : null, changes);
    return openDialog(dialog).then(function (result) {
      if (result === "save") {
        return performSave(root).then(function (ok) {
          if (ok && onProceed) onProceed();
          return ok;
        });
      }
      if (result === "discard") {
        revertToSnapshot(root);
        if (onProceed) onProceed();
        return true;
      }
      return false;
    });
  }

  function revertToSnapshot(root) {
    var saved = root.__cpsSavedSnapshot;
    if (!saved) return;
    fillForm(root, saved);
    setGender(root, saved.gender || "");
    if (typeof root.__cpsSetSavedUsername === "function") {
      root.__cpsSetSavedUsername(saved.username || "");
    }
    setAvatarPreview(root, saved.profile_picture_url || "");
    updateDirtyState(root);
  }

  function performSave(root) {
    if (!isLoggedIn()) return Promise.resolve(false);
    return promptConfirmSave(root).then(function (confirmed) {
      if (!confirmed) return false;
      setLoading(root, true);
      setStatus(root, "");
      setFooterStatus(root, "", "");
      var usernameInput = root.querySelector('[data-cps-input="username"]');
      var nextUsername = usernameInput ? String(usernameInput.value || "").trim() : "";
      var savedUsername =
        typeof root.__cpsGetSavedUsername === "function" ? root.__cpsGetSavedUsername() : "";
      if (usernameInput && !nextUsername) {
        var emptyMsg =
          root.getAttribute("data-msg-username-required") || "Username cannot be empty.";
        setUsernameStatus(root, emptyMsg, "error");
        setStatus(root, emptyMsg, "error");
        setFooterStatus(root, emptyMsg, "error");
        setLoading(root, false);
        return false;
      }
      return apiPost("save-customer-account-profile", getPayload(root))
        .then(function (data) {
          if (!data || data.ok !== true) throw new Error("profile_save_failed");
          if (!usernameInput || nextUsername === savedUsername) return { ok: true };
          return apiPost("set-account-username", { username: nextUsername });
        })
        .then(function (usernameResult) {
          if (usernameResult && usernameResult.ok === false) {
            throw new Error(usernameResult.error || "username_save_failed");
          }
          if (
            usernameResult &&
            usernameResult.ok === true &&
            typeof root.__cpsSetSavedUsername === "function"
          ) {
            root.__cpsSetSavedUsername(usernameResult.username || nextUsername);
          }
          commitSnapshot(root);
          setLoading(root, false);
          var savedMsg = root.getAttribute("data-msg-saved") || "Saved.";
          setStatus(root, savedMsg, "success");
          setFooterStatus(root, savedMsg, "success");
          return true;
        })
        .catch(function (err) {
          setLoading(root, false);
          var errCode = err && err.message ? String(err.message) : "";
          if (
            errCode === "username_save_failed" ||
            errCode === "username_taken" ||
            errCode === "username_required" ||
            errCode === "empty" ||
            errCode === "too_short" ||
            errCode === "too_long" ||
            errCode === "invalid_chars" ||
            errCode === "numeric_only"
          ) {
            var umsg =
              errCode === "username_taken"
                ? root.getAttribute("data-msg-username-taken") || "Already taken"
                : errCode === "username_required" || errCode === "empty"
                  ? root.getAttribute("data-msg-username-required") || "Username cannot be empty."
                  : errCode === "too_short" ||
                      errCode === "too_long" ||
                      errCode === "invalid_chars" ||
                      errCode === "numeric_only"
                    ? root.getAttribute("data-msg-username-invalid") || "Invalid username."
                    : root.getAttribute("data-msg-username-save-failed") ||
                      "Could not save username.";
            setUsernameStatus(root, umsg, "error");
            setStatus(root, umsg, "error");
            setFooterStatus(root, umsg, "error");
            return false;
          }
          var msg = root.getAttribute("data-msg-save-failed") || "Save failed.";
          setStatus(root, msg, "error");
          setFooterStatus(root, msg, "error");
          return false;
        });
    });
  }

  function setUsernameStatus(root, text, kind) {
    var el = root.querySelector("[data-cps-username-status]");
    if (!el) return;
    el.classList.remove("is-available", "is-error", "is-checking");
    if (kind === "available") el.classList.add("is-available");
    if (kind === "error") el.classList.add("is-error");
    if (kind === "checking") el.classList.add("is-checking");
    el.textContent = text || "";
  }

  function bindUsernameField(root) {
    var input = root.querySelector("[data-cps-username-input]");
    if (!input || input.dataset.cpsUsernameBound === "1") return;
    input.dataset.cpsUsernameBound = "1";
    var timer = null;
    var savedUsername = "";

    function scheduleCheck() {
      if (timer) clearTimeout(timer);
      var value = (input.value || "").trim();
      if (!value) {
        setUsernameStatus(
          root,
          root.getAttribute("data-msg-username-required") || "Username cannot be empty.",
          "error"
        );
        return;
      }
      if (value === savedUsername) {
        setUsernameStatus(root, "", "");
        return;
      }
      setUsernameStatus(root, root.getAttribute("data-msg-username-checking") || "Checking…", "checking");
      timer = setTimeout(function () {
        apiGet("check-account-username", { name: value })
          .then(function (data) {
            if (!data || data.ok !== true) {
              setUsernameStatus(
                root,
                root.getAttribute("data-msg-username-invalid") || "Invalid username.",
                "error"
              );
              return;
            }
            if (data.available) {
              setUsernameStatus(
                root,
                root.getAttribute("data-msg-username-available") || "Available",
                "available"
              );
              return;
            }
            var errMsg =
              data.error === "too_short" ||
              data.error === "too_long" ||
              data.error === "invalid_chars" ||
              data.error === "numeric_only"
                ? root.getAttribute("data-msg-username-invalid") || "Invalid username."
                : root.getAttribute("data-msg-username-taken") || "Already taken";
            setUsernameStatus(root, errMsg, "error");
          })
          .catch(function () {
            setUsernameStatus(root, "", "");
          });
      }, 400);
    }

    input.addEventListener("input", scheduleCheck);
    input.addEventListener("blur", scheduleCheck);

    root.__cpsSetSavedUsername = function (username) {
      savedUsername = String(username || "").trim();
      if (input) input.value = savedUsername;
      setUsernameStatus(root, "", "");
    };
    root.__cpsGetSavedUsername = function () {
      return savedUsername;
    };
  }

  function fillForm(root, profile) {
    var fields = ["first_name", "last_name", "address_line", "city", "birth_date"];
    for (var i = 0; i < fields.length; i++) {
      var key = fields[i];
      var input = root.querySelector('[data-cps-input="' + key + '"]');
      if (input) input.value = (profile && profile[key]) || "";
    }
    var countryEl = root.querySelector('[data-cps-input="country"]');
    if (countryEl) {
      var rawCountry = (profile && profile.country ? String(profile.country) : "").trim();
      var normalizedRaw = rawCountry.toLowerCase();
      var matchedValue = "";
      if (rawCountry) {
        for (var c = 0; c < countryEl.options.length; c++) {
          var opt = countryEl.options[c];
          var optValue = String(opt.value || "").toLowerCase();
          var optText = String(opt.text || "").toLowerCase();
          if (optValue === normalizedRaw || optText === normalizedRaw) {
            matchedValue = opt.value;
            break;
          }
        }
      }
      countryEl.value = matchedValue;
    }
    setGender(root, (profile && profile.gender) || "");
  }

  function getPayload(root) {
    var countryEl = root.querySelector('[data-cps-input="country"]');
    var countryValue = "";
    if (countryEl) {
      var selectedOption = countryEl.options[countryEl.selectedIndex];
      countryValue = selectedOption && selectedOption.value ? String(selectedOption.value) : "";
    }
    return {
      first_name: (root.querySelector('[data-cps-input="first_name"]') || {}).value || "",
      last_name: (root.querySelector('[data-cps-input="last_name"]') || {}).value || "",
      address_line: (root.querySelector('[data-cps-input="address_line"]') || {}).value || "",
      city: (root.querySelector('[data-cps-input="city"]') || {}).value || "",
      country: countryValue,
      birth_date: (root.querySelector('[data-cps-input="birth_date"]') || {}).value || "",
      gender: (root.querySelector('[data-cps-input="gender"]') || {}).value || ""
    };
  }

  function buildUrl(op, extraParams) {
    var ownerId = getOwnerId();
    var url =
      API_BASE +
      "?op=" +
      encodeURIComponent(op) +
      "&owner_id=" +
      encodeURIComponent(ownerId) +
      "&customer_id=" +
      encodeURIComponent(ownerId);
    if (extraParams) {
      for (var key in extraParams) {
        if (!Object.prototype.hasOwnProperty.call(extraParams, key)) continue;
        if (extraParams[key] == null || extraParams[key] === "") continue;
        url += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(extraParams[key]);
      }
    }
    url += "&_t=" + Date.now();
    return url;
  }

  function apiGet(op, extraParams) {
    return fetch(buildUrl(op, extraParams), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    }).then(function (r) {
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    });
  }

  function apiPost(op, body) {
    return fetch(buildUrl(op), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!r.ok) {
            var err = new Error("http_" + r.status);
            err.data = data;
            throw err;
          }
          if (data && data.ok === false) {
            var err2 = new Error(data.error || "api_error");
            err2.data = data;
            throw err2;
          }
          return data;
        });
    });
  }

  function setDeleteStatus(root, text, kind) {
    var el = root.querySelector("[data-cps-delete-status]");
    if (!el) return;
    el.classList.remove("is-success", "is-error");
    if (kind === "success") el.classList.add("is-success");
    if (kind === "error") el.classList.add("is-error");
    el.textContent = text || "";
  }

  function setEraseStatus(root, text, kind) {
    var el = root.querySelector("[data-cps-erase-status]");
    if (!el) return;
    el.classList.remove("is-success", "is-error");
    if (kind === "success") el.classList.add("is-success");
    if (kind === "error") el.classList.add("is-error");
    el.textContent = text || "";
  }

  function syncOptionalEraseButton(root) {
    var btn = root.querySelector("[data-cps-erase-optional-btn]");
    var scope = root.querySelector("[data-cps-erase-consent-scope]");
    if (!btn || !scope) return;
    btn.disabled = !scope.checked;
  }

  function syncDeletePermanentButton(root) {
    var btn = root.querySelector("[data-cps-delete-permanent-btn]");
    var irreversible = root.querySelector("[data-cps-delete-consent-irreversible]");
    var retention = root.querySelector("[data-cps-delete-consent-retention]");
    if (!btn || !irreversible || !retention) return;
    btn.disabled = !irreversible.checked || !retention.checked;
  }

  function bindAccountDeletionConsents(root) {
    if (!root || root.getAttribute("data-context") !== "account") return;
    var eraseScope = root.querySelector("[data-cps-erase-consent-scope]");
    if (eraseScope && eraseScope.dataset.cpsConsentBound !== "1") {
      eraseScope.dataset.cpsConsentBound = "1";
      eraseScope.addEventListener("change", function () {
        syncOptionalEraseButton(root);
      });
    }
    var delIr = root.querySelector("[data-cps-delete-consent-irreversible]");
    var delRet = root.querySelector("[data-cps-delete-consent-retention]");
    if (delIr && delIr.dataset.cpsConsentBound !== "1") {
      delIr.dataset.cpsConsentBound = "1";
      delIr.addEventListener("change", function () {
        syncDeletePermanentButton(root);
      });
    }
    if (delRet && delRet.dataset.cpsConsentBound !== "1") {
      delRet.dataset.cpsConsentBound = "1";
      delRet.addEventListener("change", function () {
        syncDeletePermanentButton(root);
      });
    }
    syncOptionalEraseButton(root);
    syncDeletePermanentButton(root);
  }

  function bindEraseOptionalData(root) {
    if (!root || root.getAttribute("data-context") !== "account") return;
    var eraseBtn = root.querySelector("[data-cps-erase-optional-btn]");
    if (!eraseBtn || eraseBtn.dataset.cpsEraseBound === "1") return;
    eraseBtn.dataset.cpsEraseBound = "1";
    eraseBtn.addEventListener("click", function () {
      if (!isLoggedIn()) return;
      var emailInput = root.querySelector("[data-cps-erase-confirm-email]");
      var confirmEmail = (emailInput && emailInput.value ? emailInput.value : "").trim().toLowerCase();
      var expected = (root.getAttribute("data-customer-email") || "").trim().toLowerCase();
      if (!confirmEmail || !expected || confirmEmail !== expected) {
        setEraseStatus(root, root.getAttribute("data-msg-erase-email-mismatch") || "Email mismatch.", "error");
        return;
      }
      var scopeChk = root.querySelector("[data-cps-erase-consent-scope]");
      if (!scopeChk || !scopeChk.checked) {
        setEraseStatus(root, root.getAttribute("data-msg-erase-consent-required") || "Confirm required.", "error");
        return;
      }
      if (!window.confirm(root.getAttribute("data-msg-erase-confirm-dialog") || "Remove optional data?")) return;
      var ownerId = getOwnerId();
      if (!ownerId) {
        setEraseStatus(root, root.getAttribute("data-msg-login-required") || "Please log in.", "error");
        return;
      }
      eraseBtn.disabled = true;
      setEraseStatus(root, "", "");
      var localeTag =
        (window.Shopify && window.Shopify.locale) ||
        (document.documentElement && document.documentElement.lang) ||
        (typeof navigator !== "undefined" && navigator.language) ||
        "en";
      var firstNameInput = root.querySelector('[data-cps-input="first_name"]');
      var privacyChk = root.querySelector("[data-cps-erase-consent-privacy]");
      apiPost("erase-optional-customer-data", {
        confirm: true,
        owner_id: ownerId,
        confirm_email: confirmEmail,
        locale: localeTag,
        first_name: (firstNameInput && firstNameInput.value ? firstNameInput.value : "").trim(),
        consents: {
          optional_erase: {
            scope: true,
            privacy: !!(privacyChk && privacyChk.checked)
          }
        }
      })
        .then(function (data) {
          if (!data || data.ok !== true) throw new Error("erase_failed");
          setEraseStatus(
            root,
            root.getAttribute("data-msg-erase-email-sent") || root.getAttribute("data-msg-erase-success") || "Done.",
            "success"
          );
          if (emailInput) emailInput.value = "";
          syncOptionalEraseButton(root);
        })
        .catch(function (err) {
          syncOptionalEraseButton(root);
          var msg = root.getAttribute("data-msg-erase-error") || "Request failed.";
          if (err && err.data && err.data.error === "email_mismatch") {
            msg = root.getAttribute("data-msg-erase-email-mismatch") || msg;
          }
          setEraseStatus(root, msg, "error");
        });
    });
  }

  function bindDeleteAccount(root) {
    if (!root || root.getAttribute("data-context") !== "account") return;
    var delBtn = root.querySelector("[data-cps-delete-permanent-btn]");
    if (!delBtn || delBtn.dataset.cpsDeleteBound === "1") return;
    delBtn.dataset.cpsDeleteBound = "1";
    delBtn.addEventListener("click", function () {
      if (!isLoggedIn()) return;
      var emailInput = root.querySelector("[data-cps-delete-confirm-email]");
      var confirmEmail = (emailInput && emailInput.value ? emailInput.value : "").trim().toLowerCase();
      var expected = (root.getAttribute("data-customer-email") || "").trim().toLowerCase();
      if (!confirmEmail || !expected || confirmEmail !== expected) {
        setDeleteStatus(root, root.getAttribute("data-msg-delete-email-mismatch") || "Email mismatch.", "error");
        return;
      }
      var delIr = root.querySelector("[data-cps-delete-consent-irreversible]");
      var delRet = root.querySelector("[data-cps-delete-consent-retention]");
      if (!delIr || !delIr.checked || !delRet || !delRet.checked) {
        setDeleteStatus(root, root.getAttribute("data-msg-delete-consent-required") || "Confirm required.", "error");
        return;
      }
      if (!window.confirm(root.getAttribute("data-msg-delete-confirm-dialog") || "Delete account?")) return;
      var ownerId = getOwnerId();
      if (!ownerId) {
        setDeleteStatus(root, root.getAttribute("data-msg-login-required") || "Please log in.", "error");
        return;
      }
      delBtn.disabled = true;
      setDeleteStatus(root, "", "");
      var localeTag =
        (window.Shopify && window.Shopify.locale) ||
        (document.documentElement && document.documentElement.lang) ||
        (typeof navigator !== "undefined" && navigator.language) ||
        "en";
      var firstNameInput = root.querySelector('[data-cps-input="first_name"]');
      var pubChk = root.querySelector("[data-cps-delete-consent-public]");
      apiPost("delete-shopify-customer", {
        confirm: true,
        owner_id: ownerId,
        confirm_email: confirmEmail,
        locale: localeTag,
        first_name: (firstNameInput && firstNameInput.value ? firstNameInput.value : "").trim(),
        consents: {
          schedule_account_deletion: {
            irreversible: !!(delIr && delIr.checked),
            retention: !!(delRet && delRet.checked),
            public_designs_ack: !!(pubChk && pubChk.checked)
          }
        }
      })
        .then(function (data) {
          if (!data || data.ok !== true) throw new Error("delete_failed");
          var tmpl =
            root.getAttribute("data-msg-delete-success-scheduled") ||
            root.getAttribute("data-msg-delete-success") ||
            "Scheduled.";
          var iso = data.scheduled_delete_at;
          var dateStr = "";
          if (iso) {
            try {
              var d = new Date(iso);
              dateStr = d.toLocaleDateString(localeTag, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
              });
            } catch (_e) {
              dateStr = String(iso);
            }
          }
          setDeleteStatus(root, tmpl.replace(/__DATE__/g, dateStr), "success");
        })
        .catch(function (err) {
          syncDeletePermanentButton(root);
          var msg = root.getAttribute("data-msg-delete-error") || "Delete failed.";
          if (err && err.data && err.data.error === "email_mismatch") {
            msg = root.getAttribute("data-msg-delete-email-mismatch") || msg;
          }
          setDeleteStatus(root, msg, "error");
        });
    });
  }

  function applyAuthState(root) {
    var loginRequiredEl = root.querySelector("[data-cps-login-required]");
    var formWrapEl = root.querySelector("[data-cps-form-wrap]");
    var loggedIn = isLoggedIn();

    if (loginRequiredEl) loginRequiredEl.style.display = loggedIn ? "none" : "flex";
    if (formWrapEl) formWrapEl.style.display = loggedIn ? "block" : "none";

    var emailEl = root.querySelector("[data-cps-email]");
    if (emailEl) {
      emailEl.value = root.getAttribute("data-customer-email") || "";
    }
  }

  function loadProfile(root) {
    if (!isLoggedIn()) return Promise.resolve();
    setLoading(root, true);
    setStatus(root, "");
    return Promise.all([
      apiGet("get-customer-account-profile"),
      apiGet("get-account-username"),
      apiGet("get-customer-email"),
    ])
      .then(function (results) {
        var profileData = results[0];
        var usernameData = results[1];
        var emailData = results[2];
        if (!profileData || profileData.ok !== true) throw new Error("profile_load_failed");
        var email =
          emailData && emailData.ok === true && emailData.email
            ? String(emailData.email).trim()
            : (profileData.profile && profileData.profile.email) || "";
        if (email) root.setAttribute("data-customer-email", email);
        fillForm(root, profileData.profile || null);
        var emailEl = root.querySelector("[data-cps-email]");
        if (emailEl) emailEl.value = email || root.getAttribute("data-customer-email") || "";
        var username = usernameData && usernameData.ok === true ? usernameData.username : "";
        if (typeof root.__cpsSetSavedUsername === "function") {
          root.__cpsSetSavedUsername(username || "");
        } else {
          var usernameInput = root.querySelector('[data-cps-input="username"]');
          if (usernameInput) usernameInput.value = username || "";
        }
        var picUrl =
          profileData.profile && profileData.profile.profile_picture_url
            ? profileData.profile.profile_picture_url
            : "";
        root.__cpsSavedAvatarUrl = picUrl;
        setAvatarPreview(root, picUrl);
        commitSnapshot(root);
        setLoading(root, false);
      })
      .catch(function () {
        setLoading(root, false);
        setStatus(root, root.getAttribute("data-msg-load-failed") || "Failed to load profile.", "error");
      });
  }

  function bindRoot(root) {
    if (!root) return;
    bindAccountDeletionConsents(root);
    bindEraseOptionalData(root);
    bindDeleteAccount(root);

    if (root.__cpsBound) return;
    root.__cpsBound = true;

    bindUsernameField(root);
    bindAvatarField(root);
    bindDirtyTracking(root);
    bindProfileDialogs();
    applyAuthState(root);
    if (isLoggedIn()) {
      loadProfile(root);
    }

    var loginBtn = root.querySelector("[data-cps-login-btn]");
    if (loginBtn) {
      loginBtn.addEventListener("click", function () {
        var currentUrl = encodeURIComponent(window.location.href);
        window.location.href = "/account/login?redirect=" + currentUrl;
      });
    }

    var genderBtns = root.querySelectorAll("[data-cps-gender-btn]");
    for (var i = 0; i < genderBtns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var value = btn.getAttribute("data-cps-gender-btn") || "";
          setGender(root, value);
        });
      })(genderBtns[i]);
    }

    var form = root.querySelector("[data-cps-form]");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!isLoggedIn()) {
          setStatus(root, root.getAttribute("data-msg-login-required") || "Please log in.", "error");
          applyAuthState(root);
          return;
        }
        performSave(root);
      });
    }

    var saveButtons = getSaveButtons(root);
    for (var sb = 0; sb < saveButtons.length; sb++) {
      (function (btn) {
        if (btn.dataset.cpsSaveClickBound === "1") return;
        btn.dataset.cpsSaveClickBound = "1";
        btn.addEventListener("click", function (e) {
          if (btn.type === "submit") return;
          e.preventDefault();
          performSave(root);
        });
      })(saveButtons[sb]);
    }
  }

  function bindAll() {
    var roots = document.querySelectorAll("[data-customer-profile-settings-root]");
    for (var i = 0; i < roots.length; i++) {
      bindRoot(roots[i]);
    }
  }

  function refreshCreatorProfilePanel() {
    if (!window.CreatorSettingsV2Modal) return;
    if (window.CreatorSettingsV2Modal.getCurrentTab && window.CreatorSettingsV2Modal.getCurrentTab() !== "profile") return;
    var creatorRoot = document.querySelector('[data-customer-profile-settings-root][data-context="creator"]');
    if (!creatorRoot) return;
    applyAuthState(creatorRoot);
    if (isLoggedIn()) loadProfile(creatorRoot);
  }

  document.addEventListener("DOMContentLoaded", bindAll);
  window.addEventListener("creator-settings-v2-opened", function () {
    bindAll();
    refreshCreatorProfilePanel();
  });
  window.addEventListener("creator-settings-v2-tab-changed", function (e) {
    if (e && e.detail && e.detail.tab === "profile") {
      bindAll();
      refreshCreatorProfilePanel();
    }
  });
  document.addEventListener("account-modal-tab-loaded", function (e) {
    if (e && e.detail && e.detail.tab === "profile-settings") {
      bindAll();
    }
  });

  bindAll();

  function getCreatorRoot() {
    return document.querySelector('[data-customer-profile-settings-root][data-context="creator"]');
  }

  window.CustomerProfileSettings = {
    isDirty: function (root) {
      return isDirty(root || getCreatorRoot());
    },
    promptUnsaved: function (root, onProceed) {
      return promptUnsaved(root || getCreatorRoot(), onProceed);
    },
    getCreatorRoot: getCreatorRoot
  };
})();
