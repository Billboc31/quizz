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
// Timer supprimé - géré par le présentateur

// Gestion de session
let tabId = null;

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

// Fonction utilitaire pour debug - accessible depuis la console
window.debugSession = function() {
    const session = sessionStorage.getItem('quizSession');
    if (session) {
        const data = JSON.parse(session);
        console.log('📊 Informations de session:', {
            tabId: data.tabId,
            utilisateur: data.currentUser,
            admin: data.isAdmin,
            etatJeu: data.gameState,
            questionActuelle: data.currentQuestionIndex + 1,
            participants: data.participants.length,
            age: Math.round((Date.now() - data.timestamp) / 1000) + 's'
        });
    } else {
        console.log('❌ Aucune session active dans cet onglet');
    }
};

function restoreUserGameState() {
    switch (gameState) {
        case 'question':
            if (questions[currentQuestionIndex]) {
                showQuestion(
                    questions[currentQuestionIndex], 
                    currentQuestionIndex + 1, 
                    questions.length
                );
            }
            break;
                 case 'blocked':
             if (questions[currentQuestionIndex]) {
                 showQuestion(
                     questions[currentQuestionIndex], 
                     currentQuestionIndex + 1, 
                     questions.length
                 );
                 disableAnswerButtons();
                 // Utiliser les données de session pour l'animation
                 showBlockAnimationForUser(
                     Array.from(participants.entries()),
                     Array.from(userAnswers.entries()),
                     questions[currentQuestionIndex]
                 );
             }
             break;
        case 'answer':
            if (questions[currentQuestionIndex]) {
                showQuestion(
                    questions[currentQuestionIndex], 
                    currentQuestionIndex + 1, 
                    questions.length
                );
                const currentQuestion = questions[currentQuestionIndex];
                showAnswerFeedback(currentQuestion.correctAnswer, currentQuestion.options[currentQuestion.correctAnswer]);
                updateUserScore(Array.from(scores.entries()));
            }
            break;
        case 'finished':
            displayLeaderboard(generateLeaderboard());
            break;
        default:
            // État waiting ou autre
            document.getElementById('waiting-message').style.display = 'block';
            document.getElementById('question-container').style.display = 'none';
            document.getElementById('leaderboard-container').style.display = 'none';
    }
}

// Gestion WebSocket réelle uniquement
let socket = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('🔗 Connexion WebSocket à:', wsUrl);
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log('✅ WebSocket connecté');
        reconnectAttempts = 0;
        socket.onmessage = handleWebSocketMessage;
        
        // Si on a une session active, notifier la reconnexion
        if (currentUser) {
            broadcastMessage({
                type: 'participant-reconnected',
                email: currentUser,
                isAdmin: isAdmin
            });
        }
    };
    
    socket.onclose = (event) => {
        console.log('❌ WebSocket fermé:', event.code, event.reason);
        
        // Tentative de reconnexion
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`🔄 Reconnexion ${reconnectAttempts}/${maxReconnectAttempts}...`);
            setTimeout(initializeWebSocket, 2000);
        } else {
            console.error('❌ Impossible de se reconnecter après', maxReconnectAttempts, 'tentatives');
        }
    };
    
    socket.onerror = (error) => {
        console.error('❌ Erreur WebSocket:', error);
    };
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    console.log('🚀 Initialisation de l\'application - Onglet:', generateTabId());
    
    // Vérifier s'il y a une session sauvegardée
    restoreSession();
    
    // Initialiser la connexion WebSocket
    initializeWebSocket();
    
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
    
    // Le gestionnaire de messages est maintenant configuré dans initializeWebSocket
    
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
    
    try {
        // Appel API pour la connexion
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                requestAdmin: adminMode
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            alert(`Erreur de connexion: ${data.error}`);
            return;
        }
        
        // Connexion réussie
        currentUser = email;
        sessionId = data.sessionId;
        isAdmin = data.isAdmin;
        
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
        broadcastMessage({
            type: 'participant-joined',
            email: email,
            isAdmin: isAdmin
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
        
        broadcastMessage({
            type: 'participant-left',
            email: currentUser
        });
    }
    
    // Appel API pour la déconnexion
    if (sessionId) {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: sessionId
                })
            });
        } catch (error) {
            console.error('❌ Erreur lors de la déconnexion:', error);
        }
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

// Gestion des types de questions
function handleQuestionTypeChange() {
    const questionType = document.getElementById('question-type').value;
    const multipleChoiceOptions = document.getElementById('multiple-choice-options');
    const correctAnswerSelect = document.getElementById('correct-answer');
    const trueFalseOptions = document.getElementById('true-false-options');
    const freeTextOptions = document.getElementById('free-text-options');
    
    // Masquer tous les conteneurs
    multipleChoiceOptions.style.display = 'none';
    correctAnswerSelect.style.display = 'none';
    trueFalseOptions.style.display = 'none';
    freeTextOptions.style.display = 'none';
    
    // Afficher le conteneur approprié
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

// Gestion des questions
async function addQuestion() {
    const questionText = document.getElementById('question-text').value;
    const questionType = document.getElementById('question-type').value;
    
    if (!questionText) {
        alert('Veuillez saisir une question');
        return;
    }
    
    let question = {
        text: questionText,
        type: questionType
    };
    
    // Validation et construction selon le type
    switch (questionType) {
        case 'multiple_choice':
            const options = Array.from(document.querySelectorAll('.option-input')).map(input => input.value);
            const correctAnswer = parseInt(document.getElementById('correct-answer').value);
            
            if (options.some(option => !option)) {
                alert('Veuillez remplir toutes les options');
                return;
            }
            
            question.options = options;
            question.correctAnswer = correctAnswer;
            break;
            
        case 'true_false':
            const trueFalseAnswer = parseInt(document.getElementById('true-false-answer').value);
            question.options = ['Vrai', 'Faux'];
            question.correctAnswer = trueFalseAnswer;
            break;
            
        case 'free_text':
            const freeTextAnswers = document.getElementById('free-text-answers').value;
            const threshold = parseFloat(document.getElementById('similarity-threshold').value);
            
            if (!freeTextAnswers.trim()) {
                alert('Veuillez saisir au moins une réponse acceptée');
                return;
            }
            
            question.correctAnswers = freeTextAnswers.split('\n').map(answer => answer.trim()).filter(answer => answer);
            question.threshold = threshold;
            break;
    }
    
    try {
        // Appel API pour ajouter la question
        const response = await fetch('/api/questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: sessionId,
                question: question
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            alert(`Erreur: ${data.error}`);
            return;
        }
        
        // Ajouter la question à la liste locale
        questions.push(data.question);
        updateQuestionsDisplay();
        clearQuestionForm();
        saveSession(); // Sauvegarder les questions
        
        console.log('✅ Question ajoutée:', data.question);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'ajout de la question:', error);
        alert('Erreur lors de l\'ajout de la question. Veuillez réessayer.');
    }
}

