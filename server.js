const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware pour parser JSON
app.use(express.json());

// Charger la configuration
let config = {};
try {
    config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
} catch (error) {
    console.error('❌ Erreur lors du chargement de la configuration:', error);
    config = { admins: [], quiz: { questionTimer: 30 } };
}

// Fonction pour calculer la distance de Levenshtein
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    // Normaliser les chaînes (minuscules, sans accents)
    const normalize = (str) => str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    
    const a = normalize(str1);
    const b = normalize(str2);
    
    // Créer la matrice
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    // Remplir la matrice
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
}

// Fonction pour vérifier la proximité de texte
function isTextSimilar(userAnswer, correctAnswer, threshold = 0.8) {
    if (!userAnswer || !correctAnswer) return false;
    
    // Normaliser les réponses
    const normalizeText = (text) => text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    
    const normalizedUser = normalizeText(userAnswer);
    const normalizedCorrect = normalizeText(correctAnswer);
    
    // Vérification exacte d'abord
    if (normalizedUser === normalizedCorrect) {
        return true;
    }
    
    // Vérification si l'une contient l'autre
    if (normalizedUser.includes(normalizedCorrect) || normalizedCorrect.includes(normalizedUser)) {
        return true;
    }
    
    // Calcul de la distance de Levenshtein
    const distance = levenshteinDistance(normalizedUser, normalizedCorrect);
    const maxLength = Math.max(normalizedUser.length, normalizedCorrect.length);
    
    if (maxLength === 0) return true;
    
    const similarity = 1 - (distance / maxLength);
    
    console.log(`🔍 Validation texte libre:
    - Utilisateur: "${userAnswer}" -> "${normalizedUser}"
    - Correct: "${correctAnswer}" -> "${normalizedCorrect}"
    - Distance: ${distance}
    - Similarité: ${similarity.toFixed(2)}
    - Seuil: ${threshold}
    - Résultat: ${similarity >= threshold}`);
    
    return similarity >= threshold;
}

// Fonction pour valider une réponse selon le type de question
function validateAnswer(question, userAnswer) {
    switch (question.type) {
        case 'multiple_choice':
            return userAnswer === question.correctAnswer;
        
        case 'true_false':
            return userAnswer === question.correctAnswer;
        
        case 'free_text':
            if (Array.isArray(question.correctAnswers)) {
                return question.correctAnswers.some(answer => 
                    isTextSimilar(userAnswer, answer, question.threshold || 0.8)
                );
            }
            return isTextSimilar(userAnswer, question.correctAnswer, question.threshold || 0.8);
        
        default:
            // Questions sans type (anciennes questions) - traiter comme choix multiple
            if (question.options && typeof userAnswer === 'number') {
                return userAnswer === question.correctAnswer;
            }
            return false;
    }
}

// Fonctions utilitaires pour la gestion des données
function loadUsers() {
    try {
        const data = fs.readFileSync('data/users.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { users: {}, sessions: {}, lastUpdated: null };
    }
}

function saveUsers(userData) {
    try {
        userData.lastUpdated = new Date().toISOString();
        fs.writeFileSync('data/users.json', JSON.stringify(userData, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde des utilisateurs:', error);
        return false;
    }
}

function loadQuestions() {
    try {
        const data = fs.readFileSync('data/questions.json', 'utf8');
        const questionsData = JSON.parse(data);
        
        // Trier les questions par ordre
        if (questionsData.questions) {
            questionsData.questions.sort((a, b) => (a.order || 0) - (b.order || 0));
        }
        
        return questionsData;
    } catch (error) {
        return { questions: [], lastUpdated: null };
    }
}

function saveQuestions(questionsData) {
    try {
        questionsData.lastUpdated = new Date().toISOString();
        fs.writeFileSync('data/questions.json', JSON.stringify(questionsData, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde des questions:', error);
        return false;
    }
}

function isAdmin(email) {
    return config.admins.includes(email);
}

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname)));

// Route principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API Routes
// Vérifier si un utilisateur est admin
app.post('/api/check-admin', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email requis' });
    }
    
    const isUserAdmin = isAdmin(email);
    res.json({ isAdmin: isUserAdmin });
});

