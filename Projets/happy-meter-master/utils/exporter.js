const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function exportVotesToExcel(user, res) {
  const filePath = path.join(__dirname, '../data/votes.json');

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Aucun vote à exporter.');
  }

  const votes = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Filtrer les votes uniquement pour les bornes assignées à l'utilisateur
  const filteredVotes = votes.filter(v => {
    const borneName = v.borne.replace(/^borne_/, '');
    return user.assigned_bornes.includes(borneName);
  });

  if (filteredVotes.length === 0) {
    return res.status(200).send('Aucun vote à exporter pour vos bornes.');
  }

  const formattedVotes = filteredVotes.map(v => {
    const dateObj = new Date(v.date);
    const dateStr = dateObj.toISOString().split('T')[0];
    const timeStr = dateObj.toTimeString().split(' ')[0];

    return {
      Borne: v.borne,
      Date: dateStr,
      Heure: timeStr,
      'Accueil': v.votes?.accueil?.note ?? '',
      'Horaires': v.votes?.horaires?.note ?? '',
      'Échanges': v.votes?.echanges?.note ?? '',
      'Informations': v.votes?.informations?.note ?? '',
      Commentaire: v.commentaire || ''
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedVotes);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Votes");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Disposition", "attachment; filename=votes.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
}

module.exports = { exportVotesToExcel };
