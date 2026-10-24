import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Briefcase,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Compass,
  Database,
  DownloadCloud,
  Edit3,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserCircle2,
  Users,
} from 'lucide-react';
import {
  db,
  FIRESTORE_MIN_CREATED_AT,
  getAutoDeviceMetadata,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  FirestoreClientRecord,
  FirestoreDemoCompanyRecord,
  FirestoreDirectoryCategory,
  FirestoreSedeRecord,
  FirestoreTrainerRecord,
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
  deleteCompanyAndSedesFromFirestore,
  seedDemoDataToFirestore,
} from '../utils/firestoreDemoSync';
import { getCurrentPositionAsync } from '../utils/geo';

const PRESET_SPECIALTIES = [
  'Pausas Activas',
  'Entrenamiento Funcional',
  'Ergonomía Laboral',
  'Yoga Corporativo',
  'Pilates Mat',
  'Mindfulness y Respiración',
  'HIIT & Cardio',
  'Zumba / Ritmos Latinos',
  'Movilidad Articular',
  'Tonificación con Bandas',
  'Gimnasia Cerebral',
];

const SEDE_COLOR_TAGS: { value: string; label: string; dotClass: string }[] = [
  { value: 'bg-red-600', label: 'Rojo BSCW', dotClass: 'bg-red-600' },
  { value: 'bg-blue-600', label: 'Azul Corporativo', dotClass: 'bg-blue-600' },
  { value: 'bg-emerald-600', label: 'Verde Salud', dotClass: 'bg-emerald-600' },
  { value: 'bg-amber-600', label: 'Ámbar Operativo', dotClass: 'bg-amber-600' },
  { value: 'bg-slate-800', label: 'Pizarra Ejecutiva', dotClass: 'bg-slate-800' },
];

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
    description: 'Empresa, dirección, ciudad, GPS (lat/lng), geocerca (m), contacto, puesto, teléfono y etiqueta.',
    isDemoCore: true,
    icon: MapPin,
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
        const size = 280;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
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
}

