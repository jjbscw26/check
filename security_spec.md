# Security Specification (`security_spec.md`)

## 1. Master Source of Truth & Data Invariants

1. **Authentication & Email Verification Invariant**:
   - Zero anonymous access. Every read or write across `/trainers/{trainerId}`, `/companies/{companyId}`, `/sedes/{sedeId}`, `/personnel/{personnelId}`, `/clients/{clientId}`, and `/admins/{adminUid}` requires `request.auth != null` and `request.auth.token.email_verified == true`.
2. **PII & Multi-Collection Isolation Invariant (Pillar 6 & Pillar 1)**:
   - Each entity is stored in its own top-level Firestore collection (avoiding unbounded nested arrays of `Sede` inside `Company`):
     - `/trainers/{trainerId}`: Demo Trainer PII & profile (`name`, `email`, `phone`, `avatar`, bounded `specialties` list, `active`).
     - `/companies/{companyId}`: Demo Company profile (`name`, `taxId`, `industry`, `logoText`, plus optional legacy compatibility fields `companyName`, `phone`, `primaryContactName`, `address`).
     - `/sedes/{sedeId}`: Demo Sede / Campus profile (`companyId`, `companyName`, `name`, `address`, `city`, `lat`, `lng`, `geofenceRadiusMeters`, `contactPerson`, `contactRole`, `contactPhone`, optional `colorTag`).
     - `/personnel/{personnelId}` & `/clients/{clientId}`: Preserved directory collections with strict PII isolation.
   - Across all collections, `get`, `update`, and `delete` are strictly isolated to the creator (`resource.data.createdByUid == request.auth.uid`) or verified admin (`isAdmin()`). `list` is strictly isolated via `resource.data.createdByUid == request.auth.uid || isBootstrappedAdmin()` with zero `get()`/`exists()` calls inside `list`.
3. **Global Consistency & Relational Integrity Invariant (Pillar 11)**:
   - On `/sedes/{sedeId}` `create` and `update`, after static schema validation passes, `exists(/databases/$(database)/documents/companies/$(incoming().companyId))` MUST hold, and the parent company must belong to `request.auth.uid` or `isAdmin()`.
4. **Total Array & Numeric Guarding Invariant (Pillar 2 & Pillar 5)**:
   - `Trainer.specialties` must be a `list` with `size() >= 1 && size() <= 20` and head element validated as a trimmed non-empty `string` (`1..80` chars).
   - `Sede.lat` (`-90..90`), `Sede.lng` (`-180..180`), and `Sede.geofenceRadiusMeters` (`10..10000`) must be finite `number` values (not `NaN`).
5. **Ownership & Temporal Immutability Invariant**:
   - On `create`: `createdByUid == request.auth.uid`, `createdByEmail == request.auth.token.email`, `createdAt == request.time`, and `updatedAt == request.time`.
   - On `update`: `createdByUid`, `createdByEmail`, and `createdAt` are strictly immutable (`incoming().field == existing().field`), `updatedAt == request.time`, and only domain fields + `updatedAt` may change via `affectedKeys().hasOnly(...)`.
