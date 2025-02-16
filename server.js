const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = 3000;
const DATA_FILE = "./info.json";

app.use(cors());
app.use(express.json());

// Route par défaut
app.get("/", (req, res) => {
  res.send("Josué Israel HOUESSOUVO !");
});



// Fonction pour obtenir le message approprié selon l'heure actuelle
function getDefaultMessageForCurrentTime(messages) {
  const currentHour = new Date().getUTCHours() + 1; // +1 pour UTC+1

  if (!messages || messages.length === 0) {
    return ""; // Aucun message par défaut n'est configuré
  }

  // Déterminer la plage horaire actuelle et retourner le message approprié
  if (currentHour >= 7 && currentHour < 12) {
    return messages.find((msg) => msg.timeRange === "07:00-12:00")?.text || "";
  } else if (currentHour >= 12 && currentHour < 19) {
    return messages.find((msg) => msg.timeRange === "12:00-19:00")?.text || "";
  } else {
    return messages.find((msg) => msg.timeRange === "19:00-07:00")?.text || "";
  }
}

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

    // Déterminer le texte par défaut en fonction de l'heure actuelle
    const currentMessageFromTime = getDefaultMessageForCurrentTime(data.messages);

    // Vérifier si currentText correspond à un texte des plages horaires
    const isCurrentTextInMessages = data.messages.some(
      (msg) => msg.text === data.currentText
    );

    if (isCurrentTextInMessages) {
      // Si currentText fait partie des messages initiaux, on met à jour selon l'heure
      data.currentText = currentMessageFromTime;
    } else if (!data.currentText || data.currentText.trim() === "") {
      // Si currentText est vide ou non défini, on met le message correspondant à l'heure
      data.currentText = currentMessageFromTime;
    }

    return data;
  } else {
    const defaultData = {
      currentText: "",
      speed: 100,
      direction: "LEFT",
      messages: [
        { timeRange: "07:00-12:00", text: "Soyez les bienvenus à IROKO Fab Lab" },
        { timeRange: "12:00-19:00", text: "Bon après-midi !" },
        { timeRange: "19:00-07:00", text: "Bonne soirée !" },
      ],
      shareTime: 0,
      durationUnlimited: false,
      expirationTime: null,
    };

    // Déterminer le message par défaut selon l'heure actuelle
    defaultData.currentText = getDefaultMessageForCurrentTime(defaultData.messages);

    return defaultData;
  }
}


// Fonction de sauvegarde des données JSON
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Fonction pour obtenir le message par défaut en fonction de l'heure
function getDefaultMessage(data) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute; // Convertir l'heure actuelle en minutes depuis minuit

  for (const message of data.messages) {
    const [start, end] = message.timeRange.split("-");
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);

    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Gérer les plages horaires chevauchant minuit
    if (
      (startTimeInMinutes <= endTimeInMinutes &&
        currentTimeInMinutes >= startTimeInMinutes &&
        currentTimeInMinutes < endTimeInMinutes) || // Plage normale
      (startTimeInMinutes > endTimeInMinutes &&
        (currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes < endTimeInMinutes)) // Plage chevauchant minuit
    ) {
      return message.text;
    }
  }

  return "Message par défaut."; // Retourne un message par défaut si aucune correspondance trouvée
}


// Surveillance de l'expiration des informations
function monitorExpiration() {
  setInterval(() => {
    const now = new Date();
    const data = loadData();

    if (
      data.expirationTime &&
      new Date(data.expirationTime) <= now &&
      data.shareTime > 0 &&
      !data.durationUnlimited
    ) {
      console.log("L'information partagée a expiré, réinitialisation...");
      // Réinitialisation de la vitesse et du sens des messages initiaux
      const currentDefaultMessage = getDefaultMessage(data);
      data.currentText = currentDefaultMessage;
      data.speed = 100;  // Ne pas affecter la vitesse par défaut
      data.direction = "LEFT";  // Ne pas affecter la direction par défaut

      data.expirationTime = null;
      data.shareTime = 0;
      data.durationUnlimited = false;
     
      saveData(data);
    }
  }, 1000); // Vérification toutes les secondes
}

