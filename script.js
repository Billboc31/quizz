// Configuration Supabase
const SUPABASE_URL='https://wnbnwybkhpapjnkllutr.supabase.co'
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduYm53eWJraHBhcGpua2xsdXRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5NTksImV4cCI6MjA2ODQxODk1OX0.G3UaSg6s4Ihlgk1vlTZScqOwUV4qME3lDurUL6okIe4'

console.log('🚀 Script chargé - Configuration Supabase:', {
    url: SUPABASE_URL,
    keyLength: SUPABASE_ANON_KEY.length
});

// Test immédiat pour vérifier que le script fonctionne
console.log('🧪 Test script - Date:', new Date().toISOString());
console.log('🧪 Test script - User Agent:', navigator.userAgent);
console.log('🧪 Test script - URL:', window.location.href);

// Initialisation Supabase (sera configuré plus tard)
let supabase = null;
let messagesChannel = null;

// État global de l'application
let currentUser = null;
let sessionId = null;
let isAdmin = false;
let questions = [];
let currentQuestionIndex = 0;
let gameState = 'waiting'; // waiting, question, blocked, answer, finished
let participants = new Map();
let userAnswers = new Map();
let scores = new Map();
let tabId = null;

// Configuration par défaut
const DEFAULT_CONFIG = {
    admins: ['bocquet.pierre@gmail.com'], // Ajoutez vos emails admin ici
    quiz: { questionTimer: 30 }
};

// Gestion de session
function generateTabId() {
    if (!tabId) {
        tabId = 'tab_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }
    return tabId;
}

function saveSession() {
    const sessionData = {
        tabId: generateTabId(),
        currentUser: currentUser,
        sessionId: sessionId,
        isAdmin: isAdmin,
        gameState: gameState,
        currentQuestionIndex: currentQuestionIndex,
        participants: Array.from(participants.entries()),
        userAnswers: Array.from(userAnswers.entries()),
        scores: Array.from(scores.entries()),
        questions: questions,
        timestamp: Date.now()
    };
    
    sessionStorage.setItem('quizSession', JSON.stringify(sessionData));
    console.log('💾 Session sauvegardée (onglet)');
}

function restoreSession() {
    const savedSession = sessionStorage.getItem('quizSession');
    if (!savedSession) {
        console.log('📝 Aucune session sauvegardée trouvée pour cet onglet');
        return false;
    }
    
    try {
        const sessionData = JSON.parse(savedSession);
        
        // Vérifier si la session n'est pas trop ancienne (1 heure)
        if (Date.now() - sessionData.timestamp > 3600000) {
            console.log('⏰ Session expirée');
            clearSession();
            return false;
        }
        
        // Restaurer les données
        tabId = sessionData.tabId;
        currentUser = sessionData.currentUser;
        sessionId = sessionData.sessionId;
        isAdmin = sessionData.isAdmin;
        gameState = sessionData.gameState;
        currentQuestionIndex = sessionData.currentQuestionIndex;
        participants = new Map(sessionData.participants);
        userAnswers = new Map(sessionData.userAnswers);
        scores = new Map(sessionData.scores);
        questions = sessionData.questions || [];
        
        // Afficher l'écran approprié
        if (currentUser) {
            showScreen(isAdmin ? 'admin-screen' : 'user-screen');
            updateUI();
            
            // Restaurer l'état du jeu
            if (isAdmin) {
                updateGameControls();
                updateResponsesDisplay();
                updateQuestionsDisplay();
            } else {
                // Restaurer l'état côté utilisateur
                restoreUserGameState();
            }
            
            console.log('🔄 Session restaurée pour:', currentUser, '(Onglet:', tabId, ')');
            return true;
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la restauration de session:', error);
        clearSession();
    }
    
    return false;
}

function clearSession() {
    sessionStorage.removeItem('quizSession');
    console.log('🗑️ Session effacée pour cet onglet');
}

function restoreUserGameState() {
    // Restaurer l'état du jeu côté utilisateur
    switch (gameState) {
        case 'waiting':
            resetUserGame();
            break;
        case 'question':
            if (questions[currentQuestionIndex]) {
                showQuestion(questions[currentQuestionIndex], currentQuestionIndex);
            }
            break;
        case 'blocked':
            if (questions[currentQuestionIndex]) {
                showQuestion(questions[currentQuestionIndex], currentQuestionIndex);
                blockUserAnswers();
            }
            break;
        case 'answer':
            if (questions[currentQuestionIndex]) {
                showQuestion(questions[currentQuestionIndex], currentQuestionIndex);
                showCorrectAnswer(questions[currentQuestionIndex], Array.from(scores.entries()));
            }
            break;
        case 'finished':
            const finalScores = Array.from(scores.entries())
                .map(([email, score]) => ({ email, score }))
                .sort((a, b) => b.score - a.score);
            showFinalLeaderboard(finalScores);
            break;
    }
}

// Fonctions utilitaires pour la validation des réponses
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
    
    return similarity >= threshold;
}

function validateAnswer(question, userAnswer) {
    switch (question.type) {
        case 'multiple_choice':
            return userAnswer === question.correct_answer;
        
        case 'true_false':
            return userAnswer === question.correct_answer;
        
        case 'free_text':
            if (Array.isArray(question.correct_answers)) {
                return question.correct_answers.some(answer => 
                    isTextSimilar(userAnswer, answer, question.threshold || 0.8)
                );
            }
            return isTextSimilar(userAnswer, question.correct_answer, question.threshold || 0.8);
        
        default:
            // Questions sans type (anciennes questions) - traiter comme choix multiple
            if (question.options && typeof userAnswer === 'number') {
                return userAnswer === question.correct_answer;
            }
            return false;
    }
}

function isAdminUser(email) {
    return DEFAULT_CONFIG.admins.includes(email);
}

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Gestion Supabase avec Realtime et fallback
let pollingInterval = null;
let lastMessageId = 0;

async function initializeSupabase() {
    try {
        // Importer Supabase dynamiquement
        const { createClient } = await import('https://cdn.skypack.dev/@supabase/supabase-js');
        
        // Créer le client Supabase
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // Essayer d'abord Supabase Realtime avec un canal unique
        try {
            const channelName = `quiz-room-${Date.now()}`;
            console.log('🔗 Création du canal Realtime:', channelName);
            
            messagesChannel = supabase
                .channel(channelName, {
                    config: {
                        broadcast: { self: true }
                    }
                })
                .on('broadcast', { event: 'game-message' }, (payload) => {
                    console.log('📨 Message Realtime reçu brut:', payload);
                    handleRealtimeMessage(payload.payload);
                })
                .subscribe((status) => {
                    console.log('📡 Statut canal Realtime:', status);
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Canal Realtime connecté et prêt');
                        // Test de connexion
                        setTimeout(() => {
                            testRealtimeConnection();
                        }, 1000);
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error('❌ Erreur canal Realtime, activation du fallback');
                        startPollingFallback();
                    } else if (status === 'TIMED_OUT') {
                        console.error('⏰ Timeout canal Realtime, activation du fallback');
                        startPollingFallback();
                    } else if (status === 'CLOSED') {
                        console.warn('🔒 Canal Realtime fermé, activation du fallback');
                        startPollingFallback();
                    }
                });
            
            // Timeout de sécurité pour activer le fallback si Realtime ne fonctionne pas
            setTimeout(() => {
                if (!messagesChannel || messagesChannel.state !== 'joined') {
                    console.warn('⚠️ Realtime non disponible, activation du fallback');
                    startPollingFallback();
                }
            }, 5000);
            
        } catch (realtimeError) {
            console.error('❌ Erreur Realtime:', realtimeError);
            startPollingFallback();
        }
        
        console.log('✅ Supabase initialisé');
        return true;
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation de Supabase:', error);
        console.log('⚠️ Fonctionnement en mode local uniquement');
        return false;
    }
}

