const fs = require('fs');
const readline = require('readline');
const bcrypt = require('bcrypt');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = question => new Promise(resolve => rl.question(question, resolve));

async function createBorneUser() {
  const username = await ask("Nom de la borne : ");
  const plainPassword = await ask("Mot de passe : ");
  const isAdminInput = await ask("Est-ce un admin ? (o/n) : ");
  const isAdmin = isAdminInput.toLowerCase() === 'o';

  let assigned_bornes = [];

  if (isAdmin) {
    const bornesInput = await ask("Liste des bornes à assigner (séparées par une virgule) : ");
    assigned_bornes = bornesInput
      .split(',')
      .map(b => b.trim())
      .filter(b => b !== '');
  } else {
    const borneName = await ask("Nom d'affectation de la borne (ex: borne_gare) : ");
    assigned_bornes = [borneName.trim()];
  }

  const filePath = './data/users.json';
  const users = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : [];

  const usernameExists = users.some(user => user.username === username);
  if (usernameExists) {
    console.log(`❌ Le nom de borne "${username}" est déjà utilisé.`);
    rl.close();
    return;
  }

  const lastId = users.length > 0 ? Math.max(...users.map(u => u.id)) : 0;
  const nextId = lastId + 1;

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const newUser = {
    id: nextId,
    username,
    password: hashedPassword,
    assigned_bornes,
    admin: isAdmin
  };

  users.push(newUser);
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

  console.log(`✅ Utilisateur créé avec succès : ${username} (id: ${nextId})`);
  rl.close();
}

createBorneUser();
