// Importation des modules nécessaires
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs").promises;
const moment = require("moment-timezone");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const upload = multer({ dest: "uploads/" });

// Création de l'application Express
const app = express();

// Configuration de la base de données SQLite
const db = new sqlite3.Database("./mydb.sqlite", (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log("Connecté à la base de données SQLite.");
});

// Création des tables si elles n'existent pas
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    date TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    nom TEXT,
    description TEXT,
    image TEXT,
    prix REAL,
    quantite INTEGER,
    date TEXT
  )`);
});

// Configuration du moteur de template EJS
app.set("views", __dirname + "/login/views");
app.set("view engine", "ejs");

// Middleware pour parser les données du formulaire
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware pour servir les fichiers statiques
app.use(express.static(__dirname + "/login/views"));
app.use("/uploads", express.static(__dirname + "/uploads"));

// Middleware pour parser les cookies
app.use(cookieParser());

// Middleware pour gérer les sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
  }),
);

// Fonction pour gérer les erreurs
const handleError = (
  res,
  err,
  statusCode = 500,
  message = "Erreur de serveur",
) => {
  console.error(err);
  res.status(statusCode).render("error", { error: message });
};

// Fonction pour sauvegarder les données dans JSON et SQLite
async function saveData(jsonFile, sqliteTable, data) {
  // Sauvegarde dans JSON
  const jsonData = JSON.parse(await fs.readFile(jsonFile, "utf8"));
  jsonData.push(data);
  await fs.writeFile(jsonFile, JSON.stringify(jsonData, null, 2));

  // Sauvegarde dans SQLite
  if (sqliteTable === "users") {
    db.run(
      `INSERT OR REPLACE INTO users (username, password, date) VALUES (?, ?, ?)`,
      [data.username, data.password, data.date],
    );
  } else if (sqliteTable === "articles") {
    db.run(
      `INSERT OR REPLACE INTO articles (code, nom, description, image, prix, quantite, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.code,
        data.nom,
        data.description,
        data.image,
        data.prix,
        data.quantite,
        data.date,
      ],
    );
  }
}

