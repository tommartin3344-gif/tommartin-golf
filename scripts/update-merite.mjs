// Met à jour data/merite.json depuis le Mérite National Amateur (ffgolf).
// Lancé automatiquement par GitHub Actions le 10 de chaque mois (voir .github/workflows/merite.yml).
// Utilisation locale : node scripts/update-merite.mjs   (Node 18+)
// Test hors ligne :    node scripts/update-merite.mjs --fixtures scripts/fixtures

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "merite.json");
const PAGE = "https://pages.ffgolf.org/merite/amateurs/messieurs";
const PLAYER = { nom: "MARTIN", prenom: "Tom", golf: /PREE/i }; // nom, prénom, club

const fixIdx = process.argv.indexOf("--fixtures");
const FIXTURES = fixIdx > -1 ? path.resolve(process.argv[fixIdx + 1]) : null;
const UA = "Mozilla/5.0 (compatible; tommartin-golf.fr mise-a-jour mensuelle)";

async function get(url, kind) {
  if (FIXTURES) {
    const file = kind === "page" ? "page.html" : kind === "data" ? "data.json" : "detail.html";
    return readFile(path.join(FIXTURES, file), "utf8");
  }
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", Referer: PAGE } });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
      return await res.text();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
  throw last;
}

const strip = (html) =>
  html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const num = (s) => {
  if (s === undefined || s === null) return null;
  const t = String(s).replace(",", ".").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};
const pick = (html, label) => {
  const re = new RegExp(label + "\\s*:?\\s*</span>\\s*<span[^>]*>([^<]*)<|" + label + "\\s*:\\s*<span[^>]*>([^<]*)<", "i");
  const m = html.match(re);
  return m ? (m[1] ?? m[2]).trim() : null;
};
// "33 eme GRAND PRIX DU COGNAC" -> "33e Grand Prix du Cognac" (seulement si le nom est en majuscules)
function tidyName(s) {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "");
  let t = s.replace(/\s+/g, " ").replace(/\b(\d+)\s*(e|eme|ème|ieme)\b/gi, "$1e");
  if (letters.length && upper.length / letters.length > 0.7) {
    const small = new Set(["de", "du", "des", "la", "le", "les", "et", "d", "l", "en"]);
    t = t.toLowerCase().replace(/[a-zà-ÿ]+/g, (w, i) => (i > 0 && small.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
    t = t.replace(/\b(\d+)E\b/g, "$1e");
  }
  return t.trim();
}

function parseResults(detail) {
  const tables = [...detail.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const resTable = tables.find((t) => /Nom de la comp/i.test(t));
  if (!resTable) return [];
  const body = (resTable.match(/<tbody[\s\S]*?<\/tbody>/i) || [""])[0];
  return [...body.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map((m) => {
      const cells = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
      if (cells.length < 12) return null;
      const href = (cells[3].match(/href="([^"]+)"/i) || [])[1] || null;
      const tours = cells.slice(5, 9).map((c) => num(strip(c))).filter((n) => n !== null);
      return {
        date: strip(cells[0]),
        nom: tidyName(strip(cells[3])),
        url: href,
        place: strip(cells[4]),
        tours,
        points: num(strip(cells[10])),
        vsSss: num(strip(cells[11]))
      };
    })
    .filter(Boolean);
}

async function main() {
  // 1. La page publique donne l'édition en cours et les adresses des données
  const page = await get(PAGE, "page");
  const dataUrl = (page.match(/refsdataUrl\s*=\s*"([^"]+)"/) || [])[1];
  const detailPath = (page.match(/detailJoueurUrl\s*=\s*"([^"]+)"/) || [])[1];
  if (!dataUrl || !detailPath) throw new Error("Structure de la page ffgolf modifiée : adresses des données introuvables.");

  // 2. Classement complet
  const data = JSON.parse(await get(dataUrl, "data"));
  const me = (data.datas || []).find(
    (d) => String(d.NOM).toUpperCase() === PLAYER.nom && String(d.PRENOM).toLowerCase() === PLAYER.prenom.toLowerCase() && PLAYER.golf.test(d.GOLF)
  );
  if (!me) throw new Error(`${PLAYER.prenom} ${PLAYER.nom} introuvable dans l'édition ${data.ma_title || dataUrl}.`);
  const editionId = (dataUrl.match(/(\d{6})\/?$/) || [])[1];

  // 3. Fiche détaillée (index, meilleure place, résultats)
  const detail = await get(new URL(detailPath, PAGE).href + "?h=" + me.CODE, "detail");
  const results = parseResults(detail);

  // 4. Fusion avec le fichier existant
  let prev = {};
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const prevByDate = new Map((prev.results || []).map((r) => [r.date + "|" + (r.tours || []).join("-"), r]));
  const mergedResults = results.map((r) => {
    const old = prevByDate.get(r.date + "|" + r.tours.join("-"));
    return old ? { ...r, nom: old.nom, ...(old.golf ? { golf: old.golf } : {}) } : r; // garde les noms et golfs corrigés à la main
  });

  const history = (prev.history || []).filter((h) => h.id !== editionId);
  history.push({ id: editionId, rank: Number(me.RANK), nb: num(data.nb) });
  history.sort((a, b) => a.id.localeCompare(b.id));

  const current = {
    editionId,
    editionTitle: data.ma_title || null,
    periode: data.date_debut && data.date_fin ? `${data.date_debut} - ${data.date_fin}` : null,
    prochaineParution: data.date_parution || null,
    rank: Number(me.RANK),
    rankPrecedent: num(me.RANKANC),
    rankAnneePrecedente: num(me.RANKANN),
    meilleurePlace: num(pick(detail, "Meilleure place")),
    nbClasses: num(data.nb),
    index: num(pick(detail, "Index")),
    victoires: num(pick(detail, "Victoire")),
    moySss: num(me.MOY_SSS),
    moySss6: num(me.MOY_SSS_6),
    tournois: num(me.NBTOURNOIS),
    tournoisMarques: null,
    total: num(me.TOTAL),
    golf: me.GOLF
  };
  const head = detail.match(/<tbody>\s*<tr>([\s\S]*?)<\/tr>/i);
  if (head) {
    const v = [...head[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => num(strip(c[1])));
    if (v.length >= 6) current.tournoisMarques = v[3];
  }
  if (current.index === null && prev.current) current.index = prev.current.index;

  const next = { source: PAGE, updatedAt: prev.updatedAt, current, history, results: mergedResults };
  const changed = JSON.stringify({ ...next, updatedAt: null }) !== JSON.stringify({ ...prev, updatedAt: null });
  if (!changed) {
    console.log(`Aucun changement (édition ${editionId}, ${current.rank}e).`);
    return;
  }
  next.updatedAt = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(next, null, 2) + "\n");
  console.log(`Mis à jour : édition ${editionId}, ${current.rank}e sur ${current.nbClasses}, index ${current.index}, ${mergedResults.length} résultats.`);
}

main().catch((e) => {
  console.error("Échec de la mise à jour du Mérite :", e.message);
  process.exit(1);
});
