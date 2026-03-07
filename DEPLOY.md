# Guide de Deploiement - Twitch Correlation Analyzer

## Configuration GitHub Actions (Deploiement Automatique)

### Etape 1 : Configurer les secrets GitHub

1. Aller sur votre repo GitHub > Settings > Secrets and variables > Actions
2. Ajouter ces 3 secrets :

| Secret | Valeur |
|--------|--------|
| `VPS_HOST` | L'adresse IP de votre VPS (ex: 72.62.176.93) |
| `VPS_USER` | `root` (ou votre utilisateur SSH) |
| `VPS_SSH_KEY` | La cle privee SSH (voir etape 2) |

### Etape 2 : Generer une cle SSH sur le VPS

Connectez-vous a votre VPS et executez :

```bash
# Generer une nouvelle cle
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy -N ""

# Ajouter la cle publique aux cles autorisees
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Afficher la cle privee (a copier dans GitHub)
cat ~/.ssh/github_deploy
```

Copiez TOUT le contenu affiche (y compris `-----BEGIN OPENSSH PRIVATE KEY-----` et `-----END OPENSSH PRIVATE KEY-----`) dans le secret `VPS_SSH_KEY`.

### Etape 3 : Configuration initiale du VPS

Si ce n'est pas deja fait, executez sur le VPS :

```bash
# Installer Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Installer Git et PM2
apt install -y git
npm install -g pm2

# Cloner le repo
mkdir -p /root/twitch-analyzer
cd /root/twitch-analyzer
git clone https://github.com/VOTRE_USERNAME/VOTRE_REPO.git .

# Creer le fichier .env
cat > .env << 'EOF'
TWITCH_CLIENT_ID=votre_client_id
TWITCH_CLIENT_SECRET=votre_client_secret
STREAMER_1=tikyjr
STREAMER_2=etostark
PORT=3001
POLLING_INTERVAL=60
NODE_ENV=production
EOF

# Installer les dependances et build
npm install
cd frontend && npm install && npm run build && cd ..

# Demarrer l'application
pm2 start src/index.js --name twitch-analyzer
pm2 save
pm2 startup
```

### Etape 4 : Configurer Nginx

```bash
cat > /etc/nginx/sites-available/twitch-analyzer << 'EOF'
server {
    listen 80;
    server_name VOTRE_IP_OU_DOMAINE;

    location / {
        root /root/twitch-analyzer/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
EOF

ln -s /etc/nginx/sites-available/twitch-analyzer /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
chmod -R 755 /root
```

## Deploiement

### Automatique (recommande)

Chaque `git push` sur la branche `main` declenche automatiquement le deploiement.

### Manuel

Si besoin de deployer manuellement :

1. Aller sur GitHub > Actions > "Deploy to VPS"
2. Cliquer sur "Run workflow"

## Commandes utiles sur le VPS

```bash
# Voir les logs de l'application
pm2 logs twitch-analyzer

# Redemarrer l'application
pm2 restart twitch-analyzer

# Voir le statut
pm2 status

# Arreter l'application
pm2 stop twitch-analyzer

# Mettre a jour manuellement
cd /root/twitch-analyzer
git pull origin main
npm install
cd frontend && npm install && npm run build && cd ..
pm2 restart twitch-analyzer
```

## Securite

- Ne jamais commiter le fichier `.env` (il est dans `.gitignore`)
- La cle SSH privee ne doit etre stockee que dans les secrets GitHub
- Pensez a configurer un firewall (ufw)

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```
