/**
 * Device / Mobile (desktop) / Canvas, then design upload modal.
 * Used on /pages/creator-dashboard Creations tab (openCreationsUploadSourceChoice).
 * Narrow screens hide Mobile (QR) and still show Device + Canvas.
 */
(function () {
  'use strict';

  var MODAL_ID = 'my-creations-upload-source-modal';

  function getSectionIdFromButton(btn) {
    var m = btn && btn.id && /^creations-upload-btn-(.+)$/.exec(btn.id);
    return m ? m[1] : null;
  }

  function validateFile(file) {
    var maxSize = 30 * 1024 * 1024;
    if (file.size > maxSize) {
      var msg =
        (window.CreatorI18n && window.CreatorI18n.fileTooLarge) ||
        (window.CreatorI18n && window.CreatorI18n.my_creations && window.CreatorI18n.my_creations.file_too_large) ||
        'The file is too large. Maximum size: 30MB';
      window.alert(msg);
      return false;
    }
    var allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      var msg2 =
        (window.CreatorI18n && window.CreatorI18n.invalidFileType) ||
        (window.CreatorI18n && window.CreatorI18n.my_creations && window.CreatorI18n.my_creations.invalid_file_type) ||
        'Invalid file type. Allowed: PNG, JPG, SVG';
      window.alert(msg2);
      return false;
    }
    return true;
  }

  function openDesignUploadWithFile(sectionId, file) {
    if (!file || !validateFile(file)) return;
    if (!window.DesignUploadModal || typeof window.DesignUploadModal.init !== 'function') {
      console.warn('[MyCreationsUpload] DesignUploadModal missing');
      return;
    }
    var api = window.DesignUploadModal.init({ sectionId: sectionId, selectedFile: file });
    if (api && typeof api.open === 'function') api.open();
  }

  function openFilePickerThenDesignModal(sectionId) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/svg+xml';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      try {
        document.body.removeChild(input);
      } catch (e) {}
      if (!file) return;
      openDesignUploadWithFile(sectionId, file);
    });
    input.click();
  }

  function phoneUploadErrorMessage() {
    return (
      (window.CreatorI18n &&
        window.CreatorI18n.my_creations &&
        window.CreatorI18n.my_creations.phone_config_error) ||
      (window.CreatorI18n && window.CreatorI18n.phone_upload_config_error) ||
      'Phone upload is not available.'
    );
  }

  function tryOpenPhoneUpload(sectionId) {
    if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === 'function') {
      window.CreatorPhoneUploadModal.open({ sectionId: sectionId });
      return true;
    }
    return false;
  }

  function openPhoneUpload(sectionId) {
    if (tryOpenPhoneUpload(sectionId)) return;
    var ensure =
      window.CreatorPortalFeatures && typeof window.CreatorPortalFeatures.ensureCreations === 'function'
        ? window.CreatorPortalFeatures.ensureCreations()
        : null;
    if (ensure && typeof ensure.then === 'function') {
      ensure
        .then(function () {
          if (!tryOpenPhoneUpload(sectionId)) {
            window.alert(phoneUploadErrorMessage());
          }
        })
        .catch(function () {
          window.alert(phoneUploadErrorMessage());
        });
      return;
    }
    window.alert(phoneUploadErrorMessage());
  }

  function ensureModalBound() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal || modal.dataset.myCreationsChoiceBound === '1') return;
    modal.dataset.myCreationsChoiceBound = '1';

    modal.querySelectorAll('[data-my-creations-upload-source]').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var source = opt.getAttribute('data-my-creations-upload-source');
        var sectionId = modal.dataset.sectionId || '';
        closeChoiceModal();
        if (source === 'device') {
          openFilePickerThenDesignModal(sectionId);
          return;
        }
        if (source === 'mobile') {
          openPhoneUpload(sectionId);
          return;
        }
        if (source === 'canvas') {
          openCanvasEditor(sectionId);
        }
      });
    });

    var closeBtn = document.getElementById('my-creations-upload-source-close');
    if (closeBtn && closeBtn.dataset.myCreationsCloseBound !== '1') {
      closeBtn.dataset.myCreationsCloseBound = '1';
      closeBtn.addEventListener('click', closeChoiceModal);
    }
    if (modal.dataset.myCreationsDismissBound !== '1') {
      modal.dataset.myCreationsDismissBound = '1';
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeChoiceModal();
      });
      modal.addEventListener('cancel', closeChoiceModal);
    }
  }

  function openCanvasEditor(sectionId) {
    if (window.DesignCanvasModal && typeof window.DesignCanvasModal.open === 'function') {
      window.DesignCanvasModal.open({
        sectionId: sectionId,
        onCancel: function () {
          openChoiceModal(sectionId);
        }
      });
      return;
    }
    openFilePickerThenDesignModal(sectionId);
  }

  function openChoiceModal(sectionId) {
    ensureModalBound();
    var modal = document.getElementById(MODAL_ID);
    if (!modal || typeof modal.showModal !== 'function') {
      openFilePickerThenDesignModal(sectionId);
      return;
    }
    modal.dataset.sectionId = sectionId;
    modal.showModal();
  }

  function closeChoiceModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal && modal.close) modal.close();
  }

  function bind() {
    document.querySelectorAll('[id^="creations-upload-btn-"]').forEach(function (btn) {
      if (btn.dataset.myCreationsUploadBound === '1') return;
      btn.dataset.myCreationsUploadBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var sectionId = getSectionIdFromButton(btn);
        if (!sectionId) return;
        openChoiceModal(sectionId);
      });
    });

    ensureModalBound();
  }

  function openCreationsUploadSourceChoice(sectionId) {
    if (!sectionId) return;
    openChoiceModal(sectionId);
  }
  window.openCreationsUploadSourceChoice = openCreationsUploadSourceChoice;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
