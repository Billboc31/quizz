# Guide de déploiement - Quiz Interactif

## Migration vers Supabase + Vercel

### Étape 1 : Configuration Supabase

1. **Créer un projet Supabase** :
   - Aller sur https://supabase.com
   - Créer un nouveau projet
   - Noter l'URL du projet et la clé anonyme

2. **Créer les tables** :
   Exécuter ce SQL dans l'éditeur Supabase :

```sql
-- Table des utilisateurs
CREATE TABLE users (
    email TEXT PRIMARY KEY,
    first_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    login_count INTEGER DEFAULT 1,
    is_admin BOOLEAN DEFAULT FALSE
);

-- Table des sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    email TEXT REFERENCES users(email),
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des questions
CREATE TABLE questions (
    id BIGSERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'multiple_choice',
    options TEXT[],
    correct_answer INTEGER,
    correct_answers TEXT[],
    threshold DECIMAL(3,2) DEFAULT 0.8,
    "order" INTEGER DEFAULT 0,
    created_by TEXT REFERENCES users(email),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des messages (pour temps réel)
CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    email TEXT,
    data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activer RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Politiques RLS (permettre tout pour l'instant)
CREATE POLICY "Enable all for authenticated users" ON users FOR ALL USING (true);
CREATE POLICY "Enable all for authenticated users" ON sessions FOR ALL USING (true);
CREATE POLICY "Enable all for authenticated users" ON questions FOR ALL USING (true);
CREATE POLICY "Enable all for authenticated users" ON messages FOR ALL USING (true);
```

3. **Configurer les variables** :
   Dans `public/script.js`, remplacer :
   ```javascript
   const SUPABASE_URL = 'https://your-project.supabase.co';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   ```

### Étape 2 : Déploiement Vercel

1. **Se connecter à Vercel** :
   ```bash
   vercel login
   ```

2. **Déployer le projet** :
   ```bash
   vercel
   ```

3. **Suivre les instructions** :
   - Choisir le scope/team
   - Confirmer le nom du projet
   - Confirmer le dossier de déploiement (.)
   - Confirmer les paramètres

### Étape 3 : Configuration des variables d'environnement

Dans le dashboard Vercel, ajouter :
- `SUPABASE_URL` : URL de votre projet Supabase
- `SUPABASE_ANON_KEY` : Clé anonyme de Supabase

### Étape 4 : Test

1. L'application sera accessible à l'URL fournie par Vercel
2. Tester la connexion admin avec votre email
3. Créer quelques questions de test
4. Tester le jeu avec plusieurs onglets

## Fonctionnalités

✅ **Fonctionnalités conservées** :
- Interface admin/utilisateur
- Gestion des questions (choix multiple, vrai/faux, texte libre)
- Jeu en temps réel
- Système de scores
- Sessions par onglet

✅ **Améliorations** :
- Base de données persistante (Supabase)
- Déploiement cloud (Vercel)
- Temps réel avec Supabase Realtime
- Pas de serveur à maintenir

## Dépannage

### Mode local
Si Supabase n'est pas configuré, l'application fonctionne en mode local avec les WebSockets originaux.

### Erreurs de connexion
Vérifier :
- URL et clé Supabase correctes
- Tables créées dans Supabase
- Politiques RLS configurées

### Problèmes de déploiement
- Vérifier que `vercel.json` est présent
- S'assurer que les dépendances sont installées
- Vérifier les logs dans le dashboard Vercel 