function testRealtimeConnection() {
    console.log('🧪 Test de connexion Realtime...');
    
    if (messagesChannel) {
        const testMessage = {
            type: 'test-connection',
            email: currentUser || 'test-user',
            timestamp: new Date().toISOString()
        };
        
        messagesChannel.send({
            type: 'broadcast',
            event: 'game-message',
            payload: testMessage
        }).then((response) => {
            console.log('🧪 Réponse test Realtime:', response);
            if (response === 'ok') {
                console.log('✅ Test Realtime réussi');
            } else {
                console.error('❌ Test Realtime échoué:', response);
            }
        }).catch((error) => {
            console.error('❌ Erreur test Realtime:', error);
        });
    }
}

function startPollingFallback() {
    if (pollingInterval) return; // Éviter les doublons
    
    console.log('🔄 Démarrage du polling fallback');
    
    pollingInterval = setInterval(async () => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .gt('id', lastMessageId)
                .order('id', { ascending: true })
                .limit(10);
            
            if (error) {
                console.error('❌ Erreur polling:', error);
                return;
            }
            
            if (data && data.length > 0) {
                data.forEach(message => {
                    if (message.id > lastMessageId) {
                        lastMessageId = message.id;
                        console.log('📨 Message polling reçu:', message.type);
                        // Parser les données JSON
                        try {
                            const parsedData = JSON.parse(message.data);
                            handleRealtimeMessage(parsedData);
                        } catch (parseError) {
                            console.error('❌ Erreur parsing message:', parseError);
                            // Fallback avec les données directes
                            handleRealtimeMessage(message);
                        }
                    }
                });
            }
        } catch (error) {
            console.error('❌ Erreur polling fallback:', error);
        }
    }, 1000); // Polling toutes les secondes
    
    // Nettoyer les anciens messages toutes les 5 minutes
    setInterval(async () => {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            await supabase
                .from('messages')
                .delete()
                .lt('timestamp', fiveMinutesAgo);
            console.log('🧹 Anciens messages nettoyés');
        } catch (error) {
            console.error('❌ Erreur nettoyage messages:', error);
        }
    }, 5 * 60 * 1000);
}

