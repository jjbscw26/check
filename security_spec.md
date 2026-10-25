# Security Specification (`security_spec.md`)

## 1. Master Source of Truth & Data Invariants (Automatic Multi-Device Mode)

1. **Login-Free Automatic Multi-Device Workspace Invariant**:
   - Per explicit user requirement, interactive sign-in is disabled so any corporate device (desktop, tablet, or mobile phone) connects automatically to the shared Firestore workspace (`ai-studio-bscwcheckcontrol-b05b50c5-aec1-462e-a57f-0f6aaeae2082`).
   - Open `if true` rules remain strictly forbidden:
     - `allow list` enforces query-side temporal validation (`resource.data.createdAt >= timestamp.date(2020, 1, 1)`), rejecting unfiltered scraping queries while preserving 100% compatibility with previously saved documents and new documents across all devices.
     - `allow get` enforces `isValidId(docId) && (resource == null || existing().createdAt >= timestamp.date(2020, 1, 1))`.
     - `allow create`, `allow update`, and `allow delete` enforce strict `isValidId(docId)` path hardening, exhaustive blueprint schema validation (`isValid[Entity]`), server timestamps (`request.time`), immutable audit metadata (`createdByUid`, `createdByEmail`, `createdAt`), and relational parent existence checks.
2. **Global Consistency & Relational Integrity Invariant (Pillar 11)**:
   - On `/sedes/{sedeId}` `create` and `update`, after static schema validation passes, `exists(/databases/$(database)/documents/companies/$(incoming().companyId))` MUST hold so orphaned sedes cannot be written.
   - On `/assignments/{assignmentId}` `create` and `update`, `exists(/databases/$(database)/documents/companies/$(incoming().companyId))` and `exists(/databases/$(database)/documents/sedes/$(incoming().sedeId))` MUST hold.
3. **Complete Calendar Ecosystem Persistence Invariant**:
   - `/assignments/{assignmentId}` persists all scheduled classes (`semanal` with `dayOfWeek` `0..7` including `7 = Domingo`, `mensual` `1..31`, `fecha_unica` `YYYY-MM-DD`, `closed`, `completedDates`, `nonCompliant`, `nonCompliantReason`, `missedDates`, `reopenedDates`).
   - `/records/{recordId}` persists all live and historical calendar executions (`en_curso`, `completado`, `incumplido`, check-in/out times, GPS geofence proofs, watermarked photo evidence bounded `<= 280000` chars, biometric verification, and admin verification).
   - `/activity_catalog/{catalogId}` persists all activity modalities and default durations (`5..480` min) used by the calendar and trainer check-in views.
4. **Total Array & Numeric Guarding Invariant (Pillar 2 & Pillar 5)**:
   - `Trainer.specialties` must be a `list` with `size() >= 1 && size() <= 20` and head element validated as a trimmed non-empty `string` (`1..80` chars).
   - `ClassAssignment.completedDates`, `missedDates`, and `reopenedDates` are bounded `<= 366` items with `YYYY-MM-DD` head validation.
   - `Sede.lat` (`-90..90`), `Sede.lng` (`-180..180`), and `Sede.geofenceRadiusMeters` (`10..10000`) must be finite `number` values (not `NaN`).
5. **Ownership & Temporal Immutability Invariant**:
   - On `create`: `createdByUid` (`1..128` alphanumeric/dash/underscore), `createdByEmail` (`5..254` email format), `createdAt == request.time`, and `updatedAt == request.time`.
   - On `update`: `createdByUid`, `createdByEmail`, and `createdAt` are strictly immutable (`incoming().field == existing().field`), `updatedAt == request.time`, and only domain fields + `updatedAt` may change via `affectedKeys().hasOnly(...)`.