// Connexion utilisateur
app.post('/api/login', (req, res) => {
    const { email, requestAdmin } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email requis' });
    }
    
    // Vérifier si l'utilisateur demande l'accès admin
    if (requestAdmin && !isAdmin(email)) {
        return res.status(403).json({ error: 'Accès administrateur non autorisé pour cet utilisateur' });
    }
    
    // Charger les utilisateurs existants
    const userData = loadUsers();
    
    // Créer ou mettre à jour l'utilisateur
    if (!userData.users[email]) {
        userData.users[email] = {
            email: email,
            firstLogin: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            loginCount: 1,
            isAdmin: isAdmin(email)
        };
    } else {
        userData.users[email].lastLogin = new Date().toISOString();
        userData.users[email].loginCount += 1;
    }
    
    // Générer une session
    const sessionId = generateSessionId();
    userData.sessions[sessionId] = {
        email: email,
        isAdmin: requestAdmin && isAdmin(email),
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
    };
    
    // Sauvegarder
    saveUsers(userData);
    
    res.json({ 
        success: true, 
        sessionId: sessionId,
        isAdmin: requestAdmin && isAdmin(email),
        user: userData.users[email]
    });
});

// Déconnexion
app.post('/api/logout', (req, res) => {
    const { sessionId } = req.body;
    
    if (sessionId) {
        const userData = loadUsers();
        delete userData.sessions[sessionId];
        saveUsers(userData);
    }
    
    res.json({ success: true });
});

// Récupérer les questions (pour admin)
app.get('/api/questions', (req, res) => {
    const questionsData = loadQuestions();
    res.json(questionsData);
});

