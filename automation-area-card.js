const CARD_VERSION = "1.1.0";

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
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        ha-card {
          position: relative; cursor: pointer; padding: 12px 16px; height: 100%;
          box-sizing: border-box; outline: none; overflow: hidden;
          transition: box-shadow 180ms ease-in-out, border-color 180ms ease-in-out;
          -webkit-tap-highlight-color: transparent;
        }
        ha-card:focus-visible::after {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: var(--primary-text-color); opacity: 0.08; border-radius: inherit;
        }
        ha-card:focus-visible { border-color: var(--primary-color); }
        .title { font-size: 1.1em; font-weight: 500; margin-bottom: 8px; }
        .row { display: flex; justify-content: space-around; align-items: center; }
        .stat { text-align: center; min-width: 70px; }
        .num { font-size: 1.8em; font-weight: 600; line-height: 1.1; }
        .label { font-size: 0.8em; color: var(--secondary-text-color); }
        ha-icon { --mdc-icon-size: 28px; }
        .warn { margin-top: 8px; font-size: 0.85em; color: var(--warning-color, #ff9800); }
        .err { color: var(--error-color, #f44336); font-weight: bold; }
        ha-ripple:not(:defined) { display: none; }
        ha-card:has(ha-ripple:not(:defined)):hover { background: var(--secondary-background-color); }
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

  connectedCallback() {
    this._warmUp();
  }

  getCardSize() { return 2; }

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
    const areas = this._config.areas || [];
    const content = this.shadowRoot.getElementById("content");
    let html = "";
    if (this._config.name) html += `<div class="title">${esc(this._config.name)}</div>`;

    const known = areas.filter((a) => this._hass.areas?.[a]);
    const unknown = areas.filter((a) => !this._hass.areas?.[a]);

    if (areas.length === 0) {
      html += `<div class="err">Keine Bereiche ausgewählt (Karte bearbeiten)</div>`;
    } else if (known.length === 0) {
      html += `<div class="err">Keine gültigen Bereiche: ${esc(unknown.join(", "))}</div>`;
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
        html += `<div class="warn"><ha-icon icon="mdi:alert-outline" style="--mdc-icon-size:16px"></ha-icon> Unbekannte Bereiche: ${esc(unknown.join(", "))}</div>`;
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
      html += `<div class="row head">
        <div class="name"><b>Alle</b></div>
        <ha-switch data-toggle="__all__" ${anyOn ? "checked" : ""}></ha-switch>
      </div>`;
      for (const id of ids) {
        const s = this._hass.states[id];
        const on = s.state === "on";
        const na = s.state === "unavailable";
        html += `<div class="row ${on ? "on" : ""}" data-entity="${id}" tabindex="0" role="button">
          <ha-ripple></ha-ripple>
          <ha-icon icon="${esc(s.attributes.icon || "mdi:robot")}"></ha-icon>
          <div class="name">${esc(s.attributes.friendly_name || id)}</div>
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