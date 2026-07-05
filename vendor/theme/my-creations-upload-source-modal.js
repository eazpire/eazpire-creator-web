/**
 * Device vs Mobile (desktop ≥900px), then design upload modal.
 * Used on /pages/creator-dashboard Creations tab (openCreationsUploadSourceChoice).
 * Narrow screens: file picker → design upload modal (same as before).
 */
(function () {
  'use strict';

  var MODAL_ID = 'my-creations-upload-source-modal';
  var DESKTOP_MIN_PX = 900;

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

  function openChoiceModal(sectionId) {
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
        if (window.matchMedia('(min-width: ' + DESKTOP_MIN_PX + 'px)').matches) {
          openChoiceModal(sectionId);
        } else {
          openFilePickerThenDesignModal(sectionId);
        }
      });
    });

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
          if (!window.CreatorPhoneUploadModal || typeof window.CreatorPhoneUploadModal.open !== 'function') {
            window.alert(
              (window.CreatorI18n && window.CreatorI18n.phone_upload_config_error) ||
                'Phone upload is not available.'
            );
            return;
          }
          window.CreatorPhoneUploadModal.open({ sectionId: sectionId });
        }
      });
    });

    var closeBtn = document.getElementById('my-creations-upload-source-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeChoiceModal);
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeChoiceModal();
    });
    modal.addEventListener('cancel', closeChoiceModal);
  }

  function openCreationsUploadSourceChoice(sectionId) {
    if (!sectionId) return;
    if (window.matchMedia('(min-width: ' + DESKTOP_MIN_PX + 'px)').matches) {
      openChoiceModal(sectionId);
    } else {
      openFilePickerThenDesignModal(sectionId);
    }
  }
  window.openCreationsUploadSourceChoice = openCreationsUploadSourceChoice;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
