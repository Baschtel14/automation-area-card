const CARD_VERSION = "1.0.5";

const fireEvent = (node, type, detail = {}) =>
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

class AutomationAreaCard extends HTMLElement {
  constructor() {
    super();
    this._config = { areas: [] };
    this._lastHtml = "";
    this._popup = null;
    this._opening = false;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        ha-card {
          position: relative; cursor: pointer; height: 100%; box-sizing: border-box;
          overflow: hidden; outline: none;
          transition: box-shadow 180ms ease-in-out, border-color 180ms ease-in-out;
          -webkit-tap-highlight-color: transparent;
        }
        ha-card:focus-visible::after {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: var(--primary-text-color); opacity: 0.08; border-radius: inherit;
        }
        ha-card:focus-visible { border-color: var(--primary-color); }
        ha-ripple:not(:defined) { display: none; }
        ha-card:has(ha-ripple:not(:defined)):hover { background: var(--secondary-background-color); }

        .container {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 8px 12px; padding: 10px;
        }
        .main { display: flex; align-items: center; gap: 12px; flex: 1 1 140px; min-width: 0; }
        .shape {
          position: relative; flex: none; width: 40px; height: 40px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: var(--c); background: color-mix(in srgb, var(--c) 20%, transparent);
        }
        .shape ha-icon { --mdc-icon-size: 24px; }
        .badge {
          position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px;
          padding: 0 3px; box-sizing: border-box; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600; line-height: 1;
          color: var(--text-primary-color, #fff); background: var(--b, var(--primary-color));
          border: 2px solid var(--ha-card-background, var(--card-background-color, #fff));
        }
        .info { flex: 1; min-width: 0; }
        .primary {
          font-size: var(--ha-font-size-m, 14px); font-weight: 500; line-height: 20px;
          color: var(--primary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .secondary {
          font-size: var(--ha-font-size-s, 12px); line-height: 16px;
          color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; flex: 0 1 auto; }
        .chip {
          display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px 4px 8px;
          border-radius: 16px; font-size: 13px; color: var(--primary-text-color);
          background: color-mix(in srgb, var(--c) 14%, transparent);
        }
        .chip ha-icon { --mdc-icon-size: 18px; color: var(--c); }
        .chip b { font-weight: 600; }
        .warn { flex: 1 1 100%; font-size: 12px; color: var(--warning-color, #ff9800); }
      </style>
      <ha-card tabindex="0" role="button">
        <ha-ripple></ha-ripple>
        <div id="content"></div>
      </ha-card>`;
    const card = this.shadowRoot.querySelector("ha-card");
    card.addEventListener("click", () => this._openPopup());
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._openPopup();
      }
    });
  }

  static getConfigElement() {
    return document.createElement("automation-area-card-editor");
  }

  static getStubConfig() {
    return { name: "Automatisierungen", icon: "mdi:robot", show_badge: true, show_last_triggered: true, areas: [] };
  }

  setConfig(config) {
    if (!config) throw new Error("Ungültige Konfiguration");
    this._config = { name: "Automatisierungen", icon: "mdi:robot", show_badge: true, show_last_triggered: true, areas: [], ...config };
    this._lastHtml = "";
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
    if (this._popup) this._renderPopupList();
  }

  connectedCallback() {
    this._warmUp();
  }

  getCardSize() { return 2; }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 3 };
  }

  async _warmUp() {
    if (AutomationAreaCard._warmed || !window.loadCardHelpers) return;
    AutomationAreaCard._warmed = true;
    try {
      const helpers = await window.loadCardHelpers();
      const holder = document.createElement("div");
      holder.style.cssText = "position:fixed;left:-9999px;top:0;width:300px;opacity:0;pointer-events:none;";
      document.body.appendChild(holder);
      const waitForHass = () =>
        new Promise((r) => {
          const t = setInterval(() => { if (this._hass) { clearInterval(t); r(); } }, 100);
          setTimeout(() => { clearInterval(t); r(); }, 3000);
        });
      await waitForHass();
      if (!this._hass) { holder.remove(); return; }
      const autoId = Object.keys(this._hass.states).find((i) => i.startsWith("automation."));
      const cfgs = [{ type: "tile", entity: autoId || "sun.sun" }];
      if (autoId) cfgs.push({ type: "entities", entities: [{ entity: autoId }] });
      for (const cfg of cfgs) {
        const el = await helpers.createCardElement(cfg);
        el.hass = this._hass;
        holder.appendChild(el);
      }
      setTimeout(() => holder.remove(), 3000);
    } catch (e) {
      /* Fallback-CSS greift */
    }
  }

  _areaOfEntity(id) {
    const ent = this._hass.entities?.[id];
    if (!ent) return null;
    if (ent.area_id) return ent.area_id;
    if (ent.device_id) return this._hass.devices?.[ent.device_id]?.area_id || null;
    return null;
  }

  _automations() {
    if (!this._hass) return [];
    const areas = new Set(this._config.areas || []);
    return Object.keys(this._hass.states)
      .filter((id) => id.startsWith("automation."))
      .filter((id) => areas.has(this._areaOfEntity(id)))
      .sort((a, b) => {
        const na = this._hass.states[a].attributes.friendly_name || a;
        const nb = this._hass.states[b].attributes.friendly_name || b;
        return na.localeCompare(nb, "de");
      });
  }

  _update() {
    if (!this._hass) return;
    const cfg = this._config;
    const areas = cfg.areas || [];
    const content = this.shadowRoot.getElementById("content");
    const known = areas.filter((a) => this._hass.areas?.[a]);
    const unknown = areas.filter((a) => !this._hass.areas?.[a]);

    const main = (icon, color, primary, secondary, badge = "") => `
      <div class="main">
        <div class="shape" style="--c:${color}">
          <ha-icon icon="${esc(icon)}"></ha-icon>${badge}
        </div>
        <div class="info">
          <div class="primary">${esc(primary)}</div>
          <div class="secondary">${esc(secondary)}</div>
        </div>
      </div>`;

    let body = "";
    if (areas.length === 0) {
      body = main("mdi:alert-circle-outline", "var(--warning-color, #ff9800)",
        cfg.name || "Automatisierungen", "Keine Bereiche ausgewählt");
    } else if (known.length === 0) {
      body = main("mdi:alert-circle-outline", "var(--error-color, #f44336)",
        cfg.name || "Automatisierungen", `Keine gültigen Bereiche: ${unknown.join(", ")}`);
    } else {
      const ids = this._automations();
      const total = ids.length;
      const active = ids.filter((id) => this._hass.states[id].state === "on").length;
      const inactive = total - active;
      const names = known.map((a) => this._hass.areas[a].name).join(", ");
      const iconColor = total === 0 || active === 0
        ? "var(--state-inactive-color, var(--disabled-text-color))"
        : "var(--state-active-color, var(--primary-color))";
      const badge = cfg.show_badge !== false
        ? `<div class="badge">${total}</div>` : "";
      body = main(cfg.icon || "mdi:robot", iconColor, cfg.name || "Automatisierungen", names, badge);
      body += `
        <div class="chips">
          <div class="chip" style="--c:var(--success-color, #4caf50)">
            <ha-icon icon="mdi:check-circle-outline"></ha-icon><b>${active}</b> Aktiv
          </div>
          <div class="chip" style="--c:${inactive > 0 ? "var(--secondary-text-color)" : "var(--disabled-text-color)"}">
            <ha-icon icon="mdi:close-circle-outline"></ha-icon><b>${inactive}</b> Nicht aktiv
          </div>
        </div>`;
      if (unknown.length) {
        body += `<div class="warn">Unbekannte Bereiche: ${esc(unknown.join(", "))}</div>`;
      }
    }

    const html = `<div class="container">${body}</div>`;
    if (html !== this._lastHtml) {
      this._lastHtml = html;
      content.innerHTML = html;
    }
  }

  _popupTitle() {
    const custom = (this._config.popup_title || "").trim();
    if (custom) return custom;
    const names = (this._config.areas || [])
      .map((a) => this._hass.areas?.[a]?.name)
      .filter(Boolean)
      .join(", ");
    return `${this._config.name || "Automatisierungen"}${names ? " – " + names : ""}`;
  }

  async _openPopup() {
    if (this._popup || this._opening || !this._hass || !(this._config.areas || []).length) return;
    this._opening = true;
    try {
      await Promise.race([
        customElements.whenDefined("ha-adaptive-dialog"),
        new Promise((r) => setTimeout(r, 300)),
      ]);
      await Promise.race([
        customElements.whenDefined("ha-dialog"),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      this._buildPopup();
    } finally {
      this._opening = false;
    }
  }

  _buildPopup() {
    const wrapper = document.createElement("div");
    const root = wrapper.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .row {
          position: relative; display: flex; align-items: center; gap: 16px;
          padding: 8px 4px; min-height: 40px; cursor: pointer; border-radius: 8px;
          overflow: hidden; outline: none; -webkit-tap-highlight-color: transparent;
        }
        .row:focus-visible::after {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: var(--primary-text-color); opacity: 0.08;
        }
        .row.head { cursor: default; border-radius: 0; margin-bottom: 4px;
                    border-bottom: 1px solid var(--divider-color); }
        .row:has(ha-ripple:not(:defined)):hover { background: var(--secondary-background-color); }
        ha-ripple:not(:defined) { display: none; }
        ha-icon { --mdc-icon-size: 24px; flex: none; margin-left: 4px;
                  color: var(--state-inactive-color, var(--disabled-text-color)); }
        .row.on ha-icon { color: var(--state-active-color, var(--primary-color)); }
        .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
                white-space: nowrap; color: var(--primary-text-color); }
        .text { flex: 1; min-width: 0; }
        .text .name { flex: none; }
        .secondary { font-size: var(--ha-font-size-s, 12px); line-height: 16px;
                     color: var(--secondary-text-color); overflow: hidden;
                     text-overflow: ellipsis; white-space: nowrap; }
        ha-switch { flex: none; margin-right: 4px; position: relative; z-index: 1; }

        ha-switch:not(:defined) {
          display: inline-block; position: relative; width: 36px; height: 14px;
          border-radius: 7px; margin: 0 8px;
          background: var(--switch-unchecked-track-color, var(--disabled-color, #bdbdbd)); opacity: 0.6;
        }
        ha-switch:not(:defined)::after {
          content: ""; position: absolute; top: -3px; left: -2px; width: 20px; height: 20px;
          border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,.4);
          background: var(--switch-unchecked-button-color, var(--primary-background-color, #fff));
          transition: transform .15s;
        }
        ha-switch:not(:defined)[checked] { background: var(--switch-checked-track-color, var(--primary-color)); opacity: .5; }
        ha-switch:not(:defined)[checked]::after { transform: translateX(18px);
          background: var(--switch-checked-button-color, var(--primary-color)); }
        .empty { padding: 16px; color: var(--secondary-text-color); }
      </style>
      <div id="list"></div>`;

    const openMoreInfo = (id) => fireEvent(this, "hass-more-info", { entityId: id });
    const failSafe = () => { if (this._popup) { this._popup.sig = ""; this._renderPopupList(); } };

    root.addEventListener("click", (ev) => {
      const path = ev.composedPath();
      const sw = path.find((n) => n.dataset && n.dataset.toggle);
      if (sw) {
        ev.stopPropagation();
        const id = sw.dataset.toggle;
        let p;
        if (id === "__all__") {
          const ids = this._automations();
          const anyOn = ids.some((i) => this._hass.states[i].state === "on");
          p = this._hass.callService("automation", anyOn ? "turn_off" : "turn_on", { entity_id: ids });
        } else {
          const on = this._hass.states[id]?.state === "on";
          p = this._hass.callService("automation", on ? "turn_off" : "turn_on", { entity_id: id });
        }
        Promise.resolve(p).catch(failSafe);
        return;
      }
      const row = path.find((n) => n.dataset && n.dataset.entity);
      if (row) openMoreInfo(row.dataset.entity);
    });

    root.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const t = ev.target;
      if (t && t.dataset && t.dataset.entity) {
        ev.preventDefault();
        openMoreInfo(t.dataset.entity);
      }
    });

    const title = this._popupTitle();
    const tag = customElements.get("ha-adaptive-dialog") ? "ha-adaptive-dialog" : "ha-dialog";
    const dialog = document.createElement(tag);
    dialog.setAttribute("header-title", title);
    dialog.heading = title;
    dialog.setAttribute("width", "medium");
    dialog.style.setProperty("--dialog-content-padding", "0 16px 16px 16px");
    dialog.style.setProperty("--dialog-surface-margin-top", "40px");
    dialog.style.setProperty("--ha-bottom-sheet-height", "90vh");
    dialog.style.setProperty("--ha-bottom-sheet-max-height", "90vh");
    dialog.appendChild(wrapper);

    const onPop = () => {
      if (!history.state?.aacPopup) dialog.open = false;
    };
    dialog.addEventListener("closed", (ev) => {
      if (ev.target !== dialog) return;
      window.removeEventListener("popstate", onPop);
      if (this._popup) clearInterval(this._popup.timer);
      dialog.remove();
      this._popup = null;
      if (history.state?.aacPopup) history.back();
    });

    history.pushState({ aacPopup: true }, "");
    window.addEventListener("popstate", onPop);
    document.body.appendChild(dialog);
    this._popup = { dialog, root, sig: "", onPop };
    this._popup.timer = setInterval(() => this._updateRel(), 30000);
    this._renderPopupList();
    dialog.open = true;
  }

  _relFallback(iso) {
    try {
      const rtf = new Intl.RelativeTimeFormat(this._hass.locale?.language || "de", { numeric: "auto" });
      const diff = (new Date(iso).getTime() - Date.now()) / 1000;
      const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
      for (const [unit, sec] of units) {
        if (Math.abs(diff) >= sec || unit === "second") return rtf.format(Math.round(diff / sec), unit);
      }
    } catch (e) { /* ignore */ }
    return iso;
  }

  _updateRel() {
    if (!this._popup) return;
    this._popup.root.querySelectorAll(".rel").forEach((el) => {
      el.textContent = this._relFallback(el.dataset.dt);
    });
  }

  _renderPopupList() {
    const p = this._popup;
    if (!p) return;
    const showLt = this._config.show_last_triggered !== false;
    const ids = this._automations();
    const sig = ids.map((id) => {
      const s = this._hass.states[id];
      return `${id}:${s.state}:${s.attributes.friendly_name || ""}:${s.attributes.icon || ""}:${s.attributes.last_triggered || ""}`;
    }).join("|") + `|${showLt}`;
    if (sig === p.sig) return;
    p.sig = sig;

    const lang = this._hass.locale?.language || "de";
    const anyOn = ids.some((id) => this._hass.states[id].state === "on");
    let html = "";
    if (ids.length === 0) {
      html = `<div class="empty">Keine Automatisierungen in den ausgewählten Bereichen.</div>`;
    } else {
      html += `<div class="row head">
        <div class="name"><b>Alle</b></div>
        <ha-switch data-toggle="__all__" ${anyOn ? "checked" : ""}></ha-switch>
      </div>`;
      for (const id of ids) {
        const s = this._hass.states[id];
        const on = s.state === "on";
        const na = s.state === "unavailable";
        let secondary = "";
        if (showLt) {
          const lt = s.attributes.last_triggered;
          if (lt) {
            const abs = new Date(lt).toLocaleString(lang, { dateStyle: "medium", timeStyle: "medium" });
            secondary = `<div class="secondary" title="${esc(abs)}">Zuletzt ausgelöst:
              <span class="rel" data-dt="${esc(lt)}">${esc(this._relFallback(lt))}</span></div>`;
          } else {
            secondary = `<div class="secondary">Nie ausgelöst</div>`;
          }
        }
        html += `<div class="row ${on ? "on" : ""}" data-entity="${id}" tabindex="0" role="button">
          <ha-icon icon="${esc(s.attributes.icon || "mdi:robot")}"></ha-icon>
          <div class="text">
            <div class="name">${esc(s.attributes.friendly_name || id)}</div>
            ${secondary}
          </div>
          <ha-switch data-toggle="${id}" ${on ? "checked" : ""} ${na ? "disabled" : ""}></ha-switch>
        </div>`;
      }
    }
    p.root.getElementById("list").innerHTML = html;
  }

  _closePopup() {
    if (this._popup) this._popup.dialog.open = false;
  }

  disconnectedCallback() {
    if (!this._popup) return;
    window.removeEventListener("popstate", this._popup.onPop);
    clearInterval(this._popup.timer);
    this._popup.dialog.remove();
    this._popup = null;
    if (history.state?.aacPopup) history.back();
  }
}

class AutomationAreaCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this._form) {
      const form = document.createElement("ha-form");
      form.schema = [
        { name: "name", selector: { text: {} } },
        { name: "popup_title", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "show_badge", selector: { boolean: {} } },
        { name: "show_last_triggered", selector: { boolean: {} } },
        { name: "areas", selector: { area: { multiple: true } } },
      ];
      form.computeLabel = (s) =>
        ({
          name: "Titel",
          popup_title: "Popup-Titel (leer = automatisch)",
          icon: "Icon",
          show_badge: "Badge mit Gesamtzahl anzeigen",
          show_last_triggered: "Zuletzt ausgelöst im Popup anzeigen",
          areas: "Bereiche",
        }[s.name] || s.name);
      form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._config = { ...this._config, ...ev.detail.value };
        fireEvent(this, "config-changed", { config: this._config });
      });
      this._form = form;
      this.appendChild(form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
  }
}

customElements.define("automation-area-card", AutomationAreaCard);
customElements.define("automation-area-card-editor", AutomationAreaCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "automation-area-card",
  name: "Automation Area Card",
  description: "Zeigt Automatisierungen ausgewählter Bereiche; Popup zum Aktivieren/Deaktivieren.",
  preview: false,
});

console.info(`%c AUTOMATION-AREA-CARD %c v${CARD_VERSION} `, "background:#03a9f4;color:#fff", "");