const CARD_VERSION = "1.0.0";

const fireEvent = (node, type, detail = {}) =>
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

class AutomationAreaCard extends HTMLElement {
  constructor() {
    super();
    this._config = { areas: [] };
    this._lastHtml = "";
    this._popup = null;
    this._popupKey = "";
    this._onKey = (e) => { if (e.key === "Escape") this._closePopup(); };
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { cursor: pointer; padding: 12px 16px; }
        .title { font-size: 1.1em; font-weight: 500; margin-bottom: 8px; }
        .row { display: flex; justify-content: space-around; align-items: center; }
        .stat { text-align: center; min-width: 70px; }
        .num { font-size: 1.8em; font-weight: 600; line-height: 1.1; }
        .label { font-size: 0.8em; color: var(--secondary-text-color); }
        ha-icon { --mdc-icon-size: 28px; }
        .warn { margin-top: 8px; font-size: 0.85em; color: var(--warning-color, #ff9800); }
        .err { color: var(--error-color, #f44336); font-weight: bold; }
      </style>
      <ha-card><div id="content"></div></ha-card>`;
    this.shadowRoot.querySelector("ha-card").addEventListener("click", () => this._openPopup());
  }

  static getConfigElement() {
    return document.createElement("automation-area-card-editor");
  }

  static getStubConfig() {
    return { name: "Automatisierungen", areas: [] };
  }

  setConfig(config) {
    if (!config) throw new Error("Ungültige Konfiguration");
    this._config = { name: "Automatisierungen", areas: [], ...config };
    this._lastHtml = "";
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
    if (this._popup) {
      this._popup.card.hass = hass;
      const ids = this._automations();
      const key = ids.join("|");
      if (key !== this._popupKey) {
        this._popupKey = key;
        this._popup.card.setConfig(this._entitiesConfig(ids));
      }
    }
  }

  getCardSize() { return 2; }

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
    const areas = this._config.areas || [];
    const content = this.shadowRoot.getElementById("content");
    let html = "";
    if (this._config.name) html += `<div class="title">${this._config.name}</div>`;

    const known = areas.filter((a) => this._hass.areas?.[a]);
    const unknown = areas.filter((a) => !this._hass.areas?.[a]);

    if (areas.length === 0) {
      html += `<div class="err">Keine Bereiche ausgewählt (Karte bearbeiten)</div>`;
    } else if (known.length === 0) {
      html += `<div class="err">Keine gültigen Bereiche: ${unknown.join(", ")}</div>`;
    } else {
      const ids = this._automations();
      const total = ids.length;
      const active = ids.filter((id) => this._hass.states[id].state === "on").length;
      const inactive = total - active;
      const stat = (icon, color, num, label) => `
        <div class="stat">
          <ha-icon icon="${icon}" style="color:${color}"></ha-icon>
          <div class="num">${num}</div>
          <div class="label">${label}</div>
        </div>`;
      html += `<div class="row">
        ${stat("mdi:cog-outline", "var(--primary-color)", total, "Gesamt")}
        ${stat("mdi:check-circle-outline", "var(--success-color, #4caf50)", active, "Aktiv")}
        ${stat("mdi:close-circle-outline", inactive > 0 ? "var(--error-color, #f44336)" : "var(--disabled-text-color)", inactive, "Inaktiv")}
      </div>`;
      if (unknown.length) {
        html += `<div class="warn"><ha-icon icon="mdi:alert-outline" style="--mdc-icon-size:16px"></ha-icon> Unbekannte Bereiche: ${unknown.join(", ")}</div>`;
      }
    }
    if (html !== this._lastHtml) {
      this._lastHtml = html;
      content.innerHTML = html;
    }
  }

  _entitiesConfig(ids) {
    const names = (this._config.areas || [])
      .map((a) => this._hass.areas?.[a]?.name)
      .filter(Boolean)
      .join(", ");
    return {
      type: "entities",
      title: `${this._config.name || "Automatisierungen"}${names ? " – " + names : ""}`,
      show_header_toggle: true,
      state_color: true,
      entities: ids.map((entity) => ({ entity })),
    };
  }

  async _openPopup() {
    if (this._popup || !this._hass || !(this._config.areas || []).length) return;
    const helpers = await window.loadCardHelpers();
    const ids = this._automations();
    this._popupKey = ids.join("|");

    const card = await helpers.createCardElement(this._entitiesConfig(ids));
    card.hass = this._hass;

    const overlay = document.createElement("div");
    const root = overlay.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .backdrop {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center;
        }
        .box {
          position: relative; width: 92%; max-width: 520px; max-height: 85vh;
          overflow-y: auto; border-radius: var(--ha-card-border-radius, 12px);
        }
        .close {
          position: absolute; top: 8px; right: 8px; z-index: 1;
          background: none; border: none; cursor: pointer;
          color: var(--primary-text-color); padding: 4px;
        }
      </style>
      <div class="backdrop">
        <div class="box">
          <button class="close" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button>
          <div id="slot"></div>
        </div>
      </div>`;
    root.getElementById("slot").appendChild(card);
    root.querySelector(".close").addEventListener("click", () => this._closePopup());
    root.querySelector(".backdrop").addEventListener("click", (e) => {
      if (e.target.classList.contains("backdrop")) this._closePopup();
    });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", this._onKey);
    this._popup = { overlay, card };
  }

  _closePopup() {
    if (!this._popup) return;
    this._popup.overlay.remove();
    document.removeEventListener("keydown", this._onKey);
    this._popup = null;
  }

  disconnectedCallback() { this._closePopup(); }
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
        { name: "areas", selector: { area: { multiple: true } } },
      ];
      form.computeLabel = (s) => ({ name: "Titel", areas: "Bereiche" }[s.name] || s.name);
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