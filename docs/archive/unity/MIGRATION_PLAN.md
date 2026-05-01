# 🎮 Gravity Dig Unity - Migrationsplan

> Schritt-für-Schritt-Plan für die Migration von Godot zu Unity 6

---

## 📋 Übersicht

| Aspekt | Details |
|--------|---------|
| **Quelle** | Godot 4.6 / GDScript |
| **Ziel** | Unity 6 LTS (6000.0.x) / C# |
| **Plattform** | WebGL (Browser) |
| **Hosting** | k3s Cluster via ArgoCD |
| **Subdomain** | `gravity-dig-unity.sytko.de` |
| **Repository** | `MichalSy/gravity-dig-unity` |

---

## 🗺️ Roadmap

```
Phase 1: Setup & Infrastruktur
├── Schritt 1.1: Repository Setup
├── Schritt 1.2: Unity Installation (VNC)
├── Schritt 1.3: Unity Lizenzierung
└── Schritt 1.4: Leeres Unity-Projekt

Phase 2: CI/CD Pipeline
├── Schritt 2.1: GitHub Actions Workflow
├── Schritt 2.2: Unity License Secret
├── Schritt 2.3: Docker-Setup
└── Schritt 2.4: Test-Build

Phase 3: GitOps & Deployment
├── Schritt 3.1: GitOps-Config (neue App)
├── Schritt 3.2: ArgoCD App erstellen
├── Schritt 3.3: DNS/Subdomain
└── Schritt 3.4: Erstes Deployment

Phase 4: Game Migration (nach erfolgreichem Deployment)
├── Schritt 4.1: Core Scripts (Player, Physics)
├── Schritt 4.2: World Generation
├── Schritt 4.3: UI & HUD
└── Schritt 4.4: Assets & Sprites
```

---

## Phase 1: Setup & Infrastruktur

### Schritt 1.1: Repository Setup

**Status:** ✅ Bereit

**Aufgaben:**
- [x] Lokales Repo erstellen
- [ ] Auf GitHub pushen (`MichalSy/gravity-dig-unity`)
- [ ] Branch auf `main` umbenennen
- [ ] `.gitignore` für Unity erstellen
- [ ] `README.md` mit Projektbeschreibung
- [ ] `VERSION` Datei erstellen (Inhalt: `1.0`)

**Befehle:**
```bash
cd /home/aiko/git-projects/gravity-dig-unity
git branch -m main
# GitHub Repo erstellen (via gh CLI oder Web)
gh repo create MichalSy/gravity-dig-unity --private --source=. --push
```

---

### Schritt 1.2: Unity Installation (VNC)

**Frage:** Brauchen wir Unity auf dem virtuellen Desktop?

**Antwort:** Für `game-ci` (headless CI/CD) brauchen wir Unity **NICHT** lokal installiert. Der Builder läuft in einem Container mit vorinstalliertem Unity.

**ABER:** Für lokale Entwicklung/Test ist Unity Hub + Editor nützlich.

**Optionen:**

| Option | Beschreibung | Empfohlene?
|--------|--------------|-------------|
| **A** | Unity Hub + Editor auf VNC installieren | Ja, für lokale Tests |
| **B** | Nur game-ci verwenden (keine lokale Unity) | Möglich, aber schwierig zu debuggen |

**Empfehlung: Option A**

**Installation Unity Hub:**
```bash
# Unity Hub Download
wget -qO - https://hub.unity3d.com/linux/keys/public gpg --dearmor | sudo tee /usr/share/keyrings/Unity_Technologies_ApS.gpg > /dev/null
sudo sh -c 'echo "deb [signed-by=/usr/share/keyrings/Unity_Technologies_ApS.gpg] https://packages.unity.com/ubuntu $(lsb_release -cs) main" > /etc/apt/sources.list.d/unityhub.list'
sudo apt update
sudo apt install unityhub
```

**Unity Editor Version:**
- Version: `6000.0.36f1` (aktuellste Unity 6 LTS)
- Module: WebGL Build Support

---

### Schritt 1.3: Unity Lizenzierung

**Wichtige Frage:** Wie funktioniert das mit game-ci?

**Antwort:**
- `game-ci` benötigt ein **Unity License File** (`.ulf`)
- Dies wird als GitHub Secret hinterlegt
- **Kein** Login/Password bei jedem Build nötig

**Schritte zur Lizenzierung:**

1. **Unity Personal License anfordern:**
   - Auf https://unity.com/ Account erstellen
   - Personal License beantragen (kostenlos)

2. **License File generieren:**
   ```bash
   # Manueller Weg (auf deinem lokalen Rechner mit Unity):
   # Unity Hub → Preferences → License Management → Save License File
   
   # Oder via Command Line (auf dem Server):
   unity-hub -- --headless authorize --username "EMAIL" --password "PASSWORD"
   unity-hub -- --headless save-license --path /path/to/license.ulf
   ```