function handleRealtimeMessage(data) {
    console.log('📨 Message Realtime reçu:', data.type, 'de', data.email || 'unknown');
    
    // Ignorer ses propres messages
    if (data.email === currentUser) {
        return;
    }
    
    handleGameMessage(data);
}

function handleGameMessage(data) {
    console.log('📨 Message de jeu reçu:', data.type, 'de', data.email || 'unknown');
    
    switch (data.type) {
        case 'test-connection':
            console.log('🧪 Message de test reçu - Realtime fonctionne !');
            return;
        case 'participant-joined':
            if (data.email !== currentUser) {
                participants.set(data.email, {
                    email: data.email,
                    score: 0,
                    answered: false,
                    joinedAt: new Date().toISOString()
                });
                updateParticipantsCount();
                if (isAdmin) {
                    updateResponsesDisplay();
                }
            }
            break;
            
        case 'participant-left':
            participants.delete(data.email);
            updateParticipantsCount();
            if (isAdmin) {
                updateResponsesDisplay();
            }
            break;
            
        case 'game-started':
            if (!isAdmin) {
                gameState = 'question';
                currentQuestionIndex = 0;
                showQuestion(data.question, data.questionIndex);
            }
            break;
            
        case 'next-question':
            if (!isAdmin) {
                gameState = 'question';
                currentQuestionIndex = data.questionIndex;
                showQuestion(data.question, data.questionIndex);
            }
            break;
            
        case 'answers-blocked':
            if (!isAdmin) {
                gameState = 'blocked';
                blockUserAnswers();
            }
            break;
            
        case 'show-answer':
            if (!isAdmin) {
                gameState = 'answer';
                showCorrectAnswer(data.question, data.scores);
            }
            break;
            
        case 'show-leaderboard':
            if (!isAdmin) {
                gameState = 'finished';
                showFinalLeaderboard(data.scores);
            }
            break;
            
        case 'game-reset':
            if (!isAdmin) {
                resetUserGame();
            }
            break;
            
        case 'user-answer':
            if (isAdmin && data.email !== currentUser) {
                handleUserAnswer(data.email, data.answer, data.questionId);
            }
            break;
    }
}

async function broadcastMessage(message) {
    try {
        console.log('📤 Envoi message:', message.type, 'Canal state:', messagesChannel?.state);
        
        if (supabase) {
            const payload = {
                ...message,
                timestamp: new Date().toISOString()
            };
            
            // Priorité à Realtime si disponible
            if (messagesChannel && messagesChannel.state === 'joined') {
                try {
                    const response = await messagesChannel.send({
                        type: 'broadcast',
                        event: 'game-message',
                        payload: payload
                    });
                    
                    console.log('📤 Réponse Realtime:', response);
                    
                    if (response === 'ok') {
                        console.log('✅ Message Realtime envoyé:', message.type);
                        return; // Succès Realtime, pas besoin de fallback
                    }
                } catch (realtimeError) {
                    console.error('❌ Erreur Realtime:', realtimeError);
                }
            }
            
            // Fallback : sauvegarder dans la table
            console.log('📤 Utilisation du fallback pour:', message.type);
            try {
                // Nettoyer le payload pour la table messages
                const dbPayload = {
                    type: payload.type,
                    email: payload.email,
                    data: JSON.stringify(payload),
                    timestamp: payload.timestamp
                };
                
                const { error } = await supabase
                    .from('messages')
                    .insert([dbPayload]);
                
                if (error) {
                    console.error('❌ Erreur sauvegarde message:', error);
                } else {
                    console.log('✅ Message sauvegardé (fallback):', message.type);
                }
            } catch (dbError) {
                console.error('❌ Erreur base de données:', dbError);
            }
        } else {
            // Mode local
            console.log('📤 Mode local:', message.type);
            handleGameMessage(message);
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'envoi du message:', error);
    }
}

// Gestion des données avec Supabase
async function saveUser(userData) {
    if (!supabase) return;
    
    try {
        const { error } = await supabase
            .from('users')
            .upsert([userData], { onConflict: 'email' });
        
        if (error) {
            console.error('❌ Erreur lors de la sauvegarde utilisateur:', error);
        }
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde utilisateur:', error);
    }
}

async function saveSessionData(sessionData) {
    if (!supabase || !sessionData) return;
    
    try {
        // Vérifier que les données sont valides
        if (!sessionData.id || !sessionData.email) {
            console.error('❌ Données de session invalides:', sessionData);
            return;
        }
        
        const { error } = await supabase
            .from('sessions')
            .upsert([sessionData], { onConflict: 'id' });
        
        if (error) {
            console.error('❌ Erreur lors de la sauvegarde session:', error);
        } else {
            console.log('✅ Session sauvegardée:', sessionData.id);
        }
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde session:', error);
    }
}

async function loadQuestions() {
    if (!supabase) {
        // Mode local - utiliser les données existantes
        return questions;
    }
    
    try {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .order('order', { ascending: true });
        
        if (error) {
            console.error('❌ Erreur lors du chargement des questions:', error);
            return [];
        }
        
        return data || [];
    } catch (error) {
        console.error('❌ Erreur lors du chargement des questions:', error);
        return [];
    }
}

