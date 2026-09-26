# OneSplatt Motion Studio

Die lokale Webapp öffnen: **START-WEBAPP.cmd** doppelklicken oder bei laufendem Server **http://127.0.0.1:8765** aufrufen. Der Server läuft im Hintergrund auf diesem Rechner; ein Apache-/XAMPP-Aufruf allein startet die Python-Pipeline nicht.

## Einrichten

Windows, Python 3.11 und Node.js ab 22.12 installieren. **SETUP.cmd** erstellt eine Python-Umgebung, installiert die Abhängigkeiten, baut die Webapp und legt `pipeline.json` anhand der mitgelieferten Vorlage an. Eine vorhandene Konfiguration bleibt erhalten. Mit `SETUP.cmd -Python "C:\Pfad\python.exe"` lässt sich der Python-Interpreter auswählen.

Für Musikimport und MP4-Export die Pfade zu FFmpeg und FFprobe in `pipeline.json` eintragen. Bereits importierte PLY-Splats lassen sich ohne Rekonstruktionswerkzeuge bearbeiten. Die vollständige Bild-zu-Splat-Pipeline benötigt zusätzlich lokales ComfyUI mit den im Workflow genannten MiniMax-Modellen und Nodes, [COLMAP](https://github.com/colmap/colmap/releases), [Brush](https://github.com/ArthurBrussee/brush/releases/tag/v0.3.0) und SAM3-Gewichte. Deren Pfade ebenfalls in `pipeline.json` setzen; `CHECK-SETUP.cmd` prüft die Werkzeuge.

SAM3: `powershell -ExecutionPolicy Bypass -File scripts/install-sam3.ps1` installiert die CUDA-Laufzeit. Anschließend **DOWNLOAD-SAM3.cmd** ausführen; der Download des offiziellen Modells setzt den entsprechenden Hugging-Face-Zugang voraus. Ein bereits vorhandenes Modell unter `tools/sam3-model` wird erhalten. Die Modelle und Programme werden nicht mit diesem Repository verteilt.

Projekte, Uploads und Exporte liegen in `studio/data`, Rekonstruktionen in `runs`. Diese Ordner sowie die lokale Konfiguration bleiben außerhalb von Git. Akzidenz wird verwendet, wenn sie lokal installiert ist; andernfalls greift die Helvetica-/Arial-Schriftliste. Schriftdateien sind nicht enthalten.

## Oberfläche

Die reduzierte Ansicht zeigt nur Vorschau, Timeline und wesentliche Bedienelemente. Das Ordnersymbol oben öffnet die Projektauswahl; links liegen Studio, Workflow, Splat-Vorschauen und Import. Namen erscheinen in Menüs oder beim Darüberfahren. Unter Kamera, Effekte und Musik lassen sich die einzelnen Bereiche aufklappen; zusätzliche Partikelregler liegen unter **Optionen**. Export bleibt oben rechts erreichbar.

## Vom Bild zum Splat

1. Unter **Workflow → Optionen** die lokale ComfyUI-Adresse einstellen und **Prüfen** klicken. Standard: `http://127.0.0.1:8188`.
2. Ein Ausgangsbild hochladen, **Videoformat**, Bildanpassung, Prompt, Seed, Länge und Turbo-Modus wählen und **Video erzeugen** klicken. Alternativ ein fertiges Video importieren.
3. Das Video auswählen, die SAM3-Motivbegriffe anpassen (z. B. `person, sword`) und **Splat erzeugen** klicken.
4. Die App extrahiert Frames, erstellt SAM3-Masken, rekonstruiert Kameras mit COLMAP und trainiert Brush auf transparenten Bildern. Der fertige Splat erscheint automatisch im Studio.

`studio/workflows/360_subject.json` ist eine Kopie der bereitgestellten ComfyUI-API-Datei. Die Originaldatei im Download-Ordner bleibt unverändert. Die App verändert nur die vorgesehenen Eingaben und entfernt nicht erreichbare Nodes aus dem abgesendeten Graphen. Die Bilddatei wird an das lokale ComfyUI übergeben; dessen fertiges Video wird in das Projekt übernommen. Die Verbindungsprüfung nennt fehlende Node-Typen und Modell-Dateien. ComfyUI selbst und die MiniMax-Modelle müssen lokal verfügbar sein. Zur Freigabe des GPU-Speichers entlädt die App vor SAM3 die ComfyUI-Modelle nur dann, wenn dort keine anderen Aufträge laufen oder warten.

Jeder Pipeline-Lauf erhält einen eigenen Ordner. Originalvideo, bestehende Modelle und frühere Ergebnisse bleiben erhalten. Fehlermeldungen, Abbruch und Protokolle sind in der Oberfläche zugänglich. Es läuft jeweils ein Rekonstruktions-/ComfyUI-Auftrag. Unterbrochene Aufträge werden nach einem Serverneustart als unterbrochen markiert; es gibt keinen automatischen Trainings-Resume.

### Videoformat für ComfyUI

**Videoformat** unter **Workflow** und **Format** im Studio verwenden dieselbe Projekteinstellung. Beim nächsten Generieren ersetzt die App die feste 3:4-Vorgabe des ComfyUI-Workflows durch passende Breite und Höhe: **16:9 → 1024 × 576**, **9:16 → 576 × 1024**, **1:1 → 768 × 768 px**. Die Größen halten das Pixelbudget des gelieferten Workflows (0,6 MP) und das 32-Pixel-Raster des Modells ein. Die Oberfläche zeigt die tatsächliche Generierungsgröße an. Full-HD-/4K-Auflösung und Bildrate des späteren Splat-Exports werden weiterhin separat gewählt; MiniMax erzeugt sein Orbit-Video mit 24 FPS.

**Einpassen** erhält das ganze Ausgangsbild und ergänzt freie Ränder schwarz. **Zuschneiden** füllt das Format durch einen mittigen Ausschnitt. Beide erhalten die Proportionen und berücksichtigen die Bildorientierung. Vor dem Upload wird im Auftragsordner eine passende `prepared-input.png` erzeugt; die Originaldatei bleibt erhalten. `submitted-workflow.json` enthält die tatsächlich übergebenen Dimensionen. Bereits erzeugte oder importierte Videos bleiben in ihrem ursprünglichen Format.

## Kamera und Musik

- **Orbit:** Startwinkel, Winkelbereich, Höhe, Abstand und Bildwinkel einstellen.
- **Dolly in:** eine Annäherung mit optionaler gleichzeitiger Drehung.
- **Eigene Fahrt:** Zeitpunkt in der Timeline wählen, die Ansicht mit der Maus drehen/zoomen und **Kamerapunkt setzen** klicken. Mindestens zwei Punkte ergeben eine interpolierte Fahrt. Weiche Übergänge sind optional.
- **Statisch:** Kamera bleibt an einer Position.
- **Motiv ausrichten:** X/Y/Z-Korrektur für importierte Splats. Neu trainierte Brush-Splats erhalten eine Startansicht anhand der rekonstruierten Kamera.
- **Motiv begrenzen:** blendet Splats außerhalb einer Box in Vorschau und Film aus. Das Original-PLY wird dadurch nicht verändert.
- **Musik:** MP3, WAV, FLAC, M4A, OGG oder AAC importieren. Die App analysiert bis zu zehn Minuten und zeigt die Wellenform sowie Bass, Mitten, Höhen und Energie.
- **Effekte:** Bass steuert den Kamera-Puls; Energie steuert Leuchten und Farbtönung; Höhen steuern RGB-Versatz und Partikel. Empfindlichkeit und Intensität sind einstellbar. Die Lautstärke verändert die Tonspur, die Effekt-Empfindlichkeit separat die Reaktion.

Freies Drehen mit der Maus pausiert die Kamerafahrt. **Zur Kamerafahrt** oder **Abspielen** schaltet zurück zur geplanten Fahrt. Der Export verwendet immer die gespeicherte Fahrt. Eine freie Ansicht wird mit **Kamerapunkt setzen** Bestandteil der Fahrt.

## Raumraster und Boden

Unter **Kamera → Raum** oder **Effekte → Raum** wählt **3D-Raster** zwischen **Aus**, **Frei im Raum**, **Boden** und **Wände**. Frei im Raum füllt das Volumen mit einem Gitter oder einer dreidimensionalen Punktanordnung. Boden legt ein perspektivisches Raster unter das Motiv; Wände ergänzt Wände und Decke. **Rasterform** wählt Linien oder Punkte in allen drei Anordnungen. Das Raster bleibt fest im Raum, während sich die Kamera bewegt. Wände sind von innen sichtbar, sodass die Vorderseite bei einer Fahrt außerhalb des Raums offen bleibt.

**Nur Raster** blendet den Splat aus und schaltet die Bodenfläche ab. Auch Projekte ohne geladenen Splat lassen sich mit Raster, Kamerafahrt und Musik abspielen und exportieren. Ein Klick auf eine Splat-Vorschau zeigt das Motiv wieder an. Unter **Optionen** liegen Fläche, Raumhöhe, Rasterabstand, Sichtbarkeit, Farben, Punktgröße und der Freiraum um das Motiv. Sehr dichte Volumenraster erhalten einen etwas größeren Abstand, um die Punktzahl auf 48.000 zu begrenzen.

**Bodenfläche** unter Optionen ergänzt unabhängig davon einen flächigen Boden. **Höhe** platziert Raster und Fläche unter den Füßen. Die Bodenfläche verdeckt dahinterliegende Teile des Motivs. Rasterlinien verwenden dieselbe Tiefenprüfung mit geglätteten Kanten. Die Szene bleibt unbeleuchtet; der Boden erzeugt keine Schatten oder Spiegelungen.

Alle Raumwerte werden im Projekt gespeichert und im MP4-Export verwendet. **Raster** bleibt separat als flaches Hintergrundraster verfügbar. Bestehende Projekte beginnen ohne zusätzlichen Raum oder Boden.

## Glitch und Console

**Effekte → Glitch** schaltet schwebende Fragmente im Raum und kurze horizontale Bildversätze ein. Stärke, Tempo, Farbe und Musikeinfluss sind einstellbar. Bass, Mitten, Höhen oder Gesamtenergie können die Intensität steuern. Die Animation wird aus der Filmzeit berechnet, sodass Springen in der Timeline und Export denselben Zustand ergeben.

**Console** ergänzt eine dezente animierte Text- und Zahlenebene mit Zeit und Musikpegeln. Unter Optionen lassen sich eigene Textzeilen, Dichte, Sichtbarkeit und Farbe einstellen. Dies ist ein Gestaltungselement; es führt keine Befehle aus und zeigt keine Systemprotokolle. Glitch und Console können unabhängig voneinander und über Effektwechsel in der Timeline eingesetzt werden. Beides wird im Film mitgerendert.

## Color Grading und Text

Unter **Effekte → Grading** liegen Belichtung, Kontrast und Sättigung. **Optionen** ergänzt Temperatur, Grün-/Magenta-Tönung, Schatten und Lichter. Neutral, Warm, Kühl und Mono sind Ausgangspunkte; alle Werte bleiben einzeln veränderbar. Der Schalter ermöglicht einen Vorher-/Nachher-Vergleich, **Reset** stellt die neutrale Ausgangslage her. Grading wird mit Effektwechseln gespeichert und im Film verwendet. Es wirkt auf die Szene einschließlich Raster und Glitch; die gewählten Text- und Console-Farben bleiben erhalten.

Im Reiter **Text** fügt **+** eine Textebene hinzu. Bis zu zwölf Ebenen lassen sich unabhängig auswählen und löschen. In der Vorschau kann Text direkt gezogen werden; die Pfeiltasten verschieben einen fokussierten Text fein, mit Umschalt in größeren Schritten. Größe, Ausrichtung, Farbe und Light/Regular/Medium/Bold liegen direkt im Reiter, X/Y-Position, Laufweite, Zeilenabstand und Deckkraft unter Optionen. Mehrzeiliger Text wird am Bildrand umgebrochen. Schriftgröße und Platzierung werden relativ zum Bild gespeichert, damit Vorschau und Export übereinstimmen.

**Ganzer Film** zeigt eine Ebene durchgehend. Andernfalls bestimmen **Von/Bis** ihren Zeitraum; **Ein-/Ausblenden** fügt eine weiche Ein- und Ausblendung hinzu. Texte können auch allein ohne Splat exportiert werden. Bearbeitungsrahmen erscheinen nur in der Vorschau.

Die App verwendet die lokal installierten Akzidenz-Grotesk-Schnitte per `@font-face local()` und wartet beim Rendern auf deren Laden. Schriftdateien werden nicht in die App kopiert. Auf einem anderen Rechner ohne diese Schrift wird Helvetica/Arial verwendet und dies unter den Textoptionen angezeigt. Der Film enthält die fertig gerenderten Buchstaben.

## Timelinepunkte verschieben und löschen

Die Rauten in der **Kamera**- und **Effekte**-Spur lassen sich mit der Maus oder per Touch nach links und rechts ziehen. Beim Bearbeiten pausiert die Wiedergabe; die Vorschau folgt dem Punkt. Die Kameraposition bzw. die Effektwerte bleiben dabei erhalten.

- **Anklicken:** wählt den Punkt aus. Unter der Timeline erscheinen seine Zeit und **Punkt löschen**.
- **Genau verschieben:** Sekunden im Zeitfeld unter der Timeline oder in der jeweiligen Liste rechts eingeben.
- **Tastatur:** bei fokussiertem Punkt verschieben ← / → um 0,1 s, mit Umschalt um 1 s. Pos1 / Ende verschieben zum Anfang bzw. zum letzten zulässigen Zeitpunkt. Entf oder Rücktaste löschen den Punkt. In Eingabefeldern bleiben diese Tasten normale Textbearbeitung.
- **Löschen:** mit dem Löschknopf unter der Timeline oder dem Papierkorb in der Liste. Nach dem letzten gelöschten Kamerapunkt wird die Kamera statisch. Nach dem letzten Effektwechsel gilt wieder der Grundeffekt.

Punkte können ihre Reihenfolge wechseln. Bei gleicher Zeit hält die App einen Abstand von mindestens 0,05 s, damit kein anderer Punkt überschrieben wird. Effektwechsel enden spätestens 0,01 s vor Filmende. Alle Änderungen werden automatisch gespeichert und von Vorschau und Filmexport verwendet.

## Splat-Partikeleffekte

Unter **Effekte → Partikel** verändern vier Looks die tatsächlichen Splat-Punkte:

- **Explosion:** Punkte lösen sich radial vom Motiv.
- **Sternenstaub:** Teile des Motivs verwehen seitlich mit feinen Lichtspuren.
- **Wirbel:** Das Motiv verdreht sich und zerfließt in einer Strömung.
- **Hologramm:** Leuchtende Punkte, wandernde Scanlinien und seitlich versetzte Bänder.

**Verformung** bestimmt den Abstand zur Originalform. **Punkt-Look**, **Punktgröße**, **Lichtspuren**, **Bewegungstempo** und **Partikelfarbe** gestalten die Darstellung. Lichtspuren sind gestreckte einzelne Gaussians entlang der Bewegung; sie hängen nicht von zuvor gerenderten Bildern ab. Die Effekte funktionieren auch ohne Musik. **Musikeinfluss** verstärkt die Verformung mit Bass, Mitten, Höhen oder Gesamtenergie; bei null bleibt nur die Grundverformung.

Der **Ablauf über die Filmlänge** kann durchgehend laufen, einmal auseinanderfliegen, sich zusammensetzen oder sich auflösen und zurückkehren. **Abspielen** oder die Timeline bewegen, um ihn anzusehen. Beim Ablauf „Auflösen & zurück“ beginnt die Vorschau mit dem Originalmotiv. **Aus** stellt die Originalgeometrie wieder her. Große Verformungen brauchen mehr Platz: gegebenenfalls den Kamera-Abstand erhöhen.

Alle Parameter werden im Projekt und beim MP4-Export gespeichert. Die Berechnung verwendet feste Punkt-Seeds und die Filmzeit, sodass Zurückspulen und Export denselben Effekt ergeben. Das herunterladbare PLY bleibt das Original; der animierte Effekt ist im Film enthalten. Implementiert mit den [Splat-Modifiern von Spark](https://sparkjs.dev/docs/dyno-overview/).

## Effektwechsel, Wellen und Raster

Unter **Effekte → Effektwechsel** lassen sich mehrere Looks in einem Film einsetzen:

1. Einen Zeitpunkt auf der Timeline wählen und **Wechsel bei …** klicken.
2. Darunter den gewünschten Partikeleffekt, eine Welle oder **Original** auswählen. Dabei bleiben die eingestellten Werte für Stärke, Tempo, Farbe, Ablauf und Musikreaktion erhalten. Nur ausdrücklich gewählte Look- oder Grading-Vorgaben setzen ihre jeweiligen Werte neu.
3. Weitere Wechsel setzen. Die eigene **Effekte**-Spur zeigt die Abschnitte; ein Klick wählt den Abschnitt und springt zu dessen Anfang. Die Regler bleiben an diesem Abschnitt, auch wenn die Vorschau anschließend an eine andere Stelle springt. Die kleine Zeitangabe oben im Effektbereich zeigt den bearbeiteten Abschnitt und springt auf Klick dorthin zurück. Die Zeiten rechts lassen sich bearbeiten, Wechsel können gelöscht werden.

Ein neuer Wechsel übernimmt die aktuell angezeigten Effektwerte. Zum Bearbeiten eines anderen Abschnitts dessen Fläche oder Raute anklicken; vor dem ersten Wechsel lässt sich ebenso der Grundabschnitt wählen. Vorschau und Export verwenden weiterhin die Effekte an der jeweiligen Filmzeit.

**Weicher Wechsel** bestimmt die Übergangsdauer. Bei 0 s erfolgt ein harter Schnitt; sonst führt der Übergang über die Originalform. Das Grading bleibt während dieses Übergangs aktiv, damit Sättigung und Kontrast nicht kurz auf die Originalfarben zurückspringen. Die Abläufe „Auflösen & zurück“ usw. beziehen sich bei einer Effektfolge auf die Länge des jeweiligen Abschnitts. Vor dem ersten Wechsel gilt der Grundeffekt. Das Ausschalten der Effektfolge erhält alle gesetzten Wechsel. Wechsel außerhalb einer verkürzten Filmlänge bleiben gespeichert und werden nicht gerendert.

**Welle** verschiebt die tatsächlichen Splat-Punkte innerhalb eines wandernden Bands. Richtung (oben/unten, links/rechts, Tiefe, aus der Mitte), Breite, Durchlaufdauer, Stärke, Farbe und Leuchten sind einstellbar. Musik kann die Stärke zusätzlich steuern. Die Welle lässt sich allein oder gleichzeitig mit einem Partikeleffekt verwenden.

**Raster** liegt hinter dem Motiv und ist unter **Kamera** und **Effekte** erreichbar. Linien, Punkte oder Linien mit Knotenpunkten sind wählbar; Dichte, Sichtbarkeit und Farbe lassen sich einstellen. Das Raster bleibt am Bild ausgerichtet und gilt für den ganzen Film. Es wird als eigene Ebene im Renderer berechnet und ist damit im MP4 enthalten.

Alle Effektwechsel, Wellen und das Raster werden automatisch im Projekt gespeichert. Vorschau, Rückwärtsspringen und Export verwenden dieselbe zeitabhängige Berechnung.

## Videoexport

**Export** öffnet die Ausgabe-Einstellungen:

- 16:9, 9:16 oder 1:1.
- 720p, 1080p oder 2160p; 24, 30 oder 60 FPS.
- MP4 mit H.264-Video und optional AAC-Musik.
- Die Ausgabe wird Bild für Bild zu festen Zeitpunkten gerendert und an das lokale FFmpeg übergeben. Dadurch bestimmt die Rendergeschwindigkeit nicht die Länge des Films.
- Der gewählte Musikstart und die Lautstärke gelten für Vorschau und Export. Kürzere Musik wird am Ende mit Stille aufgefüllt; die Effekte gehen dort auf null zurück.

Den Tab während des Renderns geöffnet lassen. Browser-/GPU-Leistung bestimmt die Wartezeit. Der Export kann während der Bildberechnung abgebrochen werden. Beim abschließenden Verpacken der MP4 ist Abbruch gesperrt. Fertige Filme erscheinen links unter **Deine Filme** und lassen sich dort erneut ansehen/herunterladen. Projekteinstellungen werden automatisch gespeichert.

Dateien: `studio/data/projects/<id>/assets/` und `studio/data/projects/<id>/exports/<id>/`. Ein Export enthält die MP4, Einstellungen und FFmpeg-Protokoll. Für Filmexporte werden keine externen Dienste verwendet.

## Grenzen und Validierung

Ein Splat ist kein geschlossenes, geometrisch korrektes Mesh. Der vorhandene Beispielclip zeigt etwa 166°; Ansichten außerhalb dieses Bereichs können Fehler zeigen. Ein vollständiger, geometrisch konsistenter Orbit verbessert die Rundumansicht. Das normale Projekt-PLY bleibt downloadbar und kann bei Bedarf weiter in SuperSplat bearbeitet werden.

Geprüft: Splat-Rendering im Browser, Musikimport, Kamerapunkte, deterministische Kamera-/Audio-Berechnung, H.264-/AAC-Export, Bildreihenfolge, unvollständige Exporte und Exportabbruch. Der Beispiel-Splat wurde aus der Oberfläche mit Musik als sechssekündiger Full-HD-Film mit genau 180 Frames exportiert. Zusätzlich zu den HTTP-Tests wurde am 26.09.2026 eine echte MiniMax-Generierung aus der Weboberfläche geprüft: Das Projekt „Formatcheck · ComfyUI“ enthält ein Video mit 1024 × 576 Pixeln, 24 FPS und 124 Frames (5,167 s). Die Auswahl von 16:9, 9:16 und 1:1, die Synchronisierung mit dem Studio und das Speichern beider Bildanpassungen wurden im Browser geprüft. Automatisierte Tests prüfen außerdem das exakte Seitenverhältnis, das Pixelbudget und die unverzerrte Bildvorbereitung.

Ein vollständiger Aufruf über die Weboberfläche hat außerdem 88/88 Kameras aus dem vorhandenen Video rekonstruiert, SAM3-Masken erzeugt, transparente Trainingsbilder erstellt und Brush für 5.000 Schritte ausgeführt. Der neue Splat enthält 13.534 Gaussians. Der frühere, längere Trainingslauf bleibt daneben erhalten. Frames und Masken lassen sich über die Vorschauen im Auftrag prüfen.

## Entwicklung

Frontend: React, Three.js und [Spark](https://sparkjs.dev/docs/splat-mesh/). Lokaler Server: FastAPI. ComfyUI-Anbindung über die [offiziellen API-Routen](https://docs.comfy.org/development/comfyui-server/comms_routes). Die vorhandenen FFmpeg-/COLMAP-/Brush-/SAM3-Werkzeuge werden direkt benutzt.

```powershell
# Frontend, einmalig bzw. nach Änderungen
cd web
npm ci --os=win32 --cpu=x64
npm run build
npm test
cd ..

# Server; installierter Python-Pfad wie in START-WEBAPP.cmd
.venv\Scripts\python.exe studio/server.py

# Integrationstests inklusive echtem FFmpeg-Export
.venv\Scripts\python.exe studio/test_studio.py
```

Die Python-Abhängigkeiten sind bereits in der vorhandenen Anaconda-Umgebung installiert; `studio/requirements.txt` dokumentiert die getesteten Versionen. SAM3 bleibt in seiner eigenen Umgebung. Ein optionaler Vite-Entwicklungsserver (`npm run dev` im Ordner `web`) leitet `/api` an Port 8765 weiter.


## Feine Film-Grafiken

**Effekte → Glitch** enthält vier Zeichenfamilien: Gemischt, Linien, Zeichen und Ecken. Kreuze, Pfeile, kleine Punktraster, offene Ecken und Maßlinien liegen im 3D-Raum. Unter Optionen lässt sich ihre Dichte unabhängig von der Stärke einstellen.

Für die **Console** gibt es drei Kompositionen: **Editorial** mit unterschiedlichen Schriftgrößen und viel Freiraum, **Register** mit asymmetrischen Tabellenzellen und Knotenpunkten sowie **Minimal** mit kleinen Beschriftungen und Randmarkierungen. Eigener Text, Dichte, Sichtbarkeit und Farbe bleiben einstellbar. Pegel reagieren auf die Musik. Die Varianten lassen sich über Effektwechsel in der Timeline wechseln; Vorschau und Export verwenden dieselbe Filmzeit.

Unter **Text** setzen die Vorlagen **Titel**, **Notiz** und **Index** Größe, Schnitt, Laufweite und grafische Behandlung. Inhalt, Position, Farbe und Zeitfenster bleiben erhalten. **Textelement** ergänzt eine Linie, offene Ecken, einen Registerrahmen oder einen Pfeil. Text und Markierung werden gemeinsam verschoben. Unter Optionen lässt sich zwischen der lokal installierten Akzidenz und Mono wechseln. Linien und Console-Schrift werden in der jeweiligen Ausgabeauflösung gezeichnet.


### Text vor oder hinter dem Splat

Unter **Text → Textebene** kann jede Textebene **Vor dem Splat** oder **Hinter dem Splat** liegen. Hinterer Text wird mit seinen Linien, Ecken und Pfeilen vor den Gaussians gezeichnet und von deren tatsächlicher Deckkraft verdeckt. Zwischen aufgelösten Partikeln scheint er entsprechend durch. Er bleibt am Bild ausgerichtet und weiterhin verschiebbar. Hinterer Text gehört zur Szene und erhält deren Grading und Bildeffekte; vorderer Text bleibt eine darüberliegende Grafik. Die Wahl wird pro Textebene gespeichert und im MP4 berücksichtigt. Bestehender Text bleibt standardmäßig vorne.


Bei hinteren Textebenen lässt sich **Effekte auf Text** ausschalten. Schrift und zugehörige grafische Elemente behalten dann ihre Farbe und Position; Grading, Glitch, Farbverschiebung und Leuchten werden nicht auf die Schrift angewendet. Die aktuelle Verdeckung durch das Splat bleibt erhalten. Vorderer Text bleibt wie bisher unabhängig von den Szeneneffekten. Der Schalter gilt pro Textebene, wird gespeichert und wirkt auch im Export. Vorhandene hintere Textebenen behalten ihre bisherige Einstellung (Effekte an).

## Mehrere PLYs mischen

Das kleine **+ am Splat-Vorschaubild** fügt die Datei in die Splat-Spur ein. Der bisherige Splat bleibt als erster Clip bei Sekunde 0 erhalten. Weitere Clips beginnen an der Abspielposition; steht sie am Anfang, wird ein neuer Clip in die Mitte des verbleibenden letzten Abschnitts gesetzt. Derselbe Splat kann mehrfach vorkommen. Neue Imports werden bei einer aktiven Splat-Spur als zusätzliche Clips eingesetzt.

Clip anklicken, dann unten Datei, Startzeit und Übergang bearbeiten. Die **Raute am Clipanfang** lässt sich ziehen oder mit den Pfeiltasten verschieben; Shift bewegt um eine Sekunde. Clips können dabei ihre Reihenfolge wechseln. Der erste Clip bleibt bei 0. Über den Papierkorb oder die Entf-Taste an einer Raute wird ein Clip gelöscht. Nach dem Löschen des ersten Clips rückt sein Nachfolger an den Anfang.

**Schnitt**, **Überblenden**, **Partikel** und **Wipe** stehen zur Wahl. Der Übergang beginnt am Start des ankommenden Clips; die schraffierte Fläche zeigt seine Dauer. Die Dauer wird auf 90 % des folgenden Abschnitts begrenzt, damit Übergänge nicht ineinander laufen. Partikel zerstreuen den alten Splat und setzen den neuen zusammen, Wipe tauscht die Gaussians von unten nach oben aus. Unter **Kamera → Ausrichtung** wird der ausgewählte Clip separat gedreht. Die übrige Kamerafahrt, Musik, Effekte und Texte laufen über alle Clips hinweg weiter.

Vorschau und MP4 verwenden dieselben Übergänge und Filmzeiten. Pro Bild sind höchstens zwei PLYs aktiv; ein kleiner Cache hält bis zu drei Modelle. Beim Nachladen pausiert die Vorschauzeit samt Musik. Originaldateien bleiben unverändert. Ohne Splat-Spur funktionieren ältere Projekte weiterhin mit ihrem einzelnen Modell.

## Textspur

Text erscheint als Balken in der Timeline. **T+** legt einen Text an der aktuellen Abspielposition an, zunächst für drei Sekunden bzw. bis zum Filmende. Überlappende Texte liegen in getrennten Zeilen; bei mehr als drei Zeilen lässt sich innerhalb der Textspur scrollen.

Den Balken ziehen, um den Text mit gleichbleibender Dauer zu verschieben. Die schmalen Kanten links und rechts ändern Anfang und Ende. Pfeiltasten bewegen den fokussierten Balken oder die Kante um 0,1 Sekunden, mit Shift um eine Sekunde; Escape bricht eine laufende Mausbewegung ab. Papierkorb oder Entf löschen die gewählte Textebene.

Ein Klick auf den Balken öffnet darunter **Textinhalt**, **Von** und **Bis**. Mehrzeiliger Inhalt ist direkt dort editierbar. Die Auswahl ist mit dem Textbereich rechts und den Griffen im Vorschaubild verbunden. Schrift, Farbe, Position, Ein-/Ausblenden und die Ebene vor oder hinter dem Splat bleiben pro Text erhalten. Zeitfenster und Inhalt werden gespeichert und identisch exportiert; direkt aneinanderliegende Titel wechseln ohne ein zusätzliches überlappendes Bild.

## Hintergrundspur

Die farbige Spur zwischen Effekten und Text zeigt die Hintergrundabschnitte. Das **Quadrat mit +** fügt einen Wechsel an der Abspielposition hinzu. Am Filmanfang wird der nächste Wechsel in die Mitte des verbleibenden letzten Abschnitts gesetzt. Der ursprüngliche Hintergrund bleibt als erster Abschnitt bei Sekunde 0 erhalten.

Abschnitt anklicken und darunter **Farbe**, **Hexwert** und **Raster** einstellen. Zur Wahl stehen ohne Raster, Linien, Punkte und Linien mit Punkten. Die weiteren Einstellungen unter **Kamera → Raster** sowie die Hintergrundfarbe unter **Format** bearbeiten ebenfalls den ausgewählten Hintergrundabschnitt. Raumraster und Boden bleiben unabhängige Szenenelemente.

Die Raute am Wechsel ziehen oder dessen Startzeit numerisch ändern. **Schnitt** wechselt sofort; **Überblenden** mischt die Farben weich und blendet das flache Raster ein oder aus. Bei einer Änderung der Rasterform verschwindet die alte Form kurz, bevor die neue erscheint. Die Dauer wird auf 90 % des folgenden Abschnitts begrenzt. Papierkorb bzw. Entf an einer Raute löschen den Abschnitt; wird der erste gelöscht, beginnt sein Nachfolger bei 0.

Die Hintergrundfolge wird gespeichert und in Vorschau und MP4 nach derselben Filmzeit berechnet. Sie funktioniert auch ohne Splat. Bestehende Projekte behalten ihren bisherigen Hintergrund, bis eine Folge angelegt wird.