// Fonction pour récupérer les données de JSON et SQLite
async function getData(jsonFile, sqliteTable) {
  const jsonData = JSON.parse(await fs.readFile(jsonFile, "utf8"));

  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM ${sqliteTable}`, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve({ jsonData, sqliteData: rows });
      }
    });
  });
}

// Route pour gérer la soumission du formulaire de connexion
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const { jsonData } = await getData("register_database.json", "users");

    const user = jsonData.find((user) => user.username === username);

    if (user && (await bcrypt.compare(password, user.password))) {
      req.session.user = user;
      // Stocker le message de succès dans la session
      req.session.successMessage = "Connexion réussie";
      res.redirect("/admin/panel");
    } else {
      res.render("login", { error: "Informations d'identification invalides" });
    }
  } catch (err) {
    handleError(res, err);
  }
});
// Route pour afficher les détails d'un article spécifique
app.get("/admin/article/:code", async (req, res) => {
  const articleCode = req.params.code;

  try {
    const { jsonData } = await getData("articles_database.json", "articles");

    const article = jsonData.find((a) => a.code === articleCode);

    if (article) {
      res.render("article-details", { article });
    } else {
      handleError(res, null, 404, "Article non trouvé");
    }
  } catch (err) {
    handleError(res, err);
  }
});

// Route pour la page de modification d'un article
app.get("/admin/edit-article/:code", async (req, res) => {
  const articleCode = req.params.code;

  try {
    const { jsonData } = await getData("articles_database.json", "articles");

    const article = jsonData.find((a) => a.code === articleCode);

    if (article) {
      res.render("edit-article", { article });
    } else {
      handleError(res, null, 404, "Article non trouvé");
    }
  } catch (err) {
    handleError(res, err);
  }
});

// Route pour mettre à jour un article
app.post(
  "/admin/update-article/:code",
  upload.single("image"),
  async (req, res) => {
    try {
      const { code } = req.params;
      const { nom, description, prix, quantite } = req.body;
      const image = req.file ? req.file.path : null;

      const { jsonData } = await getData("articles_database.json", "articles");

      const articleIndex = jsonData.findIndex((a) => a.code === code);

      if (articleIndex !== -1) {
        const updatedArticle = {
          ...jsonData[articleIndex],
          nom,
          description,
          prix,
          quantite,
          image: image || jsonData[articleIndex].image,
        };

        jsonData[articleIndex] = updatedArticle;

        await fs.writeFile(
          "articles_database.json",
          JSON.stringify(jsonData, null, 2),
        );

        // Mise à jour dans SQLite
        db.run(
          `UPDATE articles SET nom = ?, description = ?, image = ?, prix = ?, quantite = ? WHERE code = ?`,
          [nom, description, updatedArticle.image, prix, quantite, code],
        );

        res.redirect(
          "/admin/panel?successMessage=" +
            encodeURIComponent("Article modifié avec succès"),
        );
      } else {
        handleError(res, null, 404, "Article non trouvé");
      }
    } catch (err) {
      handleError(res, err);
    }
  },
);

// Route pour afficher le formulaire d'inscription
app.get("/register", (req, res) => {
  res.render("register");
});

// Route pour gérer la soumission du formulaire d'inscription
app.post("/register", async (req, res) => {
  try {
    const {
      username,
      password,
      "confirm-password": confirmPassword,
    } = req.body;

    if (password !== confirmPassword) {
      return res.render("register", {
        error: "Les mots de passe ne correspondent pas",
      });
    }

    const { jsonData } = await getData("register_database.json", "users");

    if (jsonData.some((user) => user.username === username)) {
      return res.render("register", {
        error: "Le nom d'utilisateur existe déjà",
      });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const date = moment().tz("Europe/Paris").format("YYYY-MM-DD | HH:mm:ss");
    const newUser = { date, username, password: hashedPassword };

    await saveData("register_database.json", "users", newUser);

    res.redirect(
      "/login?successMessage=" +
        encodeURIComponent(
          "Inscription réussie. Vous pouvez maintenant vous connecter.",
        ),
    );
  } catch (err) {
    handleError(res, err);
  }
});

// Route pour afficher le panneau d'administration
app.get("/admin/panel", async (req, res) => {
  if (req.session.user) {
    try {
      const { jsonData } = await getData("articles_database.json", "articles");
      // Récupérer le message de succès de la session
      const successMessage = req.session.successMessage;
      // Effacer le message de succès de la session pour qu'il ne s'affiche qu'une fois
      delete req.session.successMessage;
      res.render("admin", {
        articles: jsonData,
        successMessage: successMessage,
      });
    } catch (err) {
      handleError(res, err);
    }
  } else {
    res.redirect("/login");
  }
});
// Route pour déconnecter l'utilisateur
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      handleError(res, err);
    } else {
      res.redirect(
        "/login?successMessage=" + encodeURIComponent("Déconnexion réussie"),
      );
    }
  });
});

// Route pour gérer la soumission du formulaire de création d'article
app.post("/admin/create-article", upload.single("image"), async (req, res) => {
  try {
    const { nom, code, description, prix, quantite } = req.body;
    if (!req.file) {
      return res.render("admin", {
        errorMessage: "Veuillez uploader une image",
      });
    }
    const image = req.file.path;
    const date = moment().tz("Europe/Paris").format("YYYY-MM-DD | HH:mm:ss");
    const article = { date, nom, code, description, image, prix, quantite };

    const { jsonData } = await getData("articles_database.json", "articles");

    if (jsonData.some((a) => a.code === code)) {
      return res.render("admin", {
        errorMessage: "Un article avec ce code existe déjà",
      });
    }

    await saveData("articles_database.json", "articles", article);

    res.redirect(
      "/admin/panel?successMessage=" +
        encodeURIComponent("Article créé avec succès"),
    );
  } catch (err) {
    handleError(res, err);
  }
});

// Route pour supprimer un article
app.delete("/admin/delete-article/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const { jsonData } = await getData("articles_database.json", "articles");
    const updatedJsonData = jsonData.filter((article) => article.code !== code);

    if (updatedJsonData.length < jsonData.length) {
      await fs.writeFile(
        "articles_database.json",
        JSON.stringify(updatedJsonData, null, 2),
      );

      // Suppression de SQLite
      db.run(`DELETE FROM articles WHERE code = ?`, code);

      res.json({ message: "Article supprimé avec succès" });
    } else {
      res.status(404).json({ error: "Article non trouvé" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Erreur lors de la suppression de l'article" });
  }
});

// Fermeture de la connexion à la base de données lors de l'arrêt de l'application
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log("Connexion à la base de données fermée.");
    process.exit(0);
  });
});

// Route pour la page d'accueil
app.get("/", (req, res) => {
  res.redirect("/login");
});

// Route pour la page de connexion
app.get("/login", (req, res) => {
  res.render("login");
});

// Démarrage du serveur sur le port 3000
app.listen(3000, () => {
  console.log("Le serveur est en cours d'exécution sur le port 3000");
});
