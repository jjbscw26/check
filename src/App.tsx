import React, { useState, useEffect, useRef } from 'react';
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
} from './types';
import { Header } from './components/Header';
import { TrainerCheckInView } from './components/TrainerCheckInView';
import { AdminDashboard } from './components/AdminDashboard';
import { PersonnelRegistryView } from './components/PersonnelRegistryView';
import { FirestoreErrorBoundary } from './components/FirestoreErrorBoundary';
import { getSessionAlarmStatus, unlockMobileAlarmAudio } from './utils/sessionAlarm';
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
import {
  deleteAssignmentFromFirestore,
  deleteCompanyAndSedesFromFirestore,
  deleteSedeFromFirestore,
  deleteTrainerFromFirestore,
  saveAssignmentToFirestore,
  saveCompanyToFirestore,
  saveSedeToFirestore,
  saveTrainerToFirestore,
  seedDemoDataToFirestore,
} from './utils/firestoreDemoSync';
import { deriveCompanyLogoText, generateInitialsAvatarDataUrl } from './utils/personnelValidation';
import { ShieldCheck, CheckCheck } from 'lucide-react';

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
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>('');
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const autoSeedTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 5000);
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

    setRecords(loadedRecords);
    setCompanies(loadedCompanies);
    setTrainers(loadedTrainers);
    setAssignments(loadedAssignments);
    setActivityCatalog(loadedCatalog);

    if (loadedTrainers.length > 0) {
      setSelectedTrainerId(loadedTrainers[0].id);
    }
  }, []);

  // Automatic real-time Firestore connection from any device without login
  useEffect(() => {
    const mkQuery = (colName: string) =>
      query(collection(db, colName), where('createdAt', '>=', FIRESTORE_MIN_CREATED_AT));

    let latestFsCompanies: Omit<Company, 'sedes'>[] | null = null;
    let latestFsSedes: Sede[] = [];
    let trainersServerSeen = false;
    let companiesServerSeen = false;
    let trainersEmptyOnServer = false;
    let companiesEmptyOnServer = false;

    const maybeTriggerAutoSeed = () => {
      if (
        !autoSeedTriggeredRef.current &&
        trainersServerSeen &&
        companiesServerSeen &&
        trainersEmptyOnServer &&
        companiesEmptyOnServer
      ) {
        autoSeedTriggeredRef.current = true;
        seedDemoDataToFirestore().catch(console.error);
      }
    };

    const syncCombinedCompanies = () => {
      if (!latestFsCompanies || latestFsCompanies.length === 0) {
        return;
      }
      const assembled: Company[] = latestFsCompanies.map((comp) => ({
        ...comp,
        sedes: latestFsSedes.filter((s) => s.companyId === comp.id),
      }));
      setCompanies(assembled);
      saveStoredCompanies(assembled);
    };

    const unsubTrainers = onSnapshot(
      mkQuery('trainers'),
      (snap) => {
        if (!snap.metadata.fromCache) {
          trainersServerSeen = true;
          trainersEmptyOnServer = snap.empty;
          maybeTriggerAutoSeed();
        }
        if (snap.empty) return;
        const fsTrainers: Trainer[] = snap.docs.map((docSnap) => {
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
        });
        setTrainers(fsTrainers);
        saveStoredTrainers(fsTrainers);
        setSelectedTrainerId((prev) =>
          fsTrainers.some((t) => t.id === prev) ? prev : fsTrainers[0]?.id || ''
        );
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
          companiesServerSeen = true;
          companiesEmptyOnServer = snap.empty;
          maybeTriggerAutoSeed();
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
        if (snap.empty) {
          if (
            !snap.metadata.fromCache &&
            !autoSeedTriggeredRef.current &&
            latestFsCompanies &&
            latestFsCompanies.length > 0 &&
            latestFsSedes.length > 0
          ) {
            autoSeedTriggeredRef.current = true;
            seedDemoDataToFirestore().catch(console.error);
          }
          return;
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
            time: String(d.time || '09:00'),
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
        setAssignments(fsAssignments);
        saveStoredAssignments(fsAssignments);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'assignments');
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
    };
  }, []);

  // Automatic compliance sweep
  useEffect(() => {
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
      const autoNote = `[Sistema BSCW] Bloqueada y marcada como INCUMPLIDA por no registrar salida pasados 30 min del fin programado (${alarm.expectedEndTimeFormatted} hrs).`;
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
        if (win && nowTick > win.endMs) {
          currentAsg = markAssignmentDateNonCompliant(currentAsg, checkDate, 'fuera_de_horario');
          assignmentsChanged = true;
        }
      }

      return currentAsg;
    });

    if (recordsChanged) {
      setRecords(nextRecords);
      saveStoredRecords(nextRecords);
    }
    if (assignmentsChanged) {
      setAssignments(nextAssignments);
      saveStoredAssignments(nextAssignments);
      nextAssignments.forEach((updatedAsg, idx) => {
        if (updatedAsg !== assignments[idx]) {
          void saveAssignmentToFirestore(updatedAsg).catch((err) => console.error(err));
        }
      });
    }
  }, [nowTick, records, assignments, activityCatalog]);

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

  const syncAssignmentLockFromRecord = (record: AttendanceRecord) => {
    const matchedAsg = findMatchingAssignmentForRecord(record, assignments);
    if (!matchedAsg) return;

    if (record.status === 'completado') {
      const lockedAsg = toggleAssignmentDateLock(matchedAsg, record.date, true);
      const updatedAsgs = assignments.map((a) => (a.id === lockedAsg.id ? lockedAsg : a));
      setAssignments(updatedAsgs);
      saveStoredAssignments(updatedAsgs);
      saveAssignmentToFirestore(lockedAsg).catch(console.error);
    } else if (record.status === 'incumplido') {
      const breachedAsg = markAssignmentDateNonCompliant(
        matchedAsg,
        record.date,
        record.nonComplianceReason || 'sin_cierre_30m'
      );
      const updatedAsgs = assignments.map((a) => (a.id === breachedAsg.id ? breachedAsg : a));
      setAssignments(updatedAsgs);
      saveStoredAssignments(updatedAsgs);
      saveAssignmentToFirestore(breachedAsg).catch(console.error);
    }
  };

  // Record handlers
  const handleSaveRecord = (newRecord: AttendanceRecord) => {
    const matchedAsg = findMatchingAssignmentForRecord(newRecord, assignments);
    const recordWithAsg =
      matchedAsg && !newRecord.assignmentId
        ? { ...newRecord, assignmentId: matchedAsg.id }
        : newRecord;

    const updated = [recordWithAsg, ...records];
    setRecords(updated);
    saveStoredRecords(updated);
    syncAssignmentLockFromRecord(recordWithAsg);
  };

  const handleUpdateRecord = (updatedRecord: AttendanceRecord) => {
    const matchedAsg = findMatchingAssignmentForRecord(updatedRecord, assignments);
    const recordWithAsg =
      matchedAsg && !updatedRecord.assignmentId
        ? { ...updatedRecord, assignmentId: matchedAsg.id }
        : updatedRecord;

    const updated = records.map((r) => (r.id === recordWithAsg.id ? recordWithAsg : r));
    setRecords(updated);
    saveStoredRecords(updated);
    syncAssignmentLockFromRecord(recordWithAsg);
  };

  const handleDeleteRecord = (recordId: string) => {
    const updated = records.filter((r) => r.id !== recordId);
    setRecords(updated);
    saveStoredRecords(updated);
  };

  // Company CRUD handlers (automatically synced with Firestore /companies)
  const handleAddCompany = (newCompany: Company) => {
    const updated = [...companies, newCompany];
    setCompanies(updated);
    saveStoredCompanies(updated);
    saveCompanyToFirestore(newCompany).catch(console.error);
  };

  const handleUpdateCompany = (updatedCompany: Company) => {
    const updated = companies.map((c) => (c.id === updatedCompany.id ? updatedCompany : c));
    setCompanies(updated);
    saveStoredCompanies(updated);
    saveCompanyToFirestore(updatedCompany).catch(console.error);
  };

  const handleDeleteCompany = (companyId: string) => {
    const updated = companies.filter((c) => c.id !== companyId);
    setCompanies(updated);
    saveStoredCompanies(updated);
    deleteCompanyAndSedesFromFirestore(companyId).catch(console.error);
  };

  // Sede CRUD handlers (automatically synced with Firestore /sedes)
  const handleAddSede = (newSede: Sede) => {
    const parentComp = companies.find((c) => c.id === newSede.companyId);
    const updatedCompanies = companies.map((c) => {
      if (c.id === newSede.companyId) {
        return {
          ...c,
          sedes: [...c.sedes, newSede],
        };
      }
      return c;
    });
    setCompanies(updatedCompanies);
    saveStoredCompanies(updatedCompanies);

    (async () => {
      if (parentComp) {
        await saveCompanyToFirestore(parentComp);
      }
      await saveSedeToFirestore(newSede);
    })().catch(console.error);
  };

  const handleUpdateSede = (updatedSede: Sede) => {
    const parentComp = companies.find((c) => c.id === updatedSede.companyId);
    const updatedCompanies = companies.map((c) => {
      if (c.id === updatedSede.companyId) {
        return {
          ...c,
          sedes: c.sedes.map((s) => (s.id === updatedSede.id ? updatedSede : s)),
        };
      }
      return c;
    });
    setCompanies(updatedCompanies);
    saveStoredCompanies(updatedCompanies);

    (async () => {
      if (parentComp) {
        await saveCompanyToFirestore(parentComp);
      }
      await saveSedeToFirestore(updatedSede);
    })().catch(console.error);
  };

  const handleDeleteSede = (sedeId: string, companyId: string) => {
    const updatedCompanies = companies.map((c) => {
      if (c.id === companyId) {
        return {
          ...c,
          sedes: c.sedes.filter((s) => s.id !== sedeId),
        };
      }
      return c;
    });
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
    saveTrainerToFirestore(updatedTrainer).catch(console.error);
  };

  const handleDeleteTrainer = (trainerId: string) => {
    const updated = trainers.filter((t) => t.id !== trainerId);
    setTrainers(updated);
    saveStoredTrainers(updated);
    if (selectedTrainerId === trainerId && updated.length > 0) {
      setSelectedTrainerId(updated[0].id);
    }
    deleteTrainerFromFirestore(trainerId).catch(console.error);
  };

  // Assignment CRUD handlers (automatically synced with Firestore /assignments)
  const handleAddAssignment = (newAssignment: ClassAssignment) => {
    const updated = [newAssignment, ...assignments];
    setAssignments(updated);
    saveStoredAssignments(updated);
    saveAssignmentToFirestore(newAssignment).catch(console.error);
  };

  const handleUpdateAssignment = (updatedAssignment: ClassAssignment) => {
    const updated = assignments.map((a) =>
      a.id === updatedAssignment.id ? updatedAssignment : a
    );
    setAssignments(updated);
    saveStoredAssignments(updated);
    saveAssignmentToFirestore(updatedAssignment).catch(console.error);
  };

  const handleDeleteAssignment = (assignmentId: string) => {
    const updated = assignments.filter((a) => a.id !== assignmentId);
    setAssignments(updated);
    saveStoredAssignments(updated);
    deleteAssignmentFromFirestore(assignmentId).catch(console.error);
  };

  // Activity Catalog CRUD handlers
  const handleAddCatalogItem = (newItem: ActivityCatalogItem) => {
    const updated = [...activityCatalog, newItem];
    setActivityCatalog(updated);
    saveStoredActivityCatalog(updated);
  };

  const handleUpdateCatalogItem = (updatedItem: ActivityCatalogItem, previousName?: string) => {
    const updated = activityCatalog.map((item) =>
      item.id === updatedItem.id ? updatedItem : item
    );
    setActivityCatalog(updated);
    saveStoredActivityCatalog(updated);

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
          saveAssignmentToFirestore(asg).catch(console.error);
        });
    }
  };

  const handleDeleteCatalogItem = (id: string) => {
    const updated = activityCatalog.filter((item) => item.id !== id);
    setActivityCatalog(updated);
    saveStoredActivityCatalog(updated);
  };

  // Global reset (also re-seeds demo data into Firestore automatically)
  const handleResetData = () => {
    resetAllDataToDefault();
    setRecords(getStoredRecords());
    setCompanies(getStoredCompanies());
    setTrainers(getStoredTrainers());
    setAssignments(getStoredAssignments());
    setActivityCatalog(getStoredActivityCatalog());
    seedDemoDataToFirestore().catch(console.error);
  };

  const currentTrainer = trainers.find((t) => t.id === selectedTrainerId) || trainers[0];
  const activeSessionCount = records.filter((r) => r.status === 'en_curso').length;
  const overdueSessionCount = records.filter(
    (r) => r.status === 'en_curso' && getSessionAlarmStatus(r, activityCatalog, nowTick).isOverdue
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-red-600 selection:text-white font-sans">
      <Header
        currentView={isMobileOrTablet ? 'trainer' : currentView}
        onViewChange={handleViewChange}
        trainers={trainers}
        selectedTrainerId={selectedTrainerId}
        onTrainerChange={setSelectedTrainerId}
        activeSessionCount={activeSessionCount}
        overdueSessionCount={overdueSessionCount}
        isMobileOrTablet={isMobileOrTablet}
      />

      <main className="flex-1 pb-16">
        {(isMobileOrTablet || currentView === 'trainer') && currentTrainer && (
          <TrainerCheckInView
            currentTrainer={currentTrainer}
            companies={companies}
            records={records}
            assignments={assignments}
            activityCatalog={activityCatalog}
            onSaveRecord={handleSaveRecord}
            onUpdateRecord={handleUpdateRecord}
          />
        )}

        {!isMobileOrTablet && currentView === 'personnel' && (
          <div className="hidden lg:block">
            <FirestoreErrorBoundary>
              <PersonnelRegistryView />
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
