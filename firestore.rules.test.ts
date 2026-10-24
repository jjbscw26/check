import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
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
 * Dirty Dozen Security Test Suite for automatic multi-device connection across
 * /trainers, /companies, /sedes, /assignments, /personnel, /clients & /admins
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
    const spoofedAdminCtx = testEnv.authenticatedContext('uid_spoof_admin', {
      email: 'jjbscw@gmail.com',
      email_verified: false,
    });

    const dbA = deviceACtx.firestore();
    const dbB = deviceBCtx.firestore();
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
      dayOfWeek: 1,
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

    // Baseline automatic connection writes & cross-device reads succeed without login
    await assertSucceeds(setDoc(doc(dbA, 'trainers', 'tr_1'), validTrainerPayload));
    await assertSucceeds(setDoc(doc(dbA, 'companies', 'comp_1'), validCompanyPayload));
    await assertSucceeds(setDoc(doc(dbA, 'sedes', 'sede_1_1'), validSedePayload));
    await assertSucceeds(setDoc(doc(dbA, 'assignments', 'asg_1'), validAssignmentPayload));
    await assertSucceeds(
      getDocs(query(collection(dbB, 'trainers'), where('createdAt', '>=', minEpoch)))
    );

    // 1. Invalid Device Audit Identifier (createdByUid with spaces/invalid chars)
    await assertFails(
      setDoc(doc(dbB, 'trainers', 'tr_bad_uid_1'), {
        ...validTrainerPayload,
        createdByUid: 'bad uid with spaces!',
      })
    );

    // 2. Unfiltered List Scraping (missing where('createdAt', '>=', ...))
    await assertFails(getDocs(collection(dbB, 'trainers')));
    await assertFails(getDocs(collection(dbB, 'companies')));

    // 3. Shadow / Ghost Field Injection on Create
    await assertFails(
      setDoc(doc(dbA, 'companies', 'comp_ghost_3'), {
        ...validCompanyPayload,
        creditLimit: 999999,
      })
    );

    // 4. Empty Specialties Array / Whitespace-Only Field
    await assertFails(
      setDoc(doc(dbA, 'trainers', 'tr_empty_spec_4'), {
        ...validTrainerPayload,
        specialties: [],
      })
    );
    await assertFails(
      setDoc(doc(dbA, 'companies', 'comp_empty_4'), {
        ...validCompanyPayload,
        industry: '     ',
      })
    );

    // 5. Orphaned Sede Referencing Non-Existent Company
    await assertFails(
      setDoc(doc(dbA, 'sedes', 'sede_orphan_5'), {
        ...validSedePayload,
        companyId: 'comp_does_not_exist',
      })
    );

    // 6. Out-of-Range GPS Coordinates or Geofence Radius on Sede
    await assertFails(
      setDoc(doc(dbA, 'sedes', 'sede_bad_gps_6'), {
        ...validSedePayload,
        lat: 145.0,
        geofenceRadiusMeters: -10,
      })
    );

    // 7. Denial-of-Wallet Oversized String
    await assertFails(
      setDoc(doc(dbA, 'companies', 'comp_oversize_7'), {
        ...validCompanyPayload,
        name: 'X'.repeat(200),
      })
    );

    // 8. Path ID Poisoning
    await assertFails(setDoc(doc(dbA, 'sedes', 'bad id with spaces!'), validSedePayload));
    await assertFails(getDoc(doc(dbB, 'trainers', 'bad id with spaces!')));

    // 9. Client-Forged Timestamp
    await assertFails(
      setDoc(doc(dbA, 'trainers', 'tr_forged_ts_9'), {
        ...validTrainerPayload,
        createdAt: Timestamp.fromMillis(1700000000000),
      })
    );

    // 10. Orphaned ClassAssignment Referencing Non-Existent Sede or Bad Time
    await assertFails(
      setDoc(doc(dbA, 'assignments', 'asg_orphan_10'), {
        ...validAssignmentPayload,
        sedeId: 'sede_missing',
      })
    );

    // 11. Immortal Field Mutation on Update
    await assertFails(
      updateDoc(doc(dbB, 'trainers', 'tr_1'), {
        createdByUid: 'dev_hijack',
        updatedAt: serverTimestamp(),
      })
    );

    // 12. Admin Privilege Escalation (Unauthenticated & Spoofed Email)
    await assertFails(
      setDoc(doc(dbB, 'admins', 'uid_attacker'), {
        email: 'attacker@test.com',
        grantedAt: serverTimestamp(),
      })
    );
    await assertFails(getDoc(doc(spoofAdminDb, 'admins', 'uid_spoof_admin')));
  } finally {
    await testEnv.cleanup();
  }
}
