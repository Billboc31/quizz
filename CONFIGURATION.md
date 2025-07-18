# 🔐 Configuration et Authentification

## Configuration des Administrateurs

### 📝 Fichier de Configuration

Le fichier `config.json` contient la liste des utilisateurs autorisés à accéder au mode administrateur :

```json
{
  "admins": [
    "bocquet.pierre@gmail.com",
    "admin@exemple.com"
  ],
  "quiz": {
    "questionTimer": 30,
    "maxParticipants": 100,
    "allowAnonymous": false
  },
  "security": {
    "requireEmailVerification": false,
    "allowSelfRegistration": true
  }
}
```

### ➕ Ajouter un Administrateur

1. **Ouvrez le fichier `config.json`**
2. **Ajoutez l'email** dans la liste `admins` :
   ```json
   "admins": [
     "bocquet.pierre@gmail.com",
     "admin@exemple.com",
     "nouvel.admin@exemple.com"
   ]
   ```
3. **Redémarrez le serveur** : `npm start`

### ❌ Supprimer un Administrateur

1. **Ouvrez le fichier `config.json`**
2. **Supprimez l'email** de la liste `admins`
3. **Redémarrez le serveur**

## 🔒 Système d'Authentification

### Fonctionnement

1. **Vérification en temps réel** : Quand un utilisateur tape son email, le système vérifie s'il est dans la liste des admins
2. **Case "Mode Administrateur"** : N'apparaît que pour les emails autorisés
3. **Contrôle côté serveur** : Même si quelqu'un contourne le frontend, le serveur vérifie les droits
4. **Sessions sécurisées** : Chaque connexion génère une session unique

### Interface Utilisateur

- **Utilisateur non-admin** : La case "Mode Administrateur" est masquée
- **Utilisateur admin** : La case apparaît automatiquement
- **Tentative d'accès non autorisé** : Message d'erreur explicite

## 💾 Sauvegarde des Données

### Structure des Fichiers

```
data/
├── users.json      # Comptes utilisateurs et sessions
└── questions.json  # Questions du quiz
```

### Fichier `users.json`

```json
{
  "users": {
    "user@exemple.com": {
      "email": "user@exemple.com",
      "firstLogin": "2024-01-01T10:00:00Z",
      "lastLogin": "2024-01-01T15:30:00Z",
      "loginCount": 5,
      "isAdmin": false
    }
  },
  "sessions": {
    "session123": {
      "email": "user@exemple.com",
      "isAdmin": false,
      "createdAt": "2024-01-01T15:30:00Z",
      "lastActivity": "2024-01-01T15:45:00Z"
    }
  },
  "lastUpdated": "2024-01-01T15:45:00Z"
}
```

### Fichier `questions.json`

```json
{
  "questions": [
    {
      "id": 1640995200000,
      "text": "Quelle est la capitale de la France ?",
      "options": ["Londres", "Berlin", "Paris", "Madrid"],
      "correctAnswer": 2,
      "createdBy": "admin@exemple.com",
      "createdAt": "2024-01-01T10:00:00Z"
    }
  ],
  "lastUpdated": "2024-01-01T10:00:00Z"
}
```

## 🚨 Sécurité

### Mesures Implémentées

1. **Vérification côté serveur** : Toutes les actions admin sont vérifiées
2. **Sessions temporaires** : Les sessions expirent automatiquement
3. **Logs détaillés** : Toutes les actions sont tracées
4. **Validation des données** : Tous les inputs sont validés

### Bonnes Pratiques

- **Emails valides** : Utilisez des adresses email réelles
- **Sauvegarde régulière** : Sauvegardez les fichiers `data/`
- **Accès restreint** : Ne partagez pas les droits admin
- **Surveillance** : Vérifiez les logs régulièrement

## 🛠️ Dépannage

### Problème : "Accès administrateur non autorisé"

**Cause** : L'email n'est pas dans la liste des admins

**Solution** :
1. Vérifiez l'orthographe de l'email
2. Ajoutez l'email dans `config.json`
3. Redémarrez le serveur

### Problème : La case admin n'apparaît pas

**Cause** : Problème de connexion à l'API

**Solution** :
1. Vérifiez que le serveur fonctionne
2. Ouvrez la console du navigateur (F12)
3. Vérifiez les erreurs réseau

### Problème : Les questions ne se sauvegardent pas

**Cause** : Problème de permissions de fichier

**Solution** :
1. Vérifiez que le dossier `data/` existe
2. Vérifiez les permissions d'écriture
3. Créez le dossier : `mkdir data`

## 📊 Monitoring

### Logs Serveur

Le serveur affiche des logs détaillés :

```
✅ Connexion réussie - Administrateur: admin@exemple.com
📨 Message reçu: { type: 'game-started', ... }
✅ Question ajoutée par: admin@exemple.com
❌ Tentative d'accès non autorisé: user@exemple.com
```

### Statistiques

Accédez aux statistiques via l'API :

```bash
curl http://localhost:3000/api/stats
```

Retourne :
```json
{
  "totalUsers": 10,
  "totalQuestions": 25,
  "activeSessions": 3,
  "admins": 2
}
```

## 🔧 Configuration Avancée

### Paramètres du Quiz

Dans `config.json`, vous pouvez modifier :

- `questionTimer` : Durée en secondes (défaut: 30)
- `maxParticipants` : Nombre max de participants (défaut: 100)
- `allowAnonymous` : Autoriser les connexions sans email (défaut: false)

### Paramètres de Sécurité

- `requireEmailVerification` : Vérifier les emails (défaut: false)
- `allowSelfRegistration` : Autoriser l'auto-inscription (défaut: true)

---

**💡 Conseil** : Sauvegardez régulièrement vos fichiers de configuration et de données pour éviter toute perte d'information ! 