async function saveQuestion(questionData) {
    if (!supabase) return null;
    
    try {
        const { data, error } = await supabase
            .from('questions')
            .insert([questionData])
            .select()
            .single();
        
        if (error) {
            console.error('❌ Erreur lors de la sauvegarde question:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde question:', error);
        return null;
    }
}

async function deleteQuestion(questionId) {
    if (!supabase) return false;
    
    try {
        const { error } = await supabase
            .from('questions')
            .delete()
            .eq('id', questionId);
        
        if (error) {
            console.error('❌ Erreur lors de la suppression question:', error);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ Erreur lors de la suppression question:', error);
        return false;
    }
}

// Initialisation de l'application
console.log('📄 DOM en cours de chargement...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM chargé - Initialisation de l\'application...');
    initializeApp();
});

// Fallback au cas où DOMContentLoaded ne se déclenche pas
if (document.readyState === 'loading') {
    console.log('📄 Document en cours de chargement, attente de DOMContentLoaded...');
} else {
    console.log('📄 Document déjà chargé, initialisation immédiate...');
    initializeApp();
}

async function initializeApp() {
    console.log('🚀 Initialisation de l\'application - Onglet:', generateTabId());
    
    try {
        // Vérifier s'il y a une session sauvegardée
        console.log('🔄 Restauration de session...');
        restoreSession();
        
        // Initialiser Supabase avec Realtime
        console.log('🔄 Initialisation Supabase...');
        const supabaseSuccess = await initializeSupabase();
        console.log('✅ Supabase initialisé:', supabaseSuccess);
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
    }
    
    // Gestion de la vérification admin en temps réel
    document.getElementById('email').addEventListener('input', checkAdminAccess);
    
    // Gestion de la connexion
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // Gestion des déconnexions
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('user-logout-btn').addEventListener('click', handleLogout);
    
    // Gestion des onglets admin
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });
    
    // Gestion des questions
    document.getElementById('add-question-btn').addEventListener('click', addQuestion);
    document.getElementById('sort-questions-btn').addEventListener('click', toggleSortMode);
    document.getElementById('question-type').addEventListener('change', handleQuestionTypeChange);
    document.getElementById('similarity-threshold').addEventListener('input', updateThresholdDisplay);
    
    // Gestion du jeu
    document.getElementById('start-game-btn').addEventListener('click', startGame);
    document.getElementById('next-question-btn').addEventListener('click', nextQuestion);
    document.getElementById('block-answers-btn').addEventListener('click', blockAnswers);
    document.getElementById('show-answer-btn').addEventListener('click', showAnswer);
    document.getElementById('show-leaderboard-btn').addEventListener('click', showLeaderboard);
    document.getElementById('reset-game-btn').addEventListener('click', resetGame);
    
    // Charger les données sauvegardées
    loadSavedData();
}

// Gestion de la connexion
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const adminMode = document.getElementById('admin-mode').checked;
    
    if (!email) {
        alert('Veuillez entrer votre adresse email');
        return;
    }
    
    // Vérifier si l'utilisateur demande l'accès admin
    if (adminMode && !isAdminUser(email)) {
        alert('Accès administrateur non autorisé pour cet utilisateur');
        return;
    }
    
    try {
        // Créer les données utilisateur
        const userData = {
            email: email,
            first_login: new Date().toISOString(),
            last_login: new Date().toISOString(),
            login_count: 1,
            is_admin: isAdminUser(email)
        };
        
        // Sauvegarder l'utilisateur
        await saveUser(userData);
        
        // Générer une session
        const newSessionId = generateSessionId();
        const sessionData = {
            id: newSessionId,
            email: email,
            is_admin: adminMode && isAdminUser(email),
            created_at: new Date().toISOString(),
            last_activity: new Date().toISOString()
        };
        
        await saveSessionData(sessionData);
        
        // Connexion réussie
        currentUser = email;
        sessionId = newSessionId;
        isAdmin = adminMode && isAdminUser(email);
        
        // Ajouter le participant
        if (!isAdmin) {
            participants.set(email, { email, score: 0, connected: true });
            scores.set(email, 0);
        }
        
        showScreen(isAdmin ? 'admin-screen' : 'user-screen');
        
        // Charger les questions si admin
        if (isAdmin) {
            await loadQuestionsFromServer();
        }
        
        updateUI();
        
        // Sauvegarder la session
        saveSession();
        
        // Notifier les autres participants
        await broadcastMessage({
            type: 'participant-joined',
            email: email
        });
        
        console.log(`✅ Connexion réussie - ${isAdmin ? 'Administrateur' : 'Utilisateur'}: ${email}`);
        
    } catch (error) {
        console.error('❌ Erreur lors de la connexion:', error);
        alert('Erreur de connexion. Veuillez réessayer.');
    }
}