function clearQuestionForm() {
    document.getElementById('question-text').value = '';
    document.querySelectorAll('.option-input').forEach(input => input.value = '');
    document.getElementById('correct-answer').value = '0';
    document.getElementById('true-false-answer').value = '0';
    document.getElementById('free-text-answers').value = '';
    document.getElementById('similarity-threshold').value = '0.8';
    document.getElementById('threshold-value').textContent = '80%';
    document.getElementById('question-type').value = 'multiple_choice';
    handleQuestionTypeChange();
}

function updateQuestionsDisplay() {
    const container = document.getElementById('questions-container');
    container.innerHTML = '';
    
    // Trier les questions par ordre
    const sortedQuestions = [...questions].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    sortedQuestions.forEach((question, index) => {
        const questionElement = document.createElement('div');
        questionElement.className = 'question-item';
        questionElement.dataset.questionId = question.id;
        
        // Badge de type
        const typeText = getQuestionTypeText(question.type);
        const typeBadge = `<span class="question-type-badge ${question.type}">${typeText}</span>`;
        
        // Contenu selon le type
        let optionsHtml = '';
        if (question.type === 'multiple_choice' || question.type === 'true_false') {
            optionsHtml = `
                <div class="question-options">
                    ${question.options.map((option, i) => `
                        <div class="option ${i === question.correctAnswer ? 'correct' : ''}">${option}</div>
                    `).join('')}
                </div>
            `;
        } else if (question.type === 'free_text') {
            optionsHtml = `
                <div class="question-options">
                    <div class="free-text-answers">
                        <strong>Réponses acceptées :</strong>
                        ${question.correctAnswers.map(answer => `<span class="correct-answer">${answer}</span>`).join(', ')}
                    </div>
                    <div class="threshold-info">
                        <strong>Seuil de similarité :</strong> ${Math.round((question.threshold || 0.8) * 100)}%
                    </div>
                </div>
            `;
        }
        
        questionElement.innerHTML = `
            <div class="drag-handle">📋 Glisser pour réorganiser</div>
            ${typeBadge}
            <h4>Question ${question.order || index + 1}: ${question.text}</h4>
            ${optionsHtml}
            <button class="delete-question" onclick="deleteQuestion(${question.id})">Supprimer</button>
        `;
        container.appendChild(questionElement);
    });
}

function getQuestionTypeText(type) {
    switch (type) {
        case 'multiple_choice': return 'Choix multiple';
        case 'true_false': return 'Vrai/Faux';
        case 'free_text': return 'Texte libre';
        default: return 'Inconnu';
    }
}

