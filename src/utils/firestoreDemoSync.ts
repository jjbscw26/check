import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  FIRESTORE_MIN_CREATED_AT,
  getAutoDeviceMetadata,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  getInitialRecords,
  getStoredActivityCatalog,
  getStoredAssignments,
  getStoredCompanies,
  getStoredRecords,
  getStoredTrainers,
  INITIAL_ACTIVITY_CATALOG,
  INITIAL_ASSIGNMENTS,
  INITIAL_COMPANIES,
  INITIAL_TRAINERS,
} from '../data/mockData';
import {
  ActivityCatalogItem,
  AttendanceRecord,
  ClassAssignment,
  Company,
  FacialVerificationData,
  GpsData,
  Sede,
  Trainer,
} from '../types';
import {
  AVATAR_PATTERN_REGEX,
  deriveCompanyLogoText,
  DIRECTORY_LIMITS,
  EMAIL_PATTERN_REGEX,
  generateInitialsAvatarDataUrl,
  LOGO_TEXT_PATTERN_REGEX,
  NON_EMPTY_TEXT_REGEX,
  PHONE_PATTERN_REGEX,
  sanitizeDemoCompanyInput,
  sanitizeTaxIdForFirestore,
  sanitizeTrainerInput,
  TAX_ID_PATTERN_REGEX,
  VALID_DOC_ID_REGEX,
  validateSedeInput,
} from './personnelValidation';

const AUDIT_KEYS = new Set(['createdByUid', 'createdByEmail', 'createdAt', 'updatedAt']);

const TRAINER_ALLOWED_KEYS = [
  'name',
  'email',
  'phone',
  'avatar',
  'specialties',
  'active',
] as const;

const COMPANY_ALLOWED_KEYS = [
  'name',
  'taxId',
  'industry',
  'logoText',
  'companyName',
  'phone',
  'primaryContactName',
  'address',
] as const;

const COMPANY_OPTIONAL_KEYS = [
  'companyName',
  'phone',
  'primaryContactName',
  'address',
] as const;

const SEDE_ALLOWED_KEYS = [
  'companyId',
  'companyName',
  'name',
  'address',
  'city',
  'lat',
  'lng',
  'geofenceRadiusMeters',
  'contactPerson',
  'contactRole',
  'contactPhone',
  'colorTag',
] as const;

const SEDE_OPTIONAL_KEYS = ['colorTag'] as const;

const ASSIGNMENT_ALLOWED_KEYS = [
  'trainerId',
  'trainerName',
  'companyId',
  'companyName',
  'sedeId',
  'sedeName',
  'sedeAddress',
  'frequency',
  'dayOfWeek',
  'date',
  'dayOfMonth',
  'time',
  'durationMinutes',
  'activityType',
  'activityName',
  'locationArea',
  'expectedAttendees',
  'notes',
  'active',
  'closed',
  'closedAt',
  'completedDates',
  'nonCompliant',
  'nonCompliantReason',
  'nonCompliantAt',
  'missedDates',
  'reopenedDates',
] as const;

const ASSIGNMENT_OPTIONAL_KEYS = [
  'dayOfWeek',
  'date',
  'dayOfMonth',
  'durationMinutes',
  'expectedAttendees',
  'notes',
  'closed',
  'closedAt',
  'completedDates',
  'nonCompliant',
  'nonCompliantReason',
  'nonCompliantAt',
  'missedDates',
  'reopenedDates',
] as const;

const RECORD_ALLOWED_KEYS = [
  'assignmentId',
  'trainerId',
  'trainerName',
  'companyId',
  'companyName',
  'sedeId',
  'sedeName',
  'sedeAddress',
  'date',
  'scheduledTime',
  'checkInTime',
  'checkInIso',
  'checkOutTime',
  'checkOutIso',
  'status',
  'nonComplianceReason',
  'markedNonCompliantAt',
  'punctualityStatus',
  'punctualityDiffMinutes',
  'activityType',
  'activityName',
  'attendeesCount',
  'locationArea',
  'observations',
  'checkInGps',
  'checkOutGps',
  'photoUrl',
  'exitPhotoUrl',
  'facialVerification',
  'durationMinutes',
  'plannedDurationMinutes',
  'alarmEnabled',
  'alarmSnoozedUntilIso',
  'adminVerified',
  'adminNotes',
] as const;

const RECORD_OPTIONAL_KEYS = [
  'assignmentId',
  'checkOutTime',
  'checkOutIso',
  'nonComplianceReason',
  'markedNonCompliantAt',
  'observations',
  'checkOutGps',
  'exitPhotoUrl',
  'facialVerification',
  'durationMinutes',
  'plannedDurationMinutes',
  'alarmEnabled',
  'alarmSnoozedUntilIso',
  'adminNotes',
] as const;

const CATALOG_ALLOWED_KEYS = [
  'name',
  'activityType',
  'defaultDurationMinutes',
  'description',
  'active',
] as const;

const CATALOG_OPTIONAL_KEYS = ['description'] as const;

/**
 * Per-document write serializer so rapid create -> update / compliance / delete mutations
 * on the same Firestore document never race or corrupt serverTimestamp() fields.
 */
const docWriteQueues = new Map<string, Promise<void>>();

function enqueueDocWrite(path: string, task: () => Promise<void>): Promise<void> {
  const previous = docWriteQueues.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  docWriteQueues.set(
    path,
    current.finally(() => {
      if (docWriteQueues.get(path) === current) {
        docWriteQueues.delete(path);
      }
    })
  );
  return current;
}

/**
 * Single-flight workspace sync queue so overlapping startup / manual sync calls never race.
 */
let activeSyncChain: Promise<unknown> = Promise.resolve();

function enqueueWorkspaceSync<T>(task: () => Promise<T>): Promise<T> {
  const next = activeSyncChain.catch(() => undefined).then(task);
  activeSyncChain = next.catch(() => undefined);
  return next;
}

async function readFreshDocSnapshot(
  docRef: DocumentReference<DocumentData>
): Promise<DocumentSnapshot<DocumentData>> {
  try {
    return await getDocFromServer(docRef);
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (
      msg.includes('offline') ||
      msg.includes('unavailable') ||
      msg.includes('failed to get document')
    ) {
      return await getDoc(docRef);
    }
    throw err;
  }
}

function hasValidServerAuditAndKeys(
  snap: DocumentSnapshot<DocumentData>,
  allowedDataKeys: readonly string[]
): boolean {
  if (!snap.exists()) return false;
  const d = snap.data({ serverTimestamps: 'estimate' }) || {};
  const allowedSet = new Set<string>(allowedDataKeys);

  for (const key of Object.keys(d)) {
    if (!AUDIT_KEYS.has(key) && !allowedSet.has(key)) {
      return false;
    }
  }

  const validUid =
    typeof d.createdByUid === 'string' &&
    d.createdByUid.length >= 1 &&
    d.createdByUid.length <= 128 &&
    VALID_DOC_ID_REGEX.test(d.createdByUid);

  const validEmail =
    typeof d.createdByEmail === 'string' &&
    d.createdByEmail.length >= 5 &&
    d.createdByEmail.length <= 254 &&
    EMAIL_PATTERN_REGEX.test(d.createdByEmail);

  const validCreatedAt =
    snap.metadata.hasPendingWrites ||
    (d.createdAt instanceof Timestamp &&
      d.createdAt.toMillis() >= FIRESTORE_MIN_CREATED_AT.toMillis());

  return validUid && validEmail && validCreatedAt;
}

