# Template one-page commerce + QR

Page web unique, mobile-first, premium, **sans aucune dépendance ni build** :
un seul fichier `index.html` qui s'héberge gratuitement sur GitHub Pages.

Briques incluses (les 4 qui retiennent l'abonné) :
- 🏠 **Vitrine** premium (effet machine à écrire, animations au scroll)
- 📋 **Menu** structuré (catégories, descriptions, prix)
- ⭐ **Bouton « Avis Google »** → le commerçant gagne des avis = il ne résilie pas
- 💬 **Barre fixe Appeler / WhatsApp / Itinéraire**

---

## Cloner un client en ~10 minutes

1. **Nouveau repo** GitHub (ex : `menu-le-comptoir`) et copie `index.html` dedans.
2. Ouvre `index.html` et modifie **uniquement l'objet `COMMERCE`** (bloc balisé
   en gros dans le `<script>`). Rien d'autre à toucher.
   - `nom`, `kicker`, `taglines` (phrases qui défilent)
   - `telephone` (format international `+33…` pour appel **et** WhatsApp)
   - `lienAvisGoogle`, `lienItineraire`, `lienReservation`
   - `horaires`, `adresse`, `menu`
3. **Active GitHub Pages** : repo → *Settings → Pages → Source: `main` / root* → Save.
   L'URL publique apparaît (`https://<compte>.github.io/<repo>/`).
4. **Génère le QR** vers cette URL (voir ci-dessous).

### Trouver le lien « Avis Google » d'un commerce
Le plus fiable : `https://search.google.com/local/writereview?placeid=PLACE_ID`
- Récupère le `PLACE_ID` via le *Place ID Finder* de Google Maps Platform,
  ou utilise le lien court fourni par la fiche d'établissement (*« Demander des avis »*).

### Générer le QR code
- Rapide : un générateur en ligne (qr-code-generator, etc.) pointant vers l'URL Pages.
- Mieux (gratuit, sans pub, vectoriel pour l'impression) : la lib `qrcode`
  ```bash
  npx qrcode "https://<compte>.github.io/<repo>/" -o qr.png -w 1000
  ```
  Le QR est **statique** : tant que l'URL Pages ne change pas, le QR reste valide à vie,
  même quand tu mets à jour le contenu. ✅

---

## Offre commerciale (rappel)

| Formule | Prix |
|---|---|
| Setup one-shot | **290 €** |
| **Offre à pousser** | **149 € + 25 €/mois** (hébergement + modifs illimitées) |
| Sans setup | 35 €/mois, engagement 12 mois |
| Modif ponctuelle | 30 € · QR imprimé +20 à 50 € · domaine ~10 €/an |

**Objectif récurrent : 30 clients × 25 €/mois = 750 €/mois.**

> Tu ne vends pas « une page ». Tu vends *« plus d'avis Google + vos infos
> toujours à jour, je gère tout »*.