async function deleteQuestion(questionId) {
    try {
        // Appel API pour supprimer la question
        const response = await fetch(`/api/questions/${questionId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: sessionId
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            alert(`Erreur: ${data.error}`);
            return;
        }
        
        // Supprimer de la liste locale
        questions = questions.filter(q => q.id !== questionId);
        updateQuestionsDisplay();
        saveSession(); // Sauvegarder les questions
        
        console.log('✅ Question supprimée:', questionId);
        
    } catch (error) {
        console.error('❌ Erreur lors de la suppression de la question:', error);
        alert('Erreur lors de la suppression de la question. Veuillez réessayer.');
    }
}

// Gestion de l'ordonnancement des questions
let sortMode = false;

function toggleSortMode() {
    const container = document.getElementById('questions-container');
    const sortBtn = document.getElementById('sort-questions-btn');
    
    sortMode = !sortMode;
    
    if (sortMode) {
        container.classList.add('sortable');
        sortBtn.textContent = '✅ Terminer';
        sortBtn.style.background = 'var(--success-color)';
        
        // Activer le drag and drop
        enableDragAndDrop();
        
        // Ajouter les classes sortable aux questions
        document.querySelectorAll('.question-item').forEach(item => {
            item.classList.add('sortable');
        });
        
    } else {
        container.classList.remove('sortable');
        sortBtn.textContent = '📋 Réorganiser';
        sortBtn.style.background = 'var(--warning-color)';
        
        // Désactiver le drag and drop
        disableDragAndDrop();
        
        // Retirer les classes sortable
        document.querySelectorAll('.question-item').forEach(item => {
            item.classList.remove('sortable');
        });
        
        // Sauvegarder le nouvel ordre
        saveQuestionsOrder();
    }
}

function enableDragAndDrop() {
    const container = document.getElementById('questions-container');
    
    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    container.addEventListener('dragend', handleDragEnd);
    
    // Rendre les éléments draggables
    document.querySelectorAll('.question-item').forEach(item => {
        item.draggable = true;
    });
}

function disableDragAndDrop() {
    const container = document.getElementById('questions-container');
    
    container.removeEventListener('dragstart', handleDragStart);
    container.removeEventListener('dragover', handleDragOver);
    container.removeEventListener('drop', handleDrop);
    container.removeEventListener('dragend', handleDragEnd);
    
    // Retirer draggable
    document.querySelectorAll('.question-item').forEach(item => {
        item.draggable = false;
    });
}

let draggedElement = null;

function handleDragStart(e) {
    if (e.target.classList.contains('question-item')) {
        draggedElement = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const afterElement = getDragAfterElement(e.clientY);
    const container = document.getElementById('questions-container');
    
    if (afterElement == null) {
        container.appendChild(draggedElement);
    } else {
        container.insertBefore(draggedElement, afterElement);
    }
}

function handleDrop(e) {
    e.preventDefault();
}

function handleDragEnd(e) {
    if (e.target.classList.contains('question-item')) {
        e.target.classList.remove('dragging');
    }
    draggedElement = null;
}

function getDragAfterElement(y) {
    const container = document.getElementById('questions-container');
    const draggableElements = [...container.querySelectorAll('.question-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveQuestionsOrder() {
    const container = document.getElementById('questions-container');
    const questionItems = container.querySelectorAll('.question-item');
    
    const questionOrders = [];
    questionItems.forEach((item, index) => {
        const questionId = parseInt(item.dataset.questionId);
        questionOrders.push({
            id: questionId,
            order: index + 1
        });
    });
    
    try {
        const response = await fetch('/api/questions/reorder', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: sessionId,
                questionOrders: questionOrders
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            alert(`Erreur: ${data.error}`);
            return;
        }
        
        // Mettre à jour l'ordre local
        questionOrders.forEach(({ id, order }) => {
            const question = questions.find(q => q.id === id);
            if (question) {
                question.order = order;
            }
        });
        
        // Rafraîchir l'affichage
        updateQuestionsDisplay();
        saveSession();
        
        console.log('✅ Ordre des questions sauvegardé');
        
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde de l\'ordre:', error);
        alert('Erreur lors de la sauvegarde de l\'ordre des questions.');
    }
}

// Gestion du jeu
function startGame() {
    if (questions.length === 0) {
        alert('Veuillez ajouter au moins une question avant de commencer');
        return;
    }
    
    gameState = 'question';
    currentQuestionIndex = 0;
    userAnswers.clear();
    
    // Reset des scores
    participants.forEach((participant, email) => {
        scores.set(email, 0);
        participant.score = 0;
    });
    
    broadcastMessage({
        type: 'game-started',
        email: currentUser,
        question: questions[currentQuestionIndex],
        questionNumber: currentQuestionIndex + 1,
        totalQuestions: questions.length
    });
    
    updateGameControls();
    updateResponsesDisplay(); // Afficher l'état initial
    saveSession(); // Sauvegarder l'état
}

function nextQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        gameState = 'question';
        userAnswers.clear();
        
        broadcastMessage({
            type: 'next-question',
            email: currentUser,
            question: questions[currentQuestionIndex],
            questionNumber: currentQuestionIndex + 1,
            totalQuestions: questions.length
        });
        
        updateGameControls();
        updateResponsesDisplay(); // Afficher l'état initial
        saveSession(); // Sauvegarder l'état
    } else {
        // Fin du jeu
        gameState = 'finished';
        broadcastMessage({
            type: 'game-finished',
            email: currentUser,
            leaderboard: generateLeaderboard()
        });
        updateGameControls();
        saveSession(); // Sauvegarder l'état
    }
}

function blockAnswers() {
    gameState = 'blocked';
    
    // L'animation ne s'affiche que côté utilisateur via WebSocket
    broadcastMessage({
        type: 'answers-blocked',
        email: currentUser,
        participants: Array.from(participants.entries()),
        userAnswers: Array.from(userAnswers.entries()),
        currentQuestion: questions[currentQuestionIndex]
    });
    
    updateGameControls();
    updateResponsesDisplay(); // Afficher les réponses détaillées pour l'admin
    saveSession(); // Sauvegarder l'état
}

async function showAnswer() {
    const currentQuestion = questions[currentQuestionIndex];
    gameState = 'answer';
    
    // Calculer les scores selon le type de question
    const scoreUpdates = new Map();
    
    for (const [email, answer] of userAnswers.entries()) {
        let isCorrect = false;
        
        if (currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'true_false' || !currentQuestion.type) {
            isCorrect = answer === currentQuestion.correctAnswer;
        } else if (currentQuestion.type === 'free_text') {
            // Valider via l'API serveur
            try {
                const response = await fetch('/api/validate-answer', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        questionId: currentQuestion.id,
                        userAnswer: answer
                    })
                });
                
                const data = await response.json();
                isCorrect = data.isCorrect;
            } catch (error) {
                console.error('❌ Erreur validation réponse:', error);
                isCorrect = false;
            }
        }
        
        if (isCorrect) {
            const currentScore = scores.get(email) || 0;
            const newScore = currentScore + 1;
            scores.set(email, newScore);
            scoreUpdates.set(email, newScore);
            
            // Mettre à jour le participant
            if (participants.has(email)) {
                participants.get(email).score = newScore;
            }
        }
    }
    
    // Préparer les données pour le broadcast
    let correctAnswer = currentQuestion.correctAnswer;
    let correctText = '';
    
    if (currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'true_false' || !currentQuestion.type) {
        correctText = currentQuestion.options[currentQuestion.correctAnswer];
    } else if (currentQuestion.type === 'free_text') {
        correctText = currentQuestion.correctAnswers.join(' ou ');
    }
    
    broadcastMessage({
        type: 'answer-revealed',
        email: currentUser,
        correctAnswer: correctAnswer,
        correctText: correctText,
        userAnswers: Array.from(userAnswers.entries()),
        scores: Array.from(scores.entries()),
        questionType: currentQuestion.type
    });
    
    updateGameControls();
    updateResponsesDisplay();
    saveSession(); // Sauvegarder l'état
}

function showLeaderboard() {
    const leaderboard = generateLeaderboard();
    
    broadcastMessage({
        type: 'show-leaderboard',
        email: currentUser,
        leaderboard: leaderboard
    });
}

function resetGame() {
    if (confirm('Êtes-vous sûr de vouloir remettre à zéro le jeu ? Tous les scores seront perdus.')) {
        // Réinitialiser l'état du jeu
        gameState = 'waiting';
        currentQuestionIndex = 0;
        
        // Réinitialiser les scores des participants
        participants.forEach((participant, email) => {
            participant.score = 0;
            participant.answers = [];
        });
        
        // Diffuser le message de reset
        broadcastMessage({
            type: 'game-reset',
            email: currentUser
        });
        
        // Mettre à jour l'interface admin
        updateGameControls();
        updateResponsesDisplay();
        saveSession(); // Sauvegarder l'état
        
        // Afficher un message de confirmation
        alert('Le jeu a été remis à zéro avec succès !');
    }
}

function generateLeaderboard() {
    const leaderboard = Array.from(participants.entries())
        .map(([email, data]) => ({
            email: email,
            score: data.score
        }))
        .sort((a, b) => b.score - a.score);
    
    return leaderboard;
}

// Timer supprimé - géré par le présentateur

// Gestion des réponses utilisateur
function selectAnswer(optionIndex) {
    console.log('🎯 Sélection réponse:', optionIndex);
    
    userAnswers.set(currentUser, optionIndex);
    
    // Mettre à jour l'affichage
    document.querySelectorAll('.option-btn').forEach((btn, index) => {
        btn.classList.remove('selected');
        if (index === optionIndex) {
            btn.classList.add('selected');
        }
    });
    
    // Notifier l'admin
    broadcastMessage({
        type: 'answer-submitted',
        email: currentUser,
        answer: optionIndex
    });
    
    // Sauvegarder la session
    saveSession();
}

function submitFreeTextAnswer() {
    const input = document.getElementById('free-text-answer');
    const submitBtn = document.querySelector('.free-text-submit');
    
    if (!input || !input.value.trim()) {
        alert('Veuillez saisir une réponse');
        return;
    }
    
    const answer = input.value.trim();
    
    // Désactiver l'input et le bouton
    input.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Réponse envoyée ✅';
    
    // Stocker la réponse
    userAnswers.set(currentUser, answer);
    
    // Notifier l'admin
    broadcastMessage({
        type: 'answer-submitted',
        email: currentUser,
        answer: answer
    });
    
    // Sauvegarder la session
    saveSession();
    
    console.log('🎯 Réponse texte libre envoyée:', answer);
}

// Communication WebSocket
function broadcastMessage(message) {
    console.log('📤 Envoi:', message.type);
    
    if (!socket) {
        console.error('❌ Socket non initialisé');
        return;
    }
    
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        console.log('✅ Message envoyé');
    } else {
        console.warn('⚠️ WebSocket non ouvert, état:', socket.readyState);
    }
}

function handleWebSocketMessage(event) {
    try {
        // S'assurer que les données sont bien une string
        const messageData = typeof event.data === 'string' ? event.data : event.data.toString();
        const message = JSON.parse(messageData);
        console.log('📨 Reçu:', message.type);
        
        // Ignorer ses propres messages
        if (message.email === currentUser) {
            return;
        }
    
    switch (message.type) {
        case 'participant-joined':
            if (isAdmin) {
                participants.set(message.email, { 
                    email: message.email, 
                    score: 0, 
                    connected: true 
                });
                updateParticipantsCount();
                saveSession(); // Sauvegarder quand un participant rejoint
            }
            break;
            
        case 'participant-left':
            if (isAdmin) {
                participants.delete(message.email);
                updateParticipantsCount();
                saveSession(); // Sauvegarder quand un participant part
            }
            break;
            
        case 'game-started':
            if (!isAdmin) {
                console.log('🎮 Affichage question');
                showQuestion(message.question, message.questionNumber, message.totalQuestions);
            }
            break;
            
        case 'next-question':
            if (!isAdmin) {
                hideBlockAnswersAnimation(); // Fermer l'animation de blocage
                showQuestion(message.question, message.questionNumber, message.totalQuestions);
            }
            break;
            
        case 'answers-blocked':
            if (!isAdmin) {
                disableAnswerButtons();
                showBlockAnimationForUser(message.participants, message.userAnswers, message.currentQuestion);
            }
            break;
            
        case 'answer-revealed':
            if (!isAdmin) {
                hideBlockAnswersAnimation(); // Fermer l'animation de blocage
                showAnswerFeedback(message.correctAnswer, message.correctText, message.questionType);
                updateUserScore(message.scores);
            }
            break;
            
        case 'answer-submitted':
            if (isAdmin) {
                // Enregistrer la réponse de l'utilisateur
                userAnswers.set(message.email, message.answer);
                updateResponsesDisplay(); // Mise à jour en temps réel
                saveSession(); // Sauvegarder les réponses
            }
            break;
            
        case 'show-leaderboard':
            if (!isAdmin) {
                hideBlockAnswersAnimation(); // Fermer l'animation de blocage
                displayLeaderboard(message.leaderboard);
            }
            break;
            
        case 'game-finished':
            if (!isAdmin) {
                hideBlockAnswersAnimation(); // Fermer l'animation de blocage
                displayLeaderboard(message.leaderboard);
            }
            break;
            
        case 'game-reset':
            if (!isAdmin) {
                // Réinitialiser l'interface utilisateur
                document.getElementById('waiting-message').style.display = 'block';
                document.getElementById('question-container').style.display = 'none';
                document.getElementById('leaderboard-container').style.display = 'none';
                
                // Réinitialiser le score affiché
                document.getElementById('user-score').textContent = 'Score: 0';
                
                // Réinitialiser les variables utilisateur
                userScore = 0;
                selectedAnswer = null;
                
                // Afficher un message de notification
                const waitingMessage = document.getElementById('waiting-message');
                waitingMessage.innerHTML = '<h3>🔄 Le jeu a été remis à zéro</h3><p>En attente du prochain quiz...</p>';
            }
            break;
    }
    
    } catch (error) {
        console.error('❌ Erreur parsing message WebSocket:', error);
        console.error('❌ Données reçues:', event.data);
    }
}

// Interface utilisateur
function showQuestion(question, questionNumber, totalQuestions) {
    document.getElementById('waiting-message').style.display = 'none';
    document.getElementById('question-container').style.display = 'block';
    document.getElementById('leaderboard-container').style.display = 'none';
    
    document.getElementById('question-number').textContent = `Question ${questionNumber}/${totalQuestions}`;
    document.getElementById('question-text-display').textContent = question.text;
    
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    
    // Affichage selon le type de question
    switch (question.type) {
        case 'multiple_choice':
        case 'true_false':
            question.options.forEach((option, index) => {
                const button = document.createElement('button');
                button.className = 'option-btn';
                button.textContent = option;
                button.onclick = () => selectAnswer(index);
                optionsContainer.appendChild(button);
            });
            break;
            
        case 'free_text':
            const inputContainer = document.createElement('div');
            inputContainer.className = 'free-text-container';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'free-text-input';
            input.placeholder = 'Tapez votre réponse...';
            input.id = 'free-text-answer';
            
            const submitBtn = document.createElement('button');
            submitBtn.className = 'free-text-submit';
            submitBtn.textContent = 'Valider ma réponse';
            submitBtn.onclick = () => submitFreeTextAnswer();
            
            // Permettre la validation avec Entrée
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    submitFreeTextAnswer();
                }
            });
            
            inputContainer.appendChild(input);
            inputContainer.appendChild(submitBtn);
            optionsContainer.appendChild(inputContainer);
            
            // Focus sur l'input
            setTimeout(() => input.focus(), 100);
            break;
            
        default:
            // Questions sans type ou anciennes questions (traiter comme choix multiple)
            if (question.options && question.options.length > 0) {
                question.options.forEach((option, index) => {
                    const button = document.createElement('button');
                    button.className = 'option-btn';
                    button.textContent = option;
                    button.onclick = () => selectAnswer(index);
                    optionsContainer.appendChild(button);
                });
            }
            break;
    }
    
    document.getElementById('answer-feedback').innerHTML = '';
    document.getElementById('answer-feedback').className = 'feedback';
}

function disableAnswerButtons() {
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
    });
    
    // Désactiver aussi les champs de texte libre
    const freeTextInput = document.getElementById('free-text-answer');
    const freeTextSubmit = document.querySelector('.free-text-submit');
    
    if (freeTextInput) {
        freeTextInput.disabled = true;
    }
    if (freeTextSubmit) {
        freeTextSubmit.disabled = true;
    }
}

function showAnswerFeedback(correctAnswer, correctText, questionType) {
    const userAnswer = userAnswers.get(currentUser);
    const feedback = document.getElementById('answer-feedback');
    
    let isCorrect = false;
    
    // Déterminer si la réponse est correcte selon le type
    if (questionType === 'multiple_choice' || questionType === 'true_false' || !questionType) {
        isCorrect = userAnswer === correctAnswer;
        
        // Mettre à jour les boutons avec animations
        document.querySelectorAll('.option-btn').forEach((btn, index) => {
            btn.disabled = true;
            
            // Supprimer les anciennes classes d'animation
            btn.classList.remove('correct-answer', 'incorrect-answer', 'correct-reveal');
            
            if (index === correctAnswer) {
                btn.classList.add('correct');
                btn.classList.add('correct-reveal');
            } else if (index === userAnswer && userAnswer !== correctAnswer) {
                btn.classList.add('incorrect');
                btn.classList.add('incorrect-answer');
            }
        });
        
        // Animation spéciale pour la réponse de l'utilisateur s'il a eu juste
        if (isCorrect) {
            const userBtn = document.querySelectorAll('.option-btn')[userAnswer];
            if (userBtn) {
                userBtn.classList.add('correct-answer');
            }
        }
        
    } else if (questionType === 'free_text') {
        // Pour le texte libre, on doit valider via l'API
        validateFreeTextAnswer(userAnswer, correctText);
        return; // La fonction validateFreeTextAnswer gère l'affichage
    }
    
    // Afficher le feedback avec animation
    if (isCorrect) {
        feedback.innerHTML = `🎉 Correct ! La bonne réponse était : ${correctText}`;
        feedback.className = 'feedback correct';
        
        // Déclencher l'animation plein écran de succès
        showFullscreenAnimation(true, correctText);
    } else {
        feedback.innerHTML = `❌ Incorrect. La bonne réponse était : ${correctText}`;
        feedback.className = 'feedback incorrect';
        
        // Déclencher l'animation plein écran d'échec
        showFullscreenAnimation(false, correctText);
    }
}

async function validateFreeTextAnswer(userAnswer, correctText) {
    const currentQuestion = questions[currentQuestionIndex];
    const feedback = document.getElementById('answer-feedback');
    
    try {
        const response = await fetch('/api/validate-answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                questionId: currentQuestion.id,
                userAnswer: userAnswer
            })
        });
        
        const data = await response.json();
        const isCorrect = data.isCorrect;
        
        // Mettre à jour l'affichage du champ texte
        const freeTextInput = document.getElementById('free-text-answer');
        if (freeTextInput) {
            freeTextInput.classList.add(isCorrect ? 'correct' : 'incorrect');
        }
        
        // Afficher le feedback
        if (isCorrect) {
            feedback.innerHTML = `🎉 Correct ! Votre réponse "${userAnswer}" est acceptée.`;
            feedback.className = 'feedback correct';
            showFullscreenAnimation(true, userAnswer);
        } else {
            feedback.innerHTML = `❌ Incorrect. Réponses acceptées : ${correctText}`;
            feedback.className = 'feedback incorrect';
            showFullscreenAnimation(false, correctText);
        }
        
    } catch (error) {
        console.error('❌ Erreur validation réponse:', error);
        feedback.innerHTML = `⚠️ Erreur de validation. Réponses acceptées : ${correctText}`;
        feedback.className = 'feedback incorrect';
        showFullscreenAnimation(false, correctText);
    }
}

function updateUserScore(newScores) {
    const userScore = newScores.find(([email]) => email === currentUser);
    if (userScore) {
        document.getElementById('user-score').textContent = `Score: ${userScore[1]}`;
    }
}

// Animations plein écran spectaculaires
function showFullscreenAnimation(isSuccess, correctText) {
    const overlay = document.getElementById('fullscreen-animation');
    const icon = overlay.querySelector('.animation-icon');
    const text = overlay.querySelector('.animation-text');
    const confettiContainer = overlay.querySelector('.confetti-container');
    
    // Nettoyer les anciens confettis
    confettiContainer.innerHTML = '';
    
    // Configurer l'animation selon le résultat
    if (isSuccess) {
        icon.innerHTML = '🎉';
        icon.className = 'animation-icon success';
        text.innerHTML = 'BRAVO !<br>Bonne réponse !';
        text.className = 'animation-text success';
        
        // Créer les confettis
        createConfetti(confettiContainer);
        
        // Effet sonore visuel (vibration de l'écran)
        document.body.style.animation = 'none';
        setTimeout(() => {
            document.body.style.animation = 'celebration 0.5s ease-in-out';
        }, 10);
    } else {
        icon.innerHTML = '💥';
        icon.className = 'animation-icon error';
        text.innerHTML = 'DOMMAGE !<br>Réponse incorrecte';
        text.className = 'animation-text error';
        
        // Effet de secousse de l'écran
        document.body.classList.add('shake-screen');
        setTimeout(() => {
            document.body.classList.remove('shake-screen');
        }, 600);
        
        // Créer des particules d'échec
        createFailParticles(confettiContainer);
    }
    
    // Afficher l'overlay
    overlay.style.display = 'flex';
    
    // Masquer automatiquement après 3 secondes
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.opacity = '1';
            confettiContainer.innerHTML = '';
        }, 300);
    }, 3000);
}

function createConfetti(container) {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe', '#fd79a8', '#00b894'];
    const confettiCount = 100;
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.animationDelay = Math.random() * 3 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        
        // Formes variées
        const shapes = ['square', 'circle', 'triangle'];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        
        if (shape === 'circle') {
            confetti.style.borderRadius = '50%';
        } else if (shape === 'triangle') {
            confetti.style.width = '0';
            confetti.style.height = '0';
            confetti.style.borderLeft = '5px solid transparent';
            confetti.style.borderRight = '5px solid transparent';
            confetti.style.borderBottom = '10px solid ' + confetti.style.backgroundColor;
            confetti.style.backgroundColor = 'transparent';
        }
        
        container.appendChild(confetti);
    }
}

function createFailParticles(container) {
    const particleCount = 30;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'confetti';
        particle.style.backgroundColor = '#ff4757';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 2 + 's';
        particle.style.animationDuration = (Math.random() * 1.5 + 1.5) + 's';
        particle.style.opacity = '0.7';
        
        container.appendChild(particle);
    }
}

function displayLeaderboard(leaderboard) {
    document.getElementById('waiting-message').style.display = 'none';
    document.getElementById('question-container').style.display = 'none';
    document.getElementById('leaderboard-container').style.display = 'block';
    
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';
    
    leaderboard.forEach((participant, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <span class="leaderboard-rank">#${index + 1}</span>
            <span>${participant.email}</span>
            <span class="leaderboard-score">${participant.score} points</span>
        `;
        leaderboardList.appendChild(item);
    });
}

