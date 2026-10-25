import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  getStoredCompanies,
  getStoredRecords,
  getStoredTrainers,
  getStoredAssignments,
  getStoredActivityCatalog,
  saveStoredCompanies,
  saveStoredRecords,
  saveStoredTrainers,
  saveStoredAssignments,
  saveStoredActivityCatalog,
  resetAllDataToDefault,
} from './data/mockData';
import {
  AttendanceRecord,
  Company,
  Sede,
  Trainer,
  ClassAssignment,
  ActivityCatalogItem,
  TrainerBiometricSession,
} from './types';
import { Header } from './components/Header';
import { TrainerCheckInView } from './components/TrainerCheckInView';
import { TrainerFacialLoginView } from './components/TrainerFacialLoginView';
import { AdminDashboard } from './components/AdminDashboard';
import { PersonnelRegistryView } from './components/PersonnelRegistryView';
import { FirestoreErrorBoundary } from './components/FirestoreErrorBoundary';
import {
  getSessionAlarmStatus,
  releaseSessionWakeLock,
  stopAlarmAudioImmediately,
  unlockMobileAlarmAudio,
} from './utils/sessionAlarm';
import {
  doesAssignmentApplyToDate,
  findMatchingAssignmentForRecord,
  findMatchingRecordForAssignmentDate,
  formatLocalYYYYMMDD,
  getAssignmentScheduledWindowMs,
  markAssignmentDateNonCompliant,
  toggleAssignmentDateLock,
} from './utils/assignmentLock';
import {
  db,
  FIRESTORE_MIN_CREATED_AT,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { useDirectoryAuth } from './hooks/useDirectoryAuth';
import {
  deleteActivityCatalogItemFromFirestore,
  deleteAssignmentFromFirestore,
  deleteCompanyAndSedesFromFirestore,
  deleteRecordFromFirestore,
  deleteSedeFromFirestore,
  deleteTrainerFromFirestore,
  normalizeHHMM,
  parseFirestoreAttendanceRecord,
  saveActivityCatalogItemToFirestore,
  saveAssignmentToFirestore,
  saveCompanyToFirestore,
  saveRecordToFirestore,
  saveSedeToFirestore,
  saveTrainerToFirestore,
  seedDemoDataToFirestore,
  syncDataSetsToFirestore,
  syncWorkspaceDataToFirestore,
  toSafeDocId,
} from './utils/firestoreDemoSync';
import { deriveCompanyLogoText, generateInitialsAvatarDataUrl } from './utils/personnelValidation';
import { ShieldCheck, CheckCheck, AlertTriangle } from 'lucide-react';

const TRAINER_SESSION_STORAGE_KEY = 'bscw_trainer_biometric_session_v1';

function readStoredTrainerSession(): TrainerBiometricSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(TRAINER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TrainerBiometricSession>;
    if (
      typeof parsed?.trainerId === 'string' &&
      parsed.trainerId.trim().length > 0 &&
      typeof parsed?.trainerName === 'string' &&
      typeof parsed?.confidenceScore === 'number' &&
      typeof parsed?.biometricId === 'string' &&
      typeof parsed?.authenticatedAt === 'string' &&
      typeof parsed?.authenticatedIso === 'string'
    ) {
      return parsed as TrainerBiometricSession;
    }
    return null;
  } catch {
    return null;
  }
}

function updateStateIfChanged<T>(
  setter: React.Dispatch<React.SetStateAction<T>>,
  nextValue: T,
  onChanged?: (val: T) => void
) {
  setter((prev) => {
    if (JSON.stringify(prev) === JSON.stringify(nextValue)) {
      return prev;
    }
    onChanged?.(nextValue);
    return nextValue;
  });
}

function checkIsMobileOrTablet(): boolean {
  if (typeof window === 'undefined') return false;
  const isTabletOrMobileWidth = window.innerWidth < 1024;
  const isTouchTabletDevice =
    window.innerWidth <= 1366 &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return isTabletOrMobileWidth || isTouchTabletDevice;
}

