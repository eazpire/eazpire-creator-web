/* theme/assets/creator-notifications.bootstrap.js
 * FIXED (2026-01-24):
 * - Injects CNM markup FIRST (prevents #cnmOverlay missing race)
 * - CSS policy:
 *    - If window.__CNM_CSS_URL is set => load ONLY that (no fallback)
 *    - Else => inject canonical inline CSS (deterministic)
 * - Emits cnmCssReady event + window.__CNM_CSS_ACTIVE flag
 * - Safe with defer
 */

(function () {
  "use strict";

  if (window.__creatorNotificationsBootstrapInit) return;
  window.__creatorNotificationsBootstrapInit = true;

  const CNM_STYLE_ID = "cnmInlineStyles";
  const CNM_OVERLAY_ID = "cnmOverlay";
  const CNM_CSS_EVENT = "cnmCssReady";
  const NFM_ID = "notification-filter-modal";
  const NFM_STYLE_ID = "cnmNfmStyles";

  // ✅ Canonical inline CSS (exactly as your previous snippet)
  const CNM_CSS_TEXT = `
:root{
  --cnm-modal-bg-1:#0b1220;
  --cnm-modal-bg-2:#070b14;
  --cnm-border:rgba(255,255,255,.10);
  --cnm-border-2:rgba(255,255,255,.14);
  --cnm-text:#e5e7eb;
  --cnm-muted:rgba(229,231,235,.70);
  --cnm-accent:#f59e0b;
  --cnm-accent-hover:#fbbf24;
  --cnm-accent-soft:rgba(245,158,11,.18);
  --cnm-shadow:0 28px 90px rgba(0,0,0,.70);
}

/* Preview-Größe scoped im Modal (kein Theme-Override) */
.cnm-modal{
  --cnm-preview-size: 120px;
  --cnm-preview-pad: 8px; /* Abstand des Designs zum Container-Rand */
}

@media (max-width: 720px){
  .cnm-modal{
    --cnm-preview-size: 120px; /* exakt gleich wie Desktop */
    --cnm-preview-pad: 8px;    /* exakt gleich wie Desktop */
  }
}

.cnm-overlay{
  position:fixed;
  inset:0;
  display:none;
  align-items:center;
  justify-content:center;
  padding:16px;
  background:rgba(0,0,0,.62);
  z-index:9999;
}
.cnm-overlay.is-open{display:flex;}

.cnm-modal{
  width:min(980px, 100%);
  max-height:80vh;
  height:auto;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  border-radius:18px;
  border:1px solid var(--cnm-border);
  box-shadow:var(--cnm-shadow);
  background:
    radial-gradient(1200px 600px at 18% -12%, rgba(245,158,11,.22), transparent 55%),
    radial-gradient(900px 520px at 85% 0%, rgba(59,130,246,.18), transparent 55%),
    linear-gradient(180deg, var(--cnm-modal-bg-1), var(--cnm-modal-bg-2));
}

@media (max-width: 720px){
  .cnm-overlay{
    align-items:flex-end;
    justify-content:center;
    padding:0;
  }
  .cnm-modal{
    width:100%;
    height:85vh;
    max-height:85vh;
    border-radius:18px 18px 0 0;
    border-left:none;
    border-right:none;
    border-bottom:none;
  }
  .cnm-item--generated,
  .cnm-item--saved,
  .cnm-item--job{
    padding: 12px;
  }
}

.cnm-header{
  padding:18px 18px 14px;
  border-bottom:1px solid var(--cnm-border);
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:14px;
  background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,0));
}

.cnm-title{
  margin:0;
  font-size:18px;
  font-weight:900;
  color:var(--cnm-text);
}
.cnm-subtitle{
  margin:6px 0 0;
  font-size:13px;
  color:var(--cnm-muted);
  line-height:1.35;
}

.cnm-close{
  width:40px;
  height:40px;
  border-radius:12px;
  border:1px solid var(--cnm-border);
  background:rgba(255,255,255,.03);
  color:var(--cnm-text);
  cursor:pointer;
  display:grid;
  place-items:center;
  transition:.18s ease;
}
.cnm-close:hover{
  border-color:rgba(245,158,11,.55);
  background:rgba(245,158,11,.08);
}
.cnm-close svg{
  width:18px;height:18px;
  fill:none;
  stroke:currentColor;
  stroke-width:2;
  stroke-linecap:round;
}

.cnm-tabs{
  display:flex;
  gap:10px;
  margin-top:14px;
}
.cnm-tab{
  flex:1;
  padding:10px 12px;
  border-radius:999px;
  border:1px solid var(--cnm-border);
  background:rgba(0,0,0,.25);
  cursor:pointer;
  font-size:13px;
  font-weight:900;
  letter-spacing:.2px;
  color:var(--cnm-text);
  transition:.18s ease;
}
.cnm-tab:hover{
  border-color:rgba(245,158,11,.45);
  box-shadow:0 0 0 4px rgba(245,158,11,.10);
}
.cnm-tab.is-active{
  border-color:rgba(245,158,11,.9);
  background:rgba(245,158,11,.12);
  box-shadow:0 0 0 4px rgba(245,158,11,.14);
}

.cnm-content{
  display:flex;
  flex-direction:column;
  flex:1;
  min-height:0;
}

.cnm-read-tabs{
  display:flex;
  gap:4px;
  padding:10px 18px 0;
  border-bottom:1px solid var(--cnm-border);
  background:rgba(0,0,0,.12);
}
.cnm-read-tab{
  padding:8px 14px;
  border:none;
  background:none;
  color:var(--cnm-muted);
  font-size:13px;
  font-weight:600;
  cursor:pointer;
  border-radius:8px 8px 0 0;
  transition:color .15s, background .15s;
}
.cnm-read-tab:hover{ color:var(--cnm-text); background:rgba(255,255,255,.04); }
.cnm-read-tab.is-active{ color:var(--cnm-accent); background:rgba(245,158,11,.1); }

.cnm-search-row{
  display:flex;
  align-items:center;
  gap:10px;
  padding:12px 18px;
  border-bottom:1px solid var(--cnm-border);
  background:rgba(0,0,0,.18);
}
.cnm-search{
  flex:1;
  min-width:0;
  padding:10px 14px;
  border:1px solid var(--cnm-border);
  border-radius:10px;
  background:rgba(255,255,255,.04);
  color:var(--cnm-text);
  font-size:14px;
  transition:border-color .15s, box-shadow .15s;
}
.cnm-search::placeholder{ color:var(--cnm-muted); }
.cnm-search:focus{ outline:none; border-color:var(--cnm-accent); box-shadow:0 0 0 2px var(--cnm-accent-soft); }
.cnm-filter-btn{
  width:44px;
  height:44px;
  border-radius:50%;
  border:2px solid var(--cnm-accent);
  background:rgba(0,0,0,.4);
  color:var(--cnm-accent);
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  transition:background .15s, border-color .15s, transform .15s;
}
.cnm-filter-btn:hover{ background:rgba(245,158,11,.12); border-color:var(--cnm-accent-hover); transform:scale(1.05); }
.cnm-filter-btn:focus{ outline:2px solid var(--cnm-accent); outline-offset:2px; }
.cnm-filter-btn__icon{ width:20px; height:20px; display:block; }

.cnm-filters{
  padding:14px 18px;
  border-bottom:1px solid var(--cnm-border);
  background:rgba(0,0,0,.18);
}

.cnm-filter-toggle{
  width:100%;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:12px 0;
  border:none;
  background:none;
  color:var(--cnm-text);
  cursor:pointer;
  font-size:14px;
  font-weight:700;
  transition:.18s ease;
  border-radius:8px;
  margin-bottom:0;
}
.cnm-filter-toggle:hover{
  background:rgba(255,255,255,.03);
}
.cnm-filter-toggle:focus{
  outline:2px solid var(--cnm-accent);
  outline-offset:2px;
}

.cnm-filter-toggle-text{
  font-size:14px;
  font-weight:700;
  color:var(--cnm-text);
}

.cnm-filter-toggle-icon{
  width:20px;
  height:20px;
  fill:none;
  stroke:currentColor;
  stroke-width:2;
  stroke-linecap:round;
  stroke-linejoin:round;
  transition:transform .18s ease;
}
.cnm-filter-toggle[aria-expanded="false"] .cnm-filter-toggle-icon{
  transform:rotate(-90deg);
}

.cnm-filter-content{
  overflow:hidden;
  transition:max-height .3s ease, opacity .3s ease, margin-top .3s ease;
  max-height:200px;
  opacity:1;
  margin-top:12px;
}
.cnm-filter-toggle[aria-expanded="false"] + .cnm-filter-content{
  max-height:0;
  opacity:0;
  margin-top:0;
}

.cnm-chip-wrap{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.cnm-chip{
  padding:8px 12px;
  border-radius:999px;
  font-size:12px;
  border:1px solid var(--cnm-border);
  background:rgba(255,255,255,.03);
  cursor:pointer;
  font-weight:900;
  color:rgba(229,231,235,.86);
  transition:.18s ease;
  user-select:none;
}
.cnm-chip:hover{
  border-color:rgba(245,158,11,.45);
  box-shadow:0 0 0 4px rgba(245,158,11,.10);
}
.cnm-chip.is-active{
  border-color:rgba(245,158,11,.95);
  background:rgba(245,158,11,.12);
  box-shadow:0 0 0 4px rgba(245,158,11,.14);
  color:var(--cnm-text);
}

.cnm-list{
  flex:1;
  overflow:auto;
  min-height:0;
  padding:10px 0;
  background:rgba(0,0,0,.12);
}

/* Loading States */
.cnm-item--skeleton{
  pointer-events:none;
}

.cnm-skeleton-preview{
  background: rgba(255,255,255,.05);
  animation: cnm-pulse 2s ease-in-out infinite;
}

.cnm-skeleton-text{
  background: rgba(255,255,255,.05);
  border-radius: 4px;
  animation: cnm-pulse 2s ease-in-out infinite;
}

.cnm-skeleton-text--short{ width: 60px; height: 12px; }
.cnm-skeleton-text--medium{ width: 100px; height: 12px; }
.cnm-skeleton-text--long{ width: 140px; height: 12px; }
.cnm-skeleton-text--block{ width: 100%; height: 14px; margin-bottom: 8px; }

@keyframes cnm-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Empty State */
.cnm-empty{
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--cnm-muted);
}

.cnm-empty-icon{
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(245,158,11,.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  color: var(--cnm-accent);
}

.cnm-empty-title{
  font-size: 16px;
  font-weight: 600;
  color: var(--cnm-text);
  margin-bottom: 8px;
}

.cnm-empty-text{
  font-size: 14px;
  line-height: 1.4;
  max-width: 280px;
}

.cnm-item{
  margin:0 14px 10px;
  padding:12px 14px;
  border-radius:12px;
  border:1px solid var(--cnm-border);
  background:rgba(255,255,255,.03);
  cursor:pointer;
  transition:.18s ease;
  position: relative;
  overflow: hidden;
}
.cnm-item:hover{
  background:rgba(255,255,255,.05);
  border-color: rgba(245,158,11,.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,.15);
}
.cnm-item.is-unread{
  border-color:rgba(245,158,11,.55);
  box-shadow:0 0 0 1px rgba(245,158,11,.12) inset;
}
.cnm-item.is-unread:hover{
  border-color: rgba(245,158,11,.7);
  box-shadow: 0 4px 12px rgba(245,158,11,.2), 0 0 0 1px rgba(245,158,11,.12) inset;
}
.cnm-item__title{
  font-size:14px;
  font-weight:950;
  color:var(--cnm-text);
}
.cnm-item__meta{
  font-size:12px;
  color:var(--cnm-muted);
  margin-top:6px;
  line-height:1.35;
}

/* Scrollbar wie Inspirationen: dünn + orange */
.cnm-list{
  scrollbar-width: thin;
  scrollbar-color: #f59e0b #0b1220;
}
.cnm-list::-webkit-scrollbar{
  width: 6px;
  height: 6px;
}
.cnm-list::-webkit-scrollbar-track{
  background: #0b1220;
  border-radius: 3px;
}
.cnm-list::-webkit-scrollbar-thumb{
  background: #f59e0b;
  border-radius: 3px;
}
.cnm-list::-webkit-scrollbar-thumb:hover{
  background: #fbbf24;
}

/* Notification Card Layout (Wireframe Style) */
.cnm-item--generated,
.cnm-item--saved{
  padding: 12px;
}

.cnm-generated-layout,
.cnm-saved-layout{
  display: grid;
  grid-template-columns: var(--cnm-preview-size) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

/* ✅ Preview Container wie im Design Preview Modal */
.cnm-generated-preview,
.cnm-saved-preview{
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(0,0,0,.2);
  padding: var(--cnm-preview-pad) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--cnm-preview-size);
  height: var(--cnm-preview-size);
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  flex: 0 0 var(--cnm-preview-size);
}

/* ✅ Bild-Darstellung wie im Design Preview Modal */
.cnm-generated-preview img,
.cnm-saved-preview img{
  max-width: 100% !important;
  max-height: 100% !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
  object-position: center !important;
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
  transform: none !important;
  min-width: 90% !important;
  min-height: 90% !important;
}

/* Rechtsbereich: Content (Generated: Titel → Datum → Badges unten rechts) */
.cnm-generated-content{
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
}

.cnm-generated-title{
  font-size: 14px;
  font-weight: 700;
  color: var(--cnm-text);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cnm-generated-datetime{
  font-size: 12px;
  color: var(--cnm-muted);
  line-height: 1.35;
}

.cnm-generated-badges{
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.cnm-generated-badge{
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  color: var(--cnm-text);
  background: rgba(245,158,11,.15);
  border: 1px solid rgba(245,158,11,.3);
}

.cnm-generated-badge--subcategory{
  background: rgba(255,255,255,.08);
  border-color: rgba(255,255,255,.15);
}

/* Pfeil entfernt (Generated Cards) */
.cnm-item--generated-shimmer::after{
  display: none !important;
}

/* Shimmer für Klickbarkeit (Generated Cards) */
.cnm-item--generated-shimmer{
  position: relative;
  overflow: hidden;
}

.cnm-item--generated-shimmer::before{
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(245,158,11,.04), transparent);
  animation: jobProgressShimmer 3s ease-in-out infinite;
}

/* Saved/Published: Titel → Datum → Badges unten rechts (wie Generated) */
.cnm-saved-content--reorder{
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
}

.cnm-saved-title{
  font-size: 14px;
  font-weight: 700;
  color: var(--cnm-text);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cnm-saved-datetime{
  font-size: 12px;
  color: var(--cnm-muted);
  line-height: 1.35;
}

.cnm-saved-badges{
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.cnm-saved-badge{
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  color: var(--cnm-text);
  background: rgba(34,197,94,.15);
  border: 1px solid rgba(34,197,94,.3);
}

.cnm-saved-badge--published{
  background: rgba(34,197,94,.15);
  border: 1px solid rgba(34,197,94,.3);
}

/* Shimmer für Saved/Published (wie Generated) */
.cnm-item--reorder-shimmer{
  position: relative;
  overflow: hidden;
}

.cnm-item--reorder-shimmer::before{
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(245,158,11,.04), transparent);
  animation: jobProgressShimmer 3s ease-in-out infinite;
}

.cnm-item--reorder-shimmer::after{
  display: none !important;
}

/* Saved content (legacy, für Merged/Removed) */
.cnm-saved-content:not(.cnm-saved-content--reorder){
  display: grid;
  grid-template-rows: auto auto;
  gap: 12px;
  min-width: 0;
}

.cnm-saved-header{
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.cnm-saved-prompt-block{
  flex: 1;
  min-width: 0;
}

.cnm-saved-prompt-label{
  font-size: 12px;
  font-weight: 700;
  color: var(--cnm-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.cnm-saved-prompt{
  font-size: 14px;
  font-weight: 600;
  color: var(--cnm-text);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.cnm-saved-status-badge{
  flex-shrink: 0;
  margin-left: auto;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  color: var(--cnm-text);
  background: rgba(34,197,94,.15);
  border: 1px solid rgba(34,197,94,.3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.cnm-saved-meta-chips{
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.cnm-saved-meta-chip{
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255,255,255,.05);
  color: var(--cnm-muted);
  white-space: nowrap;
}

/* Job Item Layout (for active jobs) */
.cnm-item--job {
  padding: 14px 16px;
}

.cnm-item--job-active {
  position: relative;
  overflow: hidden;
}

.cnm-item--job-active::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(245,158,11,.03), transparent);
  animation: jobProgressShimmer 3s ease-in-out infinite;
}

.cnm-job-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.cnm-job-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(245,158,11,.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cnm-accent);
  position: relative;
}

.cnm-job-icon--active {
  background: rgba(245,158,11,.18);
  box-shadow: 0 0 0 2px rgba(245,158,11,.2);
}

.cnm-job-pulse-ring {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  border: 1px solid var(--cnm-accent);
  border-radius: 10px;
  animation: jobPulseRing 2s ease-in-out infinite;
  opacity: 0.7;
}

.cnm-job-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cnm-job-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cnm-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.cnm-job-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.cnm-job-status {
  font-size: 12px;
  font-weight: 700;
  color: var(--cnm-accent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: relative;
}

.cnm-job-status::after {
  content: '';
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 4px;
  background: var(--cnm-accent);
  border-radius: 50%;
  animation: jobStatusDot 1.5s ease-in-out infinite;
}

.cnm-job-time {
  font-size: 11px;
  color: var(--cnm-muted);
  white-space: nowrap;
  font-weight: 500;
  font-family: 'Courier New', monospace;
  background: rgba(245,158,11,.08);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(245,158,11,.15);
}

@keyframes jobPulseRing {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.1); opacity: 0.3; }
}

@keyframes jobProgressShimmer {
  0% { left: -100%; }
  50% { left: 100%; }
  100% { left: 100%; }
}

@keyframes jobStatusDot {
  0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
  50% { opacity: 0.5; transform: translateY(-50%) scale(0.8); }
}

/* Mobile adjustments */
@media (max-width: 720px) {
  .cnm-item--generated,
  .cnm-item--saved,
  .cnm-item--job { padding: 12px; }

  .cnm-generated-layout,
  .cnm-saved-layout { grid-template-columns: var(--cnm-preview-size) minmax(0, 1fr); }

  .cnm-generated-header,
  .cnm-saved-header { gap: 8px; }

  .cnm-generated-status-badge,
  .cnm-saved-status-badge { font-size: 11px; padding: 4px 8px; }

  .cnm-generated-meta-chips,
  .cnm-saved-meta-chips { gap: 6px; }

  .cnm-generated-meta-chip,
  .cnm-saved-meta-chip { font-size: 10px; padding: 3px 6px; }

  .cnm-job-layout { gap: 10px; }

  .cnm-job-icon { width: 28px; height: 28px; }

  .cnm-job-icon--active .cnm-job-pulse-ring { top: -1px; left: -1px; right: -1px; bottom: -1px; }

  .cnm-job-title { font-size: 13px; }

  .cnm-job-status { font-size: 11px; }

  .cnm-job-status::after { width: 3px; height: 3px; right: -6px; }

  .cnm-job-meta { gap: 8px; }

  .cnm-job-time { font-size: 10px; padding: 1px 4px; }
}

/* ── EAZ Transaction Items ── */
.cnm-tx{
  margin:0 14px 6px;
  padding:12px 14px;
  border-radius:12px;
  border:1px solid var(--cnm-border);
  background:rgba(255,255,255,.03);
  display:grid;
  grid-template-columns:1fr auto;
  gap:4px 12px;
  align-items:center;
  transition:.18s ease;
}
.cnm-tx:hover{
  background:rgba(255,255,255,.05);
  border-color:rgba(255,255,255,.18);
}

/* Farbige linke Border */
.cnm-tx--credit{
  border-left:3px solid rgba(34,197,94,.7);
}
.cnm-tx--debit{
  border-left:3px solid rgba(239,68,68,.7);
}
.cnm-tx--refund{
  border-left:3px solid rgba(59,130,246,.7);
}
.cnm-tx--adjustment{
  border-left:3px solid rgba(245,158,11,.7);
}

.cnm-tx__reason{
  font-size:14px;
  font-weight:600;
  color:var(--cnm-text);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  grid-column:1;
}

.cnm-tx__amount{
  font-size:15px;
  font-weight:800;
  font-family:'Courier New',monospace;
  text-align:right;
  grid-column:2;
  grid-row:1 / span 2;
  align-self:center;
  padding:4px 8px;
  border-radius:8px;
}
.cnm-tx__amount--credit{
  color:#22c55e;
  background:rgba(34,197,94,.1);
}
.cnm-tx__amount--debit{
  color:#ef4444;
  background:rgba(239,68,68,.1);
}
.cnm-tx__amount--refund{
  color:#3b82f6;
  background:rgba(59,130,246,.1);
}
.cnm-tx__amount--adjustment{
  color:#f59e0b;
  background:rgba(245,158,11,.1);
}

.cnm-tx__meta{
  font-size:12px;
  color:var(--cnm-muted);
  display:flex;
  align-items:center;
  gap:8px;
  grid-column:1;
}

.cnm-tx__badge{
  display:inline-block;
  padding:2px 8px;
  border-radius:999px;
  font-size:10px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:.5px;
}
.cnm-tx__badge--credit{
  background:rgba(34,197,94,.15);
  color:#22c55e;
  border:1px solid rgba(34,197,94,.3);
}
.cnm-tx__badge--debit{
  background:rgba(239,68,68,.15);
  color:#ef4444;
  border:1px solid rgba(239,68,68,.3);
}
.cnm-tx__badge--refund{
  background:rgba(59,130,246,.15);
  color:#3b82f6;
  border:1px solid rgba(59,130,246,.3);
}
.cnm-tx__badge--adjustment{
  background:rgba(245,158,11,.15);
  color:#f59e0b;
  border:1px solid rgba(245,158,11,.3);
}

/* Transactions loading spinner */
.cnm-tx-loading{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:40px 20px;
  gap:12px;
  color:var(--cnm-muted);
  font-size:14px;
}
.cnm-tx-spinner{
  width:24px;height:24px;
  border:3px solid rgba(255,255,255,.1);
  border-top-color:var(--cnm-accent);
  border-radius:50%;
  animation:cnm-spin 1s linear infinite;
}

/* Transactions load-more button */
.cnm-tx-load-more{
  display:block;
  margin:8px auto 4px;
  padding:8px 20px;
  border-radius:999px;
  border:1px solid var(--cnm-border);
  background:rgba(255,255,255,.03);
  color:var(--cnm-text);
  font-size:13px;
  font-weight:600;
  cursor:pointer;
  transition:.18s ease;
}
.cnm-tx-load-more:hover{
  border-color:rgba(245,158,11,.45);
  background:rgba(245,158,11,.08);
}

@media (max-width: 720px){
  .cnm-tx{ padding:10px 12px; margin:0 10px 5px; }
  .cnm-tx__reason{ font-size:13px; }
  .cnm-tx__amount{ font-size:14px; padding:3px 6px; }
  .cnm-tx__meta{ font-size:11px; gap:6px; }
  .cnm-tx__badge{ font-size:9px; padding:2px 6px; }
}
`.trim();

  function setCssActiveFlag(isActive, meta) {
    window.__CNM_CSS_ACTIVE = !!isActive;
    window.__CNM_CSS_META = meta || null;
    try {
      window.dispatchEvent(new CustomEvent(CNM_CSS_EVENT, { detail: { ok: !!isActive, meta: meta || null } }));
    } catch (e) {}
  }

  function injectNotificationFilterModalOnce() {
    if (document.getElementById(NFM_ID)) return true;
    if (!document.body) return false;

    const nfmCss = `
.notification-filter-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.62);z-index:10000;}
.notification-filter-modal[aria-hidden="false"]{display:flex;}
.notification-filter-modal__backdrop{position:absolute;inset:0;cursor:pointer;}
.notification-filter-modal__dialog{position:relative;width:min(360px,100%);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;border:1px solid var(--cnm-border);background:var(--cnm-modal-bg-1);box-shadow:var(--cnm-shadow);}
.notification-filter-modal__header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--cnm-border);}
.notification-filter-modal__title{margin:0;font-size:16px;font-weight:700;color:var(--cnm-text);}
.notification-filter-modal__close{width:32px;height:32px;border:none;background:none;color:var(--cnm-text);font-size:20px;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background .15s;}
.notification-filter-modal__close:hover{background:rgba(255,255,255,.08);}
.notification-filter-modal__body{overflow-y:auto;padding:8px 0;}
#notificationFilterList{display:flex;flex-direction:column;gap:2px;}
.notification-filter-modal__row{display:block;width:100%;padding:10px 16px;border:none;background:none;color:var(--cnm-text);font-size:14px;text-align:left;cursor:pointer;transition:background .15s,border-color .15s;border-left:3px solid transparent;}
.notification-filter-modal__row:hover{background:rgba(255,255,255,.05);}
.notification-filter-modal__row.is-active{border-left-color:var(--cnm-accent);background:rgba(245,158,11,.08);}
`;

    if (!document.getElementById(NFM_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = NFM_STYLE_ID;
      style.setAttribute("data-cnm-nfm", "inline");
      style.textContent = nfmCss;
      if (document.head) document.head.appendChild(style);
    }

    const nfm = document.createElement("div");
    nfm.id = NFM_ID;
    nfm.className = "notification-filter-modal";
    nfm.setAttribute("aria-hidden", "true");
    nfm.innerHTML = `
      <div class="notification-filter-modal__backdrop"></div>
      <div class="notification-filter-modal__dialog">
        <div class="notification-filter-modal__header">
          <h3 class="notification-filter-modal__title">${window.CreatorI18n?.filter || 'Filter'}</h3>
          <button type="button" class="notification-filter-modal__close" aria-label="${window.CreatorI18n?.filterClose || 'Close filter'}">×</button>
        </div>
        <div class="notification-filter-modal__body">
          <div id="notificationFilterList" role="list"></div>
        </div>
      </div>
    `;
    document.body.appendChild(nfm);
    return true;
  }

  function injectModalMarkupOnce() {
    if (document.getElementById(CNM_OVERLAY_ID)) return true;
    if (!document.body) return false;

    const overlay = document.createElement("div");
    overlay.className = "cnm-overlay";
    overlay.id = CNM_OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = `
      <section class="cnm-modal" role="dialog" aria-modal="true" aria-labelledby="cnmTitle">
        <header class="cnm-header">
          <div class="cnm-header__left">
            <h3 class="cnm-title" id="cnmTitle">${window.CreatorI18n?.notificationsTitle || 'Notifications'}</h3>
            <p class="cnm-subtitle">${window.CreatorI18n?.notificationsSubtitle || 'Tabs - Search - Filter - Read/Unread - Click = read'}</p>

            <nav class="cnm-tabs" aria-label="${window.CreatorI18n?.tabsAria || 'Notification Tabs'}">
              <button type="button" class="cnm-tab is-active" data-cnm-tab="jobs">${window.CreatorI18n?.activeJobs || 'Active Jobs'}</button>
              <button type="button" class="cnm-tab" data-cnm-tab="notifs">${window.CreatorI18n?.notificationsTab || 'Notifications'}</button>
              <button type="button" class="cnm-tab" data-cnm-tab="transactions">${window.CreatorI18n?.transactionsTab || 'EAZ Transactions'}</button>
            </nav>
          </div>

          <button type="button" class="cnm-close" id="cnmClose" aria-label="${window.CreatorI18n?.close || 'Close'}" title="${window.CreatorI18n?.close || 'Close'}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18"></path>
            </svg>
          </button>
        </header>

        <div class="cnm-content">
          <nav class="cnm-read-tabs" aria-label="${window.CreatorI18n?.readUnreadAria || 'Read / Unread'}">
            <button type="button" class="cnm-read-tab is-active" data-cnm-read="unread">${window.CreatorI18n?.unread || 'Unread'}</button>
            <button type="button" class="cnm-read-tab" data-cnm-read="read">${window.CreatorI18n?.read || 'Read'}</button>
          </nav>
          <div class="cnm-search-row">
            <input type="search" id="cnmSearch" class="cnm-search" placeholder="${window.CreatorI18n?.searchPlaceholder || 'Search notifications...'}" autocomplete="off" aria-label="${window.CreatorI18n?.searchAria || 'Search notifications'}">
            <button type="button" id="cnmFilterBtn" class="cnm-filter-btn" aria-label="${window.CreatorI18n?.filter || 'Filter'}">
              <svg class="cnm-filter-btn__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 5H17M6 10H14M8 15H12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <circle cx="3" cy="5" r="1.5" fill="currentColor"/>
                <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="15" r="1.5" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div class="cnm-list" id="cnmList" aria-label="${window.CreatorI18n?.listAria || 'List'}"></div>
        </div>
      </section>
    `;

    document.body.appendChild(overlay);
    return true;
  }

  function injectInlineCssOnce() {
    if (!document.head) return false;

    const existing = document.getElementById(CNM_STYLE_ID);
    if (existing) {
      setCssActiveFlag(true, { mode: "inline", reason: "already_present" });
      return true;
    }

    const style = document.createElement("style");
    style.id = CNM_STYLE_ID;
    style.setAttribute("data-cnm-css", "inline");
    style.textContent = CNM_CSS_TEXT;
    document.head.appendChild(style);

    setCssActiveFlag(true, { mode: "inline", reason: "injected" });
    return true;
  }

  function loadExternalCss(href) {
    return new Promise((resolve) => {
      if (!document.head) return resolve(false);

      const url = String(href || "").trim();
      if (!url) return resolve(false);

      const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
        .find((l) => String(l.getAttribute("href") || "") === url);

      if (existing) {
        setCssActiveFlag(true, { mode: "external", href: url, reason: "already_linked" });
        return resolve(true);
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.setAttribute("data-cnm-css", "external");

      link.onload = () => {
        setCssActiveFlag(true, { mode: "external", href: url, reason: "loaded" });
        resolve(true);
      };

      link.onerror = () => {
        console.error("[CNM] ❌ External CNM CSS failed to load:", url);
        setCssActiveFlag(false, { mode: "external", href: url, reason: "failed" });
        resolve(false);
      };

      document.head.appendChild(link);
    });
  }

  async function ensureCnmCssPresent() {
    const externalHref = (typeof window.__CNM_CSS_URL === "string" && window.__CNM_CSS_URL.trim()) || "";
    if (externalHref) return await loadExternalCss(externalHref);
    return injectInlineCssOnce();
  }

  async function boot() {
    // ✅ Markup FIRST (kills “#cnmOverlay missing” race)
    const markupOk = injectModalMarkupOnce();
    if (!markupOk) return;

    injectNotificationFilterModalOnce();

    const cssOk = await ensureCnmCssPresent();
    if (!cssOk) {
      console.warn("[CNM] ❌ CSS not active → modal should refuse to open (no broken layout).");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();