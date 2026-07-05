/**
 * Creator Chat Actions - Execute whitelisted actions from bot responses
 * SECURITY: Client-side whitelist check as second layer
 */

(function () {
  "use strict";

  const ALLOWED_ACTIONS = new Set([
    "navigate",
    "focus_prompt_input",
    "open_design_type_modal",
    "open_style_modal",
    "suggest_prompt",
    "fill_prompt",
    "open_first_design",
    "show_limit_modal",
    "escalate_to_inbox",
    "connect_support",
  ]);

  const API_BASE = (window.CreatorWidget && window.CreatorWidget.apiBaseUrl) ||
    (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL + "/apps/creator-dispatch") ||
    "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";

  function execute(actionId, params) {
    if (!ALLOWED_ACTIONS.has(actionId)) {
      console.warn("[CreatorChat] Action not allowed:", actionId);
      return { ok: false };
    }

    try {
      switch (actionId) {
        case "navigate": {
          const path = params && params.path ? String(params.path).trim() : "";
          if (!path) return { ok: false };
          const url = path.startsWith("http") ? path : (window.Shopify && window.Shopify.routes && window.Shopify.routes.root ? window.Shopify.routes.root : "") + (path.startsWith("/") ? path : "/" + path);
          window.location.href = url;
          return { ok: true };
        }

        case "focus_prompt_input": {
          const textarea = document.querySelector("[id^='creatorPrompt-']");
          if (textarea) {
            textarea.focus();
            textarea.scrollIntoView({ behavior: "smooth", block: "center" });
            return { ok: true };
          }
          return { ok: false };
        }

        case "fill_prompt": {
          const textarea = document.querySelector("[id^='creatorPrompt-']");
          const prompt = params && params.prompt ? String(params.prompt).slice(0, 500) : "";
          if (!textarea) return { ok: false };
          textarea.value = prompt;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.focus();
          return { ok: true };
        }

        case "open_design_type_modal": {
          if (window.DesignTypeModal && typeof window.DesignTypeModal.open === "function") {
            window.DesignTypeModal.open({});
            return { ok: true };
          }
          return { ok: false };
        }

        case "open_style_modal": {
          const btn = document.querySelector("[data-style-modal-trigger], [aria-controls='style-modal']");
          if (btn) {
            btn.click();
            return { ok: true };
          }
          const modal = document.getElementById("style-modal");
          if (modal && modal.showModal) {
            modal.showModal();
            return { ok: true };
          }
          return { ok: false };
        }

        case "suggest_prompt": {
          const btn = document.querySelector("[id^='suggestPromptBtn-']");
          if (btn && !btn.disabled) {
            btn.click();
            return { ok: true };
          }
          return { ok: false };
        }

        case "open_first_design": {
          const card = document.querySelector(".my-creations__card");
          if (card) {
            card.click();
            return { ok: true };
          }
          return { ok: false };
        }

        case "show_limit_modal": {
          window.dispatchEvent(new CustomEvent("creator-chat-limit-reached", {
            detail: { reset_at: params && params.reset_at, reset_in: params && params.reset_in },
          }));
          return { ok: true };
        }

        case "escalate_to_inbox": {
          window.dispatchEvent(new CustomEvent("creator-chat-escalate-inbox"));
          return { ok: true };
        }

        default:
          return { ok: false };
      }
    } catch (e) {
      console.error("[CreatorChat] Action error:", actionId, e);
      return { ok: false };
    }
  }

  function parseAction(text) {
    if (!text || typeof text !== "string") return null;
    const match = text.match(/\[ACTION:\s*(\{[^}]*(?:\{[^{}]*\}[^{}]*)*\})\s*\]/s) ||
      text.match(/\[ACTION:\s*(\{[^}]*\})\s*\]/s);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  window.CreatorChatActions = {
    execute,
    parseAction,
    ALLOWED_ACTIONS,
    API_BASE,
  };
})();
