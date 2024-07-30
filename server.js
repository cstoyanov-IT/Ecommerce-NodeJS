// Importation des modules nécessaires
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const moment = require("moment-timezone");
const crypto = require("crypto");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

// Création de l'application Express
const app = express();

// Configuration du moteur de template EJS
app.set("views", __dirname + "/login/views");
app.set("view engine", "ejs");

// Middleware pour parser les données du formulaire
app.use(bodyParser.urlencoded({ extended: false }));

// Middleware pour servir les fichiers statiques
app.use(express.static(__dirname + "/login/views"));
app.use("/uploads", express.static(__dirname + "/uploads")); // Servir les fichiers statiques depuis le dossier "uploads"

// Middleware pour parser les cookies
app.use(cookieParser());

// Middleware pour gérer les sessions
app.use(
  session({
    secret: 'GHfo1eD5qfe2"442eQFqqFGQffycvbVfjfqfzqdV;?QLGp,Dsd(dq0',
    resave: false,
    saveUninitialized: false,
  }),
);

// Route pour afficher le formulaire de connexion
app.get("/login", (req, res) => {
  res.render("login");
});

// Route pour gérer la soumission du formulaire de connexion
app.post("/login", (req, res) => {
  console.log("Received login request");

  const username = req.body.username;
  const password = req.body.password;

  console.log(`Username: ${username}`);
  console.log(`Password: ${password}`);

  const encryptedPassword = crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");

  console.log(`Encrypted Password: ${encryptedPassword}`);

  fs.readFile("register_database.json", "utf8", (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send("Erreur de serveur");
      return;
    }

    let registrationData = [];
    try {
      registrationData = JSON.parse(data);
    } catch (error) {
      console.error(error);
      res.status(500).send("Erreur de serveur");
      return;
    }

    const user = registrationData.find(
      (user) =>
        user.username === username && user.password === encryptedPassword,
    );

    console.log(`User found: ${user}`);

    if (user) {
      req.session.user = user;
      res.redirect("/admin/panel");
    } else {
      res.render("login", { error: "Informations d'identification invalides" });
    }
  });
});

// Route pour afficher le formulaire d'inscription
app.get("/register", (req, res) => {
  res.render("register");
});

// Route pour gérer la soumission du formulaire d'inscription
app.post("/register", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const confirmPassword = req.body["confirm-password"];

  if (password !== confirmPassword) {
    res.render("register", { error: "Les mots de passe ne correspondent pas" });
    return;
  }

  const encryptedPassword = crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");

  fs.readFile("register_database.json", "utf8", (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send("Erreur de serveur");
      return;
    }

    let registrationData = [];
    if (data.length > 0) {
      try {
        registrationData = JSON.parse(data);
      } catch (error) {
        console.error(error);
      }
    }

    const existingUser = registrationData.find(
      (user) => user.username === username,
    );
    if (existingUser) {
      res.render("register", { error: "Le nom d'utilisateur existe déjà" });
      return;
    }

    const date = moment().tz("Europe/Paris").format("YYYY-MM-DD | HH:mm:ss");

    registrationData.push({ date, username, password: encryptedPassword });

    const jsonData = JSON.stringify(registrationData, null, 2);
    fs.writeFile("register_database.json", jsonData, (err) => {
      if (err) {
        console.error(err);
        res.status(500).send("Erreur de serveur");
        return;
      }

      res.redirect("/login");
    });
  });
});

// Route pour afficher le panneau d'administration
app.get("/admin/panel", (req, res) => {
  if (req.session.user) {
    // Lire les données des articles depuis le fichier JSON
    fs.readFile("articles_database.json", "utf8", (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send("Erreur de serveur");
        return;
      }

      let articles = [];
      if (data.length > 0) {
        try {
          articles = JSON.parse(data);
        } catch (error) {
          console.error(error);
        }
      }

      res.render("admin", { articles: articles || [] });
    });
  } else {
    res.redirect("/login");
  }
});

// Route pour déconnecter l'utilisateur
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Route pour gérer la soumission du formulaire de création d'article
app.post("/admin/create-article", upload.single("image"), (req, res) => {
  const { nom, code, description, prix, quantite } = req.body;
  const image = req.file.path;
  const date = moment().tz("Europe/Paris").format("YYYY-MM-DD | HH:mm:ss");
  const article = {
    date,
    nom,
    code,
    description,
    image,
    prix,
    quantite,
  };

  fs.readFile("articles_database.json", "utf8", (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send("Erreur de serveur");
      return;
    }

    let articles = [];
    if (data.length > 0) {
      try {
        articles = JSON.parse(data);
      } catch (error) {
        console.error(error);
      }
    }

    // Vérifier si l'article existe déjà dans le fichier JSON
    const existingArticle = articles.find((a) => a.code === code);
    if (existingArticle) {
      res.render("admin", {
        errorMessage: "Un article avec ce code existe déjà",
      });
      return;
    }

    articles.push(article);

    const jsonData = JSON.stringify(articles, null, 2);
    fs.writeFile("articles_database.json", jsonData, (err) => {
      if (err) {
        console.error(err);
        res.status(500).send("Erreur de serveur");
        return;
      }

      // Redirect the user back to the /admin/panel route
      res.redirect("/admin/panel");
    });
  });
});

// Démarrage du serveur sur le port 3000
app.listen(3000, () => {
  console.log("Le serveur est en cours d'exécution sur le port 3000");
});
