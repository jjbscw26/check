import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Database,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserCircle2,
  Users,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  FIRESTORE_MIN_CREATED_AT,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { useDirectoryAuth } from '../hooks/useDirectoryAuth';
import {
  ACTIVITY_TYPE_DEFAULT_MINUTES,
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  ALL_ACTIVITY_TYPES,
  AttendanceRecord,
  Company,
  FirestoreActivityCatalogRecord,
  FirestoreAssignmentRecord,
  FirestoreClientRecord,
  FirestoreDemoCompanyRecord,
  FirestoreDirectoryCategory,
  FirestoreSedeRecord,
  FirestoreTrainerRecord,
  normalizeActivityType,
  PersonnelRecord,
  StructuredAddress,
} from '../types';
import {
  ClientFieldKey,
  ClientFormInput,
  DemoCompanyFieldKey,
  DemoCompanyFormInput,
  deriveCompanyLogoText,
  DIRECTORY_LIMITS,
  generateInitialsAvatarDataUrl,
  PersonnelFieldKey,
  PersonnelFormInput,
  SedeFieldKey,
  SedeFormInput,
  StructuredAddressInput,
  TrainerFieldKey,
  TrainerFormInput,
  validateClientInput,
  validateDemoCompanyInput,
  validatePersonnelInput,
  validateSedeInput,
  validateTrainerInput,
} from '../utils/personnelValidation';
import {
  deleteActivityCatalogItemFromFirestore,
  deleteAssignmentFromFirestore,
  deleteCompanyAndSedesFromFirestore,
  deleteRecordFromFirestore,
  deleteSedeFromFirestore,
  deleteTrainerFromFirestore,
  parseFirestoreAttendanceRecord,
  saveActivityCatalogItemToFirestore,
  saveCompanyToFirestore,
  saveRecordToFirestore,
  saveSedeToFirestore,
  saveTrainerToFirestore,
} from '../utils/firestoreDemoSync';
import {
  cleanDisciplineLabel,
  collectAllSelectableSpecialties,
  collectMissingCatalogItemsFromTrainers,
  PRESET_SPECIALTIES,
} from '../utils/specialtyDisciplines';
import { formatDistance, getCurrentPositionAsync } from '../utils/geo';
import {
  EvidencePhotoSlot,
  exportEvidenceRecordsToExcel,
  exportEvidenceRecordsToPdf,
} from '../utils/evidenceExport';
import { EvidencePhotoLightbox } from './EvidencePhotoLightbox';
import { PdfEvidenceLogModal } from './PdfEvidenceLogModal';
import { RecordDetailModal } from './RecordDetailModal';
import {
  attachStreamToVideoElement,
  captureSquareAvatarFromSource,
  formatCameraErrorMessage,
  openCameraStreamWithFallback,
  unregisterExclusiveCameraStream,
  VideoDeviceOption,
} from '../utils/cameraStream';
import {
  isPlaceholderOrMissingAvatar,
  validateFaceInRegistrationPhoto,
} from '../utils/faceVerification';

const DIRECTORY_CAMERA_OWNER_ID = 'directory-trainer-camera';

const SEDE_COLOR_TAGS: { value: string; label: string; dotClass: string }[] = [
  { value: 'bg-red-600', label: 'Rojo BSCW', dotClass: 'bg-red-600' },
  { value: 'bg-red-500', label: 'Rojo Claro', dotClass: 'bg-red-500' },
  { value: 'bg-blue-600', label: 'Azul Corporativo', dotClass: 'bg-blue-600' },
  { value: 'bg-blue-700', label: 'Azul Institucional', dotClass: 'bg-blue-700' },
  { value: 'bg-emerald-600', label: 'Verde Salud', dotClass: 'bg-emerald-600' },
  { value: 'bg-amber-600', label: 'Ámbar Operativo', dotClass: 'bg-amber-600' },
  { value: 'bg-slate-800', label: 'Pizarra Ejecutiva', dotClass: 'bg-slate-800' },
];

const WEEKDAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

const EMPTY_ADDRESS: StructuredAddressInput = {
  street: '',
  number: '',
  city: '',
  state: '',
  postalCode: '',
};

const EMPTY_TRAINER_FORM: TrainerFormInput = {
  name: '',
  email: '',
  phone: '',
  avatar: generateInitialsAvatarDataUrl('TR'),
  specialties: ['Pausas Activas', 'Entrenamiento Funcional'],
  active: true,
};

const EMPTY_COMPANY_FORM: DemoCompanyFormInput = {
  name: '',
  taxId: '',
  industry: 'Servicios Corporativos',
  logoText: '',
};

const EMPTY_SEDE_FORM: SedeFormInput = {
  companyId: '',
  companyName: '',
  name: '',
  address: '',
  city: 'Ciudad de México',
  lat: '19.42694',
  lng: '-99.16782',
  geofenceRadiusMeters: '150',
  contactPerson: '',
  contactRole: 'Coordinador de Salud en el Trabajo',
  contactPhone: '',
  colorTag: 'bg-red-600',
};

const EMPTY_PERSONNEL_FORM: PersonnelFormInput = {
  fullName: '',
  phone: '',
  email: '',
  address: { ...EMPTY_ADDRESS },
};

const EMPTY_CLIENT_FORM: ClientFormInput = {
  fullName: '',
  phone: '',
  email: '',
  company: '',
  address: { ...EMPTY_ADDRESS },
};

const ALL_TRAINER_TOUCHED: Record<TrainerFieldKey, boolean> = {
  name: true,
  email: true,
  phone: true,
  avatar: true,
  specialties: true,
  active: true,
};

const ALL_COMPANY_TOUCHED: Record<DemoCompanyFieldKey, boolean> = {
  name: true,
  taxId: true,
  industry: true,
  logoText: true,
};

const ALL_SEDE_TOUCHED: Record<SedeFieldKey, boolean> = {
  companyId: true,
  name: true,
  address: true,
  city: true,
  lat: true,
  lng: true,
  geofenceRadiusMeters: true,
  contactPerson: true,
  contactRole: true,
  contactPhone: true,
  colorTag: true,
};

const ALL_PERSONNEL_TOUCHED: Record<PersonnelFieldKey, boolean> = {
  fullName: true,
  phone: true,
  email: true,
  street: true,
  number: true,
  city: true,
  state: true,
  postalCode: true,
};

const ALL_CLIENT_TOUCHED: Record<ClientFieldKey, boolean> = {
  fullName: true,
  phone: true,
  email: true,
  company: true,
  street: true,
  number: true,
  city: true,
  state: true,
  postalCode: true,
};

interface CategoryMeta {
  id: FirestoreDirectoryCategory;
  label: string;
  singularLabel: string;
  collectionPath: string;
  description: string;
  isDemoCore: boolean;
  icon: React.FC<{ className?: string }>;
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'trainers',
    label: 'Entrenadores',
    singularLabel: 'Entrenador',
    collectionPath: '/trainers',
    description: 'Nombre, correo, teléfono, fotografía/avatar, especialidades y estado activo.',
    isDemoCore: true,
    icon: UserCheck,
  },
  {
    id: 'companies',
    label: 'Empresas',
    singularLabel: 'Empresa',
    collectionPath: '/companies',
    description: 'Razón social, RFC / NIT, giro o industria y siglas (logoText).',
    isDemoCore: true,
    icon: Building2,
  },
  {
    id: 'sedes',
    label: 'Sedes',
    singularLabel: 'Sede',
    collectionPath: '/sedes',
    description: 'Empresa, dirección, ciudad, GPS (lat/lng), geocerca (m), contacto opcional y etiqueta.',
    isDemoCore: true,
    icon: MapPin,
  },
  {
    id: 'calendar',
    label: 'Calendario',
    singularLabel: 'Calendario de Asignaciones',
    collectionPath: '/assignments · /activity_catalog',
    description: 'Programación de asignaciones, modalidades y estado operativo sincronizado en tiempo real.',
    isDemoCore: true,
    icon: Calendar,
  },
  {
    id: 'evidences',
    label: 'Bitácora de Evidencias',
    singularLabel: 'Evidencia de Asistencia',
    collectionPath: '/records',
    description: 'Bitácora oficial en Firestore con fotos de entrada, salida, validación biométrica facial, GPS e impresión o descarga en PDF y Excel.',
    isDemoCore: true,
    icon: Camera,
  },
  {
    id: 'personnel',
    label: 'Personal',
    singularLabel: 'Personal',
    collectionPath: '/personnel',
    description: 'Expediente administrativo: nombre, teléfono, correo y domicilio estructurado.',
    isDemoCore: false,
    icon: Users,
  },
  {
    id: 'clients',
    label: 'Clientes',
    singularLabel: 'Cliente',
    collectionPath: '/clients',
    description: 'Datos del cliente, domicilio residencial y empresa opcional.',
    isDemoCore: false,
    icon: UserCircle2,
  },
];

function parseAddress(raw: unknown): StructuredAddress {
  const addr = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    street: String(addr.street || ''),
    number: String(addr.number || ''),
    city: String(addr.city || ''),
    state: String(addr.state || ''),
    postalCode: String(addr.postalCode || ''),
  };
}

function formatAddressInline(addr: StructuredAddress): string {
  return `${addr.street} #${addr.number}, ${addr.city}, ${addr.state}, C.P. ${addr.postalCode}`;
}

function resizeImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const compressed = captureSquareAvatarFromSource(img, {
          mirrorHorizontal: false,
          targetSize: 320,
          maxDataUrlChars: 115000,
        });
        resolve(compressed || (reader.result as string));
      };
      img.onerror = () => reject(new Error('Imagen no válida'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsDataURL(file);
  });
}

export interface PersonnelRegistryViewProps {
  embeddedInAdmin?: boolean;
  onNavigateView?: (view: 'trainer' | 'personnel' | 'admin') => void;
  onExitEmbeddedDirectory?: () => void;
}

interface PersonnelRegistryWorkspaceProps {
  embeddedInAdmin: boolean;
  authenticatedUser: User;
  isAdminUser: boolean;
  onSignOut: () => Promise<void>;
}

