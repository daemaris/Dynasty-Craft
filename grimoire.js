/* ═══════════════════════════════════════════════════════════════════════════
   Dynasty Craft — Grimoire (quêtes de campagne) + carte des villes
   Les données viennent du serveur (Dynasty Messages 1.1.0) via Supabase :
     • quetes_chapitres, quetes : le catalogue (lisible par tous)
     • quetes_etats : les quêtes terminées du joueur relié (lisibles par lui seul)
     • villes_carte : les villes de Dynasty Villes et leur centre
   Les quêtes se cochent toutes seules quand le joueur les termine en jeu.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var donnees = { chapitres: null, quetes: [], etats: {}, villes: null, plans: [], charge: false, erreur: false };
  var ouverte = null;            // quête dont le détail est déplié
  var villeChoisie = null;
  var vue = null;                // viewBox de la carte {x, y, w, h}
  var chargementEnCours = null;

  function q(s) { return document.querySelector(s); }
  function h(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function notif(t) { try { toast(t); } catch (e) {} }
  function compte() { return window.DynastyCompte || null; }
  function client() { var c = compte(); return c ? c.client() : null; }

  // ─── Onglets du Guide ────────────────────────────────────────────────────
  window.setGSeg = function (k) {
    document.querySelectorAll("#gseg button").forEach(function (b) { b.classList.toggle("on", b.dataset.k === k); });
    q("#gseg-guide").hidden = k !== "guide";
    q("#gseg-quetes").hidden = k !== "quetes";
    q("#gseg-carte").hidden = k !== "carte";
    if (k === "quetes") { afficherQuetes(); charger(); }
    if (k === "carte") { afficherCarte(); charger(); }
  };

  // ─── Chargement ──────────────────────────────────────────────────────────
  function charger(force) {
    var sb = client();
    if (!sb) {
      // la messagerie n'a pas encore créé le client Supabase : on réessaie un peu plus tard
      setTimeout(function () { if (client()) charger(force); }, 800);
      return Promise.resolve();
    }
    if (chargementEnCours && !force) return chargementEnCours;
    var moi = compte().moi();
    chargementEnCours = Promise.all([
      sb.from("quetes_chapitres").select("*").order("ordre"),
      sb.from("quetes").select("*").order("ordre"),
      moi ? sb.from("quetes_etats").select("*") : Promise.resolve({ data: [] }),
      sb.from("villes_carte").select("*"),
      sb.from("villes_plans").select("*")
    ]).then(function (r) {
      if (r[0].error || r[1].error || r[3].error) throw new Error("lecture");
      donnees.chapitres = r[0].data || [];
      donnees.quetes = r[1].data || [];
      donnees.etats = {};
      (r[2].data || []).forEach(function (e) { donnees.etats[e.cle] = e; });
      donnees.villes = r[3].data || [];
      donnees.plans = (r[4] && !r[4].error && r[4].data) || [];
      donnees.charge = true;
      donnees.erreur = false;
    }).catch(function () {
      donnees.erreur = true;
    }).then(function () {
      chargementEnCours = null;
      if (!q("#gseg-quetes").hidden) afficherQuetes();
      if (!q("#gseg-carte").hidden) afficherCarte();
    });
    return chargementEnCours;
  }

  document.addEventListener("dynasty:compte", function () {
    if (q("#gseg-quetes") && !q("#gseg-quetes").hidden) charger(true);
    else donnees.charge = false;
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && q("#gseg-quetes") && !q("#gseg-quetes").hidden) charger(true);
  });

  // ═══ QUÊTES ═════════════════════════════════════════════════════════════
  function fini(cle) { var e = donnees.etats[cle]; return !!(e && e.fini !== false); }

  // noms français des récompenses les plus courantes (sinon : nom tiré de l'identifiant)
  var NOMS_OBJETS = {
    "minecraft:bread": "Pain", "minecraft:torch": "Torches", "minecraft:carrot": "Carottes", "minecraft:stone_sword": "Épée en pierre",
    "minecraft:apple": "Pommes", "minecraft:anvil": "Enclume", "minecraft:cauldron": "Chaudron", "minecraft:chest": "Coffre",
    "minecraft:coal": "Charbon", "minecraft:crafting_table": "Établi", "minecraft:fishing_rod": "Canne à pêche", "minecraft:furnace": "Four",
    "minecraft:oak_log": "Bûches de chêne", "minecraft:red_bed": "Lit rouge", "minecraft:stone": "Pierre", "minecraft:wooden_axe": "Hache en bois",
    "farmersdelight:stove": "Cuisinière", "dynasty_quetes:fragment_memoire": "Fragment de Mémoire", "minecraft:iron_ingot": "Lingots de fer",
    "minecraft:emerald": "Émeraudes", "minecraft:diamond": "Diamants", "minecraft:gold_ingot": "Lingots d'or", "minecraft:cooked_beef": "Steaks"
  };
  function nomObjet(r) {
    if (r.nom) return r.nom;
    var id = String(r.objet || "").replace(/\[.*$/, "");
    if (NOMS_OBJETS[id]) return NOMS_OBJETS[id];
    var n = id.split(":").pop().replace(/_/g, " ");
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  function texteRecompense(r) {
    if (r.type === "objet") return (r.nombre > 1 ? r.nombre + " × " : "") + nomObjet(r);
    if (r.type === "xp") return r.points + " points d'expérience";
    if (r.type === "mooncoins") return r.montant + " MoonCoins";
    if (r.type === "choix") return r.texte + (r.options && r.options.length ? " : " + r.options.join(", ") : "");
    return r.texte || "";
  }

  /** Détail d'une quête dépliée : récit, réplique, objectifs (cochés selon l'avancement), récompenses. */
  function detailQuete(x, st, moi) {
    var e = donnees.etats[x.cle], html = "";
    if (x.description) html += '<span class="grrecit">' + h(x.description).replace(/\n/g, "<br>") + "</span>";
    if (x.dialogue) html += '<span class="grdial">« ' + h(x.dialogue).replace(/\n/g, "<br>") + " »" + (x.pnj ? "<i>— " + h(x.pnj) + "</i>" : "") + "</span>";
    var obs = x.objectifs || [];
    if (obs.length) {
      html += '<span class="grsec">Objectifs</span><span class="grobjs">';
      obs.forEach(function (o, i) {
        var total = o.total || 1, fait = 0;
        if (moi && e) fait = e.fini !== false ? total : Math.min(total, (e.obj || [])[i] || 0);
        var ok = moi && fait >= total;
        html += '<span class="grobj' + (ok ? " ok" : "") + (moi ? "" : " neutre") + '"><b>' + (ok ? "✓" : moi ? "" : "•") + "</b><span>" + h(o.texte) +
          (o.optionnel ? " <small>(facultatif)</small>" : "") +
          (total > 1 && moi && !ok ? " <small>" + fait + "/" + total + "</small>" : total > 1 && !moi ? " <small>×" + total + "</small>" : "") + "</span></span>";
      });
      html += "</span>";
    }
    var rs = (x.recompenses || []).map(texteRecompense).filter(Boolean);
    if (rs.length) {
      html += '<span class="grsec">Récompenses</span><span class="grrecs">';
      rs.forEach(function (t) { html += "<span>" + h(t) + "</span>"; });
      html += "</span>";
    }
    if (!html) html = '<span class="grrecit">Pas de détail pour cette quête.</span>';
    if (e && e.fin_le && e.fini !== false) html += "<i>Terminée le " + dateFr(e.fin_le) + "</i>";
    return html;
  }

  /** Objectifs remplis d'une quête en cours, ex. « 2/5 ». */
  function avancement(x) {
    var e = donnees.etats[x.cle], obs = x.objectifs || [];
    if (!e || e.fini !== false || !obs.length) return "";
    var n = 0;
    obs.forEach(function (o, i) { if (((e.obj || [])[i] || 0) >= (o.total || 1)) n++; });
    return n + "/" + obs.length;
  }

  function chapitreFini(id) {
    var qs = donnees.quetes.filter(function (x) { return x.chapitre === id; });
    return qs.length > 0 && qs.every(function (x) { return fini(x.cle); });
  }

  /** État d'une quête : faite, à réclamer, en cours, verrouillée. */
  function statut(quete, chapitreOuvert) {
    var e = donnees.etats[quete.cle];
    if (e && e.fini !== false) return e.reclame ? "faite" : "reclamer";
    if (!chapitreOuvert) return "verrou";
    var req = quete.requiert || [];
    var ok = req.every(function (id) { return fini(id.indexOf("/") > 0 ? id : quete.chapitre + "/" + id); });
    return ok ? "encours" : "verrou";
  }

  function afficherQuetes() {
    var z = q("#gseg-quetes");
    if (!z) return;
    if (!donnees.charge) {
      z.innerHTML = donnees.erreur ? carteInfo("🕯️", "Le grimoire ne répond pas", "Vérifie ta connexion puis reviens sur cet onglet.") : '<div class="empty">Ouverture du grimoire…</div>';
      return;
    }
    if (!donnees.chapitres.length) {
      z.innerHTML = carteInfo("📖", "Le grimoire est encore scellé", "Les quêtes apparaîtront ici dès que le serveur les aura envoyées.");
      return;
    }
    var c = compte(), user = c && c.user(), moi = c && c.moi();
    var total = donnees.quetes.length;
    var faites = donnees.quetes.filter(function (x) { return fini(x.cle); }).length;
    var html = "";

    // en-tête : progression ou invitation à relier son compte
    if (moi) {
      var pct = total ? Math.round(faites * 100 / total) : 0;
      html += '<div class="card grprog"><div class="ring" style="--p:' + pct + '"><span>' + faites + "/" + total + '</span></div><div style="flex:1">' +
        '<b style="font-family:Cinzel">Ta progression</b><div class="sub" style="font-size:13px">' +
        (faites === total ? "Tu as terminé toutes les quêtes du grimoire. Le Coven te salue." : "Les quêtes se cochent toutes seules quand tu les termines en jeu.") +
        '</div></div><button class="icobtn" title="Actualiser" onclick="GRIM.actualiser()">↻</button></div>';
    } else if (user) {
      html += '<div class="card grlien"><span style="font-size:24px">🔗</span><div style="flex:1"><b>Relie ton compte Minecraft</b><div class="sub" style="font-size:13px">Pour voir ta progression, tape <code>/message lier</code> en jeu puis entre le code dans l\'onglet Messages.</div></div><button class="btn ghost" onclick="go(\'msg\')">Relier</button></div>';
    } else {
      html += '<div class="card grlien"><span style="font-size:24px">🪶</span><div style="flex:1"><b>Suis ta progression</b><div class="sub" style="font-size:13px">Connecte-toi avec Discord et relie ton compte Minecraft : tes quêtes terminées se cocheront toutes seules.</div></div><button class="btn ghost" onclick="GRIM.connexion()">Se connecter</button></div>';
    }

    var precedentFini = true;
    donnees.chapitres.forEach(function (ch) {
      var qs = donnees.quetes.filter(function (x) { return x.chapitre === ch.id; });
      var req = ch.requiert || [];
      var ouvert = req.length ? req.every(chapitreFini) : true;
      if (!moi) ouvert = true;               // sans compte : on montre tout, sans statut
      var nb = qs.filter(function (x) { return fini(x.cle); }).length;
      html += '<div class="card grchap' + (ouvert ? "" : " ferme") + '">' +
        '<div class="grchead"><div style="flex:1"><div class="eyebrow">' + h(ch.sous_titre || "") + (ch.en_equipe ? ' · <span class="grequipe">en équipe</span>' : "") + '</div>' +
        '<h3>' + h(ch.titre) + '</h3></div>' + (moi ? '<span class="grcpt">' + nb + "/" + qs.length + "</span>" : "") + '</div>' +
        (ch.description ? '<p class="sub grdesc">' + h(ch.description).replace(/\n/g, "<br>") + "</p>" : "") +
        (!ouvert ? '<p class="sub grverrou">🔒 Termine d\'abord le chapitre précédent.</p>' : "");
      html += '<div class="grliste">';
      qs.forEach(function (x, i) {
        var st = moi ? statut(x, ouvert) : "neutre";
        var ico = { faite: "✓", reclamer: "✦", encours: "☾", verrou: "🔒", neutre: String(i + 1) }[st];
        var etiquette = { faite: "Terminée", reclamer: "À réclamer dans le grimoire", encours: "En cours", verrou: "Verrouillée", neutre: "" }[st];
        if (st === "encours" && avancement(x)) etiquette += " · " + avancement(x) + " objectifs";
        var meta = [x.lieu, x.pnj].filter(Boolean).join(" · ");
        var deplie = ouverte === x.cle;
        var cache = st === "verrou";
        html += '<button class="grq ' + st + (deplie ? " open" : "") + '" onclick="GRIM.ouvrir(\'' + h(x.cle) + '\')">' +
          '<span class="grico">' + ico + '</span><span class="grtxt"><b>' + h(x.titre) + '</b>' +
          (meta ? "<small>" + h(meta) + "</small>" : "") + (etiquette ? '<em>' + etiquette + "</em>" : "") +
          (deplie ? '<span class="grdet">' + (cache ? "Le grimoire garde encore ses secrets… termine les quêtes précédentes." : detailQuete(x, st, moi)) + "</span>" : "") +
          '</span><span class="chev">›</span></button>';
      });
      html += "</div></div>";
      precedentFini = precedentFini && nb === qs.length;
    });
    html += '<p class="proto">LES RÉCOMPENSES SE RÉCLAMENT EN JEU, DANS LE GRIMOIRE DU COVEN</p>';
    z.innerHTML = html;
  }

  function dateFr(iso) {
    try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; }
  }

  function carteInfo(ic, titre, texte) {
    return '<div class="card grinfo"><div style="font-size:40px">' + ic + '</div><b style="font-family:Cinzel;font-size:17px">' + h(titre) + '</b><p class="sub">' + h(texte) + "</p></div>";
  }

  // ═══ CARTE ══════════════════════════════════════════════════════════════
  function villesPlacees() {
    return (donnees.villes || []).filter(function (v) {
      return v.a_centre && v.x != null && v.z != null && (!v.dimension || v.dimension === "minecraft:overworld");
    });
  }

  function cadre(vs) {
    if (!vs.length) return { x: -500, y: -500, w: 1000, h: 1000 };
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    vs.forEach(function (v) { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z); });
    var w = Math.max(600, maxX - minX), hh = Math.max(600, maxZ - minZ);
    var marge = Math.max(w, hh) * 0.25;
    var cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, cote = Math.max(w, hh * 1.25) + marge * 2;
    return { x: cx - cote / 2, y: cz - cote * 0.4, w: cote, h: cote * 0.8 };
  }

  /** Petit générateur aléatoire stable (le décor ne change pas d'une visite à l'autre). */
  function hasard(graine) {
    var s = graine >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function decor(b) {
    var r = hasard(1234 + Math.round(b.x / 100) * 7 + Math.round(b.y / 100) * 13);
    var out = "";
    var pas = b.w / 14;
    // arbres géants : touffes de cercles
    for (var gx = b.x - pas; gx < b.x + b.w + pas; gx += pas) {
      for (var gy = b.y - pas; gy < b.y + b.h + pas; gy += pas) {
        if (r() < 0.45) continue;
        var x = gx + r() * pas, y = gy + r() * pas, t = pas * (0.18 + r() * 0.22);
        var teinte = ["#3d5a3a", "#4a6b40", "#55764a", "#3a5236"][Math.floor(r() * 4)];
        out += '<g opacity=".55"><circle cx="' + (x - t * 0.5) + '" cy="' + (y + t * 0.2) + '" r="' + t * 0.8 + '" fill="' + teinte + '"/>' +
          '<circle cx="' + (x + t * 0.5) + '" cy="' + (y + t * 0.25) + '" r="' + t * 0.75 + '" fill="' + teinte + '"/>' +
          '<circle cx="' + x + '" cy="' + (y - t * 0.35) + '" r="' + t * 0.9 + '" fill="' + teinte + '"/>' +
          '<rect x="' + (x - t * 0.12) + '" y="' + (y + t * 0.5) + '" width="' + t * 0.24 + '" height="' + t * 0.6 + '" fill="#5b4330"/></g>';
      }
    }
    // une rivière qui traverse la carte
    var y0 = b.y + b.h * (0.3 + r() * 0.4), d = "M" + (b.x - 50) + " " + y0;
    for (var i = 1; i <= 6; i++) d += " Q" + (b.x + b.w * (i - 0.5) / 6) + " " + (y0 + (r() - 0.5) * b.h * 0.35) + " " + (b.x + b.w * i / 6) + " " + (y0 + (r() - 0.5) * b.h * 0.2);
    out = '<path d="' + d + '" fill="none" stroke="#7aa6c8" stroke-width="' + b.w / 90 + '" stroke-linecap="round" opacity=".55"/>' + out;
    return out;
  }

  function afficherCarte() {
    var z = q("#gseg-carte");
    if (!z) return;
    if (plan.cle && donnees.charge) return afficherPlan();
    if (!donnees.charge) {
      z.innerHTML = donnees.erreur ? carteInfo("🗺️", "La carte ne se charge pas", "Vérifie ta connexion puis reviens sur cet onglet.") : '<div class="empty">Dépliage de la carte…</div>';
      return;
    }
    var vs = villesPlacees();
    var b = cadre(vs);
    if (!vue) vue = { x: b.x, y: b.y, w: b.w, h: b.h };
    var base = b;
    var taille = base.w / 26;   // taille des repères, constante quel que soit le zoom de départ

    var svg = '<svg id="grsvg" viewBox="' + vue.x + " " + vue.y + " " + vue.w + " " + vue.h + '" preserveAspectRatio="xMidYMid meet">' +
      '<defs><radialGradient id="grpar" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#efe0bd"/><stop offset=".75" stop-color="#d9c08f"/><stop offset="1" stop-color="#b8975e"/></radialGradient>' +
      '<filter id="grgrain"><feTurbulence type="fractalNoise" baseFrequency="' + (3 / base.w * 60) + '" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .12  0 0 0 .18 0"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>' +
      '<rect x="' + (base.x - base.w) + '" y="' + (base.y - base.h) + '" width="' + base.w * 3 + '" height="' + base.h * 3 + '" fill="url(#grpar)"/>' +
      '<rect x="' + (base.x - base.w) + '" y="' + (base.y - base.h) + '" width="' + base.w * 3 + '" height="' + base.h * 3 + '" fill="#000" filter="url(#grgrain)"/>' +
      decor({ x: base.x - base.w * 0.5, y: base.y - base.h * 0.5, w: base.w * 2, h: base.h * 2 });

    // rose des vents (nord = −Z, en haut, comme sur la carte du jeu)
    var rx = base.x + base.w * 0.9, ry = base.y + base.h * 0.14, rr = base.w * 0.05;
    svg += '<g opacity=".8"><circle cx="' + rx + '" cy="' + ry + '" r="' + rr + '" fill="none" stroke="#6b4a2a" stroke-width="' + rr / 12 + '"/>' +
      '<path d="M' + rx + " " + (ry - rr * 1.25) + " L" + (rx + rr * 0.22) + " " + ry + " L" + rx + " " + (ry + rr * 1.25) + " L" + (rx - rr * 0.22) + " " + ry + 'Z" fill="#6b4a2a"/>' +
      '<text x="' + rx + '" y="' + (ry - rr * 1.4) + '" font-size="' + rr * 0.6 + '" text-anchor="middle" fill="#6b4a2a" font-family="Cinzel">N</text></g>';
    // cartouche
    var fs = base.w * 0.034;
    svg += '<g><rect x="' + (base.x + base.w * 0.025) + '" y="' + (base.y + base.h * 0.035) + '" width="' + fs * 12.2 + '" height="' + fs * 1.8 + '" rx="' + fs * 0.4 + '" fill="#efe0bd" stroke="#6b4a2a" stroke-width="' + fs * 0.08 + '" opacity=".92"/>' +
      '<text x="' + (base.x + base.w * 0.025 + fs * 6.1) + '" y="' + (base.y + base.h * 0.035 + fs * 1.25) + '" font-size="' + fs + '" text-anchor="middle" fill="#5a3b1e" font-family="Cinzel" font-weight="700">Forêt des Arbres Géants</text></g>';

    vs.forEach(function (v) {
      var x = v.x, y = v.z, t = taille;
      var choisi = villeChoisie === v.cle;
      var coul = v.fermee ? "#8a5a9e" : v.reservee ? "#9c8a6a" : "#7c3aed";
      svg += '<g class="grville" onclick="GRIM.ville(\'' + h(v.cle) + '\')" style="cursor:pointer">' +
        (choisi ? '<circle cx="' + x + '" cy="' + y + '" r="' + t * 1.9 + '" fill="#f0c060" opacity=".35"/>' : "") +
        '<path d="M' + x + " " + (y + t * 1.1) + " L" + (x - t * 0.75) + " " + (y - t * 0.1) + " A" + t * 0.85 + " " + t * 0.85 + " 0 1 1 " + (x + t * 0.75) + " " + (y - t * 0.1) + 'Z" fill="' + coul + '" stroke="#2a1640" stroke-width="' + t * 0.1 + '"' + (v.reservee ? ' stroke-dasharray="' + t * 0.25 + '"' : "") + "/>" +
        '<text x="' + x + '" y="' + (y - t * 0.38) + '" font-size="' + t * 0.75 + '" text-anchor="middle" fill="#fff" font-family="Cinzel" font-weight="700">' + (v.fermee ? "🔒" : h((v.nom || "?").charAt(0).toUpperCase())) + "</text>" +
        '<text x="' + x + '" y="' + (y + t * 2.0) + '" font-size="' + t * 0.62 + '" text-anchor="middle" fill="#3b2412" font-family="Cinzel" font-weight="700" paint-order="stroke" stroke="#efe0bd" stroke-width="' + t * 0.18 + '">' + h(v.nom) + "</text></g>";
    });
    svg += "</svg>";

    var html = '<div class="card grcarte"><div class="grmap">' + svg +
      '<div class="grzoom"><button onclick="GRIM.zoom(0.7)" aria-label="Zoomer">+</button><button onclick="GRIM.zoom(1.43)" aria-label="Dézoomer">−</button><button onclick="GRIM.recentrer()" aria-label="Recentrer">⌖</button></div></div>';
    if (!vs.length) html += '<p class="sub" style="margin:10px 4px 2px">Aucune ville n\'a encore de centre sur la carte. Elles apparaîtront dès que le serveur les aura envoyées.</p>';
    html += "</div>";

    var v = vs.filter(function (x) { return x.cle === villeChoisie; })[0];
    if (v) html += ficheVille(v);

    var liste = (donnees.villes || []).slice();
    donnees.plans.forEach(function (pl) {
      if (!liste.some(function (v) { return v.cle === pl.cle; })) liste.push({ cle: pl.cle, nom: pl.nom, habitants: 0, planSeul: true });
    });
    liste.sort(function (a, b) { return (b.habitants || 0) - (a.habitants || 0) || String(a.nom).localeCompare(b.nom); });
    if (liste.length) {
      html += "<h2>Les villes</h2><div class=\"card\" style=\"padding:4px 14px\">";
      liste.forEach(function (x) {
        var aPlan = planDe(x.cle);
        html += '<button class="grligne" onclick="' + (x.planSeul ? "GRIM.plan(\'" + h(x.cle) + "\')" : "GRIM.ville(\'" + h(x.cle) + "\',true)") + '"><span class="grpin" style="background:' + (x.fermee ? "#8a5a9e" : x.reservee ? "#9c8a6a" : "#7c3aed") + '"></span>' +
          '<span style="flex:1;text-align:left"><b>' + h(x.nom) + '</b><small>' + (x.habitants || 0) + " habitant" + ((x.habitants || 0) > 1 ? "s" : "") +
          (x.fermee ? " · sur invitation" : "") + (x.reservee ? " · en attente de son chef" : "") + "</small></span>" + (aPlan ? '<span class="grplanchip">plan</span>' : "") + "<span class=\"chev\">›</span></button>";
      });
      html += "</div>";
    }
    html += '<p class="proto">POSITION = CENTRE DE LA VILLE · NORD EN HAUT</p>';
    z.innerHTML = html;
    brancherCarte();
  }

  function ficheVille(v) {
    var etat = v.reservee ? "En attente de son chef" : v.fermee ? "Sur invitation du chef" : "Ouverte : /city join " + v.nom;
    var chef = v.chef_pseudo || (v.reservee ? "—" : "inconnu");
    return '<div class="card grfiche"><div class="grfh"><div style="flex:1"><div class="eyebrow">Ville</div><h3>' + h(v.nom) + '</h3></div><button class="icobtn" onclick="GRIM.ville(null)">✕</button></div>' +
      '<div class="grfgrid">' +
      '<div><span>Chef</span><b>' + (v.chef_pseudo ? '<img src="https://mc-heads.net/avatar/' + encodeURIComponent(v.chef_pseudo) + '/32" alt=""> ' : "") + h(chef) + "</b></div>" +
      "<div><span>Habitants</span><b>" + (v.habitants || 0) + "</b></div>" +
      "<div><span>Fondée</span><b>" + (v.fondee_le ? dateFr(v.fondee_le) : "—") + (v.fondateur_pseudo && v.fondateur_pseudo !== v.chef_pseudo ? "<small>par " + h(v.fondateur_pseudo) + "</small>" : "") + "</b></div>" +
      "<div><span>Centre</span><b>X " + v.x + " · Z " + v.z + "</b></div></div>" +
      '<p class="sub" style="margin:10px 0 0">' + h(etat) + "</p>" +
      '<div class="grbtns">' + (planDe(v.cle) ? '<button class="btn" onclick="GRIM.plan(\'' + h(v.cle) + '\')">🗺 Ouvrir le plan</button>' : "") +
      '<button class="btn ghost" onclick="GRIM.copier(' + v.x + "," + v.z + ')">Copier les coordonnées</button></div></div>';
  }

  // déplacement à la souris / au doigt et molette
  function brancherCarte() {
    var s = q("#grsvg");
    if (!s) return;
    var depart = null, deplace = false;
    s.addEventListener("pointerdown", function (e) { depart = { x: e.clientX, y: e.clientY, vx: vue.x, vy: vue.y }; deplace = false; });
    s.addEventListener("pointermove", function (e) {
      if (!depart) return;
      var r = s.getBoundingClientRect();
      var k = vue.w / r.width;
      var dx = (e.clientX - depart.x) * k, dy = (e.clientY - depart.y) * k;
      if (Math.abs(dx) + Math.abs(dy) > k * 4) deplace = true;
      vue.x = depart.vx - dx; vue.y = depart.vy - dy;
      s.setAttribute("viewBox", vue.x + " " + vue.y + " " + vue.w + " " + vue.h);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { s.addEventListener(n, function () { depart = null; }); });
    s.addEventListener("click", function (e) { if (deplace) { e.stopPropagation(); e.preventDefault(); } }, true);
    s.addEventListener("wheel", function (e) { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 0.87); }, { passive: false });
  }

  function zoom(f) {
    if (!vue) return;
    var cx = vue.x + vue.w / 2, cy = vue.y + vue.h / 2;
    var w = Math.max(80, Math.min(vue.w * f, 60000)), hh = vue.h * (w / vue.w);
    vue = { x: cx - w / 2, y: cy - hh / 2, w: w, h: hh };
    var s = q("#grsvg");
    if (s) s.setAttribute("viewBox", vue.x + " " + vue.y + " " + vue.w + " " + vue.h);
  }

  // ═══ PLAN D'UNE VILLE ═══════════════════════════════════════════════════
  var TYPES = {
    quartier:  { nom: "Quartiers",  ic: "▦", coul: "#c084fc" },
    propriete: { nom: "Propriétés", ic: "⌂", coul: "#60a5fa" },
    pnj:       { nom: "PNJ",        ic: "☺", coul: "#7ee0a0" },
    boutique:  { nom: "Boutiques",  ic: "⛁", coul: "#f0c060" },
    waystone:  { nom: "Waystones",  ic: "◆", coul: "#67e8f9" }
  };
  var CATS = {
    terrain:     { nom: "Terrain",        coul: "#a3e635" },
    maison:      { nom: "Maison",         coul: "#60a5fa" },
    prime:       { nom: "Maison prime",   coul: "#f0c060" },
    appartement: { nom: "Appartement",    coul: "#f472b6" },
    atelier:     { nom: "Atelier",        coul: "#fb923c" }
  };
  var plan = { cle: null, elements: null, erreur: false, vue: null, fond: null, choisi: null, recherche: "", aVendre: false,
               filtres: { quartier: true, propriete: true, pnj: true, boutique: true, waystone: true } };

  function planDe(cle) { return donnees.plans.filter(function (p) { return p.cle === cle; })[0] || null; }

  function urlImage(pl) {
    if (!pl || !pl.image_maj) return null;
    var sb = client(), url = null;
    try { url = sb.storage.from("cartes").getPublicUrl(pl.cle + ".png").data.publicUrl; } catch (e) {}
    if (!url) return null;
    return url + (url.indexOf("?") < 0 ? "?" : "&") + "v=" + encodeURIComponent(pl.image_maj);
  }

  function ouvrirPlan(cle) {
    var pl = planDe(cle);
    if (!pl) return;
    plan.cle = cle; plan.elements = null; plan.erreur = false; plan.choisi = null; plan.recherche = "";
    plan.vue = { x: pl.x0, y: pl.z0, w: pl.largeur, h: pl.hauteur };
    if (!plan.fond) plan.fond = "jeu";
    afficherPlan();
    var sb = client();
    if (!sb) return;
    sb.from("carte_elements").select("*").eq("ville", cle).then(function (r) {
      if (plan.cle !== cle) return;
      if (r.error) plan.erreur = true; else plan.elements = r.data || [];
      afficherPlan();
    });
    var z = q("#gseg-carte"); if (z) z.scrollIntoView({ block: "start" });
  }

  function visibles() {
    var t = plan.recherche.trim().toLowerCase();
    return (plan.elements || []).filter(function (e) {
      if (!plan.filtres[e.type]) return false;
      if (plan.aVendre && e.type === "propriete" && !(e.infos && e.infos.libre && e.categorie !== "atelier")) return false;
      if (!t) return true;
      var i = e.infos || {};
      return [e.nom, i.proprietaire, i.style, i.metier, (CATS[e.categorie] || {}).nom].join(" ").toLowerCase().indexOf(t) >= 0;
    });
  }

  function svgPlan(pl) {
    var v = plan.vue, taille = tailleCarte(pl);
    var ech = Math.max(v.w / taille.l, v.h / taille.h);   // blocs par pixel d'écran : repères de taille constante
    var img = plan.fond === "jeu" ? urlImage(pl) : null;
    var s = '<svg id="grplansvg" viewBox="' + v.x + " " + v.y + " " + v.w + " " + v.h + '" preserveAspectRatio="xMidYMid meet">';
    var X0 = pl.x0 - pl.largeur, Y0 = pl.z0 - pl.hauteur;
    if (img) {
      s += '<rect x="' + X0 + '" y="' + Y0 + '" width="' + pl.largeur * 3 + '" height="' + pl.hauteur * 3 + '" fill="#141019"/>' +
        '<image href="' + h(img) + '" x="' + pl.img_x0 + '" y="' + pl.img_z0 + '" width="' + pl.img_largeur + '" height="' + pl.img_hauteur + '" style="image-rendering:pixelated" preserveAspectRatio="none"/>';
    } else {
      s += '<defs><radialGradient id="grpar2" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#efe0bd"/><stop offset=".8" stop-color="#d9c08f"/><stop offset="1" stop-color="#b8975e"/></radialGradient>' +
        '<pattern id="grgrille" width="16" height="16" patternUnits="userSpaceOnUse" x="0" y="0"><path d="M16 0H0V16" fill="none" stroke="#8a6a3e" stroke-width=".25" opacity=".35"/></pattern></defs>' +
        '<rect x="' + X0 + '" y="' + Y0 + '" width="' + pl.largeur * 3 + '" height="' + pl.hauteur * 3 + '" fill="url(#grpar2)"/>' +
        '<rect x="' + X0 + '" y="' + Y0 + '" width="' + pl.largeur * 3 + '" height="' + pl.hauteur * 3 + '" fill="url(#grgrille)"/>';
    }
    var els = visibles(), surFond = !!img;
    // zones : quartiers dessous, propriétés dessus
    ["quartier", "propriete"].forEach(function (type) {
      els.forEach(function (e) {
        if (e.type !== type) return;
        var choisi = plan.choisi === e.id, i = e.infos || {};
        var coul = type === "quartier" ? TYPES.quartier.coul : (CATS[e.categorie] || CATS.maison).coul;
        var libre = type === "propriete" && i.libre && e.categorie !== "atelier";
        (e.zones || []).forEach(function (r) {
          s += '<rect class="grzone" data-id="' + h(e.id) + '" x="' + r[0] + '" y="' + r[1] + '" width="' + (r[2] - r[0] + 1) + '" height="' + (r[3] - r[1] + 1) + '"' +
            ' fill="' + coul + '" fill-opacity="' + (type === "quartier" ? (surFond ? .10 : .14) : choisi ? .65 : libre ? .22 : .42) + '"' +
            ' stroke="' + (libre ? "#7ee0a0" : coul) + '" stroke-width="' + ech * (choisi ? 3 : type === "quartier" ? 1.4 : 1.6) + '"' +
            (type === "quartier" ? ' stroke-dasharray="' + ech * 6 + " " + ech * 4 + '"' : libre ? ' stroke-dasharray="' + ech * 3 + " " + ech * 2 + '"' : "") + "/>";
        });
      });
    });
    // étiquettes des quartiers
    els.forEach(function (e) {
      if (e.type !== "quartier") return;
      var fs = ech * 11;
      s += '<text x="' + e.x + '" y="' + e.z + '" font-size="' + fs + '" text-anchor="middle" fill="' + (surFond ? "#fff" : "#3b2412") + '" font-family="Cinzel" font-weight="700" paint-order="stroke" stroke="' + (surFond ? "rgba(20,8,36,.85)" : "#efe0bd") + '" stroke-width="' + fs * .25 + '" style="pointer-events:none">' + h(e.nom) + "</text>";
    });
    // repères ponctuels
    els.forEach(function (e) {
      if (e.type === "quartier" || e.type === "propriete") return;
      var t = TYPES[e.type], r = ech * (plan.choisi === e.id ? 9 : 7);
      s += '<g class="grrep" data-id="' + h(e.id) + '">' +
        '<circle cx="' + (e.x + .5) + '" cy="' + (e.z + .5) + '" r="' + r + '" fill="' + t.coul + '" stroke="#1c0f2e" stroke-width="' + ech * 1.6 + '"/>' +
        '<text x="' + (e.x + .5) + '" y="' + (e.z + .5 + r * .36) + '" font-size="' + r * 1.05 + '" text-anchor="middle" fill="#1c0f2e" font-weight="700" style="pointer-events:none">' + t.ic + "</text>";
      if (e.type === "pnj" && v.w < pl.largeur * 0.7) {
        var fs2 = ech * 9;
        s += '<text x="' + (e.x + .5) + '" y="' + (e.z + .5 + r + fs2) + '" font-size="' + fs2 + '" text-anchor="middle" fill="#fff" paint-order="stroke" stroke="rgba(20,8,36,.85)" stroke-width="' + fs2 * .3 + '" style="pointer-events:none">' + h(e.nom) + "</text>";
      }
      s += "</g>";
    });
    return s + "</svg>";
  }

  function ratio(pl) { return Math.max(0.75, Math.min(1.5, pl.largeur / pl.hauteur)); }

  /** Taille de la carte à l'écran (px), même avant qu'elle soit affichée. */
  function tailleCarte(pl) {
    var m = q(".grplanmap");
    if (m && m.clientWidth) return { l: m.clientWidth, h: m.clientHeight };
    var z = q("#gseg-carte"), l = Math.max(280, (z && z.clientWidth ? z.clientWidth : 360) - 16);
    var hh = Math.min(l / ratio(pl), window.innerHeight * 0.64);
    return { l: l, h: hh };
  }

  function afficherPlan() {
    var z = q("#gseg-carte"), pl = planDe(plan.cle);
    if (!z) return;
    if (!pl) { plan.cle = null; return afficherCarte(); }
    var aImage = !!urlImage(pl);
    var html = '<div class="grplanhead"><button class="icobtn" onclick="GRIM.fermerPlan()" aria-label="Retour">‹</button>' +
      '<div style="flex:1;min-width:0"><div class="eyebrow">Plan de la ville</div><h3>' + h(pl.nom) + "</h3></div>" +
      '<div class="grfond"><button class="' + (plan.fond === "jeu" ? "on" : "") + '" onclick="GRIM.fond(\'jeu\')">Vue du jeu</button><button class="' + (plan.fond === "parchemin" ? "on" : "") + '" onclick="GRIM.fond(\'parchemin\')">Parchemin</button></div></div>';
    // filtres
    var compte = {};
    (plan.elements || []).forEach(function (e) { compte[e.type] = (compte[e.type] || 0) + 1; });
    html += '<div class="grfiltres">';
    Object.keys(TYPES).forEach(function (k) {
      var t = TYPES[k];
      html += '<button class="grfil' + (plan.filtres[k] ? " on" : "") + '" style="--c:' + t.coul + '" onclick="GRIM.filtre(\'' + k + '\')"><span>' + t.ic + "</span>" + t.nom + "<b>" + (compte[k] || 0) + "</b></button>";
    });
    html += '<button class="grfil vente' + (plan.aVendre ? " on" : "") + '" style="--c:#7ee0a0" onclick="GRIM.aVendre()"><span>✦</span>À vendre</button></div>';
    // carte
    html += '<div class="card grcarte"><div class="grmap grplanmap" style="aspect-ratio:' + ratio(pl).toFixed(3) + '">' +
      (plan.elements ? svgPlan(pl) : '<div class="empty" style="padding-top:38%">' + (plan.erreur ? "Le plan ne se charge pas." : "Dépliage du plan…") + "</div>") +
      '<div class="grzoom"><button onclick="GRIM.zoomPlan(0.7)" aria-label="Zoomer">+</button><button onclick="GRIM.zoomPlan(1.43)" aria-label="Dézoomer">−</button><button onclick="GRIM.recentrerPlan()" aria-label="Recentrer">⌖</button></div>' +
      (plan.fond === "jeu" && !aImage ? '<div class="grnote">Le terrain n\'a pas encore été dessiné : parchemin en attendant.</div>' : "") +
      "</div>";
    // légende des propriétés
    if (plan.filtres.propriete) {
      html += '<div class="grlegende">';
      Object.keys(CATS).forEach(function (k) { html += '<span><i style="background:' + CATS[k].coul + '"></i>' + CATS[k].nom + "</span>"; });
      html += '<span><i class="libre"></i>À vendre</span></div>';
    }
    html += "</div>";
    var e = (plan.elements || []).filter(function (x) { return x.id === plan.choisi; })[0];
    if (e) html += ficheElement(e);
    // recherche + liste
    html += '<div class="grrech"><input id="grrech" type="search" placeholder="Chercher un lieu, un PNJ, un joueur…" value="' + h(plan.recherche) + '" oninput="GRIM.chercher(this.value)"></div>';
    html += '<div id="grliste">' + listeElements() + "</div>";
    html += '<p class="proto">NORD EN HAUT · ' + pl.largeur + "×" + pl.hauteur + " BLOCS · DE X " + pl.x0 + " Z " + pl.z0 + "</p>";
    z.innerHTML = html;
    brancherPlan();
  }

  function listeElements() {
    if (!plan.elements) return "";
    var els = visibles().filter(function (e) { return e.type !== "quartier" || plan.recherche; });
    if (!els.length) return '<div class="card" style="padding:14px"><p class="sub" style="margin:0">Rien à afficher avec ces filtres.</p></div>';
    var ordre = { propriete: 0, pnj: 1, boutique: 2, waystone: 3, quartier: 4 };
    els.sort(function (a, b) { return ordre[a.type] - ordre[b.type] || String(a.nom).localeCompare(b.nom); });
    var html = '<div class="card" style="padding:4px 14px">', max = 40;
    els.slice(0, max).forEach(function (e) {
      var i = e.infos || {}, t = TYPES[e.type], sous = "";
      if (e.type === "propriete") sous = (CATS[e.categorie] || {}).nom + " · " + (e.categorie === "atelier" ? (i.metier || "atelier") : i.libre ? "à vendre, " + (i.prix || 0) + " MC" : i.proprietaire);
      else if (e.type === "boutique") sous = (i.lot || 1) + " pour " + (i.prix || 0) + " MC · " + (i.proprietaire || "");
      else if (e.type === "pnj") sous = "PNJ";
      else if (e.type === "waystone") sous = i.genre === "sharestone" ? "Sharestone" : "Waystone";
      else sous = "Quartier";
      var coul = e.type === "propriete" ? (CATS[e.categorie] || CATS.maison).coul : t.coul;
      html += '<button class="grligne" onclick="GRIM.element(\'' + h(e.id) + '\',true)"><span class="grrond" style="background:' + coul + '">' + t.ic + "</span>" +
        '<span style="flex:1;text-align:left;min-width:0"><b>' + h(e.nom) + "</b><small>" + h(sous) + '</small></span><span class="chev">›</span></button>';
    });
    if (els.length > max) html += '<p class="sub" style="font-size:12px;margin:8px 0 10px">… et ' + (els.length - max) + " autres : affine la recherche.</p>";
    return html + "</div>";
  }

  function ficheElement(e) {
    var i = e.infos || {}, t = TYPES[e.type], lignes = [], titre = t.nom.replace(/s$/, "");
    function bloc(k, v) { lignes.push("<div><span>" + k + "</span><b>" + v + "</b></div>"); }
    if (e.type === "propriete") {
      var c = CATS[e.categorie] || { nom: e.categorie };
      titre = c.nom;
      if (e.categorie === "atelier") {
        bloc("Métier", h(i.metier || "—"));
        bloc("Artisans", (i.artisans && i.artisans.length) ? i.artisans.map(h).join(", ") : "aucun");
      } else if (i.libre) {
        bloc("Statut", '<span style="color:var(--live)">À vendre</span>');
        bloc("Prix", (i.prix || 0) + " MC");
      } else {
        bloc("Propriétaire", '<img src="https://mc-heads.net/avatar/' + encodeURIComponent(i.proprietaire || "") + '/32" alt=""> ' + h(i.proprietaire || "?"));
        bloc("Depuis", i.achete_le ? dateFr(i.achete_le) : "—");
      }
      bloc("Surface", (i.surface || 0) + " blocs");
      if (e.categorie === "appartement" && i.y0 != null) bloc("Hauteur", "Y " + i.y0 + " → " + i.y1);
      else if (i.style) bloc("Style", h(i.style));
    } else if (e.type === "boutique") {
      titre = "Boutique";
      bloc("Vend", h(e.nom));
      bloc("Prix", (i.lot || 1) + " pour " + (i.prix || 0) + " MC");
      bloc("Vendeur", '<img src="https://mc-heads.net/avatar/' + encodeURIComponent(i.proprietaire || "") + '/32" alt=""> ' + h(i.proprietaire || "?"));
    } else if (e.type === "waystone") {
      titre = i.genre === "sharestone" ? "Sharestone" : "Waystone";
      if (i.visibilite) bloc("Accès", i.visibilite === "global" ? "Pour tous" : i.visibilite === "activation" ? "À activer en jeu" : h(i.visibilite));
    } else if (e.type === "pnj") {
      titre = "PNJ";
    }
    var y = i.y != null ? " · Y " + i.y : "";
    bloc("Position", "X " + e.x + " · Z " + e.z + y);
    var sousTitre = e.type === "propriete" && e.categorie !== "atelier" && i.libre ? '<p class="sub" style="margin:10px 0 0">Pour l\'acheter : entre dans la parcelle en jeu et clique sur [Acheter], ou /maison acheter.</p>' : "";
    return '<div class="card grfiche"><div class="grfh"><div style="flex:1"><div class="eyebrow">' + h(titre) + '</div><h3>' + h(e.nom) + '</h3></div><button class="icobtn" onclick="GRIM.element(null)">✕</button></div>' +
      '<div class="grfgrid">' + lignes.join("") + "</div>" + sousTitre +
      '<button class="btn ghost" style="width:100%;margin-top:10px" onclick="GRIM.copier(' + e.x + "," + e.z + ')">Copier les coordonnées</button></div>';
  }

  // déplacement (un doigt), zoom (deux doigts ou molette), toucher un repère
  function brancherPlan() {
    var s = q("#grplansvg");
    if (!s) return;
    var points = {}, depart = null, deplace = false, cibleDepart = null;
    function maj() { s.setAttribute("viewBox", plan.vue.x + " " + plan.vue.y + " " + plan.vue.w + " " + plan.vue.h); }
    function etat() {
      var ids = Object.keys(points), r = s.getBoundingClientRect();
      if (ids.length === 1) { var p = points[ids[0]]; return { x: p.x, y: p.y, d: 0, r: r }; }
      var a = points[ids[0]], b = points[ids[1]];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), r: r };
    }
    s.addEventListener("pointerdown", function (e) {
      if (!Object.keys(points).length) { var c0 = e.target.closest ? e.target.closest("[data-id]") : null; cibleDepart = c0 ? c0.getAttribute("data-id") : null; }
      points[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { s.setPointerCapture(e.pointerId); } catch (x) {}
      depart = { e: etat(), v: { x: plan.vue.x, y: plan.vue.y, w: plan.vue.w, h: plan.vue.h } };
      if (Object.keys(points).length === 1) deplace = false;
    });
    s.addEventListener("pointermove", function (e) {
      if (!points[e.pointerId] || !depart) return;
      points[e.pointerId] = { x: e.clientX, y: e.clientY };
      var n = etat(), d0 = depart.e, v0 = depart.v;
      var k = v0.w / n.r.width;
      var f = d0.d > 0 && n.d > 0 ? d0.d / n.d : 1;
      var w = Math.max(32, Math.min(v0.w * f, 4096)), hh = v0.h * (w / v0.w);
      // le point sous les doigts reste sous les doigts
      var px = v0.x + (d0.x - n.r.left) * k, py = v0.y + (d0.y - n.r.top) * (v0.h / n.r.height);
      var k2 = w / n.r.width;
      plan.vue = { x: px - (n.x - n.r.left) * k2, y: py - (n.y - n.r.top) * (hh / n.r.height), w: w, h: hh };
      if (Math.abs(n.x - d0.x) + Math.abs(n.y - d0.y) > 6 || f !== 1) deplace = true;
      maj();
    });
    function fin(e) {
      var zoome = Object.keys(points).length > 1;
      delete points[e.pointerId];
      if (Object.keys(points).length) { depart = { e: etat(), v: { x: plan.vue.x, y: plan.vue.y, w: plan.vue.w, h: plan.vue.h } }; return; }
      depart = null;
      if (zoome || (deplace && Math.abs(plan.vue.w - (plan._wDessin || 0)) > 1)) afficherPlanSvg();
    }
    ["pointerup", "pointercancel"].forEach(function (n) { s.addEventListener(n, fin); });
    s.addEventListener("click", function (e) {
      if (deplace) { e.preventDefault(); return; }
      GRIM.element(cibleDepart);
    });
    s.addEventListener("wheel", function (e) { e.preventDefault(); GRIM.zoomPlan(e.deltaY > 0 ? 1.15 : 0.87); }, { passive: false });
    plan._wDessin = plan.vue.w;
  }

  /** Redessine seulement la carte (tailles des repères adaptées au zoom). */
  function afficherPlanSvg() {
    var m = q(".grplanmap"), pl = planDe(plan.cle);
    if (!m || !pl || !plan.elements) return;
    var ancien = q("#grplansvg");
    var tmp = document.createElement("div");
    tmp.innerHTML = svgPlan(pl);
    if (ancien) ancien.replaceWith(tmp.firstChild); else m.insertBefore(tmp.firstChild, m.firstChild);
    brancherPlan();
  }

  // ─── API pour les boutons ────────────────────────────────────────────────
  window.GRIM = {
    ouvrir: function (cle) { ouverte = ouverte === cle ? null : cle; afficherQuetes(); },
    actualiser: function () { notif("↻ Mise à jour du grimoire…"); charger(true); },
    connexion: function () { if (window.DM && DM.connexion) DM.connexion(); else go("msg"); },
    ville: function (cle, centrer) {
      villeChoisie = cle;
      if (cle && centrer && vue) {
        var v = villesPlacees().filter(function (x) { return x.cle === cle; })[0];
        if (v) { vue.x = v.x - vue.w / 2; vue.y = v.z - vue.h / 2; }
      }
      afficherCarte();
      if (cle) setTimeout(function () { var f = q(".grfiche"); if (f) f.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 60);
    },
    zoom: zoom,
    recentrer: function () { vue = null; afficherCarte(); },
    plan: function (cle) { ouvrirPlan(cle); },
    fermerPlan: function () { plan.cle = null; plan.elements = null; afficherCarte(); },
    fond: function (f) { plan.fond = f; afficherPlan(); },
    filtre: function (k) { plan.filtres[k] = !plan.filtres[k]; afficherPlan(); },
    aVendre: function () { plan.aVendre = !plan.aVendre; if (plan.aVendre) plan.filtres.propriete = true; afficherPlan(); },
    chercher: function (t) { plan.recherche = t; var l = q("#grliste"); if (l) l.innerHTML = listeElements(); afficherPlanSvg(); },
    element: function (id, centrer) {
      plan.choisi = id;
      var e = (plan.elements || []).filter(function (x) { return x.id === id; })[0];
      if (e && centrer) {
        var w = Math.min(plan.vue.w, 160), hh = plan.vue.h * (w / plan.vue.w);
        plan.vue = { x: e.x - w / 2, y: e.z - hh / 2, w: w, h: hh };
      }
      var y = window.scrollY;
      afficherPlan();
      if (e) setTimeout(function () { var f = q(centrer ? ".grplanmap" : ".grfiche"); if (f) f.scrollIntoView({ behavior: "smooth", block: centrer ? "start" : "nearest" }); }, 60);
    },
    zoomPlan: function (f) {
      var v = plan.vue; if (!v) return;
      var cx = v.x + v.w / 2, cy = v.y + v.h / 2, w = Math.max(32, Math.min(v.w * f, 4096)), hh = v.h * (w / v.w);
      plan.vue = { x: cx - w / 2, y: cy - hh / 2, w: w, h: hh };
      afficherPlanSvg();
    },
    recentrerPlan: function () { var pl = planDe(plan.cle); if (pl) { plan.vue = { x: pl.x0, y: pl.z0, w: pl.largeur, h: pl.hauteur }; afficherPlanSvg(); } },
    copier: function (x, z) {
      var t = x + " ~ " + z;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { notif("✓ Coordonnées copiées : " + t); }, function () { notif("X " + x + " · Z " + z); });
    }
  };

  // ─── Style ───────────────────────────────────────────────────────────────
  var css = [
    ".grprog,.grlien{display:flex;align-items:center;gap:14px;padding:14px;margin-bottom:14px}",
    ".grprog .ring{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--violet) calc(var(--p)*1%),rgba(255,255,255,.08) 0);position:relative;flex:none}",
    ".grprog .ring::before{content:'';position:absolute;inset:5px;border-radius:50%;background:var(--bg2)}",
    ".grprog .ring span{position:relative;font-family:'Pixelify Sans';font-size:14px}",
    ".grlien code{font-family:'Pixelify Sans';color:var(--ice)}",
    ".grchap{padding:14px;margin-bottom:12px}",
    ".grchap.ferme{opacity:.72}",
    ".grchead{display:flex;align-items:flex-start;gap:10px}",
    ".grchead h3{font-size:18px;margin:2px 0 0}",
    ".grcpt{font-family:'Pixelify Sans';font-size:13px;color:var(--mute);padding:4px 9px;border-radius:10px;background:rgba(255,255,255,.06)}",
    ".grequipe{color:var(--gold)}",
    ".grdesc{font-size:13px;margin:8px 0 2px}",
    ".grverrou{font-size:12.5px;margin:6px 0 0;color:var(--dim)}",
    ".grliste{margin-top:10px;display:flex;flex-direction:column;gap:6px}",
    ".grq{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.035);border:1px solid var(--line);text-align:left;width:100%}",
    ".grq .chev{color:var(--dim);transition:transform .25s;margin-top:2px}",
    ".grq.open .chev{transform:rotate(90deg)}",
    ".grico{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:13px;background:rgba(255,255,255,.06);color:var(--mute);font-family:'Pixelify Sans'}",
    ".grq.faite .grico{background:rgba(126,224,160,.18);color:var(--live)}",
    ".grq.reclamer .grico{background:rgba(240,192,96,.2);color:var(--gold)}",
    ".grq.encours{border-color:rgba(192,132,252,.45);box-shadow:0 0 18px rgba(192,132,252,.15)}",
    ".grq.encours .grico{background:rgba(192,132,252,.22);color:var(--ice)}",
    ".grq.verrou{opacity:.55}",
    ".grtxt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
    ".grtxt b{font-size:14.5px}",
    ".grq.faite .grtxt b{color:var(--mute)}",
    ".grtxt small{color:var(--dim);font-size:12px}",
    ".grtxt em{font-style:normal;font-size:11px;letter-spacing:.04em;color:var(--mute)}",
    ".grq.reclamer .grtxt em{color:var(--gold)}",
    ".grq.encours .grtxt em{color:var(--ice)}",
    ".grdet{display:block;margin-top:8px;font-size:13px;line-height:1.5;color:#ddd0f2}",
    ".grdet i{display:block;margin-top:6px;color:var(--live);font-style:normal;font-size:12px}",
    ".grrecit{display:block}",
    ".grdial{display:block;margin-top:8px;padding:8px 10px;border-left:2px solid var(--gold);background:rgba(240,192,96,.06);border-radius:0 10px 10px 0;font-style:italic;color:#f3e3c0}",
    ".grdial i{display:block;margin-top:3px;font-size:11.5px;color:var(--gold)!important}",
    ".grsec{display:block;margin:10px 0 5px;font-family:'Pixelify Sans';font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ice)}",
    ".grobjs{display:flex;flex-direction:column;gap:5px}",
    ".grobj{display:flex;gap:8px;align-items:flex-start}",
    ".grobj b{flex:none;width:17px;height:17px;border-radius:5px;border:1.5px solid var(--line);display:grid;place-items:center;font-size:11px;margin-top:1px}",
    ".grobj.neutre b{border:0;color:var(--dim)}",
    ".grobj.ok b{background:rgba(126,224,160,.2);border-color:var(--live);color:var(--live)}",
    ".grobj.ok>span{color:var(--mute);text-decoration:line-through;text-decoration-color:rgba(255,255,255,.25)}",
    ".grobj small{color:var(--dim);font-size:11.5px}",
    ".grrecs{display:flex;flex-wrap:wrap;gap:6px}",
    ".grrecs span{padding:4px 9px;border-radius:9px;background:rgba(240,192,96,.12);border:1px solid rgba(240,192,96,.3);color:#f3e3c0;font-size:12.5px}",
    ".grinfo{text-align:center;padding:26px 18px}",
    ".grcarte{padding:8px}",
    ".grmap{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:5/4;background:#d9c08f;touch-action:none}",
    ".grmap svg{width:100%;height:100%;display:block;user-select:none;-webkit-user-select:none}",
    ".grville:hover path{filter:brightness(1.15)}",
    ".grzoom{position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px}",
    ".grzoom button{width:34px;height:34px;border-radius:10px;background:rgba(28,15,46,.85);border:1px solid var(--line);color:var(--ink);font-size:18px}",
    ".grfiche{padding:14px;margin-top:12px}",
    ".grfh{display:flex;align-items:flex-start;gap:10px}",
    ".grfh h3{font-size:19px;margin:2px 0 0}",
    ".grfgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}",
    ".grfgrid div{padding:10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line)}",
    ".grfgrid span{display:block;font-size:11px;color:var(--dim);letter-spacing:.05em;text-transform:uppercase}",
    ".grfgrid b{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:14px;margin-top:3px}",
    ".grfgrid b small{width:100%;font-weight:400;color:var(--dim);font-size:11.5px}",
    ".grfgrid img{width:20px;height:20px;border-radius:4px;image-rendering:pixelated}",
    ".grligne{display:flex;align-items:center;gap:12px;width:100%;padding:11px 0;border-bottom:1px solid var(--line)}",
    ".grligne:last-child{border-bottom:0}",
    ".grligne small{display:block;color:var(--dim);font-size:12px}",
    ".grplanchip{font-family:'Pixelify Sans';font-size:11px;color:var(--ice);padding:3px 8px;border-radius:8px;background:rgba(192,132,252,.15);margin-right:6px}",
    ".grbtns{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px}",
    ".grbtns .btn{width:100%}",
    ".grplanhead{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}",
    ".grplanhead h3{font-size:19px;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".grfond{display:flex;padding:3px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid var(--line)}",
    ".grfond button{padding:7px 10px;border-radius:9px;font-size:12.5px;color:var(--mute)}",
    ".grfond button.on{background:rgba(192,132,252,.22);color:var(--ink)}",
    ".grfiltres{display:flex;gap:6px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:none}",
    ".grfiltres::-webkit-scrollbar{display:none}",
    ".grfil{flex:none;display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--dim);font-size:13px}",
    ".grfil span{color:var(--c);font-size:12px}",
    ".grfil b{font-family:'Pixelify Sans';font-weight:400;font-size:11.5px;opacity:.75}",
    ".grfil.on{color:var(--ink);border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}",
    ".grplanmap{background:#141019;max-height:64vh;margin:0 auto}",
    ".grplanmap .grzone,.grplanmap .grrep{cursor:pointer}",
    ".grnote{position:absolute;left:8px;top:8px;right:54px;padding:6px 9px;border-radius:9px;background:rgba(28,15,46,.85);font-size:11.5px;color:var(--mute)}",
    ".grlegende{display:flex;flex-wrap:wrap;gap:6px 12px;padding:10px 4px 2px;font-size:11.5px;color:var(--mute)}",
    ".grlegende span{display:flex;align-items:center;gap:5px}",
    ".grlegende i{width:11px;height:11px;border-radius:3px;display:inline-block}",
    ".grlegende i.libre{border:1.5px dashed var(--live)}",
    ".grrech{margin:14px 0 10px}",
    ".grrech input{width:100%;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);font:inherit;font-size:14px}",
    ".grrond{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#1c0f2e;font-size:13px;font-weight:700;flex:none}",
    "@media(min-width:560px){.grbtns{grid-template-columns:1fr 1fr}}",
    "@media(max-width:559px){.grfond{width:100%}.grfond button{flex:1}}",
    ".grpin{width:12px;height:12px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);flex:none}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
})();
