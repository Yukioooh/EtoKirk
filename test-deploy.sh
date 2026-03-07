#!/bin/bash

# Script de test local pour vérifier le déploiement
# Usage: ./test-deploy.sh

echo "🧪 Test du déploiement local..."

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Vérifier npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm n'est pas installé"
    exit 1
fi

echo "✅ npm version: $(npm --version)"

# Installer les dépendances
echo "📦 Installation des dépendances..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Échec de l'installation des dépendances"
    exit 1
fi

echo "✅ Dépendances installées"

# Installer les dépendances frontend
echo "📦 Installation des dépendances frontend..."
cd frontend && npm install

if [ $? -ne 0 ]; then
    echo "❌ Échec de l'installation des dépendances frontend"
    exit 1
fi

echo "✅ Dépendances frontend installées"

# Build du frontend
echo "🔨 Build du frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Échec du build frontend"
    exit 1
fi

cd ..
echo "✅ Frontend buildé"

# Vérifier la syntaxe
echo "🔍 Vérification de la syntaxe..."
node -c src/index.js

if [ $? -ne 0 ]; then
    echo "❌ Erreur de syntaxe dans src/index.js"
    exit 1
fi

echo "✅ Syntaxe correcte"

# Vérifier le fichier .env
if [ ! -f .env ]; then
    echo "⚠️  Fichier .env manquant (copiez .env.example vers .env)"
else
    echo "✅ Fichier .env présent"
fi

echo ""
echo "🎉 Tests passés ! L'application est prête pour le déploiement."
echo ""
echo "Pour démarrer l'application :"
echo "  npm start"
echo ""
echo "Pour tester l'API :"
echo "  curl http://localhost:3001/api/health"