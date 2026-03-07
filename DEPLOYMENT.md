# Twitch Correlation Analyzer - Déploiement Automatique

## 🚀 Déploiement Automatique sur VPS

Ce guide explique comment configurer le déploiement automatique sur votre VPS à chaque push Git.

### 📋 Prérequis

- Un VPS Linux (Ubuntu/Debian recommandé)
- **Node.js 20+** (sera installé automatiquement)
- Un compte GitHub
- Accès SSH à votre VPS

### 🔐 Étape 1 : Configuration SSH sur le VPS

Connectez-vous à votre VPS et exécutez ces commandes :

```bash
# Générer une clé SSH pour GitHub Actions
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy -N ""

# Ajouter la clé publique aux authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Afficher la clé privée (à copier)
cat ~/.ssh/github_deploy
```

**Copiez la clé privée affichée** (tout le texte entre `-----BEGIN OPENSSH PRIVATE KEY-----` et `-----END OPENSSH PRIVATE KEY-----`).

### 🐙 Étape 2 : Configuration GitHub

1. **Créer un repository GitHub** :
   - Allez sur https://github.com/new
   - Créez un repo (ex: `twitch-analyzer`)

2. **Ajouter les secrets** :
   - Allez dans Settings > Secrets and variables > Actions
   - Ajoutez ces 3 secrets :
     ```
     VPS_HOST = votre_ip_vps (ex: 72.62.176.93)
     VPS_USER = root (ou votre user SSH)
     VPS_SSH_KEY = [la clé privée copiée à l'étape 1]
     ```

### 🖥️ Étape 3 : Configuration Initiale du VPS

1. **Téléchargez et exécutez le script de déploiement** :
   ```bash
   wget https://raw.githubusercontent.com/Yukioooh/twitch-analyzer/main/deploy-vps.sh
   chmod +x deploy-vps.sh
   ./deploy-vps.sh
   ```

2. **Configurez le fichier .env** :
   ```bash
   nano .env
   ```
   Remplissez vos vraies credentials Twitch.

### 📤 Étape 4 : Premier Push

Sur votre machine locale :

```bash
cd "C:\Users\User\Desktop\traitre Eto"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/twitch-analyzer.git
git push -u origin main
```

### 🔄 Déploiement Automatique

À partir de maintenant, **chaque push sur la branche `main`** déclenchera automatiquement :

1. ✅ Build du frontend
2. ✅ Déploiement sur le VPS
3. ✅ Redémarrage de l'application
4. ✅ Vérification que l'app fonctionne

### 📊 Monitoring

- **Logs de l'application** : `tail -f /root/twitch-analyzer/app.log`
- **Status de l'app** : `curl http://localhost:3001/api/health`
- **Processus** : `ps aux | grep node`

### 🛠️ Dépannage

**Si le déploiement échoue :**
- Vérifiez les logs GitHub Actions
- Vérifiez la connectivité SSH : `ssh -i ~/.ssh/github_deploy root@VOTRE_VPS_IP`
- Vérifiez que l'app peut démarrer manuellement : `cd /root/twitch-analyzer && npm start`

**Redémarrage manuel :**
```bash
cd /root/twitch-analyzer
pkill -f "node src/index.js"
nohup npm start > app.log 2>&1 &
```

### 🔒 Sécurité

- Le fichier `.env` n'est pas commité (présent dans `.gitignore`)
- Les credentials Twitch sont stockés uniquement sur le VPS
- La base de données SQLite reste locale sur le VPS
- L'accès SSH utilise une clé dédiée pour GitHub Actions

---

🎉 **Votre application se déploie maintenant automatiquement !**