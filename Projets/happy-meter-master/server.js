const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { DateTime } = require('luxon');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { exportVotesToExcel } = require('./utils/exporter');


const app = express();

// Chemins des fichiers
const USERS_PATH = './data/users.json';
const LOCKED_BORNES_PATH = './data/locked_bornes.json';
const VOTES_PATH = './data/votes.json';

// Désactive le cache navigateur
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Passe à true si HTTPS (production)
    sameSite: 'lax'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Authentification
function isAuthenticated(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/login.html');
}

function isAdmin(req, res, next) {
  if (req.session.user?.admin === true) return next();
  return res.redirect('/login.html');
}

// Accueil
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Connexion
app.post('/login', (req, res) => {
  const username = req.body.username.trim();
  const password = req.body.password.trim();

  const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
  const user = users.find(u => u.username === username);
  if (!user) return res.redirect('/login.html?error=1');

  bcrypt.compare(password, user.password, (err, result) => {
    if (err || !result) return res.redirect('/login.html?error=1');

    req.session.user = user;

    if (!user.admin) {
      const locked = fs.existsSync(LOCKED_BORNES_PATH)
        ? JSON.parse(fs.readFileSync(LOCKED_BORNES_PATH, 'utf8')) : {};

      // Libère les anciennes bornes de l'utilisateur
      for (const borne in locked) {
        if (locked[borne] === user.username) {
          delete locked[borne];
        }
      }

      // Verrouille les nouvelles bornes
      user.assigned_bornes.forEach(borne => {
        locked[borne] = user.username;
      });

      fs.writeFileSync(LOCKED_BORNES_PATH, JSON.stringify(locked, null, 2));
    }

    return res.send(`<script>location.replace("${user.admin ? '/admin' : '/index.html'}");</script>`);
  });
});

// Déconnexion
app.get('/logout', (req, res) => {
  const user = req.session.user;

  if (user && !user.admin) {
    const locked = fs.existsSync(LOCKED_BORNES_PATH)
      ? JSON.parse(fs.readFileSync(LOCKED_BORNES_PATH, 'utf8')) : {};

    for (const borne in locked) {
      if (locked[borne] === user.username) {
        delete locked[borne];
      }
    }

    fs.writeFileSync(LOCKED_BORNES_PATH, JSON.stringify(locked, null, 2));
  }

  req.session.destroy(err => {
    if (err) {
      console.error('Erreur de déconnexion :', err);
      return res.redirect('/login.html');
    }
    res.send(`<script>location.replace('/login.html');</script>`);
  });
});

// Vérification de session 
app.get('/session-check', (req, res) => {
  if (req.session?.user) {
    res.sendStatus(200);
  } else {
    res.sendStatus(401);
  }
});

// Pages HTML
app.get('/index.html', isAuthenticated, (req, res) => {
  if (req.session.user.admin) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/admin', '/admin.html'], isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Export Excel
app.get('/export', isAuthenticated, isAdmin, (req, res) => {
  exportVotesToExcel(req.session.user, res);
});

// Statistiques
app.get('/api/stats', isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user.admin) return res.sendStatus(403);

  const votes = fs.existsSync(VOTES_PATH) ? JSON.parse(fs.readFileSync(VOTES_PATH, 'utf8')) : [];

  const questionStats = {};
  const questionKeys = ['accueil', 'horaires', 'echanges', 'informations'];

  questionKeys.forEach(question => {
    const notes = votes
      .map(v => v.votes?.[question]?.note)
      .filter(n => typeof n === 'number');

    const total = notes.length;
    const average = total === 0 ? 0 : notes.reduce((a, b) => a + b, 0) / total;
    questionStats[question] = {
      total,
      average: Number(average.toFixed(2))
    };
  });

  res.json(questionStats);
});


// Enregistrement de vote
app.post('/vote', isAuthenticated, (req, res) => {
  const user = req.session.user;
  const data = req.body;

  if (!data.votes || typeof data.votes !== 'object') {
    return res.status(400).send('Votes invalides.');
  }

  const borne = `borne_${user.assigned_bornes[0]}`;
  const votesFile = fs.existsSync(VOTES_PATH)
    ? JSON.parse(fs.readFileSync(VOTES_PATH, 'utf8'))
    : [];

  const newVote = {
    username: user.username,
    borne,
    date: new Date().toISOString(),
    commentaire: data.commentaire || null,
    votes: data.votes  // enregistre directement les votes sous forme structurée
  };

  votesFile.push(newVote);
  fs.writeFileSync(VOTES_PATH, JSON.stringify(votesFile, null, 2));
  res.sendStatus(200);
});

app.get('/api/all-votes', isAuthenticated, isAdmin, (req, res) => {
  const user = req.session.user;
  const assigned = user.assigned_bornes || [];

  const votes = fs.existsSync(VOTES_PATH)
    ? JSON.parse(fs.readFileSync(VOTES_PATH, 'utf8'))
    : [];

  const result = {};

  assigned.forEach(borne => {
    const borneKey = `borne_${borne}`;
    const borneVotes = votes.filter(v => v.borne === borneKey);
    const questionStats = {};

    const questionKeys = ['accueil', 'horaires', 'echanges', 'informations'];

    questionKeys.forEach((key, idx) => {
      const notes = borneVotes
        .map(v => v.votes?.[key]?.note)
        .filter(n => typeof n === 'number');

      const total = notes.length;
      const average = total > 0 ? (notes.reduce((a, b) => a + b, 0) / total).toFixed(2) : 0;

      questionStats[`question_${idx + 1}`] = {
        total,
        average
      };
    });

    result[borneKey] = questionStats;
  });

  res.json(result);
});

// Mapping note → émotion
function mapNoteToEmotion(note) {
  if (note === 5) return 'content';
  if (note === 3) return 'neutre';
  if (note === 1) return 'mécontent';
  return 'inconnu';
}

// Démarrage
const PORT = process.env.PORT || 3176;
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