6. **Path Variable Hardening Invariant (Pillar 3)**:
   - Single-document operations (`get`, `create`, `update`, `delete`) enforce `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, 1..128 chars).

---

## 2. The "Dirty Dozen" Adversarial Payloads

All 12 payloads below MUST evaluate to `PERMISSION_DENIED`:

1. **Payload 1 — Identity Spoofing on Create (`trainers`, `companies`, `sedes`)**:
   Authenticated user `uid_attacker` sets `createdByUid: "uid_victim"` while creating `/trainers/tr_spoof`.
2. **Payload 2 — Unverified Admin Email Spoofing**:
   Attacker authenticates with `email: "jjbscw@gmail.com"` and `email_verified: false` attempting `get` or `list` on `/trainers`, `/companies`, or `/sedes`.
3. **Payload 3 — Shadow / Ghost Field Injection on Create**:
   Valid trainer, company, or sede payload plus unauthorized field `"role": "superadmin"` or `"creditLimit": 999999`.
4. **Payload 4 — Empty / Unbounded Array or Whitespace-Only Field**:
   Trainer payload with `specialties: []` or >20 items, or Company payload where `taxId` or `industry` is `"     "`.
5. **Payload 5 — Orphaned Sede Referencing Non-Existent or Foreign Company**:
   Creating `/sedes/sede_orphan` where `companyId` does not exist in `/companies` or belongs to another tenant (`uid_alice` vs `uid_bob`).
6. **Payload 6 — Out-of-Range GPS Coordinates or Geofence Radius on Sede**:
   Creating `/sedes/sede_bad_gps` with `lat: 145.0`, `lng: -250.0`, or `geofenceRadiusMeters: 0` / `-50`.
7. **Payload 7 — Denial-of-Wallet Oversized String**:
   `name`, `address`, or `avatar` contains an oversized string exceeding `maxLength`.
8. **Payload 8 — Path ID Poisoning**:
   Creating `/sedes/bad id with spaces $pecial!` (violates `isValidId`).
9. **Payload 9 — Client-Forged Timestamp**:
   `createdAt` or `updatedAt` set to a past/future client `Timestamp` instead of `request.time` (`serverTimestamp()`).
10. **Payload 10 — Cross-Tenant PII Read (`get` & `list`)**:
    Verified user `uid_bob` attempts `get` on `/trainers/tr_alice` or unfiltered `list` across `/trainers`, `/companies`, or `/sedes`.
11. **Payload 11 — Immortal Field Mutation on Update**:
    Document owner updates `/trainers/tr_1`, `/companies/comp_1`, or `/sedes/sede_1` while mutating `createdByUid` or `createdAt`.
12. **Payload 12 — Self-Assigned Admin Privilege Escalation**:
    Verified non-admin user writes `/admins/uid_attacker` with `{ email: "attacker@test.com", grantedAt: request.time }`.

---

## 3. Red Team Audit & Conflict Report

| Collection | Identity Spoofing | State Shortcutting | Resource / Value Poisoning | PII Blanket Leak | Query Trust (`list`) | Update Validation Helper |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/trainers/{trainerId}` | **PASS** (`createdByUid == request.auth.uid` on create; immutable on update) | **PASS** (strict `affectedKeys().hasOnly`) | **PASS** (`isValidId` + `.size()` + RE2 regex + bounded `specialties` array guard) | **PASS** (`get` restricted to creator or `isAdmin()`) | **PASS** (`resource.data.createdByUid == request.auth.uid \|\| isBootstrappedAdmin()`, zero `get`/`exists`) | **PASS** (`isValidTrainer(incoming())` wraps entire `update`) |
| `/companies/{companyId}` | **PASS** (`createdByUid == request.auth.uid` on create; immutable on update) | **PASS** (strict `affectedKeys().hasOnly`) | **PASS** (`isValidId` + `.size()` + RE2 regex on `name`, `taxId`, `industry`, `logoText` + optional fields) | **PASS** (`get` restricted to creator or `isAdmin()`) | **PASS** (`resource.data.createdByUid == request.auth.uid \|\| isBootstrappedAdmin()`, zero `get`/`exists`) | **PASS** (`isValidCompany(incoming())` wraps entire `update`) |
| `/sedes/{sedeId}` | **PASS** (`createdByUid == request.auth.uid` + parent company ownership check) | **PASS** (strict `affectedKeys().hasOnly` + parent company existence check) | **PASS** (`isValidId` + GPS `lat`/`lng`/`geofenceRadiusMeters` numeric bounds + RE2 regex) | **PASS** (`get` restricted to creator or `isAdmin()`) | **PASS** (`resource.data.createdByUid == request.auth.uid \|\| isBootstrappedAdmin()`, zero `get`/`exists`) | **PASS** (`isValidSede(incoming())` wraps entire `update`) |
| `/personnel/{personnelId}` | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| `/clients/{clientId}` | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| `/admins/{adminUid}` | **PASS** | **PASS** (`allow update: if false;`) | **PASS** | **PASS** | **PASS** (`allow list: if false;`) | **PASS** |
