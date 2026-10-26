import React, { useState } from 'react';
import {
  ACTIVITY_TYPE_DEFAULT_MINUTES,
  ACTIVITY_TYPE_LABELS,
  ActivityCatalogItem,
  ActivityType,
  ALL_ACTIVITY_TYPES,
  ClassAssignment,
  normalizeActivityType,
  Trainer,
} from '../types';
import {
  Activity,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Clock,
  Building2,
  User,
  Sparkles,
  CheckCircle2,
  Layers,
  Search,
  Timer,
  Lock,
  Ban,
} from 'lucide-react';
import {
  MAX_ASSIGNMENT_DURATION_MINUTES,
  MIN_ASSIGNMENT_DURATION_MINUTES,
  combineHoursAndMinutes,
  formatDurationHoursMinutes,
  getAssignmentDurationMinutes,
  getDefaultDurationMinutes,
  splitMinutesToHoursAndMinutes,
} from '../utils/sessionAlarm';
import {
  collectMissingCatalogItemsFromTrainers,
  getAssignmentDisciplineGroups,
  resolveDisciplineSelection,
} from '../utils/specialtyDisciplines';

interface AdminAssignmentTypesViewProps {
  activityCatalog: ActivityCatalogItem[];
  assignments: ClassAssignment[];
  trainers?: Trainer[];
  onAddCatalogItem: (item: ActivityCatalogItem) => void;
  onUpdateCatalogItem: (item: ActivityCatalogItem, previousName?: string) => void;
  onDeleteCatalogItem: (id: string) => void;
  onUpdateAssignment: (assignment: ClassAssignment) => void;
  onEditFullAssignment: (assignment: ClassAssignment) => void;
}

interface ModalityMeta {
  type: ActivityType;
  indexLabel: string;
  catalogTitle: string;
  shortButtonLabel: string;
  createButtonLabel: string;
  prefix: string;
  fallbackActivityName: string;
  activeTabClass: string;
  createBtnClass: string;
  addCardBtnClass: string;
  cardItemActiveClass: string;
  clockIconClass: string;
  editHoverClass: string;
  modalActiveBtnClass: string;
  kpiCardClass: string;
  kpiTitleClass: string;
  kickerTextClass: string;
}