export default function App() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [activityCatalog, setActivityCatalog] = useState<ActivityCatalogItem[]>([]);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState<boolean>(() =>
    checkIsMobileOrTablet()
  );
  const [currentView, setCurrentView] = useState<'trainer' | 'personnel' | 'admin'>('trainer');
  const [trainerSession, setTrainerSession] = useState<TrainerBiometricSession | null>(() =>
    readStoredTrainerSession()
  );
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [initialCalendarReady, setInitialCalendarReady] = useState<boolean>(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);

  const { isAuthenticated: isDirectoryAuthenticated, user: directoryUser } = useDirectoryAuth();

  const autoSeedTriggeredRef = useRef<boolean>(false);
  const reconciledInitialAssignmentsRef = useRef<boolean>(false);
  const reconciledInitialRecordsRef = useRef<boolean>(false);
  const pendingSedesByIdRef = useRef<Map<string, Sede>>(new Map());
  const pendingAssignmentsByIdRef = useRef<Map<string, ClassAssignment>>(new Map());
  const inFlightAssignmentWritesRef = useRef<Map<string, number>>(new Map());
  const deletedAssignmentIdsRef = useRef<Set<string>>(new Set());
  const pendingRecordsByIdRef = useRef<Map<string, AttendanceRecord>>(new Map());
  const inFlightRecordWritesRef = useRef<Map<string, number>>(new Map());
  const deletedRecordIdsRef = useRef<Set<string>>(new Set());
  const trainersRef = useRef<Trainer[]>([]);
  const companiesRef = useRef<Company[]>([]);
  const assignmentsRef = useRef<ClassAssignment[]>([]);
  const activityCatalogRef = useRef<ActivityCatalogItem[]>([]);
  const recordsRef = useRef<AttendanceRecord[]>([]);

  useEffect(() => {
    trainersRef.current = trainers;
  }, [trainers]);

  useEffect(() => {
    companiesRef.current = companies;
  }, [companies]);

  useEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

  useEffect(() => {
    activityCatalogRef.current = activityCatalog;
  }, [activityCatalog]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const resolveAssignmentParents = useCallback((asg: ClassAssignment, companyPool?: Company[]) => {
    const pool = companyPool ?? companiesRef.current;
    const targetCompId = toSafeDocId(asg.companyId, 'comp');
    const targetSedeId = toSafeDocId(asg.sedeId, 'sede');
    const parentComp = pool.find(
      (c) => c.id === asg.companyId || toSafeDocId(c.id, 'comp') === targetCompId
    );
    const parentSede = parentComp?.sedes.find(
      (s) => s.id === asg.sedeId || toSafeDocId(s.id, 'sede') === targetSedeId
    );
    return { parentComp, parentSede };
  }, []);

  const persistAssignmentToFirestore = useCallback(
    (rawAssignment: ClassAssignment, companyPool?: Company[]) => {
      const safeId = toSafeDocId(rawAssignment.id, 'asg');
      const normalized: ClassAssignment = {
        ...rawAssignment,
        id: safeId,
        time: normalizeHHMM(rawAssignment.time, '09:00'),
      };

      deletedAssignmentIdsRef.current.delete(safeId);
      pendingAssignmentsByIdRef.current.set(safeId, normalized);
      inFlightAssignmentWritesRef.current.set(
        safeId,
        (inFlightAssignmentWritesRef.current.get(safeId) || 0) + 1
      );

      const { parentComp, parentSede } = resolveAssignmentParents(normalized, companyPool);

      void saveAssignmentToFirestore(normalized, parentComp, parentSede)
        .then(() => {
          setSyncErrorMessage(null);
        })
        .catch((err) => {
          console.error(err);
          setSyncErrorMessage(
            'No se pudo guardar una asignación en la base de datos. Verifica tu conexión.'
          );
        })
        .finally(() => {
          const remaining = (inFlightAssignmentWritesRef.current.get(safeId) || 1) - 1;
          if (remaining <= 0) {
            inFlightAssignmentWritesRef.current.delete(safeId);
            pendingAssignmentsByIdRef.current.delete(safeId);
          } else {
            inFlightAssignmentWritesRef.current.set(safeId, remaining);
          }
        });

      return normalized;
    },
    [resolveAssignmentParents]
  );

  const persistRecordToFirestore = useCallback((rawRecord: AttendanceRecord) => {
    const safeId = toSafeDocId(rawRecord.id, 'rec');
    const normalized: AttendanceRecord = {
      ...rawRecord,
      id: safeId,
      scheduledTime: normalizeHHMM(rawRecord.scheduledTime, '09:00'),
    };

    deletedRecordIdsRef.current.delete(safeId);
    pendingRecordsByIdRef.current.set(safeId, normalized);
    inFlightRecordWritesRef.current.set(
      safeId,
      (inFlightRecordWritesRef.current.get(safeId) || 0) + 1
    );

    void saveRecordToFirestore(normalized)
      .then(() => {
        setSyncErrorMessage(null);
      })
      .catch((err) => {
        console.error(err);
        setSyncErrorMessage(
          'No se pudo guardar un registro de la bitácora de evidencias en Firestore. Verifica tu conexión.'
        );
      })
      .finally(() => {
        const remaining = (inFlightRecordWritesRef.current.get(safeId) || 1) - 1;
        if (remaining <= 0) {
          inFlightRecordWritesRef.current.delete(safeId);
          pendingRecordsByIdRef.current.delete(safeId);
        } else {
          inFlightRecordWritesRef.current.set(safeId, remaining);
        }
      });

    return normalized;
  }, []);

  const handleTrainerSessionAuthenticated = useCallback((session: TrainerBiometricSession) => {
    setTrainerSession(session);
    try {
      window.sessionStorage.setItem(TRAINER_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore sessionStorage quota issues
    }
  }, []);

  const handleLogoutTrainerSession = useCallback(() => {
    stopAlarmAudioImmediately();
    void releaseSessionWakeLock();
    setTrainerSession(null);
    try {
      window.sessionStorage.removeItem(TRAINER_SESSION_STORAGE_KEY);
    } catch {
      // Ignore sessionStorage errors
    }
  }, []);

  // Slow root compliance tick (15s) to prevent whole-app re-render flicker; active timers run locally in child views
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 15000);
    const onWakeOrFocus = () => {
      if (document.visibilityState === 'visible') {
        setNowTick(Date.now());
      }
    };
    document.addEventListener('visibilitychange', onWakeOrFocus);
    window.addEventListener('focus', onWakeOrFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWakeOrFocus);
      window.removeEventListener('focus', onWakeOrFocus);
    };
  }, []);

  // Unlock mobile HTML5 <audio> + Web Audio API silently on any direct touch/click gesture
  useEffect(() => {
    const handleGestureUnlock = () => {
      unlockMobileAlarmAudio();
    };
    window.addEventListener('touchstart', handleGestureUnlock, { passive: true });
    window.addEventListener('pointerdown', handleGestureUnlock, { passive: true });
    window.addEventListener('click', handleGestureUnlock, { passive: true });
    window.addEventListener('keydown', handleGestureUnlock, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleGestureUnlock);
      window.removeEventListener('pointerdown', handleGestureUnlock);
      window.removeEventListener('click', handleGestureUnlock);
      window.removeEventListener('keydown', handleGestureUnlock);
    };
  }, []);

  // Initial load from local storage / demo seed
  useEffect(() => {
    const loadedRecords = getStoredRecords();
    const loadedCompanies = getStoredCompanies();
    const loadedTrainers = getStoredTrainers();
    const loadedAssignments = getStoredAssignments();
    const loadedCatalog = getStoredActivityCatalog();

    companiesRef.current = loadedCompanies;
    setRecords(loadedRecords);
    setCompanies(loadedCompanies);
    setTrainers(loadedTrainers);
    setAssignments(loadedAssignments);
    setActivityCatalog(loadedCatalog);
  }, []);

  // If a stored biometric session belongs to an inactive or deleted trainer once trainers load, invalidate it
  useEffect(() => {
    if (!trainerSession || trainers.length === 0) return;
    const match = trainers.find((t) => t.id === trainerSession.trainerId && t.active !== false);
    if (!match) {
      handleLogoutTrainerSession();
    }
  }, [trainerSession, trainers, handleLogoutTrainerSession]);

  // Automatic real-time Firestore connection from any device without login
  useEffect(() => {
    const mkQuery = (colName: string) =>
      query(collection(db, colName), where('createdAt', '>=', FIRESTORE_MIN_CREATED_AT));

    let latestFsCompanies: Omit<Company, 'sedes'>[] | null = null;
    let latestFsSedes: Sede[] | null = null;
    const initialLocalTrainers = getStoredTrainers();
    const initialLocalCompanies = getStoredCompanies();
    const initialLocalCatalog = getStoredActivityCatalog();
    const initialLocalAssignments = getStoredAssignments();
    const initialLocalRecords = getStoredRecords();

    const serverSeen = {
      trainers: false,
      companies: false,
      sedes: false,
      assignments: false,
      records: false,
      catalog: false,
    };

    const serverEmpty = {
      trainers: false,
      companies: false,
      sedes: false,
      assignments: false,
      records: false,
      catalog: false,
    };

    const checkCalendarReady = () => {
      if (serverSeen.assignments && serverSeen.records) {
        setInitialCalendarReady(true);
      }
    };

    const maybeReconcileEmptyServerCollections = () => {
      if (autoSeedTriggeredRef.current) return;
      const allSeen =
        serverSeen.trainers &&
        serverSeen.companies &&
        serverSeen.sedes &&
        serverSeen.assignments &&
        serverSeen.records &&
        serverSeen.catalog;
      if (!allSeen) return;

      autoSeedTriggeredRef.current = true;

      // Force full reconciliation of all operational collections with Cloud Firestore
      const trainersToForce =
        trainersRef.current.length > 0 ? trainersRef.current : initialLocalTrainers;
      const companiesToForce =
        companiesRef.current.length > 0 ? companiesRef.current : initialLocalCompanies;
      const catalogToForce =
        activityCatalogRef.current.length > 0 ? activityCatalogRef.current : initialLocalCatalog;
      const assignmentsToForce =
        assignmentsRef.current.length > 0 ? assignmentsRef.current : initialLocalAssignments;
      const recordsToForce =
        recordsRef.current.length > 0 ? recordsRef.current : initialLocalRecords;

      if (
        serverEmpty.trainers &&
        serverEmpty.companies &&
        serverEmpty.sedes &&
        serverEmpty.assignments &&
        serverEmpty.records &&
        serverEmpty.catalog
      ) {
        syncWorkspaceDataToFirestore()
          .then(() => setSyncErrorMessage(null))
          .catch(console.error);
        return;
      }

      // Only create missing documents on startup instead of rewriting every server document (prevents snapshot storms & UI flicker)
      syncDataSetsToFirestore(
        {
          trainers: trainersToForce,
          companies: companiesToForce,
          activityCatalog: catalogToForce,
          assignments: assignmentsToForce,
          records: recordsToForce,
        },
        {
          upsertAssignments: false,
          upsertCoreEntities: false,
          upsertRecords: false,
        }
      )
        .then(() => setSyncErrorMessage(null))
        .catch(console.error);
    };

    const syncCombinedCompanies = () => {
      if (!latestFsCompanies || latestFsCompanies.length === 0 || latestFsSedes === null) {
        return;
      }

      // Merge server sedes with any optimistic in-flight sedes so newly added sedes never flicker
      const mergedSedeMap = new Map<string, Sede>();
      latestFsSedes.forEach((s) => {
        mergedSedeMap.set(s.id, s);
        pendingSedesByIdRef.current.delete(s.id);
      });
      pendingSedesByIdRef.current.forEach((pendingSede, id) => {
        if (!mergedSedeMap.has(id)) {
          mergedSedeMap.set(id, pendingSede);
        }
      });

      const allMergedSedes = Array.from(mergedSedeMap.values()).sort((a, b) =>
        a.id.localeCompare(b.id)
      );
      const assembled: Company[] = [...latestFsCompanies]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((comp) => ({
          ...comp,
          sedes: allMergedSedes.filter((s) => s.companyId === comp.id),
        }));
      companiesRef.current = assembled;
      updateStateIfChanged(setCompanies, assembled, saveStoredCompanies);
    };

    const unsubTrainers = onSnapshot(
      mkQuery('trainers'),
      (snap) => {
        if (!snap.metadata.fromCache) {
          serverSeen.trainers = true;
          serverEmpty.trainers = snap.empty;
          maybeReconcileEmptyServerCollections();
        }
        if (snap.empty) return;
        const fsTrainers: Trainer[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
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
            };
          })
          .sort((a, b) => a.id.localeCompare(b.id));
        updateStateIfChanged(setTrainers, fsTrainers, saveStoredTrainers);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'trainers');
        } catch (e) {
          console.error(e);
        }
      }
    );

    const unsubCompanies = onSnapshot(
      mkQuery('companies'),
      (snap) => {
        if (!snap.metadata.fromCache) {
          serverSeen.companies = true;
          serverEmpty.companies = snap.empty;
          maybeReconcileEmptyServerCollections();
        }
        if (snap.empty) {
          latestFsCompanies = [];
          return;
        }
        latestFsCompanies = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const name = String(d.name || d.companyName || '');
          return {
            id: docSnap.id,
            name,
            taxId: String(d.taxId || ''),
            industry: String(d.industry || 'Servicios Corporativos'),
            logoText: deriveCompanyLogoText(
              name,
              typeof d.logoText === 'string' ? d.logoText : undefined
            ),
          };
        });
        syncCombinedCompanies();
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'companies');
        } catch (e) {
          console.error(e);
        }
      }
    );

    const unsubSedes = onSnapshot(
      mkQuery('sedes'),
      (snap) => {
        if (!snap.metadata.fromCache) {
          serverSeen.sedes = true;
          serverEmpty.sedes = snap.empty;
          maybeReconcileEmptyServerCollections();
        }
        latestFsSedes = snap.docs.map((docSnap) => {
          const d = docSnap.data();
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
          };
        });
        syncCombinedCompanies();
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'sedes');
        } catch (e) {
          console.error(e);
        }
      }
    );

    const unsubAssignments = onSnapshot(
      mkQuery('assignments'),
      (snap) => {
        const isServerSnapshot = !snap.metadata.fromCache;
        if (isServerSnapshot) {
          serverSeen.assignments = true;
          serverEmpty.assignments = snap.empty;
          checkCalendarReady();
          maybeReconcileEmptyServerCollections();
        }

        const fsAssignments: ClassAssignment[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
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
            time: normalizeHHMM(d.time, '09:00'),
            ...(typeof d.durationMinutes === 'number' ? { durationMinutes: d.durationMinutes } : {}),
            activityType: d.activityType === 'clase_fitness' ? 'clase_fitness' : 'pausa_activa',
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
          };
        });

        // One-time upload of any previously unsynced local assignments when Firestore already has partial data
        if (isServerSnapshot && !reconciledInitialAssignmentsRef.current && !snap.empty) {
          reconciledInitialAssignmentsRef.current = true;
          const serverIds = new Set(fsAssignments.map((a) => a.id));
          for (const localAsg of initialLocalAssignments) {
            const safeLocalId = toSafeDocId(localAsg.id, 'asg');
            if (!serverIds.has(safeLocalId) && !deletedAssignmentIdsRef.current.has(safeLocalId)) {
              persistAssignmentToFirestore(localAsg, initialLocalCompanies);
            }
          }
        }

        if (snap.empty) {
          if (
            isServerSnapshot &&
            autoSeedTriggeredRef.current &&
            pendingAssignmentsByIdRef.current.size === 0
          ) {
            reconciledInitialAssignmentsRef.current = true;
            updateStateIfChanged<ClassAssignment[]>(setAssignments, [], saveStoredAssignments);
          } else if (pendingAssignmentsByIdRef.current.size > 0) {
            const optimisticOnly = Array.from(pendingAssignmentsByIdRef.current.values()).sort(
              (a, b) => a.id.localeCompare(b.id)
            );
            updateStateIfChanged(setAssignments, optimisticOnly, saveStoredAssignments);
          }
          return;
        }

        serverEmpty.assignments = false;

        // Merge server assignments with any in-flight optimistic assignments and exclude in-flight deletes
        const mergedMap = new Map<string, ClassAssignment>();
        for (const serverAsg of fsAssignments) {
          if (deletedAssignmentIdsRef.current.has(serverAsg.id)) continue;
          const pending = pendingAssignmentsByIdRef.current.get(serverAsg.id);
          mergedMap.set(serverAsg.id, pending ?? serverAsg);
        }
        pendingAssignmentsByIdRef.current.forEach((pendingAsg, pendingId) => {
          if (!mergedMap.has(pendingId) && !deletedAssignmentIdsRef.current.has(pendingId)) {
            mergedMap.set(pendingId, pendingAsg);
          }
        });

        const mergedList = Array.from(mergedMap.values()).sort((a, b) =>
          a.id.localeCompare(b.id)
        );
        updateStateIfChanged(setAssignments, mergedList, saveStoredAssignments);
      },
      (err) => {
        setSyncErrorMessage(
          'No se pudo leer la colección de asignaciones (/assignments) en Firestore.'
        );
        try {
          handleFirestoreError(err, OperationType.LIST, 'assignments');
        } catch (e) {
          console.error(e);
        }
      }
    );

    const unsubRecords = onSnapshot(
      mkQuery('records'),
      (snap) => {
        const isServerSnapshot = !snap.metadata.fromCache;
        const fsRecords: AttendanceRecord[] = snap.docs.map((docSnap) =>
          parseFirestoreAttendanceRecord(docSnap.id, docSnap.data() as Record<string, unknown>)
        );

        if (isServerSnapshot) {
          serverSeen.records = true;
          serverEmpty.records = snap.empty;
          checkCalendarReady();
          maybeReconcileEmptyServerCollections();

          // One-time reconciliation of any local evidence records/photos not yet reflected in /records
          if (!reconciledInitialRecordsRef.current) {
            reconciledInitialRecordsRef.current = true;
            const serverById = new Map(fsRecords.map((r) => [r.id, r]));
            for (const localRec of initialLocalRecords) {
              const safeId = toSafeDocId(localRec.id, 'rec');
              if (deletedRecordIdsRef.current.has(safeId)) continue;
              const serverMatch = serverById.get(safeId);
              if (!serverMatch) {
                if (!snap.empty) {
                  persistRecordToFirestore(localRec);
                }
              } else {
                const localHasExit = Boolean(localRec.exitPhotoUrl && !serverMatch.exitPhotoUrl);
                const localClosed =
                  localRec.status !== 'en_curso' && serverMatch.status === 'en_curso';
                const localAudited =
                  (localRec.adminVerified && !serverMatch.adminVerified) ||
                  Boolean(localRec.adminNotes && localRec.adminNotes !== serverMatch.adminNotes);
                if (localHasExit || localClosed || localAudited) {
                  persistRecordToFirestore(localRec);
                }
              }
            }
          }
        }

        if (snap.empty) {
          if (
            isServerSnapshot &&
            autoSeedTriggeredRef.current &&
            pendingRecordsByIdRef.current.size === 0
          ) {
            updateStateIfChanged<AttendanceRecord[]>(setRecords, [], saveStoredRecords);
          } else if (pendingRecordsByIdRef.current.size > 0) {
            const optimisticOnly = Array.from(pendingRecordsByIdRef.current.values()).sort(
              (a, b) =>
                `${b.date}T${b.checkInTime}`.localeCompare(`${a.date}T${a.checkInTime}`) ||
                b.id.localeCompare(a.id)
            );
            updateStateIfChanged(setRecords, optimisticOnly, saveStoredRecords);
          }
          return;
        }

        serverEmpty.records = false;

        const mergedMap = new Map<string, AttendanceRecord>();
        for (const serverRec of fsRecords) {
          if (deletedRecordIdsRef.current.has(serverRec.id)) continue;
          const pending = pendingRecordsByIdRef.current.get(serverRec.id);
          mergedMap.set(serverRec.id, pending ?? serverRec);
        }
        pendingRecordsByIdRef.current.forEach((pendingRec, pendingId) => {
          if (!mergedMap.has(pendingId) && !deletedRecordIdsRef.current.has(pendingId)) {
            mergedMap.set(pendingId, pendingRec);
          }
        });

        const mergedRecords = Array.from(mergedMap.values());
        mergedRecords.sort((a, b) => {
          const keyA = `${a.date}T${a.checkInTime}`;
          const keyB = `${b.date}T${b.checkInTime}`;
          return keyB.localeCompare(keyA) || b.id.localeCompare(a.id);
        });

        updateStateIfChanged(setRecords, mergedRecords, saveStoredRecords);
      },
      (err) => {
        setSyncErrorMessage(
          'No se pudo leer la bitácora de evidencias (/records) en Firestore.'
        );
        try {
          handleFirestoreError(err, OperationType.LIST, 'records');
        } catch (e) {
          console.error(e);
        }
      }
    );

    const unsubCatalog = onSnapshot(
      mkQuery('activity_catalog'),
      (snap) => {
        if (!snap.metadata.fromCache) {
          serverSeen.catalog = true;
          serverEmpty.catalog = snap.empty;
          maybeReconcileEmptyServerCollections();
        }
        if (snap.empty) return;
        serverEmpty.catalog = false;
        const fsCatalog: ActivityCatalogItem[] = snap.docs
          .map((docSnap): ActivityCatalogItem => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              name: String(d.name || ''),
              activityType: d.activityType === 'clase_fitness' ? 'clase_fitness' : 'pausa_activa',
              defaultDurationMinutes: Number(d.defaultDurationMinutes ?? 20),
              ...(typeof d.description === 'string' ? { description: d.description } : {}),
              active: d.active !== false,
            };
          })
          .sort((a, b) => a.id.localeCompare(b.id));
        updateStateIfChanged(setActivityCatalog, fsCatalog, saveStoredActivityCatalog);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'activity_catalog');
        } catch (e) {
          console.error(e);
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
    };
  }, [persistAssignmentToFirestore, persistRecordToFirestore]);

  // Automatic compliance sweep (persisted in real time to both /records and /assignments)
  useEffect(() => {
    if (!initialCalendarReady) return;
    if (assignments.length === 0 && records.length === 0) return;

    let recordsChanged = false;
    let assignmentsChanged = false;
    const nowDate = new Date(nowTick);
    const todayStr = formatLocalYYYYMMDD(nowDate);
    const nowTimeStr = nowDate.toLocaleTimeString('es-MX', { hour12: false });

    let nextAssignments = assignments;

    const nextRecords: AttendanceRecord[] = records.map((rec) => {
      if (rec.status !== 'en_curso') return rec;
      const alarm = getSessionAlarmStatus(rec, activityCatalog, nowTick);
      if (!alarm.hasExceededUnclosedGrace) return rec;

      recordsChanged = true;
      stopAlarmAudioImmediately();
      void releaseSessionWakeLock();

      const autoNote = `[Sistema BSCW] Sesión dada por NO CERRADA, bloqueada y alarma desactivada automáticamente en el lapso máximo de 30 min tras finalizar (${alarm.autoLockDeadlineFormatted} hrs).`;
      const mergedObs = rec.observations
        ? rec.observations.includes('[Sistema BSCW]')
          ? rec.observations
          : `${rec.observations} | ${autoNote}`
        : autoNote;

      const breachedRecord: AttendanceRecord = {
        ...rec,
        status: 'incumplido',
        nonComplianceReason: 'sin_cierre_30m',
        markedNonCompliantAt: nowTimeStr,
        alarmEnabled: false,
        alarmSnoozedUntilIso: null,
        observations: mergedObs,
      };

      const matchedAsg = findMatchingAssignmentForRecord(breachedRecord, nextAssignments);
      if (matchedAsg) {
        const updatedAsg = markAssignmentDateNonCompliant(
          matchedAsg,
          breachedRecord.date,
          'sin_cierre_30m'
        );
        nextAssignments = nextAssignments.map((a) => (a.id === updatedAsg.id ? updatedAsg : a));
        assignmentsChanged = true;
      }

      return breachedRecord;
    });

    nextAssignments = nextAssignments.map((asg) => {
      if (asg.active === false || asg.closed) return asg;
      // Skip assignments whose create/update write is still in-flight so initial writes finish cleanly first
      if ((inFlightAssignmentWritesRef.current.get(asg.id) || 0) > 0) return asg;

      const candidateDates: string[] = [];
      if (asg.frequency === 'fecha_unica' && asg.date) {
        candidateDates.push(asg.date);
      } else if (doesAssignmentApplyToDate(asg, todayStr)) {
        candidateDates.push(todayStr);
      }

      let currentAsg = asg;
      for (const checkDate of candidateDates) {
        if (currentAsg.completedDates?.includes(checkDate)) continue;
        if (currentAsg.reopenedDates?.includes(checkDate)) continue;
        if (
          currentAsg.missedDates?.includes(checkDate) &&
          (currentAsg.frequency !== 'fecha_unica' || currentAsg.nonCompliant)
        ) {
          continue;
        }

        const matchedRec = findMatchingRecordForAssignmentDate(currentAsg, checkDate, nextRecords);
        if (matchedRec) continue;

        const win = getAssignmentScheduledWindowMs(currentAsg, checkDate, activityCatalog);
        // Close & lock session if 20 minutes have elapsed since start time without loading/check-in (or past date)
        if ((win && nowTick > win.loadCloseMs) || checkDate < todayStr) {
          currentAsg = markAssignmentDateNonCompliant(currentAsg, checkDate, 'fuera_de_horario');
          assignmentsChanged = true;
        }
      }

      return currentAsg;
    });

    if (recordsChanged) {
      setRecords(nextRecords);
      saveStoredRecords(nextRecords);
      nextRecords.forEach((updatedRec, idx) => {
        if (updatedRec !== records[idx]) {
          persistRecordToFirestore(updatedRec);
        }
      });
    }
    if (assignmentsChanged) {
      setAssignments(nextAssignments);
      saveStoredAssignments(nextAssignments);
      nextAssignments.forEach((updatedAsg, idx) => {
        if (updatedAsg !== assignments[idx]) {
          persistAssignmentToFirestore(updatedAsg);
        }
      });
    }
  }, [
    initialCalendarReady,
    nowTick,
    records,
    assignments,
    activityCatalog,
    persistAssignmentToFirestore,
    persistRecordToFirestore,
  ]);

  // Enforce that Directorio and Panel Admin are hidden and inactive on phones & tablets
  useEffect(() => {
    const pointerMedia = window.matchMedia('(hover: none) and (pointer: coarse)');
    const syncDeviceView = () => {
      const restricted = checkIsMobileOrTablet();
      setIsMobileOrTablet(restricted);
      if (restricted) {
        setCurrentView((prev) => (prev !== 'trainer' ? 'trainer' : prev));
      }
    };

    syncDeviceView();
    window.addEventListener('resize', syncDeviceView);
    window.addEventListener('orientationchange', syncDeviceView);
    pointerMedia.addEventListener('change', syncDeviceView);
    return () => {
      window.removeEventListener('resize', syncDeviceView);
      window.removeEventListener('orientationchange', syncDeviceView);
      pointerMedia.removeEventListener('change', syncDeviceView);
    };
  }, []);

  const handleViewChange = (view: 'trainer' | 'personnel' | 'admin') => {
    if (view !== 'trainer' && checkIsMobileOrTablet()) {
      setCurrentView('trainer');
      return;
    }
    setCurrentView(view);
  };

  const syncAssignmentLockFromRecord = useCallback(
    (record: AttendanceRecord) => {
      const currentAssignments = assignmentsRef.current;
      const matchedAsg = findMatchingAssignmentForRecord(record, currentAssignments);
      if (!matchedAsg) return;

      if (record.status === 'completado') {
        const lockedAsg = toggleAssignmentDateLock(matchedAsg, record.date, true);
        const normalized = persistAssignmentToFirestore(lockedAsg);
        const updatedAsgs = currentAssignments.map((a) =>
          a.id === normalized.id ? normalized : a
        );
        assignmentsRef.current = updatedAsgs;
        setAssignments(updatedAsgs);
        saveStoredAssignments(updatedAsgs);
      } else if (record.status === 'incumplido') {
        const breachedAsg = markAssignmentDateNonCompliant(
          matchedAsg,
          record.date,
          record.nonComplianceReason || 'sin_cierre_30m'
        );
        const normalized = persistAssignmentToFirestore(breachedAsg);
        const updatedAsgs = currentAssignments.map((a) =>
          a.id === normalized.id ? normalized : a
        );
        assignmentsRef.current = updatedAsgs;
        setAssignments(updatedAsgs);
        saveStoredAssignments(updatedAsgs);
      }
    },
    [persistAssignmentToFirestore]
  );

  // Record handlers (automatically synced with Firestore /records and stable across renders)
  const handleSaveRecord = useCallback(
    (newRecord: AttendanceRecord) => {
      const currentAssignments = assignmentsRef.current;
      const currentRecords = recordsRef.current;
      const matchedAsg = findMatchingAssignmentForRecord(newRecord, currentAssignments);
      const recordWithAsg =
        matchedAsg && !newRecord.assignmentId
          ? { ...newRecord, assignmentId: matchedAsg.id }
          : newRecord;

      const normalized = persistRecordToFirestore(recordWithAsg);
      const updated = [normalized, ...currentRecords.filter((r) => r.id !== normalized.id)];
      recordsRef.current = updated;
      setRecords(updated);
      saveStoredRecords(updated);
      syncAssignmentLockFromRecord(normalized);
    },
    [persistRecordToFirestore, syncAssignmentLockFromRecord]
  );

  const handleUpdateRecord = useCallback(
    (updatedRecord: AttendanceRecord) => {
      const currentAssignments = assignmentsRef.current;
      const currentRecords = recordsRef.current;
      const matchedAsg = findMatchingAssignmentForRecord(updatedRecord, currentAssignments);
      const recordWithAsg =
        matchedAsg && !updatedRecord.assignmentId
          ? { ...updatedRecord, assignmentId: matchedAsg.id }
          : updatedRecord;

      const normalized = persistRecordToFirestore(recordWithAsg);
      const updated = currentRecords.map((r) =>
        r.id === updatedRecord.id || r.id === normalized.id ? normalized : r
      );
      recordsRef.current = updated;
      setRecords(updated);
      saveStoredRecords(updated);
      syncAssignmentLockFromRecord(normalized);
    },
    [persistRecordToFirestore, syncAssignmentLockFromRecord]
  );

  const handleDeleteRecord = (recordId: string) => {
    const safeId = toSafeDocId(recordId, 'rec');
    deletedRecordIdsRef.current.add(safeId);
    pendingRecordsByIdRef.current.delete(safeId);

    const updated = records.filter((r) => r.id !== recordId && r.id !== safeId);
    setRecords(updated);
    saveStoredRecords(updated);
    deleteRecordFromFirestore(safeId)
      .catch(console.error)
      .finally(() => {
        setTimeout(() => {
          deletedRecordIdsRef.current.delete(safeId);
        }, 4000);
      });
  };

  // Company CRUD handlers (automatically synced with Firestore /companies)
  const handleAddCompany = (newCompany: Company) => {
    const updated = [...companies, newCompany];
    companiesRef.current = updated;
    setCompanies(updated);
    saveStoredCompanies(updated);
    saveCompanyToFirestore(newCompany).catch(console.error);
  };

  const handleUpdateCompany = (updatedCompany: Company) => {
    const updated = companies.map((c) => (c.id === updatedCompany.id ? updatedCompany : c));
    companiesRef.current = updated;
    setCompanies(updated);
    saveStoredCompanies(updated);
    saveCompanyToFirestore(updatedCompany).catch(console.error);
  };

  const handleDeleteCompany = (companyId: string) => {
    const updated = companies.filter((c) => c.id !== companyId);
    companiesRef.current = updated;
    setCompanies(updated);
    saveStoredCompanies(updated);
    deleteCompanyAndSedesFromFirestore(companyId).catch(console.error);
  };

  // Sede CRUD handlers (race-free automatic sync with Firestore /sedes)
  const handleAddSede = (newSede: Sede) => {
    const parentComp = companies.find((c) => c.id === newSede.companyId);
    pendingSedesByIdRef.current.set(newSede.id, newSede);

    const updatedCompanies = companies.map((c) => {
      if (c.id === newSede.companyId) {
        return {
          ...c,
          sedes: [...c.sedes, newSede],
        };
      }
      return c;
    });
    companiesRef.current = updatedCompanies;
    setCompanies(updatedCompanies);
    saveStoredCompanies(updatedCompanies);

    saveSedeToFirestore(newSede, parentComp).catch((err) => {
      pendingSedesByIdRef.current.delete(newSede.id);
      console.error(err);
    });
  };

  const handleUpdateSede = (updatedSede: Sede) => {
    const parentComp = companies.find((c) => c.id === updatedSede.companyId);
    pendingSedesByIdRef.current.set(updatedSede.id, updatedSede);

    const updatedCompanies = companies.map((c) => {
      if (c.id === updatedSede.companyId) {
        return {
          ...c,
          sedes: c.sedes.map((s) => (s.id === updatedSede.id ? updatedSede : s)),
        };
      }
      return c;
    });
    companiesRef.current = updatedCompanies;
    setCompanies(updatedCompanies);
    saveStoredCompanies(updatedCompanies);

    saveSedeToFirestore(updatedSede, parentComp).catch((err) => {
      pendingSedesByIdRef.current.delete(updatedSede.id);
      console.error(err);
    });
  };

  const handleDeleteSede = (sedeId: string, companyId: string) => {
    pendingSedesByIdRef.current.delete(sedeId);
    const updatedCompanies = companies.map((c) => {
      if (c.id === companyId) {
        return {
          ...c,
          sedes: c.sedes.filter((s) => s.id !== sedeId),
        };
      }
      return c;
    });
    companiesRef.current = updatedCompanies;
    setCompanies(updatedCompanies);
    saveStoredCompanies(updatedCompanies);
    deleteSedeFromFirestore(sedeId).catch(console.error);
  };

  // Trainer CRUD handlers (automatically synced with Firestore /trainers)
  const handleAddTrainer = (newTrainer: Trainer) => {
    const updated = [...trainers, newTrainer];
    setTrainers(updated);
    saveStoredTrainers(updated);
    saveTrainerToFirestore(newTrainer).catch(console.error);
  };

  const handleUpdateTrainer = (updatedTrainer: Trainer) => {
    const updated = trainers.map((t) => (t.id === updatedTrainer.id ? updatedTrainer : t));
    setTrainers(updated);
    saveStoredTrainers(updated);
    if (updatedTrainer.active === false && trainerSession?.trainerId === updatedTrainer.id) {
      handleLogoutTrainerSession();
    }
    saveTrainerToFirestore(updatedTrainer).catch(console.error);
  };

  const handleDeleteTrainer = (trainerId: string) => {
    const updated = trainers.filter((t) => t.id !== trainerId);
    setTrainers(updated);
    saveStoredTrainers(updated);
    if (trainerSession?.trainerId === trainerId) {
      handleLogoutTrainerSession();
    }
    deleteTrainerFromFirestore(trainerId).catch(console.error);
  };

  // Assignment CRUD handlers (optimistic + serialized sync with Firestore /assignments)
  const handleAddAssignment = (newAssignment: ClassAssignment) => {
    const normalized = persistAssignmentToFirestore(newAssignment);
    const updated = [normalized, ...assignments.filter((a) => a.id !== normalized.id)];
    setAssignments(updated);
    saveStoredAssignments(updated);
  };

  const handleUpdateAssignment = (updatedAssignment: ClassAssignment) => {
    const normalized = persistAssignmentToFirestore(updatedAssignment);
    const updated = assignments.map((a) =>
      a.id === updatedAssignment.id || a.id === normalized.id ? normalized : a
    );
    setAssignments(updated);
    saveStoredAssignments(updated);
  };

  const handleDeleteAssignment = (assignmentId: string) => {
    const safeId = toSafeDocId(assignmentId, 'asg');
    pendingAssignmentsByIdRef.current.delete(safeId);
    deletedAssignmentIdsRef.current.add(safeId);

    const updated = assignments.filter((a) => a.id !== assignmentId && a.id !== safeId);
    setAssignments(updated);
    saveStoredAssignments(updated);

    deleteAssignmentFromFirestore(safeId)
      .catch((err) => {
        console.error(err);
        setSyncErrorMessage('No se pudo eliminar la asignación en la base de datos.');
      })
      .finally(() => {
        deletedAssignmentIdsRef.current.delete(safeId);
      });
  };

  // Activity Catalog CRUD handlers (automatically synced with Firestore /activity_catalog)
  const handleAddCatalogItem = (newItem: ActivityCatalogItem) => {
    const updated = [...activityCatalog, newItem];
    setActivityCatalog(updated);
    saveStoredActivityCatalog(updated);
    saveActivityCatalogItemToFirestore(newItem).catch(console.error);
  };

  const handleUpdateCatalogItem = (updatedItem: ActivityCatalogItem, previousName?: string) => {
    const updated = activityCatalog.map((item) =>
      item.id === updatedItem.id ? updatedItem : item
    );
    setActivityCatalog(updated);
    saveStoredActivityCatalog(updated);
    saveActivityCatalogItemToFirestore(updatedItem).catch(console.error);

    if (previousName) {
      const syncedAssignments = assignments.map((asg) =>
        asg.activityName === previousName
          ? {
              ...asg,
              activityType: updatedItem.activityType,
              activityName: updatedItem.name,
            }
          : asg
      );
      setAssignments(syncedAssignments);
      saveStoredAssignments(syncedAssignments);
      syncedAssignments
        .filter((asg) => asg.activityName === updatedItem.name)
        .forEach((asg) => {
          persistAssignmentToFirestore(asg);
        });
    }
  };

  const handleDeleteCatalogItem = (id: string) => {
    const updated = activityCatalog.filter((item) => item.id !== id);
    setActivityCatalog(updated);
    saveStoredActivityCatalog(updated);
    deleteActivityCatalogItemFromFirestore(id).catch(console.error);
  };

  // Global reset (also re-seeds demo data into Firestore automatically)
  const handleResetData = () => {
    resetAllDataToDefault();
    const freshCompanies = getStoredCompanies();
    companiesRef.current = freshCompanies;
    setRecords(getStoredRecords());
    setCompanies(freshCompanies);
    setTrainers(getStoredTrainers());
    setAssignments(getStoredAssignments());
    setActivityCatalog(getStoredActivityCatalog());
    seedDemoDataToFirestore().catch(console.error);
  };

  const authenticatedTrainer = useMemo(() => {
    if (!trainerSession) return null;
    return trainers.find((t) => t.id === trainerSession.trainerId && t.active !== false) || null;
  }, [trainerSession, trainers]);

  // Strict per-trainer isolation: each trainer only receives their own assignments and records
  const isolatedTrainerAssignments = useMemo(() => {
    if (!authenticatedTrainer) return [];
    return assignments.filter((a) => a.trainerId === authenticatedTrainer.id);
  }, [assignments, authenticatedTrainer]);

  const isolatedTrainerRecords = useMemo(() => {
    if (!authenticatedTrainer) return [];
    return records.filter((r) => r.trainerId === authenticatedTrainer.id);
  }, [records, authenticatedTrainer]);

  const isTrainerPortalActive = isMobileOrTablet || currentView === 'trainer';
  const headerVisibleRecords = isTrainerPortalActive ? isolatedTrainerRecords : records;

  const activeSessionCount = headerVisibleRecords.filter((r) => r.status === 'en_curso').length;
  const overdueSessionCount = headerVisibleRecords.filter(
    (r) => r.status === 'en_curso' && getSessionAlarmStatus(r, activityCatalog, nowTick).isOverdue
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-red-600 selection:text-white font-sans">
      <Header
        currentView={isTrainerPortalActive ? 'trainer' : currentView}
        onViewChange={handleViewChange}
        authenticatedTrainer={authenticatedTrainer}
        trainerSession={trainerSession}
        onLogoutTrainerSession={handleLogoutTrainerSession}
        activeSessionCount={activeSessionCount}
        overdueSessionCount={overdueSessionCount}
        isMobileOrTablet={isMobileOrTablet}
        isDirectoryAuthenticated={isDirectoryAuthenticated}
        directoryUserEmail={directoryUser?.email}
      />

      {syncErrorMessage && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900 print:hidden">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{syncErrorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncErrorMessage(null)}
              className="px-2 py-1 text-amber-700 hover:text-amber-950 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 pb-16">
        {isTrainerPortalActive && (
          authenticatedTrainer ? (
            <TrainerCheckInView
              currentTrainer={authenticatedTrainer}
              trainerSession={trainerSession}
              onLogoutTrainerSession={handleLogoutTrainerSession}
              companies={companies}
              records={isolatedTrainerRecords}
              assignments={isolatedTrainerAssignments}
              activityCatalog={activityCatalog}
              onSaveRecord={handleSaveRecord}
              onUpdateRecord={handleUpdateRecord}
            />
          ) : (
            <TrainerFacialLoginView
              trainers={trainers}
              onSessionAuthenticated={handleTrainerSessionAuthenticated}
            />
          )
        )}

        {!isMobileOrTablet && currentView === 'personnel' && (
          <div className="hidden lg:block">
            <FirestoreErrorBoundary>
              <PersonnelRegistryView onNavigateView={handleViewChange} />
            </FirestoreErrorBoundary>
          </div>
        )}

        {!isMobileOrTablet && currentView === 'admin' && (
          <div className="hidden lg:block">
            <AdminDashboard
              records={records}
              companies={companies}
              trainers={trainers}
              assignments={assignments}
              activityCatalog={activityCatalog}
              onUpdateRecord={handleUpdateRecord}
              onDeleteRecord={handleDeleteRecord}
              onAddCompany={handleAddCompany}
              onUpdateCompany={handleUpdateCompany}
              onDeleteCompany={handleDeleteCompany}
              onAddSede={handleAddSede}
              onUpdateSede={handleUpdateSede}
              onDeleteSede={handleDeleteSede}
              onAddTrainer={handleAddTrainer}
              onUpdateTrainer={handleUpdateTrainer}
              onDeleteTrainer={handleDeleteTrainer}
              onAddAssignment={handleAddAssignment}
              onUpdateAssignment={handleUpdateAssignment}
              onDeleteAssignment={handleDeleteAssignment}
              onAddCatalogItem={handleAddCatalogItem}
              onUpdateCatalogItem={handleUpdateCatalogItem}
              onDeleteCatalogItem={handleDeleteCatalogItem}
              onResetData={handleResetData}
              isDirectoryAuthenticated={isDirectoryAuthenticated}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-900 flex items-center">
              <CheckCheck className="w-4 h-4 text-red-600 mr-1" />
              BSCW <span className="text-red-600 ml-1">Check</span>
            </span>
            <span>•</span>
            <span className="text-slate-500">Sistema Corporativo de Asistencia y Puntualidad</span>
          </div>
          <div className="flex items-center space-x-1.5 text-[11px] text-red-600 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Geolocalización GPS • Validación Facial Biométrica • Foto con Sello Indeleble</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
