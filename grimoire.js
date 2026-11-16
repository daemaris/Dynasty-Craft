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

  var donnees = { chapitres: null, quetes: [], etats: {}, villes: null, charge: false, erreur: false };
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
      moi ? sb.from("quetes_etats").select("cle,fini,reclame,fin_le") : Promise.resolve({ data: [] }),
      sb.from("villes_carte").select("*")
    ]).then(function (r) {
      if (r[0].error || r[1].error || r[3].error) throw new Error("lecture");
      donnees.chapitres = r[0].data || [];
      donnees.quetes = r[1].data || [];
      donnees.etats = {};
      (r[2].data || []).forEach(function (e) { donnees.etats[e.cle] = e; });
      donnees.villes = r[3].data || [];
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
  function fini(cle) { return !!donnees.etats[cle]; }

  function chapitreFini(id) {
    var qs = donnees.quetes.filter(function (x) { return x.chapitre === id; });
    return qs.length > 0 && qs.every(function (x) { return fini(x.cle); });
  }

  /** État d'une quête : faite, à réclamer, en cours, verrouillée. */
  function statut(quete, chapitreOuvert) {
    var e = donnees.etats[quete.cle];
    if (e) return e.reclame ? "faite" : "reclamer";
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
        var meta = [x.lieu, x.pnj].filter(Boolean).join(" · ");
        var deplie = ouverte === x.cle;
        var cache = st === "verrou";
        html += '<button class="grq ' + st + (deplie ? " open" : "") + '" onclick="GRIM.ouvrir(\'' + h(x.cle) + '\')">' +
          '<span class="grico">' + ico + '</span><span class="grtxt"><b>' + h(x.titre) + '</b>' +
          (meta ? "<small>" + h(meta) + "</small>" : "") + (etiquette ? '<em>' + etiquette + "</em>" : "") +
          (deplie ? '<span class="grdet">' + (cache ? "Le grimoire garde encore ses secrets… termine les quêtes précédentes." : h(x.description || "Pas de description.").replace(/\n/g, "<br>")) +
            (donnees.etats[x.cle] && donnees.etats[x.cle].fin_le ? '<i>Terminée le ' + dateFr(donnees.etats[x.cle].fin_le) + "</i>" : "") + "</span>" : "") +
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

    var liste = (donnees.villes || []).slice().sort(function (a, b) { return (b.habitants || 0) - (a.habitants || 0) || String(a.nom).localeCompare(b.nom); });
    if (liste.length) {
      html += "<h2>Les villes</h2><div class=\"card\" style=\"padding:4px 14px\">";
      liste.forEach(function (x) {
        html += '<button class="grligne" onclick="GRIM.ville(\'' + h(x.cle) + '\',true)"><span class="grpin" style="background:' + (x.fermee ? "#8a5a9e" : x.reservee ? "#9c8a6a" : "#7c3aed") + '"></span>' +
          '<span style="flex:1;text-align:left"><b>' + h(x.nom) + '</b><small>' + (x.habitants || 0) + " habitant" + ((x.habitants || 0) > 1 ? "s" : "") +
          (x.fermee ? " · sur invitation" : "") + (x.reservee ? " · en attente de son chef" : "") + "</small></span><span class=\"chev\">›</span></button>";
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
      '<button class="btn ghost" style="width:100%;margin-top:10px" onclick="GRIM.copier(' + v.x + "," + v.z + ')">Copier les coordonnées</button></div>';
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
    ".grpin{width:12px;height:12px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);flex:none}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
})();