const MODALITY_CONFIG: Record<ActivityType, ModalityMeta> = {
  pausa_activa: {
    type: 'pausa_activa',
    indexLabel: '01 · Modalidad 1',
    catalogTitle: 'Catálogo de Pausas Activas',
    shortButtonLabel: 'Pausa Activa',
    createButtonLabel: 'Nueva Pausa Activa',
    prefix: 'Pausa Activa: ',
    fallbackActivityName: 'Pausa Activa: Ergonomía y Estiramientos',
    activeTabClass: 'bg-amber-500 text-white shadow-2xs font-bold',
    createBtnClass:
      'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200',
    addCardBtnClass: 'bg-amber-500 hover:bg-amber-600 text-white',
    cardItemActiveClass: 'bg-amber-50/30 border-amber-200/80',
    clockIconClass: 'text-amber-600',
    editHoverClass: 'hover:bg-amber-50 hover:text-amber-700',
    modalActiveBtnClass: 'bg-amber-500 border-amber-500 text-white shadow-sm',
    kpiCardClass: 'bg-amber-50/60 border-amber-200',
    kpiTitleClass: 'text-amber-800',
    kickerTextClass: 'text-amber-700',
  },
  clase_fitness: {
    type: 'clase_fitness',
    indexLabel: '02 · Modalidad 2',
    catalogTitle: 'Catálogo de Clases Fitness',
    shortButtonLabel: 'Clase Fitness',
    createButtonLabel: 'Nueva Clase Fitness',
    prefix: 'Clase Fitness: ',
    fallbackActivityName: 'Clase Fitness: Entrenamiento Funcional',
    activeTabClass: 'bg-red-600 text-white shadow-2xs font-bold',
    createBtnClass: 'bg-red-600 hover:bg-red-700 text-white shadow-xs',
    addCardBtnClass: 'bg-red-600 hover:bg-red-700 text-white',
    cardItemActiveClass: 'bg-red-50/30 border-red-200/80',
    clockIconClass: 'text-red-600',
    editHoverClass: 'hover:bg-red-50 hover:text-red-700',
    modalActiveBtnClass: 'bg-red-600 border-red-600 text-white shadow-sm',
    kpiCardClass: 'bg-red-50/60 border-red-200',
    kpiTitleClass: 'text-red-800',
    kickerTextClass: 'text-red-700',
  },
  gimnasio_corporativo: {
    type: 'gimnasio_corporativo',
    indexLabel: '03 · Modalidad 3',
    catalogTitle: 'Catálogo de Gimnasio Corporativo',
    shortButtonLabel: 'Gimnasio Corp.',
    createButtonLabel: 'Nuevo Gimnasio Corp.',
    prefix: 'Gimnasio Corporativo: ',
    fallbackActivityName: 'Gimnasio Corporativo: Acondicionamiento y Pesas',
    activeTabClass: 'bg-indigo-600 text-white shadow-2xs font-bold',
    createBtnClass:
      'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200',
    addCardBtnClass: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    cardItemActiveClass: 'bg-indigo-50/30 border-indigo-200/80',
    clockIconClass: 'text-indigo-600',
    editHoverClass: 'hover:bg-indigo-50 hover:text-indigo-700',
    modalActiveBtnClass: 'bg-indigo-600 border-indigo-600 text-white shadow-sm',
    kpiCardClass: 'bg-indigo-50/60 border-indigo-200',
    kpiTitleClass: 'text-indigo-800',
    kickerTextClass: 'text-indigo-700',
  },
  masajes: {
    type: 'masajes',
    indexLabel: '04 · Modalidad 4',
    catalogTitle: 'Catálogo de Masajes',
    shortButtonLabel: 'Masajes',
    createButtonLabel: 'Nuevo Masaje',
    prefix: 'Masajes: ',
    fallbackActivityName: 'Masajes: Masaje Descontracturante en Silla',
    activeTabClass: 'bg-teal-600 text-white shadow-2xs font-bold',
    createBtnClass:
      'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200',
    addCardBtnClass: 'bg-teal-600 hover:bg-teal-700 text-white',
    cardItemActiveClass: 'bg-teal-50/30 border-teal-200/80',
    clockIconClass: 'text-teal-600',
    editHoverClass: 'hover:bg-teal-50 hover:text-teal-700',
    modalActiveBtnClass: 'bg-teal-600 border-teal-600 text-white shadow-sm',
    kpiCardClass: 'bg-teal-50/60 border-teal-200',
    kpiTitleClass: 'text-teal-800',
    kickerTextClass: 'text-teal-700',
  },
};

