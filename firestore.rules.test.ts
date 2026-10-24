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
 * Dirty Dozen Security Test Suite for /trainers, /companies, /sedes, /personnel, /clients & /admins
 */
export async function runFirestoreRulesDirtyDozenSuite() {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'bscw-check-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  try {
    const aliceCtx = testEnv.authenticatedContext('uid_alice', {
      email: 'alice@empresa.com',
      email_verified: true,
    });
    const bobCtx = testEnv.authenticatedContext('uid_bob', {
      email: 'bob@empresa.com',
      email_verified: true,
    });
    const spoofedAdminCtx = testEnv.authenticatedContext('uid_spoof_admin', {
      email: 'jjbscw@gmail.com',
      email_verified: false,
    });

    const aliceDb = aliceCtx.firestore();
    const bobDb = bobCtx.firestore();
    const spoofAdminDb = spoofedAdminCtx.firestore();

    const validTrainerPayload = {
      name: 'Carlos Mendoza',
      email: 'carlos.mendoza@bscw.corp',
      phone: '+52 55 4123 8901',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      specialties: ['Pausas Activas', 'Entrenamiento Funcional', 'Ergonomía Laboral'],
      active: true,
      createdByUid: 'uid_alice',
      createdByEmail: 'alice@empresa.com',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const validCompanyPayload = {
      name: 'Banco Santander Corporativo',
      taxId: 'SAN891024-K92',
      industry: 'Servicios Financieros',
      logoText: 'BS',
      createdByUid: 'uid_alice',
      createdByEmail: 'alice@empresa.com',
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
      createdByUid: 'uid_alice',
      createdByEmail: 'alice@empresa.com',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Baseline valid writes across trainers, companies, and sedes succeed for verified owner
    await assertSucceeds(setDoc(doc(aliceDb, 'trainers', 'tr_1'), validTrainerPayload));
    await assertSucceeds(setDoc(doc(aliceDb, 'companies', 'comp_1'), validCompanyPayload));
    await assertSucceeds(setDoc(doc(aliceDb, 'sedes', 'sede_1_1'), validSedePayload));

    // 1. Identity Spoofing on Create (createdByUid != auth.uid)
    await assertFails(
      setDoc(doc(bobDb, 'trainers', 'tr_spoof_1'), {
        ...validTrainerPayload,
        createdByUid: 'uid_alice',
        createdByEmail: 'bob@empresa.com',
      })
    );

    // 2. Unverified Admin Email Spoofing (email matches admin, email_verified == false)
    await assertFails(getDoc(doc(spoofAdminDb, 'companies', 'comp_1')));
    await assertFails(getDoc(doc(spoofAdminDb, 'trainers', 'tr_1')));

    // 3. Shadow / Ghost Field Injection on Create
    await assertFails(
      setDoc(doc(aliceDb, 'companies', 'comp_ghost_3'), {
        ...validCompanyPayload,
        creditLimit: 999999,
      })
    );

    // 4. Empty Specialties Array / Whitespace-Only Field
    await assertFails(
      setDoc(doc(aliceDb, 'trainers', 'tr_empty_spec_4'), {
        ...validTrainerPayload,
        specialties: [],
      })
    );
    await assertFails(
      setDoc(doc(aliceDb, 'companies', 'comp_empty_4'), {
        ...validCompanyPayload,
        industry: '     ',
      })
    );

    // 5. Orphaned Sede or Cross-Tenant Company Reference
    await assertFails(
      setDoc(doc(aliceDb, 'sedes', 'sede_orphan_5'), {
        ...validSedePayload,
        companyId: 'comp_does_not_exist',
      })
    );
    await assertFails(
      setDoc(doc(bobDb, 'sedes', 'sede_cross_tenant_5'), {
        ...validSedePayload,
        companyId: 'comp_1', // Owned by Alice, not Bob!
        createdByUid: 'uid_bob',
        createdByEmail: 'bob@empresa.com',
      })
    );

    // 6. Out-of-Range GPS Coordinates or Geofence Radius on Sede
    await assertFails(
      setDoc(doc(aliceDb, 'sedes', 'sede_bad_gps_6'), {
        ...validSedePayload,
        lat: 120.5,
      })
    );
    await assertFails(
      setDoc(doc(aliceDb, 'sedes', 'sede_bad_radius_6'), {
        ...validSedePayload,
        geofenceRadiusMeters: 2,
      })
    );

    // 7. Denial-of-Wallet Oversized String
    await assertFails(
      setDoc(doc(aliceDb, 'companies', 'comp_oversize_7'), {
        ...validCompanyPayload,
        name: 'A'.repeat(2000),
      })
    );

    // 8. Path ID Poisoning (spaces & special characters)
    await assertFails(
      setDoc(doc(aliceDb, 'sedes', 'bad id $pecial!'), validSedePayload)
    );

    // 9. Client-Forged Timestamp instead of request.time
    await assertFails(
      setDoc(doc(aliceDb, 'trainers', 'tr_forged_time_9'), {
        ...validTrainerPayload,
        createdAt: Timestamp.fromMillis(1700000000000),
      })
    );

    // 10. Cross-Tenant PII Read (get & unfiltered list by non-owner)
    await assertFails(getDoc(doc(bobDb, 'trainers', 'tr_1')));
    await assertFails(getDocs(collection(bobDb, 'trainers')));
    await assertFails(getDocs(collection(bobDb, 'companies')));
    await assertFails(getDocs(collection(bobDb, 'sedes')));
    await assertSucceeds(
      getDocs(query(collection(bobDb, 'trainers'), where('createdByUid', '==', 'uid_bob')))
    );

    // 11. Immortal Field Mutation on Update (changing createdByUid)
    await assertFails(
      updateDoc(doc(aliceDb, 'companies', 'comp_1'), {
        createdByUid: 'uid_bob',
        updatedAt: serverTimestamp(),
      })
    );

    // 12. Self-Assigned Admin Privilege Escalation
    await assertFails(
      setDoc(doc(bobDb, 'admins', 'uid_bob'), {
        email: 'bob@empresa.com',
        grantedAt: serverTimestamp(),
      })
    );
  } finally {
    await testEnv.cleanup();
  }
}
