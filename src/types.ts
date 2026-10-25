export type ActivityType = 'pausa_activa' | 'clase_fitness';

export type SubActivity = string;

export interface ActivityCatalogItem {
  id: string;
  name: string;
  activityType: ActivityType;
  defaultDurationMinutes: number;
  description?: string;
  active: boolean;
}

export type PunctualityStatus = 'a_tiempo' | 'con_retraso' | 'adelantado';

export interface Trainer {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  specialties: string[];
  active: boolean;
}

export interface Sede {
  id: string;
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
  colorTag?: string;
}

export interface Company {
  id: string;
  name: string;
  taxId: string; // RFC o NIT
  industry: string;
  logoText: string;
  sedes: Sede[];
}

export interface GpsData {
  lat: number;
  lng: number;
  accuracy: number;
  distanceToSedeMeters: number;
  isWithinGeofence: boolean;
  capturedAt: string;
}

export interface FacialVerificationData {
  verified: boolean;
  confidenceScore: number; // e.g. 98.4%
  facePhotoUrl: string;
  capturedAt: string;
  biometricId: string;
  livenessPassed: boolean;
  trainerName: string;
}

export interface TrainerBiometricSession {
  trainerId: string;
  trainerName: string;
  confidenceScore: number;
  biometricId: string;
  authenticatedAt: string;
  authenticatedIso: string;
  facePhotoUrl?: string;
}

export type NonComplianceReason = 'fuera_de_horario' | 'sin_cierre_30m' | 'manual_admin';

export interface ClassAssignment {
  id: string;
  trainerId: string;
  trainerName: string;
  companyId: string;
  companyName: string;
  sedeId: string;
  sedeName: string;
  sedeAddress: string;
  frequency: 'semanal' | 'mensual' | 'fecha_unica';
  dayOfWeek?: number; // 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado
  date?: string; // YYYY-MM-DD
  dayOfMonth?: number; // 1-31
  time: string; // HH:mm
  durationMinutes?: number; // Duración asignada en minutos
  activityType: ActivityType;
  activityName: string;
  locationArea: string;
  expectedAttendees?: number;
  notes?: string;
  active: boolean;
  closed?: boolean; // Bloqueada globalmente como completada y cerrada
  closedAt?: string;
  completedDates?: string[]; // Fechas YYYY-MM-DD completadas y cerradas (bloqueadas)
  nonCompliant?: boolean; // Bloqueada globalmente como incumplida
  nonCompliantReason?: NonComplianceReason;
  nonCompliantAt?: string;
  missedDates?: string[]; // Fechas YYYY-MM-DD marcadas como incumplidas y bloqueadas
  reopenedDates?: string[]; // Fechas YYYY-MM-DD rehabilitadas manualmente por administración
}

export interface AttendanceRecord {
  id: string;
  assignmentId?: string;
  trainerId: string;
  trainerName: string;
  companyId: string;
  companyName: string;
  sedeId: string;
  sedeName: string;
  sedeAddress: string;
  date: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  checkInTime: string; // HH:mm:ss
  checkInIso: string;
  checkOutTime?: string | null; // HH:mm:ss
  checkOutIso?: string | null;
  status: 'en_curso' | 'completado' | 'incumplido';
  nonComplianceReason?: NonComplianceReason;
  markedNonCompliantAt?: string;
  punctualityStatus: PunctualityStatus;
  punctualityDiffMinutes: number; // e.g. -10 is 10 min late, +5 is 5 min early
  activityType: ActivityType;
  activityName: SubActivity | string;
  attendeesCount: number;
  locationArea: string; // e.g. "Piso 5 - Sala de Capacitación"
  observations?: string;
  checkInGps: GpsData;
  checkOutGps?: GpsData;
  photoUrl: string; // Photo of presence with burned watermark
  exitPhotoUrl?: string;
  facialVerification?: FacialVerificationData;
  durationMinutes?: number;
  plannedDurationMinutes?: number;
  alarmEnabled?: boolean;
  alarmSnoozedUntilIso?: string | null;
  adminVerified: boolean;
  adminNotes?: string;
}

export interface PersonnelAddress {
  street: string;
  number: string;
  city: string;
  state: string;
  postalCode: string;
}

export type StructuredAddress = PersonnelAddress;

export type FirestoreDirectoryCategory =
  | 'trainers'
  | 'companies'
  | 'sedes'
  | 'calendar'
  | 'evidences'
  | 'personnel'
  | 'clients';

export interface FirestoreAttendanceRecord extends AttendanceRecord {
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FirestoreTrainerRecord extends Trainer {
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FirestoreDemoCompanyRecord {
  id: string;
  name: string;
  taxId: string;
  industry: string;
  logoText: string;
  phone?: string;
  primaryContactName?: string;
  address?: StructuredAddress;
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FirestoreSedeRecord extends Sede {
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FirestoreAssignmentRecord extends ClassAssignment {
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FirestoreActivityCatalogRecord extends ActivityCatalogItem {
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PersonnelRecord {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  address: StructuredAddress;
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FirestoreClientRecord {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  address: StructuredAddress;
  company: string; // Opcional (cadena vacía si no pertenece a una empresa)
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FirestoreCompanyRecord {
  id: string;
  companyName: string;
  taxId: string;
  phone: string;
  address: StructuredAddress;
  primaryContactName: string;
  createdByUid: string;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}



