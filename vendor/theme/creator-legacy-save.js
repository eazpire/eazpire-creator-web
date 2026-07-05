/**
 * Legacy manual save (op=save-design) — only for finished jobs not yet persisted to creations.
 */
(function () {
  'use strict';

  /**
   * @param {{ done?: boolean, saved?: boolean, saving?: boolean }|null|undefined} job
   * @returns {boolean}
   */
  function canShowLegacySaveButton(job) {
    if (!job || typeof job !== 'object') return false;
    if (job.saving === true && job.saved !== true) return false;
    return job.done === true && job.saved !== true;
  }

  window.CreatorLegacySave = {
    canShowLegacySaveButton: canShowLegacySaveButton,
  };
})();