// Ajouter une question (pour admin)
app.post('/api/questions', (req, res) => {
    const { sessionId, question } = req.body;
    
    // Vérifier la session admin
    const userData = loadUsers();
    const session = userData.sessions[sessionId];
    
    if (!session || !session.isAdmin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    // Valider la question selon son type
    if (!question.type) {
        question.type = 'multiple_choice'; // Type par défaut
    }
    
    // Validation spécifique selon le type
    switch (question.type) {
        case 'multiple_choice':
            if (!question.options || question.options.length < 2) {
                return res.status(400).json({ error: 'Les questions à choix multiples doivent avoir au moins 2 options' });
            }
            break;
        
        case 'true_false':
            question.options = ['Vrai', 'Faux'];
            if (question.correctAnswer !== 0 && question.correctAnswer !== 1) {
                return res.status(400).json({ error: 'Les questions vrai/faux doivent avoir une réponse 0 (Vrai) ou 1 (Faux)' });
            }
            break;
        
        case 'free_text':
            if (!question.correctAnswer && !question.correctAnswers) {
                return res.status(400).json({ error: 'Les questions à texte libre doivent avoir au moins une réponse correcte' });
            }
            // Convertir en tableau si nécessaire
            if (question.correctAnswer && !question.correctAnswers) {
                question.correctAnswers = [question.correctAnswer];
            }
            break;
    }
    
    // Ajouter la question
    const questionsData = loadQuestions();
    
    // Déterminer l'ordre de la nouvelle question
    const maxOrder = questionsData.questions.reduce((max, q) => Math.max(max, q.order || 0), 0);
    
    const newQuestion = {
        ...question,
        id: Date.now(),
        order: question.order || (maxOrder + 1),
        createdBy: session.email,
        createdAt: new Date().toISOString()
    };
    
    questionsData.questions.push(newQuestion);
    saveQuestions(questionsData);
    
    res.json({ success: true, question: newQuestion });
});

// Supprimer une question (pour admin)
app.delete('/api/questions/:id', (req, res) => {
    const { sessionId } = req.body;
    const questionId = parseInt(req.params.id);
    
    // Vérifier la session admin
    const userData = loadUsers();
    const session = userData.sessions[sessionId];
    
    if (!session || !session.isAdmin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    // Supprimer la question
    const questionsData = loadQuestions();
    questionsData.questions = questionsData.questions.filter(q => q.id !== questionId);
    saveQuestions(questionsData);
    
    res.json({ success: true });
});

// Réorganiser les questions (pour admin)
app.put('/api/questions/reorder', (req, res) => {
    const { sessionId, questionOrders } = req.body;
    
    // Vérifier la session admin
    const userData = loadUsers();
    const session = userData.sessions[sessionId];
    
    if (!session || !session.isAdmin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    // Mettre à jour l'ordre des questions
    const questionsData = loadQuestions();
    
    questionOrders.forEach(({ id, order }) => {
        const question = questionsData.questions.find(q => q.id === id);
        if (question) {
            question.order = order;
        }
    });
    
    saveQuestions(questionsData);
    
    res.json({ success: true });
});

// Valider une réponse (pour le jeu)
app.post('/api/validate-answer', (req, res) => {
    const { questionId, userAnswer } = req.body;
    
    const questionsData = loadQuestions();
    const question = questionsData.questions.find(q => q.id === questionId);
    
    if (!question) {
        return res.status(404).json({ error: 'Question non trouvée' });
    }
    
    const isCorrect = validateAnswer(question, userAnswer);
    
    res.json({ 
        success: true, 
        isCorrect: isCorrect,
        questionType: question.type
    });
});

// Récupérer les statistiques (pour admin)
app.get('/api/stats', (req, res) => {
    const userData = loadUsers();
    const questionsData = loadQuestions();
    
    const stats = {
        totalUsers: Object.keys(userData.users).length,
        totalQuestions: questionsData.questions.length,
        activeSessions: Object.keys(userData.sessions).length,
        admins: config.admins.length
    };
    
    res.json(stats);
});

// Gestion des connexions WebSocket
wss.on('connection', (ws) => {
    console.log('📱 Nouvelle connexion WebSocket');
    
    ws.on('message', (message) => {
        try {
            // Convertir le message en string si c'est un Buffer
            const messageStr = message.toString();
            const data = JSON.parse(messageStr);
            console.log('📨 Reçu:', data.type, 'de', data.email || 'unknown');
            
            // Diffuser à TOUS les clients connectés
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(messageStr);
                }
            });
            
            console.log('📤 Diffusé à', wss.clients.size, 'clients');
            
        } catch (error) {
            console.error('❌ Erreur traitement message:', error);
            console.error('❌ Message reçu:', message);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 Connexion WebSocket fermée');
    });
    
    ws.on('error', (error) => {
        console.error('❌ Erreur WebSocket:', error);
    });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`🚀 Serveur démarré sur http://${HOST}:${PORT}`);
    console.log('📱 Accès local: http://localhost:' + PORT);
    
    // Afficher l'adresse IP locale pour l'accès réseau
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    const localIPs = [];
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
        networkInterfaces[interfaceName].forEach(interface => {
            if (interface.family === 'IPv4' && !interface.internal) {
                localIPs.push(interface.address);
            }
        });
    });
    
    if (localIPs.length > 0) {
        console.log('🌐 Accès réseau local:');
        localIPs.forEach(ip => {
            console.log(`   http://${ip}:${PORT}`);
        });
    }
    
    console.log('👥 Vous pouvez ouvrir ces URLs sur n\'importe quel appareil du réseau local');
});

// Gestion propre de l'arrêt du serveur
process.on('SIGINT', () => {
    console.log('\n⏹️  Arrêt du serveur...');
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n⏹️  Arrêt du serveur...');
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
}); 