# Security Specification (`security_spec.md`)

## 1. Master Source of Truth & Data Invariants

1. **Authenticated Directory & Open Operational Access Invariant**:
   - **Directorio Protegido (`/personnel/{personnelId}` y `/clients/{clientId}`)**:
     - Requiere obligatoriamente autenticación verificada (`request.auth != null && request.auth.token.email_verified == true`).
     - Aislamiento estricto de PII (Pilar 6 y Pilar 8): `get`, `update` y `delete` restringidos exclusivamente al creador del expediente (`existing().createdByUid == request.auth.uid`) o administrador verificado (`isAdmin()`). `list` exige filtro sobre `resource.data.createdByUid == request.auth.uid` o administrador titular verificado (`jjbscw@gmail.com`) con restricción temporal `resource.data.createdAt >= timestamp.date(2020, 1, 1)` sin llamadas `get()`/`exists()` dentro de `allow list`.
     - En creación (`create`), `incoming().createdByUid == request.auth.uid` e `incoming().createdByEmail == request.auth.token.email`.
   - **Acceso Libre Operativo para Entrenadores y Panel Administrativo (`/trainers`, `/companies`, `/sedes`, `/assignments`, `/records`, `/activity_catalog`)**:
     - Conecta automáticamente en tiempo real desde cualquier dispositivo sin requerir inicio de sesión, prohibiendo reglas abiertas `if true`:
       - `allow list` exige `resource.data.createdAt >= timestamp.date(2020, 1, 1)`.
       - `allow get` exige `isValidId(docId) && (resource == null || isAccessibleOperationalDoc(existing()))` y `allow delete` exige `isValidId(docId) && resource != null && isAccessibleOperationalDoc(existing())` para permitir también la reconciliación segura de documentos heredados sin marca de tiempo `Timestamp`.
       - `allow create` y `allow update` exigen `isValidId(docId)`, esquemas estrictos `isValid[Entity]`, marcas de tiempo del servidor (`request.time`), inmutabilidad de metadatos de auditoría y existencia relacional.
2. **Global Consistency & Relational Integrity Invariant (Pillar 11)**:
   - On `/sedes/{sedeId}` `create` and `update`, `exists(/databases/$(database)/documents/companies/$(incoming().companyId))` MUST hold.
   - On `/assignments/{assignmentId}` `create` and `update`, `exists(/databases/$(database)/documents/companies/$(incoming().companyId))` and `exists(/databases/$(database)/documents/sedes/$(incoming().sedeId))` MUST hold.
3. **Complete Calendar Ecosystem Persistence Invariant**:
   - `/assignments/{assignmentId}`, `/records/{recordId}`, and `/activity_catalog/{catalogId}` persist all schedule frequencies, attendance states, GPS geofence proofs, and modalities (`pausa_activa`, `clase_fitness`, `gimnasio_corporativo`, `masajes`, bounded `.size() <= 30`) across devices.
4. **Total Array & Numeric Guarding Invariant (Pillar 2 & Pillar 5)**:
   - `Trainer.specialties` bounded `1..20` items; `ClassAssignment` date arrays bounded `<= 366` items; GPS coordinates and geofence radii bounded and non-`NaN`.
5. **Ownership & Temporal Immutability Invariant**:
   - On `create`: `createdAt == request.time` and `updatedAt == request.time`.
   - On `update`: `createdByUid`, `createdByEmail`, and `createdAt` are strictly immutable (`incoming().field == existing().field`), `updatedAt == request.time`, and only allowlisted fields may change via `affectedKeys().hasOnly(...)`.
