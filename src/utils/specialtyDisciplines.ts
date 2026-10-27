import {
  ACTIVITY_TYPE_DEFAULT_MINUTES,
  ACTIVITY_TYPE_LABELS,
  ActivityCatalogItem,
  ActivityType,
  ALL_ACTIVITY_TYPES,
  normalizeActivityType,
  Trainer,
} from '../types';

export const PRESET_SPECIALTIES: readonly string[] = [
  'Pausas Activas',
  'Entrenamiento Funcional',
  'Ergonomía Laboral',
  'Yoga Corporativo',
  'Pilates Mat',
  'Mindfulness y Respiración',
  'HIIT & Cardio',
  'Zumba / Ritmos Latinos',
  'Movilidad Articular',
  'Tonificación con Bandas',
  'Gimnasia Cerebral',
  'Gimnasio Corporativo / Pesas',
  'Masaje Descontracturante en Silla',
  'Descarga Muscular y Relajación',
];

export function cleanDisciplineLabel(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\r\n\t\u00A0\u202F]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeDisciplineKey(raw: unknown): string {
  return cleanDisciplineLabel(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function stripModalityPrefix(raw: unknown): string {
  const cleaned = cleanDisciplineLabel(raw);
  const stripped = cleaned.replace(
    /^(pausa\s+activa|pausas\s+activas|clase\s+fitness|clases\s+fitness|gimnasio\s+corporativo|masajes?)\s*:\s*/i,
    ''
  );
  return stripped.trim() || cleaned;
}

export function inferActivityTypeFromDiscipline(
  rawName: string,
  fallback: ActivityType = 'clase_fitness'
): ActivityType {
  const key = normalizeDisciplineKey(rawName);
  if (!key) return fallback;

  if (key.startsWith('pausa activa') || key.startsWith('pausas activas')) {
    return 'pausa_activa';
  }
  if (key.startsWith('clase fitness') || key.startsWith('clases fitness')) {
    return 'clase_fitness';
  }
  if (key.startsWith('gimnasio corporativo')) {
    return 'gimnasio_corporativo';
  }
  if (key.startsWith('masaje')) {
    return 'masajes';
  }

  if (
    key.includes('masaje') ||
    key.includes('descontracturante') ||
    key.includes('descarga muscular') ||
    key.includes('relajacion cervical') ||
    key.includes('shiatsu') ||
    key.includes('reflexolog') ||
    key.includes('fisioterapia') ||
    key.includes('quiropr') ||
    key.includes('terapia manual')
  ) {
    return 'masajes';
  }

  if (
    key.includes('gimnasio') ||
    key.includes('pesas') ||
    key.includes('musculaci') ||
    key.includes('maquinas') ||
    key.includes('aparatos') ||
    key.includes('spinning') ||
    key.includes('indoor cycling') ||
    key.includes('cross training') ||
    key.includes('acondicionamiento en sala')
  ) {
    return 'gimnasio_corporativo';
  }

  if (
    key.includes('pausa') ||
    key.includes('ergonom') ||
    key.includes('estiramiento') ||
    key.includes('movilidad') ||
    key.includes('respiraci') ||
    key.includes('mindfulness') ||
    key.includes('gimnasia cerebral') ||
    key.includes('postura') ||
    key.includes('anti-estres') ||
    key.includes('antiestres')
  ) {
    return 'pausa_activa';
  }

  return fallback;
}

export function buildSpecialtyCatalogDocId(rawName: string): string {
  const norm = normalizeDisciplineKey(rawName);
  const slug = norm
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  let hash = 5381;
  for (let i = 0; i < norm.length; i++) {
    hash = ((hash << 5) + hash + norm.charCodeAt(i)) >>> 0;
  }
  const hashHex = hash.toString(36).slice(0, 6);
  return `cat_spec_${slug || 'disc'}_${hashHex}`;
}

export function resolveCatalogMatchForDiscipline(
  rawName: string,
  catalog: ActivityCatalogItem[]
): ActivityCatalogItem | undefined {
  const targetFull = normalizeDisciplineKey(rawName);
  const targetStripped = normalizeDisciplineKey(stripModalityPrefix(rawName));
  if (!targetFull) return undefined;

  const exact = catalog.find((item) => normalizeDisciplineKey(item.name) === targetFull);
  if (exact) return exact;

  return catalog.find((item) => {
    const itemStripped = normalizeDisciplineKey(stripModalityPrefix(item.name));
    return Boolean(itemStripped && itemStripped === targetStripped);
  });
}

export function buildCatalogItemFromSpecialty(
  rawName: string,
  options?: {
    activityType?: ActivityType;
    durationMinutes?: number;
    description?: string;
    customId?: string;
  }
): ActivityCatalogItem | null {
  const cleaned = cleanDisciplineLabel(rawName).slice(0, 150).trim();
  if (cleaned.length < 2) return null;

  const resolvedType = options?.activityType
    ? normalizeActivityType(options.activityType)
    : inferActivityTypeFromDiscipline(cleaned, 'clase_fitness');

  const resolvedDuration =
    options?.durationMinutes && Number.isFinite(options.durationMinutes)
      ? Math.min(480, Math.max(5, Math.round(options.durationMinutes)))
      : ACTIVITY_TYPE_DEFAULT_MINUTES[resolvedType];

  return {
    id: options?.customId || buildSpecialtyCatalogDocId(cleaned),
    name: cleaned,
    activityType: resolvedType,
    defaultDurationMinutes: resolvedDuration,
    description:
      options?.description !== undefined
        ? options.description.slice(0, 500)
        : 'Especialidad / disciplina registrada en base de datos para asignación de clases',
    active: true,
  };
}

export function isDisciplineRepresentedInCatalog(
  rawName: string,
  existingCatalog: ActivityCatalogItem[]
): boolean {
  const targetFull = normalizeDisciplineKey(rawName);
  const targetStripped = normalizeDisciplineKey(stripModalityPrefix(rawName));
  if (!targetFull) return true;
  if (targetFull === 'pausas activas' || targetFull === 'pausa activa') {
    return existingCatalog.some((c) => normalizeActivityType(c.activityType) === 'pausa_activa');
  }

  return existingCatalog.some((item) => {
    const itemFull = normalizeDisciplineKey(item.name);
    const itemStripped = normalizeDisciplineKey(stripModalityPrefix(item.name));
    return itemFull === targetFull || (Boolean(targetStripped) && itemStripped === targetStripped);
  });
}

export function collectMissingCatalogItemsFromTrainers(
  trainers: Pick<Trainer, 'specialties'>[],
  existingCatalog: ActivityCatalogItem[]
): ActivityCatalogItem[] {
  const seenKeys = new Set<string>();
  const result: ActivityCatalogItem[] = [];

  for (const tr of trainers) {
    for (const rawSpec of tr.specialties || []) {
      const cleaned = cleanDisciplineLabel(rawSpec);
      if (cleaned.length < 2) continue;
      const key = normalizeDisciplineKey(cleaned);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);

      if (!isDisciplineRepresentedInCatalog(cleaned, existingCatalog)) {
        const built = buildCatalogItemFromSpecialty(cleaned);
        if (built) {
          result.push(built);
        }
      }
    }
  }

  return result;
}

export function collectAllSelectableSpecialties(
  trainers: Pick<Trainer, 'specialties'>[],
  activityCatalog: ActivityCatalogItem[],
  extraSelected: string[] = []
): string[] {
  const seen = new Set<string>();
  const list: string[] = [];

  const pushUnique = (raw: string) => {
    const cleaned = cleanDisciplineLabel(raw).slice(0, 80).trim();
    if (!cleaned) return;
    const key = normalizeDisciplineKey(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push(cleaned);
  };

  PRESET_SPECIALTIES.forEach(pushUnique);
  trainers.forEach((tr) => (tr.specialties || []).forEach(pushUnique));
  activityCatalog
    .filter((c) => c.active !== false)
    .forEach((c) => {
      const stripped = stripModalityPrefix(c.name);
      pushUnique(stripped.length >= 2 ? stripped : c.name);
    });
  extraSelected.forEach(pushUnique);

  return list;
}

export interface DatabaseDisciplineOption {
  name: string;
  activityType: ActivityType;
  durationMinutes: number;
  modalityLabel: string;
  source: 'catalog' | 'trainer';
}

export interface AssignmentDisciplineGroups {
  modalityCatalogOptions: string[];
  selectedTrainerSpecialties: string[];
  otherCatalogByType: { type: ActivityType; label: string; items: string[] }[];
  otherTrainerSpecialties: string[];
}

export function getAssignmentDisciplineGroups(params: {
  activityType: ActivityType;
  selectedTrainer?: Pick<Trainer, 'name' | 'specialties'> | null;
  trainers: Pick<Trainer, 'specialties'>[];
  activityCatalog: ActivityCatalogItem[];
  fallbackOptionsByType?: Record<ActivityType, string[]>;
}): AssignmentDisciplineGroups {
  const {
    activityType,
    selectedTrainer,
    trainers,
    activityCatalog,
    fallbackOptionsByType,
  } = params;

  const seenGlobal = new Set<string>();
  const addSeen = (label: string) => {
    const k = normalizeDisciplineKey(label);
    if (k) seenGlobal.add(k);
  };

  const activeCatalogForModality = activityCatalog
    .filter((c) => normalizeActivityType(c.activityType) === activityType && c.active !== false)
    .map((c) => cleanDisciplineLabel(c.name))
    .filter((name) => name.length >= 2);

  const modalityCatalogOptions: string[] = [];
  const rawPrimary =
    activeCatalogForModality.length > 0
      ? activeCatalogForModality
      : fallbackOptionsByType?.[activityType] || [ACTIVITY_TYPE_LABELS[activityType]];

  for (const name of rawPrimary) {
    const cleaned = cleanDisciplineLabel(name);
    const key = normalizeDisciplineKey(cleaned);
    if (cleaned.length >= 2 && !seenGlobal.has(key)) {
      addSeen(cleaned);
      modalityCatalogOptions.push(cleaned);
    }
  }

  // Selected trainer's own specialties (always exposed in a dedicated group if not exact duplicate)
  const selectedTrainerSpecialties: string[] = [];
  const seenTrainerLocal = new Set<string>();
  for (const rawSpec of selectedTrainer?.specialties || []) {
    const cleaned = cleanDisciplineLabel(rawSpec);
    const key = normalizeDisciplineKey(cleaned);
    if (cleaned.length >= 2 && !seenTrainerLocal.has(key)) {
      seenTrainerLocal.add(key);
      if (!seenGlobal.has(key)) {
        addSeen(cleaned);
        selectedTrainerSpecialties.push(cleaned);
      }
    }
  }

  // Active catalog items from the other 3 modalities so 100% of /activity_catalog is reachable
  const otherCatalogByType: { type: ActivityType; label: string; items: string[] }[] = [];
  for (const otherType of ALL_ACTIVITY_TYPES) {
    if (otherType === activityType) continue;
    const otherItems: string[] = [];
    for (const c of activityCatalog) {
      if (normalizeActivityType(c.activityType) !== otherType || c.active === false) continue;
      const cleaned = cleanDisciplineLabel(c.name);
      const key = normalizeDisciplineKey(cleaned);
      if (cleaned.length >= 2 && !seenGlobal.has(key)) {
        addSeen(cleaned);
        otherItems.push(cleaned);
      }
    }
    if (otherItems.length > 0) {
      otherCatalogByType.push({
        type: otherType,
        label: ACTIVITY_TYPE_LABELS[otherType],
        items: otherItems,
      });
    }
  }

  // Remaining specialties registered across all trainers in /trainers
  const otherTrainerSpecialties: string[] = [];
  for (const tr of trainers) {
    for (const rawSpec of tr.specialties || []) {
      const cleaned = cleanDisciplineLabel(rawSpec);
      const key = normalizeDisciplineKey(cleaned);
      if (cleaned.length >= 2 && !seenGlobal.has(key)) {
        addSeen(cleaned);
        otherTrainerSpecialties.push(cleaned);
      }
    }
  }

  return {
    modalityCatalogOptions,
    selectedTrainerSpecialties,
    otherCatalogByType,
    otherTrainerSpecialties,
  };
}

export function resolveDisciplineSelection(
  chosenName: string,
  currentType: ActivityType,
  activityCatalog: ActivityCatalogItem[]
): {
  activityName: string;
  activityType: ActivityType;
  durationMinutes: number;
} {
  const cleaned = cleanDisciplineLabel(chosenName);
  const catalogMatch = resolveCatalogMatchForDiscipline(cleaned, activityCatalog);
  if (catalogMatch) {
    const matchedType = normalizeActivityType(catalogMatch.activityType);
    return {
      activityName: cleaned,
      activityType: matchedType,
      durationMinutes:
        catalogMatch.defaultDurationMinutes > 0
          ? catalogMatch.defaultDurationMinutes
          : ACTIVITY_TYPE_DEFAULT_MINUTES[matchedType],
    };
  }

  const inferredType = inferActivityTypeFromDiscipline(cleaned, currentType);
  return {
    activityName: cleaned,
    activityType: inferredType,
    durationMinutes: ACTIVITY_TYPE_DEFAULT_MINUTES[inferredType],
  };
}

export interface TrainerSpecialtyOption {
  name: string;
  activityType: ActivityType;
  durationMinutes: number;
  modalityLabel: string;
}

function canonicalSpecialtyComparisonKey(raw: unknown): string {
  const key = normalizeDisciplineKey(stripModalityPrefix(raw));
  if (key === 'pausa activa') return 'pausas activas';
  return key;
}

export function getAllowedSpecialtiesForTrainer(
  trainer: Pick<Trainer, 'specialties'> | null | undefined,
  activityCatalog: ActivityCatalogItem[]
): TrainerSpecialtyOption[] {
  if (!trainer || !Array.isArray(trainer.specialties)) return [];

  const seen = new Set<string>();
  const options: TrainerSpecialtyOption[] = [];

  for (const rawSpec of trainer.specialties) {
    const cleaned = cleanDisciplineLabel(rawSpec);
    if (cleaned.length < 2) continue;
    const key = normalizeDisciplineKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const catalogMatch = resolveCatalogMatchForDiscipline(cleaned, activityCatalog);
    const activityType = catalogMatch
      ? normalizeActivityType(catalogMatch.activityType)
      : inferActivityTypeFromDiscipline(cleaned, 'clase_fitness');
    const durationMinutes =
      catalogMatch && catalogMatch.defaultDurationMinutes > 0
        ? catalogMatch.defaultDurationMinutes
        : ACTIVITY_TYPE_DEFAULT_MINUTES[activityType];

    options.push({
      name: cleaned,
      activityType,
      durationMinutes,
      modalityLabel: ACTIVITY_TYPE_LABELS[activityType],
    });
  }

  return options;
}

export function getAllowedActivityTypesForTrainer(
  trainer: Pick<Trainer, 'specialties'> | null | undefined,
  activityCatalog: ActivityCatalogItem[]
): ActivityType[] {
  const allowedOptions = getAllowedSpecialtiesForTrainer(trainer, activityCatalog);
  const typeSet = new Set<ActivityType>(allowedOptions.map((opt) => opt.activityType));
  return ALL_ACTIVITY_TYPES.filter((t) => typeSet.has(t));
}

export function isActivityAllowedForTrainer(
  trainer: Pick<Trainer, 'specialties'> | null | undefined,
  chosenActivityName: string
): boolean {
  if (!trainer || !Array.isArray(trainer.specialties) || trainer.specialties.length === 0) {
    return false;
  }
  const targetFull = normalizeDisciplineKey(chosenActivityName);
  const targetCanonical = canonicalSpecialtyComparisonKey(chosenActivityName);
  if (!targetFull) return false;

  return trainer.specialties.some((rawSpec) => {
    const specFull = normalizeDisciplineKey(rawSpec);
    const specCanonical = canonicalSpecialtyComparisonKey(rawSpec);
    if (!specFull) return false;
    return (
      specFull === targetFull ||
      (targetCanonical.length >= 2 && specCanonical === targetCanonical)
    );
  });
}