// Interface admin
function updateUI() {
    if (isAdmin) {
        document.getElementById('admin-email').textContent = currentUser;
        updateParticipantsCount();
        updateQuestionsDisplay();
        updateGameControls();
    } else {
        document.getElementById('user-email').textContent = currentUser;
        document.getElementById('user-score').textContent = 'Score: 0';
    }
}

function updateCurrentQuestionDisplay(question, questionNumber, totalQuestions) {
    const currentQuestionDisplay = document.getElementById('current-question-display');
    if (currentQuestionDisplay) {
        currentQuestionDisplay.innerHTML = `
            <h4>Question ${questionNumber}/${totalQuestions}</h4>
            <p><strong>${question.text}</strong></p>
            <div style="margin-top: 10px;">
                ${question.options.map((option, index) => `
                    <div style="padding: 5px; margin: 2px 0; background: ${index === question.correctAnswer ? '#dcfce7' : '#f8fafc'}; border-radius: 4px;">
                        ${String.fromCharCode(65 + index)}. ${option} ${index === question.correctAnswer ? '✅' : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
}

function updateParticipantsCount() {
    const count = participants.size;
    document.getElementById('participants-count').textContent = count;
}

function updateGameControls() {
    const startBtn = document.getElementById('start-game-btn');
    const nextBtn = document.getElementById('next-question-btn');
    const blockBtn = document.getElementById('block-answers-btn');
    const showBtn = document.getElementById('show-answer-btn');
    const leaderboardBtn = document.getElementById('show-leaderboard-btn');
    
    // Reset tous les boutons
    [startBtn, nextBtn, blockBtn, showBtn, leaderboardBtn].forEach(btn => {
        btn.disabled = true;
    });
    
    switch (gameState) {
        case 'waiting':
            startBtn.disabled = false;
            break;
        case 'question':
            blockBtn.disabled = false;
            break;
        case 'blocked':
            showBtn.disabled = false;
            break;
        case 'answer':
            if (currentQuestionIndex < questions.length - 1) {
                nextBtn.disabled = false;
            } else {
                leaderboardBtn.disabled = false;
            }
            break;
        case 'finished':
            leaderboardBtn.disabled = false;
            break;
    }
    
    // Mettre à jour l'affichage de la question courante
    const currentQuestionDisplay = document.getElementById('current-question-display');
    if (gameState === 'waiting') {
        currentQuestionDisplay.innerHTML = '<p>Aucune question active</p>';
    } else if (questions[currentQuestionIndex]) {
        const question = questions[currentQuestionIndex];
        currentQuestionDisplay.innerHTML = `
            <h4>Question ${currentQuestionIndex + 1}/${questions.length}</h4>
            <p>${question.text}</p>
        `;
    }
}

function updateResponsesDisplay() {
    const container = document.getElementById('responses-container');
    container.innerHTML = '';
    
    if (gameState === 'question' || gameState === 'blocked' || gameState === 'answer') {
        const currentQuestion = questions[currentQuestionIndex];
        
        // Afficher un résumé en temps réel
        const summary = document.createElement('div');
        summary.className = 'responses-summary';
        const totalParticipants = participants.size;
        const totalAnswers = userAnswers.size;
        const correctAnswers = Array.from(userAnswers.entries()).filter(([email, answer]) => 
            answer === currentQuestion.correctAnswer
        ).length;
        
        // Titre différent selon l'état
        const titleText = gameState === 'question' ? 'Réponses en temps réel' : 'Résumé final';
        
        summary.innerHTML = `
            <h4 style="margin-bottom: 15px; color: var(--primary-color);">${titleText}</h4>
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-number">${totalAnswers}</span>
                    <span class="stat-label">Réponses reçues</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${correctAnswers}</span>
                    <span class="stat-label">Bonnes réponses</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${totalParticipants - totalAnswers}</span>
                    <span class="stat-label">En attente</span>
                </div>
            </div>
        `;
        
        container.appendChild(summary);
        
        // Afficher les réponses détaillées seulement si bloqué ou révélé
        if (gameState === 'blocked' || gameState === 'answer') {
            // Afficher les réponses de tous les participants
            participants.forEach((participant, email) => {
                const item = document.createElement('div');
                
                if (userAnswers.has(email)) {
                    const answer = userAnswers.get(email);
                    const isCorrect = answer === currentQuestion.correctAnswer;
                    item.className = `response-item ${isCorrect ? 'correct' : 'incorrect'}`;
                    item.innerHTML = `
                        <span><strong>${email}</strong></span>
                        <span>${currentQuestion.options[answer]} ${isCorrect ? '✅' : '❌'}</span>
                    `;
                } else {
                    // Participant qui n'a pas répondu
                    item.className = 'response-item no-answer';
                    item.innerHTML = `
                        <span><strong>${email}</strong></span>
                        <span>Pas de réponse ⏳</span>
                    `;
                }
                
                container.appendChild(item);
            });
        } else if (gameState === 'question') {
                    // Pendant la question, afficher qui a répondu avec leur réponse
        participants.forEach((participant, email) => {
            const item = document.createElement('div');
            
            if (userAnswers.has(email)) {
                const answer = userAnswers.get(email);
                let isCorrect = false;
                let displayAnswer = '';
                
                if (currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'true_false' || !currentQuestion.type) {
                    isCorrect = answer === currentQuestion.correctAnswer;
                    displayAnswer = currentQuestion.options[answer];
                } else if (currentQuestion.type === 'free_text') {
                    // Pour le texte libre, on ne peut pas vérifier facilement ici
                    // On affiche juste la réponse
                    displayAnswer = answer;
                    isCorrect = false; // On ne sait pas encore
                }
                
                item.className = `response-item ${isCorrect ? 'correct' : 'incorrect'}`;
                item.innerHTML = `
                    <span><strong>${email}</strong></span>
                    <span>${displayAnswer} ${isCorrect ? '✅' : (currentQuestion.type === 'free_text' ? '📝' : '❌')}</span>
                `;
            } else {
                item.className = 'response-item no-answer';
                item.innerHTML = `
                    <span><strong>${email}</strong></span>
                    <span>⏳ En attente...</span>
                `;
            }
            
            container.appendChild(item);
        });
        }
    }
}

// Chargement des données depuis le serveur
async function loadQuestionsFromServer() {
    try {
        const response = await fetch('/api/questions');
        const data = await response.json();
        
        if (response.ok) {
            questions = data.questions || [];
            updateQuestionsDisplay();
            console.log('✅ Questions chargées depuis le serveur:', questions.length);
        } else {
            console.error('❌ Erreur lors du chargement des questions:', data.error);
        }
    } catch (error) {
        console.error('❌ Erreur lors du chargement des questions:', error);
        // Fallback vers localStorage si le serveur n'est pas disponible
        loadSavedData();
    }
}

// Sauvegarde des données (fallback local)
function saveData() {
    const data = {
        questions: questions
    };
    localStorage.setItem('quizData', JSON.stringify(data));
}

function loadSavedData() {
    const saved = localStorage.getItem('quizData');
    if (saved) {
        const data = JSON.parse(saved);
        questions = data.questions || [];
        updateQuestionsDisplay();
    }
}



// Vérification des droits administrateur
async function checkAdminAccess() {
    const email = document.getElementById('email').value;
    const adminToggle = document.querySelector('.admin-toggle');
    const adminCheckbox = document.getElementById('admin-mode');
    
    if (!email) {
        adminToggle.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch('/api/check-admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
        });
        
        const data = await response.json();
        
        if (data.isAdmin) {
            adminToggle.style.display = 'block';
            adminToggle.style.opacity = '1';
        } else {
            adminToggle.style.display = 'none';
            adminCheckbox.checked = false;
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la vérification admin:', error);
        adminToggle.style.display = 'none';
        adminCheckbox.checked = false;
    }
}

// Animation de blocage des réponses (supprimée - plus utilisée côté admin)

function hideBlockAnswersAnimation() {
    // Vérifier qu'on est bien côté utilisateur
    if (isAdmin) {
        return; // Ne pas manipuler l'animation côté admin
    }
    
    const overlay = document.getElementById('block-answers-animation');
    if (overlay && overlay.style.display === 'flex') {
        overlay.style.opacity = '0';
        
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.opacity = '1';
        }, 300);
    }
}

