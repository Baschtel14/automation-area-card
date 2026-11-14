# Automation Area Card

Eine Home-Assistant-Dashboard-Karte, die Automatisierungen ausgewählter Bereiche (Areas) zusammenfasst. Sie zeigt Gesamt-, Aktiv- und Inaktiv-Anzahl. Ein Tipp auf die Karte öffnet ein Popup, in dem sich jede Automatisierung wie in der Entitäten-Karte ein- und ausschalten lässt.

## Funktionen

- Mehrere Bereiche per visuellem Editor auswählbar
- Zähler für Gesamt, Aktiv und Inaktiv mit Live-Aktualisierung
- Popup mit nativer Entitäten-Karte und Sammelschalter im Header
- Warnung bei unbekannten oder gelöschten Bereichen
- Verwendet Theme-Farben (`--primary-color`, `--success-color`, `--error-color`)

## Installation über HACS

1. HACS öffnen und oben rechts auf die drei Punkte klicken.
2. **Benutzerdefinierte Repositories** wählen.
3. URL `https://github.com/baschtel14/automation-area-card` eintragen und als Kategorie **Dashboard** wählen.
4. Die Karte in HACS suchen und herunterladen.
5. Browser-Cache leeren (Strg+F5).

Falls HACS die Ressource nicht automatisch anlegt, unter **Einstellungen → Dashboards → Ressourcen** manuell hinzufügen:

| URL | Typ |
|-----|-----|
| `/hacsfiles/automation-area-card/automation-area-card.js` | JavaScript-Modul |

## Verwendung

Die Karte lässt sich über **Karte hinzufügen** auswählen. Die Bereiche werden im Editor ausgewählt.

### YAML

```yaml
type: custom:automation-area-card
name: Automatisierungen
areas:
  - schlafzimmer
  - sebastian
```

## Optionen

| Option  | Typ             | Standard             | Beschreibung                           |
|---------|-----------------|----------------------|----------------------------------------|
| `type`  | string          | **Pflicht**          | `custom:automation-area-card`          |
| `areas` | Liste von Strings | `[]`               | **Area-IDs** (nicht die Anzeigenamen)  |
| `name`  | string          | `Automatisierungen`  | Titel der Karte und des Popups         |

Die Area-ID siehst du, wenn du die Bereiche im Editor auswählst und danach in den YAML-Modus wechselst.

## Funktionsweise

- Eine Automatisierung gehört zu einem Bereich, wenn sie selbst oder ihr Gerät diesem Bereich zugeordnet ist.
- "Aktiv" zählt Automatisierungen mit dem Status `on`. Alles andere (`off`, `unavailable`) gilt als inaktiv.
- Das Popup schließt per Klick neben das Fenster, mit dem X oder mit Esc.

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| Karte wird nicht gefunden | Ressource prüfen und Browser-Cache leeren |
| Es werden 0 Automatisierungen angezeigt | Prüfen, ob die Automatisierung oder ihr Gerät einem Bereich zugeordnet ist |
| Popup bleibt leer oder öffnet nicht | Browser-Konsole (F12) auf Fehlermeldungen prüfen |
| Editor zeigt keine Bereichsauswahl | Seite neu laden, die Karte benötigt aktuelle Frontend-Komponenten |

## Lizenz

MIT