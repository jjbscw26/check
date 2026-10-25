import React, { useState } from 'react';
import {
  ACTIVITY_TYPE_LABELS,
  ActivityCatalogItem,
  ActivityType,
  ClassAssignment,
  Company,
  normalizeActivityType,
  Trainer,
} from '../types';
import {
  Printer,
  CheckCheck,
  FileText,
} from 'lucide-react';
import { getAssignmentDurationMinutes, calculateEndTimeHHMM } from '../utils/sessionAlarm';

interface PdfAssignmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignments: ClassAssignment[];
  companies: Company[];
  trainers: Trainer[];
  activityCatalog?: ActivityCatalogItem[];
  initialTrainerId?: string;
  initialMonth?: string; // YYYY-MM
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAY_NAMES = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
];

const PDF_MODALITY_TEXT_CLASS: Record<ActivityType, string> = {
  pausa_activa: 'text-emerald-700',
  clase_fitness: 'text-blue-700',
  gimnasio_corporativo: 'text-indigo-700',
  masajes: 'text-teal-700',
};

export const PdfAssignmentsModal: React.FC<PdfAssignmentsModalProps> = ({
  isOpen,
  onClose,
  assignments,
  companies,
  trainers,
  activityCatalog = [],
  initialTrainerId = 'all',
  initialMonth = new Date().toISOString().substring(0, 7),
}) => {
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>(initialTrainerId);
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);

  if (!isOpen) return null;

  const [yearStr, monthNumStr] = selectedMonth.split('-');
  const year = parseInt(yearStr) || new Date().getFullYear();
  const monthIndex = (parseInt(monthNumStr) || 1) - 1;
  const monthName = MONTH_NAMES[monthIndex];
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // Filter trainers to display
  const targetTrainers = selectedTrainerId === 'all'
    ? trainers
    : trainers.filter((t) => t.id === selectedTrainerId);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto print:max-h-none print:border-none print:shadow-none print:m-0 print:max-w-full">
        {/* Top Control Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden shrink-0">
          <div className="flex items-center space-x-2.5">
            <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold shrink-0">
              <FileText className="w-5 h-5 text-white" />
            </span>
            <div>
              <h3 className="font-bold text-xs sm:text-sm">
                Reporte PDF de Asignaciones Mensuales
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400">
                Horarios, sedes, salones y actividades oficiales por entrenador
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by trainer */}
            <select
              value={selectedTrainerId}
              onChange={(e) => setSelectedTrainerId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-red-500"
            >
              <option value="all">Todos los Entrenadores ({trainers.length})</option>
              {trainers.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
            </select>

            {/* Select Month */}
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-red-500 font-mono"
            />

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center shadow-md transition cursor-pointer"
            >
              <Printer className="w-4 h-4 mr-1.5 shrink-0" />
              <span>Imprimir / Descargar PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg text-sm"
              title="Cerrar vista previa"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-4 sm:p-8 md:p-10 space-y-8 text-slate-900 bg-white flex-1 overflow-y-auto print:p-6 print:space-y-6">
          {/* Main Cover Header */}
          <div className="flex items-start justify-between border-b-2 border-red-600 pb-5">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white font-black text-xl shadow-md">
                <CheckCheck className="w-7 h-7 stroke-[2.5]" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  BSCW <span className="text-red-600">Check</span>
                </h1>
                <p className="text-xs text-slate-600 font-bold tracking-wide uppercase">
                  Programa Oficial de Asignación y Rol Mensual de Clases
                </p>
                <p className="text-[11px] text-slate-400 font-medium">
                  Pausas Activas, Clases Fitness, Gimnasio Corporativo y Masajes en Sedes Empresariales
                </p>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="inline-block px-3 py-1.5 bg-red-50 text-red-700 font-extrabold rounded-lg border border-red-200 text-xs">
                {monthName.toUpperCase()} {year}
              </span>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                Generado: {new Date().toLocaleDateString('es-MX')} {new Date().toLocaleTimeString('es-MX', { hour12: false })}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                Folio Doc: BSCW-ROL-{selectedMonth.replace('-', '')}
              </p>
            </div>
          </div>

          {/* Render Section for each target trainer */}
          {targetTrainers.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-xs">
              No hay entrenadores para mostrar en este reporte.
            </div>
          ) : (
            targetTrainers.map((trainer, trainerIdx) => {
              // Trainer assignments
              const trainerAssignments = assignments.filter(
                (a) => a.trainerId === trainer.id && a.active !== false
              );

              // Calculate monthly sessions for this trainer
              let totalMonthlySessions = 0;
              let totalAttendeesExpected = 0;
              const uniqueCompanies = new Set<string>();
              const uniqueSedes = new Set<string>();

              trainerAssignments.forEach((asg) => {
                uniqueCompanies.add(asg.companyId);
                uniqueSedes.add(asg.sedeId);

                if (asg.frequency === 'semanal') {
                  // Count occurrences of dayOfWeek in the selected month
                  let count = 0;
                  for (let day = 1; day <= daysInMonth; day++) {
                    const d = new Date(year, monthIndex, day);
                    const dow = d.getDay() === 0 ? 7 : d.getDay();
                    if (dow === asg.dayOfWeek) {
                      count++;
                    }
                  }
                  totalMonthlySessions += count;
                  totalAttendeesExpected += (asg.expectedAttendees || 20) * count;
                } else if (asg.frequency === 'mensual') {
                  if (asg.dayOfMonth && asg.dayOfMonth <= daysInMonth) {
                    totalMonthlySessions += 1;
                    totalAttendeesExpected += (asg.expectedAttendees || 20);
                  }
                } else if (asg.frequency === 'fecha_unica') {
                  if (asg.date && asg.date.startsWith(selectedMonth)) {
                    totalMonthlySessions += 1;
                    totalAttendeesExpected += (asg.expectedAttendees || 20);
                  }
                }
              });

              return (
                <div
                  key={trainer.id}
                  className={`space-y-4 pt-4 ${
                    trainerIdx > 0 ? 'border-t-2 border-dashed border-slate-300 print:break-before-page print:pt-6' : ''
                  }`}
                >
                  {/* Trainer Profile Card Header */}
                  <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3.5">
                      <img
                        src={trainer.avatar}
                        alt={trainer.name}
                        className="w-14 h-14 rounded-2xl object-cover border-2 border-red-500 shadow-sm shrink-0"
                      />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                            Entrenador Oficial
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Activo
                          </span>
                        </div>
                        <h2 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                          {trainer.name}
                        </h2>
                        <p className="text-xs text-slate-600 font-medium">
                          {trainer.email} • Tel: {trainer.phone}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          <strong className="text-slate-700">Especialidades:</strong> {trainer.specialties.join(' • ')}
                        </p>
                      </div>
                    </div>

                    {/* Metrics Counters */}
                    <div className="grid grid-cols-4 gap-2 text-center shrink-0">
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Horarios</span>
                        <span className="text-base font-black font-mono text-slate-900">
                          {trainerAssignments.length}
                        </span>
                      </div>
                      <div className="p-2 bg-red-50/70 rounded-xl border border-red-200 shadow-xs">
                        <span className="text-[9px] uppercase font-bold text-red-600 block">Sesiones Mes</span>
                        <span className="text-base font-black font-mono text-red-600">
                          {totalMonthlySessions}
                        </span>
                      </div>
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Empresas</span>
                        <span className="text-base font-black font-mono text-slate-900">
                          {uniqueCompanies.size}
                        </span>
                      </div>
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Colab. Est.</span>
                        <span className="text-base font-black font-mono text-slate-900">
                          {totalAttendeesExpected}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Assignments Table for this trainer */}
                  {trainerAssignments.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                      Este entrenador no cuenta con clases asignadas actualmente.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Día / Frecuencia</th>
                            <th className="py-2.5 px-2 text-center">Horario y Duración</th>
                            <th className="py-2.5 px-3">Empresa Cliente</th>
                            <th className="py-2.5 px-3">Sede Oficial y Dirección</th>
                            <th className="py-2.5 px-3">Salón / Piso</th>
                            <th className="py-2.5 px-3">Actividad Programada</th>
                            <th className="py-2.5 px-2 text-center">Aforo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800">
                          {trainerAssignments.map((asg) => {
                            const normType = normalizeActivityType(asg.activityType);
                            const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
                            const endHHMM = calculateEndTimeHHMM(asg.time, durMins);

                            let freqBadgeText = '';
                            if (asg.frequency === 'semanal') {
                              freqBadgeText = `Cada ${DAY_NAMES[(asg.dayOfWeek || 1) - 1]}`;
                            } else if (asg.frequency === 'mensual') {
                              freqBadgeText = `Día ${asg.dayOfMonth} de cada mes`;
                            } else {
                              freqBadgeText = `Fecha única: ${asg.date || 'Programada'}`;
                            }

                            return (
                              <tr key={asg.id} className="hover:bg-slate-50/80 transition">
                                <td className="py-3 px-3">
                                  <span className="font-bold text-slate-900 block text-xs">
                                    {freqBadgeText}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    {asg.frequency === 'semanal'
                                      ? '🔁 Recurrente semanal'
                                      : asg.frequency === 'mensual'
                                      ? '🗓️ Recurrente mensual'
                                      : '📅 Sesión puntual'}
                                  </span>
                                </td>

                                <td className="py-3 px-2 text-center whitespace-nowrap">
                                  <span className="font-mono font-bold text-red-600 text-xs px-2 py-1 bg-red-50 rounded-lg border border-red-200/60 inline-block">
                                    {asg.time}{endHHMM ? `–${endHHMM}` : ' hrs'}
                                  </span>
                                  <span className="block text-[10px] font-mono font-bold text-slate-600 mt-0.5">
                                    Duración: {durMins} min
                                  </span>
                                </td>

                                <td className="py-3 px-3 font-extrabold text-slate-900">
                                  {asg.companyName}
                                </td>

                                <td className="py-3 px-3 text-[11px]">
                                  <span className="font-bold text-slate-900 block">
                                    📍 {asg.sedeName}
                                  </span>
                                  <span className="text-slate-500 block truncate max-w-[200px]" title={asg.sedeAddress}>
                                    {asg.sedeAddress}
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-slate-700 font-semibold text-[11px]">
                                  {asg.locationArea}
                                </td>

                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-block text-[10px] font-bold mb-0.5 ${PDF_MODALITY_TEXT_CLASS[normType]}`}
                                  >
                                    {ACTIVITY_TYPE_LABELS[normType]}
                                  </span>
                                  <span className="font-bold text-slate-900 block text-[11px]">
                                    {asg.activityName}
                                  </span>
                                  {(asg.nonCompliant || (asg.missedDates && asg.missedDates.length > 0)) ? (
                                    <span className="text-[10px] font-bold text-rose-700 block mt-0.5">
                                      ⛔ Incumplida • Bloqueada
                                    </span>
                                  ) : (asg.closed || (asg.completedDates && asg.completedDates.length > 0)) ? (
                                    <span className="text-[10px] font-bold text-emerald-700 block mt-0.5">
                                      🔒 Completada y Cerrada
                                    </span>
                                  ) : null}
                                  {asg.notes && (
                                    <span className="text-[10px] text-slate-500 italic block mt-0.5">
                                      "{asg.notes}"
                                    </span>
                                  )}
                                </td>

                                <td className="py-3 px-2 text-center font-mono font-bold text-slate-800">
                                  {asg.expectedAttendees || 20}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Compliance notice & Signatures */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                    <p className="text-[10px] text-slate-500 leading-relaxed italic">
                      <strong className="text-slate-700">Normativa de Operación BSCW Check:</strong> El entrenador debe presentarse al menos 10 minutos antes del horario pactado. Es obligatorio registrar el Check-In biométrico facial y verificación satelital GPS al ingresar a la sede oficial, así como la fotografía obligatoria de salida al concluir. Toda asignación fuera de horario sin reporte o cuya salida no sea cerrada dentro de los 30 minutos posteriores a su término quedará bloqueada automáticamente y marcada como incumplida.
                    </p>

                    <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 print:pt-8">
                      <div className="text-center">
                        <div className="border-b border-slate-400 w-4/5 mx-auto mb-1"></div>
                        <p className="text-xs font-bold text-slate-900">{trainer.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">
                          Entrenador(a) Asignado(a) • Firma de Aceptación
                        </p>
                      </div>

                      <div className="text-center">
                        <div className="border-b border-slate-400 w-4/5 mx-auto mb-1"></div>
                        <p className="text-xs font-bold text-slate-900">Coordinación de Operaciones</p>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">
                          BSCW Check • Autorización y Validación
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Footer Official Seal */}
          <div className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400 flex items-center justify-between">
            <span>BSCW Check • Sistema Oficial de Control y Gestión de Sedes Empresariales</span>
            <span className="font-mono">Página {1} de {1} • Documento Certificado</span>
          </div>
        </div>
      </div>
    </div>
  );
};