// Fonction pour afficher l'animation côté utilisateur avec révélation progressive des vraies réponses
function showBlockAnimationForUser(participantsData, userAnswersData, currentQuestion) {
    // Vérifier qu'on est bien côté utilisateur
    if (isAdmin) {
        return; // Ne pas afficher l'animation côté admin
    }
    
    const overlay = document.getElementById('block-answers-animation');
    const playersGrid = document.getElementById('players-grid');
    
    // Nettoyer le contenu précédent
    playersGrid.innerHTML = '';
    
    // Utiliser les données reçues de l'admin
    const participantsList = participantsData || [];
    const userAnswersMap = new Map(userAnswersData || []);
    
    // Stocker les données pour les fonctions d'animation
    window.animationData = {
        participants: participantsList,
        userAnswers: userAnswersMap,
        currentQuestion: currentQuestion
    };
    
    console.log('🎬 Animation avec', participantsList.length, 'participants');
    
    participantsList.forEach(([email, participant], index) => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        
        // État initial : vérification
        let statusIcon = '⏳';
        let statusText = 'Vérification...';
        
        playerCard.innerHTML = `
            <div class="player-name">${email}</div>
            <div class="player-status">${statusIcon}</div>
            <div class="player-result">${statusText}</div>
        `;
        
        // Délai d'apparition échelonné
        playerCard.style.animationDelay = `${index * 0.1}s`;
        
        playersGrid.appendChild(playerCard);
    });
    
    // Afficher l'overlay
    overlay.style.display = 'flex';
    
    // Démarrer l'effet randomisé puis révéler les vraies réponses
    startRandomizedReveal();
    
    // L'animation reste affichée jusqu'à ce que l'admin clique sur "Afficher les réponses"
}