6. **Path Variable Hardening Invariant (Pillar 3)**:
   - Single-document operations (`get`, `create`, `update`, `delete`) enforce `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, `1..128` chars).

---

## 2. The "Dirty Dozen" Adversarial Payloads

All 12 payloads below MUST evaluate to `PERMISSION_DENIED`:

1. **Payload 1 — Invalid Device Audit Identifier (`createdByUid` Injection)**:
   Client attempts to create `/trainers/tr_bad_uid` with `createdByUid: ""` or containing spaces/special characters.
2. **Payload 2 — Unfiltered Collection Scraping (`list` without Query Enforcer)**:
   Client executes unfiltered `getDocs(collection(db, 'trainers'))`, `getDocs(collection(db, 'records'))`, or `getDocs(collection(db, 'activity_catalog'))` without `where('createdAt', '>=', ...)`.
3. **Payload 3 — Shadow / Ghost Field Injection on Create**:
   Valid company, sede, assignment, record, or catalog payload plus unauthorized field `"role": "superadmin"` or `"creditLimit": 999999`.
4. **Payload 4 — Empty / Unbounded Array or Whitespace-Only Field**:
   Trainer payload with `specialties: []` or >20 items, or ActivityCatalog payload where `name` is `"     "`.
5. **Payload 5 — Orphaned Sede Referencing Non-Existent Company**:
   Creating `/sedes/sede_orphan` where `companyId` does not exist in `/companies`.
6. **Payload 6 — Out-of-Range GPS Coordinates or Geofence Radius on Sede / Record**:
   Creating `/sedes/sede_bad_gps` or `/records/rec_bad_gps` with `lat: 145.0` or `geofenceRadiusMeters: -50`.
7. **Payload 7 — Denial-of-Wallet Oversized String**:
   `name`, `address`, or `photoUrl` contains an oversized string exceeding `maxLength`.
8. **Payload 8 — Path ID Poisoning**:
   Creating or reading `/sedes/bad id with spaces $pecial!` or `/records/bad id!` (violates `isValidId`).
9. **Payload 9 — Client-Forged Timestamp**:
   `createdAt` or `updatedAt` set to a past/future client `Timestamp` instead of `request.time` (`serverTimestamp()`).
10. **Payload 10 — Orphaned ClassAssignment Referencing Non-Existent Sede or Out-of-Range Day**:
    Creating `/assignments/asg_orphan` referencing a non-existent `sedeId`, `dayOfWeek: 9`, or invalid `time: "99:99"`.
11. **Payload 11 — Immortal Field Mutation on Update**:
    Client updates `/trainers/tr_1`, `/records/rec_1`, or `/activity_catalog/cat_1` while mutating `createdByUid`, `createdByEmail`, or `createdAt`.
12. **Payload 12 — Admin Role Escalation**:
    Unauthenticated or non-bootstrapped user writes `/admins/uid_attacker`.

---

## 3. Red Team Audit & Conflict Report

| Collection | Audit Field Integrity | State / Shadow Field Guard | Resource / Value Poisoning | Relational Consistency | Query Enforcer (`list`) | Update Validation Helper |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/trainers/{trainerId}` | **PASS** | **PASS** (strict `affectedKeys().hasOnly`) | **PASS** (`isValidId` + `.size()` + RE2 regex + bounded `specialties`) | **PASS** | **PASS** (`resource.data.createdAt >= timestamp.date(2020, 1, 1)`) | **PASS** (`isValidTrainer(incoming())` wraps entire `update`) |
| `/companies/{companyId}` | **PASS** | **PASS** (strict `affectedKeys().hasOnly`) | **PASS** (`isValidId` + `.size()` + RE2 regex) | **PASS** | **PASS** (`resource.data.createdAt >= timestamp.date(2020, 1, 1)`) | **PASS** (`isValidCompany(incoming())` wraps entire `update`) |
| `/sedes/{sedeId}` | **PASS** | **PASS** (strict `affectedKeys().hasOnly`) | **PASS** (`isValidId` + GPS numeric bounds) | **PASS** (`exists(/companies/$(companyId))`) | **PASS** (`resource.data.createdAt >= timestamp.date(2020, 1, 1)`) | **PASS** (`isValidSede(incoming())` wraps entire `update`) |
| `/assignments/{assignmentId}` | **PASS** | **PASS** (strict `affectedKeys().hasOnly`) | **PASS** (`isValidId` + `dayOfWeek 0..7` + bounded date lists) | **PASS** (`exists(/companies/...) && exists(/sedes/...)`) | **PASS** (`resource.data.createdAt >= timestamp.date(2020, 1, 1)`) | **PASS** (`isValidAssignment(incoming())` wraps entire `update`) |
| `/records/{recordId}` | **PASS** | **PASS** (strict `affectedKeys().hasOnly`) | **PASS** (`isValidId` + GPS/biometric maps + bounded evidence size) | **PASS** | **PASS** (`resource.data.createdAt >= timestamp.date(2020, 1, 1)`) | **PASS** (`isValidAttendanceRecord(incoming())` wraps entire `update`) |
| `/activity_catalog/{catalogId}` | **PASS** | **PASS** (strict `affectedKeys().hasOnly`) | **PASS** (`isValidId` + duration bounds `5..480` + `.size()`) | **PASS** | **PASS** (`resource.data.createdAt >= timestamp.date(2020, 1, 1)`) | **PASS** (`isValidActivityCatalogItem(incoming())` wraps entire `update`) |
| `/personnel/{personnelId}` | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| `/clients/{clientId}` | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| `/admins/{adminUid}` | **PASS** | **PASS** (`allow update: if false;`) | **PASS** | **PASS** | **PASS** (`allow list: if false;`) | **PASS** |
