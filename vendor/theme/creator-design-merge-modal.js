/**
 * Creator Design Merge Modal
 * Handles drag & drop UI for merging two designs into one.
 *
 * VISIBILITY: Uses inline styles for show/hide to avoid any CSS specificity
 * conflicts with Shopify themes. No CSS class needed for visibility.
 */
(function() {
  "use strict";

  var API_BASE = (window.CreatorConfig && window.CreatorConfig.apiBase) || "/apps/creator-dispatch";

  window.CreatorDesignMergeModal = {
    state: {
      isOpen: false,
      leftSlot: null,  // { designId, previewUrl, title }
      rightSlot: null,
      isDragging: false,
      isMerging: false
    },

    elements: {
      modal: null,
      leftSlot: null,
      rightSlot: null,
      mergeButton: null,
      cancelButton: null
    },

    init: function() {
      var self = this;
      self.elements.modal = document.getElementById("design-merge-modal");
      if (!self.elements.modal) {
        console.warn("[MergeModal] Modal element not found");
        return;
      }

      self.elements.leftSlot = self.elements.modal.querySelector('[data-slot="left"]');
      self.elements.rightSlot = self.elements.modal.querySelector('[data-slot="right"]');
      self.elements.mergeButton = document.getElementById("merge-execute-btn");
      self.elements.cancelButton = document.getElementById("merge-cancel-btn");


      // Force hide BEFORE moving to body (defensive triple-hide)
      self.elements.modal.style.setProperty('display', 'none', 'important');
      self.elements.modal.style.visibility = "hidden";
      self.elements.modal.style.opacity = "0";
      self.elements.modal.style.transform = "translateY(-30px)";

      // Move modal to direct child of <body> so that position:fixed works
      // correctly even if a Shopify theme ancestor has transform/filter/perspective.
      if (self.elements.modal.parentElement !== document.body) {
        document.body.appendChild(self.elements.modal);
      }


      self.bindEvents();
      console.log("[MergeModal] Initialized (appended to body)");
    },

    bindEvents: function() {
      var self = this;
      var slots = [self.elements.leftSlot, self.elements.rightSlot];

      slots.forEach(function(slot) {
        if (!slot) return;

        slot.addEventListener("dragover", function(e) {
          self.handleDragOver(e);
        });
        slot.addEventListener("dragleave", function(e) {
          self.handleDragLeave(e);
        });
        slot.addEventListener("drop", function(e) {
          self.handleDrop(e, slot.dataset.slot);
        });

        var clearBtn = slot.querySelector(".merge-slot__clear");
        if (clearBtn) {
          clearBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            self.clearSlot(slot.dataset.slot);
          });
        }
      });

      if (self.elements.mergeButton) {
        self.elements.mergeButton.addEventListener("click", function() {
          self.executeMerge();
        });
      }

      if (self.elements.cancelButton) {
        self.elements.cancelButton.addEventListener("click", function() {
          self.close();
        });
      }

      document.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && self.state.isOpen) {
          self.close();
        }
      });

      // Prevent native drag on images inside the modal
      if (self.elements.modal) {
        self.elements.modal.addEventListener("dragstart", function(e) {
          if (e.target && e.target.tagName === "IMG") {
            e.preventDefault();
          }
        });
      }
    },

    /**
     * Open with inline styles - bulletproof, no CSS class dependency
     */
    open: function() {
      if (this.state.isOpen) return;
      
      this.state.isOpen = true;
      var modal = this.elements.modal;
      if (!modal) return;

      // Step 1: Make visible in layout with starting animation state
      modal.style.setProperty('display', 'block', 'important');
      modal.style.visibility = "visible";
      modal.style.opacity = "0";
      modal.style.transform = "translateY(-30px)";
      modal.style.transition = "none";

      document.body.classList.add("merge-drag-active");

      // Step 2: Force browser to compute layout (trigger reflow)
      void modal.offsetHeight;

      // Step 3: Add transition and animate to final state
      modal.style.transition = "opacity 0.25s ease, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
      modal.style.opacity = "1";
      modal.style.transform = "translateY(0)";
      
      console.log("[MergeModal] Opened - modal display:", modal.style.display, "opacity:", modal.style.opacity);
    },

    /**
     * Close with inline styles
     */
    close: function() {
      if (!this.state.isOpen) return;

      this.state.isOpen = false;
      this.state.leftSlot = null;
      this.state.rightSlot = null;
      this.state.isDragging = false;

      var modal = this.elements.modal;
      var self = this;
      if (!modal) return;

      document.body.classList.remove("merge-drag-active");

      // Animate out
      modal.style.transition = "opacity 0.2s ease, transform 0.2s ease";
      modal.style.opacity = "0";
      modal.style.transform = "translateY(-30px)";

      // After animation, hide completely with triple-hide
      setTimeout(function() {
        if (!self.state.isOpen) {
          modal.style.setProperty('display', 'none', 'important');
          modal.style.visibility = "hidden";
        }
      }, 250);
      
      // Reset slot UI
      this.updateSlotUI("left", null);
      this.updateSlotUI("right", null);
      this.updateMergeButton();
      
      console.log("[MergeModal] Closed");
    },

    handleDragOver: function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      e.currentTarget.classList.add("drag-over");
    },

    handleDragLeave: function(e) {
      e.currentTarget.classList.remove("drag-over");
    },

    handleDrop: function(e, slotPosition) {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList.remove("drag-over");

      var designData;
      try {
        var dataStr = e.dataTransfer.getData("application/json");
        if (!dataStr) {
          console.warn("[MergeModal] No JSON data in drop");
          return;
        }
        designData = JSON.parse(dataStr);
      } catch (err) {
        console.warn("[MergeModal] Invalid drop data:", err);
        return;
      }

      if (!designData || !designData.id) {
        console.warn("[MergeModal] Missing design data");
        return;
      }

      // Check if this design is already in the other slot
      var otherSlot = slotPosition === "left" ? this.state.rightSlot : this.state.leftSlot;
      if (otherSlot && String(otherSlot.designId) === String(designData.id)) {
        console.log("[MergeModal] Design already in other slot");
        return;
      }

      this.setSlot(slotPosition, {
        designId: designData.id,
        previewUrl: designData.preview_url || designData.previewUrl,
        title: designData.title || ("Design " + designData.id)
      });
    },

    setSlot: function(position, design) {
      if (position === "left") {
        this.state.leftSlot = design;
      } else {
        this.state.rightSlot = design;
      }

      this.updateSlotUI(position, design);
      this.updateMergeButton();
      
      console.log("[MergeModal] Set slot:", position, design ? design.designId : null);
    },

    clearSlot: function(position) {
      if (position === "left") {
        this.state.leftSlot = null;
      } else {
        this.state.rightSlot = null;
      }

      this.updateSlotUI(position, null);
      this.updateMergeButton();
      
      console.log("[MergeModal] Cleared slot:", position);
    },

    updateSlotUI: function(position, design) {
      var slot = position === "left" ? this.elements.leftSlot : this.elements.rightSlot;
      if (!slot) return;

      var img = slot.querySelector(".merge-slot__image");
      
      if (design && design.previewUrl) {
        slot.classList.add("filled");
        if (img) {
          img.src = design.previewUrl;
          img.alt = design.title || "Design";
        }
      } else {
        slot.classList.remove("filled");
        if (img) {
          img.src = "";
        }
      }
    },

    updateMergeButton: function() {
      if (!this.elements.mergeButton) return;

      var canMerge = this.canMerge();
      this.elements.mergeButton.disabled = !canMerge || this.state.isMerging;
      
      if (this.state.isMerging) {
        this.elements.mergeButton.textContent = "Merging...";
      } else {
        this.elements.mergeButton.textContent = (window.CreatorI18n && window.CreatorI18n.merge && window.CreatorI18n.merge.button) || "Merge";
      }
    },

    canMerge: function() {
      return !!(this.state.leftSlot && this.state.rightSlot && !this.state.isMerging);
    },

    executeMerge: function() {
      var self = this;
      if (!self.canMerge()) return;

      var ownerId = window.ownerId ||
                    (window.CreatorConfig && window.CreatorConfig.ownerId) || 
                    (window.__st && window.__st.cid) ||
                    (document.querySelector('meta[name="creator-owner-id"]') || {}).content;

      if (!ownerId) {
        console.error("[MergeModal] No owner ID found");
        alert("Please log in to merge designs");
        return;
      }

      self.state.isMerging = true;
      self.updateMergeButton();

      var designId1 = self.state.leftSlot.designId;
      var designId2 = self.state.rightSlot.designId;

      fetch(API_BASE + "?op=merge-designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: ownerId,
          design_id_1: designId1,
          design_id_2: designId2
        })
      })
      .then(function(response) { return response.json(); })
      .then(function(result) {
        if (result.ok && result.job_id) {
          console.log("[MergeModal] Merge job created:", result.job_id);
          
          // Dispatch event before close
          window.dispatchEvent(new CustomEvent("creatorMergeStarted", {
            detail: { jobId: result.job_id, designId1: designId1, designId2: designId2 }
          }));

          self.close();

          // Start polling
          if (window.CreatorPolling && window.CreatorPolling.startPolling) {
            window.CreatorPolling.startPolling(result.job_id);
          }

          // Pulse notification icon
          try {
            window.dispatchEvent(new CustomEvent("creatorJobPollingStarted", {
              detail: { jobId: result.job_id, noPulse: false }
            }));
          } catch (e) {}

          self.showToast("Merge started! Check notifications for progress.");
        } else {
          throw new Error(result.error || "Failed to start merge");
        }
      })
      .catch(function(error) {
        console.error("[MergeModal] Merge error:", error);
        alert("Merge failed: " + (error.message || "Unknown error"));
      })
      .finally(function() {
        self.state.isMerging = false;
        self.updateMergeButton();
      });
    },

    showToast: function(message) {
      if (window.showToast) {
        window.showToast(message);
        return;
      }
      console.log("[MergeModal] Toast:", message);
    }
  };

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      window.CreatorDesignMergeModal.init();
    });
  } else {
    window.CreatorDesignMergeModal.init();
  }

})();
