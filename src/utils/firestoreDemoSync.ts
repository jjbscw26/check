import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
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
  deriveCompanyLogoText,
  generateInitialsAvatarDataUrl,
  PHONE_PATTERN_REGEX,
  sanitizeDemoCompanyInput,
  sanitizeTaxIdForFirestore,
  sanitizeTrainerInput,
  VALID_DOC_ID_REGEX,
  validateSedeInput,
} from './personnelValidation';

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

function canUseSafeUpdate(snap: DocumentSnapshot<DocumentData>): boolean {
  if (!snap.exists()) return false;
  if (snap.metadata.hasPendingWrites) return true;
  const d = snap.data();
  return (
    Boolean(d.createdAt) &&
    typeof d.createdByUid === 'string' &&
    d.createdByUid.length >= 1 &&
    typeof d.createdByEmail === 'string' &&
    d.createdByEmail.length >= 5
  );
}

function buildUpdatePayloadWithOptionalDeletes(
  sanitized: Record<string, unknown>,
  optionalKeys: readonly string[]
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    ...sanitized,
    updatedAt: serverTimestamp(),
  };
  for (const key of optionalKeys) {
    if (!(key in sanitized)) {
      updateData[key] = deleteField();
    }
  }
  return updateData;
}

export function toSafeDocId(rawId: string | undefined, prefix: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 120);
  if (cleaned && VALID_DOC_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}_${Date.now()}`;
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
    .slice(0, maxLen);
  return s.length >= minLen ? s : fallback;
}

function sanitizePhoneOrDefault(rawPhone: unknown, fallback = '+52 55 0000 0000'): string {
  const s = String(rawPhone ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 25);
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
    return trimmed.slice(0, maxChars);
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

export async function saveTrainerToFirestore(trainer: Trainer): Promise<void> {
  const docId = toSafeDocId(trainer.id, 'tr');
  const docRef = doc(db, 'trainers', docId);
  const path = `trainers/${docId}`;

  return enqueueDocWrite(path, async () => {
    const meta = getAutoDeviceMetadata();
    const compressedAvatar = await compressEvidenceDataUrlIfNeeded(
      trainer.avatar || generateInitialsAvatarDataUrl(trainer.name),
      145000,
      generateInitialsAvatarDataUrl(trainer.name)
    );

    const sanitized = sanitizeTrainerInput({
      name: cleanBoundedText(trainer.name, 'Entrenador BSCW', 2, 120),
      email:
        trainer.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trainer.email.trim())
          ? trainer.email.trim().toLowerCase()
          : `${docId}@bscw.corp`,
      phone: sanitizePhoneOrDefault(trainer.phone),
      avatar: compressedAvatar || generateInitialsAvatarDataUrl(trainer.name),
      specialties:
        Array.isArray(trainer.specialties) && trainer.specialties.length > 0
          ? trainer.specialties
          : ['Pausas Activas'],
      active: trainer.active !== false,
    });

    try {
      const snap = await getDoc(docRef);
      if (canUseSafeUpdate(snap)) {
        await updateDoc(docRef, {
          name: sanitized.name,
          email: sanitized.email,
          phone: sanitized.phone,
          avatar: sanitized.avatar,
          specialties: sanitized.specialties,
          active: sanitized.active,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          name: sanitized.name,
          email: sanitized.email,
          phone: sanitized.phone,
          avatar: sanitized.avatar,
          specialties: sanitized.specialties,
          active: sanitized.active,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
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

function buildNormalizedCompanyPayload(company: Partial<Company> & { name: string }) {
  const safeName = cleanBoundedText(company.name, 'Empresa Corporativa', 2, 150);
  const safeIndustry = cleanBoundedText(company.industry, 'Servicios Corporativos', 2, 100);
  const safeTaxId = sanitizeTaxIdForFirestore(company.taxId);
  const safeLogoText = deriveCompanyLogoText(safeName, company.logoText);

  return sanitizeDemoCompanyInput({
    name: safeName,
    taxId: safeTaxId,
    industry: safeIndustry,
    logoText: safeLogoText,
  });
}

export async function ensureCompanyExistsInFirestore(
  companyId: string,
  fallbackCompany: Partial<Company> & { name: string }
): Promise<string> {
  const docId = toSafeDocId(companyId, 'comp');
  const docRef = doc(db, 'companies', docId);
  const path = `companies/${docId}`;

  await enqueueDocWrite(path, async () => {
    const meta = getAutoDeviceMetadata();
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const d = snap.data();
        if (
          typeof d.name !== 'string' ||
          d.name.trim().length < 2 ||
          typeof d.industry !== 'string' ||
          typeof d.logoText !== 'string'
        ) {
          const normalized = buildNormalizedCompanyPayload({
            name: String(d.name || d.companyName || fallbackCompany.name || 'Empresa Corporativa'),
            taxId: String(d.taxId || fallbackCompany.taxId || 'XAXX010101000'),
            industry: String(d.industry || fallbackCompany.industry || 'Servicios Corporativos'),
            logoText: typeof d.logoText === 'string' ? d.logoText : fallbackCompany.logoText,
          });
          if (canUseSafeUpdate(snap)) {
            await updateDoc(docRef, {
              name: normalized.name,
              taxId: normalized.taxId,
              industry: normalized.industry,
              logoText: normalized.logoText,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(docRef, {
              name: normalized.name,
              taxId: normalized.taxId,
              industry: normalized.industry,
              logoText: normalized.logoText,
              createdByUid: meta.createdByUid,
              createdByEmail: meta.createdByEmail,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
        return;
      }

      const normalized = buildNormalizedCompanyPayload(fallbackCompany);
      await setDoc(docRef, {
        name: normalized.name,
        taxId: normalized.taxId,
        industry: normalized.industry,
        logoText: normalized.logoText,
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });

  return docId;
}

export async function saveCompanyToFirestore(company: Company): Promise<void> {
  const docId = toSafeDocId(company.id, 'comp');
  const docRef = doc(db, 'companies', docId);
  const path = `companies/${docId}`;

  return enqueueDocWrite(path, async () => {
    const meta = getAutoDeviceMetadata();
    const sanitized = buildNormalizedCompanyPayload(company);

    try {
      const snap = await getDoc(docRef);
      if (canUseSafeUpdate(snap)) {
        await updateDoc(docRef, {
          name: sanitized.name,
          taxId: sanitized.taxId,
          industry: sanitized.industry,
          logoText: sanitized.logoText,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          name: sanitized.name,
          taxId: sanitized.taxId,
          industry: sanitized.industry,
          logoText: sanitized.logoText,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
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

const SEDE_OPTIONAL_KEYS = ['colorTag'] as const;

export async function saveSedeToFirestore(
  sede: Sede,
  parentCompany?: Partial<Company>
): Promise<void> {
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

  return enqueueDocWrite(path, async () => {
    const meta = getAutoDeviceMetadata();
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
      lat: String(Number.isFinite(sede.lat) ? sede.lat : 19.42694),
      lng: String(Number.isFinite(sede.lng) ? sede.lng : -99.16782),
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

    try {
      const snap = await getDoc(docRef);
      if (canUseSafeUpdate(snap)) {
        await updateDoc(
          docRef,
          buildUpdatePayloadWithOptionalDeletes(sanitizedFields, SEDE_OPTIONAL_KEYS)
        );
      } else {
        await setDoc(docRef, {
          ...sanitizedFields,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
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

export async function saveAssignmentToFirestore(
  assignment: ClassAssignment,
  parentCompany?: Partial<Company>,
  parentSede?: Partial<Sede>
): Promise<void> {
  const docId = toSafeDocId(assignment.id, 'asg');
  const docRef = doc(db, 'assignments', docId);
  const path = `assignments/${docId}`;

  return enqueueDocWrite(path, async () => {
    const meta = getAutoDeviceMetadata();
    const payload = sanitizeAssignmentFields(assignment);

    try {
      const companyId = String(payload.companyId);
      const sedeId = String(payload.sedeId);

      // Guarantee parent company and sede exist in Firestore so relational rules always pass
      await ensureCompanyExistsInFirestore(companyId, {
        id: companyId,
        name: parentCompany?.name || String(payload.companyName),
        taxId: parentCompany?.taxId,
        industry: parentCompany?.industry,
        logoText: parentCompany?.logoText,
      });

      const sedeSnap = await getDoc(doc(db, 'sedes', sedeId));
      if (!sedeSnap.exists()) {
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
          parentCompany
        );
      }

      const existingSnap = await getDoc(docRef);
      if (canUseSafeUpdate(existingSnap)) {
        await updateDoc(
          docRef,
          buildUpdatePayloadWithOptionalDeletes(payload, ASSIGNMENT_OPTIONAL_KEYS)
        );
      } else {
        await setDoc(docRef, {
          ...payload,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
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

  const safePhotoUrl = await compressEvidenceDataUrlIfNeeded(
    rec.photoUrl,
    220000,
    generateInitialsAvatarDataUrl(safeTrainerName)
  );

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
    sedeAddress: cleanBoundedText(rec.sedeAddress, 'Dirección Sede Corporativa', 2, 250),
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
    photoUrl: safePhotoUrl || generateInitialsAvatarDataUrl(safeTrainerName),
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

export async function saveRecordToFirestore(record: AttendanceRecord): Promise<void> {
  const docId = toSafeDocId(record.id, 'rec');
  const docRef = doc(db, 'records', docId);
  const path = `records/${docId}`;

  return enqueueDocWrite(path, async () => {
    const meta = getAutoDeviceMetadata();
    const payload = await sanitizeAttendanceRecordFields(record);

    try {
      const existingSnap = await getDoc(docRef);
      if (canUseSafeUpdate(existingSnap)) {
        await updateDoc(
          docRef,
          buildUpdatePayloadWithOptionalDeletes(payload, RECORD_OPTIONAL_KEYS)
        );
      } else {
        await setDoc(docRef, {
          ...payload,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
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

const CATALOG_OPTIONAL_KEYS = ['description'] as const;

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

export async function saveActivityCatalogItemToFirestore(
  item: ActivityCatalogItem
): Promise<void> {
  const docId = toSafeDocId(item.id, 'cat');
  const docRef = doc(db, 'activity_catalog', docId);
  const path = `activity_catalog/${docId}`;

  return enqueueDocWrite(path, async () => {
    const meta = getAutoDeviceMetadata();
    const payload = sanitizeActivityCatalogFields(item);

    try {
      const existingSnap = await getDoc(docRef);
      if (canUseSafeUpdate(existingSnap)) {
        await updateDoc(
          docRef,
          buildUpdatePayloadWithOptionalDeletes(payload, CATALOG_OPTIONAL_KEYS)
        );
      } else {
        await setDoc(docRef, {
          ...payload,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
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
 * without requiring any user sign-in.
 */
export async function syncDataSetsToFirestore(
  dataSets: {
    trainers?: Trainer[];
    companies?: Company[];
    activityCatalog?: ActivityCatalogItem[];
    assignments?: ClassAssignment[];
    records?: AttendanceRecord[];
  },
  options?: { upsertAssignments?: boolean }
): Promise<{
  trainersCount: number;
  companiesCount: number;
  sedesCount: number;
  catalogCount: number;
  assignmentsCount: number;
  recordsCount: number;
}> {
  const meta = getAutoDeviceMetadata();
  const trainersToSync = dataSets.trainers ?? [];
  const companiesToSync = dataSets.companies ?? [];
  const catalogToSync = dataSets.activityCatalog ?? [];
  const assignmentsToSync = dataSets.assignments ?? [];
  const recordsToSync = dataSets.records ?? [];
  const upsertAssignments = Boolean(options?.upsertAssignments);

  // Step 1: Trainers, Companies, and Activity Catalog
  const batch1 = writeBatch(db);
  let trainersCount = 0;
  let companiesCount = 0;
  let catalogCount = 0;

  for (const tr of trainersToSync) {
    const trId = toSafeDocId(tr.id, 'tr');
    const trRef = doc(db, 'trainers', trId);
    const trSnap = await getDoc(trRef);
    if (!trSnap.exists()) {
      const compressedAvatar = await compressEvidenceDataUrlIfNeeded(
        tr.avatar || generateInitialsAvatarDataUrl(tr.name),
        145000,
        generateInitialsAvatarDataUrl(tr.name)
      );
      const sanitized = sanitizeTrainerInput({
        name: cleanBoundedText(tr.name, 'Entrenador BSCW', 2, 120),
        email:
          tr.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(tr.email.trim())
            ? tr.email.trim().toLowerCase()
            : `${trId}@bscw.corp`,
        phone: sanitizePhoneOrDefault(tr.phone),
        avatar: compressedAvatar || generateInitialsAvatarDataUrl(tr.name),
        specialties:
          Array.isArray(tr.specialties) && tr.specialties.length > 0
            ? tr.specialties
            : ['Pausas Activas'],
        active: tr.active !== false,
      });
      batch1.set(trRef, {
        ...sanitized,
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      trainersCount++;
    }
  }

  for (const comp of companiesToSync) {
    const compId = toSafeDocId(comp.id, 'comp');
    const compRef = doc(db, 'companies', compId);
    const compSnap = await getDoc(compRef);
    if (!compSnap.exists()) {
      const normalized = buildNormalizedCompanyPayload(comp);
      batch1.set(compRef, {
        name: normalized.name,
        taxId: normalized.taxId,
        industry: normalized.industry,
        logoText: normalized.logoText,
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      companiesCount++;
    }
  }

  for (const catItem of catalogToSync) {
    const catId = toSafeDocId(catItem.id, 'cat');
    const catRef = doc(db, 'activity_catalog', catId);
    const catSnap = await getDoc(catRef);
    if (!catSnap.exists()) {
      batch1.set(catRef, {
        ...sanitizeActivityCatalogFields(catItem),
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      catalogCount++;
    }
  }

  if (trainersCount > 0 || companiesCount > 0 || catalogCount > 0) {
    try {
      await batch1.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'companies');
    }
  }

  // Step 2: Sedes (now that parent /companies/{companyId} documents exist in Firestore)
  const batch2 = writeBatch(db);
  let sedesCount = 0;

  for (const comp of companiesToSync) {
    const compId = toSafeDocId(comp.id, 'comp');
    const compSnap = await getDoc(doc(db, 'companies', compId));
    if (!compSnap.exists()) continue;

    for (const sede of comp.sedes || []) {
      const sedeId = toSafeDocId(sede.id, 'sede');
      const sedeRef = doc(db, 'sedes', sedeId);
      const sedeSnap = await getDoc(sedeRef);
      if (!sedeSnap.exists()) {
        const checked = validateSedeInput({
          companyId: compId,
          companyName: cleanBoundedText(
            comp.name || sede.companyName,
            'Empresa Corporativa',
            2,
            150
          ),
          name: cleanBoundedText(sede.name, 'Sede Corporativa', 2, 150),
          address: cleanBoundedText(sede.address, 'Dirección Corporativa', 3, 250),
          city: cleanBoundedText(sede.city, 'Ciudad de México', 2, 100),
          lat: String(Number.isFinite(sede.lat) ? sede.lat : 19.42694),
          lng: String(Number.isFinite(sede.lng) ? sede.lng : -99.16782),
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
        batch2.set(sedeRef, {
          ...checked.sanitized,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        sedesCount++;
      }
    }
  }

  if (sedesCount > 0) {
    try {
      await batch2.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sedes');
    }
  }

  // Step 3: Assignments (ensuring parent company & sede exist)
  let assignmentsCount = 0;
  for (const asg of assignmentsToSync) {
    const asgId = toSafeDocId(asg.id, 'asg');
    const parentComp = companiesToSync.find((c) => toSafeDocId(c.id, 'comp') === toSafeDocId(asg.companyId, 'comp'));
    const parentSede = parentComp?.sedes.find((s) => toSafeDocId(s.id, 'sede') === toSafeDocId(asg.sedeId, 'sede'));

    if (upsertAssignments) {
      await saveAssignmentToFirestore(asg, parentComp, parentSede);
      assignmentsCount++;
    } else {
      const asgSnap = await getDoc(doc(db, 'assignments', asgId));
      if (!asgSnap.exists()) {
        await saveAssignmentToFirestore(asg, parentComp, parentSede);
        assignmentsCount++;
      }
    }
  }

  // Step 4: Attendance Records (sequential writes to stay well under payload limits)
  let recordsCount = 0;
  for (const rec of recordsToSync) {
    const recId = toSafeDocId(rec.id, 'rec');
    const recSnap = await getDoc(doc(db, 'records', recId));
    if (!recSnap.exists()) {
      await saveRecordToFirestore(rec);
      recordsCount++;
    }
  }

  return {
    trainersCount,
    companiesCount,
    sedesCount,
    catalogCount,
    assignmentsCount,
    recordsCount,
  };
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
    { upsertAssignments: true }
  );
}
