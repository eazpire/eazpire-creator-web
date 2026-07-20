/**
 * Creator Modal Physics - Scroll Lock Utility
 * 
 * Verhindert, dass die Hauptseite scrollt, wenn ein Modal offen ist.
 * Funktioniert auch in nicht-scrollbaren Bereichen des Modals.
 * 
 * Verwendung:
 *   - lockBodyScroll() - Sperrt das Scrollen der Hauptseite
 *   - unlockBodyScroll() - Entsperrt das Scrollen der Hauptseite
 *   - initModalScrollLock(modalElement) - Initialisiert Scroll-Lock für ein Modal
 */

(function() {
  'use strict';

  let scrollLockCount = 0;
  let lockedScrollY = 0;
  
  // ✅ TODO 4a: WeakMap für Modal-Scroll-Handler (verhindert Listener-Leichen)
  const modalScrollHandlers = new WeakMap();

  /**
   * Prüft, ob ein Element scrollbar ist
   * @param {HTMLElement|null} element
   * @returns {boolean}
   */
  function isScrollable(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    const overflow = style.overflow;
    const maxHeight = style.maxHeight;
    const height = element.clientHeight;
    const scrollHeight = element.scrollHeight;
    
    // Prüfe ob Element scrollbar ist
    const canScroll = (
      (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll') &&
      scrollHeight > height
    );
    
    return canScroll;
  }

  /**
   * Findet das scrollbare Parent-Element
   * @param {HTMLElement|null} element
   * @returns {HTMLElement|null}
   */
  function findScrollableParent(element) {
    if (!element) return null;
    let parent = element.parentElement;
    while (parent) {
      if (isScrollable(parent)) {
        return parent;
      }
      // ✅ TODO 3: Stoppe bei Modal-Container oder Body (erweitert um creator-modal--open)
      if (parent.classList && (
          parent.classList.contains('creator-modal') ||
          parent.classList.contains('creator-modal--open')
        ) || parent === document.body) {
        break;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  /**
   * Verhindert Scrollen in nicht-scrollbaren Modal-Bereichen
   * 
   * ✅ TODO 1.2: Entschärft - immer erlauben
   * Keine preventDefault mehr, da Body bereits gelockt ist
   * @param {Event} event
   * @returns {boolean}
   */
  function preventModalScroll(event) {
    // ✅ Im Modal immer Scroll erlauben
    // Body ist bereits per position:fixed gelockt, keine zusätzliche Blockade nötig
    return true;
  }

  /**
   * Verhindert Wheel-Events, wenn kein scrollbares Element vorhanden ist
   * 
   * ✅ TODO 1.2: Entschärft - immer erlauben
   * Keine preventDefault mehr, da Body bereits gelockt ist
   * @param {Event} event
   * @returns {boolean}
   */
  function preventModalWheel(event) {
    // ✅ Im Modal immer Scroll erlauben
    // Body ist bereits per position:fixed gelockt, keine zusätzliche Blockade nötig
    return true;
  }

  /**
   * Sperrt das Scrollen der Hauptseite
   */
  function lockBodyScroll() {
    scrollLockCount++;
    
    // ✅ TODO 2: Debug-Log (nur in Dev)
    if (typeof console !== 'undefined' && console.log) {
      console.log('[CreatorModalPhysics] lockBodyScroll() called, count:', scrollLockCount);
    }
    
    // Nur beim ersten Lock
    if (scrollLockCount === 1) {
      const body = document.body;
      const html = document.documentElement;
      
      // Speichere aktuelle Scroll-Position
      lockedScrollY = window.scrollY || window.pageYOffset || html.scrollTop;
      
      // Fixiere Body-Position
      body.style.position = 'fixed';
      body.style.top = '-' + lockedScrollY + 'px';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      
      // Für iOS Safari
      body.style.touchAction = 'none';
      
      // Verhindere Scroll durch Touch-Events
      document.addEventListener('touchmove', preventBodyScroll, { passive: false });
      document.addEventListener('wheel', preventBodyScroll, { passive: false });
    }
  }

  /**
   * Entsperrt das Scrollen der Hauptseite
   */
  function unlockBodyScroll() {
    // ✅ TODO 2: Safety - verhindere negatives scrollLockCount
    if (scrollLockCount <= 0) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[CreatorModalPhysics] unlockBodyScroll() called but count already <= 0, clamping to 0');
      }
      scrollLockCount = 0;
      return;
    }
    
    scrollLockCount--;
    
    // ✅ TODO 2: Debug-Log (nur in Dev)
    if (typeof console !== 'undefined' && console.log) {
      console.log('[CreatorModalPhysics] unlockBodyScroll() called, count:', scrollLockCount);
    }
    
    // Nur beim letzten Unlock
    if (scrollLockCount === 0) {
      clearBodyScrollStyles();
    }
  }

  /**
   * Entfernt Body-Scroll-Lock Styles/Listener (intern).
   * @param {boolean} restoreScroll - Scroll-Position wiederherstellen
   */
  function clearBodyScrollStyles(restoreScroll) {
    const body = document.body;
    if (!body) return;
    const top = body.style.top;
    body.style.position = '';
    body.style.top = '';
    body.style.width = '';
    body.style.overflow = '';
    body.style.touchAction = '';
    document.removeEventListener('touchmove', preventBodyScroll);
    document.removeEventListener('wheel', preventBodyScroll);
    if (restoreScroll !== false) {
      const y = lockedScrollY || (top ? Math.abs(parseInt(top, 10) || 0) : 0);
      if (y) window.scrollTo(0, y);
    }
    lockedScrollY = 0;
  }

  /**
   * Notfall: Body-Scroll-Lock komplett zurücksetzen (z.B. pagehide / stuck modal).
   * Ignoriert den Lock-Counter und entfernt Styles + Listener.
   */
  function forceUnlockBodyScroll() {
    scrollLockCount = 0;
    clearBodyScrollStyles(true);
    if (typeof console !== 'undefined' && console.log) {
      console.log('[CreatorModalPhysics] forceUnlockBodyScroll()');
    }
  }

  /**
   * Verhindert Body-Scroll bei Touch/Wheel-Events
   * 
   * ✅ TODO 1.1: Vereinfacht - keine Heuristik mehr
   * - Außerhalb Modal: blockieren
   * - Innerhalb Modal: IMMER erlauben (keine isScrollable Checks)
   * @param {Event} event
   * @returns {boolean}
   */
  function preventBodyScroll(event) {
    const target = event.target;
    
    // ✅ TODO 2: Prüfe ob Event innerhalb eines offenen Modals ist (erweitert um creator ohne Bindestrich)
    // Fallback erkennt auch IDs wie creatorDesignPreviewModal-...
    const targetEl = /** @type {HTMLElement} */ (target);
    const modal = targetEl.closest('.creator-modal') || 
                  targetEl.closest('.creator-modal--open') ||
                  targetEl.closest('.inspiration-filter-modal[aria-hidden="false"]') ||
                  (targetEl.closest('[aria-hidden="false"]') && (
                    targetEl.closest('[id^="creator-"]') || 
                    targetEl.closest('[id^="creator"]')
                  ));
    
    if (!modal) {
      // Außerhalb Modal - verhindere immer
      event.preventDefault();
      return false;
    }
    
    // ✅ Innerhalb Modal - IMMER erlauben (keine Heuristik mehr)
    // Body ist bereits per position:fixed gelockt, Modal-Scroll soll immer funktionieren
    return true;
  }

  /**
   * Initialisiert Scroll-Lock für ein Modal
   * @param {HTMLElement|null} modalElement
   */
  function initModalScrollLock(modalElement) {
    if (!modalElement) return;
    
    // ✅ FIX: Entferne alte Listener falls vorhanden (beim Reopen)
    // Dann füge neue hinzu - so funktioniert es auch nach removeModalScrollLock
    const existingEntry = modalScrollHandlers.get(modalElement);
    if (existingEntry && existingEntry.onScrollCapture) {
      modalElement.removeEventListener('scroll', existingEntry.onScrollCapture, true);
    }
    
    // ✅ Scroll-Handler speichern (nicht anonym, damit er entfernt werden kann)
    /**
     * @param {Event} event
     */
    const onScrollCapture = function(event) {
      // Verhindere, dass Scroll-Events an Body weitergegeben werden
      event.stopPropagation();
    };
    modalElement.addEventListener('scroll', onScrollCapture, true);
    
    // Handler in WeakMap speichern
    modalScrollHandlers.set(modalElement, { onScrollCapture });
  }

  /**
   * Entfernt Scroll-Lock für ein Modal
   * @param {HTMLElement|null} modalElement
   */
  function removeModalScrollLock(modalElement) {
    if (!modalElement) return;
    
    // ✅ TODO 4c: ALLE Listener entfernen (symmetrisch zu init)
    // ✅ TODO 1.2: Wheel/Touchmove Listener wurden NICHT mehr hinzugefügt, nur scroll bleibt
    
    // WICHTIG: Scroll-Handler entfernen
    const entry = modalScrollHandlers.get(modalElement);
    if (entry && entry.onScrollCapture) {
      modalElement.removeEventListener('scroll', entry.onScrollCapture, true);
    }
    
    // Aus WeakMap entfernen
    modalScrollHandlers.delete(modalElement);
    
    // Debug-Log (nur in Dev)
    if (typeof console !== 'undefined' && console.log) {
      console.log('[CreatorModalPhysics] removeModalScrollLock() called', {
        modalId: modalElement.id || 'unknown',
        hadHandlers: !!entry
      });
    }
  }

  // Export globale Funktionen
  /** @type {any} */
  (window).CreatorModalPhysics = {
    lockBodyScroll: lockBodyScroll,
    unlockBodyScroll: unlockBodyScroll,
    forceUnlockBodyScroll: forceUnlockBodyScroll,
    initModalScrollLock: initModalScrollLock,
    removeModalScrollLock: removeModalScrollLock,
    isScrollable: isScrollable,
    findScrollableParent: findScrollableParent
  };

})();