async function handleLogout() {
    if (currentUser && !isAdmin) {
        participants.delete(currentUser);
        scores.delete(currentUser);
        
        await broadcastMessage({
            type: 'participant-left',
            email: currentUser
        });
    }
    
    currentUser = null;
    sessionId = null;
    isAdmin = false;
    
    // Effacer la session
    clearSession();
    
    showScreen('login-screen');
    
    // Reset du formulaire
    document.getElementById('login-form').reset();
    document.getElementById('admin-mode').checked = false;
}

// Gestion des écrans
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Gestion des onglets admin
function switchTab(e) {
    const targetTab = e.target.dataset.tab;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    e.target.classList.add('active');
    document.getElementById(targetTab + '-tab').classList.add('active');
}

// Vérification admin
function checkAdminAccess() {
    const email = document.getElementById('email').value;
    const adminCheckbox = document.getElementById('admin-mode');
    
    if (!email) {
        adminCheckbox.disabled = true;
        return;
    }
    
    const isUserAdmin = isAdminUser(email);
    adminCheckbox.disabled = !isUserAdmin;
    
    if (!isUserAdmin) {
        adminCheckbox.checked = false;
    }
}

// Gestion des questions
function handleQuestionTypeChange() {
    const questionType = document.getElementById('question-type').value;
    const multipleChoiceOptions = document.getElementById('multiple-choice-options');
    const correctAnswerSelect = document.getElementById('correct-answer');
    const trueFalseOptions = document.getElementById('true-false-options');
    const freeTextOptions = document.getElementById('free-text-options');
    
    // Masquer toutes les options
    multipleChoiceOptions.style.display = 'none';
    correctAnswerSelect.style.display = 'none';
    trueFalseOptions.style.display = 'none';
    freeTextOptions.style.display = 'none';
    
    // Afficher les options appropriées
    switch (questionType) {
        case 'multiple_choice':
            multipleChoiceOptions.style.display = 'block';
            correctAnswerSelect.style.display = 'block';
            break;
        case 'true_false':
            trueFalseOptions.style.display = 'block';
            break;
        case 'free_text':
            freeTextOptions.style.display = 'block';
            break;
    }
}

function updateThresholdDisplay() {
    const threshold = document.getElementById('similarity-threshold').value;
    const thresholdValue = document.getElementById('threshold-value');
    thresholdValue.textContent = Math.round(threshold * 100) + '%';
}

async function addQuestion() {
    const questionText = document.getElementById('question-text').value;
    const questionType = document.getElementById('question-type').value;
    
    if (!questionText.trim()) {
        alert('Veuillez entrer une question');
        return;
    }
    
    let questionData = {
        text: questionText,
        type: questionType,
        created_by: currentUser,
        created_at: new Date().toISOString()
    };
    
    // Traitement selon le type de question
    switch (questionType) {
        case 'multiple_choice':
            const options = Array.from(document.querySelectorAll('.option-input'))
                .map(input => input.value.trim())
                .filter(option => option);
            
            if (options.length < 2) {
                alert('Veuillez entrer au moins 2 options');
                return;
            }
            
            questionData.options = options;
            questionData.correct_answer = parseInt(document.getElementById('correct-answer').value);
            break;
            
        case 'true_false':
            questionData.options = ['Vrai', 'Faux'];
            questionData.correct_answer = parseInt(document.getElementById('true-false-answer').value);
            break;
            
        case 'free_text':
            const answersText = document.getElementById('free-text-answers').value;
            const answers = answersText.split('\n')
                .map(answer => answer.trim())
                .filter(answer => answer);
            
            if (answers.length === 0) {
                alert('Veuillez entrer au moins une réponse acceptée');
                return;
            }
            
            questionData.correct_answers = answers;
            questionData.threshold = parseFloat(document.getElementById('similarity-threshold').value);
            break;
    }
    
    // Déterminer l'ordre
    const maxOrder = questions.reduce((max, q) => Math.max(max, q.order || 0), 0);
    questionData.order = maxOrder + 1;
    
    try {
        const savedQuestion = await saveQuestion(questionData);
        
        if (savedQuestion) {
            // Réinitialiser le formulaire
            document.getElementById('question-text').value = '';
            document.querySelectorAll('.option-input').forEach(input => input.value = '');
            document.getElementById('free-text-answers').value = '';
            
            // Recharger les questions
            await loadQuestionsFromServer();
            
            alert('Question ajoutée avec succès !');
        } else {
            alert('Erreur lors de l\'ajout de la question');
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'ajout de la question:', error);
        alert('Erreur lors de l\'ajout de la question. Veuillez réessayer.');
    }
}

async function loadQuestionsFromServer() {
    try {
        const loadedQuestions = await loadQuestions();
        questions = loadedQuestions;
        updateQuestionsDisplay();
    } catch (error) {
        console.error('❌ Erreur lors du chargement des questions:', error);
    }
}

function updateQuestionsDisplay() {
    const container = document.getElementById('questions-container');
    container.innerHTML = '';
    
    if (questions.length === 0) {
        container.innerHTML = '<p>Aucune question créée</p>';
        return;
    }
    
    questions.forEach((question, index) => {
        const questionElement = document.createElement('div');
        questionElement.className = 'question-item';
        questionElement.innerHTML = `
            <div class="question-header">
                <span class="question-number">${index + 1}</span>
                <span class="question-type">${getQuestionTypeLabel(question.type)}</span>
                <button class="delete-btn" onclick="deleteQuestionHandler(${question.id})">🗑️</button>
            </div>
            <div class="question-content">
                <p><strong>${question.text}</strong></p>
                ${getQuestionPreview(question)}
            </div>
        `;
        container.appendChild(questionElement);
    });
}