3. **Als GitHub Secret hinterlegen:**
   - Secret Name: `UNITY_LICENSE`
   - Inhalt: Base64-kodiertes `.ulf` File

**Alternative (Einfacher):**
- `UNITY_EMAIL` + `UNITY_PASSWORD` Secrets
- game-ci loggt sich bei jedem Build ein
- Langsamer, aber kein License File nötig

**Empfehlung:** `UNITY_EMAIL` + `UNITY_PASSWORD` (einfacher Setup)

---

### Schritt 1.4: Leeres Unity-Projekt

**Struktur:**
```
unity-project/
├── Assets/
│   ├── _Project/
│   │   ├── Scripts/
│   │   ├── Scenes/
│   │   ├── Prefabs/
│   │   └── Resources/
│   └── Plugins/
├── Packages/
│   └── manifest.json
├── ProjectSettings/
│   ├── ProjectVersion.txt
│   ├── ProjectSettings.asset
│   └── QualitySettings.asset
└── .gitignore
```

**Zu erledigen:**
- [ ] Unity Projekt erstellen (2D URP Template)
- [ ] Folder Structure anlegen
- [ ] Project Settings für WebGL:
  - Compression: Brotli
  - Decompression Fallback: ✓
  - Exception Support: None (Production)
- [ ] `.gitignore` hinzufügen (Unity Standard)
- [ ] Ersten Commit machen

---

## Phase 2: CI/CD Pipeline

### Schritt 2.1: GitHub Actions Workflow

**Datei:** `.github/workflows/docker-build.yml`

**Wichtige Änderungen vs. Godot:**
- `game-ci/unity-builder@v4` statt `barichello/godot-ci`
- Build dauert länger (5-10 Minuten)
- WebGL Output: `Build/WebGL/`

**Workflow-Struktur:**
```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: gravity-dig-unity.aikogame

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      # 1. Checkout
      # 2. Version bestimmen (aus VERSION + GHCR)
      # 3. Unity WebGL Build (game-ci)
      # 4. Docker Build (nginx)
      # 5. Push to GHCR
      # 6. Update gitops-config
```

---

### Schritt 2.2: Unity License Secret

**GitHub Secrets erstellen:**
- `UNITY_EMAIL`: Deine Unity Account E-Mail
- `UNITY_PASSWORD`: Dein Unity Passwort
- `GITOPS_TOKEN`: Bestehendes Token (oder neues für gitops-config)

**Wo:** GitHub Repo → Settings → Secrets and variables → Actions

---

### Schritt 2.3: Docker-Setup

**Dockerfile-Struktur:**
```dockerfile
# Multi-stage nicht nötig - game-ci macht den Build
FROM nginx:alpine

# WebGL Build aus GitHub Action kopieren
COPY build/WebGL/ /usr/share/nginx/html/

# nginx config mit COOP/COEP Headers
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

**Wichtig:** `nginx.conf` muss Cross-Origin Headers für WebGL enthalten:
```nginx
add_header Cross-Origin-Opener-Policy "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

---

### Schritt 2.4: Test-Build

**Ziel:** Pipeline läuft durch, Image wird gepusht

**Test-Schritte:**
1. Commit pushen
2. GitHub Actions Tab überwachen
3. Build-Log prüfen
4. Image in GHCR verifizieren: `ghcr.io/michalsy/gravity-dig-unity.aikogame:1.0.0`

---

## Phase 3: GitOps & Deployment

### Schritt 3.1: GitOps-Config (neue App)

**Neue Datei:** `gitops-config/apps/gravity-dig-unity/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: default

resources:
  - ../../base-web

namePrefix: gravity-dig-unity-

commonLabels:
  app.kubernetes.io/instance: gravity-dig-unity
  app: gravity-dig-unity

images:
  - name: app-image
    newName: ghcr.io/michalsy/gravity-dig-unity.aikogame
    newTag: "1.0.0"  # Wird von CI aktualisiert
```

**Zu erledigen:**
- [ ] Neue Kustomization erstellen
- [ ] Committen & Pushen

---

### Schritt 3.2: ArgoCD App erstellen

**Option A:** Manuelle Erstellung (Web UI)
**Option B:** App-of-Apps Pattern (wenn vorhanden)

**App-Definition:**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: gravity-dig-unity
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/MichalSy/gitops-config
    targetRevision: HEAD
    path: apps/gravity-dig-unity
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

---

### Schritt 3.3: DNS/Subdomain

**Subdomain:** `gravity-dig-unity.sytko.de`

**Ingress:** Wird automatisch via `base-web/ingress.yaml` erstellt
- Host: `gravity-dig-unity.sytko.de`
- TLS: Let's Encrypt (Traefik)

