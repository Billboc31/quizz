# 🎯 Quiz Interactif - Application de Quiz pour Mariages et Team Building

Une application web interactive permettant de créer et gérer des quiz en temps réel, parfaite pour les mariages, événements d'entreprise et activités de team building.

## ✨ Fonctionnalités

### 👨‍💼 Interface Administrateur
- **Gestion des questions** : Créer, modifier et supprimer des questions à choix multiples
- **Contrôle du jeu** : Lancer le quiz, passer aux questions suivantes, bloquer les réponses
- **Suivi en temps réel** : Voir les participants connectés et leurs réponses
- **Révélation des réponses** : Afficher la bonne réponse et les scores
- **Classement final** : Générer et afficher le leaderboard

### 👥 Interface Utilisateur
- **Connexion simple** : Authentification par email uniquement
- **Interface mobile** : Optimisée pour smartphones et tablettes
- **Réponses en temps réel** : Sélection des réponses avec feedback visuel
- **Timer** : Compte à rebours pour chaque question (30 secondes)
- **Score en direct** : Affichage du score personnel mis à jour
- **Classement** : Visualisation du classement final

### 🚀 Fonctionnalités Techniques
- **Communication temps réel** : WebSockets pour la synchronisation
- **Responsive design** : Interface adaptée à tous les écrans
- **Sauvegarde locale** : Les questions sont sauvegardées automatiquement
- **Déploiement simple** : Aucune base de données requise

## 🛠️ Installation

### Prérequis
- Node.js (version 14 ou supérieure)
- npm (inclus avec Node.js)

### Installation des dépendances
```bash
npm install
```

### Démarrage du serveur
```bash
npm start
```

L'application sera accessible à l'adresse : `http://localhost:3000`

## 🎮 Utilisation

### Configuration initiale
1. **Ouvrez votre navigateur** et accédez à `http://localhost:3000`
2. **Mode Administrateur** : Cochez "Mode Administrateur" et connectez-vous avec votre email
3. **Créez vos questions** dans l'onglet "Questions"

### Création d'un quiz
1. **Ajoutez des questions** :
   - Saisissez le texte de la question
   - Complétez les 4 options de réponse (A, B, C, D)
   - Sélectionnez la bonne réponse
   - Cliquez sur "Ajouter Question"

2. **Invitez les participants** :
   - Partagez l'URL `http://localhost:3000` avec les participants
   - Ils peuvent se connecter avec leur email (sans cocher "Mode Administrateur")

### Déroulement du jeu
1. **Démarrez le quiz** : Cliquez sur "🚀 Commencer le Quiz"
2. **Gérez les questions** :
   - Les participants voient la question et ont 30 secondes pour répondre
   - Cliquez sur "🚫 Bloquer les Réponses" pour arrêter le timer
   - Cliquez sur "✅ Montrer la Réponse" pour révéler la bonne réponse
   - Cliquez sur "➡️ Question Suivante" pour continuer
3. **Affichez le classement** : Cliquez sur "🏆 Classement Final" à la fin

## 📱 Utilisation Mobile

L'application est entièrement responsive et optimisée pour les appareils mobiles :
- **Interface tactile** : Boutons larges et facilement cliquables
- **Affichage adaptatif** : Mise en page qui s'adapte à la taille de l'écran
- **Navigation intuitive** : Interface simplifiée sur mobile

## 🎯 Cas d'usage

### 🎊 Mariages
- Quiz sur les mariés
- Jeux de connaissance des invités
- Animation pendant le cocktail
- Activité pour les enfants

### 🏢 Team Building
- Quiz de culture générale
- Questions sur l'entreprise
- Jeux de connaissance entre collègues
- Formation ludique

### 🎉 Événements
- Animation de soirée
- Jeux entre amis
- Activités éducatives
- Compétitions amicales

## 🔧 Personnalisation

### Modification du timer
Dans `script.js`, ligne 10, modifiez la valeur :
```javascript
let timeLeft = 30; // Changer pour le nombre de secondes souhaité
```

### Modification des couleurs
Dans `styles.css`, modifiez les variables CSS :
```css
:root {
    --primary-color: #667eea;    /* Couleur principale */
    --secondary-color: #764ba2;  /* Couleur secondaire */
    --success-color: #10b981;    /* Couleur de succès */
    --error-color: #ef4444;      /* Couleur d'erreur */
}
```

## 🌐 Déploiement

### Déploiement local (réseau local)
1. Démarrez le serveur : `npm start`
2. Trouvez votre adresse IP locale : `ipconfig` (Windows) ou `ifconfig` (Mac/Linux)
3. Partagez l'URL : `http://[VOTRE-IP]:3000`

### Déploiement en ligne
L'application peut être déployée sur :
- **Heroku** : Ajoutez simplement les fichiers et déployez
- **Netlify** : Pour les fichiers statiques uniquement
- **Vercel** : Support Node.js intégré
- **DigitalOcean** : Serveur VPS

## 🤝 Fonctionnalités Avancées

### Questions d'exemple
L'application inclut 3 questions d'exemple au premier démarrage :
- Géographie (Capitale de la France)
- Mathématiques (2 + 2)
- Culture générale (Plus grand océan)

### Sauvegarde automatique
- Les questions sont sauvegardées dans le localStorage du navigateur
- Pas de perte de données lors du rafraîchissement de la page
- Possibilité d'exporter/importer les questions (fonctionnalité future)

## 🔒 Sécurité

- **Authentification simple** : Basée sur l'email uniquement (appropriée pour des événements fermés)
- **Pas de données sensibles** : Aucune information personnelle stockée
- **Session locale** : Les données ne persistent que durant la session

## 🐛 Dépannage

### Le serveur ne démarre pas
- Vérifiez que Node.js est installé : `node --version`
- Vérifiez que les dépendances sont installées : `npm install`
- Vérifiez que le port 3000 est libre

### Les participants ne voient pas les questions
- Vérifiez que tous les participants utilisent la même URL
- Actualisez la page des participants
- Vérifiez la connexion WebSocket dans la console du navigateur

### L'interface ne s'affiche pas correctement
- Videz le cache du navigateur
- Vérifiez que tous les fichiers (HTML, CSS, JS) sont présents
- Testez avec un autre navigateur

## 📞 Support

Pour toute question ou problème :
1. Vérifiez la console du navigateur (F12) pour les erreurs
2. Consultez les logs du serveur dans le terminal
3. Redémarrez le serveur si nécessaire

## 🎨 Captures d'écran

### Interface de connexion
- Design moderne avec gradient
- Option administrateur/utilisateur
- Authentification par email

### Interface administrateur
- Gestion des questions avec prévisualisation
- Contrôles de jeu intuitifs
- Suivi des participants en temps réel

### Interface utilisateur
- Affichage des questions optimisé mobile
- Timer visuel
- Feedback immédiat sur les réponses

---

**Développé avec ❤️ pour créer des moments inoubliables lors de vos événements !**