function getQuestionTypeLabel(type) {
    switch (type) {
        case 'multiple_choice': return 'Choix multiple';
        case 'true_false': return 'Vrai/Faux';
        case 'free_text': return 'Texte libre';
        default: return 'Choix multiple';
    }
}

function getQuestionPreview(question) {
    switch (question.type) {
        case 'multiple_choice':
            return `
                <div class="options-preview">
                    ${question.options.map((option, index) => 
                        `<span class="option ${index === question.correct_answer ? 'correct' : ''}">${option}</span>`
                    ).join('')}
                </div>
            `;
        case 'true_false':
            return `
                <div class="options-preview">
                    <span class="option ${question.correct_answer === 0 ? 'correct' : ''}">Vrai</span>
                    <span class="option ${question.correct_answer === 1 ? 'correct' : ''}">Faux</span>
                </div>
            `;
        case 'free_text':
            return `
                <div class="free-text-preview">
                    <p><strong>Réponses acceptées:</strong> ${question.correct_answers.join(', ')}</p>
                    <p><strong>Seuil:</strong> ${Math.round(question.threshold * 100)}%</p>
                </div>
            `;
        default:
            return '';
    }
}

async function deleteQuestionHandler(questionId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette question ?')) {
        return;
    }
    
    try {
        const success = await deleteQuestion(questionId);
        
        if (success) {
            await loadQuestionsFromServer();
            alert('Question supprimée avec succès !');
        } else {
            alert('Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('❌ Erreur lors de la suppression:', error);
        alert('Erreur lors de la suppression. Veuillez réessayer.');
    }
}

// Gestion du jeu
function startGame() {
    if (questions.length === 0) {
        alert('Aucune question disponible. Veuillez d\'abord créer des questions.');
        return;
    }
    
    gameState = 'question';
    currentQuestionIndex = 0;
    
    // Réinitialiser les réponses et scores
    userAnswers.clear();
    participants.forEach((participant, email) => {
        participant.answered = false;
        scores.set(email, 0);
    });
    
    const currentQuestion = questions[currentQuestionIndex];
    
    broadcastMessage({
        type: 'game-started',
        question: currentQuestion,
        questionIndex: currentQuestionIndex
    });
    
    updateGameControls();
    updateResponsesDisplay();
    
    console.log('🚀 Jeu démarré avec', questions.length, 'questions');
}

function nextQuestion() {
    if (currentQuestionIndex >= questions.length - 1) {
        alert('Plus de questions disponibles');
        return;
    }
    
    currentQuestionIndex++;
    gameState = 'question';
    userAnswers.clear();
    
    // Réinitialiser les statuts des participants
    participants.forEach((participant, email) => {
        participant.answered = false;
    });
    
    const currentQuestion = questions[currentQuestionIndex];
    
    broadcastMessage({
        type: 'next-question',
        question: currentQuestion,
        questionIndex: currentQuestionIndex
    });
    
    updateGameControls();
    updateResponsesDisplay();
}

function blockAnswers() {
    gameState = 'blocked';
    
    broadcastMessage({
        type: 'answers-blocked'
    });
    
    updateGameControls();
    showBlockAnswersAnimation();
}

function showAnswer() {
    gameState = 'answer';
    
    const currentQuestion = questions[currentQuestionIndex];
    const currentScores = Array.from(scores.entries()).map(([email, score]) => ({ email, score }));
    
    broadcastMessage({
        type: 'show-answer',
        question: currentQuestion,
        scores: currentScores
    });
    
    updateGameControls();
}

function showLeaderboard() {
    gameState = 'finished';
    
    const finalScores = Array.from(scores.entries())
        .map(([email, score]) => ({ email, score }))
        .sort((a, b) => b.score - a.score);
    
    broadcastMessage({
        type: 'show-leaderboard',
        scores: finalScores
    });
    
    updateGameControls();
}

function resetGame() {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser le jeu ?')) {
        return;
    }
    
    gameState = 'waiting';
    currentQuestionIndex = 0;
    userAnswers.clear();
    scores.clear();
    
    // Réinitialiser les participants
    participants.forEach((participant, email) => {
        participant.answered = false;
        scores.set(email, 0);
    });
    
    broadcastMessage({
        type: 'game-reset'
    });
    
    updateGameControls();
    updateResponsesDisplay();
    
    console.log('🔄 Jeu réinitialisé');
}

// Interface utilisateur
function updateUI() {
    if (isAdmin) {
        document.getElementById('admin-email').textContent = currentUser;
        document.getElementById('session-indicator').textContent = `🗂️ Session onglet (${tabId})`;
    } else {
        document.getElementById('user-email').textContent = currentUser;
        document.getElementById('user-session-indicator').textContent = `🗂️ Session onglet (${tabId})`;
        updateUserScore();
    }
    
    updateParticipantsCount();
}