function buildUpdatePayloadWithOptionalDeletes(
  sanitized: Record<string, unknown>,
  optionalKeys: readonly string[],
  existingData: Record<string, unknown>
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    ...sanitized,
    updatedAt: serverTimestamp(),
  };
  for (const key of optionalKeys) {
    if (!(key in sanitized) && key in existingData) {
      updateData[key] = deleteField();
    }
  }
  return updateData;
}

async function upsertOperationalDoc(params: {
  docRef: DocumentReference<DocumentData>;
  path: string;
  sanitizedPayload: Record<string, unknown>;
  allowedDataKeys: readonly string[];
  optionalKeys?: readonly string[];
  skipUpdateIfValid?: (existingData: Record<string, unknown>) => boolean;
}): Promise<'created' | 'updated' | 'unchanged'> {
  const {
    docRef,
    path,
    sanitizedPayload,
    allowedDataKeys,
    optionalKeys = [],
    skipUpdateIfValid,
  } = params;
  const meta = getAutoDeviceMetadata();

  let snap: DocumentSnapshot<DocumentData>;
  try {
    snap = await readFreshDocSnapshot(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!snap.exists()) {
    try {
      await setDoc(docRef, {
        ...sanitizedPayload,
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return 'created';
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  const existingData = snap.data({ serverTimestamps: 'estimate' }) || {};
  if (hasValidServerAuditAndKeys(snap, allowedDataKeys)) {
    if (skipUpdateIfValid && skipUpdateIfValid(existingData)) {
      return 'unchanged';
    }
    try {
      await updateDoc(
        docRef,
        buildUpdatePayloadWithOptionalDeletes(sanitizedPayload, optionalKeys, existingData)
      );
      return 'updated';
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // Legacy or corrupted document lacking valid audit metadata or containing unauthorized keys:
  // replace via delete + create so strict immutable-field update rules remain intact.
  try {
    await deleteDoc(docRef);
    await setDoc(docRef, {
      ...sanitizedPayload,
      createdByUid: meta.createdByUid,
      createdByEmail: meta.createdByEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return 'updated';
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function toSafeDocId(rawId: string | undefined, prefix: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 120);
  if (cleaned && VALID_DOC_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6).replace(/[^a-zA-Z0-9]/g, 'x')}`;
}

export function normalizeHHMM(raw: unknown, fallback = '09:00'): string {
  const s = String(raw ?? '').trim();
  const match = s.match(/^(\d{1,2}):([0-5]\d)(?::\d{1,2})?$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const mins = match[2];
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:${mins}`;
    }
  }
  return fallback;
}

function cleanBoundedText(val: unknown, fallback: string, minLen: number, maxLen: number): string {
  const s = String(val ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLen)
    .trim();
  if (s.length >= minLen && NON_EMPTY_TEXT_REGEX.test(s)) {
    return s;
  }
  return fallback;
}

function sanitizePhoneOrDefault(rawPhone: unknown, fallback = '+52 55 0000 0000'): string {
  const s = String(rawPhone ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 25)
    .trim();
  if (s.length >= 7 && s.length <= 25 && PHONE_PATTERN_REGEX.test(s)) {
    return s;
  }
  const digitsAndPlus = s.replace(/[^0-9+()\- ]/g, '').trim();
  if (
    digitsAndPlus.length >= 7 &&
    digitsAndPlus.length <= 25 &&
    PHONE_PATTERN_REGEX.test(digitsAndPlus)
  ) {
    return digitsAndPlus;
  }
  return fallback;
}

function sanitizeEmailOrDefault(rawEmail: unknown, fallbackLocalPart: string): string {
  const cleaned = String(rawEmail ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .slice(0, DIRECTORY_LIMITS.email.max);
  if (
    cleaned.length >= DIRECTORY_LIMITS.email.min &&
    cleaned.length <= DIRECTORY_LIMITS.email.max &&
    EMAIL_PATTERN_REGEX.test(cleaned)
  ) {
    return cleaned;
  }
  const safeLocal =
    fallbackLocalPart.replace(/[^a-zA-Z0-9._\-]/g, '').slice(0, 60).toLowerCase() || 'entrenador';
  return `${safeLocal}@bscw.corp`;
}

/**
 * Compresses raster data:image/* strings if they exceed maxChars so documents
 * always stay comfortably below Firestore's field & 1MB document limits.
 */
async function compressEvidenceDataUrlIfNeeded(
  rawUrl: string | undefined,
  maxChars: number,
  fallbackUrl?: string
): Promise<string> {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return fallbackUrl || '';
  }
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  if (typeof document === 'undefined' || !trimmed.startsWith('data:image/')) {
    return fallbackUrl || trimmed.slice(0, maxChars);
  }
  if (trimmed.startsWith('data:image/svg+xml')) {
    return fallbackUrl && fallbackUrl.length <= maxChars ? fallbackUrl : trimmed.slice(0, maxChars);
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 780;
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(fallbackUrl || trimmed.slice(0, maxChars));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.7;
        let compressed = canvas.toDataURL('image/jpeg', quality);
        while (compressed.length > maxChars && quality > 0.3) {
          quality -= 0.15;
          compressed = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(
          compressed.length <= maxChars ? compressed : fallbackUrl || compressed.slice(0, maxChars)
        );
      } catch {
        resolve(fallbackUrl || trimmed.slice(0, maxChars));
      }
    };
    img.onerror = () => {
      resolve(fallbackUrl || trimmed.slice(0, maxChars));
    };
    img.src = trimmed;
  });
}

// ============================================================================
// 1. TRAINERS (/trainers/{trainerId})
// ============================================================================

async function buildNormalizedTrainerPayload(
  trainer: Trainer,
  docId: string
): Promise<Record<string, unknown>> {
  const safeName = cleanBoundedText(trainer.name, 'Entrenador BSCW', 2, 120);
  const fallbackAvatar = generateInitialsAvatarDataUrl(safeName);
  const candidateAvatar = await compressEvidenceDataUrlIfNeeded(
    trainer.avatar || fallbackAvatar,
    145000,
    fallbackAvatar
  );
  const validAvatar =
    candidateAvatar &&
    candidateAvatar.length >= DIRECTORY_LIMITS.avatar.min &&
    candidateAvatar.length <= DIRECTORY_LIMITS.avatar.max &&
    AVATAR_PATTERN_REGEX.test(candidateAvatar)
      ? candidateAvatar
      : fallbackAvatar;

  const sanitized = sanitizeTrainerInput({
    name: safeName,
    email: sanitizeEmailOrDefault(trainer.email, docId),
    phone: sanitizePhoneOrDefault(trainer.phone),
    avatar: validAvatar,
    specialties:
      Array.isArray(trainer.specialties) && trainer.specialties.length > 0
        ? trainer.specialties
        : ['Pausas Activas'],
    active: trainer.active !== false,
  });

  const guaranteedSpecialties =
    sanitized.specialties.length >= 1 && NON_EMPTY_TEXT_REGEX.test(sanitized.specialties[0])
      ? sanitized.specialties
      : ['Pausas Activas'];

  return {
    name: sanitized.name,
    email: sanitized.email,
    phone: sanitized.phone,
    avatar:
      sanitized.avatar && AVATAR_PATTERN_REGEX.test(sanitized.avatar)
        ? sanitized.avatar
        : fallbackAvatar,
    specialties: guaranteedSpecialties,
    active: sanitized.active,
  };
}

function isExistingTrainerValid(d: Record<string, unknown>): boolean {
  return (
    typeof d.name === 'string' &&
    d.name.length >= 2 &&
    d.name.length <= 120 &&
    NON_EMPTY_TEXT_REGEX.test(d.name) &&
    typeof d.email === 'string' &&
    d.email.length >= 5 &&
    d.email.length <= 254 &&
    EMAIL_PATTERN_REGEX.test(d.email) &&
    typeof d.phone === 'string' &&
    d.phone.length >= 7 &&
    d.phone.length <= 25 &&
    PHONE_PATTERN_REGEX.test(d.phone) &&
    typeof d.avatar === 'string' &&
    d.avatar.length >= 5 &&
    d.avatar.length <= 150000 &&
    AVATAR_PATTERN_REGEX.test(d.avatar) &&
    Array.isArray(d.specialties) &&
    d.specialties.length >= 1 &&
    d.specialties.length <= 20 &&
    typeof d.specialties[0] === 'string' &&
    d.specialties[0].length >= 1 &&
    d.specialties[0].length <= 80 &&
    NON_EMPTY_TEXT_REGEX.test(d.specialties[0]) &&
    typeof d.active === 'boolean'
  );
}

export async function saveTrainerToFirestore(
  trainer: Trainer,
  options?: { onlyIfMissing?: boolean }
): Promise<boolean> {
  const docId = toSafeDocId(trainer.id, 'tr');
  const docRef = doc(db, 'trainers', docId);
  const path = `trainers/${docId}`;
  let changed = false;

  await enqueueDocWrite(path, async () => {
    const sanitizedPayload = await buildNormalizedTrainerPayload(trainer, docId);
    const result = await upsertOperationalDoc({
      docRef,
      path,
      sanitizedPayload,
      allowedDataKeys: TRAINER_ALLOWED_KEYS,
      skipUpdateIfValid: options?.onlyIfMissing ? isExistingTrainerValid : undefined,
    });
    changed = result !== 'unchanged';
  });

  return changed;
}

export async function deleteTrainerFromFirestore(trainerId: string): Promise<void> {
  const docId = toSafeDocId(trainerId, 'tr');
  const path = `trainers/${docId}`;
  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'trainers', docId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// 2. COMPANIES (/companies/{companyId})
// ============================================================================

function buildNormalizedCompanyPayload(
  company: Partial<Company> & { name?: string; companyName?: string }
): Record<string, unknown> {
  const rawName = company.name || company.companyName || 'Empresa Corporativa';
  const safeName = cleanBoundedText(rawName, 'Empresa Corporativa', 2, 150);
  const safeIndustry = cleanBoundedText(company.industry, 'Servicios Corporativos', 2, 100);
  const safeTaxId = sanitizeTaxIdForFirestore(company.taxId);
  const safeLogoText = deriveCompanyLogoText(safeName, company.logoText);

  const sanitized = sanitizeDemoCompanyInput({
    name: safeName,
    taxId: safeTaxId,
    industry: safeIndustry,
    logoText: safeLogoText,
  });

  const finalTaxId =
    sanitized.taxId.length >= DIRECTORY_LIMITS.taxId.min &&
    sanitized.taxId.length <= DIRECTORY_LIMITS.taxId.max &&
    TAX_ID_PATTERN_REGEX.test(sanitized.taxId)
      ? sanitized.taxId
      : 'XAXX010101000';

  const finalLogoText =
    sanitized.logoText.length >= DIRECTORY_LIMITS.logoText.min &&
    sanitized.logoText.length <= DIRECTORY_LIMITS.logoText.max &&
    LOGO_TEXT_PATTERN_REGEX.test(sanitized.logoText)
      ? sanitized.logoText
      : 'CP';

  return {
    name: cleanBoundedText(sanitized.name, 'Empresa Corporativa', 2, 150),
    taxId: finalTaxId,
    industry: cleanBoundedText(sanitized.industry, 'Servicios Corporativos', 2, 100),
    logoText: finalLogoText,
  };
}

function isExistingCompanyValid(d: Record<string, unknown>): boolean {
  const coreValid =
    typeof d.name === 'string' &&
    d.name.length >= 2 &&
    d.name.length <= 150 &&
    NON_EMPTY_TEXT_REGEX.test(d.name) &&
    typeof d.taxId === 'string' &&
    d.taxId.length >= 5 &&
    d.taxId.length <= 25 &&
    TAX_ID_PATTERN_REGEX.test(d.taxId) &&
    typeof d.industry === 'string' &&
    d.industry.length >= 2 &&
    d.industry.length <= 100 &&
    NON_EMPTY_TEXT_REGEX.test(d.industry) &&
    typeof d.logoText === 'string' &&
    d.logoText.length >= 1 &&
    d.logoText.length <= 4 &&
    LOGO_TEXT_PATTERN_REGEX.test(d.logoText);

  if (!coreValid) return false;

  if ('companyName' in d) {
    if (
      typeof d.companyName !== 'string' ||
      d.companyName.length < 2 ||
      d.companyName.length > 150 ||
      !NON_EMPTY_TEXT_REGEX.test(d.companyName)
    ) {
      return false;
    }
  }
  if ('phone' in d) {
    if (
      typeof d.phone !== 'string' ||
      d.phone.length > 25 ||
      (d.phone.length > 0 && !PHONE_PATTERN_REGEX.test(d.phone))
    ) {
      return false;
    }
  }
  if ('primaryContactName' in d) {
    if (
      typeof d.primaryContactName !== 'string' ||
      d.primaryContactName.length > 120 ||
      (d.primaryContactName.length > 0 && !NON_EMPTY_TEXT_REGEX.test(d.primaryContactName))
    ) {
      return false;
    }
  }
  if ('address' in d) {
    return false;
  }

  return true;
}

export async function ensureCompanyExistsInFirestore(
  companyId: string,
  fallbackCompany: Partial<Company> & { name: string }
): Promise<string> {
  const docId = toSafeDocId(companyId, 'comp');
  const docRef = doc(db, 'companies', docId);
  const path = `companies/${docId}`;

  await enqueueDocWrite(path, async () => {
    const sanitizedPayload = buildNormalizedCompanyPayload(fallbackCompany);
    await upsertOperationalDoc({
      docRef,
      path,
      sanitizedPayload,
      allowedDataKeys: COMPANY_ALLOWED_KEYS,
      optionalKeys: COMPANY_OPTIONAL_KEYS,
      skipUpdateIfValid: isExistingCompanyValid,
    });
  });

  return docId;
}

export async function saveCompanyToFirestore(
  company: Company,
  options?: { onlyIfMissing?: boolean }
): Promise<boolean> {
  const docId = toSafeDocId(company.id, 'comp');
  const docRef = doc(db, 'companies', docId);
  const path = `companies/${docId}`;
  let changed = false;

  await enqueueDocWrite(path, async () => {
    const sanitizedPayload = buildNormalizedCompanyPayload(company);
    const result = await upsertOperationalDoc({
      docRef,
      path,
      sanitizedPayload,
      allowedDataKeys: COMPANY_ALLOWED_KEYS,
      optionalKeys: COMPANY_OPTIONAL_KEYS,
      skipUpdateIfValid: options?.onlyIfMissing ? isExistingCompanyValid : undefined,
    });
    changed = result !== 'unchanged';
  });

  return changed;
}

export async function deleteCompanyAndSedesFromFirestore(companyId: string): Promise<void> {
  const docId = toSafeDocId(companyId, 'comp');
  const path = `companies/${docId}`;

  return enqueueDocWrite(path, async () => {
    const sedesQuery = query(
      collection(db, 'sedes'),
      where('createdAt', '>=', FIRESTORE_MIN_CREATED_AT)
    );
    const assignmentsQuery = query(
      collection(db, 'assignments'),
      where('createdAt', '>=', FIRESTORE_MIN_CREATED_AT)
    );

    try {
      const [sedesSnap, assignmentsSnap] = await Promise.all([
        getDocs(sedesQuery),
        getDocs(assignmentsQuery),
      ]);
      const batch = writeBatch(db);
      sedesSnap.docs.forEach((sDoc) => {
        if (sDoc.data().companyId === docId) {
          batch.delete(sDoc.ref);
        }
      });
      assignmentsSnap.docs.forEach((aDoc) => {
        if (aDoc.data().companyId === docId) {
          batch.delete(aDoc.ref);
        }
      });
      batch.delete(doc(db, 'companies', docId));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// 3. SEDES (/sedes/{sedeId})
// ============================================================================

function isExistingSedeValid(d: Record<string, unknown>, expectedCompanyId: string): boolean {
  return (
    d.companyId === expectedCompanyId &&
    typeof d.companyName === 'string' &&
    d.companyName.length >= 2 &&
    d.companyName.length <= 150 &&
    NON_EMPTY_TEXT_REGEX.test(d.companyName) &&
    typeof d.name === 'string' &&
    d.name.length >= 2 &&
    d.name.length <= 150 &&
    NON_EMPTY_TEXT_REGEX.test(d.name) &&
    typeof d.address === 'string' &&
    d.address.length >= 3 &&
    d.address.length <= 250 &&
    NON_EMPTY_TEXT_REGEX.test(d.address) &&
    typeof d.city === 'string' &&
    d.city.length >= 2 &&
    d.city.length <= 100 &&
    NON_EMPTY_TEXT_REGEX.test(d.city) &&
    typeof d.lat === 'number' &&
    Number.isFinite(d.lat) &&
    d.lat >= -90 &&
    d.lat <= 90 &&
    typeof d.lng === 'number' &&
    Number.isFinite(d.lng) &&
    d.lng >= -180 &&
    d.lng <= 180 &&
    typeof d.geofenceRadiusMeters === 'number' &&
    Number.isFinite(d.geofenceRadiusMeters) &&
    d.geofenceRadiusMeters >= 10 &&
    d.geofenceRadiusMeters <= 10000 &&
    typeof d.contactPerson === 'string' &&
    d.contactPerson.length >= 2 &&
    d.contactPerson.length <= 120 &&
    NON_EMPTY_TEXT_REGEX.test(d.contactPerson) &&
    typeof d.contactRole === 'string' &&
    d.contactRole.length >= 2 &&
    d.contactRole.length <= 120 &&
    NON_EMPTY_TEXT_REGEX.test(d.contactRole) &&
    typeof d.contactPhone === 'string' &&
    d.contactPhone.length >= 7 &&
    d.contactPhone.length <= 25 &&
    PHONE_PATTERN_REGEX.test(d.contactPhone)
  );
}

export async function saveSedeToFirestore(
  sede: Sede,
  parentCompany?: Partial<Company>,
  options?: { onlyIfMissing?: boolean }
): Promise<boolean> {
  const docId = toSafeDocId(sede.id, 'sede');
  const companyDocId = await ensureCompanyExistsInFirestore(sede.companyId, {
    id: sede.companyId,
    name: parentCompany?.name || sede.companyName || 'Empresa Corporativa',
    taxId: parentCompany?.taxId,
    industry: parentCompany?.industry,
    logoText: parentCompany?.logoText,
  });

  const docRef = doc(db, 'sedes', docId);
  const path = `sedes/${docId}`;
  let changed = false;

  await enqueueDocWrite(path, async () => {
    const checked = validateSedeInput({
      companyId: companyDocId,
      companyName: cleanBoundedText(
        parentCompany?.name || sede.companyName,
        'Empresa Corporativa',
        2,
        150
      ),
      name: cleanBoundedText(sede.name, 'Sede Corporativa', 2, 150),
      address: cleanBoundedText(sede.address, 'Dirección Corporativa', 3, 250),
      city: cleanBoundedText(sede.city, 'Ciudad de México', 2, 100),
      lat: String(
        Number.isFinite(sede.lat) ? Math.min(90, Math.max(-90, Number(sede.lat))) : 19.42694
      ),
      lng: String(
        Number.isFinite(sede.lng) ? Math.min(180, Math.max(-180, Number(sede.lng))) : -99.16782
      ),
      geofenceRadiusMeters: String(
        Number.isFinite(sede.geofenceRadiusMeters)
          ? Math.min(10000, Math.max(10, Math.round(sede.geofenceRadiusMeters)))
          : 150
      ),
      contactPerson: cleanBoundedText(sede.contactPerson, 'Encargado de Sede', 2, 120),
      contactRole: cleanBoundedText(
        sede.contactRole,
        'Coordinador de Salud en el Trabajo',
        2,
        120
      ),
      contactPhone: sanitizePhoneOrDefault(sede.contactPhone),
      colorTag:
        sede.colorTag && /^[a-zA-Z0-9_\-]+$/.test(sede.colorTag)
          ? sede.colorTag.slice(0, 40)
          : 'bg-red-600',
    });

    const payload = checked.sanitized;
    const sanitizedFields: Record<string, unknown> = {
      companyId: payload.companyId,
      companyName: payload.companyName,
      name: payload.name,
      address: payload.address,
      city: payload.city,
      lat: payload.lat,
      lng: payload.lng,
      geofenceRadiusMeters: payload.geofenceRadiusMeters,
      contactPerson: payload.contactPerson,
      contactRole: payload.contactRole,
      contactPhone: payload.contactPhone,
      colorTag: payload.colorTag || 'bg-red-600',
    };

    const result = await upsertOperationalDoc({
      docRef,
      path,
      sanitizedPayload: sanitizedFields,
      allowedDataKeys: SEDE_ALLOWED_KEYS,
      optionalKeys: SEDE_OPTIONAL_KEYS,
      skipUpdateIfValid: options?.onlyIfMissing
        ? (d) => isExistingSedeValid(d, companyDocId)
        : undefined,
    });
    changed = result !== 'unchanged';
  });

  return changed;
}

export async function deleteSedeFromFirestore(sedeId: string): Promise<void> {
  const docId = toSafeDocId(sedeId, 'sede');
  const path = `sedes/${docId}`;
  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'sedes', docId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// 4. CALENDAR ASSIGNMENTS (/assignments/{assignmentId})
// ============================================================================

function sanitizeAssignmentFields(asg: ClassAssignment): Record<string, unknown> {
  const safeTime = normalizeHHMM(asg.time, '09:00');

  const freq =
    asg.frequency === 'semanal' || asg.frequency === 'mensual' || asg.frequency === 'fecha_unica'
      ? asg.frequency
      : 'semanal';

  const actType =
    asg.activityType === 'pausa_activa' || asg.activityType === 'clase_fitness'
      ? asg.activityType
      : 'pausa_activa';

  const locArea = cleanBoundedText(asg.locationArea, 'Área General', 1, 150);
  const safeCompanyId = toSafeDocId(asg.companyId, 'comp');
  const rawSedeId = String(asg.sedeId || '').trim();
  const safeSedeId =
    !rawSedeId || rawSedeId === 'sede_default'
      ? toSafeDocId(`sede_principal_${safeCompanyId}`, 'sede')
      : toSafeDocId(rawSedeId, 'sede');

  const cleanDateList = (arr?: string[]) =>
    Array.isArray(arr)
      ? arr
          .filter((d) => typeof d === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d))
          .slice(0, 366)
      : undefined;

  const data: Record<string, unknown> = {
    trainerId: toSafeDocId(asg.trainerId, 'tr'),
    trainerName: cleanBoundedText(asg.trainerName, 'Entrenador BSCW', 2, 120),
    companyId: safeCompanyId,
    companyName: cleanBoundedText(asg.companyName, 'Empresa Corporativa', 2, 150),
    sedeId: safeSedeId,
    sedeName: cleanBoundedText(asg.sedeName, 'Sede Principal', 2, 150),
    sedeAddress: cleanBoundedText(asg.sedeAddress, 'Dirección Sede Corporativa', 3, 250),
    frequency: freq,
    time: safeTime,
    activityType: actType,
    activityName: cleanBoundedText(asg.activityName, 'Pausa Activa', 2, 150),
    locationArea: locArea,
    active: asg.active !== false,
  };

  if (typeof asg.dayOfWeek === 'number' && !Number.isNaN(asg.dayOfWeek)) {
    data.dayOfWeek = Math.min(7, Math.max(0, Math.round(asg.dayOfWeek)));
  }
  if (typeof asg.date === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(asg.date)) {
    data.date = asg.date;
  }
  if (typeof asg.dayOfMonth === 'number' && !Number.isNaN(asg.dayOfMonth)) {
    data.dayOfMonth = Math.min(31, Math.max(1, Math.round(asg.dayOfMonth)));
  }
  if (typeof asg.durationMinutes === 'number' && !Number.isNaN(asg.durationMinutes)) {
    data.durationMinutes = Math.min(480, Math.max(5, Math.round(asg.durationMinutes)));
  }
  if (typeof asg.expectedAttendees === 'number' && !Number.isNaN(asg.expectedAttendees)) {
    data.expectedAttendees = Math.min(5000, Math.max(0, Math.round(asg.expectedAttendees)));
  }
  if (typeof asg.notes === 'string') {
    data.notes = asg.notes.slice(0, 500);
  }
  if (typeof asg.closed === 'boolean') {
    data.closed = asg.closed;
  }
  if (typeof asg.closedAt === 'string' && asg.closedAt.trim()) {
    data.closedAt = asg.closedAt.trim().slice(0, 40);
  }
  const completedDates = cleanDateList(asg.completedDates);
  if (completedDates) {
    data.completedDates = completedDates;
  }
  if (typeof asg.nonCompliant === 'boolean') {
    data.nonCompliant = asg.nonCompliant;
  }
  if (
    asg.nonCompliantReason === 'fuera_de_horario' ||
    asg.nonCompliantReason === 'sin_cierre_30m' ||
    asg.nonCompliantReason === 'manual_admin'
  ) {
    data.nonCompliantReason = asg.nonCompliantReason;
  }
  if (typeof asg.nonCompliantAt === 'string' && asg.nonCompliantAt.trim()) {
    data.nonCompliantAt = asg.nonCompliantAt.trim().slice(0, 40);
  }
  const missedDates = cleanDateList(asg.missedDates);
  if (missedDates) {
    data.missedDates = missedDates;
  }
  const reopenedDates = cleanDateList(asg.reopenedDates);
  if (reopenedDates) {
    data.reopenedDates = reopenedDates;
  }

  return data;
}

function isExistingAssignmentValid(
  d: Record<string, unknown>,
  companyId: string,
  sedeId: string
): boolean {
  return (
    d.companyId === companyId &&
    d.sedeId === sedeId &&
    typeof d.trainerId === 'string' &&
    VALID_DOC_ID_REGEX.test(d.trainerId) &&
    typeof d.trainerName === 'string' &&
    d.trainerName.length >= 2 &&
    typeof d.activityName === 'string' &&
    d.activityName.length >= 2 &&
    typeof d.time === 'string' &&
    /^[0-2][0-9]:[0-5][0-9]$/.test(d.time) &&
    typeof d.active === 'boolean'
  );
}

export async function saveAssignmentToFirestore(
  assignment: ClassAssignment,
  parentCompany?: Partial<Company>,
  parentSede?: Partial<Sede>,
  options?: { onlyIfMissing?: boolean }
): Promise<boolean> {
  const docId = toSafeDocId(assignment.id, 'asg');
  const payload = sanitizeAssignmentFields(assignment);
  const companyId = String(payload.companyId);
  const sedeId = String(payload.sedeId);

  // Guarantee parent company and sede exist on the server BEFORE writing assignment
  await saveSedeToFirestore(
    {
      id: sedeId,
      companyId,
      companyName: parentCompany?.name || String(payload.companyName),
      name: parentSede?.name || String(payload.sedeName),
      address:
        parentSede?.address && parentSede.address.trim().length >= 3
          ? parentSede.address
          : cleanBoundedText(payload.sedeAddress, 'Dirección Sede Corporativa', 3, 250),
      city: parentSede?.city || 'Ciudad de México',
      lat: parentSede?.lat ?? 19.42694,
      lng: parentSede?.lng ?? -99.16782,
      geofenceRadiusMeters: parentSede?.geofenceRadiusMeters ?? 150,
      contactPerson: parentSede?.contactPerson || 'Encargado de Sede',
      contactRole: parentSede?.contactRole || 'Coordinador de Salud en el Trabajo',
      contactPhone: parentSede?.contactPhone || '+52 55 0000 0000',
      colorTag: parentSede?.colorTag || 'bg-red-600',
    },
    {
      id: companyId,
      name: parentCompany?.name || String(payload.companyName),
      taxId: parentCompany?.taxId,
      industry: parentCompany?.industry,
      logoText: parentCompany?.logoText,
    },
    { onlyIfMissing: true }
  );

  const docRef = doc(db, 'assignments', docId);
  const path = `assignments/${docId}`;
  let changed = false;

  await enqueueDocWrite(path, async () => {
    const result = await upsertOperationalDoc({
      docRef,
      path,
      sanitizedPayload: payload,
      allowedDataKeys: ASSIGNMENT_ALLOWED_KEYS,
      optionalKeys: ASSIGNMENT_OPTIONAL_KEYS,
      skipUpdateIfValid: options?.onlyIfMissing
        ? (d) => isExistingAssignmentValid(d, companyId, sedeId)
        : undefined,
    });
    changed = result !== 'unchanged';
  });

  return changed;
}

export async function deleteAssignmentFromFirestore(assignmentId: string): Promise<void> {
  const docId = toSafeDocId(assignmentId, 'asg');
  const path = `assignments/${docId}`;
  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'assignments', docId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// 5. CALENDAR SESSION RECORDS (/records/{recordId})
// ============================================================================

function sanitizeGpsData(gps: GpsData | undefined): Record<string, unknown> {
  const lat = Number.isFinite(gps?.lat) ? Math.min(90, Math.max(-90, Number(gps!.lat))) : 19.42694;
  const lng = Number.isFinite(gps?.lng)
    ? Math.min(180, Math.max(-180, Number(gps!.lng)))
    : -99.16782;
  const accuracy = Number.isFinite(gps?.accuracy)
    ? Math.min(100000, Math.max(0, Number(gps!.accuracy)))
    : 10;
  const distanceToSedeMeters = Number.isFinite(gps?.distanceToSedeMeters)
    ? Math.min(50000000, Math.max(0, Number(gps!.distanceToSedeMeters)))
    : 0;
  const capturedAt = cleanBoundedText(
    gps?.capturedAt,
    new Date().toISOString().slice(0, 19),
    1,
    50
  );

  return {
    lat,
    lng,
    accuracy,
    distanceToSedeMeters,
    isWithinGeofence: Boolean(gps?.isWithinGeofence),
    capturedAt,
  };
}

async function sanitizeFacialVerification(
  fv: FacialVerificationData | undefined,
  fallbackTrainerName: string
): Promise<Record<string, unknown> | undefined> {
  if (!fv || typeof fv !== 'object') return undefined;
  const facePhotoUrl = await compressEvidenceDataUrlIfNeeded(
    fv.facePhotoUrl,
    200000,
    generateInitialsAvatarDataUrl(fv.trainerName || fallbackTrainerName)
  );
  if (!facePhotoUrl || facePhotoUrl.length < 5) return undefined;

  return {
    verified: Boolean(fv.verified),
    confidenceScore: Number.isFinite(fv.confidenceScore)
      ? Math.min(100, Math.max(0, Number(fv.confidenceScore)))
      : 98.0,
    facePhotoUrl,
    capturedAt: cleanBoundedText(fv.capturedAt, '09:00:00', 1, 50),
    biometricId: cleanBoundedText(fv.biometricId, 'BSCW-FACE-VERIFIED', 1, 80),
    livenessPassed: fv.livenessPassed !== false,
    trainerName: cleanBoundedText(fv.trainerName, fallbackTrainerName, 1, 120),
  };
}

async function sanitizeAttendanceRecordFields(
  rec: AttendanceRecord
): Promise<Record<string, unknown>> {
  const safeTrainerName = cleanBoundedText(rec.trainerName, 'Entrenador BSCW', 2, 120);
  const safeDate =
    typeof rec.date === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rec.date)
      ? rec.date
      : new Date().toISOString().slice(0, 10);

  const safeScheduledTime = normalizeHHMM(rec.scheduledTime, '09:00');
  const safeCheckInTime = cleanBoundedText(rec.checkInTime, `${safeScheduledTime}:00`, 4, 20);
  const safeCheckInIso = cleanBoundedText(
    rec.checkInIso,
    `${safeDate}T${safeScheduledTime}:00.000Z`,
    10,
    50
  );

  const safeStatus =
    rec.status === 'en_curso' || rec.status === 'completado' || rec.status === 'incumplido'
      ? rec.status
      : 'en_curso';

  const safePunctuality =
    rec.punctualityStatus === 'a_tiempo' ||
    rec.punctualityStatus === 'con_retraso' ||
    rec.punctualityStatus === 'adelantado'
      ? rec.punctualityStatus
      : 'a_tiempo';

  const safeDiff = Number.isFinite(rec.punctualityDiffMinutes)
    ? Math.min(1440, Math.max(-1440, Math.round(rec.punctualityDiffMinutes)))
    : 0;

  const safeActType =
    rec.activityType === 'clase_fitness' ? 'clase_fitness' : 'pausa_activa';

  const fallbackPhoto = generateInitialsAvatarDataUrl(safeTrainerName);
  const safePhotoUrl = await compressEvidenceDataUrlIfNeeded(rec.photoUrl, 220000, fallbackPhoto);

  const safeCompanyId = toSafeDocId(rec.companyId, 'comp');
  const rawSedeId = String(rec.sedeId || '').trim();
  const safeSedeId =
    !rawSedeId || rawSedeId === 'sede_default'
      ? toSafeDocId(`sede_principal_${safeCompanyId}`, 'sede')
      : toSafeDocId(rawSedeId, 'sede');

  const payload: Record<string, unknown> = {
    trainerId: toSafeDocId(rec.trainerId, 'tr'),
    trainerName: safeTrainerName,
    companyId: safeCompanyId,
    companyName: cleanBoundedText(rec.companyName, 'Empresa Corporativa', 2, 150),
    sedeId: safeSedeId,
    sedeName: cleanBoundedText(rec.sedeName, 'Sede Principal', 2, 150),
    sedeAddress: cleanBoundedText(rec.sedeAddress, 'Dirección Sede Corporativa', 3, 250),
    date: safeDate,
    scheduledTime: safeScheduledTime,
    checkInTime: safeCheckInTime,
    checkInIso: safeCheckInIso,
    status: safeStatus,
    punctualityStatus: safePunctuality,
    punctualityDiffMinutes: safeDiff,
    activityType: safeActType,
    activityName: cleanBoundedText(rec.activityName, 'Pausa Activa', 2, 150),
    attendeesCount: Number.isFinite(rec.attendeesCount)
      ? Math.min(10000, Math.max(0, Math.round(rec.attendeesCount)))
      : 0,
    locationArea: cleanBoundedText(rec.locationArea, 'Área General', 1, 150),
    checkInGps: sanitizeGpsData(rec.checkInGps),
    photoUrl: safePhotoUrl && safePhotoUrl.length >= 5 ? safePhotoUrl : fallbackPhoto,
    adminVerified: Boolean(rec.adminVerified),
  };

  if (rec.assignmentId) {
    payload.assignmentId = toSafeDocId(rec.assignmentId, 'asg');
  }
  if (rec.checkOutTime === null) {
    payload.checkOutTime = null;
  } else if (typeof rec.checkOutTime === 'string' && rec.checkOutTime.trim()) {
    payload.checkOutTime = rec.checkOutTime.trim().slice(0, 20);
  }
  if (rec.checkOutIso === null) {
    payload.checkOutIso = null;
  } else if (typeof rec.checkOutIso === 'string' && rec.checkOutIso.trim()) {
    payload.checkOutIso = rec.checkOutIso.trim().slice(0, 50);
  }
  if (
    rec.nonComplianceReason === 'fuera_de_horario' ||
    rec.nonComplianceReason === 'sin_cierre_30m' ||
    rec.nonComplianceReason === 'manual_admin'
  ) {
    payload.nonComplianceReason = rec.nonComplianceReason;
  }
  if (typeof rec.markedNonCompliantAt === 'string' && rec.markedNonCompliantAt.trim()) {
    payload.markedNonCompliantAt = rec.markedNonCompliantAt.trim().slice(0, 40);
  }
  if (typeof rec.observations === 'string') {
    payload.observations = rec.observations.slice(0, 1000);
  }
  if (rec.checkOutGps) {
    payload.checkOutGps = sanitizeGpsData(rec.checkOutGps);
  }
  if (typeof rec.exitPhotoUrl === 'string' && rec.exitPhotoUrl.trim()) {
    const compressedExit = await compressEvidenceDataUrlIfNeeded(rec.exitPhotoUrl, 220000);
    if (compressedExit) {
      payload.exitPhotoUrl = compressedExit;
    }
  }
  const safeFacial = await sanitizeFacialVerification(rec.facialVerification, safeTrainerName);
  if (safeFacial) {
    payload.facialVerification = safeFacial;
  }
  if (typeof rec.durationMinutes === 'number' && Number.isFinite(rec.durationMinutes)) {
    payload.durationMinutes = Math.min(1440, Math.max(0, Math.round(rec.durationMinutes)));
  }
  if (
    typeof rec.plannedDurationMinutes === 'number' &&
    Number.isFinite(rec.plannedDurationMinutes)
  ) {
    payload.plannedDurationMinutes = Math.min(
      480,
      Math.max(1, Math.round(rec.plannedDurationMinutes))
    );
  }
  if (typeof rec.alarmEnabled === 'boolean') {
    payload.alarmEnabled = rec.alarmEnabled;
  }
  if (rec.alarmSnoozedUntilIso === null) {
    payload.alarmSnoozedUntilIso = null;
  } else if (
    typeof rec.alarmSnoozedUntilIso === 'string' &&
    rec.alarmSnoozedUntilIso.trim()
  ) {
    payload.alarmSnoozedUntilIso = rec.alarmSnoozedUntilIso.trim().slice(0, 50);
  }
  if (typeof rec.adminNotes === 'string') {
    payload.adminNotes = rec.adminNotes.slice(0, 1000);
  }

  return payload;
}

function isExistingRecordValid(d: Record<string, unknown>): boolean {
  return (
    typeof d.trainerId === 'string' &&
    typeof d.companyId === 'string' &&
    typeof d.sedeId === 'string' &&
    typeof d.date === 'string' &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d.date) &&
    typeof d.scheduledTime === 'string' &&
    /^[0-2][0-9]:[0-5][0-9]$/.test(d.scheduledTime) &&
    typeof d.status === 'string' &&
    (d.status === 'en_curso' || d.status === 'completado' || d.status === 'incumplido') &&
    typeof d.photoUrl === 'string' &&
    d.photoUrl.length >= 5 &&
    typeof d.adminVerified === 'boolean'
  );
}

export async function saveRecordToFirestore(
  record: AttendanceRecord,
  options?: { onlyIfMissing?: boolean }
): Promise<boolean> {
  const docId = toSafeDocId(record.id, 'rec');
  const docRef = doc(db, 'records', docId);
  const path = `records/${docId}`;
  let changed = false;

  await enqueueDocWrite(path, async () => {
    const payload = await sanitizeAttendanceRecordFields(record);
    const result = await upsertOperationalDoc({
      docRef,
      path,
      sanitizedPayload: payload,
      allowedDataKeys: RECORD_ALLOWED_KEYS,
      optionalKeys: RECORD_OPTIONAL_KEYS,
      skipUpdateIfValid: options?.onlyIfMissing ? isExistingRecordValid : undefined,
    });
    changed = result !== 'unchanged';
  });

  return changed;
}

export async function deleteRecordFromFirestore(recordId: string): Promise<void> {
  const docId = toSafeDocId(recordId, 'rec');
  const path = `records/${docId}`;
  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'records', docId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// 6. ACTIVITY CATALOG (/activity_catalog/{catalogId})
// ============================================================================

function sanitizeActivityCatalogFields(item: ActivityCatalogItem): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: cleanBoundedText(item.name, 'Pausa Activa General', 2, 150),
    activityType: item.activityType === 'clase_fitness' ? 'clase_fitness' : 'pausa_activa',
    defaultDurationMinutes: Number.isFinite(item.defaultDurationMinutes)
      ? Math.min(480, Math.max(5, Math.round(item.defaultDurationMinutes)))
      : 20,
    active: item.active !== false,
  };
  if (typeof item.description === 'string') {
    payload.description = item.description.slice(0, 500);
  }
  return payload;
}

function isExistingCatalogValid(d: Record<string, unknown>): boolean {
  return (
    typeof d.name === 'string' &&
    d.name.length >= 2 &&
    d.name.length <= 150 &&
    NON_EMPTY_TEXT_REGEX.test(d.name) &&
    (d.activityType === 'pausa_activa' || d.activityType === 'clase_fitness') &&
    typeof d.defaultDurationMinutes === 'number' &&
    Number.isFinite(d.defaultDurationMinutes) &&
    d.defaultDurationMinutes >= 5 &&
    d.defaultDurationMinutes <= 480 &&
    typeof d.active === 'boolean'
  );
}

export async function saveActivityCatalogItemToFirestore(
  item: ActivityCatalogItem,
  options?: { onlyIfMissing?: boolean }
): Promise<boolean> {
  const docId = toSafeDocId(item.id, 'cat');
  const docRef = doc(db, 'activity_catalog', docId);
  const path = `activity_catalog/${docId}`;
  let changed = false;

  await enqueueDocWrite(path, async () => {
    const payload = sanitizeActivityCatalogFields(item);
    const result = await upsertOperationalDoc({
      docRef,
      path,
      sanitizedPayload: payload,
      allowedDataKeys: CATALOG_ALLOWED_KEYS,
      optionalKeys: CATALOG_OPTIONAL_KEYS,
      skipUpdateIfValid: options?.onlyIfMissing ? isExistingCatalogValid : undefined,
    });
    changed = result !== 'unchanged';
  });

  return changed;
}

export async function deleteActivityCatalogItemFromFirestore(itemId: string): Promise<void> {
  const docId = toSafeDocId(itemId, 'cat');
  const path = `activity_catalog/${docId}`;
  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'activity_catalog', docId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// 7. DEMO & WORKSPACE SEEDING / RECONCILIATION
// ============================================================================

/**
 * Automatically seeds or reconciles all 6 operational collections in Firestore:
 * `/trainers`, `/companies`, `/sedes`, `/activity_catalog`, `/assignments`, and `/records`
 * using serialized per-document upserts so concurrent writes never collide.
 */
export async function syncDataSetsToFirestore(
  dataSets: {
    trainers?: Trainer[];
    companies?: Company[];
    activityCatalog?: ActivityCatalogItem[];
    assignments?: ClassAssignment[];
    records?: AttendanceRecord[];
  },
  options?: { upsertAssignments?: boolean; upsertCoreEntities?: boolean }
): Promise<{
  trainersCount: number;
  companiesCount: number;
  sedesCount: number;
  catalogCount: number;
  assignmentsCount: number;
  recordsCount: number;
}> {
  return enqueueWorkspaceSync(async () => {
    const trainersToSync = dataSets.trainers ?? [];
    const companiesToSync = dataSets.companies ?? [];
    const catalogToSync = dataSets.activityCatalog ?? [];
    const assignmentsToSync = dataSets.assignments ?? [];
    const recordsToSync = dataSets.records ?? [];
    const upsertAssignments = Boolean(options?.upsertAssignments);
    const onlyIfMissingCore = !options?.upsertCoreEntities;

    let trainersCount = 0;
    let companiesCount = 0;
    let sedesCount = 0;
    let catalogCount = 0;
    let assignmentsCount = 0;
    let recordsCount = 0;

    // Step 1: Trainers
    for (const tr of trainersToSync) {
      const wrote = await saveTrainerToFirestore(tr, { onlyIfMissing: onlyIfMissingCore });
      if (wrote) trainersCount++;
    }

    // Step 2: Companies (must exist on server before Sedes & Assignments)
    for (const comp of companiesToSync) {
      const wrote = await saveCompanyToFirestore(comp, { onlyIfMissing: onlyIfMissingCore });
      if (wrote) companiesCount++;
    }

    // Step 3: Activity Catalog
    for (const catItem of catalogToSync) {
      const wrote = await saveActivityCatalogItemToFirestore(catItem, {
        onlyIfMissing: onlyIfMissingCore,
      });
      if (wrote) catalogCount++;
    }

    // Step 4: Sedes (parent companies guaranteed present)
    for (const comp of companiesToSync) {
      for (const sede of comp.sedes || []) {
        const wrote = await saveSedeToFirestore(
          {
            ...sede,
            companyId: sede.companyId || comp.id,
            companyName: comp.name || sede.companyName,
          },
          comp,
          { onlyIfMissing: onlyIfMissingCore }
        );
        if (wrote) sedesCount++;
      }
    }

    // Step 5: Assignments (parent company & sede guaranteed present)
    for (const asg of assignmentsToSync) {
      const targetCompId = toSafeDocId(asg.companyId, 'comp');
      const targetSedeId = toSafeDocId(asg.sedeId, 'sede');
      const parentComp = companiesToSync.find(
        (c) => c.id === asg.companyId || toSafeDocId(c.id, 'comp') === targetCompId
      );
      const parentSede = parentComp?.sedes?.find(
        (s) => s.id === asg.sedeId || toSafeDocId(s.id, 'sede') === targetSedeId
      );

      const wrote = await saveAssignmentToFirestore(asg, parentComp, parentSede, {
        onlyIfMissing: !upsertAssignments,
      });
      if (wrote) assignmentsCount++;
    }

    // Step 6: Attendance Records
    for (const rec of recordsToSync) {
      const wrote = await saveRecordToFirestore(rec, { onlyIfMissing: true });
      if (wrote) recordsCount++;
    }

    return {
      trainersCount,
      companiesCount,
      sedesCount,
      catalogCount,
      assignmentsCount,
      recordsCount,
    };
  });
}

export async function seedDemoDataToFirestore(): Promise<{
  trainersCount: number;
  companiesCount: number;
  sedesCount: number;
  catalogCount: number;
  assignmentsCount: number;
  recordsCount: number;
}> {
  return syncDataSetsToFirestore({
    trainers: INITIAL_TRAINERS,
    companies: INITIAL_COMPANIES,
    activityCatalog: INITIAL_ACTIVITY_CATALOG,
    assignments: INITIAL_ASSIGNMENTS,
    records: getInitialRecords(),
  });
}

/**
 * Reconciles all active workspace data (including custom user-created assignments,
 * sedes, companies, trainers, catalog items, and session records) into Firestore.
 */
export async function syncWorkspaceDataToFirestore(): Promise<{
  trainersCount: number;
  companiesCount: number;
  sedesCount: number;
  catalogCount: number;
  assignmentsCount: number;
  recordsCount: number;
}> {
  const storedTrainers = getStoredTrainers();
  const storedCompanies = getStoredCompanies();
  const storedCatalog = getStoredActivityCatalog();
  const storedAssignments = getStoredAssignments();
  const storedRecords = getStoredRecords();

  return syncDataSetsToFirestore(
    {
      trainers: storedTrainers.length > 0 ? storedTrainers : INITIAL_TRAINERS,
      companies: storedCompanies.length > 0 ? storedCompanies : INITIAL_COMPANIES,
      activityCatalog: storedCatalog.length > 0 ? storedCatalog : INITIAL_ACTIVITY_CATALOG,
      assignments: storedAssignments.length > 0 ? storedAssignments : INITIAL_ASSIGNMENTS,
      records: storedRecords,
    },
    { upsertAssignments: true, upsertCoreEntities: true }
  );
}