export const AdminAssignmentTypesView: React.FC<AdminAssignmentTypesViewProps> = ({
  activityCatalog,
  assignments,
  trainers = [],
  onAddCatalogItem,
  onUpdateCatalogItem,
  onDeleteCatalogItem,
  onUpdateAssignment,
  onEditFullAssignment,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ActivityCatalogItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState<ActivityType>('pausa_activa');
  const [itemDurationInput, setItemDurationInput] = useState<string>('20');
  const [itemDescription, setItemDescription] = useState('');
  const [itemActive, setItemActive] = useState(true);

  const [searchAssignment, setSearchAssignment] = useState('');
  const [filterType, setFilterType] = useState<'all' | ActivityType>('all');
  const [savedToastId, setSavedToastId] = useState<string | null>(null);

  const catalogByType: Record<ActivityType, ActivityCatalogItem[]> = {
    pausa_activa: activityCatalog.filter(
      (c) => normalizeActivityType(c.activityType) === 'pausa_activa'
    ),
    clase_fitness: activityCatalog.filter(
      (c) => normalizeActivityType(c.activityType) === 'clase_fitness'
    ),
    gimnasio_corporativo: activityCatalog.filter(
      (c) => normalizeActivityType(c.activityType) === 'gimnasio_corporativo'
    ),
    masajes: activityCatalog.filter((c) => normalizeActivityType(c.activityType) === 'masajes'),
  };

  const getActiveNamesForType = (type: ActivityType): string[] => {
    const activeNames = catalogByType[type].filter((c) => c.active).map((c) => c.name);
    return activeNames.length > 0 ? activeNames : [MODALITY_CONFIG[type].fallbackActivityName];
  };

  const openCreateForm = (presetType: ActivityType = 'pausa_activa') => {
    setEditingItem(null);
    setItemType(presetType);
    setItemName(MODALITY_CONFIG[presetType].prefix);
    setItemDurationInput(String(ACTIVITY_TYPE_DEFAULT_MINUTES[presetType]));
    setItemDescription('');
    setItemActive(true);
    setIsFormOpen(true);
  };

  const openEditForm = (item: ActivityCatalogItem) => {
    const normalizedType = normalizeActivityType(item.activityType);
    setEditingItem(item);
    setItemName(item.name);
    setItemType(normalizedType);
    setItemDurationInput(
      String(item.defaultDurationMinutes || ACTIVITY_TYPE_DEFAULT_MINUTES[normalizedType])
    );
    setItemDescription(item.description || '');
    setItemActive(item.active !== false);
    setIsFormOpen(true);
  };

  const handleSelectModalType = (nextType: ActivityType) => {
    const prevPrefix = MODALITY_CONFIG[itemType].prefix;
    setItemType(nextType);
    if (!editingItem) {
      if (!itemName.trim() || itemName === prevPrefix) {
        setItemName(MODALITY_CONFIG[nextType].prefix);
      }
      setItemDurationInput(String(ACTIVITY_TYPE_DEFAULT_MINUTES[nextType]));
    }
  };

  const handleSaveCatalogForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    const duration = Math.max(
      MIN_ASSIGNMENT_DURATION_MINUTES,
      Math.min(
        MAX_ASSIGNMENT_DURATION_MINUTES,
        parseInt(itemDurationInput, 10) || ACTIVITY_TYPE_DEFAULT_MINUTES[itemType]
      )
    );

    const payload: ActivityCatalogItem = {
      id: editingItem ? editingItem.id : `cat_${Date.now()}`,
      name: itemName.trim(),
      activityType: itemType,
      defaultDurationMinutes: duration,
      description: itemDescription.trim(),
      active: itemActive,
    };

    if (editingItem) {
      onUpdateCatalogItem(payload, editingItem.name);
    } else {
      onAddCatalogItem(payload);
    }

    setIsFormOpen(false);
    setEditingItem(null);
  };

  const triggerSavedBadge = (id: string) => {
    setSavedToastId(id);
    setTimeout(() => {
      setSavedToastId((prev) => (prev === id ? null : prev));
    }, 1800);
  };

  const handleQuickSwitchAssignmentType = (asg: ClassAssignment, newType: ActivityType) => {
    if (normalizeActivityType(asg.activityType) === newType) return;
    const options = getActiveNamesForType(newType);
    const defaultName = options[0] || MODALITY_CONFIG[newType].fallbackActivityName;

    onUpdateAssignment({
      ...asg,
      activityType: newType,
      activityName: defaultName,
      durationMinutes: getDefaultDurationMinutes(newType, defaultName, activityCatalog),
    });
    triggerSavedBadge(asg.id);
  };

  const handleQuickChangeActivityName = (asg: ClassAssignment, newName: string) => {
    const currentNormType = normalizeActivityType(asg.activityType);
    const resolved = resolveDisciplineSelection(newName, currentNormType, activityCatalog);
    onUpdateAssignment({
      ...asg,
      activityType: resolved.activityType,
      activityName: resolved.activityName,
      durationMinutes: getDefaultDurationMinutes(
        resolved.activityType,
        resolved.activityName,
        activityCatalog
      ),
    });
    triggerSavedBadge(asg.id);
  };

  const uncatalogedTrainerSpecialties = collectMissingCatalogItemsFromTrainers(
    trainers,
    activityCatalog
  );

  const filteredAssignments = assignments.filter((a) => {
    if (filterType !== 'all' && normalizeActivityType(a.activityType) !== filterType) return false;
    if (searchAssignment.trim()) {
      const q = searchAssignment.toLowerCase();
      return (
        a.trainerName.toLowerCase().includes(q) ||
        a.companyName.toLowerCase().includes(q) ||
        a.sedeName.toLowerCase().includes(q) ||
        a.activityName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & KPI Cards */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Tipos de Asignación y Catálogo Oficial en Base de Datos
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Gestiona las 4 modalidades corporativas sincronizadas en Firestore:{' '}
                <strong>Pausa Activa</strong>, <strong>Clase Fitness</strong>,{' '}
                <strong>Gimnasio Corporativo</strong> y <strong>Masajes</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ALL_ACTIVITY_TYPES.map((type) => {
              const meta = MODALITY_CONFIG[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => openCreateForm(type)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${meta.createBtnClass}`}
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>{meta.createButtonLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {ALL_ACTIVITY_TYPES.map((type) => {
            const meta = MODALITY_CONFIG[type];
            const catalogCount = catalogByType[type].length;
            const assignedCount = assignments.filter(
              (a) => normalizeActivityType(a.activityType) === type
            ).length;
            return (
              <div key={type} className={`p-3.5 rounded-xl border ${meta.kpiCardClass}`}>
                <span className={`text-[11px] font-bold block ${meta.kpiTitleClass}`}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </span>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-xl font-black text-slate-900 font-mono tabular-nums">
                    {catalogCount}
                  </span>
                  <span className="text-[11px] text-slate-600 font-medium font-mono tabular-nums">
                    en catálogo · {assignedCount} asign.
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {uncatalogedTrainerSpecialties.length > 0 && (
          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-900 block">
                Especialidades de entrenadores pendientes de incorporar al catálogo (
                <span className="font-mono tabular-nums">
                  {uncatalogedTrainerSpecialties.length}
                </span>
                )
              </span>
              <span className="text-[11px] text-slate-500">
                Ya están disponibles al asignar clases; también puedes registrarlas en{' '}
                <strong className="font-mono">/activity_catalog</strong> con duración sugerida:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {uncatalogedTrainerSpecialties.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onAddCatalogItem(item)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-800 hover:text-red-700 border border-slate-300 hover:border-red-300 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition"
                  title={`Incorporar en ${ACTIVITY_TYPE_LABELS[item.activityType]} (${item.defaultDurationMinutes} min)`}
                >
                  <Plus className="w-3 h-3 text-red-600 shrink-0" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: Quick Editor for Existing Assignments */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center">
              <Layers className="w-4 h-4 mr-2 text-red-600 shrink-0" />
              Editar Tipo de Asignación en Sesiones Programadas (
              <span className="font-mono tabular-nums">{filteredAssignments.length}</span>)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Cambia con un clic cualquier asignación entre Pausa Activa, Clase Fitness, Gimnasio Corporativo o Masajes y selecciona su actividad específica.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex flex-wrap gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas
              </button>
              {ALL_ACTIVITY_TYPES.map((type) => {
                const meta = MODALITY_CONFIG[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(type)}
                    className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                      filterType === type
                        ? meta.activeTabClass
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {meta.shortButtonLabel}
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchAssignment}
                onChange={(e) => setSearchAssignment(e.target.value)}
                placeholder="Buscar entrenador o sede..."
                className="bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
        </div>

        {filteredAssignments.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            No hay asignaciones que coincidan con el filtro actual.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredAssignments.map((asg) => {
              const currentType = normalizeActivityType(asg.activityType);
              const assignedTrainer = trainers.find((t) => t.id === asg.trainerId);
              const groups = getAssignmentDisciplineGroups({
                activityType: currentType,
                selectedTrainer: assignedTrainer,
                trainers,
                activityCatalog,
                fallbackOptionsByType: {
                  pausa_activa: [MODALITY_CONFIG.pausa_activa.fallbackActivityName],
                  clase_fitness: [MODALITY_CONFIG.clase_fitness.fallbackActivityName],
                  gimnasio_corporativo: [MODALITY_CONFIG.gimnasio_corporativo.fallbackActivityName],
                  masajes: [MODALITY_CONFIG.masajes.fallbackActivityName],
                },
              });
              const allGroupedOptions = [
                ...groups.modalityCatalogOptions,
                ...groups.selectedTrainerSpecialties,
                ...groups.otherTrainerSpecialties,
                ...groups.otherCatalogByType.flatMap((g) => g.items),
              ];
              const hasCurrentInGroups = allGroupedOptions.includes(asg.activityName);

              const isClosed = Boolean(asg.closed);
              const isNonCompliant = Boolean(asg.nonCompliant);
              const isLockedRow = isClosed || isNonCompliant;

              return (
                <div
                  key={asg.id}
                  className={`p-3.5 rounded-xl border flex flex-col xl:flex-row xl:items-center justify-between gap-3 transition ${
                    isNonCompliant
                      ? 'border-rose-300 bg-rose-50/60'
                      : isClosed
                        ? 'border-slate-300 bg-slate-100/80'
                        : 'border-slate-200 hover:border-red-200 bg-slate-50/60'
                  }`}
                >
                  {/* Left Info */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {isNonCompliant && (
                        <span className="inline-flex items-center font-extrabold text-rose-700">
                          <Ban className="w-3.5 h-3.5 mr-1 shrink-0" />
                          No Cerrada / Bloqueada ·
                        </span>
                      )}
                      {isClosed && !isNonCompliant && (
                        <span className="inline-flex items-center font-extrabold text-emerald-800">
                          <Lock className="w-3.5 h-3.5 mr-1 shrink-0" />
                          Completada y Cerrada ·
                        </span>
                      )}
                      <span className="inline-flex items-center font-bold text-slate-900">
                        <User className="w-3.5 h-3.5 mr-1 text-red-600 shrink-0" />
                        {asg.trainerName}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="inline-flex items-center font-semibold text-slate-700">
                        <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
                        {asg.companyName} — {asg.sedeName}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`font-mono tabular-nums font-bold ${
                          isLockedRow ? 'text-slate-500 line-through' : 'text-red-600'
                        }`}
                      >
                        {asg.time} hrs
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="inline-flex items-center font-mono tabular-nums font-bold text-slate-700">
                        <Timer className="w-3 h-3 mr-1 text-red-500 shrink-0" />
                        {formatDurationHoursMinutes(
                          getAssignmentDurationMinutes(asg, activityCatalog)
                        )}
                      </span>
                      {savedToastId === asg.id && (
                        <span className="inline-flex items-center text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 shrink-0" />
                          Guardado en Firestore
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Direct Type & Sub-activity Controls */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    {/* 4-Modality Segmented Control */}
                    <div
                      className={`grid grid-cols-2 sm:grid-cols-4 gap-1 bg-white p-1 rounded-xl border border-slate-300 text-xs font-bold shrink-0 ${
                        isLockedRow ? 'opacity-60' : ''
                      }`}
                    >
                      {ALL_ACTIVITY_TYPES.map((type) => {
                        const meta = MODALITY_CONFIG[type];
                        const isSelected = currentType === type;
                        return (
                          <button
                            key={type}
                            type="button"
                            disabled={isLockedRow}
                            onClick={() => handleQuickSwitchAssignmentType(asg, type)}
                            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 disabled:cursor-not-allowed cursor-pointer ${
                              isSelected
                                ? meta.activeTabClass
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {meta.shortButtonLabel}
                          </button>
                        );
                      })}
                    </div>

                    {/* Specific Activity / Specialty Selector */}
                    <select
                      value={asg.activityName}
                      disabled={isLockedRow}
                      onChange={(e) => handleQuickChangeActivityName(asg, e.target.value)}
                      className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-red-500 sm:w-64 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    >
                      {!hasCurrentInGroups && asg.activityName && (
                        <option value={asg.activityName}>{asg.activityName}</option>
                      )}
                      <optgroup label={`Catálogo — ${ACTIVITY_TYPE_LABELS[currentType]}`}>
                        {groups.modalityCatalogOptions.map((opt) => (
                          <option key={`mod_${opt}`} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </optgroup>
                      {groups.selectedTrainerSpecialties.length > 0 && (
                        <optgroup
                          label={`Especialidades de ${assignedTrainer?.name || asg.trainerName}`}
                        >
                          {groups.selectedTrainerSpecialties.map((spec) => (
                            <option key={`tr_${spec}`} value={spec}>
                              {spec}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {groups.otherTrainerSpecialties.length > 0 && (
                        <optgroup label="Otras Especialidades en Entrenadores (BD)">
                          {groups.otherTrainerSpecialties.map((spec) => (
                            <option key={`other_tr_${spec}`} value={spec}>
                              {spec}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {groups.otherCatalogByType.map((grp) => (
                        <optgroup key={grp.type} label={`Catálogo — ${grp.label}`}>
                          {grp.items.map((opt) => (
                            <option key={`cat_${grp.type}_${opt}`} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => onEditFullAssignment(asg)}
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-300 text-xs font-semibold flex items-center justify-center cursor-pointer"
                      title={
                        isLockedRow
                          ? 'Ver detalles o rehabilitar asignación bloqueada'
                          : 'Editar todos los detalles de la asignación'
                      }
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: 4-Modality Editable Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ALL_ACTIVITY_TYPES.map((type) => {
          const meta = MODALITY_CONFIG[type];
          const items = catalogByType[type];
          return (
            <div
              key={type}
              className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <span className={`text-[11px] font-bold block ${meta.kickerTextClass}`}>
                    {meta.indexLabel}
                  </span>
                  <h4 className="text-base font-bold text-slate-900 mt-0.5">
                    {meta.catalogTitle} (
                    <span className="font-mono tabular-nums">{items.length}</span>)
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => openCreateForm(type)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 shadow-xs whitespace-nowrap shrink-0 cursor-pointer ${meta.addCardBtnClass}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </div>

              {items.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-500">
                  Sin actividades registradas en esta modalidad. Haz clic en «Agregar» para crear la primera.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                        item.active
                          ? meta.cardItemActiveClass
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                            {item.name}
                          </h5>
                          {!item.active && (
                            <span className="text-[11px] text-slate-500 font-semibold">
                              · Inactiva
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-slate-600">{item.description}</p>
                        )}
                        <span className="inline-flex items-center text-[11px] font-mono tabular-nums text-slate-500">
                          <Clock className={`w-3 h-3 mr-1 ${meta.clockIconClass}`} />
                          Duración sugerida:{' '}
                          {formatDurationHoursMinutes(item.defaultDurationMinutes)}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditForm(item)}
                          className={`p-1.5 rounded-lg bg-white text-slate-600 border border-slate-200 transition cursor-pointer ${meta.editHoverClass}`}
                          title="Editar actividad o cambiar de modalidad"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (items.length > 1) {
                              onDeleteCatalogItem(item.id);
                            }
                          }}
                          disabled={items.length <= 1}
                          className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                          title="Eliminar del catálogo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal for Create / Edit Catalog Activity Type */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-rose-600 p-4 sm:p-5 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-bold text-base">
                  {editingItem ? 'Editar Tipo de Actividad' : 'Crear Tipo de Actividad'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-white/80 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCatalogForm} className="p-5 space-y-4 text-xs text-slate-800">
              {/* Category Selector: 4 Modalities */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Tipo Principal de Asignación *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ACTIVITY_TYPES.map((type) => {
                    const meta = MODALITY_CONFIG[type];
                    const isSelected = itemType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleSelectModalType(type)}
                        className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center space-x-1.5 transition whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? meta.modalActiveBtnClass
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        <span>{ACTIVITY_TYPE_LABELS[type]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nombre de la Actividad en Catálogo *
                </label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder={`Ej: ${MODALITY_CONFIG[itemType].fallbackActivityName}`}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Suggested Duration in Hours & Minutes (up to 8 hours) */}
              {(() => {
                const resolvedItemDuration = Math.max(
                  MIN_ASSIGNMENT_DURATION_MINUTES,
                  Math.min(
                    MAX_ASSIGNMENT_DURATION_MINUTES,
                    parseInt(itemDurationInput, 10) || ACTIVITY_TYPE_DEFAULT_MINUTES[itemType]
                  )
                );
                const { hours: itemHours, minutes: itemMins } =
                  splitMinutesToHoursAndMinutes(resolvedItemDuration);

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="font-semibold text-slate-700">
                        Duración Estimada (Horas y Minutos · hasta 8 h)
                      </label>
                      <span className="font-mono tabular-nums font-bold text-red-700">
                        {formatDurationHoursMinutes(resolvedItemDuration)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-500 mb-1">
                          Horas (0 a 8 h)
                        </span>
                        <select
                          value={itemHours}
                          onChange={(e) => {
                            const nextH = parseInt(e.target.value, 10) || 0;
                            const nextM = nextH >= 8 ? 0 : itemMins;
                            setItemDurationInput(
                              String(
                                combineHoursAndMinutes(
                                  nextH,
                                  nextH === 0 && nextM < 5 ? 15 : nextM
                                )
                              )
                            );
                          }}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-red-500"
                        >
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                            <option key={h} value={h}>
                              {h} {h === 1 ? 'hora' : 'horas'}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="block text-[10px] font-semibold text-slate-500 mb-1">
                          Minutos (0 a 59 min)
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={itemHours >= 8}
                          value={itemHours >= 8 ? '0' : String(itemMins)}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^0-9]/g, '');
                            const parsedM = digits === '' ? 0 : Math.min(59, parseInt(digits, 10));
                            setItemDurationInput(
                              String(combineHoursAndMinutes(itemHours, parsedM))
                            );
                          }}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-center text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-red-500 disabled:opacity-50"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {[20, 30, 50, 60, 120, 240, 360, 480].map((preset) => {
                        const activePreset = resolvedItemDuration === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setItemDurationInput(String(preset))}
                            className={`px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums font-bold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                              activePreset
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-slate-50 text-slate-700 border-slate-300 hover:border-red-300'
                            }`}
                          >
                            {formatDurationHoursMinutes(preset, true)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Description */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Descripción / Enfoque (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Describe brevemente el enfoque de esta sesión..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Active status */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-700">Disponible para asignar</span>
                <input
                  type="checkbox"
                  checked={itemActive}
                  onChange={(e) => setItemActive(e.target.checked)}
                  className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md cursor-pointer"
                >
                  Guardar en Base de Datos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