6. **Path Variable Hardening Invariant (Pillar 3)**:
   - Single-document operations (`get`, `create`, `update`, `delete`) enforce `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, `1..128` chars).

---

## 2. The "Dirty Dozen" Adversarial Payloads

All 12 payloads below MUST evaluate to `PERMISSION_DENIED`:

1. **Payload 1 — Unauthenticated Directory Access (`/personnel` & `/clients`)**:
   Unauthenticated client attempts `get`, `list`, `create`, `update`, or `delete` on `/personnel` or `/clients`.
2. **Payload 2 — Unfiltered Collection Scraping (`list` without Query Enforcer)**:
   Client executes unfiltered `getDocs(collection(db, 'trainers'))`, `getDocs(collection(db, 'records'))`, or `getDocs(collection(db, 'personnel'))`.
3. **Payload 3 — PII Blanket Read & Non-Owner Mutation on `/personnel` / `/clients`**:
   Authenticated verified user `uid_other` attempts `getDoc`, blanket `list`, `updateDoc`, or `deleteDoc` on `/personnel/pers_1` owned by `uid_staff`.
4. **Payload 4 — Identity Spoofing on Authenticated Directory Create**:
   Authenticated user `uid_staff` attempts to create `/personnel/pers_spoof` with `createdByUid: 'uid_victim'` or mismatched `createdByEmail`.
5. **Payload 5 — Spoofed Unverified Admin Email (`email_verified: false`)**:
   User with `email: 'jjbscw@gmail.com'` and `email_verified: false` attempts to read `/personnel`, `/clients`, or `/admins`.
6. **Payload 6 — Shadow / Ghost Field Injection on Create or Update**:
   Valid payload plus unauthorized field `"role": "superadmin"` or `"bonusPaid": true`.
7. **Payload 7 — Empty Specialties Array or Whitespace-Only Field**:
   Trainer payload with `specialties: []` or ActivityCatalog payload where `name` is `"     "`.
8. **Payload 8 — Orphaned Sede or Assignment Referencing Non-Existent Parent**:
   Creating `/sedes/sede_orphan` or `/assignments/asg_orphan` referencing missing `companyId` or `sedeId`.
9. **Payload 9 — Out-of-Range GPS Coordinates or Oversized String (Denial of Wallet)**:
   Creating `/sedes` with `lat: 145.0` or `/companies` with `name` exceeding `maxLength`.
10. **Payload 10 — Path ID Poisoning**:
    Creating or reading `/records/bad id with spaces!` or `/personnel/bad id!`.
11. **Payload 11 — Client-Forged Timestamp or Immortal Field Mutation**:
    Forged `createdAt` on create or mutating `createdByUid` on update.
12. **Payload 12 — Admin Privilege Escalation**:
    Unauthenticated or non-bootstrapped user writes `/admins/uid_attacker`.

---

## 3. Red Team Audit & Conflict Report

| Collection | Identity & Auth Gate | PII & Shadow Field Guard | Resource / Value Poisoning | Relational Consistency | Query Enforcer (`list`) | Update Validation Helper |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/trainers/{trainerId}` | **PASS** (Open operational + audit regex) | **PASS** (`affectedKeys().hasOnly`) | **PASS** (`isValidId` + `.size()` + bounded `specialties`) | **PASS** | **PASS** (`createdAt >= 2020-01-01`) | **PASS** (`isValidTrainer(incoming())`) |
| `/companies/{companyId}` | **PASS** (Open operational + audit regex) | **PASS** (`affectedKeys().hasOnly`) | **PASS** (`isValidId` + `.size()` + RE2 regex) | **PASS** | **PASS** (`createdAt >= 2020-01-01`) | **PASS** (`isValidCompany(incoming())`) |
| `/sedes/{sedeId}` | **PASS** (Open operational + audit regex) | **PASS** (`affectedKeys().hasOnly`) | **PASS** (`isValidId` + GPS bounds) | **PASS** (`exists(/companies/...)`) | **PASS** (`createdAt >= 2020-01-01`) | **PASS** (`isValidSede(incoming())`) |
| `/assignments/{assignmentId}` | **PASS** (Open operational + audit regex) | **PASS** (`affectedKeys().hasOnly`) | **PASS** (`isValidId` + `dayOfWeek 0..7` + bounded lists) | **PASS** (`exists(/companies/...) && exists(/sedes/...)`) | **PASS** (`createdAt >= 2020-01-01`) | **PASS** (`isValidAssignment(incoming())`) |
| `/records/{recordId}` | **PASS** (Open operational + audit regex) | **PASS** (`affectedKeys().hasOnly`) | **PASS** (`isValidId` + GPS/biometric maps + bounded evidence) | **PASS** | **PASS** (`createdAt >= 2020-01-01`) | **PASS** (`isValidAttendanceRecord(incoming())`) |
| `/activity_catalog/{catalogId}` | **PASS** (Open operational + audit regex) | **PASS** (`affectedKeys().hasOnly`) | **PASS** (`isValidId` + duration `5..480` + `.size()`) | **PASS** | **PASS** (`createdAt >= 2020-01-01`) | **PASS** (`isValidActivityCatalogItem(incoming())`) |
| `/personnel/{personnelId}` | **PASS** (`isVerifiedUser()` + `createdByUid == auth.uid`) | **PASS** (`isOwner` or `isAdmin`, `hasOnly`) | **PASS** (`isValidId` + `StructuredAddress` bounds) | **PASS** | **PASS** (`createdByUid == auth.uid` or verified bootstrapped admin) | **PASS** (`isValidPersonnel(incoming())`) |
| `/clients/{clientId}` | **PASS** (`isVerifiedUser()` + `createdByUid == auth.uid`) | **PASS** (`isOwner` or `isAdmin`, `hasOnly`) | **PASS** (`isValidId` + `StructuredAddress` bounds) | **PASS** | **PASS** (`createdByUid == auth.uid` or verified bootstrapped admin) | **PASS** (`isValidClient(incoming())`) |
| `/admins/{adminUid}` | **PASS** (`isBootstrappedAdmin()` with `email_verified`) | **PASS** (`allow update: if false;`) | **PASS** (`isValidId` + `isValidAdminRole`) | **PASS** | **PASS** (`allow list: if false;`) | **PASS** |
