/**
 * Strict validation rules synchronized verbatim with `firebase-blueprint.json` and `firestore.rules`.
 * Covers all demo entities in Firestore:
 *   1. `trainers`  (Entrenadores — name, email, phone, avatar, specialties, active)
 *   2. `companies` (Empresas — name, taxId, industry, logoText)
 *   3. `sedes`     (Sedes — companyId, companyName, name, address, city, lat, lng, geofenceRadiusMeters, contactPerson, contactRole, contactPhone, colorTag)
 * Plus preserved directory collections:
 *   4. `personnel` (Personal)
 *   5. `clients`   (Clientes)
 */

export const DIRECTORY_LIMITS = {
  fullName: { min: 2, max: 120 },
  trainerName: { min: 2, max: 120 },
  companyName: { min: 2, max: 150 },
  taxId: { min: 5, max: 25 },
  industry: { min: 2, max: 100 },
  logoText: { min: 1, max: 4 },
  sedeName: { min: 2, max: 150 },
  sedeAddress: { min: 3, max: 250 },
  sedeCity: { min: 2, max: 100 },
  contactPerson: { min: 2, max: 120 },
  contactRole: { min: 2, max: 120 },
  colorTag: { min: 0, max: 40 },
  avatar: { min: 5, max: 150000 },
  specialtyItem: { min: 1, max: 80 },
  specialtiesCount: { min: 1, max: 20 },
  geofenceRadiusMeters: { min: 10, max: 10000 },
  lat: { min: -90, max: 90 },
  lng: { min: -180, max: 180 },
  primaryContactName: { min: 2, max: 120 },
  optionalCompany: { min: 0, max: 150 },
  phone: { min: 7, max: 25 },
  email: { min: 5, max: 254 },
  street: { min: 1, max: 150 },
  number: { min: 1, max: 30 },
  city: { min: 1, max: 100 },
  state: { min: 1, max: 100 },
  postalCode: { min: 4, max: 10 },
} as const;

export const PERSONNEL_LIMITS = DIRECTORY_LIMITS;

export const NON_EMPTY_TEXT_REGEX = /^\S(.*\S)?$/;
export const PHONE_PATTERN_REGEX = /^[0-9+(][0-9+()\- ]{5,23}[0-9)]$/;
export const EMAIL_PATTERN_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const POSTAL_CODE_PATTERN_REGEX = /^[A-Za-z0-9][A-Za-z0-9\- ]{2,8}[A-Za-z0-9]$/;
export const TAX_ID_PATTERN_REGEX = /^[A-Za-z0-9&Ññ][A-Za-z0-9&Ññ.\- ]{3,23}[A-Za-z0-9&Ññ]$/;
export const LOGO_TEXT_PATTERN_REGEX = /^[A-Za-z0-9&Ññ]{1,4}$/;
export const VALID_DOC_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const AVATAR_PATTERN_REGEX = /^(https?:\/\/\S+|data:image\/[a-zA-Z0-9.+\-]+;\S+)$/;
export const COLOR_TAG_PATTERN_REGEX = /^([a-zA-Z0-9_\-]+)?$/;

export interface StructuredAddressInput {
  street: string;
  number: string;
  city: string;
  state: string;
  postalCode: string;
}

export type PersonnelAddressInput = StructuredAddressInput;

// ============================================================================
// DEMO INTERFACES FOR FIRESTORE FORMS
// ============================================================================

export interface TrainerFormInput {
  name: string;
  email: string;
  phone: string;
  avatar: string;
  specialties: string[];
  active: boolean;
}

export interface DemoCompanyFormInput {
  name: string;
  taxId: string;
  industry: string;
  logoText: string;
}

export interface SedeFormInput {
  companyId: string;
  companyName: string;
  name: string;
  address: string;
  city: string;
  lat: string;
  lng: string;
  geofenceRadiusMeters: string;
  contactPerson: string;
  contactRole: string;
  contactPhone: string;
  colorTag: string;
}