function updateParticipantsCount() {
    const count = participants.size;
    const countElement = document.getElementById('participants-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

function updateUserScore() {
    const userScore = scores.get(currentUser) || 0;
    const scoreElement = document.getElementById('user-score');
    if (scoreElement) {
        scoreElement.textContent = `Score: ${userScore}`;
    }
}

function updateGameControls() {
    const startBtn = document.getElementById('start-game-btn');
    const nextBtn = document.getElementById('next-question-btn');
    const blockBtn = document.getElementById('block-answers-btn');
    const showAnswerBtn = document.getElementById('show-answer-btn');
    const leaderboardBtn = document.getElementById('show-leaderboard-btn');
    
    // Réinitialiser tous les boutons
    startBtn.disabled = false;
    nextBtn.disabled = true;
    blockBtn.disabled = true;
    showAnswerBtn.disabled = true;
    leaderboardBtn.disabled = true;
    
    switch (gameState) {
        case 'waiting':
            startBtn.disabled = questions.length === 0;
            break;
        case 'question':
            startBtn.disabled = true;
            blockBtn.disabled = false;
            break;
        case 'blocked':
            startBtn.disabled = true;
            showAnswerBtn.disabled = false;
            break;
        case 'answer':
            startBtn.disabled = true;
            if (currentQuestionIndex < questions.length - 1) {
                nextBtn.disabled = false;
            } else {
                leaderboardBtn.disabled = false;
            }
            break;
        case 'finished':
            startBtn.disabled = false;
            break;
    }
    
    // Mettre à jour l'affichage de la question actuelle
    const currentQuestionDisplay = document.getElementById('current-question-display');
    if (gameState === 'waiting') {
        currentQuestionDisplay.innerHTML = '<p>Aucune question active</p>';
    } else if (questions[currentQuestionIndex]) {
        const question = questions[currentQuestionIndex];
        currentQuestionDisplay.innerHTML = `
            <h4>Question ${currentQuestionIndex + 1}/${questions.length}</h4>
            <p>${question.text}</p>
            <small>Type: ${getQuestionTypeLabel(question.type)}</small>
        `;
    }
}

function updateResponsesDisplay() {
    const container = document.getElementById('responses-container');
    container.innerHTML = '';
    
    if (participants.size === 0) {
        container.innerHTML = '<p>Aucun participant connecté</p>';
        return;
    }
    
    participants.forEach((participant, email) => {
        const responseElement = document.createElement('div');
        responseElement.className = 'response-item';
        
        const answer = userAnswers.get(email);
        const score = scores.get(email) || 0;
        
        responseElement.innerHTML = `
            <div class="participant-info">
                <span class="participant-email">${email}</span>
                <span class="participant-score">Score: ${score}</span>
            </div>
            <div class="participant-status">
                ${participant.answered ? 
                    `<span class="answered">✅ Répondu: ${formatAnswer(answer)}</span>` : 
                    '<span class="waiting">⏳ En attente...</span>'
                }
            </div>
        `;
        
        container.appendChild(responseElement);
    });
}

function formatAnswer(answer) {
    if (answer === undefined || answer === null) return 'N/A';
    if (typeof answer === 'number') return `Option ${answer + 1}`;
    return answer.toString();
}

// Gestion des réponses utilisateur
function handleUserAnswer(email, answer, questionId) {
    if (gameState !== 'question') return;
    
    const participant = participants.get(email);
    if (!participant) return;
    
    participant.answered = true;
    userAnswers.set(email, answer);
    
    // Valider la réponse
    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion && currentQuestion.id === questionId) {
        const isCorrect = validateAnswer(currentQuestion, answer);
        
        if (isCorrect) {
            const currentScore = scores.get(email) || 0;
            scores.set(email, currentScore + 1);
        }
        
        console.log(`📝 Réponse de ${email}: ${formatAnswer(answer)} - ${isCorrect ? '✅' : '❌'}`);
    }
    
    updateResponsesDisplay();
}

// Fonctions côté utilisateur
function showQuestion(question, questionIndex) {
    const waitingMessage = document.getElementById('waiting-message');
    const questionContainer = document.getElementById('question-container');
    const leaderboardContainer = document.getElementById('leaderboard-container');
    
    waitingMessage.style.display = 'none';
    questionContainer.style.display = 'block';
    leaderboardContainer.style.display = 'none';
    
    document.getElementById('question-number').textContent = `Question ${questionIndex + 1}`;
    document.getElementById('question-text-display').textContent = question.text;
    
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    
    switch (question.type) {
        case 'multiple_choice':
            question.options.forEach((option, index) => {
                const button = document.createElement('button');
                button.className = 'option-btn';
                button.textContent = option;
                button.onclick = () => submitAnswer(index, question.id);
                optionsContainer.appendChild(button);
            });
            break;
            
        case 'true_false':
            ['Vrai', 'Faux'].forEach((option, index) => {
                const button = document.createElement('button');
                button.className = 'option-btn';
                button.textContent = option;
                button.onclick = () => submitAnswer(index, question.id);
                optionsContainer.appendChild(button);
            });
            break;
            
        case 'free_text':
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Votre réponse...';
            input.className = 'free-text-input';
            
            const submitBtn = document.createElement('button');
            submitBtn.textContent = 'Valider';
            submitBtn.className = 'submit-btn';
            submitBtn.onclick = () => {
                if (input.value.trim()) {
                    submitAnswer(input.value.trim(), question.id);
                }
            };
            
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    submitAnswer(input.value.trim(), question.id);
                }
            });
            
            optionsContainer.appendChild(input);
            optionsContainer.appendChild(submitBtn);
            input.focus();
            break;
    }
    
    // Effacer le feedback précédent
    document.getElementById('answer-feedback').innerHTML = '';
}

