# Hebergement Gratuit 24/24

## Options gratuites pour faire tourner le projet en continu

### 1. Railway.app (Recommande)

**Gratuit**: 500 heures/mois (assez pour ~20 jours continus, ou illimite avec carte bancaire sans frais)

```bash
# Installation
npm install -g @railway/cli
railway login

# Deploiement
cd "c:\Users\User\Desktop\traitre Eto"
railway init
railway up
```

**Avantages**:
- Deploiement simple
- Base de donnees SQLite persistante
- Variables d'environnement faciles a configurer

---

### 2. Render.com

**Gratuit**: Service "Free" avec limitations (s'eteint apres 15 min d'inactivite)

**Solution**: Utiliser un service de ping comme UptimeRobot pour garder le service actif.

```bash
# Ajouter un fichier render.yaml a la racine
```

```yaml
services:
  - type: web
    name: twitch-analyzer
    env: node
    buildCommand: npm install && cd frontend && npm install && npm run build
    startCommand: npm start
    envVars:
      - key: TWITCH_CLIENT_ID
        sync: false
      - key: TWITCH_CLIENT_SECRET
        sync: false
```

---

### 3. Fly.io

**Gratuit**: 3 VMs partagees, 3GB de stockage persistant

```bash
# Installation
# Telecharger depuis https://fly.io/docs/hands-on/install-flyctl/

flyctl auth signup
flyctl launch
flyctl deploy
```

---

### 4. Oracle Cloud Free Tier (Le plus genereux)

**Gratuit PERMANENT**:
- 2 VMs AMD (1GB RAM chacune)
- 4 VMs ARM (24GB RAM total!)

C'est la meilleure option pour du 24/24 vraiment gratuit.

```bash
# Sur la VM Oracle:
sudo apt update && sudo apt install -y nodejs npm git

# Cloner le projet
git clone <votre-repo> twitch-analyzer
cd twitch-analyzer
npm install
cd frontend && npm install && npm run build && cd ..

# Lancer avec PM2 pour qu'il tourne en permanence
npm install -g pm2
pm2 start src/index.js --name twitch-analyzer
pm2 save
pm2 startup
```

---

### 5. Raspberry Pi (Chez toi)

**Cout**: ~40-50 EUR une seule fois

Si tu as un Raspberry Pi ou un vieux PC, tu peux faire tourner ca chez toi 24/24.

```bash
# Sur le Raspberry Pi
git clone <repo> twitch-analyzer
cd twitch-analyzer
npm install
cd frontend && npm install && npm run build && cd ..

# Installer PM2
npm install -g pm2
pm2 start src/index.js --name twitch-analyzer
pm2 save
pm2 startup
```

---

## Configuration pour la production

### 1. Creer un fichier .env de production

```env
TWITCH_CLIENT_ID=zxdj1qjev5lglvlf6h31as37w5vz4o
TWITCH_CLIENT_SECRET=1trv88bfp3h0t8oft8mwmmb6xz6ls7
STREAMER_1=tikyjr
STREAMER_2=etostark
PORT=3001
POLLING_INTERVAL=60
NODE_ENV=production
```

### 2. Build le frontend

```bash
cd frontend
npm run build
cd ..
```

### 3. Lancer en production

```bash
# Avec PM2 (recommande)
pm2 start src/index.js --name twitch-analyzer

# Ou avec Node directement
NODE_ENV=production node src/index.js
```

---

## Comparatif

| Service | Gratuit | 24/24 | Persistance | Difficulte |
|---------|---------|-------|-------------|------------|
| Railway | 500h/mois | Oui* | Oui | Facile |
| Render | Oui | Non** | Non | Facile |
| Fly.io | 3 VMs | Oui | Oui | Moyen |
| Oracle Cloud | Oui | Oui | Oui | Moyen |
| Raspberry Pi | Achat | Oui | Oui | Facile |

\* Illimite avec carte bancaire (sans frais)
\** Necessie UptimeRobot ou similaire

---

## Ma recommandation

Pour du **gratuit et simple**: **Railway.app**
Pour du **gratuit permanent**: **Oracle Cloud Free Tier**
Pour du **controle total**: **Raspberry Pi** ou vieux PC chez toi

---

## Note sur l'API Twitch

L'API Twitch a des **rate limits**:
- ~800 requetes par minute avec un token App
- Le polling toutes les 60 secondes est largement suffisant

La verification des follows necessite potentiellement un **User Access Token** pour certains endpoints. Si la verification des follows ne fonctionne pas, les traitres seront quand meme detectes via le chat (methode principale).
