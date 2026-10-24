import React, { useState, useEffect } from 'react';
import { ClassAssignment, Company, Trainer, ActivityType, ActivityCatalogItem } from '../types';
import { Calendar, Clock, Activity, Building2, User, MapPin, Settings2, Timer, Minus, Plus, Lock, Unlock, Ban } from 'lucide-react';
import {
  getDefaultDurationMinutes,
  getAssignmentDurationMinutes,
  calculateEndTimeHHMM,
} from '../utils/sessionAlarm';
import { formatLocalYYYYMMDD } from '../utils/assignmentLock';

export interface AssignmentPreset {
  frequency?: 'semanal' | 'mensual' | 'fecha_unica';
  dayOfWeek?: number;
  dayOfMonth?: number;
  date?: string;
  trainerId?: string;
  companyId?: string;
  time?: string;
  durationMinutes?: number;
}

interface AdminAssignmentModalProps {
  assignment: ClassAssignment | null; // null if creating a new one
  trainers: Trainer[];
  companies: Company[];
  activityCatalog?: ActivityCatalogItem[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (assignment: ClassAssignment) => void;
  onManageActivityTypes?: () => void;
  initialPreset?: AssignmentPreset | null;
}

const PAUSA_OPTIONS = [
  'Pausa Activa: Ergonomía y Estiramientos',
  'Pausa Activa: Movilidad Articular y Postura',
  'Pausa Activa: Respiración y Anti-estrés',
  'Pausa Activa: Coordinación y Gimnasia Cerebral',
];

const FITNESS_OPTIONS = [
  'Clase Fitness: Entrenamiento Funcional',
  'Clase Fitness: Yoga Corporativo',
  'Clase Fitness: Pilates Mat',
  'Clase Fitness: Zumba y Ritmos Latinos',
  'Clase Fitness: HIIT y Cardio Quema-grasa',
  'Clase Fitness: Tonificación y Fuerza con Bandas',
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

const DURATION_PRESETS = [15, 20, 30, 45, 50, 60, 90];

export const AdminAssignmentModal: React.FC<AdminAssignmentModalProps> = ({
  assignment,
  trainers,
  companies,
  activityCatalog = [],
  isOpen,
  onClose,
  onSave,
  onManageActivityTypes,
  initialPreset,
}) => {
  const pausaOptions =
    activityCatalog.filter((c) => c.activityType === 'pausa_activa' && c.active).map((c) => c.name);
  const fitnessOptions =
    activityCatalog.filter((c) => c.activityType === 'clase_fitness' && c.active).map((c) => c.name);

  const effectivePausaOptions = pausaOptions.length > 0 ? pausaOptions : PAUSA_OPTIONS;
  const effectiveFitnessOptions = fitnessOptions.length > 0 ? fitnessOptions : FITNESS_OPTIONS;

  const [trainerId, setTrainerId] = useState(trainers[0]?.id || '');
  const [companyId, setCompanyId] = useState(companies[0]?.id || '');
  const [sedeId, setSedeId] = useState(companies[0]?.sedes[0]?.id || '');

  const [frequency, setFrequency] = useState<'semanal' | 'mensual' | 'fecha_unica'>('semanal');
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(15);
  const [specificDate, setSpecificDate] = useState<string>(() => formatLocalYYYYMMDD(new Date()));
  const [time, setTime] = useState<string>('08:30');
  const [durationInput, setDurationInput] = useState<string>('20');

  const [activityType, setActivityType] = useState<ActivityType>('pausa_activa');
  const [activityName, setActivityName] = useState<string>(effectivePausaOptions[0]);
  const [locationArea, setLocationArea] = useState<string>('Piso 4 - Sala SUM');
  const [expectedAttendeesInput, setExpectedAttendeesInput] = useState<string>('20');
  const [notes, setNotes] = useState<string>('');
  const [active, setActive] = useState<boolean>(true);
  const [closed, setClosed] = useState<boolean>(false);
  const [nonCompliant, setNonCompliant] = useState<boolean>(false);

  // When company changes, update available sedes
  const selectedCompany = companies.find((c) => c.id === companyId) || companies[0];

  useEffect(() => {
    if (assignment) {
      setTrainerId(assignment.trainerId);
      setCompanyId(assignment.companyId);
      setSedeId(assignment.sedeId);
      setFrequency(assignment.frequency || 'semanal');
      setDayOfWeek(assignment.dayOfWeek || 1);
      setDayOfMonth(assignment.dayOfMonth || 15);
      setSpecificDate(assignment.date || formatLocalYYYYMMDD(new Date()));
      setTime(assignment.time || '08:30');
      setActivityType(assignment.activityType || 'pausa_activa');
      setActivityName(assignment.activityName || effectivePausaOptions[0]);
      setDurationInput(
        String(getAssignmentDurationMinutes(assignment, activityCatalog))
      );
      setLocationArea(assignment.locationArea || 'Piso 4 - Sala SUM');
      setExpectedAttendeesInput(String(assignment.expectedAttendees ?? 20));
      setNotes(assignment.notes || '');
      setActive(assignment.active !== false);
      setClosed(Boolean(assignment.closed));
      setNonCompliant(Boolean(assignment.nonCompliant));
    } else {
      const defaultActName = effectivePausaOptions[0];
      const defaultDur =
        initialPreset?.durationMinutes ||
        getDefaultDurationMinutes('pausa_activa', defaultActName, activityCatalog);

      setTrainerId(initialPreset?.trainerId || trainers[0]?.id || '');
      const presetComp = (initialPreset?.companyId && companies.find(c => c.id === initialPreset.companyId)) || companies[0];
      setCompanyId(presetComp?.id || '');
      setSedeId(presetComp?.sedes[0]?.id || '');
      setFrequency(initialPreset?.frequency || 'semanal');
      setDayOfWeek(initialPreset?.dayOfWeek ?? 1);
      setDayOfMonth(initialPreset?.dayOfMonth ?? 15);
      setSpecificDate(initialPreset?.date || formatLocalYYYYMMDD(new Date()));
      setTime(initialPreset?.time || '08:30');
      setActivityType('pausa_activa');
      setActivityName(defaultActName);
      setDurationInput(String(defaultDur));
      setLocationArea('Piso 4 - Sala SUM');
      setExpectedAttendeesInput('0');
      setNotes('');
      setActive(true);
      setClosed(false);
      setNonCompliant(false);
    }
  }, [assignment, trainers, companies, isOpen, initialPreset]);

  if (!isOpen) return null;

  const handleCompanyChange = (cId: string) => {
    setCompanyId(cId);
    const comp = companies.find((c) => c.id === cId);
    if (comp && comp.sedes.length > 0) {
      setSedeId(comp.sedes[0].id);
    }
  };

  const resolvedDurationMinutes = Math.max(
    5,
    Math.min(
      240,
      parseInt(durationInput, 10) ||
        getDefaultDurationMinutes(activityType, activityName, activityCatalog)
    )
  );
  const estimatedEndTime = calculateEndTimeHHMM(time, resolvedDurationMinutes);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trainer = trainers.find((t) => t.id === trainerId) || trainers[0];
    const company = companies.find((c) => c.id === companyId) || companies[0];
    const sede = company?.sedes.find((s) => s.id === sedeId) || company?.sedes[0];

    const existingCompletedDates = new Set(assignment?.completedDates || []);
    const existingMissedDates = new Set(assignment?.missedDates || []);
    const existingReopenedDates = new Set(assignment?.reopenedDates || []);

    if (frequency === 'fecha_unica' && specificDate) {
      if (closed) {
        existingCompletedDates.add(specificDate);
        existingMissedDates.delete(specificDate);
      } else {
        existingCompletedDates.delete(specificDate);
      }

      if (nonCompliant) {
        existingMissedDates.add(specificDate);
        existingCompletedDates.delete(specificDate);
        existingReopenedDates.delete(specificDate);
      } else if (assignment?.nonCompliant) {
        // Admin explicitly cleared non-compliant status -> rehabilitate this date
        existingMissedDates.delete(specificDate);
        existingReopenedDates.add(specificDate);
      }
    }

    const nowTime = new Date().toLocaleTimeString('es-MX', { hour12: false });

    const saved: ClassAssignment = {
      id: assignment ? assignment.id : `asg_${Date.now()}`,
      trainerId: trainer.id,
      trainerName: trainer.name,
      companyId: company.id,
      companyName: company.name,
      sedeId: sede?.id || 'sede_default',
      sedeName: sede?.name || 'Sede Principal',
      sedeAddress: sede?.address || '',
      frequency,
      dayOfWeek: frequency === 'semanal' ? Number(dayOfWeek) : undefined,
      dayOfMonth: frequency === 'mensual' ? Number(dayOfMonth) : undefined,
      date: frequency === 'fecha_unica' ? specificDate : undefined,
      time,
      durationMinutes: resolvedDurationMinutes,
      activityType,
      activityName,
      locationArea: locationArea.trim() || 'Área Principal',
      expectedAttendees: Math.max(0, parseInt(expectedAttendeesInput, 10) || 0),
      notes: notes.trim(),
      active,
      closed: nonCompliant ? false : closed,
      closedAt:
        !nonCompliant && closed
          ? assignment?.closedAt || nowTime
          : undefined,
      completedDates: Array.from(existingCompletedDates),
      nonCompliant,
      nonCompliantReason: nonCompliant
        ? assignment?.nonCompliantReason || 'manual_admin'
        : undefined,
      nonCompliantAt: nonCompliant ? assignment?.nonCompliantAt || nowTime : undefined,
      missedDates: Array.from(existingMissedDates),
      reopenedDates: Array.from(existingReopenedDates),
    };

    onSave(saved);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner shrink-0">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                {assignment ? 'Editar Asignación de Clase' : 'Programar y Asignar Clase'}
              </h3>
              <p className="text-xs text-red-100">
                Planificación semanal o mensual de sesiones y duración para entrenadores
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-slate-800 text-xs flex-1 overflow-y-auto">
          {/* Trainer selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center">
              <User className="w-3.5 h-3.5 mr-1 text-red-600" />
              Entrenador Asignado *
            </label>
            <select
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-red-500"
            >
              {trainers.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name} ({tr.specialties.slice(0, 2).join(', ')})
                </option>
              ))}
            </select>
          </div>

          {/* Company & Sede */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center">
                <Building2 className="w-3.5 h-3.5 mr-1 text-red-600" />
                Empresa Cliente *
              </label>
              <select
                value={companyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              >
                {companies.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1 text-red-600" />
                Sede Oficial *
              </label>
              <select
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              >
                {selectedCompany?.sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Frequency (Semanal / Mensual / Fecha Única) + Duration */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <span className="font-bold text-slate-900 block">
              Frecuencia, Horario y Duración de la Asignación
            </span>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFrequency('semanal')}
                className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition ${
                  frequency === 'semanal'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Recurrente Semanal
              </button>

              <button
                type="button"
                onClick={() => setFrequency('mensual')}
                className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition ${
                  frequency === 'mensual'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Recurrente Mensual
              </button>

              <button
                type="button"
                onClick={() => setFrequency('fecha_unica')}
                className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition ${
                  frequency === 'fecha_unica'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Fecha Única
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {frequency === 'semanal' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Día de la Semana *
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(parseInt(e.target.value) || 1)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-red-500"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d.value} value={d.value}>
                        Cada {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {frequency === 'mensual' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Día del Mes (1 al 31) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-red-500"
                  />
                </div>
              )}

              {frequency === 'fecha_unica' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Fecha Específica *
                  </label>
                  <input
                    type="date"
                    value={specificDate}
                    onChange={(e) => setSpecificDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-red-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1 text-red-600" />
                  Hora de Inicio Programada *
                </label>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            {/* Duration of Assignment Field */}
            <div className="pt-2.5 border-t border-slate-200/90 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="assignment-duration-input"
                  className="text-[11px] font-bold text-slate-800 flex items-center"
                >
                  <Timer className="w-3.5 h-3.5 mr-1 text-red-600" />
                  Tiempo / Duración de la Asignación (minutos) *
                </label>
                {estimatedEndTime && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-[11px] font-mono font-bold text-red-700">
                    {time} – {estimatedEndTime} hrs ({resolvedDurationMinutes} min)
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                {/* Quick duration presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {DURATION_PRESETS.map((mins) => {
                    const isSelected = parseInt(durationInput, 10) === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDurationInput(String(mins))}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-red-300 hover:bg-red-50/40'
                        }`}
                      >
                        {mins}m
                      </button>
                    );
                  })}
                </div>

                {/* Custom numeric input with -5 / +5 steppers */}
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseInt(durationInput, 10) || resolvedDurationMinutes;
                      setDurationInput(String(Math.max(5, cur - 5)));
                    }}
                    className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center transition"
                    title="Restar 5 minutos"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <div className="relative">
                    <input
                      id="assignment-duration-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      value={durationInput}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        if (digits === '') {
                          setDurationInput('');
                        } else {
                          setDurationInput(String(Math.min(240, parseInt(digits, 10))));
                        }
                      }}
                      onBlur={() => {
                        if (!durationInput.trim() || parseInt(durationInput, 10) < 5) {
                          setDurationInput(
                            String(
                              getDefaultDurationMinutes(
                                activityType,
                                activityName,
                                activityCatalog
                              )
                            )
                          );
                        }
                      }}
                      className="w-20 bg-white border border-slate-300 rounded-lg pl-2.5 pr-8 py-1.5 text-center text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-red-500"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 pointer-events-none">
                      min
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseInt(durationInput, 10) || resolvedDurationMinutes;
                      setDurationInput(String(Math.min(240, cur + 5)));
                    }}
                    className="w-8 h-8 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-2xs transition"
                    title="Sumar 5 minutos"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Define cuánto tiempo debe durar esta sesión; configurará automáticamente el cronómetro y la alarma de salida del entrenador.
              </p>
            </div>
          </div>

          {/* Activity Type & Sub-activity */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center">
                <Activity className="w-3.5 h-3.5 mr-1 text-red-600" />
                Tipo de Asignación (Clase o Pausa Activa)
              </span>
              {onManageActivityTypes && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onManageActivityTypes();
                  }}
                  className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline flex items-center space-x-1"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>Editar catálogo</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Modalidad Principal *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextAct = effectivePausaOptions[0];
                      setActivityType('pausa_activa');
                      setActivityName(nextAct);
                      setDurationInput(
                        String(getDefaultDurationMinutes('pausa_activa', nextAct, activityCatalog))
                      );
                    }}
                    className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition ${
                      activityType === 'pausa_activa'
                        ? 'bg-red-50 border-red-500 text-red-700 font-bold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Pausa Activa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextAct = effectiveFitnessOptions[0];
                      setActivityType('clase_fitness');
                      setActivityName(nextAct);
                      setDurationInput(
                        String(getDefaultDurationMinutes('clase_fitness', nextAct, activityCatalog))
                      );
                    }}
                    className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition ${
                      activityType === 'clase_fitness'
                        ? 'bg-red-50 border-red-500 text-red-700 font-bold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Clase Fitness
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Actividad / Clase Específica *
                </label>
                <select
                  value={activityName}
                  onChange={(e) => {
                    const nextAct = e.target.value;
                    setActivityName(nextAct);
                    setDurationInput(
                      String(getDefaultDurationMinutes(activityType, nextAct, activityCatalog))
                    );
                  }}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
                >
                  {(() => {
                    const list =
                      activityType === 'pausa_activa' ? effectivePausaOptions : effectiveFitnessOptions;
                    const merged = list.includes(activityName) ? list : [activityName, ...list];
                    return merged.map((act, i) => (
                      <option key={i} value={act}>
                        {act}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            </div>
          </div>

          {/* Area & Expected attendees */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Salón / Piso / Área Designada *
              </label>
              <input
                type="text"
                required
                value={locationArea}
                onChange={(e) => setLocationArea(e.target.value)}
                placeholder="Piso 4 - Sala SUM / Gimnasio"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Colaboradores Esperados
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={expectedAttendeesInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '');
                  setExpectedAttendeesInput(digits === '' ? '' : String(Math.min(999, parseInt(digits, 10))));
                }}
                onBlur={() => {
                  if (expectedAttendeesInput.trim() === '') setExpectedAttendeesInput('0');
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Instrucciones / Notas Especiales para el Entrenador
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Acceso por puerta lateral de contratistas, llevar bandas elásticas..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Lock / Completed & Closed or Non-Compliant status */}
          <div className="space-y-2.5">
            <div
              className={`flex items-center justify-between p-3.5 rounded-xl border transition ${
                closed
                  ? 'bg-emerald-50/90 border-emerald-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="pr-3">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  {closed ? (
                    <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>
                    {closed
                      ? 'Asignación Completada y Cerrada (Bloqueada)'
                      : 'Cierre y Bloqueo de Asignación Cumplida'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-600 block mt-0.5">
                  {closed
                    ? 'Bloqueada: el entrenador ya no puede volver a iniciar ni repetir esta asignación.'
                    : 'Se marca automáticamente al registrar la salida, o puedes cerrarla aquí.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClosed((prev) => {
                    const next = !prev;
                    if (next) setNonCompliant(false);
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 flex items-center space-x-1.5 transition ${
                  closed
                    ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {closed ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Desbloquear</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-red-600" />
                    <span>Cerrar y Bloquear</span>
                  </>
                )}
              </button>
            </div>

            <div
              className={`flex items-center justify-between p-3.5 rounded-xl border transition ${
                nonCompliant
                  ? 'bg-rose-50 border-rose-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="pr-3">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Ban className={`w-3.5 h-3.5 ${nonCompliant ? 'text-rose-700' : 'text-slate-500'}`} />
                  <span>
                    {nonCompliant
                      ? 'Asignación Marcada como Incumplida (Bloqueada)'
                      : 'Estado de Incumplimiento (Fuera de Horario / +30m sin cierre)'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-600 block mt-0.5">
                  {nonCompliant
                    ? 'Bloqueada por no haberse reportado en horario o no cerrarse pasados 30 min. Puedes rehabilitarla.'
                    : 'El sistema bloquea automáticamente asignaciones fuera de horario o sin cierre tras 30 min.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNonCompliant((prev) => {
                    const next = !prev;
                    if (next) setClosed(false);
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 flex items-center space-x-1.5 transition ${
                  nonCompliant
                    ? 'bg-rose-700 text-white border-rose-700 hover:bg-rose-800'
                    : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                }`}
              >
                {nonCompliant ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-rose-200" />
                    <span>Rehabilitar</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5 text-rose-600" />
                    <span>Marcar Incumplida</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active status */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="font-bold text-slate-800 block">Visibilidad en Planificador</span>
              <span className="text-[11px] text-slate-500">
                {active ? 'Activa y visible en el planificador del entrenador' : 'Oculta / En pausa'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md shadow-red-500/20"
            >
              {assignment ? 'Guardar Cambios' : 'Confirmar Asignación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
