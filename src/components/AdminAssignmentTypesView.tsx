import React, { useState } from 'react';
import {
  ActivityCatalogItem,
  ActivityType,
  ClassAssignment,
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
import { getAssignmentDurationMinutes, getDefaultDurationMinutes } from '../utils/sessionAlarm';

interface AdminAssignmentTypesViewProps {
  activityCatalog: ActivityCatalogItem[];
  assignments: ClassAssignment[];
  onAddCatalogItem: (item: ActivityCatalogItem) => void;
  onUpdateCatalogItem: (item: ActivityCatalogItem, previousName?: string) => void;
  onDeleteCatalogItem: (id: string) => void;
  onUpdateAssignment: (assignment: ClassAssignment) => void;
  onEditFullAssignment: (assignment: ClassAssignment) => void;
}

export const AdminAssignmentTypesView: React.FC<AdminAssignmentTypesViewProps> = ({
  activityCatalog,
  assignments,
  onAddCatalogItem,
  onUpdateCatalogItem,
  onDeleteCatalogItem,
  onUpdateAssignment,
  onEditFullAssignment,
}) => {
  // Modal / Form state for creating or editing a catalog item
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ActivityCatalogItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState<ActivityType>('pausa_activa');
  const [itemDurationInput, setItemDurationInput] = useState<string>('20');
  const [itemDescription, setItemDescription] = useState('');
  const [itemActive, setItemActive] = useState(true);

  // Filter for assignments quick-type editor
  const [searchAssignment, setSearchAssignment] = useState('');
  const [filterType, setFilterType] = useState<'all' | ActivityType>('all');
  const [savedToastId, setSavedToastId] = useState<string | null>(null);

  const pausaCatalog = activityCatalog.filter((c) => c.activityType === 'pausa_activa');
  const fitnessCatalog = activityCatalog.filter((c) => c.activityType === 'clase_fitness');

  const activePausaNames = pausaCatalog.filter((c) => c.active).map((c) => c.name);
  const activeFitnessNames = fitnessCatalog.filter((c) => c.active).map((c) => c.name);

  const openCreateForm = (presetType: ActivityType = 'pausa_activa') => {
    setEditingItem(null);
    setItemType(presetType);
    setItemName(presetType === 'pausa_activa' ? 'Pausa Activa: ' : 'Clase Fitness: ');
    setItemDurationInput(presetType === 'pausa_activa' ? '20' : '50');
    setItemDescription('');
    setItemActive(true);
    setIsFormOpen(true);
  };

  const openEditForm = (item: ActivityCatalogItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemType(item.activityType);
    setItemDurationInput(String(item.defaultDurationMinutes || 30));
    setItemDescription(item.description || '');
    setItemActive(item.active !== false);
    setIsFormOpen(true);
  };

  const handleSaveCatalogForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    const duration = Math.max(5, parseInt(itemDurationInput, 10) || 20);

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
    if (asg.activityType === newType) return;
    const options = newType === 'pausa_activa' ? activePausaNames : activeFitnessNames;
    const defaultName =
      options[0] ||
      (newType === 'pausa_activa'
        ? 'Pausa Activa: Ergonomía y Estiramientos'
        : 'Clase Fitness: Entrenamiento Funcional');

    onUpdateAssignment({
      ...asg,
      activityType: newType,
      activityName: defaultName,
      durationMinutes: getDefaultDurationMinutes(newType, defaultName, activityCatalog),
    });
    triggerSavedBadge(asg.id);
  };

  const handleQuickChangeActivityName = (asg: ClassAssignment, newName: string) => {
    onUpdateAssignment({
      ...asg,
      activityName: newName,
      durationMinutes: getDefaultDurationMinutes(asg.activityType, newName, activityCatalog),
    });
    triggerSavedBadge(asg.id);
  };

  const filteredAssignments = assignments.filter((a) => {
    if (filterType !== 'all' && a.activityType !== filterType) return false;
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

  const pausasAssignedCount = assignments.filter((a) => a.activityType === 'pausa_activa').length;
  const fitnessAssignedCount = assignments.filter((a) => a.activityType === 'clase_fitness').length;

  return (
    <div className="space-y-6">
      {/* Top Header & KPI Cards */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Tipos de Asignación: Clases Fitness y Pausas Activas
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Edita rápidamente si una asignación es Clase Fitness o Pausa Activa, y personaliza el catálogo de actividades disponibles para entrenadores y administración.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openCreateForm('pausa_activa')}
              className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center space-x-1.5 transition"
            >
              <Plus className="w-4 h-4 text-amber-600" />
              <span>Nueva Pausa Activa</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateForm('clase_fitness')}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Clase Fitness</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <span className="text-[11px] font-bold text-amber-800 block">Catálogo Pausas Activas</span>
            <span className="text-xl font-black text-slate-900 font-mono">{pausaCatalog.length}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200">
            <span className="text-[11px] font-bold text-red-800 block">Catálogo Clases Fitness</span>
            <span className="text-xl font-black text-slate-900 font-mono">{fitnessCatalog.length}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 block">Asignaciones Pausa Activa</span>
            <span className="text-xl font-black text-slate-900 font-mono">{pausasAssignedCount}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 block">Asignaciones Clase Fitness</span>
            <span className="text-xl font-black text-slate-900 font-mono">{fitnessAssignedCount}</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: Quick Editor for Existing Assignments (Switch between Clase or Pausa Activa) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center">
              <Layers className="w-4 h-4 mr-2 text-red-600" />
              Editar Tipo de Asignación en Clases Programadas ({filteredAssignments.length})
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Cambia con un clic cualquier asignación activa entre <strong>Pausa Activa</strong> o <strong>Clase Fitness</strong> y elige su sub-actividad específica.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFilterType('pausa_activa')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'pausa_activa' ? 'bg-amber-500 text-white shadow-2xs font-bold' : 'text-slate-600'
                }`}
              >
                Pausa Activa
              </button>
              <button
                type="button"
                onClick={() => setFilterType('clase_fitness')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'clase_fitness' ? 'bg-red-600 text-white shadow-2xs font-bold' : 'text-slate-600'
                }`}
              >
                Clase Fitness
              </button>
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
              const options =
                asg.activityType === 'pausa_activa' ? activePausaNames : activeFitnessNames;
              const selectOptions = options.includes(asg.activityName)
                ? options
                : [asg.activityName, ...options];

              const isClosed = Boolean(asg.closed);
              const isNonCompliant = Boolean(asg.nonCompliant);
              const isLockedRow = isClosed || isNonCompliant;

              return (
                <div
                  key={asg.id}
                  className={`p-3.5 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition ${
                    isNonCompliant
                      ? 'border-rose-300 bg-rose-50/60'
                      : isClosed
                        ? 'border-slate-300 bg-slate-100/80'
                        : 'border-slate-200 hover:border-red-200 bg-slate-50/60'
                  }`}
                >
                  {/* Left Info */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isNonCompliant && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-rose-700 text-white">
                          <Ban className="w-3 h-3 mr-1 text-rose-200" />
                          Incumplida • Bloqueada
                        </span>
                      )}
                      {isClosed && !isNonCompliant && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-slate-800 text-white">
                          <Lock className="w-3 h-3 mr-1 text-emerald-400" />
                          Completada y Cerrada
                        </span>
                      )}
                      <span className="inline-flex items-center text-xs font-bold text-slate-900">
                        <User className="w-3.5 h-3.5 mr-1 text-red-600" />
                        {asg.trainerName}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="inline-flex items-center text-xs font-semibold text-slate-700">
                        <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        {asg.companyName} — {asg.sedeName}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200 ${
                          isLockedRow ? 'text-slate-500 line-through' : 'text-red-600'
                        }`}
                      >
                        {asg.time} hrs
                      </span>
                      <span className="inline-flex items-center font-mono text-[11px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        <Timer className="w-3 h-3 mr-1 text-red-500" />
                        {getAssignmentDurationMinutes(asg, activityCatalog)} min
                      </span>
                      {savedToastId === asg.id && (
                        <span className="inline-flex items-center text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Guardado
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Direct Type & Sub-activity Controls */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    {/* Toggle Tipo: Pausa Activa vs Clase Fitness */}
                    <div
                      className={`grid grid-cols-2 bg-white p-1 rounded-xl border border-slate-300 text-xs font-bold shrink-0 ${
                        isLockedRow ? 'opacity-60' : ''
                      }`}
                    >
                      <button
                        type="button"
                        disabled={isLockedRow}
                        onClick={() => handleQuickSwitchAssignmentType(asg, 'pausa_activa')}
                        className={`px-3 py-1.5 rounded-lg transition disabled:cursor-not-allowed ${
                          asg.activityType === 'pausa_activa'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Pausa Activa
                      </button>
                      <button
                        type="button"
                        disabled={isLockedRow}
                        onClick={() => handleQuickSwitchAssignmentType(asg, 'clase_fitness')}
                        className={`px-3 py-1.5 rounded-lg transition disabled:cursor-not-allowed ${
                          asg.activityType === 'clase_fitness'
                            ? 'bg-red-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Clase Fitness
                      </button>
                    </div>

                    {/* Specific Activity Selector */}
                    <select
                      value={asg.activityName}
                      disabled={isLockedRow}
                      onChange={(e) => handleQuickChangeActivityName(asg, e.target.value)}
                      className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-red-500 sm:w-64 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    >
                      {selectOptions.map((opt, idx) => (
                        <option key={idx} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => onEditFullAssignment(asg)}
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-300 text-xs font-semibold flex items-center justify-center"
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

      {/* SECTION 2: Editable Catalog of Pausas Activas & Clases Fitness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Pausas Activas */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">
                Modalidad 1
              </span>
              <h4 className="text-base font-bold text-slate-900 mt-1">
                Catálogo de Pausas Activas ({pausaCatalog.length})
              </h4>
            </div>
            <button
              type="button"
              onClick={() => openCreateForm('pausa_activa')}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center space-x-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {pausaCatalog.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                  item.active
                    ? 'bg-amber-50/30 border-amber-200/80'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h5 className="font-bold text-slate-900 text-xs sm:text-sm">{item.name}</h5>
                    {!item.active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">
                        Inactiva
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-slate-600">{item.description}</p>
                  )}
                  <span className="inline-flex items-center text-[11px] font-mono text-slate-500">
                    <Clock className="w-3 h-3 mr-1 text-amber-600" />
                    Duración sugerida: {item.defaultDurationMinutes} min
                  </span>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(item)}
                    className="p-1.5 rounded-lg bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-200"
                    title="Editar actividad o cambiar a Clase Fitness"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pausaCatalog.length > 1) {
                        onDeleteCatalogItem(item.id);
                      }
                    }}
                    disabled={pausaCatalog.length <= 1}
                    className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 disabled:opacity-30"
                    title="Eliminar del catálogo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Clases Fitness */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-red-100 text-red-800 border border-red-200">
                Modalidad 2
              </span>
              <h4 className="text-base font-bold text-slate-900 mt-1">
                Catálogo de Clases Fitness ({fitnessCatalog.length})
              </h4>
            </div>
            <button
              type="button"
              onClick={() => openCreateForm('clase_fitness')}
              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center space-x-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {fitnessCatalog.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                  item.active
                    ? 'bg-red-50/30 border-red-200/80'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h5 className="font-bold text-slate-900 text-xs sm:text-sm">{item.name}</h5>
                    {!item.active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">
                        Inactiva
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-slate-600">{item.description}</p>
                  )}
                  <span className="inline-flex items-center text-[11px] font-mono text-slate-500">
                    <Clock className="w-3 h-3 mr-1 text-red-600" />
                    Duración sugerida: {item.defaultDurationMinutes} min
                  </span>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(item)}
                    className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-200"
                    title="Editar actividad o cambiar a Pausa Activa"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (fitnessCatalog.length > 1) {
                        onDeleteCatalogItem(item.id);
                      }
                    }}
                    disabled={fitnessCatalog.length <= 1}
                    className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 disabled:opacity-30"
                    title="Eliminar del catálogo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
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
                className="text-white/80 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCatalogForm} className="p-5 space-y-4 text-xs text-slate-800">
              {/* Category Selector: Clase Fitness vs Pausa Activa */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Tipo Principal de Asignación *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setItemType('pausa_activa')}
                    className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center space-x-1.5 transition ${
                      itemType === 'pausa_activa'
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {itemType === 'pausa_activa' && <Check className="w-3.5 h-3.5" />}
                    <span>Pausa Activa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setItemType('clase_fitness')}
                    className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center space-x-1.5 transition ${
                      itemType === 'clase_fitness'
                        ? 'bg-red-600 border-red-600 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {itemType === 'clase_fitness' && <Check className="w-3.5 h-3.5" />}
                    <span>Clase Fitness</span>
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nombre de la Clase o Pausa Activa *
                </label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Ej: Clase Fitness: Boxeo Funcional"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Suggested Duration */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Duración Estimada (minutos)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={itemDurationInput}
                  onChange={(e) => setItemDurationInput(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="30"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-red-500"
                />
              </div>

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
                  className="w-4 h-4 accent-red-600 rounded"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
