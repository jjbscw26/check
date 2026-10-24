import { User } from 'firebase/auth';
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
import { db, handleFirestoreError, OperationType } from '../firebase';
import { INITIAL_COMPANIES, INITIAL_TRAINERS } from '../data/mockData';
import { Company, Sede, Trainer } from '../types';
import {
  deriveCompanyLogoText,
  generateInitialsAvatarDataUrl,
  sanitizeDemoCompanyInput,
  sanitizeTrainerInput,
  VALID_DOC_ID_REGEX,
  validateSedeInput,
} from './personnelValidation';

function toSafeDocId(rawId: string | undefined, prefix: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 120);
  if (cleaned && VALID_DOC_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}_${Date.now()}`;
}

export async function saveTrainerToFirestore(user: User, trainer: Trainer): Promise<void> {
  if (!user.emailVerified || !user.email) return;
  const docId = toSafeDocId(trainer.id, 'tr');
  const docRef = doc(db, 'trainers', docId);
  const path = `trainers/${docId}`;

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
        createdByUid: user.uid,
        createdByEmail: user.email,
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

export async function saveCompanyToFirestore(user: User, company: Company): Promise<void> {
  if (!user.emailVerified || !user.email) return;
  const docId = toSafeDocId(company.id, 'comp');
  const docRef = doc(db, 'companies', docId);
  const path = `companies/${docId}`;

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
        createdByUid: user.uid,
        createdByEmail: user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCompanyAndSedesFromFirestore(
  user: User,
  companyId: string,
  isBootstrappedAdmin: boolean
): Promise<void> {
  const docId = toSafeDocId(companyId, 'comp');
  const sedesRef = collection(db, 'sedes');
  const sedesQuery = isBootstrappedAdmin
    ? query(sedesRef, where('companyId', '==', docId))
    : query(
        sedesRef,
        where('createdByUid', '==', user.uid),
        where('companyId', '==', docId)
      );

  try {
    const sedesSnap = await getDocs(sedesQuery);
    const batch = writeBatch(db);
    sedesSnap.docs.forEach((sDoc) => {
      batch.delete(sDoc.ref);
    });
    batch.delete(doc(db, 'companies', docId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `companies/${docId}`);
  }
}

export async function saveSedeToFirestore(user: User, sede: Sede): Promise<void> {
  if (!user.emailVerified || !user.email) return;
  const docId = toSafeDocId(sede.id, 'sede');
  const companyDocId = toSafeDocId(sede.companyId, 'comp');
  const docRef = doc(db, 'sedes', docId);
  const path = `sedes/${docId}`;

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
        createdByUid: user.uid,
        createdByEmail: user.email,
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

/**
 * Seeds Firestore `/trainers`, `/companies`, and `/sedes` with all demo records and fields
 * from `INITIAL_TRAINERS` and `INITIAL_COMPANIES`.
 * Note: Commits `/companies` + `/trainers` first so `exists(/companies/{companyId})` holds
 * when writing `/sedes`.
 */
export async function seedDemoDataToFirestore(user: User): Promise<{
  trainersCount: number;
  companiesCount: number;
  sedesCount: number;
}> {
  if (!user.emailVerified || !user.email) {
    throw new Error('Se requiere una cuenta de Google con correo verificado.');
  }

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
        createdByUid: user.uid,
        createdByEmail: user.email,
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
        createdByUid: user.uid,
        createdByEmail: user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      companiesCount++;
    }
  }

  try {
    await batch1.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'companies');
  }

  // Step 2: Now that /companies/{companyId} documents exist in Firestore, write /sedes
  const batch2 = writeBatch(db);
  let sedesCount = 0;

  for (const comp of INITIAL_COMPANIES) {
    // Check that we own or admin this company before creating sedes referencing it
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
          createdByUid: user.uid,
          createdByEmail: user.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        sedesCount++;
      }
    }
  }

  try {
    await batch2.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sedes');
  }

  return { trainersCount, companiesCount, sedesCount };
}