// Fonction pour démarrer l'effet randomisé puis révéler les vraies réponses
function startRandomizedReveal() {
    let randomizeCount = 0;
    const maxRandomizations = 2; // Réduit de 5 à 2 cycles
    
    const randomizeInterval = setInterval(() => {
        if (randomizeCount < maxRandomizations) {
            // Effet randomisé
            redistributeRandomColors();
            randomizeCount++;
        } else {
            // Révéler les vraies réponses
            clearInterval(randomizeInterval);
            revealTrueAnswers();
        }
    }, 600); // Accéléré de 800ms à 600ms
}

// Fonction pour redistribuer les couleurs aléatoirement
function redistributeRandomColors() {
    const playerCards = document.querySelectorAll('.player-card');
    
    playerCards.forEach((card, index) => {
        // Retirer les anciennes classes
        card.classList.remove('correct', 'incorrect');
        
        // Ajouter un effet de transition
        card.style.transition = 'all 0.5s ease-in-out';
        
        // Générer un nouveau résultat aléatoire
        const randomResult = Math.random() > 0.5;
        
        setTimeout(() => {
            if (randomResult) {
                card.classList.add('correct');
                card.querySelector('.player-status').textContent = '✅';
                card.querySelector('.player-result').textContent = 'Bonne réponse !';
            } else {
                card.classList.add('incorrect');
                card.querySelector('.player-status').textContent = '❌';
                card.querySelector('.player-result').textContent = 'Réponse incorrecte';
            }
        }, index * 50); // Accéléré de 100ms à 50ms
    });
}

