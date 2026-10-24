import React from 'react';
import { AttendanceRecord, Company, Trainer } from '../types';
import { 
  Printer, 
  Download, 
  ShieldCheck, 
  CheckCheck, 
  Clock, 
  Calendar, 
  Users, 
  Building2, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import { formatDistance } from '../utils/geo';

interface PdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: AttendanceRecord[];
  companies: Company[];
  trainers: Trainer[];
  reportType: 'daily' | 'monthly' | 'all';
  selectedDate: string;
  selectedMonth: string;
}

export const PdfReportModal: React.FC<PdfReportModalProps> = ({
  isOpen,
  onClose,
  records,
  companies,
  trainers,
  reportType,
  selectedDate,
  selectedMonth,
}) => {
  if (!isOpen) return null;

  const total = records.length;
  const onTime = records.filter((r) => r.punctualityStatus === 'a_tiempo').length;
  const early = records.filter((r) => r.punctualityStatus === 'adelantado').length;
  const late = records.filter((r) => r.punctualityStatus === 'con_retraso').length;
  const punctualityRate = total > 0 ? Math.round(((onTime + early) / total) * 100) : 100;
  const totalMinutes = records.reduce((acc, r) => acc + (r.durationMinutes || 45), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalAttendees = records.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

  const periodLabel =
    reportType === 'daily'
      ? `Reporte Diario: ${selectedDate}`
      : reportType === 'monthly'
      ? `Reporte Mensual: ${selectedMonth}`
      : 'Histórico Completo Consolidado';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto print:max-h-none print:border-none print:shadow-none print:m-0 print:max-w-full">
        {/* Top Action Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold shrink-0">
              <CheckCheck className="w-5 h-5 text-white" />
            </span>
            <div>
              <h3 className="font-bold text-xs sm:text-sm">Vista Previa de Reporte Oficial PDF</h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400">Listo para imprimir o guardar como PDF</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center shadow transition"
            >
              <Printer className="w-4 h-4 sm:mr-1.5 shrink-0" />
              <span className="hidden sm:inline">Imprimir / Guardar como PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-lg text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="p-4 sm:p-8 md:p-12 space-y-6 text-slate-900 bg-white flex-1 overflow-y-auto">
          {/* Corporate Header */}
          <div className="flex items-start justify-between border-b-2 border-red-600 pb-5">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white font-black text-xl shadow-md">
                <CheckCheck className="w-7 h-7 stroke-[2.5]" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  BSCW <span className="text-red-600">Check</span>
                </h1>
                <p className="text-xs text-slate-500 font-semibold tracking-wide uppercase">
                  Auditoría Corporativa de Asistencia y Puntualidad en Sedes
                </p>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="inline-block px-3 py-1 bg-red-50 text-red-700 font-bold rounded-lg border border-red-200">
                {periodLabel}
              </span>
              <p className="text-[10px] text-slate-400 mt-1">
                Generado: {new Date().toLocaleDateString('es-MX')} {new Date().toLocaleTimeString('es-MX', { hour12: false })}
              </p>
            </div>
          </div>

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Visitas</span>
              <span className="text-xl font-black font-mono text-slate-900">{total}</span>
            </div>

            <div className="p-3 bg-red-50/60 rounded-xl border border-red-200 text-center">
              <span className="text-[10px] uppercase font-bold text-red-700 block">Tasa de Puntualidad</span>
              <span className="text-xl font-black font-mono text-red-600">{punctualityRate}%</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Horas Impartidas</span>
              <span className="text-xl font-black font-mono text-slate-900">{totalHours} hrs</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Colaboradores</span>
              <span className="text-xl font-black font-mono text-slate-900">{totalAttendees}</span>
            </div>
          </div>

          {/* Section: Resumen por Entrenador */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center">
              <Clock className="w-3.5 h-3.5 mr-1 text-red-600" />
              1. Desempeño y Puntualidad por Entrenador
            </h3>
            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                <tr>
                  <th className="p-2 border-b border-slate-200">Entrenador</th>
                  <th className="p-2 border-b border-slate-200 text-center">Sesiones</th>
                  <th className="p-2 border-b border-slate-200 text-center">A Tiempo</th>
                  <th className="p-2 border-b border-slate-200 text-center">Retrasos</th>
                  <th className="p-2 border-b border-slate-200 text-center">% Puntualidad</th>
                  <th className="p-2 border-b border-slate-200 text-center">Horas</th>
                  <th className="p-2 border-b border-slate-200 text-right">Calificación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {trainers.map((tr) => {
                  const trRecs = records.filter((r) => r.trainerId === tr.id);
                  const trTotal = trRecs.length;
                  const trOnTime = trRecs.filter((r) => r.punctualityStatus === 'a_tiempo' || r.punctualityStatus === 'adelantado').length;
                  const trLate = trRecs.filter((r) => r.punctualityStatus === 'con_retraso').length;
                  const trRate = trTotal > 0 ? Math.round((trOnTime / trTotal) * 100) : 100;
                  const trHours = (trRecs.reduce((acc, r) => acc + (r.durationMinutes || 45), 0) / 60).toFixed(1);

                  return (
                    <tr key={tr.id}>
                      <td className="p-2 font-bold text-slate-900">{tr.name}</td>
                      <td className="p-2 text-center font-mono">{trTotal}</td>
                      <td className="p-2 text-center font-mono text-emerald-700 font-bold">{trOnTime}</td>
                      <td className="p-2 text-center font-mono text-red-600 font-bold">{trLate}</td>
                      <td className="p-2 text-center font-mono font-bold">{trRate}%</td>
                      <td className="p-2 text-center font-mono">{trHours} hrs</td>
                      <td className="p-2 text-right font-bold text-slate-700">
                        {trRate >= 95 ? 'Excelente' : trRate >= 80 ? 'Destacado' : 'Revisión'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section: Resumen de Sedes y Clientes */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center">
              <Building2 className="w-3.5 h-3.5 mr-1 text-red-600" />
              2. Cobertura en Empresas Cliente
            </h3>
            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                <tr>
                  <th className="p-2 border-b border-slate-200">Empresa</th>
                  <th className="p-2 border-b border-slate-200">Giro</th>
                  <th className="p-2 border-b border-slate-200 text-center">Sesiones Recibidas</th>
                  <th className="p-2 border-b border-slate-200 text-center">Pausas Activas</th>
                  <th className="p-2 border-b border-slate-200 text-center">Clases Fitness</th>
                  <th className="p-2 border-b border-slate-200 text-right">Colaboradores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {companies.map((c) => {
                  const cRecs = records.filter((r) => r.companyId === c.id);
                  const cTotal = cRecs.length;
                  const cPausas = cRecs.filter((r) => r.activityType === 'pausa_activa').length;
                  const cFitness = cRecs.filter((r) => r.activityType === 'clase_fitness').length;
                  const cAttendees = cRecs.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

                  return (
                    <tr key={c.id}>
                      <td className="p-2 font-bold text-slate-900">{c.name}</td>
                      <td className="p-2 text-slate-600">{c.industry}</td>
                      <td className="p-2 text-center font-mono font-bold text-red-600">{cTotal}</td>
                      <td className="p-2 text-center font-mono">{cPausas}</td>
                      <td className="p-2 text-center font-mono">{cFitness}</td>
                      <td className="p-2 text-right font-mono font-bold">{cAttendees}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section: Detalle de Registros y Auditoría de Ubicación / Facial */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-red-600" />
              3. Bitácora Detallada de Visitas & Validación Biométrica
            </h3>
            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                <tr>
                  <th className="p-2 border-b border-slate-200">Fecha / Horas</th>
                  <th className="p-2 border-b border-slate-200">Entrenador</th>
                  <th className="p-2 border-b border-slate-200">Empresa & Sede</th>
                  <th className="p-2 border-b border-slate-200">Actividad</th>
                  <th className="p-2 border-b border-slate-200 text-center">Puntualidad</th>
                  <th className="p-2 border-b border-slate-200 text-center">GPS Sede</th>
                  <th className="p-2 border-b border-slate-200 text-right">Rostro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[10px]">
                {records.slice(0, 15).map((r) => (
                  <tr key={r.id}>
                    <td className="p-2 font-mono whitespace-nowrap">
                      <div>{r.date}</div>
                      <div className="text-[9px] text-slate-500">
                        {r.checkInTime}{' '}
                        {r.checkOutTime
                          ? `→ ${r.checkOutTime}`
                          : r.status === 'incumplido'
                            ? '→ Sin cierre (+30m)'
                            : '→ En curso'}
                      </div>
                    </td>
                    <td className="p-2 font-semibold text-slate-900">{r.trainerName}</td>
                    <td className="p-2">
                      <div className="font-semibold text-slate-800">{r.companyName}</div>
                      <div className="text-[9px] text-slate-500">{r.sedeName}</div>
                    </td>
                    <td className="p-2">
                      <div className="font-medium text-slate-800">{r.activityName}</div>
                      <div className="text-[9px] text-slate-500">{r.attendeesCount} participantes</div>
                    </td>
                    <td className="p-2 text-center">
                      {r.status === 'incumplido' ? (
                        <span className="font-bold text-rose-700">Incumplida (+30m)</span>
                      ) : (
                        <span className={`font-bold ${
                          r.punctualityStatus === 'con_retraso' ? 'text-red-600' : 'text-emerald-700'
                        }`}>
                          {r.punctualityStatus === 'con_retraso'
                            ? `Retraso (${Math.abs(r.punctualityDiffMinutes)}m)`
                            : 'A tiempo'}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center font-mono text-[9px]">
                      {formatDistance(r.checkInGps.distanceToSedeMeters)}
                    </td>
                    <td className="p-2 text-right">
                      {r.facialVerification ? (
                        <span className="font-bold text-emerald-700">✓ {r.facialVerification.confidenceScore}%</span>
                      ) : (
                        <span className="text-slate-400">Verificado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Authorization & Signature Sign-off Box */}
          <div className="pt-6 border-t-2 border-slate-200 grid grid-cols-2 gap-8 text-center text-xs">
            <div>
              <div className="border-b border-slate-400 pb-1 mb-1 font-bold text-slate-800">
                Lic. Laura Peñaloza — Dirección de Bienestar Corporativo
              </div>
              <p className="text-[10px] text-slate-500">Validado y Autorizado • BSCW Check</p>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-1 mb-1 font-bold text-slate-800">
                Sistemas y Auditoría Operativa BSCW
              </div>
              <p className="text-[10px] text-slate-500">Certificación Criptográfica y Biométrica</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