export const PersonnelRegistryView: React.FC<PersonnelRegistryViewProps> = ({
  embeddedInAdmin = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<FirestoreDirectoryCategory>('trainers');

  // Form states per collection
  const [trainerForm, setTrainerForm] = useState<TrainerFormInput>(EMPTY_TRAINER_FORM);
  const [customSpecialty, setCustomSpecialty] = useState<string>('');
  const [companyForm, setCompanyForm] = useState<DemoCompanyFormInput>(EMPTY_COMPANY_FORM);
  const [sedeForm, setSedeForm] = useState<SedeFormInput>(EMPTY_SEDE_FORM);
  const [personnelForm, setPersonnelForm] = useState<PersonnelFormInput>(EMPTY_PERSONNEL_FORM);
  const [clientForm, setClientForm] = useState<ClientFormInput>(EMPTY_CLIENT_FORM);

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
    personnel: false,
    clients: false,
  });

  const [editingIdByCat, setEditingIdByCat] = useState<
    Record<FirestoreDirectoryCategory, string | null>
  >({
    trainers: null,
    companies: null,
    sedes: null,
    personnel: null,
    clients: null,
  });

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSeedingDemo, setIsSeedingDemo] = useState<boolean>(false);
  const [gettingSedeGps, setGettingSedeGps] = useState<boolean>(false);

  const [saveFeedback, setSaveFeedback] = useState<{
    category: FirestoreDirectoryCategory;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Firestore real-time collection lists
  const [trainersList, setTrainersList] = useState<FirestoreTrainerRecord[]>([]);
  const [companiesList, setCompaniesList] = useState<FirestoreDemoCompanyRecord[]>([]);
  const [sedesList, setSedesList] = useState<FirestoreSedeRecord[]>([]);
  const [personnelList, setPersonnelList] = useState<PersonnelRecord[]>([]);
  const [clientsList, setClientsList] = useState<FirestoreClientRecord[]>([]);

  const [loadingByCat, setLoadingByCat] = useState<Record<FirestoreDirectoryCategory, boolean>>({
    trainers: false,
    companies: false,
    sedes: false,
    personnel: false,
    clients: false,
  });

  const [searchByCat, setSearchByCat] = useState<Record<FirestoreDirectoryCategory, string>>({
    trainers: '',
    companies: '',
    sedes: '',
    personnel: '',
    clients: '',
  });

  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [fatalFirestoreError, setFatalFirestoreError] = useState<Error | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  if (fatalFirestoreError) {
    throw fatalFirestoreError;
  }

  // Real-time automatic listeners for all 5 collections (no login required)
  useEffect(() => {
    setLoadingByCat({
      trainers: true,
      companies: true,
      sedes: true,
      personnel: true,
      clients: true,
    });

    const mkQuery = (colName: string) =>
      query(collection(db, colName), where('createdAt', '>=', FIRESTORE_MIN_CREATED_AT));

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
      mkQuery('personnel'),
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
      mkQuery('clients'),
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

    return () => {
      unsubTrainers();
      unsubCompanies();
      unsubSedes();
      unsubPersonnel();
      unsubClients();
    };
  }, []);

  // Keep default selected company in Sede form synchronized when companiesList updates
  useEffect(() => {
    if (!editingIdByCat.sedes && companiesList.length > 0) {
      const exists = companiesList.some((c) => c.id === sedeForm.companyId);
      if (!exists) {
        setSedeForm((prev) => ({
          ...prev,
          companyId: companiesList[0].id,
          companyName: companiesList[0].name,
        }));
      }
    }
  }, [companiesList, editingIdByCat.sedes, sedeForm.companyId]);

  const trainerValidation = useMemo(() => validateTrainerInput(trainerForm), [trainerForm]);
  const companyValidation = useMemo(() => validateDemoCompanyInput(companyForm), [companyForm]);
  const sedeValidation = useMemo(() => validateSedeInput(sedeForm), [sedeForm]);
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
    personnel: personnelList.length,
    clients: clientsList.length,
  };

  const totalDocumentsCount =
    trainersList.length +
    companiesList.length +
    sedesList.length +
    personnelList.length +
    clientsList.length;

  const handleSeedDemoData = async () => {
    setIsSeedingDemo(true);
    setSaveFeedback(null);
    try {
      const res = await seedDemoDataToFirestore();
      const totalAdded =
        res.trainersCount + res.companiesCount + res.sedesCount + res.assignmentsCount;
      setSaveFeedback({
        category: activeCategory,
        type: 'success',
        message:
          totalAdded > 0
            ? `Datos demo sincronizados en Firestore: ${res.trainersCount} entrenadores, ${res.companiesCount} empresas, ${res.sedesCount} sedes y ${res.assignmentsCount} asignaciones.`
            : 'Todos los entrenadores, empresas, sedes y asignaciones del demo ya están sincronizados en Firestore.',
      });
    } catch (err) {
      setFatalFirestoreError(err as Error);
    } finally {
      setIsSeedingDemo(false);
    }
  };

  const resetCategoryForm = (cat: FirestoreDirectoryCategory) => {
    if (cat === 'trainers') {
      setTrainerForm({ ...EMPTY_TRAINER_FORM });
      setTrainerTouched({});
      setCustomSpecialty('');
    } else if (cat === 'companies') {
      setCompanyForm({ ...EMPTY_COMPANY_FORM });
      setCompanyTouched({});
    } else if (cat === 'sedes') {
      const defaultComp = companiesList[0];
      setSedeForm({
        ...EMPTY_SEDE_FORM,
        companyId: defaultComp ? defaultComp.id : '',
        companyName: defaultComp ? defaultComp.name : '',
      });
      setSedeTouched({});
    } else if (cat === 'personnel') {
      setPersonnelForm({ ...EMPTY_PERSONNEL_FORM, address: { ...EMPTY_ADDRESS } });
      setPersonnelTouched({});
    } else {
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

    const meta = getAutoDeviceMetadata();

    setIsSaving(true);
    const { sanitized } = check;
    const editingId = editingIdByCat.trainers;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'trainers', editingId), {
          name: sanitized.name,
          email: sanitized.email,
          phone: sanitized.phone,
          avatar: sanitized.avatar,
          specialties: sanitized.specialties,
          active: sanitized.active,
          updatedAt: serverTimestamp(),
        });
        resetCategoryForm('trainers');
        setSaveFeedback({
          category: 'trainers',
          type: 'success',
          message: `Entrenador "${sanitized.name}" actualizado en /trainers.`,
        });
      } else {
        const newRef = doc(collection(db, 'trainers'));
        await setDoc(newRef, {
          name: sanitized.name,
          email: sanitized.email,
          phone: sanitized.phone,
          avatar: sanitized.avatar,
          specialties: sanitized.specialties,
          active: sanitized.active,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resetCategoryForm('trainers');
        setSaveFeedback({
          category: 'trainers',
          type: 'success',
          message: `Entrenador "${sanitized.name}" guardado en /trainers.`,
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(
          error,
          editingId ? OperationType.UPDATE : OperationType.CREATE,
          editingId ? `trainers/${editingId}` : 'trainers'
        );
      } catch (structuredErr) {
        setFatalFirestoreError(structuredErr as Error);
      }
    } finally {
      setIsSaving(false);
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

    const meta = getAutoDeviceMetadata();

    setIsSaving(true);
    const { sanitized } = check;
    const editingId = editingIdByCat.companies;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'companies', editingId), {
          name: sanitized.name,
          taxId: sanitized.taxId,
          industry: sanitized.industry,
          logoText: sanitized.logoText,
          updatedAt: serverTimestamp(),
        });
        resetCategoryForm('companies');
        setSaveFeedback({
          category: 'companies',
          type: 'success',
          message: `Empresa "${sanitized.name}" actualizada en /companies.`,
        });
      } else {
        const newRef = doc(collection(db, 'companies'));
        await setDoc(newRef, {
          name: sanitized.name,
          taxId: sanitized.taxId,
          industry: sanitized.industry,
          logoText: sanitized.logoText,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resetCategoryForm('companies');
        setSaveFeedback({
          category: 'companies',
          type: 'success',
          message: `Empresa "${sanitized.name}" guardada en /companies.`,
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(
          error,
          editingId ? OperationType.UPDATE : OperationType.CREATE,
          editingId ? `companies/${editingId}` : 'companies'
        );
      } catch (structuredErr) {
        setFatalFirestoreError(structuredErr as Error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitSede = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttemptedByCat((prev) => ({ ...prev, sedes: true }));
    setSedeTouched(ALL_SEDE_TOUCHED);
    setSaveFeedback(null);

    const check = validateSedeInput(sedeForm);
    if (!check.isValid) {
      setSaveFeedback({
        category: 'sedes',
        type: 'error',
        message: 'Revisa los campos obligatorios de la sede (empresa, dirección, GPS, geocerca y contacto).',
      });
      return;
    }

    const meta = getAutoDeviceMetadata();

    setIsSaving(true);
    const { sanitized } = check;
    const editingId = editingIdByCat.sedes;

    const basePayload: Record<string, unknown> = {
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
      updatedAt: serverTimestamp(),
    };
    if (sanitized.colorTag) {
      basePayload.colorTag = sanitized.colorTag;
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'sedes', editingId), basePayload);
        resetCategoryForm('sedes');
        setSaveFeedback({
          category: 'sedes',
          type: 'success',
          message: `Sede "${sanitized.name}" actualizada en /sedes.`,
        });
      } else {
        const newRef = doc(collection(db, 'sedes'));
        await setDoc(newRef, {
          ...basePayload,
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
          createdAt: serverTimestamp(),
        });
        resetCategoryForm('sedes');
        setSaveFeedback({
          category: 'sedes',
          type: 'success',
          message: `Sede "${sanitized.name}" guardada en /sedes con geocerca de ${sanitized.geofenceRadiusMeters}m.`,
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(
          error,
          editingId ? OperationType.UPDATE : OperationType.CREATE,
          editingId ? `sedes/${editingId}` : 'sedes'
        );
      } catch (structuredErr) {
        setFatalFirestoreError(structuredErr as Error);
      }
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

    const meta = getAutoDeviceMetadata();

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
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
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

    const meta = getAutoDeviceMetadata();

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
          createdByUid: meta.createdByUid,
          createdByEmail: meta.createdByEmail,
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
    const path = `${cat}/${id}`;
    try {
      if (cat === 'companies') {
        await deleteCompanyAndSedesFromFirestore(id);
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
            ? 'Empresa y sus sedes vinculadas eliminadas de Firestore.'
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

  const handleTrainerImageUpload = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setTrainerForm((prev) => ({ ...prev, avatar: dataUrl }));
      setTrainerTouched((prev) => ({ ...prev, avatar: true }));
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
      {/* Top Bar: Firestore Status, Demo Seed Action & Google Auth */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="w-5 h-5 text-red-600 shrink-0" />
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              Base de Datos Cloud Firestore — Entrenadores, Empresas y Sedes
            </h2>
            <span className="text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              {totalDocumentsCount} registros
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Esquema sincronizado con todos los campos del demo (especialidades, fotografía, RFC, industria, siglas, geocerca GPS y contactos de sede).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>Conexión automática · Multi-dispositivo</span>
          </div>

          <button
            type="button"
            onClick={handleSeedDemoData}
            disabled={isSeedingDemo}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            title="Sincronizar los entrenadores, empresas, sedes y asignaciones iniciales del demo en Cloud Firestore"
          >
            <DownloadCloud className="w-4 h-4 text-red-400" />
            <span>{isSeedingDemo ? 'Sincronizando demo...' : 'Sincronizar Datos del Demo'}</span>
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    {editingIdByCat[activeCategory]
                      ? `Editar ${activeCategoryMeta.singularLabel}`
                      : `Registrar ${activeCategoryMeta.singularLabel}`}
                  </h3>
                  <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {activeCategoryMeta.collectionPath}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{activeCategoryMeta.description}</p>
              </div>

              {editingIdByCat[activeCategory] && (
                <button
                  type="button"
                  onClick={() => resetCategoryForm(activeCategory)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Cancelar edición</span>
                </button>
              )}
            </div>

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
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    handleTrainerImageUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />

                {/* Avatar + Name/Email/Phone */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                    <label className="block text-xs font-bold text-slate-800">
                      Fotografía / Avatar Biométrico *
                    </label>
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
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-red-600" />
                          <span>Subir Foto</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-red-600" />
                          <span>Cámara</span>
                        </button>
                      </div>
                    </div>
                    <div>
                      <input
                        type="url"
                        value={trainerForm.avatar.startsWith('data:') ? '' : trainerForm.avatar}
                        onChange={(e) => {
                          const val = e.target.value;
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
                    <label className="text-xs font-bold text-slate-800">
                      Especialidades y Disciplinas (`specialties`) *
                    </label>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {trainerForm.specialties.length} / {DIRECTORY_LIMITS.specialtiesCount.max}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    {Array.from(new Set([...PRESET_SPECIALTIES, ...trainerForm.specialties])).map(
                      (spec) => {
                        const selected = trainerForm.specialties.includes(spec);
                        return (
                          <button
                            key={spec}
                            type="button"
                            onClick={() => toggleTrainerSpecialty(spec)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                              selected
                                ? 'bg-red-600 text-white'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {selected && <Check className="w-3 h-3" />}
                            <span>{spec}</span>
                          </button>
                        );
                      }
                    )}
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
                      placeholder="Agregar especialidad personalizada..."
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-red-600"
                    />
                    <button
                      type="button"
                      onClick={addCustomTrainerSpecialty}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1"
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
                {companiesList.length === 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Para registrar una sede primero debes tener al menos una empresa en{' '}
                      <strong className="font-mono">/companies</strong> o importar las empresas del demo.
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveCategory('companies')}
                      className="px-3 py-1.5 rounded-lg bg-amber-800 text-white font-bold text-[11px]"
                    >
                      Ir a Empresas
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Empresa a la que Pertenece (`companyId`) *
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
                      {companiesList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.taxId})
                        </option>
                      ))}
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

                {/* Contact fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Contacto en Sede (`contactPerson`) *
                    </label>
                    <input
                      type="text"
                      value={sedeForm.contactPerson}
                      onChange={(e) =>
                        setSedeForm((prev) => ({ ...prev, contactPerson: e.target.value }))
                      }
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, contactPerson: true }))}
                      placeholder="Lic. Laura Peñaloza"
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
                      Cargo / Rol (`contactRole`) *
                    </label>
                    <input
                      type="text"
                      value={sedeForm.contactRole}
                      onChange={(e) =>
                        setSedeForm((prev) => ({ ...prev, contactRole: e.target.value }))
                      }
                      onBlur={() => setSedeTouched((prev) => ({ ...prev, contactRole: true }))}
                      placeholder="Gerente de Bienestar y SST"
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
                      Teléfono Directo (`contactPhone`) *
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
              <div className="py-10 text-center space-y-3">
                <p className="text-xs text-slate-600">
                  Aún no hay documentos en <strong className="font-mono">{activeCategoryMeta.collectionPath}</strong>.
                </p>
                {activeCategoryMeta.isDemoCore && (
                  <button
                    type="button"
                    onClick={handleSeedDemoData}
                    disabled={isSeedingDemo}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <DownloadCloud className="w-4 h-4 text-red-400" />
                    <span>
                      {isSeedingDemo
                        ? 'Importando...'
                        : 'Cargar Entrenadores, Empresas y Sedes del Demo'}
                    </span>
                  </button>
                )}
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
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
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
                      const linkedSedesCount = sedesList.filter(
                        (s) => s.companyId === comp.id
                      ).length;
                      return (
                        <div
                          key={comp.id}
                          className="p-3.5 bg-white hover:bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                        >
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
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCategory('sedes');
                                    setSedeForm((prev) => ({
                                      ...prev,
                                      companyId: comp.id,
                                      companyName: comp.name,
                                    }));
                                  }}
                                  className="text-red-600 font-semibold hover:underline font-mono tabular-nums"
                                >
                                  {linkedSedesCount} sedes vinculadas →
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
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
    </div>
  );
};