// Fonction pour révéler les vraies réponses
function revealTrueAnswers() {
    const playerCards = document.querySelectorAll('.player-card');
    
    // Utiliser les données stockées
    const animationData = window.animationData;
    if (!animationData) return;
    
    const currentQuestion = animationData.currentQuestion;
    const userAnswersMap = animationData.userAnswers;
    
    // Changer le titre pour indiquer la révélation
    const blockTitle = document.querySelector('.block-title');
    if (blockTitle) {
        blockTitle.textContent = '🎯 Révélation des Réponses';
        blockTitle.style.color = '#10b981';
    }
    
    playerCards.forEach((card, index) => {
        const email = card.querySelector('.player-name').textContent;
        
        // Retirer les anciennes classes
        card.classList.remove('correct', 'incorrect');
        
        // Ajouter un effet de transition plus dramatique
        card.style.transition = 'all 0.8s ease-in-out';
        
        setTimeout(() => {
            // Déterminer la vraie réponse
            const hasAnswer = userAnswersMap.has(email);
            const isCorrect = hasAnswer && userAnswersMap.get(email) === currentQuestion.correctAnswer;
            
            if (hasAnswer && isCorrect) {
                card.classList.add('correct');
                card.querySelector('.player-status').textContent = '✅';
                card.querySelector('.player-result').textContent = 'Bonne réponse !';
            } else {
                card.classList.add('incorrect');
                card.querySelector('.player-status').textContent = '❌';
                card.querySelector('.player-result').textContent = hasAnswer ? 'Réponse incorrecte' : 'Pas de réponse';
            }
        }, index * 100); // Accéléré de 150ms à 100ms
    });
}

// Initialiser l'état de l'interface
document.addEventListener('DOMContentLoaded', function() {
    const adminToggle = document.querySelector('.admin-toggle');
    adminToggle.style.display = 'none';
}); 