function submitAnswer(answer, questionId) {
    if (gameState !== 'question') return;
    
    // Désactiver les boutons
    document.querySelectorAll('.option-btn, .submit-btn').forEach(btn => {
        btn.disabled = true;
    });
    
    // Envoyer la réponse
    broadcastMessage({
        type: 'user-answer',
        email: currentUser,
        answer: answer,
        questionId: questionId
    });
    
    // Afficher le feedback
    document.getElementById('answer-feedback').innerHTML = 
        '<p class="feedback-message">✅ Réponse envoyée !</p>';
    
    console.log('📤 Réponse envoyée:', answer);
}

function blockUserAnswers() {
    // Désactiver tous les boutons de réponse
    document.querySelectorAll('.option-btn, .submit-btn, .free-text-input').forEach(element => {
        element.disabled = true;
    });
    
    document.getElementById('answer-feedback').innerHTML = 
        '<p class="feedback-blocked">🚫 Réponses bloquées</p>';
}

function showCorrectAnswer(question, scores) {
    let correctAnswerText = '';
    
    switch (question.type) {
        case 'multiple_choice':
            correctAnswerText = question.options[question.correct_answer];
            break;
        case 'true_false':
            correctAnswerText = question.correct_answer === 0 ? 'Vrai' : 'Faux';
            break;
        case 'free_text':
            correctAnswerText = question.correct_answers.join(', ');
            break;
    }
    
    document.getElementById('answer-feedback').innerHTML = `
        <div class="correct-answer">
            <p><strong>Réponse correcte:</strong> ${correctAnswerText}</p>
        </div>
    `;
    
    // Mettre à jour le score
    updateUserScore();
}

function showFinalLeaderboard(scores) {
    const waitingMessage = document.getElementById('waiting-message');
    const questionContainer = document.getElementById('question-container');
    const leaderboardContainer = document.getElementById('leaderboard-container');
    
    waitingMessage.style.display = 'none';
    questionContainer.style.display = 'none';
    leaderboardContainer.style.display = 'block';
    
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';
    
    scores.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        
        let medal = '';
        if (index === 0) medal = '🥇';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';
        
        item.innerHTML = `
            <span class="rank">${medal} ${index + 1}</span>
            <span class="player">${player.email}</span>
            <span class="score">${player.score} points</span>
        `;
        
        leaderboardList.appendChild(item);
    });
}

function resetUserGame() {
    gameState = 'waiting';
    
    const waitingMessage = document.getElementById('waiting-message');
    const questionContainer = document.getElementById('question-container');
    const leaderboardContainer = document.getElementById('leaderboard-container');
    
    waitingMessage.style.display = 'block';
    questionContainer.style.display = 'none';
    leaderboardContainer.style.display = 'none';
    
    // Réinitialiser le score
    scores.set(currentUser, 0);
    updateUserScore();
}

// Animations
function showBlockAnswersAnimation() {
    const overlay = document.getElementById('block-answers-animation');
    if (!overlay) return;
    
    const playersGrid = document.getElementById('players-grid');
    playersGrid.innerHTML = '';
    
    participants.forEach((participant, email) => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        playerCard.innerHTML = `
            <div class="player-email">${email}</div>
            <div class="player-status ${participant.answered ? 'answered' : 'waiting'}">
                ${participant.answered ? '✅ Répondu' : '⏳ En attente'}
            </div>
        `;
        playersGrid.appendChild(playerCard);
    });
    
    overlay.style.display = 'flex';
    
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 3000);
}

// Fonctions utilitaires
function toggleSortMode() {
    // Implémentation du tri des questions (à compléter si nécessaire)
    alert('Fonctionnalité de tri en cours de développement');
}

function loadSavedData() {
    // Charger les données sauvegardées au démarrage
    if (isAdmin) {
        loadQuestionsFromServer();
    }
    
    // Initialiser l'affichage du seuil
    updateThresholdDisplay();
    
    // Initialiser l'affichage des options selon le type
    handleQuestionTypeChange();
}

// Gestion de la fermeture de l'onglet
window.addEventListener('beforeunload', function() {
    if (currentUser && !isAdmin) {
        broadcastMessage({
            type: 'participant-left',
            email: currentUser
        });
    }
});