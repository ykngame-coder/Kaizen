import type { Pillar } from '@supotsu/core';

/**
 * Knowledge Engine (Master Prompt P18 — pilier "Comprendre"). A small, curated
 * library of plain-language explainers, plus helpers to surface the ones
 * relevant to the user's current state. Content is general education, never
 * medical advice — it explains the "why" behind SUPOTSU's numbers.
 */

export interface KnowledgeArticle {
  id: string;
  pillar: Pillar;
  title: string;
  summary: string;
  /** Body paragraphs, rendered in order. */
  body: string[];
  readMinutes: number;
}

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: 'supotsu-score',
    pillar: 'decision',
    title: 'C’est quoi le Score Supotsu ?',
    summary: 'Un résumé unique de ta forme, composé de plusieurs piliers pondérés.',
    readMinutes: 2,
    body: [
      'Le Score Supotsu agrège plusieurs signaux — performance, récupération, régularité — en une note sur 100. Il n’est pas une vérité absolue mais une tendance : il monte quand tes piliers vont dans le bon sens.',
      'Chaque composante est calculée séparément puis pondérée. Tu peux toujours ouvrir le détail : aucune note n’est une boîte noire.',
      'À retenir : un score qui baisse un jour n’est pas un échec. Ce qui compte, c’est la direction sur plusieurs semaines.',
    ],
  },
  {
    id: 'recovery',
    pillar: 'recovery',
    title: 'Comprendre ta récupération',
    summary: 'Comment sommeil, HRV et fréquence cardiaque disent si tu es prêt.',
    readMinutes: 3,
    body: [
      'La récupération mesure à quel point ton corps a encaissé la charge récente. On la lit à partir du sommeil (durée et qualité), de la variabilité cardiaque (HRV) et de la fréquence cardiaque au repos.',
      'Quand la récupération est basse, une séance intense apporte plus de fatigue que de progrès. Mieux vaut du repos actif, de la mobilité, ou une séance technique.',
      'La récupération se construit surtout la nuit et par la nutrition — pas seulement par le repos passif.',
    ],
  },
  {
    id: 'hrv',
    pillar: 'recovery',
    title: 'La variabilité de fréquence cardiaque (HRV)',
    summary: 'Un reflet de ton système nerveux et de ta capacité à récupérer.',
    readMinutes: 3,
    body: [
      'La HRV mesure les micro-variations de temps entre deux battements. Contre-intuitif : plus elle est élevée, mieux c’est — cela traduit un système nerveux souple, prêt à s’adapter.',
      'Ta HRV te est personnelle : ce qui compte est ton évolution par rapport à ta propre moyenne, pas la comparaison avec les autres.',
      'Stress, alcool, manque de sommeil ou surcharge la font baisser. C’est un signal précoce très utile.',
    ],
  },
  {
    id: 'sleep',
    pillar: 'sleep',
    title: 'Pourquoi le sommeil passe avant la performance',
    summary: 'Le levier n°1 de la récupération et de la progression.',
    readMinutes: 3,
    body: [
      'Le sommeil est le moment où le corps répare les tissus, consolide les apprentissages moteurs et régule les hormones. Aucune supplémentation ne remplace une nuit complète.',
      'Vise la régularité des heures de coucher autant que la durée : un rythme stable améliore la qualité du sommeil profond.',
      'Une seule nuit courte n’est pas dramatique ; c’est l’accumulation de dette de sommeil qui pèse sur la forme et l’humeur.',
    ],
  },
  {
    id: 'acwr',
    pillar: 'performance',
    title: 'Charge aiguë / chronique & prévention',
    summary: 'Le ratio qui aide à progresser sans se blesser.',
    readMinutes: 3,
    body: [
      'On compare ta charge des 7 derniers jours (aiguë) à ta moyenne des 4 dernières semaines (chronique). Le rapport idéal se situe autour de 0,8–1,3 : tu progresses en restant dans tes moyens.',
      'Au-dessus de 1,5, la charge a augmenté trop vite : le risque de blessure grimpe. En dessous de 0,8, tu perds en forme — il y a de la marge.',
      'La règle d’or : augmente progressivement, environ 10 % par semaine, plutôt que par à-coups.',
    ],
  },
  {
    id: 'progressive-overload',
    pillar: 'performance',
    title: 'La surcharge progressive',
    summary: 'Ajouter des reps, puis de la charge — la base des progrès en force.',
    readMinutes: 2,
    body: [
      'Pour progresser, le muscle a besoin d’un stimulus qui augmente dans le temps. La double progression est simple : reste dans une fourchette de reps (ex. 8–12) à une charge donnée.',
      'Quand tu atteins le haut de la fourchette sur toutes tes séries, augmente la charge et repars du bas. C’est ce que SUPOTSU te suggère automatiquement.',
      'Inutile d’augmenter à chaque séance : la régularité et une technique propre priment sur la précipitation.',
    ],
  },
  {
    id: 'nutrition-basics',
    pillar: 'nutrition',
    title: 'Calories & macros, sans dogme',
    summary: 'Les bases pour soutenir ton entraînement et tes objectifs.',
    readMinutes: 3,
    body: [
      'Les calories déterminent la direction (prise, maintien, perte). Les protéines soutiennent la récupération musculaire ; vise environ 1,6–2,0 g par kg de poids de corps.',
      'Glucides et lipides fournissent l’énergie : les glucides autour de l’entraînement, les lipides pour l’équilibre hormonal. Aucun n’est à bannir.',
      'L’hydratation compte autant : quelques pourcents de déshydratation suffisent à dégrader la performance.',
    ],
  },
  {
    id: 'habits',
    pillar: 'habits',
    title: 'Construire des habitudes qui tiennent',
    summary: 'La régularité bat la motivation sur le long terme.',
    readMinutes: 2,
    body: [
      'Une habitude s’ancre par la répétition et un déclencheur clair (après le café, avant la douche…). Commence petit : une action réalisable même les mauvais jours.',
      'Les séries (streaks) aident, mais ne casse pas tout si tu manques un jour : la règle utile est « ne jamais manquer deux fois ».',
      'Mesure ce qui compte, célèbre les petites victoires — c’est le cumul qui transforme.',
    ],
  },
  {
    id: 'wellness',
    pillar: 'understanding',
    title: 'Bien-être mental & stress',
    summary: 'Pourquoi ton ressenti compte autant que tes capteurs.',
    readMinutes: 2,
    body: [
      'La fatigue mentale et le stress chronique affectent le sommeil, la récupération et la motivation. Les ignorer, c’est passer à côté de la moitié du tableau.',
      'Un simple check-in quotidien (humeur, énergie, stress) aide à repérer les tendances avant qu’elles ne s’installent.',
      'Des outils simples aident : respiration lente, marche, temps sans écran. Quelques minutes suffisent à faire redescendre la pression.',
    ],
  },
];

const BY_ID = new Map(KNOWLEDGE_ARTICLES.map((a) => [a.id, a]));

export function getArticle(id: string): KnowledgeArticle | undefined {
  return BY_ID.get(id);
}

/** Articles grouped by pillar, preserving catalog order. */
export function articlesByPillar(): { pillar: Pillar; articles: KnowledgeArticle[] }[] {
  const groups = new Map<Pillar, KnowledgeArticle[]>();
  for (const a of KNOWLEDGE_ARTICLES) {
    const list = groups.get(a.pillar) ?? [];
    list.push(a);
    groups.set(a.pillar, list);
  }
  return [...groups.entries()].map(([pillar, articles]) => ({ pillar, articles }));
}

/** Resolve the (deduplicated) articles referenced by a set of recommendations. */
export function relevantArticles(articleIds: (string | undefined)[]): KnowledgeArticle[] {
  const seen = new Set<string>();
  const out: KnowledgeArticle[] = [];
  for (const id of articleIds) {
    if (!id || seen.has(id)) continue;
    const article = BY_ID.get(id);
    if (article) {
      seen.add(id);
      out.push(article);
    }
  }
  return out;
}
