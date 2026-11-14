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
    if (this._popup) this._renderPopupList();
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

  _popupTitle() {
    const names = (this._config.areas || [])
      .map((a) => this._hass.areas?.[a]?.name)
      .filter(Boolean)
      .join(", ");
    return `${this._config.name || "Automatisierungen"}${names ? " – " + names : ""}`;
  }

  async _openPopup() {
    if (this._popup || !this._hass || !(this._config.areas || []).length) return;
    await Promise.race([
      customElements.whenDefined("ha-dialog"),
      new Promise((r) => setTimeout(r, 1500)),
    ]);

    const wrapper = document.createElement("div");
    const root = wrapper.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .row { display:flex; align-items:center; gap:16px; padding:8px 4px;
               min-height:40px; cursor:pointer; border-radius:8px; }
        .row:hover { background: var(--secondary-background-color); }
        .head { border-bottom:1px solid var(--divider-color); margin-bottom:4px;
                border-radius:0; cursor:default; }
        .head:hover { background:none; }
        ha-icon { --mdc-icon-size:24px; flex:none; color:var(--state-inactive-color, var(--disabled-text-color)); }
        .row.on ha-icon { color: var(--state-active-color, var(--primary-color)); }
        .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;
                white-space:nowrap; color:var(--primary-text-color); }
        .sw { position:relative; width:36px; height:14px; border-radius:7px; flex:none;
              cursor:pointer; margin:0 8px;
              background:var(--switch-unchecked-track-color, var(--disabled-color, #bdbdbd)); opacity:.6;
              transition: background .15s; }
        .sw::after { content:""; position:absolute; top:-3px; left:-2px; width:20px; height:20px;
              border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,.4);
              background:var(--switch-unchecked-button-color, var(--primary-background-color, #fff));
              transition: transform .15s, background .15s; }
        .sw.on { background:var(--switch-checked-track-color, var(--primary-color)); opacity:.5; }
        .sw.on::after { transform:translateX(18px);
              background:var(--switch-checked-button-color, var(--primary-color)); }
        .sw.na { pointer-events:none; opacity:.25; }
        .empty { padding:16px; color:var(--secondary-text-color); }
      </style>
      <div id="list"></div>`;

    root.addEventListener("click", (ev) => {
      const path = ev.composedPath();
      const sw = path.find((n) => n.dataset && n.dataset.toggle);
      if (sw) {
        ev.stopPropagation();
        const id = sw.dataset.toggle;
        if (id === "__all__") {
          const ids = this._automations();
          const anyOn = ids.some((i) => this._hass.states[i].state === "on");
          this._hass.callService("automation", anyOn ? "turn_off" : "turn_on", { entity_id: ids });
        } else {
          const on = this._hass.states[id]?.state === "on";
          this._hass.callService("automation", on ? "turn_off" : "turn_on", { entity_id: id });
        }
        return;
      }
      const row = path.find((n) => n.dataset && n.dataset.entity);
      if (row) fireEvent(this, "hass-more-info", { entityId: row.dataset.entity });
    });

    const title = this._popupTitle();
    const dialog = document.createElement("ha-dialog");
    dialog.setAttribute("header-title", title);
    dialog.heading = title;
    dialog.setAttribute("width", "medium");
    dialog.style.setProperty("--dialog-content-padding", "0 16px 16px 16px");
    dialog.appendChild(wrapper);
    dialog.addEventListener("closed", (ev) => {
      if (ev.target !== dialog) return;
      dialog.remove();
      this._popup = null;
    });

    document.body.appendChild(dialog);
    this._popup = { dialog, root, sig: "" };
    this._renderPopupList();
    dialog.open = true;
  }

  _renderPopupList() {
    const p = this._popup;
    if (!p) return;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const ids = this._automations();
    const sig = ids.map((id) => {
      const s = this._hass.states[id];
      return `${id}:${s.state}:${s.attributes.friendly_name || ""}:${s.attributes.icon || ""}`;
    }).join("|");
    if (sig === p.sig) return;
    p.sig = sig;

    const anyOn = ids.some((id) => this._hass.states[id].state === "on");
    let html = "";
    if (ids.length === 0) {
      html = `<div class="empty">Keine Automatisierungen in den ausgewählten Bereichen.</div>`;
    } else {
      html += `<div class="row head ${anyOn ? "on" : ""}">
        <div class="name"><b>Alle</b></div>
        <div class="sw ${anyOn ? "on" : ""}" data-toggle="__all__"></div>
      </div>`;
      for (const id of ids) {
        const s = this._hass.states[id];
        const on = s.state === "on";
        const na = s.state === "unavailable";
        html += `<div class="row ${on ? "on" : ""}" data-entity="${id}">
          <ha-icon icon="${esc(s.attributes.icon || "mdi:robot")}"></ha-icon>
          <div class="name">${esc(s.attributes.friendly_name || id)}</div>
          <div class="sw ${on ? "on" : ""} ${na ? "na" : ""}" data-toggle="${id}"></div>
        </div>`;
      }
    }
    p.root.getElementById("list").innerHTML = html;
  }

  _popupTitle() {
    const names = (this._config.areas || [])
      .map((a) => this._hass.areas?.[a]?.name)
      .filter(Boolean)
      .join(", ");
    return `${this._config.name || "Automatisierungen"}${names ? " – " + names : ""}`;
  }

  _closePopup() {
    if (this._popup) this._popup.dialog.open = false;
  }

  disconnectedCallback() {
    if (this._popup) {
      this._popup.dialog.remove();
      this._popup = null;
    }
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