const PersonnelRegistryWorkspace: React.FC<PersonnelRegistryWorkspaceProps> = ({
  embeddedInAdmin,
  authenticatedUser,
  isAdminUser,
  onSignOut,
}) => {
  const [activeCategory, setActiveCategory] = useState<FirestoreDirectoryCategory>('trainers');

  // Form states per collection
  const [trainerForm, setTrainerForm] = useState<TrainerFormInput>(EMPTY_TRAINER_FORM);
  const [customSpecialty, setCustomSpecialty] = useState<string>('');
  const [companyForm, setCompanyForm] = useState<DemoCompanyFormInput>(EMPTY_COMPANY_FORM);
  const [sedeForm, setSedeForm] = useState<SedeFormInput>(EMPTY_SEDE_FORM);
  const [personnelForm, setPersonnelForm] = useState<PersonnelFormInput>(EMPTY_PERSONNEL_FORM);
  const [clientForm, setClientForm] = useState<ClientFormInput>(EMPTY_CLIENT_FORM);

  // Catalog (/activity_catalog) discipline form state inside Calendar tab
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [catalogName, setCatalogName] = useState<string>('');
  const [catalogType, setCatalogType] = useState<ActivityType>('clase_fitness');
  const [catalogDuration, setCatalogDuration] = useState<number>(
    ACTIVITY_TYPE_DEFAULT_MINUTES.clase_fitness
  );
  const [catalogDescription, setCatalogDescription] = useState<string>('');
  const [catalogActive, setCatalogActive] = useState<boolean>(true);

  // Touched maps
  const [trainerTouched, setTrainerTouched] = useState<Partial<Record<TrainerFieldKey, boolean>>>({});
  const [companyTouched, setCompanyTouched] = useState<Partial<Record<DemoCompanyFieldKey, boolean>>>({});
  const [sedeTouched, setSedeTouched] = useState<Partial<Record<SedeFieldKey, boolean>>>({});
  const [personnelTouched, setPersonnelTouched] = useState<Partial<Record<PersonnelFieldKey, boolean>>>({});
  const [clientTouched, setClientTouched] = useState<Partial<Record<ClientFieldKey, boolean>>>({});

  const [submitAttemptedByCat, setSubmitAttemptedByCat] = useState<
    Record<FirestoreDirectoryCategory, boolean>
  >({
    trainers: false,
    companies: false,
    sedes: false,
    calendar: false,
    evidences: false,
    personnel: false,
    clients: false,
  });

  const [editingIdByCat, setEditingIdByCat] = useState<
    Record<FirestoreDirectoryCategory, string | null>
  >({
    trainers: null,
    companies: null,
    sedes: null,
    calendar: null,
    evidences: null,
    personnel: null,
    clients: null,
  });

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [gettingSedeGps, setGettingSedeGps] = useState<boolean>(false);

  // Bitácora de Evidencias (/records) UI & export state
  const [evidenceViewMode, setEvidenceViewMode] = useState<'list' | 'gallery'>('list');
  const [evidenceStatusFilter, setEvidenceStatusFilter] = useState<
    'all' | 'completado' | 'en_curso' | 'incumplido'
  >('all');
  const [evidenceDateFilter, setEvidenceDateFilter] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [singlePdfRecordId, setSinglePdfRecordId] = useState<string | null>(null);
  const [isEvidencePdfModalOpen, setIsEvidencePdfModalOpen] = useState<boolean>(false);
  const [selectedRecordForAudit, setSelectedRecordForAudit] = useState<AttendanceRecord | null>(
    null
  );
  const [lightboxState, setLightboxState] = useState<{
    record: AttendanceRecord;
    slot: EvidencePhotoSlot;
  } | null>(null);

  const [saveFeedback, setSaveFeedback] = useState<{
    category: FirestoreDirectoryCategory;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Firestore real-time collection lists
  const [trainersList, setTrainersList] = useState<FirestoreTrainerRecord[]>([]);
  const [companiesList, setCompaniesList] = useState<FirestoreDemoCompanyRecord[]>([]);
  const [sedesList, setSedesList] = useState<FirestoreSedeRecord[]>([]);
  const [assignmentsList, setAssignmentsList] = useState<FirestoreAssignmentRecord[]>([]);
  const [recordsList, setRecordsList] = useState<AttendanceRecord[]>([]);
  const [catalogList, setCatalogList] = useState<FirestoreActivityCatalogRecord[]>([]);
  const [personnelList, setPersonnelList] = useState<PersonnelRecord[]>([]);
  const [clientsList, setClientsList] = useState<FirestoreClientRecord[]>([]);

  const [loadingByCat, setLoadingByCat] = useState<Record<FirestoreDirectoryCategory, boolean>>({
    trainers: false,
    companies: false,
    sedes: false,
    calendar: false,
    evidences: false,
    personnel: false,
    clients: false,
  });

  const [searchByCat, setSearchByCat] = useState<Record<FirestoreDirectoryCategory, string>>({
    trainers: '',
    companies: '',
    sedes: '',
    calendar: '',
    evidences: '',
    personnel: '',
    clients: '',
  });

  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [fatalFirestoreError, setFatalFirestoreError] = useState<Error | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formCardRef = useRef<HTMLDivElement | null>(null);

  // Live WebRTC Camera state for Trainer Registration Photo in Directory
  const trainerVideoRef = useRef<HTMLVideoElement | null>(null);
  const trainerStreamRef = useRef<MediaStream | null>(null);
  const [isTrainerCameraOpen, setIsTrainerCameraOpen] = useState<boolean>(false);
  const [isStartingTrainerCamera, setIsStartingTrainerCamera] = useState<boolean>(false);
  const [isTrainerVideoReady, setIsTrainerVideoReady] = useState<boolean>(false);
  const [trainerCameraFacing, setTrainerCameraFacing] = useState<'user' | 'environment'>('user');
  const [trainerVideoDevices, setTrainerVideoDevices] = useState<VideoDeviceOption[]>([]);
  const [trainerActiveDeviceId, setTrainerActiveDeviceId] = useState<string | undefined>(undefined);
  const [isTrainerVideoMirrored, setIsTrainerVideoMirrored] = useState<boolean>(true);
  const [trainerCameraError, setTrainerCameraError] = useState<string | null>(null);
  const [trainerPhotoBiometricStatus, setTrainerPhotoBiometricStatus] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  const stopTrainerCamera = useCallback(() => {
    unregisterExclusiveCameraStream(DIRECTORY_CAMERA_OWNER_ID, trainerStreamRef.current);
    trainerStreamRef.current = null;
    if (trainerVideoRef.current) {
      trainerVideoRef.current.srcObject = null;
    }
    setIsTrainerCameraOpen(false);
    setIsTrainerVideoReady(false);
    setIsStartingTrainerCamera(false);
  }, []);

  const bindTrainerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    trainerVideoRef.current = el;
    if (el && trainerStreamRef.current) {
      void attachStreamToVideoElement(el, trainerStreamRef.current).then((ok) => {
        if (ok) {
          setIsTrainerVideoReady(true);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (isTrainerCameraOpen && trainerVideoRef.current && trainerStreamRef.current) {
      attachStreamToVideoElement(trainerVideoRef.current, trainerStreamRef.current).then((ok) => {
        if (ok) setIsTrainerVideoReady(true);
      });
    }
  }, [isTrainerCameraOpen]);

  useEffect(() => {
    if (activeCategory !== 'trainers') {
      stopTrainerCamera();
    }
  }, [activeCategory, stopTrainerCamera]);

  useEffect(() => {
    return () => {
      unregisterExclusiveCameraStream(DIRECTORY_CAMERA_OWNER_ID, trainerStreamRef.current);
      trainerStreamRef.current = null;
    };
  }, []);

  if (fatalFirestoreError) {
    throw fatalFirestoreError;
  }

  // Real-time listeners attached ONLY after verified authentication in Directorio
  useEffect(() => {
    setLoadingByCat({
      trainers: true,
      companies: true,
      sedes: true,
      calendar: true,
      evidences: true,
      personnel: true,
      clients: true,
    });

    const mkQuery = (colName: string) =>
      query(collection(db, colName), where('createdAt', '>=', FIRESTORE_MIN_CREATED_AT));

    const mkPrivateDirectoryQuery = (colName: 'personnel' | 'clients') =>
      isAdminUser
        ? query(collection(db, colName), where('createdAt', '>=', FIRESTORE_MIN_CREATED_AT))
        : query(collection(db, colName), where('createdByUid', '==', authenticatedUser.uid));

    const unsubTrainers = onSnapshot(
      mkQuery('trainers'),
      (snap) => {
        const items: FirestoreTrainerRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
          const updatedTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : createdTs;
          const name = String(d.name || '');
          return {
            id: docSnap.id,
            name,
            email: String(d.email || ''),
            phone: String(d.phone || ''),
            avatar: String(d.avatar || generateInitialsAvatarDataUrl(name)),
            specialties: Array.isArray(d.specialties)
              ? d.specialties.map((s) => String(s))
              : ['Pausas Activas'],
            active: d.active !== false,
            createdByUid: String(d.createdByUid || ''),
            createdByEmail: String(d.createdByEmail || ''),
            createdAtMs: createdTs,
            updatedAtMs: updatedTs,
          };
        });
        items.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setTrainersList(items);
        setLoadingByCat((prev) => ({ ...prev, trainers: false }));
      },
      (error) => {
        setLoadingByCat((prev) => ({ ...prev, trainers: false }));
        try {
          handleFirestoreError(error, OperationType.LIST, 'trainers');
        } catch (err) {
          setFatalFirestoreError(err as Error);
        }
      }
    );

    const unsubCompanies = onSnapshot(
      mkQuery('companies'),
      (snap) => {
        const items: FirestoreDemoCompanyRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
          const updatedTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : createdTs;
          const resolvedName = String(d.name || d.companyName || '');
          const resolvedTaxId = String(d.taxId || '');
          const resolvedIndustry = String(d.industry || 'Servicios Corporativos');
          const resolvedLogoText = deriveCompanyLogoText(
            resolvedName,
            typeof d.logoText === 'string' ? d.logoText : undefined
          );
          return {
            id: docSnap.id,
            name: resolvedName,
            taxId: resolvedTaxId,
            industry: resolvedIndustry,
            logoText: resolvedLogoText,
            phone: typeof d.phone === 'string' ? d.phone : undefined,
            primaryContactName:
              typeof d.primaryContactName === 'string' ? d.primaryContactName : undefined,
            address: d.address ? parseAddress(d.address) : undefined,
            createdByUid: String(d.createdByUid || ''),
            createdByEmail: String(d.createdByEmail || ''),
            createdAtMs: createdTs,
            updatedAtMs: updatedTs,
          };
        });
        items.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setCompaniesList(items);
        setLoadingByCat((prev) => ({ ...prev, companies: false }));
      },
      (error) => {
        setLoadingByCat((prev) => ({ ...prev, companies: false }));
        try {
          handleFirestoreError(error, OperationType.LIST, 'companies');
        } catch (err) {
          setFatalFirestoreError(err as Error);
        }
      }
    );

    const unsubSedes = onSnapshot(
      mkQuery('sedes'),
      (snap) => {
        const items: FirestoreSedeRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
          const updatedTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : createdTs;
          return {
            id: docSnap.id,
            companyId: String(d.companyId || ''),
            companyName: String(d.companyName || ''),
            name: String(d.name || ''),
            address: String(d.address || ''),
            city: String(d.city || ''),
            lat: Number(d.lat ?? 19.42694),
            lng: Number(d.lng ?? -99.16782),
            geofenceRadiusMeters: Number(d.geofenceRadiusMeters ?? 150),
            contactPerson: String(d.contactPerson || ''),
            contactRole: String(d.contactRole || ''),
            contactPhone: String(d.contactPhone || ''),
            colorTag: typeof d.colorTag === 'string' ? d.colorTag : 'bg-red-600',
            createdByUid: String(d.createdByUid || ''),
            createdByEmail: String(d.createdByEmail || ''),
            createdAtMs: createdTs,
            updatedAtMs: updatedTs,
          };
        });
        items.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setSedesList(items);
        setLoadingByCat((prev) => ({ ...prev, sedes: false }));
      },
      (error) => {
        setLoadingByCat((prev) => ({ ...prev, sedes: false }));
        try {
          handleFirestoreError(error, OperationType.LIST, 'sedes');
        } catch (err) {
          setFatalFirestoreError(err as Error);
        }
      }
    );

    const unsubPersonnel = onSnapshot(
      mkPrivateDirectoryQuery('personnel'),
      (snap) => {
        const items: PersonnelRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
          const updatedTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : createdTs;
          return {
            id: docSnap.id,
            fullName: String(d.fullName || ''),
            phone: String(d.phone || ''),
            email: String(d.email || ''),
            address: parseAddress(d.address),
            createdByUid: String(d.createdByUid || ''),
            createdByEmail: String(d.createdByEmail || ''),
            createdAtMs: createdTs,
            updatedAtMs: updatedTs,
          };
        });
        items.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setPersonnelList(items);
        setLoadingByCat((prev) => ({ ...prev, personnel: false }));
      },
      (error) => {
        setLoadingByCat((prev) => ({ ...prev, personnel: false }));
        try {
          handleFirestoreError(error, OperationType.LIST, 'personnel');
        } catch (err) {
          setFatalFirestoreError(err as Error);
        }
      }
    );

    const unsubClients = onSnapshot(
      mkPrivateDirectoryQuery('clients'),
      (snap) => {
        const items: FirestoreClientRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
          const updatedTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : createdTs;
          return {
            id: docSnap.id,
            fullName: String(d.fullName || ''),
            phone: String(d.phone || ''),
            email: String(d.email || ''),
            company: typeof d.company === 'string' ? d.company : '',
            address: parseAddress(d.address),
            createdByUid: String(d.createdByUid || ''),
            createdByEmail: String(d.createdByEmail || ''),
            createdAtMs: createdTs,
            updatedAtMs: updatedTs,
          };
        });
        items.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setClientsList(items);
        setLoadingByCat((prev) => ({ ...prev, clients: false }));
      },
      (error) => {
        setLoadingByCat((prev) => ({ ...prev, clients: false }));
        try {
          handleFirestoreError(error, OperationType.LIST, 'clients');
        } catch (err) {
          setFatalFirestoreError(err as Error);
        }
      }
    );

    const unsubAssignments = onSnapshot(
      mkQuery('assignments'),
      (snap) => {
        const items: FirestoreAssignmentRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
          const updatedTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : createdTs;
          return {
            id: docSnap.id,
            trainerId: String(d.trainerId || ''),
            trainerName: String(d.trainerName || ''),
            companyId: String(d.companyId || ''),
            companyName: String(d.companyName || ''),
            sedeId: String(d.sedeId || ''),
            sedeName: String(d.sedeName || ''),
            sedeAddress: String(d.sedeAddress || ''),
            frequency:
              d.frequency === 'semanal' || d.frequency === 'mensual' || d.frequency === 'fecha_unica'
                ? d.frequency
                : 'semanal',
            ...(typeof d.dayOfWeek === 'number' ? { dayOfWeek: d.dayOfWeek } : {}),
            ...(typeof d.date === 'string' ? { date: d.date } : {}),
            ...(typeof d.dayOfMonth === 'number' ? { dayOfMonth: d.dayOfMonth } : {}),
            time: String(d.time || '09:00'),
            ...(typeof d.durationMinutes === 'number' ? { durationMinutes: d.durationMinutes } : {}),
            activityType: normalizeActivityType(d.activityType),
            activityName: String(d.activityName || ''),
            locationArea: String(d.locationArea || ''),
            ...(typeof d.expectedAttendees === 'number'
              ? { expectedAttendees: d.expectedAttendees }
              : {}),
            ...(typeof d.notes === 'string' ? { notes: d.notes } : {}),
            active: d.active !== false,
            ...(typeof d.closed === 'boolean' ? { closed: d.closed } : {}),
            ...(typeof d.closedAt === 'string' ? { closedAt: d.closedAt } : {}),
            ...(Array.isArray(d.completedDates)
              ? { completedDates: d.completedDates.map(String) }
              : {}),
            ...(typeof d.nonCompliant === 'boolean' ? { nonCompliant: d.nonCompliant } : {}),
            ...(d.nonCompliantReason === 'fuera_de_horario' ||
            d.nonCompliantReason === 'sin_cierre_30m' ||
            d.nonCompliantReason === 'manual_admin'
              ? { nonCompliantReason: d.nonCompliantReason }
              : {}),
            ...(typeof d.nonCompliantAt === 'string' ? { nonCompliantAt: d.nonCompliantAt } : {}),
            ...(Array.isArray(d.missedDates) ? { missedDates: d.missedDates.map(String) } : {}),
            ...(Array.isArray(d.reopenedDates)
              ? { reopenedDates: d.reopenedDates.map(String) }
              : {}),
            createdByUid: String(d.createdByUid || ''),
            createdByEmail: String(d.createdByEmail || ''),
            createdAtMs: createdTs,
            updatedAtMs: updatedTs,
          };
        });
        items.sort((a, b) => a.time.localeCompare(b.time));
        setAssignmentsList(items);
        setLoadingByCat((prev) => ({ ...prev, calendar: false }));
      },
      (error) => {
        setLoadingByCat((prev) => ({ ...prev, calendar: false }));
        try {
          handleFirestoreError(error, OperationType.LIST, 'assignments');
        } catch (err) {
          setFatalFirestoreError(err as Error);
        }
      }
    );

    const unsubRecords = onSnapshot(
      mkQuery('records'),
      (snap) => {
        const items: AttendanceRecord[] = snap.docs.map((docSnap) =>
          parseFirestoreAttendanceRecord(docSnap.id, docSnap.data() as Record<string, unknown>)
        );
        items.sort((a, b) =>
          `${b.date}T${b.checkInTime}`.localeCompare(`${a.date}T${a.checkInTime}`)
        );
        setRecordsList(items);
        setLoadingByCat((prev) => ({ ...prev, evidences: false }));
      },
      (error) => {
        setLoadingByCat((prev) => ({ ...prev, evidences: false }));
        try {
          handleFirestoreError(error, OperationType.LIST, 'records');
        } catch (err) {
          setFatalFirestoreError(err as Error);
        }
      }
    );

    const unsubCatalog = onSnapshot(
      mkQuery('activity_catalog'),
      (snap) => {
        const items: FirestoreActivityCatalogRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
          const updatedTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : createdTs;
          return {
            id: docSnap.id,
            name: String(d.name || ''),
            activityType: normalizeActivityType(d.activityType),
            defaultDurationMinutes: Number(d.defaultDurationMinutes ?? 20),
            ...(typeof d.description === 'string' ? { description: d.description } : {}),
            active: d.active !== false,
            createdByUid: String(d.createdByUid || ''),
            createdByEmail: String(d.createdByEmail || ''),
            createdAtMs: createdTs,
            updatedAtMs: updatedTs,
          };
        });
        items.sort((a, b) => a.name.localeCompare(b.name));
        setCatalogList(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'activity_catalog');
        } catch (err) {
          setFatalFirestoreError(err as Error);
        }
      }
    );

    return () => {
      unsubTrainers();
      unsubCompanies();
      unsubSedes();
      unsubAssignments();
      unsubRecords();
      unsubCatalog();
      unsubPersonnel();
      unsubClients();
    };
  }, [authenticatedUser.uid, isAdminUser]);

  // Keep selected company in Sede form synchronized when companiesList loads or updates
  useEffect(() => {
    if (!editingIdByCat.sedes && companiesList.length > 0) {
      const matched = companiesList.find((c) => c.id === sedeForm.companyId);
      if (!matched) {
        setSedeForm((prev) => ({
          ...prev,
          companyId: companiesList[0].id,
          companyName: companiesList[0].name,
        }));
      } else if (matched.name && matched.name !== sedeForm.companyName) {
        setSedeForm((prev) => ({
          ...prev,
          companyName: matched.name,
        }));
      }
    }
  }, [companiesList, editingIdByCat.sedes, sedeForm.companyId, sedeForm.companyName]);

  // Always resolve companyName from registered companiesList so validation never fails on stale companyName
  const effectiveSedeForm = useMemo<SedeFormInput>(() => {
    const matchedComp = companiesList.find((c) => c.id === sedeForm.companyId);
    return {
      ...sedeForm,
      companyName: matchedComp?.name || sedeForm.companyName,
    };
  }, [companiesList, sedeForm]);

  const trainerValidation = useMemo(() => validateTrainerInput(trainerForm), [trainerForm]);
  const companyValidation = useMemo(() => validateDemoCompanyInput(companyForm), [companyForm]);
  const sedeValidation = useMemo(
    () => validateSedeInput(effectiveSedeForm),
    [effectiveSedeForm]
  );
  const personnelValidation = useMemo(() => validatePersonnelInput(personnelForm), [personnelForm]);
  const clientValidation = useMemo(() => validateClientInput(clientForm), [clientForm]);

  const activeCategoryMeta = useMemo(
    () => CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0],
    [activeCategory]
  );

  const countsByCategory: Record<FirestoreDirectoryCategory, number> = {
    trainers: trainersList.length,
    companies: companiesList.length,
    sedes: sedesList.length,
    calendar: assignmentsList.length + catalogList.length,
    evidences: recordsList.length,
    personnel: personnelList.length,
    clients: clientsList.length,
  };

  const totalDocumentsCount =
    trainersList.length +
    companiesList.length +
    sedesList.length +
    assignmentsList.length +
    recordsList.length +
    catalogList.length +
    personnelList.length +
    clientsList.length;

  const handleAuditRecordSave = async (updated: AttendanceRecord) => {
    try {
      await saveRecordToFirestore(updated);
      setSelectedRecordForAudit(null);
      setSaveFeedback({
        category: activeCategory,
        type: 'success',
        message: `Acta de asistencia de "${updated.trainerName}" (${updated.date}) auditada y guardada en /records.`,
      });
    } catch (err) {
      setFatalFirestoreError(err as Error);
    }
  };

  const handlePrepareNewSedeForCompany = (comp: FirestoreDemoCompanyRecord) => {
    setEditingIdByCat((prev) => ({ ...prev, sedes: null }));
    setSubmitAttemptedByCat((prev) => ({ ...prev, sedes: false }));
    setSedeTouched({});
    setSedeForm({
      ...EMPTY_SEDE_FORM,
      companyId: comp.id,
      companyName: comp.name,
    });
    setSaveFeedback(null);
    setConfirmDeleteKey(null);
    setActiveCategory('sedes');
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const resetCategoryForm = (cat: FirestoreDirectoryCategory) => {
    if (cat === 'trainers') {
      stopTrainerCamera();
      setTrainerCameraError(null);
      setTrainerPhotoBiometricStatus(null);
      setTrainerForm({ ...EMPTY_TRAINER_FORM });
      setTrainerTouched({});
      setCustomSpecialty('');
    } else if (cat === 'companies') {
      setCompanyForm({ ...EMPTY_COMPANY_FORM });
      setCompanyTouched({});
    } else if (cat === 'sedes') {
      const preservedComp =
        companiesList.find((c) => c.id === sedeForm.companyId) || companiesList[0];
      setSedeForm({
        ...EMPTY_SEDE_FORM,
        companyId: preservedComp ? preservedComp.id : '',
        companyName: preservedComp ? preservedComp.name : '',
      });
      setSedeTouched({});
    } else if (cat === 'personnel') {
      setPersonnelForm({ ...EMPTY_PERSONNEL_FORM, address: { ...EMPTY_ADDRESS } });
      setPersonnelTouched({});
    } else if (cat === 'clients') {
      setClientForm({ ...EMPTY_CLIENT_FORM, address: { ...EMPTY_ADDRESS } });
      setClientTouched({});
    }
    setSubmitAttemptedByCat((prev) => ({ ...prev, [cat]: false }));
    setEditingIdByCat((prev) => ({ ...prev, [cat]: null }));
  };

  // ==========================================================================
  // SUBMIT HANDLERS
  // ==========================================================================

  const handleSubmitTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttemptedByCat((prev) => ({ ...prev, trainers: true }));
    setTrainerTouched(ALL_TRAINER_TOUCHED);
    setSaveFeedback(null);

    const check = validateTrainerInput(trainerForm);
    if (!check.isValid) {
      setSaveFeedback({
        category: 'trainers',
        type: 'error',
        message: 'Revisa los campos obligatorios del entrenador marcados en rojo.',
      });
      return;
    }

    setIsSaving(true);
    const { sanitized } = check;
    const editingId = editingIdByCat.trainers;
    const targetTrainerId = editingId || `tr_${Date.now()}`;

    try {
      await saveTrainerToFirestore({
        id: targetTrainerId,
        name: sanitized.name,
        email: sanitized.email,
        phone: sanitized.phone,
        avatar: sanitized.avatar,
        specialties: sanitized.specialties,
        active: sanitized.active,
      });

      const missingCatalogItems = collectMissingCatalogItemsFromTrainers(
        [{ specialties: sanitized.specialties }],
        catalogList
      );
      if (missingCatalogItems.length > 0) {
        await Promise.all(
          missingCatalogItems.map((item) =>
            saveActivityCatalogItemToFirestore(item, { onlyIfMissing: true })
          )
        );
      }

      resetCategoryForm('trainers');
      setSaveFeedback({
        category: 'trainers',
        type: 'success',
        message: editingId
          ? `Entrenador "${sanitized.name}" actualizado en /trainers y sus especialidades quedaron disponibles para asignación de clases.`
          : `Entrenador "${sanitized.name}" guardado en /trainers y sus especialidades quedaron disponibles para asignación de clases.`,
      });
    } catch (error) {
      setFatalFirestoreError(error as Error);
    } finally {
      setIsSaving(false);
    }
  };

  const resetCatalogDisciplineForm = () => {
    setEditingCatalogId(null);
    setCatalogName('');
    setCatalogType('clase_fitness');
    setCatalogDuration(ACTIVITY_TYPE_DEFAULT_MINUTES.clase_fitness);
    setCatalogDescription('');
    setCatalogActive(true);
  };

  const startEditCatalogDiscipline = (cat: FirestoreActivityCatalogRecord) => {
    setEditingCatalogId(cat.id);
    setCatalogName(cat.name);
    setCatalogType(normalizeActivityType(cat.activityType));
    setCatalogDuration(cat.defaultDurationMinutes);
    setCatalogDescription(cat.description || '');
    setCatalogActive(cat.active !== false);
    formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmitCatalogDiscipline = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveFeedback(null);
    const cleanedName = cleanDisciplineLabel(catalogName).slice(0, 150).trim();
    if (cleanedName.length < 2) {
      setSaveFeedback({
        category: 'calendar',
        type: 'error',
        message: 'Ingresa un nombre válido (mínimo 2 caracteres) para la especialidad o disciplina.',
      });
      return;
    }

    const safeDuration = Number.isFinite(catalogDuration)
      ? Math.min(480, Math.max(5, Math.round(catalogDuration)))
      : ACTIVITY_TYPE_DEFAULT_MINUTES[catalogType];
    const targetId = editingCatalogId || `cat_${Date.now()}`;

    setIsSaving(true);
    try {
      await saveActivityCatalogItemToFirestore({
        id: targetId,
        name: cleanedName,
        activityType: catalogType,
        defaultDurationMinutes: safeDuration,
        ...(catalogDescription.trim()
          ? { description: catalogDescription.trim().slice(0, 500) }
          : {}),
        active: catalogActive,
      });
      resetCatalogDisciplineForm();
      setSaveFeedback({
        category: 'calendar',
        type: 'success',
        message: editingCatalogId
          ? `Disciplina "${cleanedName}" actualizada en /activity_catalog y disponible en Panel Admin.`
          : `Disciplina "${cleanedName}" añadida a /activity_catalog y lista para asignar clases en Panel Admin.`,
      });
    } catch (error) {
      setFatalFirestoreError(error as Error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCatalogDiscipline = async (id: string) => {
    try {
      await deleteActivityCatalogItemFromFirestore(id);
      if (editingCatalogId === id) {
        resetCatalogDisciplineForm();
      }
      setConfirmDeleteKey(null);
      setSaveFeedback({
        category: 'calendar',
        type: 'success',
        message: 'Disciplina eliminada de /activity_catalog en Firestore.',
      });
    } catch (error) {
      setFatalFirestoreError(error as Error);
    }
  };

  const handleSubmitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttemptedByCat((prev) => ({ ...prev, companies: true }));
    setCompanyTouched(ALL_COMPANY_TOUCHED);
    setSaveFeedback(null);

    const check = validateDemoCompanyInput(companyForm);
    if (!check.isValid) {
      setSaveFeedback({
        category: 'companies',
        type: 'error',
        message: 'Revisa los campos obligatorios de la empresa marcados en rojo.',
      });
      return;
    }

    setIsSaving(true);
    const { sanitized } = check;
    const editingId = editingIdByCat.companies;
    const targetCompanyId = editingId || `comp_${Date.now()}`;

    try {
      await saveCompanyToFirestore({
        id: targetCompanyId,
        name: sanitized.name,
        taxId: sanitized.taxId,
        industry: sanitized.industry,
        logoText: sanitized.logoText,
        sedes: [],
      });
      resetCategoryForm('companies');
      setSaveFeedback({
        category: 'companies',
        type: 'success',
        message: editingId
          ? `Empresa "${sanitized.name}" actualizada en /companies.`
          : `Empresa "${sanitized.name}" registrada en /companies. Ya puedes agregarle sedes.`,
      });
    } catch (error) {
      setFatalFirestoreError(error as Error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitSede = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttemptedByCat((prev) => ({ ...prev, sedes: true }));
    setSedeTouched(ALL_SEDE_TOUCHED);
    setSaveFeedback(null);

    const check = validateSedeInput(effectiveSedeForm);
    if (!check.isValid) {
      const firstError =
        Object.values(check.errors).find(Boolean) ||
        'Revisa los campos obligatorios de la sede (empresa, nombre, dirección, ciudad y GPS).';
      setSaveFeedback({
        category: 'sedes',
        type: 'error',
        message: firstError,
      });
      return;
    }

    setIsSaving(true);
    const { sanitized } = check;
    const editingId = editingIdByCat.sedes;
    const targetSedeId = editingId || `sede_${Date.now()}`;
    const parentComp = companiesList.find((c) => c.id === sanitized.companyId);

    try {
      await saveSedeToFirestore(
        {
          id: targetSedeId,
          companyId: sanitized.companyId,
          companyName: sanitized.companyName,
          name: sanitized.name,
          address: sanitized.address,
          city: sanitized.city,
          lat: sanitized.lat,
          lng: sanitized.lng,
          geofenceRadiusMeters: sanitized.geofenceRadiusMeters,
          contactPerson: sanitized.contactPerson,
          contactRole: sanitized.contactRole,
          contactPhone: sanitized.contactPhone,
          colorTag: sanitized.colorTag,
        },
        parentComp
          ? {
              id: parentComp.id,
              name: parentComp.name,
              taxId: parentComp.taxId,
              industry: parentComp.industry,
              logoText: parentComp.logoText,
            }
          : undefined
      );

      resetCategoryForm('sedes');
      setSaveFeedback({
        category: 'sedes',
        type: 'success',
        message: editingId
          ? `Sede "${sanitized.name}" actualizada para "${sanitized.companyName}".`
          : `Sede "${sanitized.name}" agregada a "${sanitized.companyName}" en /sedes (geocerca ${sanitized.geofenceRadiusMeters}m).`,
      });
    } catch (error) {
      setFatalFirestoreError(error as Error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitPersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttemptedByCat((prev) => ({ ...prev, personnel: true }));
    setPersonnelTouched(ALL_PERSONNEL_TOUCHED);
    setSaveFeedback(null);

    const check = validatePersonnelInput(personnelForm);
    if (!check.isValid) {
      setSaveFeedback({
        category: 'personnel',
        type: 'error',
        message: 'Revisa los campos obligatorios de personal marcados en rojo.',
      });
      return;
    }

    const ownerUid = authenticatedUser.uid;
    const ownerEmail = (authenticatedUser.email || '').trim();

    setIsSaving(true);
    const { sanitized } = check;
    const editingId = editingIdByCat.personnel;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'personnel', editingId), {
          fullName: sanitized.fullName,
          phone: sanitized.phone,
          email: sanitized.email,
          address: { ...sanitized.address },
          updatedAt: serverTimestamp(),
        });
        resetCategoryForm('personnel');
        setSaveFeedback({
          category: 'personnel',
          type: 'success',
          message: `Personal "${sanitized.fullName}" actualizado en /personnel.`,
        });
      } else {
        const newRef = doc(collection(db, 'personnel'));
        await setDoc(newRef, {
          fullName: sanitized.fullName,
          phone: sanitized.phone,
          email: sanitized.email,
          address: { ...sanitized.address },
          createdByUid: ownerUid,
          createdByEmail: ownerEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resetCategoryForm('personnel');
        setSaveFeedback({
          category: 'personnel',
          type: 'success',
          message: `Personal "${sanitized.fullName}" guardado en /personnel.`,
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(
          error,
          editingId ? OperationType.UPDATE : OperationType.CREATE,
          editingId ? `personnel/${editingId}` : 'personnel'
        );
      } catch (structuredErr) {
        setFatalFirestoreError(structuredErr as Error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttemptedByCat((prev) => ({ ...prev, clients: true }));
    setClientTouched(ALL_CLIENT_TOUCHED);
    setSaveFeedback(null);

    const check = validateClientInput(clientForm);
    if (!check.isValid) {
      setSaveFeedback({
        category: 'clients',
        type: 'error',
        message: 'Revisa los campos obligatorios del cliente marcados en rojo.',
      });
      return;
    }

    const ownerUid = authenticatedUser.uid;
    const ownerEmail = (authenticatedUser.email || '').trim();

    setIsSaving(true);
    const { sanitized } = check;
    const editingId = editingIdByCat.clients;

    const basePayload: Record<string, unknown> = {
      fullName: sanitized.fullName,
      phone: sanitized.phone,
      email: sanitized.email,
      address: { ...sanitized.address },
      company: sanitized.company,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'clients', editingId), basePayload);
        resetCategoryForm('clients');
        setSaveFeedback({
          category: 'clients',
          type: 'success',
          message: `Cliente "${sanitized.fullName}" actualizado en /clients.`,
        });
      } else {
        const newRef = doc(collection(db, 'clients'));
        await setDoc(newRef, {
          ...basePayload,
          createdByUid: ownerUid,
          createdByEmail: ownerEmail,
          createdAt: serverTimestamp(),
        });
        resetCategoryForm('clients');
        setSaveFeedback({
          category: 'clients',
          type: 'success',
          message: `Cliente "${sanitized.fullName}" guardado en /clients.`,
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(
          error,
          editingId ? OperationType.UPDATE : OperationType.CREATE,
          editingId ? `clients/${editingId}` : 'clients'
        );
      } catch (structuredErr) {
        setFatalFirestoreError(structuredErr as Error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDocument = async (cat: FirestoreDirectoryCategory, id: string) => {
    const path =
      cat === 'evidences' ? `records/${id}` : cat === 'calendar' ? `assignments/${id}` : `${cat}/${id}`;
    try {
      if (cat === 'companies') {
        await deleteCompanyAndSedesFromFirestore(id);
      } else if (cat === 'calendar') {
        await deleteAssignmentFromFirestore(id);
      } else if (cat === 'evidences') {
        await deleteRecordFromFirestore(id);
      } else if (cat === 'trainers') {
        await deleteTrainerFromFirestore(id);
      } else if (cat === 'sedes') {
        await deleteSedeFromFirestore(id);
      } else {
        await deleteDoc(doc(db, cat, id));
      }
      if (editingIdByCat[cat] === id) {
        resetCategoryForm(cat);
      }
      setConfirmDeleteKey(null);
      setSaveFeedback({
        category: cat,
        type: 'success',
        message:
          cat === 'companies'
            ? 'Empresa, sus sedes y asignaciones vinculadas eliminadas de Firestore.'
            : cat === 'calendar'
            ? 'Asignación eliminada de /assignments en Firestore.'
            : cat === 'evidences'
            ? 'Registro de evidencia eliminado de /records en Firestore.'
            : `Documento eliminado de /${cat}.`,
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, path);
      } catch (structuredErr) {
        setFatalFirestoreError(structuredErr as Error);
      }
    }
  };

  // Filtered lists
  const searchQuery = searchByCat[activeCategory].trim().toLowerCase();

  const filteredTrainers = useMemo(() => {
    if (!searchQuery) return trainersList;
    return trainersList.filter((t) =>
      [t.name, t.email, t.phone, ...t.specialties].join(' ').toLowerCase().includes(searchQuery)
    );
  }, [trainersList, searchQuery]);

  const filteredCompanies = useMemo(() => {
    if (!searchQuery) return companiesList;
    return companiesList.filter((c) =>
      [c.name, c.taxId, c.industry, c.logoText].join(' ').toLowerCase().includes(searchQuery)
    );
  }, [companiesList, searchQuery]);

  const filteredSedes = useMemo(() => {
    if (!searchQuery) return sedesList;
    return sedesList.filter((s) =>
      [s.name, s.companyName, s.address, s.city, s.contactPerson, s.contactRole, s.contactPhone]
        .join(' ')
        .toLowerCase()
        .includes(searchQuery)
    );
  }, [sedesList, searchQuery]);

  const selectableDirectorySpecialties = useMemo(
    () => collectAllSelectableSpecialties(trainersList, catalogList, trainerForm.specialties),
    [trainersList, catalogList, trainerForm.specialties]
  );

  const filteredCatalog = useMemo(() => {
    if (!searchQuery) return catalogList;
    return catalogList.filter((cat) =>
      [cat.name, ACTIVITY_TYPE_LABELS[cat.activityType], cat.description || '']
        .join(' ')
        .toLowerCase()
        .includes(searchQuery)
    );
  }, [catalogList, searchQuery]);

  const filteredAssignments = useMemo(() => {
    if (!searchQuery) return assignmentsList;
    return assignmentsList.filter((a) =>
      [
        a.activityName,
        ACTIVITY_TYPE_LABELS[a.activityType],
        a.companyName,
        a.sedeName,
        a.trainerName,
        a.locationArea,
        a.frequency,
        a.time,
        a.date || '',
        a.dayOfWeek !== undefined ? WEEKDAY_NAMES[a.dayOfWeek] || '' : '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchQuery)
    );
  }, [assignmentsList, searchQuery]);

  const filteredRecords = useMemo(() => {
    return recordsList.filter((r) => {
      if (activeCategory === 'evidences') {
        if (evidenceStatusFilter !== 'all' && r.status !== evidenceStatusFilter) {
          return false;
        }
        if (evidenceDateFilter && r.date !== evidenceDateFilter) {
          return false;
        }
      }
      if (!searchQuery) return true;
      return [
        r.activityName,
        r.companyName,
        r.sedeName,
        r.trainerName,
        r.date,
        r.status,
        r.locationArea,
        r.observations || '',
        r.adminNotes || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchQuery);
    });
  }, [recordsList, searchQuery, activeCategory, evidenceStatusFilter, evidenceDateFilter]);

  const evidenceSummaryLabel = useMemo(() => {
    const parts: string[] = ['Colección /records (Cloud Firestore)'];
    if (evidenceStatusFilter !== 'all') {
      parts.push(
        evidenceStatusFilter === 'completado'
          ? 'Estado: Completadas'
          : evidenceStatusFilter === 'incumplido'
          ? 'Estado: Incumplidas'
          : 'Estado: En Curso'
      );
    }
    if (evidenceDateFilter) {
      parts.push(`Fecha: ${evidenceDateFilter}`);
    }
    if (searchByCat.evidences.trim()) {
      parts.push(`Búsqueda: "${searchByCat.evidences.trim()}"`);
    }
    return parts.join(' · ');
  }, [evidenceStatusFilter, evidenceDateFilter, searchByCat.evidences]);

  const handleDownloadDirectoryPdf = async () => {
    if (filteredRecords.length === 0) return;
    setIsExportingPdf(true);
    try {
      await exportEvidenceRecordsToPdf(filteredRecords, {
        title: 'Bitácora Oficial de Evidencias — Directorio Cloud Firestore',
        subtitle: evidenceSummaryLabel,
        filenamePrefix: 'Directorio_Bitacora_Evidencias',
        includePhotos: true,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadSingleRecordPdf = async (rec: AttendanceRecord) => {
    setSinglePdfRecordId(rec.id);
    try {
      await exportEvidenceRecordsToPdf([rec], {
        title: `Acta Oficial de Evidencia — ${rec.companyName}`,
        subtitle: `${rec.sedeName} · Entrenador: ${rec.trainerName} · ${rec.date}`,
        filenamePrefix: `Evidencia_${rec.date}_${rec.id}`,
        includePhotos: true,
      });
    } finally {
      setSinglePdfRecordId(null);
    }
  };

  const directoryCompaniesWithSedes = useMemo<Company[]>(
    () =>
      companiesList.map((c) => ({
        id: c.id,
        name: c.name,
        taxId: c.taxId,
        industry: c.industry,
        logoText: c.logoText,
        sedes: sedesList.filter((s) => s.companyId === c.id),
      })),
    [companiesList, sedesList]
  );

  const handleDownloadDirectoryExcel = () => {
    if (filteredRecords.length === 0) return;
    exportEvidenceRecordsToExcel(filteredRecords, {
      title: 'Bitácora Oficial de Evidencias — Directorio Cloud Firestore',
      filenamePrefix: 'Directorio_Bitacora_Evidencias',
      periodLabel: evidenceSummaryLabel,
      companies: directoryCompaniesWithSedes,
      trainers: trainersList,
    });
  };

  const filteredPersonnel = useMemo(() => {
    if (!searchQuery) return personnelList;
    return personnelList.filter((p) =>
      [p.fullName, p.email, p.phone, formatAddressInline(p.address)]
        .join(' ')
        .toLowerCase()
        .includes(searchQuery)
    );
  }, [personnelList, searchQuery]);

  const filteredClients = useMemo(() => {
    if (!searchQuery) return clientsList;
    return clientsList.filter((c) =>
      [c.fullName, c.email, c.phone, c.company, formatAddressInline(c.address)]
        .join(' ')
        .toLowerCase()
        .includes(searchQuery)
    );
  }, [clientsList, searchQuery]);

  const handleGetSedeGps = async () => {
    setGettingSedeGps(true);
    try {
      const pos = await getCurrentPositionAsync(8000);
      setSedeForm((prev) => ({
        ...prev,
        lat: pos.lat.toFixed(6),
        lng: pos.lng.toFixed(6),
      }));
    } catch {
      setSaveFeedback({
        category: 'sedes',
        type: 'error',
        message: 'No fue posible obtener la ubicación GPS actual del navegador.',
      });
    } finally {
      setGettingSedeGps(false);
    }
  };

  const verifyTrainerPhotoFace = async (imgDataUrl: string) => {
    const check = await validateFaceInRegistrationPhoto(imgDataUrl);
    setTrainerPhotoBiometricStatus(check);
  };

  const startTrainerLiveCamera = async (
    desiredMode: 'user' | 'environment' = trainerCameraFacing,
    preferredDeviceId?: string
  ) => {
    setTrainerCameraError(null);
    setTrainerPhotoBiometricStatus(null);
    setIsStartingTrainerCamera(true);
    setIsTrainerVideoReady(false);
    setIsTrainerCameraOpen(true);

    try {
      const opened = await openCameraStreamWithFallback({
        ownerId: DIRECTORY_CAMERA_OWNER_ID,
        facingMode: desiredMode,
        preferredDeviceId,
        idealWidth: 640,
        idealHeight: 640,
        onPreempted: () => {
          trainerStreamRef.current = null;
          setIsTrainerCameraOpen(false);
          setIsTrainerVideoReady(false);
        },
      });

      trainerStreamRef.current = opened.stream;
      setTrainerVideoDevices(opened.videoDevices);
      setTrainerActiveDeviceId(opened.activeDeviceId);
      setIsTrainerVideoMirrored(desiredMode === 'user' && opened.isMirroredSuggested);

      if (trainerVideoRef.current) {
        const ready = await attachStreamToVideoElement(trainerVideoRef.current, opened.stream);
        if (ready) {
          setIsTrainerVideoReady(true);
        }
      }
    } catch (err: unknown) {
      stopTrainerCamera();
      setTrainerCameraError(formatCameraErrorMessage(err));
    } finally {
      setIsStartingTrainerCamera(false);
    }
  };

  const switchTrainerCameraDevice = () => {
    const nextMode: 'user' | 'environment' =
      trainerCameraFacing === 'user' ? 'environment' : 'user';
    setTrainerCameraFacing(nextMode);
    if (trainerVideoDevices.length > 1 && trainerActiveDeviceId) {
      const idx = trainerVideoDevices.findIndex((d) => d.deviceId === trainerActiveDeviceId);
      const nextDev = trainerVideoDevices[(idx + 1) % trainerVideoDevices.length];
      startTrainerLiveCamera(nextMode, nextDev?.deviceId);
      return;
    }
    startTrainerLiveCamera(nextMode);
  };

  const captureTrainerPhotoFromCamera = () => {
    const video = trainerVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setTrainerCameraError(
        'Esperando señal de video de la cámara. Intenta capturar nuevamente en un instante.'
      );
      return;
    }

    const capturedDataUrl = captureSquareAvatarFromSource(video, {
      mirrorHorizontal: isTrainerVideoMirrored,
      targetSize: 320,
      maxDataUrlChars: 115000,
    });

    setTrainerForm((prev) => ({ ...prev, avatar: capturedDataUrl }));
    setTrainerTouched((prev) => ({ ...prev, avatar: true }));
    stopTrainerCamera();
    verifyTrainerPhotoFace(capturedDataUrl);
  };

  const handleTrainerImageUpload = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setTrainerCameraError(null);
    setTrainerPhotoBiometricStatus(null);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setTrainerForm((prev) => ({ ...prev, avatar: dataUrl }));
      setTrainerTouched((prev) => ({ ...prev, avatar: true }));
      stopTrainerCamera();
      verifyTrainerPhotoFace(dataUrl);
    } catch {
      setSaveFeedback({
        category: 'trainers',
        type: 'error',
        message: 'No se pudo procesar la fotografía seleccionada.',
      });
    }
  };

  const toggleTrainerSpecialty = (spec: string) => {
    setTrainerForm((prev) => {
      const exists = prev.specialties.includes(spec);
      const next = exists
        ? prev.specialties.length > 1
          ? prev.specialties.filter((s) => s !== spec)
          : prev.specialties
        : [...prev.specialties, spec];
      return { ...prev, specialties: next };
    });
    setTrainerTouched((prev) => ({ ...prev, specialties: true }));
  };

  const addCustomTrainerSpecialty = () => {
    const clean = customSpecialty.trim();
    if (!clean) return;
    if (!trainerForm.specialties.includes(clean)) {
      setTrainerForm((prev) => ({
        ...prev,
        specialties: [...prev.specialties, clean].slice(0, DIRECTORY_LIMITS.specialtiesCount.max),
      }));
    }
    setCustomSpecialty('');
    setTrainerTouched((prev) => ({ ...prev, specialties: true }));
  };

  const inputClass = (hasErr: boolean) =>
    `w-full bg-white border rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none transition ${
      hasErr
        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-600'
        : 'border-slate-300 focus:border-red-600'
    }`;

  return (
    <div className={embeddedInAdmin ? 'space-y-5' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6'}>
      {/* Top Bar: Firestore Status, Authenticated Session & Demo Sync Action */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="w-5 h-5 text-red-600 shrink-0" />
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              Base de Datos Cloud Firestore — Directorio Protegido
            </h2>
            <span className="text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              {totalDocumentsCount} registros
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              {isAdminUser ? 'Admin Verificado' : 'Sesión Verificada'}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Acceso autenticado al Directorio ({authenticatedUser.email}). Los módulos de Entrenador y Panel Administrativo mantienen acceso libre.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
            <img
              src={
                authenticatedUser.photoURL ||
                generateInitialsAvatarDataUrl(
                  authenticatedUser.displayName || authenticatedUser.email || 'US'
                )
              }
              alt={authenticatedUser.displayName || authenticatedUser.email || 'Usuario'}
              referrerPolicy="no-referrer"
              className="w-6 h-6 rounded-full object-cover border border-slate-300"
            />
            <div className="text-left leading-tight">
              <div className="text-[11px] font-bold text-slate-900 truncate max-w-[160px]">
                {authenticatedUser.displayName || 'Usuario Autenticado'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">
                {authenticatedUser.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            title="Cerrar sesión en el Directorio"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>

      {/* Main Layout: Sidebar Navigation + Form & List Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sidebar Navigation */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-3 space-y-3">
          <div>
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Colecciones del Demo
            </div>
            <div className="space-y-1 mt-1">
              {CATEGORIES.filter((c) => c.isDemoCore).map((cat) => {
                const Icon = cat.icon;
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setConfirmDeleteKey(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-bold transition cursor-pointer ${
                      active
                        ? 'bg-red-600 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-red-600'}`} />
                      <span>{cat.label}</span>
                    </span>
                    <span
                      className={`font-mono tabular-nums text-[11px] px-2 py-0.5 rounded-md ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {countsByCategory[cat.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Directorio Adicional
            </div>
            <div className="space-y-1 mt-1">
              {CATEGORIES.filter((c) => !c.isDemoCore).map((cat) => {
                const Icon = cat.icon;
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setConfirmDeleteKey(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-500'}`} />
                      <span>{cat.label}</span>
                    </span>
                    <span
                      className={`font-mono tabular-nums text-[11px] px-2 py-0.5 rounded-md ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {countsByCategory[cat.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Workspace: Capture Form + Live Collection List */}
        <div className="lg:col-span-9 space-y-5">
          {/* Feedback Banner */}
          {saveFeedback && saveFeedback.category === activeCategory && (
            <div
              className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center justify-between gap-2 border ${
                saveFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {saveFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{saveFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setSaveFeedback(null)}
                className="text-xs font-bold opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {/* Form Card */}
          <div ref={formCardRef} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    {activeCategory === 'calendar'
                      ? 'Estado del Calendario en Cloud Firestore'
                      : activeCategory === 'evidences'
                      ? 'Bitácora Oficial de Evidencias en Cloud Firestore'
                      : editingIdByCat[activeCategory]
                      ? `Editar ${activeCategoryMeta.singularLabel}`
                      : `Registrar ${activeCategoryMeta.singularLabel}`}
                  </h3>
                  <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {activeCategoryMeta.collectionPath}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{activeCategoryMeta.description}</p>
              </div>

              {editingIdByCat[activeCategory] &&
                activeCategory !== 'calendar' &&
                activeCategory !== 'evidences' && (
                  <button
                    type="button"
                    onClick={() => resetCategoryForm(activeCategory)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Cancelar edición</span>
                  </button>
                )}
            </div>

            {activeCategory === 'calendar' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-red-600" />
                        Asignaciones Programadas
                      </span>
                      <span className="font-mono tabular-nums text-sm text-slate-900">
                        {assignmentsList.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Colección <strong className="font-mono">/assignments</strong> (semanales, mensuales, fecha única, cierres e incumplimientos).
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-emerald-600" />
                        Ejecuciones y Check-ins
                      </span>
                      <span className="font-mono tabular-nums text-sm text-slate-900">
                        {recordsList.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Colección <strong className="font-mono">/records</strong> sincronizada con la pestaña Bitácora de Evidencias.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-blue-600" />
                        Catálogo de Disciplinas
                      </span>
                      <span className="font-mono tabular-nums text-sm text-slate-900">
                        {catalogList.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Colección <strong className="font-mono">/activity_catalog</strong> (Pausa Activa, Clase Fitness, Gimnasio Corporativo y Masajes).
                    </p>
                  </div>
                </div>

                {/* Direct CRUD for /activity_catalog disciplines */}
                <form
                  onSubmit={handleSubmitCatalogDiscipline}
                  className="pt-4 border-t border-slate-200 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                        {editingCatalogId
                          ? 'Editar Especialidad / Disciplina en Catálogo'
                          : 'Añadir Especialidad o Disciplina para Asignación de Clases'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Se guarda en <span className="font-mono">/activity_catalog</span> y queda seleccionable de inmediato al programar clases en el Panel Admin.
                      </p>
                    </div>
                    {editingCatalogId && (
                      <button
                        type="button"
                        onClick={resetCatalogDisciplineForm}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cancelar edición</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ALL_ACTIVITY_TYPES.map((t) => {
                      const active = catalogType === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            setCatalogType(t);
                            if (!editingCatalogId) {
                              setCatalogDuration(ACTIVITY_TYPE_DEFAULT_MINUTES[t]);
                            }
                          }}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer whitespace-nowrap truncate ${
                            active
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {ACTIVITY_TYPE_LABELS[t]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Nombre de la Especialidad o Disciplina *
                      </label>
                      <input
                        type="text"
                        value={catalogName}
                        onChange={(e) => setCatalogName(e.target.value)}
                        maxLength={150}
                        placeholder="Ej. Spinning Corporativo, Shiatsu en Silla, Movilidad..."
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Duración (min) *
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={catalogDuration}
                        onChange={(e) => setCatalogDuration(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Descripción (opcional)
                      </label>
                      <input
                        type="text"
                        value={catalogDescription}
                        onChange={(e) => setCatalogDescription(e.target.value)}
                        maxLength={500}
                        placeholder="Breve detalle de la sesión o equipamiento..."
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={catalogActive}
                        onChange={(e) => setCatalogActive(e.target.checked)}
                        className="rounded border-slate-300 text-red-600 focus:ring-red-600"
                      />
                      <span>Activa para programación en Panel Admin</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={resetCatalogDisciplineForm}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Limpiar
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>
                          {isSaving
                            ? 'Guardando...'
                            : editingCatalogId
                            ? 'Actualizar Disciplina'
                            : 'Guardar en Catálogo'}
                        </span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {activeCategory === 'evidences' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Registros en /records
                    </div>
                    <div className="mt-1 text-lg font-extrabold font-mono tabular-nums text-slate-900">
                      {filteredRecords.length}
                      <span className="text-xs font-normal text-slate-400">
                        {' '}
                        / {recordsList.length}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Con Foto de Entrada
                    </div>
                    <div className="mt-1 text-lg font-extrabold font-mono tabular-nums text-slate-900">
                      {filteredRecords.filter((r) => Boolean(r.photoUrl)).length}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Con Foto de Salida
                    </div>
                    <div className="mt-1 text-lg font-extrabold font-mono tabular-nums text-emerald-700">
                      {filteredRecords.filter((r) => Boolean(r.exitPhotoUrl)).length}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Biometría Facial Validada
                    </div>
                    <div className="mt-1 text-lg font-extrabold font-mono tabular-nums text-blue-700">
                      {filteredRecords.filter((r) => Boolean(r.facialVerification?.verified)).length}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
                  {/* Filters & View Mode */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl">
                      {(
                        [
                          { id: 'all', label: 'Todas' },
                          { id: 'completado', label: 'Completadas' },
                          { id: 'en_curso', label: 'En Curso' },
                          { id: 'incumplido', label: 'Incumplidas' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setEvidenceStatusFilter(opt.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                            evidenceStatusFilter === opt.id
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={evidenceDateFilter}
                        onChange={(e) => setEvidenceDateFilter(e.target.value)}
                        className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-800 focus:outline-none focus:border-red-600"
                        title="Filtrar bitácora por fecha"
                      />
                      {evidenceDateFilter && (
                        <button
                          type="button"
                          onClick={() => setEvidenceDateFilter('')}
                          className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Limpiar fecha
                        </button>
                      )}
                    </div>

                    <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setEvidenceViewMode('list')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 ${
                          evidenceViewMode === 'list'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>Registros</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEvidenceViewMode('gallery')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 ${
                          evidenceViewMode === 'gallery'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Galería de Fotos</span>
                      </button>
                    </div>
                  </div>

                  {/* Export Toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadDirectoryExcel}
                      disabled={filteredRecords.length === 0}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                      title="Descargar registros filtrados en formato Excel (.xlsx)"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Excel (.xlsx)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDownloadDirectoryPdf()}
                      disabled={filteredRecords.length === 0 || isExportingPdf}
                      className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                      title="Descargar bitácora con fotografías incrustadas en archivo PDF"
                    >
                      {isExportingPdf ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>{isExportingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsEvidencePdfModalOpen(true)}
                      disabled={filteredRecords.length === 0}
                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                      title="Abrir vista previa oficial para imprimir bitácora de evidencias"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 1. FORMULARIO ENTRENADORES (TODOS LOS CAMPOS DEL DEMO) */}
            {activeCategory === 'trainers' && (
              <form onSubmit={handleSubmitTrainer} noValidate className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleTrainerImageUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />

                {/* Avatar + Name/Email/Phone */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-slate-800">
                        Fotografía de Registro Facial *
                      </label>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          isPlaceholderOrMissingAvatar(trainerForm.avatar)
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {isPlaceholderOrMissingAvatar(trainerForm.avatar)
                          ? 'Solo iniciales'
                          : 'Foto activa'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <img
                        src={trainerForm.avatar || generateInitialsAvatarDataUrl(trainerForm.name)}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = generateInitialsAvatarDataUrl(
                            trainerForm.name
                          );
                        }}
                        alt="Avatar Entrenador"
                        className="w-16 h-16 rounded-xl object-cover border border-slate-300 bg-white shrink-0"
                      />
                      <div className="flex flex-col gap-1.5 w-full">
                        <button
                          type="button"
                          onClick={() =>
                            isTrainerCameraOpen
                              ? stopTrainerCamera()
                              : startTrainerLiveCamera('user')
                          }
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition ${
                            isTrainerCameraOpen
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white hover:bg-red-50 border-slate-300 hover:border-red-300 text-slate-800'
                          }`}
                        >
                          <Camera
                            className={`w-3.5 h-3.5 ${
                              isTrainerCameraOpen ? 'text-white' : 'text-red-600'
                            }`}
                          />
                          <span>{isTrainerCameraOpen ? 'Cerrar Cámara' : 'Tomar Foto con Cámara'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-red-600" />
                          <span>Subir Archivo</span>
                        </button>
                      </div>
                    </div>

                    {/* Live WebRTC Camera Viewfinder inside Directory */}
                    {isTrainerCameraOpen && (
                      <div className="bg-slate-900 rounded-xl p-2.5 text-white space-y-2 border border-slate-700">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-red-300 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            <span>Cámara en vivo</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={switchTrainerCameraDevice}
                              disabled={isStartingTrainerCamera}
                              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                              title="Cambiar cámara frontal / trasera"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Girar</span>
                            </button>
                            <button
                              type="button"
                              onClick={stopTrainerCamera}
                              className="p-1 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
                              title="Cerrar cámara"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="relative w-full aspect-square max-w-[220px] mx-auto rounded-xl overflow-hidden bg-black border border-red-500 flex items-center justify-center">
                          <video
                            ref={bindTrainerVideoElement}
                            autoPlay
                            playsInline
                            muted
                            onLoadedMetadata={() => setIsTrainerVideoReady(true)}
                            onPlaying={() => setIsTrainerVideoReady(true)}
                            className={`w-full h-full object-cover ${
                              isTrainerVideoMirrored ? '-scale-x-100' : ''
                            }`}
                          />
                          {(!isTrainerVideoReady || isStartingTrainerCamera) && (
                            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-white text-[11px] space-y-1.5">
                              <RefreshCw className="w-5 h-5 text-red-500 animate-spin" />
                              <span>Activando cámara...</span>
                            </div>
                          )}
                          {/* Face alignment oval guide */}
                          <div className="absolute inset-4 border border-dashed border-white/60 rounded-full pointer-events-none" />
                        </div>

                        <button
                          type="button"
                          onClick={captureTrainerPhotoFromCamera}
                          disabled={!isTrainerVideoReady || isStartingTrainerCamera}
                          className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Capturar Foto de Registro</span>
                        </button>
                      </div>
                    )}

                    {trainerCameraError && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>{trainerCameraError}</span>
                      </div>
                    )}

                    {trainerPhotoBiometricStatus && (
                      <div
                        className={`p-2 rounded-lg border text-[11px] font-semibold flex items-start gap-1.5 ${
                          trainerPhotoBiometricStatus.valid
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        {trainerPhotoBiometricStatus.valid ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <span>{trainerPhotoBiometricStatus.message}</span>
                      </div>
                    )}

                    <div>
                      <input
                        type="url"
                        value={trainerForm.avatar.startsWith('data:') ? '' : trainerForm.avatar}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTrainerPhotoBiometricStatus(null);
                          setTrainerForm((prev) => ({
                            ...prev,
                            avatar: val || generateInitialsAvatarDataUrl(prev.name),
                          }));
                        }}
                        placeholder="O pega URL https://... de foto"
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:border-red-600"
                      />
                    </div>
                    {(trainerTouched.avatar || submitAttemptedByCat.trainers) &&
                      trainerValidation.errors.avatar && (
                        <p className="text-[11px] text-rose-600 font-semibold">
                          {trainerValidation.errors.avatar}
                        </p>
                      )}
                  </div>

                  <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nombre Completo del Entrenador *
                      </label>
                      <input
                        type="text"
                        value={trainerForm.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          setTrainerForm((prev) => ({
                            ...prev,
                            name,
                            avatar: prev.avatar.startsWith('data:image/svg+xml')
                              ? generateInitialsAvatarDataUrl(name)
                              : prev.avatar,
                          }));
                        }}
                        onBlur={() => setTrainerTouched((prev) => ({ ...prev, name: true }))}
                        placeholder="Ej. Carlos Mendoza"
                        className={inputClass(
                          Boolean(
                            (trainerTouched.name || submitAttemptedByCat.trainers) &&
                              trainerValidation.errors.name
                          )
                        )}
                      />
                      {(trainerTouched.name || submitAttemptedByCat.trainers) &&
                        trainerValidation.errors.name && (
                          <p className="text-[11px] text-rose-600 font-semibold mt-1">
                            {trainerValidation.errors.name}
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Correo Electrónico Corporativo *
                      </label>
                      <input
                        type="email"
                        value={trainerForm.email}
                        onChange={(e) =>
                          setTrainerForm((prev) => ({ ...prev, email: e.target.value }))
                        }
                        onBlur={() => setTrainerTouched((prev) => ({ ...prev, email: true }))}
                        placeholder="carlos.mendoza@bscw.corp"
                        className={inputClass(
                          Boolean(
                            (trainerTouched.email || submitAttemptedByCat.trainers) &&
                              trainerValidation.errors.email
                          )
                        )}
                      />
                      {(trainerTouched.email || submitAttemptedByCat.trainers) &&
                        trainerValidation.errors.email && (
                          <p className="text-[11px] text-rose-600 font-semibold mt-1">
                            {trainerValidation.errors.email}
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Teléfono de Contacto *
                      </label>
                      <input
                        type="tel"
                        value={trainerForm.phone}
                        onChange={(e) =>
                          setTrainerForm((prev) => ({ ...prev, phone: e.target.value }))
                        }
                        onBlur={() => setTrainerTouched((prev) => ({ ...prev, phone: true }))}
                        placeholder="+52 55 4123 8901"
                        className={`${inputClass(
                          Boolean(
                            (trainerTouched.phone || submitAttemptedByCat.trainers) &&
                              trainerValidation.errors.phone
                          )
                        )} font-mono tabular-nums`}
                      />
                      {(trainerTouched.phone || submitAttemptedByCat.trainers) &&
                        trainerValidation.errors.phone && (
                          <p className="text-[11px] text-rose-600 font-semibold mt-1">
                            {trainerValidation.errors.phone}
                          </p>
                        )}
                    </div>

                    {/* Active status switch */}
                    <div className="sm:col-span-2 flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Estado Operativo del Entrenador (`active`)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {trainerForm.active
                            ? 'Activo — Habilitado para check-in y programación de clases'
                            : 'Inactivo — Deshabilitado temporalmente'}
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={trainerForm.active}
                          onChange={(e) =>
                            setTrainerForm((prev) => ({ ...prev, active: e.target.checked }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600" />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Specialties array */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-slate-800 block">
                        Especialidades y Disciplinas (`specialties`) *
                      </label>
                      <span className="text-[11px] text-slate-500">
                        Toda especialidad añadida aquí se sincroniza con <span className="font-mono">/activity_catalog</span> para asignarse como clase en el Panel Admin.
                      </span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                      {trainerForm.specialties.length} / {DIRECTORY_LIMITS.specialtiesCount.max}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    {selectableDirectorySpecialties.map((spec) => {
                      const selected = trainerForm.specialties.includes(spec);
                      return (
                        <button
                          key={spec}
                          type="button"
                          onClick={() => toggleTrainerSpecialty(spec)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                            selected
                              ? 'bg-red-600 text-white'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3" />}
                          <span>{spec}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customSpecialty}
                      onChange={(e) => setCustomSpecialty(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomTrainerSpecialty();
                        }
                      }}
                      placeholder="Agregar especialidad o disciplina personalizada..."
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-red-600"
                    />
                    <button
                      type="button"
                      onClick={addCustomTrainerSpecialty}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Añadir</span>
                    </button>
                  </div>
                  {(trainerTouched.specialties || submitAttemptedByCat.trainers) &&
                    trainerValidation.errors.specialties && (
                      <p className="text-[11px] text-rose-600 font-semibold">
                        {trainerValidation.errors.specialties}
                      </p>
                    )}
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => resetCategoryForm('trainers')}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {isSaving
                        ? 'Guardando...'
                        : editingIdByCat.trainers
                        ? 'Actualizar Entrenador'
                        : 'Guardar Entrenador en Firestore'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* 2. FORMULARIO EMPRESAS (TODOS LOS CAMPOS DEL DEMO: name, taxId, industry, logoText) */}
            {activeCategory === 'companies' && (
              <form onSubmit={handleSubmitCompany} noValidate className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                  <div className="sm:col-span-8">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Razón Social o Nombre de la Empresa (`name`) *
                    </label>
                    <input
                      type="text"
                      value={companyForm.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompanyForm((prev) => ({
                          ...prev,
                          name: val,
                          logoText: companyTouched.logoText
                            ? prev.logoText
                            : deriveCompanyLogoText(val),
                        }));
                      }}
                      onBlur={() => setCompanyTouched((prev) => ({ ...prev, name: true }))}
                      placeholder="Ej. Banco Santander Corporativo"
                      className={inputClass(
                        Boolean(
                          (companyTouched.name || submitAttemptedByCat.companies) &&
                            companyValidation.errors.name
                        )
                      )}
                    />
                    {(companyTouched.name || submitAttemptedByCat.companies) &&
                      companyValidation.errors.name && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {companyValidation.errors.name}
                        </p>
                      )}
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Siglas / Badge (`logoText`) *
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={companyForm.logoText}
                      onChange={(e) => {
                        setCompanyTouched((prev) => ({ ...prev, logoText: true }));
                        setCompanyForm((prev) => ({
                          ...prev,
                          logoText: e.target.value.toUpperCase(),
                        }));
                      }}
                      onBlur={() => setCompanyTouched((prev) => ({ ...prev, logoText: true }))}
                      placeholder="BS"
                      className={`${inputClass(
                        Boolean(
                          (companyTouched.logoText || submitAttemptedByCat.companies) &&
                            companyValidation.errors.logoText
                        )
                      )} font-mono uppercase`}
                    />
                    {(companyTouched.logoText || submitAttemptedByCat.companies) &&
                      companyValidation.errors.logoText && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {companyValidation.errors.logoText}
                        </p>
                      )}
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      RFC o NIT (`taxId`) *
                    </label>
                    <input
                      type="text"
                      value={companyForm.taxId}
                      onChange={(e) =>
                        setCompanyForm((prev) => ({
                          ...prev,
                          taxId: e.target.value.toUpperCase(),
                        }))
                      }
                      onBlur={() => setCompanyTouched((prev) => ({ ...prev, taxId: true }))}
                      placeholder="SAN891024-K92"
                      className={`${inputClass(
                        Boolean(
                          (companyTouched.taxId || submitAttemptedByCat.companies) &&
                            companyValidation.errors.taxId
                        )
                      )} font-mono uppercase tabular-nums`}
                    />
                    {(companyTouched.taxId || submitAttemptedByCat.companies) &&
                      companyValidation.errors.taxId && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {companyValidation.errors.taxId}
                        </p>
                      )}
                  </div>

                  <div className="sm:col-span-7">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Giro o Industria (`industry`) *
                    </label>
                    <input
                      type="text"
                      value={companyForm.industry}
                      onChange={(e) =>
                        setCompanyForm((prev) => ({ ...prev, industry: e.target.value }))
                      }
                      onBlur={() => setCompanyTouched((prev) => ({ ...prev, industry: true }))}
                      placeholder="Ej. Servicios Financieros / Alimentos y Bebidas"
                      className={inputClass(
                        Boolean(
                          (companyTouched.industry || submitAttemptedByCat.companies) &&
                            companyValidation.errors.industry
                        )
                      )}
                    />
                    {(companyTouched.industry || submitAttemptedByCat.companies) &&
                      companyValidation.errors.industry && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {companyValidation.errors.industry}
                        </p>
                      )}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => resetCategoryForm('companies')}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {isSaving
                        ? 'Guardando...'
                        : editingIdByCat.companies
                        ? 'Actualizar Empresa'
                        : 'Guardar Empresa en Firestore'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* 3. FORMULARIO SEDES (TODOS LOS CAMPOS DEL DEMO) */}
            {activeCategory === 'sedes' && (
              <form onSubmit={handleSubmitSede} noValidate className="space-y-4">
                {companiesList.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Para registrar una sede primero debes tener al menos una empresa en{' '}
                      <strong className="font-mono">/companies</strong> o sincronizar las empresas del demo.
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveCategory('companies')}
                      className="px-3 py-1.5 rounded-lg bg-amber-800 text-white font-bold text-[11px]"
                    >
                      Ir a Empresas
                    </button>
                  </div>
                ) : (
                  effectiveSedeForm.companyName && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-red-50/70 border border-red-200 text-xs flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-800 font-semibold flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-red-600 shrink-0" />
                        <span>
                          {editingIdByCat.sedes ? 'Editando sede de:' : 'Agregando sede a empresa registrada:'}{' '}
                          <strong className="text-slate-900">{effectiveSedeForm.companyName}</strong>
                        </span>
                      </span>
                      <span className="font-mono text-[11px] font-bold text-red-700">
                        {
                          sedesList.filter((s) => s.companyId === effectiveSedeForm.companyId)
                            .length
                        }{' '}
                        sedes registradas en esta empresa
                      </span>
                    </div>
                  )
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Empresa Registrada (`companyId`) *
                    </label>
                    <select
                      value={sedeForm.companyId}
                      onChange={(e) => {
                        const comp = companiesList.find((c) => c.id === e.target.value);
                        setSedeForm((prev) => ({
                          ...prev,
                          companyId: e.target.value,
                          companyName: comp ? comp.name : '',
                        }));
                      }}
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, companyId: true }))}
                      className={inputClass(
                        Boolean(
                          (sedeTouched.companyId || submitAttemptedByCat.sedes) &&
                            sedeValidation.errors.companyId
                        )
                      )}
                    >
                      <option value="">Selecciona empresa...</option>
                      {companiesList.map((c) => {
                        const count = sedesList.filter((s) => s.companyId === c.id).length;
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name} ({count} {count === 1 ? 'sede' : 'sedes'})
                          </option>
                        );
                      })}
                    </select>
                    {(sedeTouched.companyId || submitAttemptedByCat.sedes) &&
                      sedeValidation.errors.companyId && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {sedeValidation.errors.companyId}
                        </p>
                      )}
                  </div>

                  <div className="sm:col-span-7">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nombre de la Sede / Campus / Planta (`name`) *
                    </label>
                    <input
                      type="text"
                      value={sedeForm.name}
                      onChange={(e) => setSedeForm((prev) => ({ ...prev, name: e.target.value }))}
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, name: true }))}
                      placeholder="Ej. Torre Corporativa Reforma"
                      className={inputClass(
                        Boolean(
                          (sedeTouched.name || submitAttemptedByCat.sedes) &&
                            sedeValidation.errors.name
                        )
                      )}
                    />
                    {(sedeTouched.name || submitAttemptedByCat.sedes) &&
                      sedeValidation.errors.name && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {sedeValidation.errors.name}
                        </p>
                      )}
                  </div>

                  <div className="sm:col-span-8">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Dirección Completa (`address`) *
                    </label>
                    <input
                      type="text"
                      value={sedeForm.address}
                      onChange={(e) =>
                        setSedeForm((prev) => ({ ...prev, address: e.target.value }))
                      }
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, address: true }))}
                      placeholder="Paseo de la Reforma 500, Cuauhtémoc, CDMX"
                      className={inputClass(
                        Boolean(
                          (sedeTouched.address || submitAttemptedByCat.sedes) &&
                            sedeValidation.errors.address
                        )
                      )}
                    />
                    {(sedeTouched.address || submitAttemptedByCat.sedes) &&
                      sedeValidation.errors.address && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {sedeValidation.errors.address}
                        </p>
                      )}
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ciudad / Estado (`city`) *
                    </label>
                    <input
                      type="text"
                      value={sedeForm.city}
                      onChange={(e) => setSedeForm((prev) => ({ ...prev, city: e.target.value }))}
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, city: true }))}
                      placeholder="Ciudad de México"
                      className={inputClass(
                        Boolean(
                          (sedeTouched.city || submitAttemptedByCat.sedes) &&
                            sedeValidation.errors.city
                        )
                      )}
                    />
                    {(sedeTouched.city || submitAttemptedByCat.sedes) &&
                      sedeValidation.errors.city && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {sedeValidation.errors.city}
                        </p>
                      )}
                  </div>
                </div>

                {/* GPS & Geofence Block */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-red-600" />
                      <span>Coordenadas GPS y Geocerca (`lat`, `lng`, `geofenceRadiusMeters`)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleGetSedeGps}
                      disabled={gettingSedeGps}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-red-600 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>{gettingSedeGps ? 'Consultando GPS...' : 'Tomar mi GPS actual'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Latitud *
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        value={sedeForm.lat}
                        onChange={(e) => setSedeForm((prev) => ({ ...prev, lat: e.target.value }))}
                        onBlur={() => setSedeTouched((prev) => ({ ...prev, lat: true }))}
                        className={`${inputClass(
                          Boolean(
                            (sedeTouched.lat || submitAttemptedByCat.sedes) &&
                              sedeValidation.errors.lat
                          )
                        )} font-mono tabular-nums`}
                      />
                      {(sedeTouched.lat || submitAttemptedByCat.sedes) &&
                        sedeValidation.errors.lat && (
                          <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                            {sedeValidation.errors.lat}
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Longitud *
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        value={sedeForm.lng}
                        onChange={(e) => setSedeForm((prev) => ({ ...prev, lng: e.target.value }))}
                        onBlur={() => setSedeTouched((prev) => ({ ...prev, lng: true }))}
                        className={`${inputClass(
                          Boolean(
                            (sedeTouched.lng || submitAttemptedByCat.sedes) &&
                              sedeValidation.errors.lng
                          )
                        )} font-mono tabular-nums`}
                      />
                      {(sedeTouched.lng || submitAttemptedByCat.sedes) &&
                        sedeValidation.errors.lng && (
                          <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                            {sedeValidation.errors.lng}
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Radio Geocerca (m) *
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={10000}
                        value={sedeForm.geofenceRadiusMeters}
                        onChange={(e) =>
                          setSedeForm((prev) => ({
                            ...prev,
                            geofenceRadiusMeters: e.target.value,
                          }))
                        }
                        onBlur={() =>
                          setSedeTouched((prev) => ({ ...prev, geofenceRadiusMeters: true }))
                        }
                        className={`${inputClass(
                          Boolean(
                            (sedeTouched.geofenceRadiusMeters || submitAttemptedByCat.sedes) &&
                              sedeValidation.errors.geofenceRadiusMeters
                          )
                        )} font-mono tabular-nums`}
                      />
                      {(sedeTouched.geofenceRadiusMeters || submitAttemptedByCat.sedes) &&
                        sedeValidation.errors.geofenceRadiusMeters && (
                          <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                            {sedeValidation.errors.geofenceRadiusMeters}
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Etiqueta Color (`colorTag`)
                      </label>
                      <select
                        value={sedeForm.colorTag}
                        onChange={(e) =>
                          setSedeForm((prev) => ({ ...prev, colorTag: e.target.value }))
                        }
                        className={inputClass(false)}
                      >
                        {SEDE_COLOR_TAGS.map((tag) => (
                          <option key={tag.value} value={tag.value}>
                            {tag.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Contact fields (optional with automatic corporate defaults) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Contacto en Sede <span className="text-slate-400 font-normal">(Opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={sedeForm.contactPerson}
                      onChange={(e) =>
                        setSedeForm((prev) => ({ ...prev, contactPerson: e.target.value }))
                      }
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, contactPerson: true }))}
                      placeholder="Ej. Lic. Laura Peñaloza"
                      className={inputClass(
                        Boolean(
                          (sedeTouched.contactPerson || submitAttemptedByCat.sedes) &&
                            sedeValidation.errors.contactPerson
                        )
                      )}
                    />
                    {(sedeTouched.contactPerson || submitAttemptedByCat.sedes) &&
                      sedeValidation.errors.contactPerson && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {sedeValidation.errors.contactPerson}
                        </p>
                      )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cargo / Rol <span className="text-slate-400 font-normal">(Opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={sedeForm.contactRole}
                      onChange={(e) =>
                        setSedeForm((prev) => ({ ...prev, contactRole: e.target.value }))
                      }
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, contactRole: true }))}
                      placeholder="Coordinador de Salud en el Trabajo"
                      className={inputClass(
                        Boolean(
                          (sedeTouched.contactRole || submitAttemptedByCat.sedes) &&
                            sedeValidation.errors.contactRole
                        )
                      )}
                    />
                    {(sedeTouched.contactRole || submitAttemptedByCat.sedes) &&
                      sedeValidation.errors.contactRole && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {sedeValidation.errors.contactRole}
                        </p>
                      )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Teléfono Directo <span className="text-slate-400 font-normal">(Opcional)</span>
                    </label>
                    <input
                      type="tel"
                      value={sedeForm.contactPhone}
                      onChange={(e) =>
                        setSedeForm((prev) => ({ ...prev, contactPhone: e.target.value }))
                      }
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, contactPhone: true }))}
                      placeholder="+52 55 5100 1122"
                      className={`${inputClass(
                        Boolean(
                          (sedeTouched.contactPhone || submitAttemptedByCat.sedes) &&
                            sedeValidation.errors.contactPhone
                        )
                      )} font-mono tabular-nums`}
                    />
                    {(sedeTouched.contactPhone || submitAttemptedByCat.sedes) &&
                      sedeValidation.errors.contactPhone && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          {sedeValidation.errors.contactPhone}
                        </p>
                      )}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => resetCategoryForm('sedes')}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || companiesList.length === 0}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {isSaving
                        ? 'Guardando...'
                        : editingIdByCat.sedes
                        ? 'Actualizar Sede'
                        : 'Guardar Sede en Firestore'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* 4. FORMULARIO PERSONAL (PRESERVADO) */}
            {activeCategory === 'personnel' && (
              <form onSubmit={handleSubmitPersonnel} noValidate className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      value={personnelForm.fullName}
                      onChange={(e) =>
                        setPersonnelForm((prev) => ({ ...prev, fullName: e.target.value }))
                      }
                      placeholder="María Fernanda López"
                      className={inputClass(
                        Boolean(
                          submitAttemptedByCat.personnel && personnelValidation.errors.fullName
                        )
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono *</label>
                    <input
                      type="tel"
                      value={personnelForm.phone}
                      onChange={(e) =>
                        setPersonnelForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="+52 55 1234 5678"
                      className={`${inputClass(
                        Boolean(submitAttemptedByCat.personnel && personnelValidation.errors.phone)
                      )} font-mono tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Correo Electrónico *
                    </label>
                    <input
                      type="email"
                      value={personnelForm.email}
                      onChange={(e) =>
                        setPersonnelForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="personal@empresa.com"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.personnel && personnelValidation.errors.email)
                      )}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Calle *</label>
                    <input
                      type="text"
                      value={personnelForm.address.street}
                      onChange={(e) =>
                        setPersonnelForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, street: e.target.value },
                        }))
                      }
                      placeholder="Av. Reforma"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.personnel && personnelValidation.errors.street)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Número *</label>
                    <input
                      type="text"
                      value={personnelForm.address.number}
                      onChange={(e) =>
                        setPersonnelForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, number: e.target.value },
                        }))
                      }
                      placeholder="222"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.personnel && personnelValidation.errors.number)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ciudad *</label>
                    <input
                      type="text"
                      value={personnelForm.address.city}
                      onChange={(e) =>
                        setPersonnelForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, city: e.target.value },
                        }))
                      }
                      placeholder="CDMX"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.personnel && personnelValidation.errors.city)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Estado *</label>
                    <input
                      type="text"
                      value={personnelForm.address.state}
                      onChange={(e) =>
                        setPersonnelForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, state: e.target.value },
                        }))
                      }
                      placeholder="CDMX"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.personnel && personnelValidation.errors.state)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">C.P. *</label>
                    <input
                      type="text"
                      value={personnelForm.address.postalCode}
                      onChange={(e) =>
                        setPersonnelForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, postalCode: e.target.value },
                        }))
                      }
                      placeholder="06600"
                      className={`${inputClass(
                        Boolean(
                          submitAttemptedByCat.personnel && personnelValidation.errors.postalCode
                        )
                      )} font-mono tabular-nums`}
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => resetCategoryForm('personnel')}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>{editingIdByCat.personnel ? 'Actualizar Personal' : 'Guardar Personal'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* 5. FORMULARIO CLIENTES (PRESERVADO) */}
            {activeCategory === 'clients' && (
              <form onSubmit={handleSubmitClient} noValidate className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nombre del Cliente *
                    </label>
                    <input
                      type="text"
                      value={clientForm.fullName}
                      onChange={(e) =>
                        setClientForm((prev) => ({ ...prev, fullName: e.target.value }))
                      }
                      placeholder="Carlos Ramírez"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.clients && clientValidation.errors.fullName)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono *</label>
                    <input
                      type="tel"
                      value={clientForm.phone}
                      onChange={(e) =>
                        setClientForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="+52 33 1122 3344"
                      className={`${inputClass(
                        Boolean(submitAttemptedByCat.clients && clientValidation.errors.phone)
                      )} font-mono tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Correo Electrónico *
                    </label>
                    <input
                      type="email"
                      value={clientForm.email}
                      onChange={(e) =>
                        setClientForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="cliente@correo.com"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.clients && clientValidation.errors.email)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Empresa (Opcional)
                    </label>
                    <input
                      type="text"
                      value={clientForm.company}
                      onChange={(e) =>
                        setClientForm((prev) => ({ ...prev, company: e.target.value }))
                      }
                      placeholder="Opcional"
                      className={inputClass(false)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Calle *</label>
                    <input
                      type="text"
                      value={clientForm.address.street}
                      onChange={(e) =>
                        setClientForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, street: e.target.value },
                        }))
                      }
                      placeholder="Calle"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.clients && clientValidation.errors.street)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Número *</label>
                    <input
                      type="text"
                      value={clientForm.address.number}
                      onChange={(e) =>
                        setClientForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, number: e.target.value },
                        }))
                      }
                      placeholder="10"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.clients && clientValidation.errors.number)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ciudad *</label>
                    <input
                      type="text"
                      value={clientForm.address.city}
                      onChange={(e) =>
                        setClientForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, city: e.target.value },
                        }))
                      }
                      placeholder="Ciudad"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.clients && clientValidation.errors.city)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Estado *</label>
                    <input
                      type="text"
                      value={clientForm.address.state}
                      onChange={(e) =>
                        setClientForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, state: e.target.value },
                        }))
                      }
                      placeholder="Estado"
                      className={inputClass(
                        Boolean(submitAttemptedByCat.clients && clientValidation.errors.state)
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">C.P. *</label>
                    <input
                      type="text"
                      value={clientForm.address.postalCode}
                      onChange={(e) =>
                        setClientForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, postalCode: e.target.value },
                        }))
                      }
                      placeholder="06600"
                      className={`${inputClass(
                        Boolean(submitAttemptedByCat.clients && clientValidation.errors.postalCode)
                      )} font-mono tabular-nums`}
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => resetCategoryForm('clients')}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>{editingIdByCat.clients ? 'Actualizar Cliente' : 'Guardar Cliente'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Collection Records List Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-extrabold text-slate-900">
                  Listado en Tiempo Real — {activeCategoryMeta.label}
                </h4>
                <span className="font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {countsByCategory[activeCategory]}
                </span>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchByCat[activeCategory]}
                  onChange={(e) =>
                    setSearchByCat((prev) => ({ ...prev, [activeCategory]: e.target.value }))
                  }
                  placeholder={`Buscar en ${activeCategoryMeta.label.toLowerCase()}...`}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-red-600"
                />
              </div>
            </div>

            {loadingByCat[activeCategory] ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((k) => (
                  <div
                    key={k}
                    className="h-14 rounded-xl bg-slate-100 border border-slate-200 animate-pulse"
                  />
                ))}
              </div>
            ) : countsByCategory[activeCategory] === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs text-slate-600">
                  Aún no hay documentos en <strong className="font-mono">{activeCategoryMeta.collectionPath}</strong>.
                </p>
              </div>
            ) : (
              <>
                {/* LIST: TRAINERS */}
                {activeCategory === 'trainers' && (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {filteredTrainers.map((tr) => (
                      <div
                        key={tr.id}
                        className="p-3.5 bg-white hover:bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-start gap-3">
                          <img
                            src={tr.avatar || generateInitialsAvatarDataUrl(tr.name)}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                generateInitialsAvatarDataUrl(tr.name);
                            }}
                            alt={tr.name}
                            className="w-11 h-11 rounded-xl object-cover border border-slate-300 shrink-0 bg-slate-100"
                          />
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                {tr.name}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  tr.active
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}
                              >
                                {tr.active ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {tr.email}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {tr.phone}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-700 font-medium">
                              {tr.specialties.join(' · ')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingIdByCat((prev) => ({ ...prev, trainers: tr.id }));
                              setTrainerForm({
                                name: tr.name,
                                email: tr.email,
                                phone: tr.phone,
                                avatar: tr.avatar,
                                specialties: tr.specialties,
                                active: tr.active,
                              });
                              setSaveFeedback(null);
                              formCardRef.current?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                              });
                              startTrainerLiveCamera('user');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="Tomar o actualizar foto de registro con cámara"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Tomar Foto</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              stopTrainerCamera();
                              setTrainerCameraError(null);
                              setTrainerPhotoBiometricStatus(null);
                              setEditingIdByCat((prev) => ({ ...prev, trainers: tr.id }));
                              setTrainerForm({
                                name: tr.name,
                                email: tr.email,
                                phone: tr.phone,
                                avatar: tr.avatar,
                                specialties: tr.specialties,
                                active: tr.active,
                              });
                              setSaveFeedback(null);
                              formCardRef.current?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                              });
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer"
                            title="Editar Entrenador"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {confirmDeleteKey === `trainers:${tr.id}` ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteDocument('trainers', tr.id)}
                                className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(null)}
                                className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(`trainers:${tr.id}`)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200"
                              title="Eliminar Entrenador"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* LIST: COMPANIES */}
                {activeCategory === 'companies' && (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {filteredCompanies.map((comp) => {
                      const linkedSedes = sedesList.filter((s) => s.companyId === comp.id);
                      return (
                        <div
                          key={comp.id}
                          className="p-4 bg-white hover:bg-slate-50/80 space-y-3 transition"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 text-red-700 font-mono font-extrabold text-xs flex items-center justify-center shrink-0">
                                {comp.logoText}
                              </span>
                              <div className="space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                    {comp.name}
                                  </span>
                                  <span className="font-mono tabular-nums text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                    RFC: {comp.taxId}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                                  <span className="inline-flex items-center gap-1">
                                    <Briefcase className="w-3 h-3 text-slate-400" />
                                    {comp.industry}
                                  </span>
                                  <span className="font-mono tabular-nums text-slate-700 font-semibold">
                                    {linkedSedes.length} {linkedSedes.length === 1 ? 'sede vinculada' : 'sedes vinculadas'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center shrink-0">
                              <button
                                type="button"
                                onClick={() => handlePrepareNewSedeForCompany(comp)}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                title={`Agregar nueva sede a ${comp.name}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Agregar Sede</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingIdByCat((prev) => ({ ...prev, companies: comp.id }));
                                  setCompanyForm({
                                    name: comp.name,
                                    taxId: comp.taxId,
                                    industry: comp.industry,
                                    logoText: comp.logoText,
                                  });
                                  setSaveFeedback(null);
                                  formCardRef.current?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'start',
                                  });
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                                title="Editar Empresa"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteKey === `companies:${comp.id}` ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDocument('companies', comp.id)}
                                    className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(`companies:${comp.id}`)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200"
                                  title="Eliminar Empresa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {linkedSedes.length > 0 && (
                            <div className="pl-0 sm:pl-13 grid grid-cols-1 md:grid-cols-2 gap-2">
                              {linkedSedes.map((s) => (
                                <div
                                  key={s.id}
                                  className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-[11px]"
                                >
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                      <span
                                        className={`w-2 h-2 rounded-sm shrink-0 ${
                                          s.colorTag || 'bg-red-600'
                                        }`}
                                      />
                                      <span className="truncate">{s.name}</span>
                                    </div>
                                    <div className="text-slate-500 truncate">
                                      {s.city} • Geocerca {s.geofenceRadiusMeters}m
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingIdByCat((prev) => ({ ...prev, sedes: s.id }));
                                      setSedeForm({
                                        companyId: s.companyId,
                                        companyName: comp.name || s.companyName,
                                        name: s.name,
                                        address: s.address,
                                        city: s.city,
                                        lat: String(s.lat),
                                        lng: String(s.lng),
                                        geofenceRadiusMeters: String(s.geofenceRadiusMeters),
                                        contactPerson: s.contactPerson,
                                        contactRole: s.contactRole,
                                        contactPhone: s.contactPhone,
                                        colorTag: s.colorTag || 'bg-red-600',
                                      });
                                      setSaveFeedback(null);
                                      setActiveCategory('sedes');
                                      setTimeout(() => {
                                        formCardRef.current?.scrollIntoView({
                                          behavior: 'smooth',
                                          block: 'start',
                                        });
                                      }, 60);
                                    }}
                                    className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold shrink-0"
                                  >
                                    Editar
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* LIST: SEDES */}
                {activeCategory === 'sedes' && (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {filteredSedes.map((sede) => (
                      <div
                        key={sede.id}
                        className="p-3.5 bg-white hover:bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-sm ${sede.colorTag || 'bg-red-600'}`}
                            />
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">
                              {sede.name}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {sede.companyName}
                            </span>
                            <span className="font-mono tabular-nums text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                              Radio: {sede.geofenceRadiusMeters}m
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {sede.address} • <strong className="text-slate-700">{sede.city}</strong>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span>
                              Contacto: <strong className="text-slate-700">{sede.contactPerson}</strong> ({sede.contactRole})
                            </span>
                            <span className="font-mono tabular-nums">{sede.contactPhone}</span>
                            <span className="font-mono tabular-nums text-slate-600">
                              GPS: {sede.lat.toFixed(5)}, {sede.lng.toFixed(5)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingIdByCat((prev) => ({ ...prev, sedes: sede.id }));
                              setSedeForm({
                                companyId: sede.companyId,
                                companyName: sede.companyName,
                                name: sede.name,
                                address: sede.address,
                                city: sede.city,
                                lat: String(sede.lat),
                                lng: String(sede.lng),
                                geofenceRadiusMeters: String(sede.geofenceRadiusMeters),
                                contactPerson: sede.contactPerson,
                                contactRole: sede.contactRole,
                                contactPhone: sede.contactPhone,
                                colorTag: sede.colorTag || 'bg-red-600',
                              });
                              setSaveFeedback(null);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                            title="Editar Sede"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {confirmDeleteKey === `sedes:${sede.id}` ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteDocument('sedes', sede.id)}
                                className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(null)}
                                className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(`sedes:${sede.id}`)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200"
                              title="Eliminar Sede"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* LIST: CALENDAR (/assignments + /records + /activity_catalog) */}
                {activeCategory === 'calendar' && (
                  <div className="space-y-5">
                    {/* Scheduled Assignments */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                        Programación de Asignaciones (`/assignments`: {filteredAssignments.length})
                      </h5>
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                        {filteredAssignments.map((asg) => {
                          const scheduleLabel =
                            asg.frequency === 'semanal'
                              ? `Semanal · ${
                                  asg.dayOfWeek !== undefined
                                    ? WEEKDAY_NAMES[asg.dayOfWeek] || `Día ${asg.dayOfWeek}`
                                    : 'Semanal'
                                }`
                              : asg.frequency === 'mensual'
                              ? `Mensual · Día ${asg.dayOfMonth || 1}`
                              : `Fecha única · ${asg.date || ''}`;

                          return (
                            <div
                              key={asg.id}
                              className="p-3.5 bg-white hover:bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                                    {asg.time} hrs
                                  </span>
                                  <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                    {asg.activityName}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    {ACTIVITY_TYPE_LABELS[asg.activityType]} · {scheduleLabel}
                                  </span>
                                  {asg.durationMinutes && (
                                    <span className="font-mono tabular-nums text-[10px] font-semibold text-slate-500">
                                      · {asg.durationMinutes} min
                                    </span>
                                  )}
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                      asg.nonCompliant
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : asg.closed
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : asg.active
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                    }`}
                                  >
                                    {asg.nonCompliant
                                      ? 'Incumplida'
                                      : asg.closed
                                      ? 'Cerrada'
                                      : asg.active
                                      ? 'Activa'
                                      : 'Pausada'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-700">
                                  <strong>{asg.companyName}</strong> — {asg.sedeName} ({asg.locationArea})
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                  <span>Entrenador: {asg.trainerName}</span>
                                  {asg.completedDates && asg.completedDates.length > 0 && (
                                    <span className="text-emerald-700 font-mono">
                                      Completadas: {asg.completedDates.length}
                                    </span>
                                  )}
                                  {asg.missedDates && asg.missedDates.length > 0 && (
                                    <span className="text-rose-700 font-mono">
                                      Incumplidas: {asg.missedDates.length}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                {confirmDeleteKey === `calendar:${asg.id}` ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDocument('calendar', asg.id)}
                                      className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold"
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteKey(null)}
                                      className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(`calendar:${asg.id}`)}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 cursor-pointer"
                                    title="Eliminar Asignación"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {filteredAssignments.length === 0 && (
                          <div className="p-4 text-xs text-slate-500 text-center">
                            Sin asignaciones que coincidan con el filtro.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Session Executions (/records) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                          Historial de Ejecuciones (`/records`: {filteredRecords.length})
                        </h5>
                        <button
                          type="button"
                          onClick={() => setActiveCategory('evidences')}
                          className="text-[11px] font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Abrir Bitácora Completa y Exportación</span>
                        </button>
                      </div>
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                        {filteredRecords.slice(0, 8).map((rec) => (
                          <div
                            key={rec.id}
                            className="p-3.5 bg-white hover:bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {rec.photoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxState({ record: rec, slot: 'entry' })}
                                  className="relative w-11 h-11 rounded-lg overflow-hidden border border-slate-200 shrink-0 group cursor-pointer"
                                  title="Visualizar fotografías de evidencia"
                                >
                                  <img
                                    src={rec.photoUrl}
                                    alt={`Evidencia ${rec.activityName}`}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <ZoomIn className="w-3.5 h-3.5 text-white" />
                                  </span>
                                </button>
                              )}
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono tabular-nums text-[11px] font-bold text-slate-700">
                                    {rec.date} · {rec.scheduledTime}
                                  </span>
                                  <span className="font-bold text-xs text-slate-900">
                                    {rec.activityName}
                                  </span>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                      rec.status === 'completado'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : rec.status === 'incumplido'
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}
                                  >
                                    {rec.status === 'completado'
                                      ? 'Completada'
                                      : rec.status === 'incumplido'
                                      ? 'Incumplida'
                                      : 'En Curso'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-600 truncate">
                                  <strong>{rec.companyName}</strong> — {rec.sedeName} · Entrenador:{' '}
                                  {rec.trainerName} · Asistentes: {rec.attendeesCount}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                                {rec.checkInTime}
                                {rec.checkOutTime ? ` → ${rec.checkOutTime}` : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => setLightboxState({ record: rec, slot: 'entry' })}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Fotos</span>
                              </button>
                            </div>
                          </div>
                        ))}
                        {filteredRecords.length === 0 && (
                          <div className="p-4 text-xs text-slate-500 text-center">
                            Sin registros de ejecución sincronizados aún.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Activity Catalog (/activity_catalog) */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-extrabold text-slate-700">
                        Catálogo de Especialidades y Disciplinas (`/activity_catalog`:{' '}
                        <span className="font-mono tabular-nums">{filteredCatalog.length}</span>)
                      </h5>
                      {filteredCatalog.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {filteredCatalog.map((cat) => (
                            <div
                              key={cat.id}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">{cat.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                  {ACTIVITY_TYPE_LABELS[cat.activityType]} · {cat.defaultDurationMinutes} min ·{' '}
                                  <span
                                    className={
                                      cat.active
                                        ? 'text-emerald-700 font-sans font-semibold'
                                        : 'text-slate-400 font-sans'
                                    }
                                  >
                                    {cat.active ? 'Activa' : 'Inactiva'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {confirmDeleteKey === `catalog:${cat.id}` ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteCatalogDiscipline(cat.id)}
                                      className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap"
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteKey(null)}
                                      className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer whitespace-nowrap"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startEditCatalogDiscipline(cat)}
                                      className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 cursor-pointer"
                                      title="Editar disciplina"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteKey(`catalog:${cat.id}`)}
                                      className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 cursor-pointer"
                                      title="Eliminar disciplina"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-xs text-slate-500 text-center border border-slate-200 rounded-xl bg-slate-50/60">
                          No hay disciplinas registradas que coincidan con la búsqueda. Usa el formulario superior para añadir una nueva especialidad o disciplina.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* LIST & PHOTO GALLERY: BITÁCORA DE EVIDENCIAS (/records) */}
                {activeCategory === 'evidences' && (
                  <>
                    {filteredRecords.length === 0 ? (
                      <div className="py-10 text-center space-y-2 border border-slate-200 rounded-xl bg-slate-50/60">
                        <ImageIcon className="w-7 h-7 text-slate-400 mx-auto" />
                        <p className="text-xs font-semibold text-slate-700">
                          No hay evidencias que coincidan con los filtros seleccionados.
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Ajusta el estado, la fecha o el término de búsqueda para visualizar más registros.
                        </p>
                      </div>
                    ) : evidenceViewMode === 'gallery' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredRecords.map((rec) => {
                          const photoSlots: {
                            slot: EvidencePhotoSlot;
                            label: string;
                            url?: string;
                          }[] = [
                            { slot: 'entry', label: 'Entrada', url: rec.photoUrl },
                            { slot: 'exit', label: 'Salida', url: rec.exitPhotoUrl },
                            {
                              slot: 'facial',
                              label: 'Biometría',
                              url: rec.facialVerification?.facePhotoUrl,
                            },
                          ];

                          return (
                            <div
                              key={rec.id}
                              className="border border-slate-200 rounded-xl bg-white p-4 space-y-3 hover:border-slate-300 transition"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums">
                                    <span>{rec.date}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{rec.checkInTime}</span>
                                    {rec.checkOutTime && (
                                      <>
                                        <span aria-hidden="true">→</span>
                                        <span>{rec.checkOutTime}</span>
                                      </>
                                    )}
                                  </div>
                                  <div className="text-sm font-bold text-slate-900 truncate">
                                    {rec.companyName} — {rec.sedeName}
                                  </div>
                                  <div className="text-xs text-slate-600 truncate">
                                    {rec.activityName} · Entrenador: <strong>{rec.trainerName}</strong>
                                  </div>
                                </div>
                                <span
                                  className={`text-[11px] font-bold shrink-0 ${
                                    rec.status === 'completado'
                                      ? 'text-emerald-700'
                                      : rec.status === 'incumplido'
                                      ? 'text-rose-700'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {rec.status === 'completado'
                                    ? 'Completada'
                                    : rec.status === 'incumplido'
                                    ? 'Incumplida'
                                    : 'En Curso'}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                {photoSlots.map((item) =>
                                  item.url ? (
                                    <button
                                      key={item.slot}
                                      type="button"
                                      onClick={() =>
                                        setLightboxState({ record: rec, slot: item.slot })
                                      }
                                      className="group relative aspect-4/3 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 cursor-pointer"
                                      title={`Ampliar evidencia: ${item.label}`}
                                    >
                                      <img
                                        src={item.url}
                                        alt={`${item.label} - ${rec.trainerName}`}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent flex items-end justify-between p-1.5">
                                        <span className="text-[10px] font-bold text-white">
                                          {item.label}
                                        </span>
                                        <ZoomIn className="w-3.5 h-3.5 text-white opacity-85" />
                                      </div>
                                    </button>
                                  ) : (
                                    <div
                                      key={item.slot}
                                      className="aspect-4/3 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-2 text-center"
                                    >
                                      <span className="text-[10px] font-semibold text-slate-400">
                                        {item.label}
                                      </span>
                                      <span className="text-[9px] text-slate-400 mt-0.5">
                                        Pendiente
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>

                              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                                <span className="font-mono tabular-nums">
                                  GPS: {formatDistance(rec.checkInGps.distanceToSedeMeters)} ·{' '}
                                  {rec.attendeesCount} asistentes
                                  {rec.adminVerified ? ' · Auditada' : ''}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRecordForAudit(rec)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    <FileText className="w-3 h-3" />
                                    <span>Acta</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDownloadSingleRecordPdf(rec)}
                                    disabled={singlePdfRecordId === rec.id}
                                    className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>
                                      {singlePdfRecordId === rec.id ? 'PDF...' : 'PDF'}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                        {filteredRecords.map((rec) => (
                          <div
                            key={rec.id}
                            className="p-3.5 bg-white hover:bg-slate-50/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              {/* Clickable Thumbnails Strip */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                {rec.photoUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxState({ record: rec, slot: 'entry' })
                                    }
                                    className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 group cursor-pointer"
                                    title="Ver foto de entrada con marca de agua GPS"
                                  >
                                    <img
                                      src={rec.photoUrl}
                                      alt={`Entrada ${rec.trainerName}`}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                    <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[9px] font-bold text-white text-center py-0.5">
                                      Entrada
                                    </span>
                                  </button>
                                )}

                                {rec.exitPhotoUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxState({ record: rec, slot: 'exit' })
                                    }
                                    className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 group cursor-pointer"
                                    title="Ver foto de cierre/salida de sesión"
                                  >
                                    <img
                                      src={rec.exitPhotoUrl}
                                      alt={`Salida ${rec.trainerName}`}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                    <span className="absolute inset-x-0 bottom-0 bg-emerald-950/80 text-[9px] font-bold text-emerald-100 text-center py-0.5">
                                      Salida
                                    </span>
                                  </button>
                                )}

                                {rec.facialVerification?.facePhotoUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxState({ record: rec, slot: 'facial' })
                                    }
                                    className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 group cursor-pointer"
                                    title={`Ver validación biométrica facial (${rec.facialVerification.confidenceScore.toFixed(
                                      1
                                    )}%)`}
                                  >
                                    <img
                                      src={rec.facialVerification.facePhotoUrl}
                                      alt={`Biometría ${rec.trainerName}`}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                    <span className="absolute inset-x-0 bottom-0 bg-blue-950/80 text-[9px] font-bold text-blue-100 text-center py-0.5">
                                      Rostro
                                    </span>
                                  </button>
                                )}
                              </div>

                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                  <span className="font-mono tabular-nums font-bold text-slate-800">
                                    {rec.date} · {rec.checkInTime}
                                    {rec.checkOutTime ? ` → ${rec.checkOutTime}` : ''}
                                  </span>
                                  <span aria-hidden="true" className="text-slate-300">
                                    ·
                                  </span>
                                  <span className="font-bold text-slate-900">
                                    {rec.activityName}
                                  </span>
                                  <span aria-hidden="true" className="text-slate-300">
                                    ·
                                  </span>
                                  <span
                                    className={`text-[11px] font-bold ${
                                      rec.status === 'completado'
                                        ? 'text-emerald-700'
                                        : rec.status === 'incumplido'
                                        ? 'text-rose-700'
                                        : 'text-amber-700'
                                    }`}
                                  >
                                    {rec.status === 'completado'
                                      ? 'Completada'
                                      : rec.status === 'incumplido'
                                      ? 'Incumplida'
                                      : 'En Curso'}
                                  </span>
                                  {rec.adminVerified && (
                                    <>
                                      <span aria-hidden="true" className="text-slate-300">
                                        ·
                                      </span>
                                      <span className="text-[11px] font-semibold text-blue-700">
                                        Auditada
                                      </span>
                                    </>
                                  )}
                                </div>

                                <div className="text-[11px] text-slate-700">
                                  <strong>{rec.companyName}</strong> — {rec.sedeName} (
                                  {rec.locationArea}) · Entrenador:{' '}
                                  <strong>{rec.trainerName}</strong>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 font-mono tabular-nums">
                                  <span>
                                    GPS:{' '}
                                    {rec.checkInGps.isWithinGeofence
                                      ? 'En Geocerca'
                                      : 'Fuera de Rango'}{' '}
                                    ({formatDistance(rec.checkInGps.distanceToSedeMeters)})
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{rec.attendeesCount} asistentes</span>
                                  {rec.facialVerification && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>
                                        Biometría:{' '}
                                        {rec.facialVerification.confidenceScore.toFixed(1)}%
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 self-end lg:self-center shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxState({ record: rec, slot: 'entry' })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                title="Visualizar fotografías de evidencia en pantalla completa"
                              >
                                <Eye className="w-3.5 h-3.5 text-red-600" />
                                <span>Ver Fotos</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setSelectedRecordForAudit(rec)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                title="Abrir acta oficial, imprimir o auditar en Firestore"
                              >
                                <FileText className="w-3.5 h-3.5 text-slate-600" />
                                <span>Acta</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleDownloadSingleRecordPdf(rec)}
                                disabled={singlePdfRecordId === rec.id}
                                className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                title="Descargar acta individual en PDF"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>{singlePdfRecordId === rec.id ? '...' : 'PDF'}</span>
                              </button>

                              {confirmDeleteKey === `evidences:${rec.id}` ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDocument('evidences', rec.id)}
                                    className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(`evidences:${rec.id}`)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 cursor-pointer"
                                  title="Eliminar evidencia de /records"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* LIST: PERSONNEL */}
                {activeCategory === 'personnel' && (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {filteredPersonnel.map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 bg-white hover:bg-slate-50/80 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5 text-xs">
                          <div className="font-bold text-slate-900">{p.fullName}</div>
                          <div className="text-slate-600 font-mono tabular-nums">
                            {p.phone} • {p.email}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatAddressInline(p.address)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingIdByCat((prev) => ({ ...prev, personnel: p.id }));
                              setPersonnelForm({
                                fullName: p.fullName,
                                phone: p.phone,
                                email: p.email,
                                address: { ...p.address },
                              });
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDocument('personnel', p.id)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* LIST: CLIENTS */}
                {activeCategory === 'clients' && (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {filteredClients.map((c) => (
                      <div
                        key={c.id}
                        className="p-3.5 bg-white hover:bg-slate-50/80 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5 text-xs">
                          <div className="font-bold text-slate-900">
                            {c.fullName}{' '}
                            {c.company && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 ml-1">
                                {c.company}
                              </span>
                            )}
                          </div>
                          <div className="text-slate-600 font-mono tabular-nums">
                            {c.phone} • {c.email}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatAddressInline(c.address)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingIdByCat((prev) => ({ ...prev, clients: c.id }));
                              setClientForm({
                                fullName: c.fullName,
                                phone: c.phone,
                                email: c.email,
                                company: c.company,
                                address: { ...c.address },
                              });
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDocument('clients', c.id)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modales de Visualización de Evidencias, Acta Oficial e Impresión/PDF */}
      <EvidencePhotoLightbox
        record={lightboxState?.record || null}
        initialSlot={lightboxState?.slot || 'entry'}
        onClose={() => setLightboxState(null)}
        onOpenFullCertificate={(rec) => {
          setLightboxState(null);
          setSelectedRecordForAudit(rec);
        }}
      />

      <PdfEvidenceLogModal
        isOpen={isEvidencePdfModalOpen}
        onClose={() => setIsEvidencePdfModalOpen(false)}
        records={filteredRecords}
        filterSummaryLabel={evidenceSummaryLabel}
        companies={directoryCompaniesWithSedes}
        trainers={trainersList}
        onInspectPhoto={(rec, slot) => {
          setIsEvidencePdfModalOpen(false);
          setLightboxState({ record: rec, slot });
        }}
      />

      {selectedRecordForAudit && (
        <RecordDetailModal
          record={selectedRecordForAudit}
          onClose={() => setSelectedRecordForAudit(null)}
          onUpdateRecord={(updated) => void handleAuditRecordSave(updated)}
        />
      )}
    </div>
  );
};

export const PersonnelRegistryView: React.FC<PersonnelRegistryViewProps> = ({
  embeddedInAdmin = false,
  onNavigateView,
  onExitEmbeddedDirectory,
}) => {
  const {
    user,
    authReady,
    isAuthenticated,
    isAdminUser,
    isSigningIn,
    authError,
    clearAuthError,
    signInWithGoogle,
    signOutDirectory,
  } = useDirectoryAuth();

  if (!authReady) {
    return (
      <div
        className={
          embeddedInAdmin
            ? 'py-10 flex items-center justify-center'
            : 'max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex items-center justify-center'
        }
      >
        <div className="bg-white border border-slate-200 rounded-2xl p-8 w-full text-center space-y-3 shadow-sm">
          <RefreshCw className="w-6 h-6 text-red-600 animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-900">
            Verificando credenciales de acceso al Directorio...
          </p>
          <p className="text-xs text-slate-500">
            Conectando con el servicio de autenticación de BSCW Check.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    const isUnverifiedAccount = Boolean(user && !user.emailVerified);

    return (
      <div
        className={
          embeddedInAdmin
            ? 'py-4'
            : 'max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12'
        }
      >
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-slate-900 px-6 py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Autenticación Requerida — Directorio
                </h2>
                <p className="text-xs text-slate-300">
                  Módulo maestro de base de datos, expedientes de personal y clientes
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-white text-[11px] font-semibold border border-white/15">
              <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
              Acceso Protegido
            </span>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <p className="font-semibold text-slate-900">
                Inicia sesión con una cuenta de Google verificada para consultar o modificar el Directorio en Cloud Firestore.
              </p>
              <p>
                Los módulos operativos de{' '}
                <strong className="text-slate-900">Entrenador</strong> y{' '}
                <strong className="text-slate-900">Panel Administrativo</strong> mantienen{' '}
                <span className="text-emerald-700 font-bold">acceso libre sin inicio de sesión</span>.
              </p>
            </div>

            {isUnverifiedAccount && (
              <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 text-xs text-amber-900 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Correo electrónico pendiente de verificación</p>
                    <p className="mt-0.5">
                      La cuenta <span className="font-mono">{user?.email}</span> no tiene el correo verificado. Utiliza una cuenta de Google verificada ({BOOTSTRAPPED_ADMIN_EMAIL} u otra cuenta autorizada).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void signOutDirectory()}
                  className="px-2.5 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-200 text-amber-950 font-bold shrink-0 cursor-pointer"
                >
                  Cambiar cuenta
                </button>
              </div>
            )}

            {authError && (
              <div className="rounded-xl bg-rose-50 border border-rose-300 px-4 py-3 text-xs text-rose-900 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{authError}</span>
                </div>
                <button
                  type="button"
                  onClick={clearAuthError}
                  className="text-rose-700 hover:text-rose-950 font-bold shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                disabled={isSigningIn}
                className="flex-1 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-extrabold flex items-center justify-center gap-2.5 shadow-sm transition cursor-pointer"
              >
                {isSigningIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Conectando con Google...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Iniciar sesión con Google</span>
                  </>
                )}
              </button>

              {embeddedInAdmin && onExitEmbeddedDirectory && (
                <button
                  type="button"
                  onClick={onExitEmbeddedDirectory}
                  className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4 text-slate-600" />
                  <span>Volver a Reportes (Acceso Libre)</span>
                </button>
              )}
            </div>

            {!embeddedInAdmin && onNavigateView && (
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  ¿Deseas operar sin iniciar sesión?
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateView('trainer')}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-red-600" />
                    <span>Ir a Entrenador (Libre)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateView('admin')}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Ir a Panel Admin (Libre)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <PersonnelRegistryWorkspace
      embeddedInAdmin={embeddedInAdmin}
      authenticatedUser={user}
      isAdminUser={isAdminUser}
      onSignOut={signOutDirectory}
    />
  );
};

