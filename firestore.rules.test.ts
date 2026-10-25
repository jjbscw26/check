import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * Dirty Dozen Security Test Suite:
 * - Free operational access (no login) for /trainers, /companies, /sedes, /assignments, /records, /activity_catalog
 * - Verified Google Authentication + Owner/Admin PII isolation for Directory (/personnel, /clients) & /admins
 */
export async function runFirestoreRulesDirtyDozenSuite() {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'bscw-check-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  try {
    const deviceACtx = testEnv.unauthenticatedContext();
    const deviceBCtx = testEnv.unauthenticatedContext();
    const staffCtx = testEnv.authenticatedContext('uid_staff_01', {
      email: 'coordinador@bscw.corp',
      email_verified: true,
    });
    const otherUserCtx = testEnv.authenticatedContext('uid_other_02', {
      email: 'otro.usuario@bscw.corp',
      email_verified: true,
    });
    const verifiedAdminCtx = testEnv.authenticatedContext('uid_admin_01', {
      email: 'jjbscw@gmail.com',
      email_verified: true,
    });
    const spoofedAdminCtx = testEnv.authenticatedContext('uid_spoof_admin', {
      email: 'jjbscw@gmail.com',
      email_verified: false,
    });

    const dbA = deviceACtx.firestore();
    const dbB = deviceBCtx.firestore();
    const staffDb = staffCtx.firestore();
    const otherUserDb = otherUserCtx.firestore();
    const adminDb = verifiedAdminCtx.firestore();
    const spoofAdminDb = spoofedAdminCtx.firestore();
    const minEpoch = Timestamp.fromDate(new Date('2020-01-01T00:00:00.000Z'));

    const validTrainerPayload = {
      name: 'Carlos Mendoza',
      email: 'carlos.mendoza@bscw.corp',
      phone: '+52 55 4123 8901',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      specialties: ['Pausas Activas', 'Entrenamiento Funcional', 'Ergonomía Laboral'],
      active: true,
      createdByUid: 'dev_desktop_01',
      createdByEmail: 'sync@bscw.corp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const validCompanyPayload = {
      name: 'Banco Santander Corporativo',
      taxId: 'SAN891024-K92',
      industry: 'Servicios Financieros',
      logoText: 'BS',
      createdByUid: 'dev_desktop_01',
      createdByEmail: 'sync@bscw.corp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const validSedePayload = {
      companyId: 'comp_1',
      companyName: 'Banco Santander Corporativo',
      name: 'Torre Corporativa Reforma',
      address: 'Paseo de la Reforma 500, Cuauhtémoc, CDMX',
      city: 'Ciudad de México',
      lat: 19.42694,
      lng: -99.16782,
      geofenceRadiusMeters: 180,
      contactPerson: 'Lic. Laura Peñaloza',
      contactRole: 'Gerente de Bienestar y SST',
      contactPhone: '+52 55 5100 1122',
      colorTag: 'bg-red-500',
      createdByUid: 'dev_desktop_01',
      createdByEmail: 'sync@bscw.corp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const validAssignmentPayload = {
      trainerId: 'tr_1',
      trainerName: 'Carlos Mendoza',
      companyId: 'comp_1',
      companyName: 'Banco Santander Corporativo',
      sedeId: 'sede_1_1',
      sedeName: 'Torre Corporativa Reforma',
      sedeAddress: 'Paseo de la Reforma 500, Cuauhtémoc, CDMX',
      frequency: 'semanal',
      dayOfWeek: 7,
      time: '08:30',
      durationMinutes: 20,
      activityType: 'pausa_activa',
      activityName: 'Pausa Activa: Ergonomía y Estiramientos',
      locationArea: 'Piso 12 - Área Financiera',
      active: true,
      createdByUid: 'dev_desktop_01',
      createdByEmail: 'sync@bscw.corp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const validCatalogPayload = {
      name: 'Pausa Activa: Ergonomía y Estiramientos',
      activityType: 'pausa_activa',
      defaultDurationMinutes: 20,
      description: 'Descompresión cervical y muñecas.',
      active: true,
      createdByUid: 'dev_desktop_01',
      createdByEmail: 'sync@bscw.corp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const validRecordPayload = {
      assignmentId: 'asg_1',
      trainerId: 'tr_1',
      trainerName: 'Carlos Mendoza',
      companyId: 'comp_1',
      companyName: 'Banco Santander Corporativo',
      sedeId: 'sede_1_1',
      sedeName: 'Torre Corporativa Reforma',
      sedeAddress: 'Paseo de la Reforma 500, Cuauhtémoc, CDMX',
      date: '2026-10-24',
      scheduledTime: '08:30',
      checkInTime: '08:28:14',
      checkInIso: '2026-10-24T08:28:14.000Z',
      checkOutTime: '09:20:05',
      checkOutIso: '2026-10-24T09:20:05.000Z',
      status: 'completado',
      punctualityStatus: 'a_tiempo',
      punctualityDiffMinutes: 2,
      activityType: 'pausa_activa',
      activityName: 'Pausa Activa: Ergonomía y Estiramientos',
      attendeesCount: 24,
      locationArea: 'Piso 12 - Área Financiera',
      checkInGps: {
        lat: 19.42698,
        lng: -99.16779,
        accuracy: 8,
        distanceToSedeMeters: 14,
        isWithinGeofence: true,
        capturedAt: '2026-10-24 08:28:14',
      },
      photoUrl: 'data:image/svg+xml;utf8,sample',
      durationMinutes: 52,
      adminVerified: true,
      createdByUid: 'dev_mobile_01',
      createdByEmail: 'sync@bscw.corp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const validPersonnelPayload = {
      fullName: 'Mariana Gómez Ruiz',
      phone: '+52 55 3344 5566',
      email: 'mariana.gomez@bscw.corp',
      address: {
        street: 'Av. Insurgentes Sur',
        number: '1450 Int 4B',
        city: 'Ciudad de México',
        state: 'CDMX',
        postalCode: '03920',
      },
      createdByUid: 'uid_staff_01',
      createdByEmail: 'coordinador@bscw.corp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const validClientPayload = {
      fullName: 'Roberto Villalobos',
      phone: '+52 55 7788 9900',
      email: 'rvillalobos@empresa.mx',
      company: 'Grupo Financiero Reforma',
      address: {
        street: 'Paseo de las Palmas',
        number: '735',
        city: 'Miguel Hidalgo',
        state: 'CDMX',
        postalCode: '11000',
      },
      createdByUid: 'uid_staff_01',
      createdByEmail: 'coordinador@bscw.corp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Baseline: Free-access Entrenador & Panel Admin collections work without login
    await assertSucceeds(setDoc(doc(dbA, 'trainers', 'tr_1'), validTrainerPayload));
    await assertSucceeds(setDoc(doc(dbA, 'companies', 'comp_1'), validCompanyPayload));
    await assertSucceeds(setDoc(doc(dbA, 'sedes', 'sede_1_1'), validSedePayload));
    await assertSucceeds(setDoc(doc(dbA, 'activity_catalog', 'cat_1'), validCatalogPayload));
    await assertSucceeds(setDoc(doc(dbA, 'assignments', 'asg_1'), validAssignmentPayload));
    await assertSucceeds(setDoc(doc(dbA, 'records', 'rec_1'), validRecordPayload));
    await assertSucceeds(
      getDocs(query(collection(dbB, 'records'), where('createdAt', '>=', minEpoch)))
    );

    // Baseline: Authenticated verified user & Bootstrapped Admin succeed on Directory (/personnel & /clients)
    await assertSucceeds(setDoc(doc(staffDb, 'personnel', 'pers_1'), validPersonnelPayload));
    await assertSucceeds(setDoc(doc(staffDb, 'clients', 'cli_1'), validClientPayload));
    await assertSucceeds(
      getDocs(query(collection(staffDb, 'personnel'), where('createdByUid', '==', 'uid_staff_01')))
    );
    await assertSucceeds(
      getDocs(query(collection(adminDb, 'personnel'), where('createdAt', '>=', minEpoch)))
    );

    // 1. Unauthenticated Directory Access MUST FAIL
    await assertFails(setDoc(doc(dbA, 'personnel', 'pers_unauth_1'), validPersonnelPayload));
    await assertFails(getDoc(doc(dbB, 'personnel', 'pers_1')));
    await assertFails(
      getDocs(query(collection(dbB, 'clients'), where('createdAt', '>=', minEpoch)))
    );

    // 2. Unfiltered Collection Scraping MUST FAIL (even for Admin)
    await assertFails(getDocs(collection(dbB, 'trainers')));
    await assertFails(getDocs(collection(dbB, 'records')));
    await assertFails(getDocs(collection(adminDb, 'personnel')));

    // 3. PII Blanket Read & Non-Owner Mutation on /personnel & /clients MUST FAIL
    await assertFails(getDoc(doc(otherUserDb, 'personnel', 'pers_1')));
    await assertFails(
      getDocs(query(collection(otherUserDb, 'personnel'), where('createdAt', '>=', minEpoch)))
    );
    await assertFails(deleteDoc(doc(otherUserDb, 'clients', 'cli_1')));

    // 4. Identity Spoofing on Authenticated Directory Create MUST FAIL
    await assertFails(
      setDoc(doc(otherUserDb, 'personnel', 'pers_spoof_4'), {
        ...validPersonnelPayload,
        createdByUid: 'uid_staff_01',
      })
    );

    // 5. Spoofed Unverified Admin Email (email_verified: false) MUST FAIL
    await assertFails(getDoc(doc(spoofAdminDb, 'personnel', 'pers_1')));
    await assertFails(getDoc(doc(spoofAdminDb, 'admins', 'uid_spoof_admin')));

    // 6. Shadow / Ghost Field Injection MUST FAIL
    await assertFails(
      setDoc(doc(staffDb, 'personnel', 'pers_ghost_6'), {
        ...validPersonnelPayload,
        isSuperAdmin: true,
      })
    );

    // 7. Empty Specialties Array / Whitespace-Only Field MUST FAIL
    await assertFails(
      setDoc(doc(dbA, 'trainers', 'tr_empty_spec_7'), {
        ...validTrainerPayload,
        specialties: [],
      })
    );

    // 8. Orphaned Sede or Assignment Referencing Non-Existent Parent MUST FAIL
    await assertFails(
      setDoc(doc(dbA, 'sedes', 'sede_orphan_8'), {
        ...validSedePayload,
        companyId: 'comp_does_not_exist',
      })
    );
    await assertFails(
      setDoc(doc(dbA, 'assignments', 'asg_orphan_8'), {
        ...validAssignmentPayload,
        sedeId: 'sede_missing',
      })
    );

    // 9. Out-of-Range GPS Coordinates / Oversized String MUST FAIL
    await assertFails(
      setDoc(doc(dbA, 'sedes', 'sede_bad_gps_9'), {
        ...validSedePayload,
        lat: 145.0,
      })
    );
    await assertFails(
      setDoc(doc(dbA, 'companies', 'comp_oversize_9'), {
        ...validCompanyPayload,
        name: 'X'.repeat(200),
      })
    );

    // 10. Path ID Poisoning MUST FAIL
    await assertFails(setDoc(doc(staffDb, 'personnel', 'bad id with spaces!'), validPersonnelPayload));

    // 11. Client-Forged Timestamp & Immortal Field Mutation MUST FAIL
    await assertFails(
      setDoc(doc(dbA, 'trainers', 'tr_forged_ts_11'), {
        ...validTrainerPayload,
        createdAt: Timestamp.fromMillis(1700000000000),
      })
    );
    await assertFails(
      updateDoc(doc(staffDb, 'personnel', 'pers_1'), {
        createdByUid: 'uid_hijack',
        updatedAt: serverTimestamp(),
      })
    );

    // 12. Admin Privilege Escalation MUST FAIL
    await assertFails(
      setDoc(doc(staffDb, 'admins', 'uid_staff_01'), {
        email: 'coordinador@bscw.corp',
        grantedAt: serverTimestamp(),
      })
    );
  } finally {
    await testEnv.cleanup();
  }
}
