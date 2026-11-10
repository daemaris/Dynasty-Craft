# Dynasty Craft — l'app du Coven

Site et application installable (PWA) du serveur Minecraft RPG Dynasty Craft.

## Les fichiers

| Fichier | À quoi il sert | Tu peux le modifier ? |
|---|---|---|
| `actualites.json` | Les articles de l'accueil | Oui, souvent |
| `chroniques.json` | Les chapitres du lore (onglet Chroniques) | Oui |
| `index.html` | L'application elle-même | Avec Claude |
| `logo.jpg` | Le logo de l'accueil | Oui (même nom) |
| `icons/` | L'icône de l'app (le D gothique) | Oui (mêmes noms) |
| `manifest.webmanifest` | Nom et couleurs de l'app installée | Rarement |
| `sw.js` | Fonctionnement hors connexion | Non |
| `_headers` | Réglages Cloudflare | Non |

## Publier un article

**Méthode simple :** ouvre le site avec `#creatrice` à la fin de l'adresse
(ex. `https://dynasty-craft.pages.dev/#creatrice`). Un bouton **✎ Écrire** apparaît.
Écris ton article, touche **Publier**, puis **Copier le fichier**.
Sur GitHub : ouvre `actualites.json` → crayon ✏️ → efface tout → colle → **Commit changes**.

**À la main :** dans `actualites.json`, copie un article existant (entre `{` et `}`),
colle-le en premier dans la liste et change le texte. Attention aux virgules entre les articles.

Champs d'un article :
- `id` : un nom unique sans espace (ex. `bal-masque`)
- `cat` : `Mise à jour`, `Lore`, `Événement` ou `Économie`
- `date` : `AAAA-MM-JJ` (ex. `2026-11-15`)
- `ic` : un emoji pour la couverture
- `g` : la couleur de la couverture (recopie celle d'un autre article)
- `t` : le titre — `s` : le résumé — `b` : le texte
  (`\n\n` = nouveau paragraphe, `\n- ` = ligne de liste, `**mot**` = gras)

## Modifier le lore

Dans `chroniques.json`, chaque chapitre a :
- `era` : l'époque affichée au-dessus du titre
- `c` : la couleur (`var(--gold)`, `var(--violet)`, `var(--blood)`, `var(--ice)`, `var(--moss)`)
- `t` : le titre — `s` : la phrase de résumé
- `p` : la liste des paragraphes, chacun entre guillemets, séparés par des virgules

L'ordre dans le fichier = l'ordre de la frise.

## Si une modification n'apparaît pas

Attends une minute, puis recharge la page. Si l'app installée garde l'ancienne version,
ferme-la complètement et rouvre-la.
