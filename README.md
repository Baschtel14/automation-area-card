# Automation Area Card

Eine Home-Assistant-Dashboard-Karte, die Automatisierungen ausgewählter Bereiche (Areas) zusammenfasst. Sie sieht aus wie eine Standard-Tile-Karte und zeigt, wie viele Automatisierungen aktiv und nicht aktiv sind. Ein Tipp auf die Karte öffnet ein Popup, in dem sich jede Automatisierung per Schalter ein- und ausschalten lässt. Ein Tipp auf eine Zeile öffnet das Standard-Detailfenster von Home Assistant.

## Funktionen

- Visueller Editor mit Mehrfachauswahl der Bereiche
- Tile-Design mit rundem Icon, Badge (Gesamtzahl), Titel und Bereichsnamen
- Chips für **Aktiv** und **Nicht aktiv**, in einer Zeile mit dem Text und rechtsbündig. Sie brechen nur um, wenn der Platz nicht reicht.
- Hover-, Fokus- und Klick-Animationen wie bei den Standardkarten (`ha-ripple`), bedienbar per Tastatur (Tab, Enter, Leertaste)
- Popup mit nativen `ha-switch`-Schaltern, einem Sammelschalter "Alle" und Live-Aktualisierung
- Popup als Dialog am Desktop und als Bottom-Sheet auf dem Handy, mit fester Oberkante wie bei den offiziellen More-Info-Fenstern
- Zurück-Geste oder Zurück-Taste schließt nur das Popup und verlässt nicht die Seite
- Einstellbarer Karten- und Popup-Titel
- Warnung bei unbekannten oder gelöschten Bereichen

## Voraussetzungen

- Home Assistant 2026.3 oder neuer wird empfohlen. Das Popup nutzt interne Dialog-Komponenten von Home Assistant, die sich mit 2026.3 geändert haben. Auf älteren Versionen greift eine Rückfallebene, die Darstellung kann dort abweichen.
- HACS

## Installation über HACS

1. HACS öffnen und oben rechts auf die drei Punkte klicken.
2. **Benutzerdefinierte Repositories** wählen.
3. URL `https://github.com/baschtel14/automation-area-card` eintragen und als Kategorie **Dashboard** wählen.
4. Die Karte in HACS suchen und herunterladen.
5. Browser-Cache leeren (Strg+F5), in der Companion-App den Frontend-Cache leeren.

Falls HACS die Ressource nicht automatisch anlegt, unter **Einstellungen → Dashboards → Ressourcen** manuell hinzufügen:

| URL | Typ |
|-----|-----|
| `/hacsfiles/automation-area-card/automation-area-card.js` | JavaScript-Modul |

## Verwendung

Die Karte lässt sich über **Karte hinzufügen** auswählen. Alle Optionen sind im visuellen Editor einstellbar.

### YAML

```yaml
type: custom:automation-area-card
name: Automatisierungen
popup_title: Automatisierungen Sebastian
icon: mdi:robot
show_badge: true
areas:
  - schlafzimmer
  - sebastian
```

## Optionen

| Option        | Typ               | Standard            | Beschreibung                                                                  |
|---------------|-------------------|---------------------|-------------------------------------------------------------------------------|
| `type`        | string            | **Pflicht**         | `custom:automation-area-card`                                                 |
| `areas`       | Liste von Strings | `[]`                | **Area-IDs** (nicht die Anzeigenamen)                                         |
| `name`        | string            | `Automatisierungen` | Titel auf der Karte                                                           |
| `popup_title` | string            | leer                | Titel des Popups. Leer = Karten-Titel plus Bereichsnamen                      |
| `icon`        | string            | `mdi:robot`         | Icon im runden Symbol der Karte                                               |
| `show_badge`  | boolean           | `true`              | Badge mit der Gesamtzahl am Icon                                              |
| `show_last_triggered`  | boolean           | `true`     | Zeile 'Zuletzt ausgelöst' im Popup                                            |

Die Area-ID siehst du, wenn du die Bereiche im Editor auswählst und danach in den YAML-Modus wechselst.

## Funktionsweise

- Eine Automatisierung gehört zu einem Bereich, wenn sie selbst oder ihr Gerät diesem Bereich zugeordnet ist.
- "Aktiv" zählt Automatisierungen mit dem Status `on`. Alles andere (`off`, `unavailable`) gilt als nicht aktiv.
- Das Icon ist farbig, solange mindestens eine Automatisierung aktiv ist. Sonst ist es grau.
- Der Sammelschalter "Alle" ist an, wenn mindestens eine Automatisierung läuft. Ein Tipp schaltet dann alle aus, sonst alle ein.
- Automatisierungen im Status `unavailable` haben einen deaktivierten Schalter.
- Das Popup lässt sich mit dem X, mit Esc, durch Tippen neben das Fenster oder mit der Zurück-Geste schließen.

## Popup-Position anpassen

Die Position steht in `_openPopup` in `automation-area-card.js`:

```js
dialog.style.setProperty("--dialog-surface-margin-top", "40px");
dialog.style.setProperty("--ha-bottom-sheet-height", "90vh");
dialog.style.setProperty("--ha-bottom-sheet-max-height", "90vh");
```

| Wert | Wirkung |
|------|---------|
| `--dialog-surface-margin-top` | Abstand der Oberkante am Desktop |
| `--ha-bottom-sheet-height` | feste Höhe des Bottom-Sheets auf dem Handy |
| `--ha-bottom-sheet-max-height` | maximale Höhe des Bottom-Sheets |

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| Karte wird nicht gefunden | Ressource prüfen und Browser-Cache leeren |
| Alte Darstellung trotz Update | In der Konsole (F12) prüfen, welche Version geladen wurde (`AUTOMATION-AREA-CARD v…`), und die Ressourcen-URL mit `?v=2` ergänzen |
| Es werden 0 Automatisierungen angezeigt | Prüfen, ob die Automatisierung oder ihr Gerät einem Bereich zugeordnet ist |
| Schalter oder Animationen sehen anders aus | Ein beliebiges More-Info-Fenster öffnen und erneut versuchen. Die Karte lädt die benötigten Komponenten beim Start vor, in seltenen Fällen greift stattdessen eine Rückfallebene |
| Popup sieht auf dem Handy wie ein Dialog aus | `customElements.get("ha-adaptive-dialog")` in der Konsole prüfen. Ist es nicht definiert, wird ein normaler Dialog verwendet |
| Editor zeigt keine Bereichsauswahl | Seite neu laden |

## Hinweis

Die Karte verwendet interne Komponenten von Home Assistant (`ha-dialog`, `ha-adaptive-dialog`, `ha-switch`, `ha-ripple`). Diese sind keine öffentliche, stabile Schnittstelle. Nach einem Home-Assistant-Update kann sich die Darstellung ändern. 

## Lizenz

MIT