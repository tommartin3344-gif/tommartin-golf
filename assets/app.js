(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cfg = window.SITE_CONFIG || {};
  const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const MOIS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  const nbFr = (n) => Number(n).toLocaleString("fr-FR");
  const decFr = (v, signed) => {
    if (v === null || v === undefined || v === "") return "—";
    const n = Number(String(v).replace(",", "."));
    if (Number.isNaN(n)) return String(v);
    const s = Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    if (n < 0) return "−" + s;
    return (signed && n > 0 ? "+" : "") + s;
  };
  const ordinal = (n) => (Number(n) === 1 ? "1er" : `${n}e`);
  const editionLabel = (id) => `${MOIS_LONG[Number(id.slice(4)) - 1]} ${id.slice(0, 4)}`;
  const setAll = (key, text) => $$(`[data-merite="${key}"]`).forEach((el) => (el.textContent = text));

  // ---------- Photo absente : on masque l'emplacement ----------
  $$("[data-photo] img").forEach((img) => {
    const miss = () => img.closest("[data-photo]").classList.add("is-missing");
    if (img.complete && img.naturalWidth === 0) miss();
    img.addEventListener("error", miss);
  });

  // ---------- Données du Mérite ----------
  fetch("data/merite.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then(renderMerite)
    .catch(() => {});

  // Alerte e-mail : chaque demande enregistrée est aussi envoyée à Tom par FormSubmit (gratuit, sans compte).
  // Le premier envoi déclenche un e-mail d'activation à confirmer une seule fois.
  function envoyerAlerte(p) {
    const mail = cfg.CONTACT_EMAIL || "tommartin3344@gmail.com";
    const corps = {
      _subject: `Nouvelle demande sur ton site : ${p.nom}${p.entreprise ? " (" + p.entreprise + ")" : ""}`,
      _template: "box",
      _captcha: "false",
      _replyto: p.email,
      "Objet": p.formule || "Non précisé",
      "Nom": p.nom,
      "Entreprise": p.entreprise || "-",
      "E-mail": p.email,
      "Téléphone": p.telephone || "-",
      "Message": p.message || "-",
      "Suivi": "Réponds directement à cet e-mail pour écrire à la personne. La demande est aussi dans Supabase > Table Editor > demandes_partenariat."
    };
    fetch(`https://formsubmit.co/ajax/${mail}`, {
      method: "POST",
      referrerPolicy: "origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corps)
    }).catch(() => {});
  }

  function renderMerite(d) {
    const c = d.current;
    const hist = (d.history || []).slice().sort((a, b) => a.id.localeCompare(b.id));
    setAll("rank", ordinal(c.rank));
    setAll("index", decFr(c.index));
    setAll("moy6", decFr(c.moySss6, true));
    setAll("tournois", String(c.tournois));
    setAll("nb", nbFr(c.nbClasses));
    setAll("edition", `édition de ${editionLabel(c.editionId)}`);

    const share = c.rank / c.nbClasses;
    const phrase =
      share <= 0.1 ? "dans le top 10 %" :
      share <= 0.25 ? "premier quart" :
      share <= 0.34 ? "premier tiers" :
      share <= 0.5 ? "première moitié" : "";
    setAll("shareClause", phrase
      ? `${phrase} des ${nbFr(c.nbClasses)} joueurs classés en France`
      : `parmi les ${nbFr(c.nbClasses)} joueurs classés en France`);

    // Point de départ : la plus ancienne édition des 12 derniers mois
    const floor = String(Number(c.editionId) - 100);
    const window12 = hist.filter((h) => h.id > floor);
    const first = window12[0];

    if (d.updatedAt) {
      const u = new Date(d.updatedAt);
      setAll("updated", `(dernière mise à jour le ${u.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })})`);
    }

    drawTrajectory(hist.slice(-24));
    const getJson = (u, dflt) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : dflt)).catch(() => dflt);
    Promise.all([getJson("data/golfs.json", { golfs: [] }), getJson("data/resultats-archives.json", { resultats: [] })])
      .then(([g, a]) => renderSeasons([...(d.results || []), ...(a.resultats || [])], g.golfs || []));
  }

  // ---------- Courbe « trajectoire de balle » ----------
  function drawTrajectory(h) {
    const svg = $("#traj");
    if (!svg || h.length < 2) return;
    const W = 800, H = 360, L = 56, R = 70, T = 34, B = 44;
    const ranks = h.map((p) => p.rank);
    const step = 200;
    const lo = Math.max(0, Math.floor((Math.min(...ranks) * 0.85) / step) * step);
    const hi = Math.ceil((Math.max(...ranks) * 1.04) / step) * step;
    const x = (i) => L + (i * (W - L - R)) / (h.length - 1);
    const y = (r) => T + ((r - lo) * (H - T - B)) / (hi - lo); // meilleur rang = en haut
    const pts = h.map((p, i) => [x(i), y(p.rank)]);

    // Catmull-Rom -> Bézier pour une courbe fluide
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }

    const ns = "http://www.w3.org/2000/svg";
    const el = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text !== undefined) e.textContent = text;
      return e;
    };
    svg.textContent = "";
    const g = el("g", { class: "grid" });
    for (let r = lo; r <= hi; r += step) {
      if (r === 0) continue;
      g.append(el("line", { x1: L, x2: W - R + 20, y1: y(r), y2: y(r) }));
      g.append(el("text", { x: L - 10, y: y(r) + 4, "text-anchor": "end" }, ordinal(r)));
    }
    h.forEach((p, i) => {
      const m = Number(p.id.slice(4));
      if (i === 0 || i === h.length - 1 || m === 1 || m === 4 || m === 7 || m === 10) {
        g.append(el("text", { x: x(i), y: H - 12, "text-anchor": "middle" }, `${MOIS[m - 1]}${i === 0 || m === 1 ? " " + p.id.slice(2, 4) : ""}`));
      }
    });
    svg.append(g);
    svg.append(el("path", { class: "flight-shadow", d }));
    const path = el("path", { class: "flight", d });
    svg.append(path);
    path.style.setProperty("--len", Math.ceil(path.getTotalLength()));

    pts.slice(1, -1).forEach(([px, py]) => svg.append(el("circle", { class: "pt", cx: px, cy: py, r: 4 })));
    const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
    svg.append(el("rect", { class: "tee", x: sx - 3, y: sy + 6, width: 6, height: 12, rx: 1 }));
    svg.append(el("circle", { class: "pt", cx: sx, cy: sy, r: 6 }));
    svg.append(el("text", { class: "lbl", x: sx + 12, y: sy - 12 }, ordinal(h[0].rank)));
    const gEnd = el("g", { class: "lbl-end" });
    gEnd.append(el("circle", { class: "ball", cx: ex, cy: ey, r: 9 }));
    gEnd.append(el("text", { class: "lbl", x: ex, y: ey - 20, "text-anchor": "middle" }, ordinal(h[h.length - 1].rank)));
    svg.append(gEnd);
    svg.setAttribute("aria-label", `Classement au Mérite National Amateur : de la ${ordinal(h[0].rank)} place en ${editionLabel(h[0].id)} à la ${ordinal(h[h.length - 1].rank)} place en ${editionLabel(h[h.length - 1].id)}.`);
  }

  // ---------- Carte de score ----------
  function golfFor(nom, golfs) {
    for (const g of golfs) {
      try { if (new RegExp(g.motif, "i").test(nom)) return g; } catch (e) { /* motif invalide */ }
    }
    return null;
  }

  function golfBadge(g, nom) {
    const box = document.createElement("span");
    box.className = "golf-badge";
    box.setAttribute("aria-hidden", "true");
    const sigle = (g && g.sigle) || (nom.match(/\b[A-ZÉÈ]/g) || ["G"]).slice(-2).join("");
    const txt = () => { box.textContent = sigle; box.classList.add("sigle"); };
    if (g && g.logo) {
      const img = Object.assign(document.createElement("img"), { src: g.logo, alt: "", loading: "lazy", width: 48, height: 48 });
      img.addEventListener("error", () => { img.remove(); txt(); });
      box.append(img);
    } else txt();
    return box;
  }

  // ---------- Saisons (onglets par année) ----------
  function renderSeasons(all, golfs) {
    const seen = new Set();
    const results = all.filter((r) => { const k = r.date + "|" + (r.tours || []).join("-"); if (seen.has(k)) return false; seen.add(k); return true; });
    const years = [...new Set(results.map((r) => r.date.split("/")[2]))].sort((a, b) => b - a);
    const box = $("#year-tabs");
    const show = (y) => {
      renderScorecard(results.filter((r) => r.date.endsWith("/" + y)), golfs);
      const cap = $("#scorecard-cap"); if (cap) cap.textContent = `Résultats en compétition, saison ${y}`;
      if (box) box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.year === y)));
    };
    if (box && years.length > 1) {
      years.forEach((y) => {
        const b = Object.assign(document.createElement("button"), { type: "button", textContent: y });
        b.dataset.year = y; b.setAttribute("role", "tab");
        b.addEventListener("click", () => show(y));
        box.append(b);
      });
    }
    if (years.length) show(years[0]); else renderScorecard([], golfs);
  }

  function renderScorecard(results, golfs = []) {
    const tb = $("#scorecard tbody");
    if (!tb) return;
    if (!results.length) {
      tb.innerHTML = '<tr><td colspan="6">Les résultats seront publiés après la prochaine mise à jour du Mérite.</td></tr>';
      return;
    }
    const toTime = (s) => { const [dd, mm, yy] = s.split("/"); return new Date(+yy, +mm - 1, +dd).getTime(); };
    const rows = results.slice().sort((a, b) => toTime(b.date) - toTime(a.date));
    tb.textContent = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const n = parseInt(r.place, 10);
      const ex = /ex/i.test(r.place);
      const cls = !Number.isNaN(n) && n <= 5 ? (n <= 3 ? "place top podium" : "place top") : "place";
      const [dd, mm, yy] = r.date.split("/");
      const t = r.tours || [];
      const td = (html, c = "") => { const e = document.createElement("td"); if (c) e.className = c; e.innerHTML = html; return e; };
      const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
      tr.append(td(`<time datetime="${yy}-${mm}-${dd}">${+dd} ${MOIS[+mm - 1]} ${yy}</time>`, "date"));
      const g = (r.golf && golfs.find((x) => x.id === r.golf)) || golfFor(r.nom, golfs);
      const comp = td("", "comp");
      const wrap = document.createElement("div");
      wrap.className = "comp-in";
      wrap.append(golfBadge(g, r.nom));
      const txt = document.createElement("div");
      txt.innerHTML = (r.url ? `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.nom)}</a>` : esc(r.nom))
        + (g ? `<span class="lieu">${esc(g.nom)}${g.ville && !g.nom.includes(g.ville) ? `, ${esc(g.ville)}` : ""}</span>` : "");
      wrap.append(txt);
      comp.append(wrap);
      tr.append(comp);
      [0, 1, 2].forEach((i) => tr.append(td(t[i] ?? "", "num")));
      tr.append(td(Number.isNaN(n) ? esc(r.place) : `<span class="${cls}" title="${esc(r.place)}">${n}${ex ? "<small>&nbsp;ex</small>" : ""}</span>`, "num"));
      tb.append(tr);
    });
  }

  // ---------- Partenaires ----------
  fetch("data/partenaires.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((list) => {
      const items = (list.partenaires || []).filter((p) => p.nom);
      if (!items.length) return;
      const ul = $("#partners-list");
      items.forEach((p) => {
        const li = document.createElement("li");
        const inner = p.logo ? Object.assign(document.createElement("img"), { src: p.logo, alt: p.nom }) : Object.assign(document.createElement("strong"), { textContent: p.nom });
        if (p.url) { const a = Object.assign(document.createElement("a"), { href: p.url, rel: "noopener", target: "_blank" }); a.append(inner); li.append(a); } else li.append(inner);
        ul.append(li);
      });
      $("#partners").hidden = false;
    })
    .catch(() => {});

  // ---------- Formulaire de contact ----------
  const form = $("#form");
  if (form) {
    const status = $("#form-status");
    const say = (msg, kind) => { status.textContent = msg; status.className = `form-status ${kind || ""}`; };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      if (f.get("site")) return; // piège à robots
      let firstBad = null;
      ["nom", "email", "consentement"].forEach((name) => {
        const input = form.elements[name];
        const bad = !input.checkValidity();
        input.setAttribute("aria-invalid", bad ? "true" : "false");
        if (bad && !firstBad) firstBad = input;
      });
      if (firstBad) {
        say("Merci de renseigner votre nom, un e-mail valide et de cocher la case de consentement.", "err");
        firstBad.focus();
        return;
      }
      const payload = {
        nom: f.get("nom").trim(),
        entreprise: (f.get("entreprise") || "").trim() || null,
        email: f.get("email").trim(),
        telephone: (f.get("telephone") || "").trim() || null,
        formule: f.get("formule"),
        message: (f.get("message") || "").trim() || null,
        consentement: true
      };
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      say("Envoi en cours…");
      try {
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) throw new Error("config");
        const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/demandes_partenariat`, {
          method: "POST",
          headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(String(res.status));
        envoyerAlerte(payload);
        form.reset();
        say("Message envoyé. Je vous réponds sous 48 heures.", "ok");
      } catch (err) {
        const mail = cfg.CONTACT_EMAIL || "tommartin3344@gmail.com";
        say("", "err");
        status.innerHTML = `Le message n'a pas pu être envoyé. Écrivez-moi directement à <a href="mailto:${mail}?subject=${encodeURIComponent("Contact depuis le site")}">${mail}</a>.`;
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