**Keine manuelle DNS-Config nötig** (Wildcard auf `*.sytko.de`)

---

### Schritt 3.4: Erstes Deployment

**Erfolgskriterien:**
- [ ] ArgoCD App zeigt "Synced" & "Healthy"
- [ ] Pod läuft (`kubectl get pods`)
- [ ] Subdomain erreichbar (`curl https://gravity-dig-unity.sytko.de`)
- [ ] Unity WebGL lädt im Browser
- [ ] Keine CORS-Fehler in DevTools

---

## Phase 4: Game Migration (nach erfolgreichem Deployment)

### Schritt 4.1: Core Scripts

**Player-System:**
| Godot | Unity |
|-------|-------|
| `Player.gd` | `PlayerController.cs` |
| `CharacterBody2D` | `Rigidbody2D` + Script |
| `move_and_slide()` | `Rigidbody2D.MovePosition()` |
| `Input.is_action_pressed` | `Input.GetAxis()` |

**Physics:**
- Godot: Eigene Physics-Engine
- Unity: Box2D (2D Physics)

**Aufwand:** Hoch (Physics-Verhalten unterscheidet sich)

---

### Schritt 4.2: World Generation

**LevelGenerator.gd → LevelGenerator.cs**

**Wichtige Unterschiede:**
- Godot `TileMap` → Unity `Tilemap`
- Godot `Dictionary` → Unity `Dictionary` oder `HashSet`
- Signal-System → C# Events

**Aufwand:** Mittel (Logik identisch, API anders)

---

### Schritt 4.3: UI & HUD

**Godot UI → Unity UI (uGUI)**
- `Canvas` + `RectTransform`
- `TextMeshPro` für Text
- `UnityEvent` für Button-Clicks

**Aufwand:** Mittel

---

### Schritt 4.4: Assets

**Sprites:**
- Godot `.png` → Unity `Sprite` (2D and Texture)
- Atlas-System ähnlich

**Tilesets:**
- Godot `TileSet` → Unity `Tile Palette`
- JSON-Configs können übernommen werden

**Aufwand:** Niedrig (meist Drag & Drop)

---

## ⚠️ Bekannte Herausforderungen

### 1. Unity WebGL-Größe
- Godot Web: ~5-10 MB
- Unity WebGL: ~15-30 MB (mit Brotli: ~5-10 MB)
- **Lösung:** Brotli Compression, Code Stripping

### 2. Build-Zeit
- Godot: 1-2 Minuten
- Unity: 5-15 Minuten (IL2CPP)
- **Lösung:** Akzeptieren, Caching in GitHub Actions

### 3. Unity Lizenz
- Personal License hat Splash Screen
- **Lösung:** Akzeptieren oder Plus/Pro License

### 4. Browser-Kompatibilität
- Unity WebGL kann auf Safari/iOS Probleme haben
- **Lösung:** Frühe Tests, Decompression Fallback aktivieren

---

## 🛠️ Tools & Ressourcen

### Unity
- **Download:** https://unity.com/download
- **Dokumentation:** https://docs.unity3d.com/6000.0/Documentation/Manual/
- **WebGL:** https://docs.unity3d.com/6000.0/Documentation/Manual/webgl.html

### game-ci
- **GitHub:** https://github.com/game-ci/unity-builder
- **Dokumentation:** https://game.ci/docs/github/getting-started
- **Docker Images:** https://github.com/game-ci/docker

### ArgoCD
- **Status:** https://argocd.sytko.de
- **GitOps-Config:** `MichalSy/gitops-config`

---

## ✅ Checkliste: Bereit zum Start?

### Phase 1 Vorbereitung
- [ ] Unity Account erstellt (https://unity.com)
- [ ] GitHub Secrets bereit (`UNITY_EMAIL`, `UNITY_PASSWORD`)
- [ ] Entscheidung: Lokale Unity-Installation gewünscht?
- [ ] Entscheidung: Subdomain `gravity-dig-unity.sytko.de` OK?

### Phase 2 Vorbereitung
- [ ] GitOps-Config Repo bereit
- [ ] ArgoCD Zugriff verifiziert
- [ ] Docker-Build-Verständnis (Multi-stage nicht nötig)

### Phase 3 Vorbereitung
- [ ] Zeitfenster für erste Tests (Build dauert ~10 Minuten)

---

## 📅 Nächste Schritte (nach Freigabe)

1. **Repo auf GitHub pushen**
2. **GitHub Secrets einrichten**
3. **Unity Hub installieren** (falls gewünscht)
4. **Leeres Unity-Projekt erstellen**
5. **GitHub Actions Workflow erstellen**
6. **Ersten Build testen**
7. **GitOps-Config aktualisieren**
8. **Deployment verifizieren**

---

**Status:** ⏳ Warte auf Freigabe

**Letzte Aktualisierung:** 2026-02-25