// API : Mettre à jour les paramètres d'information partagée
app.post("/api/update", (req, res) => {
  const { text, speed, direction, shareTime } = req.body;
  const now = new Date();
  const data = loadData();

  // Validation et configuration des paramètres
  data.currentText = text || data.currentText;
  data.speed = speed || data.speed;
  data.direction = direction || data.direction;

  // Gestion de shareTime
  if (String(shareTime) === "unlimited") {
    console.log("Configuration d'une durée illimitée.");
    data.shareTime = 0; // Durée illimitée
    data.durationUnlimited = true;
    data.expirationTime = null; // Pas de date d'expiration
  } else {
    const shareDurationInSeconds = parseInt(shareTime) || 0; // En secondes
    data.shareTime = shareDurationInSeconds;
    data.durationUnlimited = false;

    // Calcul de l'expiration
    const expiration = new Date(now.getTime() + shareDurationInSeconds * 1000);
    data.expirationTime = expiration.toISOString();
    console.log(`Durée partagée pour ${shareDurationInSeconds} secondes.`);
  }

  saveData(data);

  res.json({
    message: "Les paramètres ont été mis à jour avec succès.",
    shareTime: data.shareTime,
    durationUnlimited: data.durationUnlimited,
    expirationTime: data.expirationTime,
  });
});

// API : Supprimer l'information partagée
app.delete("/api/share", (req, res) => {
  const data = loadData();

  // Réinitialiser les paramètres
  const currentDefaultMessage = getDefaultMessage(data);
  data.currentText = currentDefaultMessage; // Toujours utiliser le message par défaut
  data.speed = 100;  // Ne pas affecter la vitesse par défaut
  data.direction = "LEFT";  // Ne pas affecter la direction par défaut
  data.shareTime = 0;
  data.durationUnlimited = false;
  data.expirationTime = null;

  saveData(data);
  res.json({ message: "L'information partagée a été supprimée." });
});

// API : Mettre à jour les messages par défaut
app.post("/api/default-messages", (req, res) => {
  const { morningMessage, afternoonMessage, nightMessage } = req.body;
  const data = loadData();

  // Validation des données entrantes
  if (!morningMessage || !afternoonMessage || !nightMessage) {
    return res.status(400).json({ message: "Tous les messages doivent être fournis." });
  }

  // Mise à jour des messages par défaut
  data.messages = [
    { timeRange: "07:00-12:00", text: morningMessage },
    { timeRange: "12:00-19:00", text: afternoonMessage },
    { timeRange: "19:00-07:00", text: nightMessage },
  ];

  saveData(data);

  res.json({ message: "Les messages par défaut ont été mis à jour avec succès." });
});





let etatESP32 = "Inactif"; // L'ESP32 est inactif au démarrage
let derniereRequete = null; // Stocke l'heure de la dernière requête

// Vérification périodique de l'état de l'ESP32
setInterval(() => {
  const maintenant = new Date();
  if (derniereRequete && (maintenant - derniereRequete > 10000)) { // Si aucune requête depuis 10 sec
    etatESP32 = "Inactif";
  }
}, 5000); // Vérifie toutes les 5 sec

// API : Obtenir les paramètres actuels
app.get("/api/settings", (req, res) => {
  try {
    const data = loadData();

    // Vérifie si la requête provient bien de l'ESP32 (ex: vérifier l'User-Agent ou une clé secrète)
    if (req.headers["user-agent"] && req.headers["user-agent"].includes("ESP32")) {
      etatESP32 = "Actif"; // L'ESP32 envoie une requête valide
      derniereRequete = new Date();
    }

    // Ajout de l'état ESP32 dans la réponse
    res.json({ ...data, etatESP32 });

  } catch (error) {
    // En cas d'erreur, l'ESP32 est considéré comme inactif
    etatESP32 = "Inactif";
    res.status(500).json({ error: "Erreur lors du chargement des paramètres", etatESP32 });
  }
});

// Lancer la surveillance et le serveur
monitorExpiration();
app.listen(PORT, () => {
  console.log(`Backend en cours d'exécution sur http://localhost:${PORT}`);
});

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Requête reçue : ${req.method} ${req.url}`);
  next();
});