export interface SanitizedSedeInput {
  companyId: string;
  companyName: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  geofenceRadiusMeters: number;
  contactPerson: string;
  contactRole: string;
  contactPhone: string;
  colorTag: string;
}

export interface PersonnelFormInput {
  fullName: string;
  phone: string;
  email: string;
  address: StructuredAddressInput;
}

export interface ClientFormInput {
  fullName: string;
  phone: string;
  email: string;
  company: string;
  address: StructuredAddressInput;
}

export interface CompanyFormInput {
  companyName: string;
  taxId: string;
  phone: string;
  primaryContactName: string;
  address: StructuredAddressInput;
}

export type AddressFieldKey = 'street' | 'number' | 'city' | 'state' | 'postalCode';

export type TrainerFieldKey = 'name' | 'email' | 'phone' | 'avatar' | 'specialties' | 'active';

export type DemoCompanyFieldKey = 'name' | 'taxId' | 'industry' | 'logoText';

export type SedeFieldKey =
  | 'companyId'
  | 'name'
  | 'address'
  | 'city'
  | 'lat'
  | 'lng'
  | 'geofenceRadiusMeters'
  | 'contactPerson'
  | 'contactRole'
  | 'contactPhone'
  | 'colorTag';

export type PersonnelFieldKey = 'fullName' | 'phone' | 'email' | AddressFieldKey;
export type ClientFieldKey = 'fullName' | 'phone' | 'email' | 'company' | AddressFieldKey;
export type CompanyFieldKey =
  | 'companyName'
  | 'taxId'
  | 'phone'
  | 'primaryContactName'
  | AddressFieldKey;

export type TrainerValidationErrors = Partial<Record<TrainerFieldKey, string>>;
export type DemoCompanyValidationErrors = Partial<Record<DemoCompanyFieldKey, string>>;
export type SedeValidationErrors = Partial<Record<SedeFieldKey, string>>;
export type PersonnelValidationErrors = Partial<Record<PersonnelFieldKey, string>>;
export type ClientValidationErrors = Partial<Record<ClientFieldKey, string>>;
export type CompanyValidationErrors = Partial<Record<CompanyFieldKey, string>>;

export interface ValidationOutcome<TSanitized, TErrors> {
  isValid: boolean;
  errors: TErrors;
  sanitized: TSanitized;
  completedCount: number;
  totalRequired: number;
}

export type TrainerValidationResult = ValidationOutcome<TrainerFormInput, TrainerValidationErrors>;
export type DemoCompanyValidationResult = ValidationOutcome<
  DemoCompanyFormInput,
  DemoCompanyValidationErrors
>;
export type SedeValidationResult = ValidationOutcome<SanitizedSedeInput, SedeValidationErrors>;
export type PersonnelValidationResult = ValidationOutcome<
  PersonnelFormInput,
  PersonnelValidationErrors
>;
export type ClientValidationResult = ValidationOutcome<ClientFormInput, ClientValidationErrors>;
export type CompanyValidationResult = ValidationOutcome<CompanyFormInput, CompanyValidationErrors>;

function normalizeSingleLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function generateInitialsAvatarDataUrl(name: string): string {
  const clean = normalizeSingleLine(name || 'BSCW');
  const initials =
    clean
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'TR';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="48" fill="#dc2626"/><text x="120" y="138" font-family="sans-serif" font-size="84" font-weight="800" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(svg) : ''}`;
}

export function deriveCompanyLogoText(name: string, explicitLogoText?: string): string {
  const cleanedExplicit = normalizeSingleLine(explicitLogoText || '')
    .replace(/[^A-Za-z0-9&Ññ]/g, '')
    .toUpperCase()
    .slice(0, 4);
  if (cleanedExplicit.length >= 1) {
    return cleanedExplicit;
  }

  const derived = normalizeSingleLine(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
    .replace(/[^A-Za-z0-9&Ññ]/g, '')
    .slice(0, 4);

  return derived || 'CP';
}

export function sanitizeTaxIdForFirestore(rawTaxId?: string): string {
  const cleaned = normalizeSingleLine(rawTaxId || '')
    .toUpperCase()
    .replace(/[^A-Za-z0-9&Ññ.\- ]/g, '-')
    .replace(/^[.\- ]+|[.\- ]+$/g, '')
    .slice(0, DIRECTORY_LIMITS.taxId.max);

  if (
    cleaned.length >= DIRECTORY_LIMITS.taxId.min &&
    cleaned.length <= DIRECTORY_LIMITS.taxId.max &&
    TAX_ID_PATTERN_REGEX.test(cleaned)
  ) {
    return cleaned;
  }

  const alnum = cleaned.replace(/[^A-Za-z0-9&Ññ]/g, '');
  if (alnum.length >= 2) {
    const padded = `${alnum}-00000`.slice(0, Math.max(DIRECTORY_LIMITS.taxId.min, alnum.length + 2));
    if (TAX_ID_PATTERN_REGEX.test(padded)) {
      return padded;
    }
  }

  return 'XAXX010101000';
}

// ============================================================================
// 1. ENTRENADORES (`trainers` — todos los campos del demo)
// ============================================================================

export function sanitizeTrainerInput(raw: TrainerFormInput): TrainerFormInput {
  const cleanedName = normalizeSingleLine(raw.name || '');
  const rawAvatar = (raw.avatar || '').trim();
  const normalizedSpecialties = Array.from(
    new Set(
      (Array.isArray(raw.specialties) ? raw.specialties : [])
        .map((item) => normalizeSingleLine(String(item || '')))
        .filter((item) => item.length >= 1 && item.length <= DIRECTORY_LIMITS.specialtyItem.max)
    )
  ).slice(0, DIRECTORY_LIMITS.specialtiesCount.max);

  return {
    name: cleanedName,
    email: normalizeSingleLine(raw.email || '').toLowerCase(),
    phone: normalizeSingleLine(raw.phone || ''),
    avatar: rawAvatar || generateInitialsAvatarDataUrl(cleanedName || 'Entrenador'),
    specialties: normalizedSpecialties,
    active: raw.active !== false,
  };
}

export function validateTrainerInput(raw: TrainerFormInput): TrainerValidationResult {
  const sanitized = sanitizeTrainerInput(raw);
  const errors: TrainerValidationErrors = {};

  if (!sanitized.name) {
    errors.name = 'El nombre completo del entrenador es obligatorio.';
  } else if (
    sanitized.name.length < DIRECTORY_LIMITS.trainerName.min ||
    sanitized.name.length > DIRECTORY_LIMITS.trainerName.max ||
    !NON_EMPTY_TEXT_REGEX.test(sanitized.name)
  ) {
    errors.name = `Ingresa un nombre válido (${DIRECTORY_LIMITS.trainerName.min} a ${DIRECTORY_LIMITS.trainerName.max} caracteres).`;
  }

  if (!sanitized.email) {
    errors.email = 'El correo electrónico del entrenador es obligatorio.';
  } else if (
    sanitized.email.length < DIRECTORY_LIMITS.email.min ||
    sanitized.email.length > DIRECTORY_LIMITS.email.max ||
    !EMAIL_PATTERN_REGEX.test(sanitized.email)
  ) {
    errors.email = 'Ingresa un correo electrónico válido (ej. carlos.mendoza@bscw.corp).';
  }

  if (!sanitized.phone) {
    errors.phone = 'El teléfono del entrenador es obligatorio.';
  } else if (
    sanitized.phone.length < DIRECTORY_LIMITS.phone.min ||
    sanitized.phone.length > DIRECTORY_LIMITS.phone.max ||
    !PHONE_PATTERN_REGEX.test(sanitized.phone)
  ) {
    errors.phone = 'Ingresa un teléfono válido (7 a 25 caracteres, ej. +52 55 4123 8901).';
  }

  if (
    !sanitized.avatar ||
    sanitized.avatar.length < DIRECTORY_LIMITS.avatar.min ||
    sanitized.avatar.length > DIRECTORY_LIMITS.avatar.max ||
    !AVATAR_PATTERN_REGEX.test(sanitized.avatar)
  ) {
    errors.avatar = 'Proporciona una URL válida (https://...) o sube/captura una fotografía.';
  }

  if (
    sanitized.specialties.length < DIRECTORY_LIMITS.specialtiesCount.min ||
    sanitized.specialties.length > DIRECTORY_LIMITS.specialtiesCount.max
  ) {
    errors.specialties = 'Selecciona o escribe al menos 1 especialidad para el entrenador.';
  }

  const completedFlags = [
    Boolean(sanitized.name),
    Boolean(sanitized.email),
    Boolean(sanitized.phone),
    Boolean(sanitized.avatar),
    sanitized.specialties.length >= 1,
  ];

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized,
    completedCount: completedFlags.filter(Boolean).length,
    totalRequired: 5,
  };
}

// ============================================================================
// 2. EMPRESAS (`companies` — todos los campos del demo: name, taxId, industry, logoText)
// ============================================================================

export function sanitizeDemoCompanyInput(raw: DemoCompanyFormInput): DemoCompanyFormInput {
  const cleanName = normalizeSingleLine(raw.name || '');
  const cleanLogo = normalizeSingleLine(raw.logoText || '').toUpperCase();
  return {
    name: cleanName,
    taxId: normalizeSingleLine(raw.taxId || '').toUpperCase(),
    industry: normalizeSingleLine(raw.industry || ''),
    logoText: cleanLogo || (cleanName ? deriveCompanyLogoText(cleanName) : ''),
  };
}

export function validateDemoCompanyInput(raw: DemoCompanyFormInput): DemoCompanyValidationResult {
  const sanitized = sanitizeDemoCompanyInput(raw);
  const errors: DemoCompanyValidationErrors = {};

  if (!sanitized.name) {
    errors.name = 'La razón social o nombre de la empresa es obligatoria.';
  } else if (
    sanitized.name.length < DIRECTORY_LIMITS.companyName.min ||
    sanitized.name.length > DIRECTORY_LIMITS.companyName.max ||
    !NON_EMPTY_TEXT_REGEX.test(sanitized.name)
  ) {
    errors.name = `Ingresa un nombre válido (${DIRECTORY_LIMITS.companyName.min} a ${DIRECTORY_LIMITS.companyName.max} caracteres).`;
  }

  if (!sanitized.taxId) {
    errors.taxId = 'El RFC o NIT de la empresa es obligatorio.';
  } else if (
    sanitized.taxId.length < DIRECTORY_LIMITS.taxId.min ||
    sanitized.taxId.length > DIRECTORY_LIMITS.taxId.max ||
    !TAX_ID_PATTERN_REGEX.test(sanitized.taxId)
  ) {
    errors.taxId = 'Ingresa un RFC / NIT válido (5 a 25 caracteres, ej. SAN891024-K92).';
  }

  if (!sanitized.industry) {
    errors.industry = 'El giro o industria es obligatorio.';
  } else if (
    sanitized.industry.length < DIRECTORY_LIMITS.industry.min ||
    sanitized.industry.length > DIRECTORY_LIMITS.industry.max ||
    !NON_EMPTY_TEXT_REGEX.test(sanitized.industry)
  ) {
    errors.industry = `Ingresa un giro válido (${DIRECTORY_LIMITS.industry.min} a ${DIRECTORY_LIMITS.industry.max} caracteres).`;
  }

  if (!sanitized.logoText) {
    errors.logoText = 'Las siglas o badge corto son obligatorias.';
  } else if (
    sanitized.logoText.length < DIRECTORY_LIMITS.logoText.min ||
    sanitized.logoText.length > DIRECTORY_LIMITS.logoText.max ||
    !LOGO_TEXT_PATTERN_REGEX.test(sanitized.logoText)
  ) {
    errors.logoText = 'Usa de 1 a 4 caracteres alfanuméricos sin espacios (ej. BS, NM).';
  }

  const requiredValues = [
    sanitized.name,
    sanitized.taxId,
    sanitized.industry,
    sanitized.logoText,
  ];

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized,
    completedCount: requiredValues.filter((v) => v.length > 0).length,
    totalRequired: 4,
  };
}

// ============================================================================
// 3. SEDES (`sedes` — todos los campos del demo)
// ============================================================================

export function validateSedeInput(raw: SedeFormInput): SedeValidationResult {
  const companyId = normalizeSingleLine(raw.companyId || '');
  const companyName = normalizeSingleLine(raw.companyName || '');
  const name = normalizeSingleLine(raw.name || '');
  const address = normalizeSingleLine(raw.address || '');
  const city = normalizeSingleLine(raw.city || '');
  const contactPerson = normalizeSingleLine(raw.contactPerson || '');
  const contactRole = normalizeSingleLine(raw.contactRole || '');
  const contactPhone = normalizeSingleLine(raw.contactPhone || '');
  const colorTag = normalizeSingleLine(raw.colorTag || '');

  const parsedLat = Number(String(raw.lat).trim());
  const parsedLng = Number(String(raw.lng).trim());
  const parsedRadius = Number(String(raw.geofenceRadiusMeters).trim());

  const errors: SedeValidationErrors = {};

  if (!companyId || !VALID_DOC_ID_REGEX.test(companyId) || companyName.length < 2) {
    errors.companyId = 'Selecciona una empresa registrada válida para esta sede.';
  }

  if (!name) {
    errors.name = 'El nombre de la sede / planta / campus es obligatorio.';
  } else if (
    name.length < DIRECTORY_LIMITS.sedeName.min ||
    name.length > DIRECTORY_LIMITS.sedeName.max ||
    !NON_EMPTY_TEXT_REGEX.test(name)
  ) {
    errors.name = `Ingresa un nombre de sede válido (${DIRECTORY_LIMITS.sedeName.min} a ${DIRECTORY_LIMITS.sedeName.max} caracteres).`;
  }

  if (!address) {
    errors.address = 'La dirección completa de la sede es obligatoria.';
  } else if (
    address.length < DIRECTORY_LIMITS.sedeAddress.min ||
    address.length > DIRECTORY_LIMITS.sedeAddress.max ||
    !NON_EMPTY_TEXT_REGEX.test(address)
  ) {
    errors.address = `Ingresa una dirección válida (${DIRECTORY_LIMITS.sedeAddress.min} a ${DIRECTORY_LIMITS.sedeAddress.max} caracteres).`;
  }

  if (!city) {
    errors.city = 'La ciudad o estado es obligatoria.';
  } else if (
    city.length < DIRECTORY_LIMITS.sedeCity.min ||
    city.length > DIRECTORY_LIMITS.sedeCity.max ||
    !NON_EMPTY_TEXT_REGEX.test(city)
  ) {
    errors.city = `Ingresa una ciudad válida (${DIRECTORY_LIMITS.sedeCity.min} a ${DIRECTORY_LIMITS.sedeCity.max} caracteres).`;
  }

  if (
    String(raw.lat).trim() === '' ||
    !Number.isFinite(parsedLat) ||
    parsedLat < DIRECTORY_LIMITS.lat.min ||
    parsedLat > DIRECTORY_LIMITS.lat.max
  ) {
    errors.lat = 'Latitud inválida (debe estar entre -90 y 90, ej. 19.42694).';
  }

  if (
    String(raw.lng).trim() === '' ||
    !Number.isFinite(parsedLng) ||
    parsedLng < DIRECTORY_LIMITS.lng.min ||
    parsedLng > DIRECTORY_LIMITS.lng.max
  ) {
    errors.lng = 'Longitud inválida (debe estar entre -180 y 180, ej. -99.16782).';
  }

  if (
    String(raw.geofenceRadiusMeters).trim() === '' ||
    !Number.isFinite(parsedRadius) ||
    parsedRadius < DIRECTORY_LIMITS.geofenceRadiusMeters.min ||
    parsedRadius > DIRECTORY_LIMITS.geofenceRadiusMeters.max
  ) {
    errors.geofenceRadiusMeters = `El radio de geocerca debe estar entre ${DIRECTORY_LIMITS.geofenceRadiusMeters.min} y ${DIRECTORY_LIMITS.geofenceRadiusMeters.max} metros.`;
  }

  // Contact fields: optional in UI (filled with clean corporate defaults if left empty),
  // strictly validated when provided so Firestore rules always pass.
  const effectiveContactPerson = contactPerson || 'Encargado de Sede';
  const effectiveContactRole = contactRole || 'Coordinador de Salud en el Trabajo';
  const effectiveContactPhone = contactPhone || '+52 55 0000 0000';

  if (
    contactPerson &&
    (contactPerson.length < DIRECTORY_LIMITS.contactPerson.min ||
      contactPerson.length > DIRECTORY_LIMITS.contactPerson.max ||
      !NON_EMPTY_TEXT_REGEX.test(contactPerson))
  ) {
    errors.contactPerson = `Ingresa un contacto válido (${DIRECTORY_LIMITS.contactPerson.min} a ${DIRECTORY_LIMITS.contactPerson.max} caracteres).`;
  }

  if (
    contactRole &&
    (contactRole.length < DIRECTORY_LIMITS.contactRole.min ||
      contactRole.length > DIRECTORY_LIMITS.contactRole.max ||
      !NON_EMPTY_TEXT_REGEX.test(contactRole))
  ) {
    errors.contactRole = `Ingresa un cargo válido (${DIRECTORY_LIMITS.contactRole.min} a ${DIRECTORY_LIMITS.contactRole.max} caracteres).`;
  }

  if (
    contactPhone &&
    (contactPhone.length < DIRECTORY_LIMITS.phone.min ||
      contactPhone.length > DIRECTORY_LIMITS.phone.max ||
      !PHONE_PATTERN_REGEX.test(contactPhone))
  ) {
    errors.contactPhone = 'Ingresa un teléfono válido (7 a 25 caracteres, ej. +52 55 5100 1122).';
  }

  const effectiveColorTag =
    colorTag && colorTag.length <= DIRECTORY_LIMITS.colorTag.max && COLOR_TAG_PATTERN_REGEX.test(colorTag)
      ? colorTag
      : 'bg-red-600';

  if (
    colorTag &&
    (colorTag.length > DIRECTORY_LIMITS.colorTag.max || !COLOR_TAG_PATTERN_REGEX.test(colorTag))
  ) {
    errors.colorTag = 'Etiqueta de color inválida.';
  }

  const sanitized: SanitizedSedeInput = {
    companyId,
    companyName,
    name,
    address,
    city,
    lat: Number.isFinite(parsedLat) ? Number(parsedLat.toFixed(6)) : 19.42694,
    lng: Number.isFinite(parsedLng) ? Number(parsedLng.toFixed(6)) : -99.16782,
    geofenceRadiusMeters: Number.isFinite(parsedRadius) ? Math.round(parsedRadius) : 150,
    contactPerson: effectiveContactPerson,
    contactRole: effectiveContactRole,
    contactPhone: effectiveContactPhone,
    colorTag: effectiveColorTag,
  };

  const completedFlags = [
    Boolean(companyId && companyName.length >= 2),
    Boolean(name),
    Boolean(address),
    Boolean(city),
    String(raw.lat).trim() !== '' && Number.isFinite(parsedLat),
    String(raw.lng).trim() !== '' && Number.isFinite(parsedLng),
    String(raw.geofenceRadiusMeters).trim() !== '' && Number.isFinite(parsedRadius),
  ];

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized,
    completedCount: completedFlags.filter(Boolean).length,
    totalRequired: 7,
  };
}

// ============================================================================
// PRESERVED DIRECTORY VALIDATORS (`personnel` & `clients`)
// ============================================================================

export function sanitizeAddressInput(
  raw?: Partial<StructuredAddressInput>
): StructuredAddressInput {
  return {
    street: normalizeSingleLine(raw?.street || ''),
    number: normalizeSingleLine(raw?.number || ''),
    city: normalizeSingleLine(raw?.city || ''),
    state: normalizeSingleLine(raw?.state || ''),
    postalCode: normalizeSingleLine(raw?.postalCode || '').toUpperCase(),
  };
}

function validateAddressFields(
  address: StructuredAddressInput,
  errors: Partial<Record<AddressFieldKey, string>>
): void {
  if (!address.street) {
    errors.street = 'La calle es obligatoria.';
  } else if (
    address.street.length < DIRECTORY_LIMITS.street.min ||
    address.street.length > DIRECTORY_LIMITS.street.max ||
    !NON_EMPTY_TEXT_REGEX.test(address.street)
  ) {
    errors.street = `La calle debe tener entre ${DIRECTORY_LIMITS.street.min} y ${DIRECTORY_LIMITS.street.max} caracteres.`;
  }

  if (!address.number) {
    errors.number = 'El número es obligatorio.';
  } else if (
    address.number.length < DIRECTORY_LIMITS.number.min ||
    address.number.length > DIRECTORY_LIMITS.number.max ||
    !NON_EMPTY_TEXT_REGEX.test(address.number)
  ) {
    errors.number = `El número debe tener entre ${DIRECTORY_LIMITS.number.min} y ${DIRECTORY_LIMITS.number.max} caracteres (ej. 120 o S/N).`;
  }

  if (!address.city) {
    errors.city = 'La ciudad es obligatoria.';
  } else if (
    address.city.length < DIRECTORY_LIMITS.city.min ||
    address.city.length > DIRECTORY_LIMITS.city.max ||
    !NON_EMPTY_TEXT_REGEX.test(address.city)
  ) {
    errors.city = `La ciudad debe tener entre ${DIRECTORY_LIMITS.city.min} y ${DIRECTORY_LIMITS.city.max} caracteres.`;
  }

  if (!address.state) {
    errors.state = 'El estado es obligatorio.';
  } else if (
    address.state.length < DIRECTORY_LIMITS.state.min ||
    address.state.length > DIRECTORY_LIMITS.state.max ||
    !NON_EMPTY_TEXT_REGEX.test(address.state)
  ) {
    errors.state = `El estado debe tener entre ${DIRECTORY_LIMITS.state.min} y ${DIRECTORY_LIMITS.state.max} caracteres.`;
  }

  if (!address.postalCode) {
    errors.postalCode = 'El código postal es obligatorio.';
  } else if (
    address.postalCode.length < DIRECTORY_LIMITS.postalCode.min ||
    address.postalCode.length > DIRECTORY_LIMITS.postalCode.max ||
    !POSTAL_CODE_PATTERN_REGEX.test(address.postalCode)
  ) {
    errors.postalCode = 'Ingresa un código postal válido (4 a 10 caracteres, ej. 06600).';
  }
}

export function sanitizePersonnelInput(raw: PersonnelFormInput): PersonnelFormInput {
  return {
    fullName: normalizeSingleLine(raw.fullName || ''),
    phone: normalizeSingleLine(raw.phone || ''),
    email: normalizeSingleLine(raw.email || '').toLowerCase(),
    address: sanitizeAddressInput(raw.address),
  };
}

export function validatePersonnelInput(raw: PersonnelFormInput): PersonnelValidationResult {
  const sanitized = sanitizePersonnelInput(raw);
  const errors: PersonnelValidationErrors = {};

  if (!sanitized.fullName) {
    errors.fullName = 'El nombre completo es obligatorio.';
  } else if (
    sanitized.fullName.length < DIRECTORY_LIMITS.fullName.min ||
    sanitized.fullName.length > DIRECTORY_LIMITS.fullName.max ||
    !NON_EMPTY_TEXT_REGEX.test(sanitized.fullName)
  ) {
    errors.fullName = `Ingresa un nombre completo válido (${DIRECTORY_LIMITS.fullName.min} a ${DIRECTORY_LIMITS.fullName.max} caracteres).`;
  }

  if (!sanitized.phone) {
    errors.phone = 'El teléfono es obligatorio.';
  } else if (
    sanitized.phone.length < DIRECTORY_LIMITS.phone.min ||
    sanitized.phone.length > DIRECTORY_LIMITS.phone.max ||
    !PHONE_PATTERN_REGEX.test(sanitized.phone)
  ) {
    errors.phone = 'Ingresa un teléfono válido (7 a 25 caracteres, ej. +52 55 1234 5678).';
  }

  if (!sanitized.email) {
    errors.email = 'El correo electrónico es obligatorio.';
  } else if (
    sanitized.email.length < DIRECTORY_LIMITS.email.min ||
    sanitized.email.length > DIRECTORY_LIMITS.email.max ||
    !EMAIL_PATTERN_REGEX.test(sanitized.email)
  ) {
    errors.email = 'Ingresa un correo electrónico válido (ej. personal@empresa.com).';
  }

  validateAddressFields(sanitized.address, errors);

  const requiredValues = [
    sanitized.fullName,
    sanitized.phone,
    sanitized.email,
    sanitized.address.street,
    sanitized.address.number,
    sanitized.address.city,
    sanitized.address.state,
    sanitized.address.postalCode,
  ];

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized,
    completedCount: requiredValues.filter((val) => val.length > 0).length,
    totalRequired: 8,
  };
}

export function sanitizeClientInput(raw: ClientFormInput): ClientFormInput {
  return {
    fullName: normalizeSingleLine(raw.fullName || ''),
    phone: normalizeSingleLine(raw.phone || ''),
    email: normalizeSingleLine(raw.email || '').toLowerCase(),
    company: normalizeSingleLine(raw.company || ''),
    address: sanitizeAddressInput(raw.address),
  };
}

export function validateClientInput(raw: ClientFormInput): ClientValidationResult {
  const sanitized = sanitizeClientInput(raw);
  const errors: ClientValidationErrors = {};

  if (!sanitized.fullName) {
    errors.fullName = 'El nombre del cliente es obligatorio.';
  } else if (
    sanitized.fullName.length < DIRECTORY_LIMITS.fullName.min ||
    sanitized.fullName.length > DIRECTORY_LIMITS.fullName.max ||
    !NON_EMPTY_TEXT_REGEX.test(sanitized.fullName)
  ) {
    errors.fullName = `Ingresa un nombre válido (${DIRECTORY_LIMITS.fullName.min} a ${DIRECTORY_LIMITS.fullName.max} caracteres).`;
  }

  if (!sanitized.phone) {
    errors.phone = 'El teléfono del cliente es obligatorio.';
  } else if (
    sanitized.phone.length < DIRECTORY_LIMITS.phone.min ||
    sanitized.phone.length > DIRECTORY_LIMITS.phone.max ||
    !PHONE_PATTERN_REGEX.test(sanitized.phone)
  ) {
    errors.phone = 'Ingresa un teléfono válido (7 a 25 caracteres, ej. +52 55 1234 5678).';
  }

  if (!sanitized.email) {
    errors.email = 'El correo electrónico es obligatorio.';
  } else if (
    sanitized.email.length < DIRECTORY_LIMITS.email.min ||
    sanitized.email.length > DIRECTORY_LIMITS.email.max ||
    !EMAIL_PATTERN_REGEX.test(sanitized.email)
  ) {
    errors.email = 'Ingresa un correo electrónico válido (ej. cliente@correo.com).';
  }

  if (
    sanitized.company.length > DIRECTORY_LIMITS.optionalCompany.max ||
    (sanitized.company.length > 0 && !NON_EMPTY_TEXT_REGEX.test(sanitized.company))
  ) {
    errors.company = `El nombre de la empresa no debe exceder ${DIRECTORY_LIMITS.optionalCompany.max} caracteres.`;
  }

  validateAddressFields(sanitized.address, errors);

  const requiredValues = [
    sanitized.fullName,
    sanitized.phone,
    sanitized.email,
    sanitized.address.street,
    sanitized.address.number,
    sanitized.address.city,
    sanitized.address.state,
    sanitized.address.postalCode,
  ];

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized,
    completedCount: requiredValues.filter((val) => val.length > 0).length,
    totalRequired: 8,
  };
}
