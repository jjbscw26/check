import {
  collection,
  deleteDoc,
  doc,
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
import { INITIAL_ASSIGNMENTS, INITIAL_COMPANIES, INITIAL_TRAINERS } from '../data/mockData';
import { ClassAssignment, Company, Sede, Trainer } from '../types';
import {
  deriveCompanyLogoText,
  generateInitialsAvatarDataUrl,
  sanitizeDemoCompanyInput,
  sanitizeTrainerInput,
  VALID_DOC_ID_REGEX,
  validateSedeInput,
} from './personnelValidation';

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

export async function saveTrainerToFirestore(trainer: Trainer): Promise<void> {
  const docId = toSafeDocId(trainer.id, 'tr');
  const docRef = doc(db, 'trainers', docId);
  const path = `trainers/${docId}`;
  const meta = getAutoDeviceMetadata();

  const sanitized = sanitizeTrainerInput({
    name: trainer.name,
    email: trainer.email || `${docId}@bscw.corp`,
    phone: trainer.phone || '+52 55 0000 0000',
    avatar: trainer.avatar || generateInitialsAvatarDataUrl(trainer.name),
    specialties:
      Array.isArray(trainer.specialties) && trainer.specialties.length > 0
        ? trainer.specialties
        : ['Pausas Activas'],
    active: trainer.active !== false,
  });

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
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
}

export async function deleteTrainerFromFirestore(trainerId: string): Promise<void> {
  const docId = toSafeDocId(trainerId, 'tr');
  const path = `trainers/${docId}`;
  try {
    await deleteDoc(doc(db, 'trainers', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCompanyToFirestore(company: Company): Promise<void> {
  const docId = toSafeDocId(company.id, 'comp');
  const docRef = doc(db, 'companies', docId);
  const path = `companies/${docId}`;
  const meta = getAutoDeviceMetadata();

  const sanitized = sanitizeDemoCompanyInput({
    name: company.name,
    taxId: company.taxId || 'XAXX010101000',
    industry: company.industry || 'Servicios Corporativos',
    logoText: deriveCompanyLogoText(company.name, company.logoText),
  });

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
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
}

export async function deleteCompanyAndSedesFromFirestore(companyId: string): Promise<void> {
  const docId = toSafeDocId(companyId, 'comp');
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
    handleFirestoreError(error, OperationType.DELETE, `companies/${docId}`);
  }
}

export async function saveSedeToFirestore(sede: Sede): Promise<void> {
  const docId = toSafeDocId(sede.id, 'sede');
  const companyDocId = toSafeDocId(sede.companyId, 'comp');
  const docRef = doc(db, 'sedes', docId);
  const path = `sedes/${docId}`;
  const meta = getAutoDeviceMetadata();

  const checked = validateSedeInput({
    companyId: companyDocId,
    companyName: sede.companyName,
    name: sede.name,
    address: sede.address || 'Dirección Corporativa',
    city: sede.city || 'Ciudad de México',
    lat: String(sede.lat ?? 19.42694),
    lng: String(sede.lng ?? -99.16782),
    geofenceRadiusMeters: String(sede.geofenceRadiusMeters ?? 150),
    contactPerson: sede.contactPerson || 'Encargado de Sede',
    contactRole: sede.contactRole || 'Responsable SST',
    contactPhone: sede.contactPhone || '+52 55 0000 0000',
    colorTag: sede.colorTag || 'bg-red-600',
  });

  const payload = checked.sanitized;

  try {
    const snap = await getDoc(docRef);
    const baseData: Record<string, unknown> = {
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
      updatedAt: serverTimestamp(),
    };
    if (payload.colorTag) {
      baseData.colorTag = payload.colorTag;
    }

    if (snap.exists()) {
      await updateDoc(docRef, baseData);
    } else {
      await setDoc(docRef, {
        ...baseData,
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSedeFromFirestore(sedeId: string): Promise<void> {
  const docId = toSafeDocId(sedeId, 'sede');
  const path = `sedes/${docId}`;
  try {
    await deleteDoc(doc(db, 'sedes', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function sanitizeAssignmentFields(asg: ClassAssignment): Record<string, unknown> {
  const cleanStr = (val: unknown, fallback: string, max: number) => {
    const s = String(val || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
    return s.length >= 2 ? s : fallback;
  };

  const timeRaw = String(asg.time || '09:00').trim();
  const safeTime = /^[0-2][0-9]:[0-5][0-9]$/.test(timeRaw) ? timeRaw : '09:00';

  const freq =
    asg.frequency === 'semanal' || asg.frequency === 'mensual' || asg.frequency === 'fecha_unica'
      ? asg.frequency
      : 'semanal';

  const actType =
    asg.activityType === 'pausa_activa' || asg.activityType === 'clase_fitness'
      ? asg.activityType
      : 'pausa_activa';

  const locArea = String(asg.locationArea || 'Área General')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150) || 'Área General';

  const cleanDateList = (arr?: string[]) =>
    Array.isArray(arr)
      ? arr.filter((d) => typeof d === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)).slice(0, 366)
      : undefined;

  const data: Record<string, unknown> = {
    trainerId: toSafeDocId(asg.trainerId, 'tr'),
    trainerName: cleanStr(asg.trainerName, 'Entrenador BSCW', 120),
    companyId: toSafeDocId(asg.companyId, 'comp'),
    companyName: cleanStr(asg.companyName, 'Empresa Corporativa', 150),
    sedeId: toSafeDocId(asg.sedeId, 'sede'),
    sedeName: cleanStr(asg.sedeName, 'Sede Principal', 150),
    sedeAddress: cleanStr(asg.sedeAddress, 'Dirección Sede', 250),
    frequency: freq,
    time: safeTime,
    activityType: actType,
    activityName: cleanStr(asg.activityName, 'Pausa Activa', 150),
    locationArea: locArea,
    active: asg.active !== false,
  };

  if (typeof asg.dayOfWeek === 'number' && !Number.isNaN(asg.dayOfWeek)) {
    data.dayOfWeek = Math.min(6, Math.max(0, Math.round(asg.dayOfWeek)));
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
  if (typeof asg.closedAt === 'string') {
    data.closedAt = asg.closedAt.slice(0, 40);
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
  if (typeof asg.nonCompliantAt === 'string') {
    data.nonCompliantAt = asg.nonCompliantAt.slice(0, 40);
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

export async function saveAssignmentToFirestore(assignment: ClassAssignment): Promise<void> {
  const docId = toSafeDocId(assignment.id, 'asg');
  const docRef = doc(db, 'assignments', docId);
  const path = `assignments/${docId}`;
  const meta = getAutoDeviceMetadata();
  const payload = sanitizeAssignmentFields(assignment);

  try {
    const [compSnap, sedeSnap, existingSnap] = await Promise.all([
      getDoc(doc(db, 'companies', String(payload.companyId))),
      getDoc(doc(db, 'sedes', String(payload.sedeId))),
      getDoc(docRef),
    ]);

    if (!compSnap.exists() || !sedeSnap.exists()) {
      return;
    }

    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      await setDoc(docRef, {
        ...payload,
        createdByUid: String(existingData.createdByUid || meta.createdByUid),
        createdByEmail: String(existingData.createdByEmail || meta.createdByEmail),
        createdAt: existingData.createdAt,
        updatedAt: serverTimestamp(),
      });
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
}

export async function deleteAssignmentFromFirestore(assignmentId: string): Promise<void> {
  const docId = toSafeDocId(assignmentId, 'asg');
  const path = `assignments/${docId}`;
  try {
    await deleteDoc(doc(db, 'assignments', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Automatically seeds Firestore `/trainers`, `/companies`, `/sedes`, and `/assignments`
 * with all demo records and fields without requiring any user sign-in.
 */
export async function seedDemoDataToFirestore(): Promise<{
  trainersCount: number;
  companiesCount: number;
  sedesCount: number;
  assignmentsCount: number;
}> {
  const meta = getAutoDeviceMetadata();

  // Step 1: Write Trainers and Companies first
  const batch1 = writeBatch(db);
  let trainersCount = 0;
  let companiesCount = 0;

  for (const tr of INITIAL_TRAINERS) {
    const trRef = doc(db, 'trainers', tr.id);
    const trSnap = await getDoc(trRef);
    if (!trSnap.exists()) {
      batch1.set(trRef, {
        name: tr.name,
        email: tr.email,
        phone: tr.phone,
        avatar: tr.avatar,
        specialties: tr.specialties,
        active: tr.active,
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      trainersCount++;
    }
  }

  for (const comp of INITIAL_COMPANIES) {
    const compRef = doc(db, 'companies', comp.id);
    const compSnap = await getDoc(compRef);
    if (!compSnap.exists()) {
      batch1.set(compRef, {
        name: comp.name,
        taxId: comp.taxId,
        industry: comp.industry,
        logoText: comp.logoText,
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      companiesCount++;
    }
  }

  if (trainersCount > 0 || companiesCount > 0) {
    try {
      await batch1.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'companies');
    }
  }

  // Step 2: Now that /companies/{companyId} documents exist in Firestore, write /sedes
  const batch2 = writeBatch(db);
  let sedesCount = 0;

  for (const comp of INITIAL_COMPANIES) {
    const compSnap = await getDoc(doc(db, 'companies', comp.id));
    if (!compSnap.exists()) continue;

    for (const sede of comp.sedes) {
      const sedeRef = doc(db, 'sedes', sede.id);
      const sedeSnap = await getDoc(sedeRef);
      if (!sedeSnap.exists()) {
        batch2.set(sedeRef, {
          companyId: sede.companyId,
          companyName: sede.companyName,
          name: sede.name,
          address: sede.address,
          city: sede.city,
          lat: sede.lat,
          lng: sede.lng,
          geofenceRadiusMeters: sede.geofenceRadiusMeters,
          contactPerson: sede.contactPerson,
          contactRole: sede.contactRole,
          contactPhone: sede.contactPhone,
          ...(sede.colorTag ? { colorTag: sede.colorTag } : {}),
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

  // Step 3: Now that /companies and /sedes exist, seed /assignments
  const batch3 = writeBatch(db);
  let assignmentsCount = 0;

  for (const asg of INITIAL_ASSIGNMENTS) {
    const asgRef = doc(db, 'assignments', asg.id);
    const [asgSnap, compSnap, sedeSnap] = await Promise.all([
      getDoc(asgRef),
      getDoc(doc(db, 'companies', asg.companyId)),
      getDoc(doc(db, 'sedes', asg.sedeId)),
    ]);
    if (!asgSnap.exists() && compSnap.exists() && sedeSnap.exists()) {
      batch3.set(asgRef, {
        ...sanitizeAssignmentFields(asg),
        createdByUid: meta.createdByUid,
        createdByEmail: meta.createdByEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      assignmentsCount++;
    }
  }

  if (assignmentsCount > 0) {
    try {
      await batch3.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'assignments');
    }
  }

  return { trainersCount, companiesCount, sedesCount, assignmentsCount };
}
