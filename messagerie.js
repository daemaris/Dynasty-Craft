/* ═══════════════════════════════════════════════════════════════════════════
   Dynasty Craft — messagerie (bêta)
   Supabase : connexion Discord, liaison du compte Minecraft (/message lier),
   conversations privées, canal de ville, signalements, blocages, modération.
   La clé ci-dessous est la clé PUBLIQUE (publishable) : elle peut être vue par tous.
   La sécurité est assurée par les règles de la base (RLS), pas par la clé.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var SUPABASE_URL = "https://scnrploqmsylzffepsqp.supabase.co";
  var SUPABASE_CLE = "sb_publishable_JuE_2JTuFA85y0k2v4_4xQ_xmDiqdqW";

  var sb = null;
  var etat = {
    user: null,      // utilisateur Supabase (Discord)
    profil: null,    // ligne profils
    moi: null,       // UUID Minecraft relié (null = pas relié)
    moiPseudo: null,
    convs: [],
    ouverte: null,   // conversation affichée
    vus: {},         // ids de messages déjà affichés dans la conversation ouverte
    pseudos: {},     // mc_uuid → pseudo
    canal: null,
    nonLus: 0
  };

  function q(s) { return document.querySelector(s); }
  function h(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function notif(t) { try { toast(t); } catch (e) {} }
  function vibrer() { try { buzz(); } catch (e) {} }
  function heure(iso) {
    try {
      var d = new Date(iso), n = new Date();
      if (d.toDateString() === n.toDateString()) return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    } catch (e) { return ""; }
  }
  function tete(pseudo, taille) {
    return "https://mc-heads.net/avatar/" + encodeURIComponent(pseudo || "MHF_Steve") + "/" + (taille || 64);
  }
  var STATUTS = {
    vide: "Ton message est vide.",
    trop_long: "Message trop long (500 caractères maximum).",
    trop_vite: "Doucement ! Attends quelques secondes.",
    banni: "Tu n'as plus accès à la messagerie.",
    pas_membre: "Tu ne fais pas partie de cette conversation.",
    bloque: "Impossible : l'un de vous a bloqué l'autre.",
    compte_non_lie: "Relie d'abord ton compte Minecraft.",
    inconnu: "Joueur inconnu : il doit s'être connecté au serveur au moins une fois.",
    soi_meme: "Tu ne peux pas t'écrire à toi-même."
  };
  function texteStatut(s) { return STATUTS[s] || "Une erreur est survenue. Réessaie dans un instant."; }

  // ─── Démarrage ───────────────────────────────────────────────────────────
  function demarrer() {
    injecterStyle();
    if (!window.supabase || !window.supabase.createClient) {
      zone('<div class="card dmcard"><b>Messagerie indisponible</b><p class="sub">Impossible de charger la messagerie. Vérifie ta connexion internet puis recharge la page.</p></div>');
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_CLE, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    sb.auth.onAuthStateChange(function (evt, session) {
      var u = session ? session.user : null;
      var change = (u && u.id) !== (etat.user && etat.user.id);
      etat.user = u;
      if (change) charger();
    });
    sb.auth.getSession().then(function (r) {
      etat.user = r.data && r.data.session ? r.data.session.user : null;
      charger();
      try {
        if (sessionStorage.getItem("dc_apres_connexion") === "1") {
          sessionStorage.removeItem("dc_apres_connexion");
          setTimeout(function () { go("msg"); }, 600);
        }
      } catch (e) {}
    });
    setInterval(function () { if (etat.moi && document.visibilityState === "visible") rafraichirListe(); }, 30000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && etat.moi) rafraichirListe(); });
  }

  function zone(html) { var z = q("#dmZone"); if (z) z.innerHTML = html; }

  /** Prévient le reste de l'app (quêtes du grimoire…) que le compte a changé. */
  function signalerCompte() {
    try { document.dispatchEvent(new CustomEvent("dynasty:compte", { detail: { user: etat.user, moi: etat.moi, pseudo: etat.moiPseudo } })); } catch (e) {}
  }
  window.DynastyCompte = {
    client: function () { return sb; },
    user: function () { return etat.user; },
    moi: function () { return etat.moi; },
    pseudo: function () { return etat.moiPseudo; }
  };

  function charger() {
    if (!etat.user) {
      etat.profil = null; etat.moi = null; etat.moiPseudo = null; arreterTempsReel(); badge(0);
      q("#dmNew").hidden = true; q("#dmMod").hidden = true;
      signalerCompte();
      return ecranConnexion();
    }
    zone('<div class="empty">Chargement…</div>');
    Promise.all([
      sb.from("profils").select("*").eq("id", etat.user.id).maybeSingle(),
      sb.rpc("mon_mc")
    ]).then(function (r) {
      etat.profil = r[0].data || null;
      etat.moi = r[1].data || null;
      var staff = etat.profil && (etat.profil.role === "staff" || etat.profil.role === "creatrice");
      q("#dmMod").hidden = !staff;
      if (etat.profil && etat.profil.banni) {
        q("#dmNew").hidden = true;
        return zone(carteCompte() + '<div class="card dmcard"><b>Accès suspendu</b><p class="sub">Ton accès à la messagerie a été suspendu par le staff. Contacte-nous sur le Discord si tu penses que c\'est une erreur.</p></div>');
      }
      if (!etat.moi) { q("#dmNew").hidden = true; signalerCompte(); return ecranLiaison(); }
      return sb.from("joueurs").select("pseudo").eq("mc_uuid", etat.moi).maybeSingle().then(function (j) {
        etat.moiPseudo = j.data ? j.data.pseudo : null;
        if (etat.moiPseudo) {
          etat.pseudos[etat.moi] = etat.moiPseudo;
          try { if (!prof.pseudo) { prof.pseudo = etat.moiPseudo; store.set("profil", prof); applyProfile(); } } catch (e) {}
        }
        if (etat.profil && etat.profil.pronoms) {
          try { if (!prof.pr) { prof.pr = { elle: "f", il: "m", neutre: "n" }[etat.profil.pronoms]; store.set("profil", prof); applyProfile(); } } catch (e) {}
        }
        q("#dmNew").hidden = false;
        signalerCompte();
        demarrerTempsReel();
        rafraichirListe();
      });
    }).catch(function () {
      zone('<div class="card dmcard"><b>Oups</b><p class="sub">La messagerie ne répond pas. Réessaie dans un instant.</p></div>');
    });
  }

  // ─── Écrans ──────────────────────────────────────────────────────────────
  function ecranConnexion() {
    zone(
      '<div class="card dmhero"><div class="soon">BÊTA</div><div style="font-size:50px;margin:4px 0 8px">🪶</div>' +
      '<h3 style="font-size:20px">Les Corbeaux du Coven</h3>' +
      '<p class="sub" style="margin:8px 0 16px">Écris aux autres joueurs, discute avec ta ville et reçois tes messages directement dans Minecraft, même hors ligne.</p>' +
      '<button class="btn dmdiscord" onclick="DM.connexion()"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9 0 13.6.3 18.1a19.8 19.8 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14 14 0 0 0 11.8 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.7-3.4-13.7zM8.7 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4zm6.6 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4z"/></svg> Se connecter avec Discord</button>' +
      '<p class="sub" style="font-size:12px;margin:14px 0 0">En te connectant, tu acceptes la <a href="#" onclick="event.preventDefault();DM.charte()">charte de la messagerie</a> et la <a href="#" onclick="event.preventDefault();DM.confidentialite()">politique de confidentialité</a>.</p></div>' +
      '<div class="card ingame"><span style="font-size:22px">🕯️</span><div><b>Lié au jeu.</b> En jeu, tape <code>/message</code> pour lire tes messages et <code>/message envoyer &lt;joueur&gt; &lt;texte&gt;</code> pour répondre.</div></div>'
    );
  }

  function carteCompte() {
    var p = etat.profil || {};
    var nom = p.pseudo_discord || "Compte Discord";
    var av = p.avatar_url ? '<img src="' + h(p.avatar_url) + '" alt="">' : "☾";
    return '<button class="card dmcompte" onclick="DM.compte()"><span class="dmav">' + av + '</span><span style="flex:1;min-width:0;text-align:left"><b>' + h(nom) + '</b><small>' +
      (etat.moiPseudo ? "Minecraft : " + h(etat.moiPseudo) : "Compte Minecraft non relié") + '</small></span><span class="chev">⚙</span></button>';
  }

  function ecranLiaison() {
    zone(carteCompte() +
      '<div class="card dmcard"><b style="font-family:Cinzel;font-size:17px">Relier ton compte Minecraft</b>' +
      '<ol class="gsteps" style="margin-top:8px"><li>Connecte-toi au serveur Dynasty Craft.</li><li>Dans le tchat, tape <code>/message lier</code>.</li><li>Entre ici le code à 6 caractères (valable 10 minutes).</li></ol>' +
      '<form onsubmit="DM.lier(event)" class="dmcode"><input id="dmCode" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="ABC123"><button class="btn" type="submit">Relier</button></form>' +
      '<p class="sub" id="dmCodeErr" style="color:var(--blood);margin:8px 0 0"></p></div>');
  }

  function rafraichirListe() {
    if (!etat.moi) return;
    sb.rpc("mes_conversations").then(function (r) {
      if (r.error) throw r.error;
      etat.convs = r.data || [];
      var total = 0;
      etat.convs.forEach(function (c) { total += Number(c.non_lus || 0); });
      badge(total);
      afficherListe();
    }).catch(function () {});
  }

  function afficherListe() {
    var html = carteCompte() + '<div class="convs">';
    if (!etat.convs.length) {
      html += '<div class="card dmcard" style="text-align:center"><div style="font-size:40px">🕊️</div><b>Aucune conversation</b><p class="sub">Écris à un joueur avec le bouton ✎ en haut. Le canal de ta ville apparaîtra ici dès que tu habites une ville.</p><button class="btn" style="margin-top:10px" onclick="DM.nouveau()">Nouveau message</button></div>';
    }
    etat.convs.forEach(function (c) {
      var ville = c.type === "ville";
      var titre = ville ? (c.titre || "Ma ville") : (c.autre_pseudo || "?");
      var av = ville ? '<div class="av dmville">♜</div>' : '<div class="av"><img src="' + h(tete(c.autre_pseudo)) + '" alt="" loading="lazy"></div>';
      var apercu = c.dernier_contenu ? ((c.dernier_auteur === etat.moiPseudo ? "Toi : " : (ville ? (c.dernier_auteur || "") + " : " : "")) + c.dernier_contenu) : "Aucun message pour l'instant";
      html += '<button class="card cv" onclick="DM.ouvrir(\'' + h(c.conversation_id) + '\')">' + av +
        '<div class="mid"><b>' + h(titre) + (ville ? ' <span class="tag">VILLE</span>' : "") + '</b><small>' + h(apercu) + '</small></div>' +
        '<div class="rt">' + h(c.dernier_le ? heure(c.dernier_le) : "") + (Number(c.non_lus) ? '<br><span class="badge">' + Number(c.non_lus) + '</span>' : "") + '</div></button>';
    });
    html += '</div><p class="sub" style="font-size:12px;text-align:center;margin-top:14px">Bêta · <a href="#" onclick="event.preventDefault();DM.charte()">Charte</a> · <a href="#" onclick="event.preventDefault();DM.confidentialite()">Confidentialité</a></p>';
    zone(html);
  }

  function badge(n) {
    etat.nonLus = n;
    var b = q("#mbdg");
    if (b) b.hidden = !(n > 0);
  }

  // ─── Connexion / liaison ─────────────────────────────────────────────────
  function connexion() {
    vibrer();
    try { sessionStorage.setItem("dc_apres_connexion", "1"); } catch (e) {}
    sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.origin + "/" } })
      .then(function (r) { if (r.error) notif("Connexion impossible : " + r.error.message); });
  }

  function lier(e) {
    e.preventDefault();
    var code = (q("#dmCode").value || "").trim().toUpperCase();
    var err = q("#dmCodeErr");
    if (code.length !== 6) { err.textContent = "Le code fait 6 caractères."; return; }
    err.textContent = "";
    sb.rpc("lier_compte", { p_code: code }).then(function (r) {
      var s = r.data;
      if (s === "ok") { notif("✓ Compte Minecraft relié !"); charger(); }
      else if (s === "code_invalide") err.textContent = "Code invalide ou expiré. Retape /message lier en jeu pour en avoir un nouveau.";
      else if (s === "deja_lie") err.textContent = "Ce compte Minecraft est déjà relié à un autre compte Discord.";
      else if (s === "banni") err.textContent = "Ton accès à la messagerie a été suspendu.";
      else err.textContent = "Une erreur est survenue. Réessaie.";
    });
  }

  // ─── Conversation ────────────────────────────────────────────────────────
  function pseudosDe(ids) {
    var manque = ids.filter(function (id) { return id && !etat.pseudos[id]; });
    if (!manque.length) return Promise.resolve();
    return sb.from("joueurs").select("mc_uuid,pseudo").in("mc_uuid", manque).then(function (r) {
      (r.data || []).forEach(function (j) { etat.pseudos[j.mc_uuid] = j.pseudo; });
    });
  }

  function ouvrir(id) {
    vibrer();
    var c = etat.convs.filter(function (x) { return x.conversation_id === id; })[0];
    if (!c) return;
    etat.ouverte = c; etat.vus = {};
    var ville = c.type === "ville";
    q("#cav").innerHTML = ville ? "♜" : '<img src="' + h(tete(c.autre_pseudo)) + '" alt="">';
    q("#cav").className = "av" + (ville ? " dmville" : "");
    q("#cname").textContent = ville ? (c.titre || "Ma ville") : (c.autre_pseudo || "?");
    q("#cstat").textContent = ville ? "Canal de ville" : "Reçoit tes messages en jeu, même hors ligne";
    q("#cstat").style.color = "var(--dim)";
    q("#msgs").innerHTML = '<div class="m sys">Chargement…</div>';
    q("#chat").classList.add("on");
    sb.from("messages").select("id,auteur_mc,contenu,source,cree_le").eq("conversation_id", id).order("id", { ascending: false }).limit(60)
      .then(function (r) {
        var rows = (r.data || []).reverse();
        return pseudosDe(rows.map(function (m) { return m.auteur_mc; })).then(function () {
          q("#msgs").innerHTML = rows.length ? "" : '<div class="m sys">Début de la conversation</div>';
          rows.forEach(function (m) { ajouterMessage(m, false); });
          marquerLu();
        });
      });
    setTimeout(function () { var i = q("#mi"); if (i && !("ontouchstart" in window)) i.focus(); }, 300);
  }

  function ajouterMessage(m, anime) {
    if (etat.vus[m.id]) return;
    etat.vus[m.id] = true;
    var moi = m.auteur_mc === etat.moi;
    var d = document.createElement("div");
    d.className = "m " + (moi ? "me" : "them");
    if (!anime) d.style.animation = "none";
    var qui = (!moi && etat.ouverte && etat.ouverte.type === "ville") ? '<span class="dmqui">' + h(etat.pseudos[m.auteur_mc] || "?") + "</span>" : "";
    d.innerHTML = qui + h(m.contenu) + "<small>" + h(heure(m.cree_le)) + (m.source === "jeu" ? " · en jeu" : "") + "</small>";
    if (!moi) { d.title = "Toucher pour signaler"; d.onclick = function () { menuMessage(m); }; }
    var box = q("#msgs");
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function marquerLu() {
    var c = etat.ouverte;
    if (!c) return;
    var max = 0;
    Object.keys(etat.vus).forEach(function (k) { max = Math.max(max, Number(k)); });
    if (!max) return;
    sb.rpc("marquer_lu", { p_conv: c.conversation_id, p_jusqua: max }).then(function () { rafraichirListe(); });
  }

  function fermer() {
    q("#chat").classList.remove("on");
    etat.ouverte = null;
    rafraichirListe();
  }

  function envoyer(e) {
    e.preventDefault();
    var c = etat.ouverte, inp = q("#mi");
    var t = (inp.value || "").trim();
    if (!c || !t) return;
    if (t.length > 500) { notif("500 caractères maximum"); return; }
    vibrer();
    inp.value = "";
    sb.rpc("envoyer_message", { p_conv: c.conversation_id, p_contenu: t }).then(function (r) {
      var row = r.data && r.data[0];
      if (!row || row.statut !== "ok") { inp.value = t; notif(texteStatut(row ? row.statut : null)); return; }
      ajouterMessage({ id: row.message_id, auteur_mc: etat.moi, contenu: t, source: "app", cree_le: new Date().toISOString() }, true);
      marquerLu();
    });
  }

  function nouveau() {
    ouvrirSheet('<div class="top" style="margin-bottom:12px"><div><div class="eyebrow">Nouveau corbeau</div><h3 style="font-size:20px">À qui écris-tu ?</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div>' +
      '<form onsubmit="DM.nouveauOk(event)"><label class="fl">Pseudo Minecraft<input id="dmPseudo" maxlength="16" autocomplete="off" placeholder="Ex. : Brokk"></label>' +
      '<p class="sub" id="dmPseudoErr" style="color:var(--blood);margin:0 0 10px"></p><button class="btn" style="width:100%" type="submit">Ouvrir la conversation</button></form>' +
      '<p class="sub" style="font-size:12px;margin-top:12px">Le joueur doit s\'être connecté au serveur au moins une fois. Il recevra ton message dans l\'app ou en jeu.</p>');
    setTimeout(function () { var i = q("#dmPseudo"); if (i) i.focus(); }, 300);
  }

  function nouveauOk(e) {
    e.preventDefault();
    var p = (q("#dmPseudo").value || "").trim();
    if (!p) return;
    sb.rpc("ouvrir_conversation", { p_pseudo: p }).then(function (r) {
      if (r.error) {
        var m = r.error.message || "";
        q("#dmPseudoErr").textContent = m.indexOf("joueur_inconnu") >= 0 ? "Joueur inconnu : il doit s'être connecté au serveur au moins une fois."
          : m.indexOf("soi_meme") >= 0 ? "Tu ne peux pas t'écrire à toi-même." : "Impossible d'ouvrir la conversation.";
        return;
      }
      var id = r.data;
      fermerSheet();
      sb.rpc("mes_conversations").then(function (r2) {
        etat.convs = r2.data || [];
        afficherListe();
        ouvrir(id);
      });
    });
  }

  // ─── Signaler / bloquer ──────────────────────────────────────────────────
  function menuMessage(m) {
    var auteur = etat.pseudos[m.auteur_mc] || "ce joueur";
    ouvrirSheet('<div class="top" style="margin-bottom:10px"><div><div class="eyebrow">Message de ' + h(auteur) + '</div><h3 style="font-size:19px">Signaler ce message ?</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div>' +
      '<div class="card" style="padding:12px;margin-bottom:12px;font-size:14px">' + h(m.contenu) + '</div>' +
      '<label class="fl">Raison (facultatif)<input id="dmRaison" maxlength="300" placeholder="Insulte, harcèlement, arnaque…"></label>' +
      '<button class="btn" style="width:100%" onclick="DM.signaler(' + Number(m.id) + ')">Signaler au staff</button>' +
      '<p class="sub" style="font-size:12px;margin-top:10px">Le staff verra ce message et la raison. Pour ne plus recevoir de messages de ' + h(auteur) + ', utilise « Bloquer » dans le menu ⋯ de la conversation.</p>');
  }

  function signaler(id) {
    var raison = (q("#dmRaison") || {}).value || "";
    sb.rpc("signaler", { p_message: id, p_raison: raison }).then(function (r) {
      fermerSheet();
      notif(r.data === "ok" ? "✓ Merci, le staff a été prévenu" : "Signalement impossible");
    });
  }

  function menuConv() {
    var c = etat.ouverte;
    if (!c) return;
    if (c.type === "ville") {
      ouvrirSheet('<div class="top"><div><div class="eyebrow">Canal de ville</div><h3 style="font-size:19px">' + h(c.titre || "Ma ville") + '</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div>' +
        '<p class="sub">Tous les habitants de ta ville voient ce canal. Pour signaler un message, touche-le.</p>');
      return;
    }
    var p = c.autre_pseudo || "";
    ouvrirSheet('<div class="top" style="margin-bottom:12px"><div><div class="eyebrow">Conversation</div><h3 style="font-size:19px">' + h(p) + '</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div>' +
      '<button class="btn ghost" style="width:100%;margin-bottom:8px" onclick="DM.bloquer(true)">🚫 Bloquer ' + h(p) + '</button>' +
      '<p class="sub" style="font-size:12px">Vous ne pourrez plus vous écrire, ni dans l\'app ni en jeu. Tu peux le débloquer depuis ton compte (⚙).</p>');
  }

  function bloquer(oui, pseudo) {
    var p = pseudo || (etat.ouverte && etat.ouverte.autre_pseudo);
    if (!p) return;
    sb.rpc("bloquer", { p_pseudo: p, p_bloquer: oui }).then(function (r) {
      fermerSheet();
      notif(r.data === "ok" ? (oui ? "🚫 " + p + " est bloqué" : "✓ " + p + " est débloqué") : "Action impossible");
      if (pseudo) compte();
    });
  }

  // ─── Compte ──────────────────────────────────────────────────────────────
  function compte() {
    var p = etat.profil || {};
    var pr = p.pronoms || "";
    var html = '<div class="top" style="margin-bottom:12px"><div><div class="eyebrow">Mon compte</div><h3 style="font-size:20px">' + h(p.pseudo_discord || "Discord") + '</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div>' +
      '<div class="card" style="padding:12px 14px;margin-bottom:12px;font-size:14px">Minecraft : <b>' + h(etat.moiPseudo || "non relié") + '</b></div>' +
      '<div class="fl">Pronoms</div><div class="pron" style="margin-bottom:14px">' +
      [["elle", "Elle"], ["il", "Il"], ["neutre", "Neutre"]].map(function (x) {
        return '<button class="' + (pr === x[0] ? "on" : "") + '" onclick="DM.pronoms(\'' + x[0] + '\')"><b>' + x[1] + '</b></button>';
      }).join("") + '</div><div id="dmBloques"></div>';
    if (etat.moi) html += '<button class="btn ghost" style="width:100%;margin-bottom:8px" onclick="DM.delier()">Délier mon compte Minecraft</button>';
    html += '<button class="btn ghost" style="width:100%;margin-bottom:8px" onclick="DM.deconnexion()">Se déconnecter</button>' +
      '<button class="btn ghost" style="width:100%;color:var(--blood)" onclick="DM.supprimer(false)">Supprimer mon compte et mes messages</button>';
    ouvrirSheet(html);
    if (etat.moi) {
      sb.from("blocages").select("bloque_mc").then(function (r) {
        var ids = (r.data || []).map(function (b) { return b.bloque_mc; });
        if (!ids.length) return;
        pseudosDe(ids).then(function () {
          var el = q("#dmBloques");
          if (!el) return;
          el.innerHTML = '<div class="fl">Joueurs bloqués</div>' + ids.map(function (id) {
            var ps = etat.pseudos[id] || "?";
            return '<div class="cmd"><span style="color:var(--ink)">' + h(ps) + '</span><button class="btn ghost" style="padding:6px 10px" onclick="DM.bloquer(false,\'' + h(ps) + '\')">Débloquer</button></div>';
          }).join("") + '<div style="height:14px"></div>';
        });
      });
    }
  }

  function pronoms(v) {
    sb.from("profils").update({ pronoms: v }).eq("id", etat.user.id).then(function () {
      if (etat.profil) etat.profil.pronoms = v;
      try { prof.pr = { elle: "f", il: "m", neutre: "n" }[v]; store.set("profil", prof); applyProfile(); } catch (e) {}
      compte();
    });
  }

  function delier() {
    sb.rpc("delier_compte").then(function () { fermerSheet(); notif("Compte Minecraft délié"); charger(); });
  }

  function deconnexion() {
    sb.auth.signOut().then(function () { fermerSheet(); fermer(); notif("Déconnecté·e"); });
  }

  function supprimer(confirme) {
    if (!confirme) {
      ouvrirSheet('<div class="top" style="margin-bottom:12px"><div><div class="eyebrow">Attention</div><h3 style="font-size:19px">Supprimer ton compte ?</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div>' +
        '<p class="sub">Ton compte de l\'app et <b>tous tes messages</b> seront supprimés définitivement. Ton personnage en jeu n\'est pas touché.</p>' +
        '<button class="btn" style="width:100%;margin-top:12px;background:linear-gradient(135deg,#e0607a,#9b2242)" onclick="DM.supprimer(true)">Oui, tout supprimer</button>');
      return;
    }
    sb.rpc("supprimer_mon_compte").then(function () {
      return sb.auth.signOut();
    }).then(function () { fermerSheet(); notif("Compte supprimé"); charger(); });
  }

  // ─── Modération (staff) ──────────────────────────────────────────────────
  function ouvrirModeration() {
    ouvrirSheet('<div class="top" style="margin-bottom:12px"><div><div class="eyebrow">Staff</div><h3 style="font-size:20px">🛡 Signalements</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div><div id="dmMods"><div class="empty">Chargement…</div></div>');
    sb.from("signalements").select("*").order("id", { ascending: false }).limit(50).then(function (r) {
      var rows = r.data || [];
      var ids = [];
      rows.forEach(function (s) { ids.push(s.auteur_mc, s.signaleur_mc); });
      return pseudosDe(ids).then(function () {
        var el = q("#dmMods");
        if (!el) return;
        if (!rows.length) { el.innerHTML = '<div class="empty">Aucun signalement 🎉</div>'; return; }
        el.innerHTML = rows.map(function (s) {
          var auteur = etat.pseudos[s.auteur_mc] || "?";
          return '<div class="card" style="padding:12px;margin-bottom:10px;' + (s.traite ? "opacity:.55" : "") + '">' +
            '<div class="sub" style="font-size:12px">' + h(heure(s.cree_le)) + ' · par ' + h(etat.pseudos[s.signaleur_mc] || "?") + (s.traite ? " · traité" : "") + '</div>' +
            '<div style="margin:6px 0"><b>' + h(auteur) + '</b> : ' + h(s.copie_contenu) + '</div>' +
            (s.raison ? '<div class="sub" style="font-size:13px">Raison : ' + h(s.raison) + '</div>' : "") +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
            (s.message_id ? '<button class="btn ghost" style="padding:6px 10px" onclick="DM.moderer(' + Number(s.message_id) + ')">Masquer le message</button>' : "") +
            (s.traite ? "" : '<button class="btn ghost" style="padding:6px 10px" onclick="DM.traiter(' + Number(s.id) + ')">Marquer traité</button>') +
            '<button class="btn ghost" style="padding:6px 10px;color:var(--blood)" onclick="DM.bannir(\'' + h(auteur) + '\')">Bannir ' + h(auteur) + '</button>' +
            '</div></div>';
        }).join("");
      });
    });
  }
  function moderer(id) { sb.rpc("moderer_message", { p_message: id, p_supprimer: true }).then(function (r) { notif(r.error ? "Action impossible" : "Message masqué"); }); }
  function traiter(id) { sb.rpc("traiter_signalement", { p_id: id }).then(function () { ouvrirModeration(); }); }
  function bannir(pseudo) {
    sb.rpc("bannir", { p_pseudo: pseudo, p_bannir: true }).then(function (r) {
      notif(r.data === "ok" ? "🚫 " + pseudo + " n'a plus accès à la messagerie" : r.data === "pas_de_compte" ? pseudo + " n'a pas de compte dans l'app" : "Action impossible");
    });
  }

  // ─── Temps réel ──────────────────────────────────────────────────────────
  function demarrerTempsReel() {
    arreterTempsReel();
    etat.canal = sb.channel("dm-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, function (p) {
        var m = p.new;
        if (!m || m.supprime) return;
        pseudosDe([m.auteur_mc]).then(function () {
          if (etat.ouverte && etat.ouverte.conversation_id === m.conversation_id && q("#chat").classList.contains("on")) {
            ajouterMessage(m, true);
            marquerLu();
          } else {
            rafraichirListe();
            if (m.auteur_mc !== etat.moi) {
              notif("✉ " + (etat.pseudos[m.auteur_mc] || "Nouveau message") + " : " + String(m.contenu).slice(0, 60));
              vibrer();
            }
          }
        });
      })
      .subscribe();
  }
  function arreterTempsReel() {
    if (etat.canal) { try { sb.removeChannel(etat.canal); } catch (e) {} etat.canal = null; }
  }

  // ─── Feuilles (fenêtres du bas) ──────────────────────────────────────────
  function ouvrirSheet(html) { q("#dmSheetIn").innerHTML = html; q("#dmSheet").classList.add("on"); }
  function fermerSheet() { q("#dmSheet").classList.remove("on"); }

  function charte() {
    ouvrirSheet('<div class="top" style="margin-bottom:10px"><div><div class="eyebrow">Messagerie</div><h3 style="font-size:20px">Charte des Corbeaux</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div>' +
      '<div class="dmtexte"><p>La messagerie suit les Valeurs Fondamentales de Solaris : chacun y est accepté, quelle que soit sa race.</p><ul>' +
      '<li><b>Respect</b> : pas d\'insultes, de moqueries, de harcèlement ni de menaces.</li>' +
      '<li><b>Aucune discrimination</b> : racisme, sexisme, homophobie, transphobie… sont interdits.</li>' +
      '<li><b>Pas de contenu choquant</b> : rien de sexuel, violent ou illégal.</li>' +
      '<li><b>Ta sécurité</b> : ne partage jamais ton adresse, ton numéro, tes mots de passe ou tes photos. Le staff ne te les demandera jamais.</li>' +
      '<li><b>Pas de spam</b>, de publicité ni d\'arnaque.</li>' +
      '<li>Un message te met mal à l\'aise ? <b>Signale-le</b> (touche-le) et <b>bloque</b> la personne.</li></ul>' +
      '<p>Le staff lit les messages signalés et peut masquer un message ou retirer l\'accès à la messagerie. Les règles du serveur s\'appliquent aussi ici.</p></div>');
  }

  function confidentialite() {
    ouvrirSheet('<div class="top" style="margin-bottom:10px"><div><div class="eyebrow">Messagerie</div><h3 style="font-size:20px">Confidentialité</h3></div><button class="icobtn" onclick="DM.fermerSheet()">✕</button></div>' +
      '<div class="dmtexte"><p><b>Ce que nous enregistrons</b> : ton identifiant, ton pseudo et ton avatar Discord, ton pseudo et ton identifiant Minecraft, tes messages, tes pronoms si tu les choisis, les joueurs que tu bloques et les signalements.</p>' +
      '<p><b>Pourquoi</b> : uniquement pour faire fonctionner la messagerie (dans l\'app et en jeu) et la modération. Pas de publicité, aucune revente.</p>' +
      '<p><b>Où</b> : base de données Supabase hébergée en Europe (Irlande). Le site est hébergé par Cloudflare. Les têtes des joueurs viennent de mc-heads.net.</p>' +
      '<p><b>Qui voit tes messages</b> : les personnes de la conversation. Le staff peut lire un message s\'il est signalé.</p>' +
      '<p><b>Combien de temps</b> : tant que ton compte existe. « Supprimer mon compte » (⚙) efface ton compte et tous tes messages, définitivement.</p>' +
      '<p><b>Tes droits</b> : tu peux demander à consulter, corriger ou supprimer tes données en contactant le staff sur le Discord. Si tu as moins de 15 ans, parles-en à tes parents avant d\'utiliser la messagerie.</p></div>');
  }

  // ─── Style ───────────────────────────────────────────────────────────────
  function injecterStyle() {
    var st = document.createElement("style");
    st.textContent =
      "#s-msg .icobtn[hidden]{display:none}" +
      ".dmhero{position:relative;overflow:hidden;text-align:center;padding:20px;margin-bottom:12px}" +
      ".dmhero a,.dmtexte a,#s-msg .sub a{color:var(--ice)}" +
      ".dmdiscord{background:linear-gradient(135deg,#5865f2,#7b4fe0);box-shadow:0 8px 24px rgba(88,101,242,.4);padding:12px 18px;font-size:15px}" +
      ".dmcard{padding:16px;margin-bottom:12px}.dmcard .sub{margin:6px 0 0}" +
      ".dmcompte{display:flex;align-items:center;gap:12px;padding:10px 12px;margin-bottom:12px;width:100%;text-align:left}" +
      ".dmcompte b{display:block;font-size:14.5px}.dmcompte small{display:block;color:var(--mute);font-size:12.5px}.dmcompte .chev{color:var(--mute)}" +
      ".dmav{width:40px;height:40px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:linear-gradient(135deg,var(--violet),var(--ice2));flex:none}" +
      ".dmav img,.cv .av img,#cav img{width:100%;height:100%;object-fit:cover;image-rendering:pixelated;border-radius:inherit}" +
      ".cv .av{overflow:hidden;background:rgba(255,255,255,.06)}" +
      ".dmville{background:linear-gradient(135deg,#1e6f7a,#3b1d6e)!important;color:#d8f6ff;font-size:20px}" +
      ".dmcode{display:flex;gap:8px;margin-top:12px}.dmcode input{flex:1;min-width:0;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid var(--line);outline:0;font-family:'Pixelify Sans',monospace;font-size:20px;letter-spacing:.3em;text-transform:uppercase;color:var(--ink)}" +
      ".dmqui{display:block;font-size:11.5px;font-weight:600;color:var(--gold);margin-bottom:2px}" +
      ".m.them{cursor:pointer}" +
      ".dmtexte{font-size:14px;line-height:1.55;color:#ddd0f2}.dmtexte ul{padding-left:18px}.dmtexte li{margin-bottom:6px}" +
      "#chat .msgs{padding-bottom:18px}";
    document.head.appendChild(st);
  }

  // ─── API publique (appelée depuis le HTML) ───────────────────────────────
  window.DM = {
    connexion: connexion, lier: lier, ouvrir: ouvrir, fermer: fermer, envoyer: envoyer,
    nouveau: nouveau, nouveauOk: nouveauOk, signaler: signaler, menuConv: menuConv, bloquer: bloquer,
    compte: compte, pronoms: pronoms, delier: delier, deconnexion: deconnexion, supprimer: supprimer,
    ouvrirModeration: ouvrirModeration, moderer: moderer, traiter: traiter, bannir: bannir,
    charte: charte, confidentialite: confidentialite, fermerSheet: fermerSheet
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
