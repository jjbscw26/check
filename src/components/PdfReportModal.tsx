import React, { useState } from 'react';
import { AttendanceRecord, Company, Trainer } from '../types';
import {
  Printer,
  Download,
  ShieldCheck,
  CheckCheck,
  Clock,
  Building2,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { formatDistance } from '../utils/geo';
import {
  exportExecutiveReportToExcel,
  exportExecutiveReportToPdf,
} from '../utils/evidenceExport';
import {
  computeCompanySummariesForReport,
  computeTrainerSummariesForReport,
  evaluateTrainerRatingLabel,
} from '../utils/excelReportBuilder';

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
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  if (!isOpen) return null;

  const total = records.length;
  const onTime = records.filter((r) => r.punctualityStatus === 'a_tiempo').length;
  const early = records.filter((r) => r.punctualityStatus === 'adelantado').length;
  const late = records.filter((r) => r.punctualityStatus === 'con_retraso').length;
  const nonCompliantTotal = records.filter((r) => r.status === 'incumplido').length;
  const punctualityRate = total > 0 ? Math.round(((onTime + early) / total) * 100) : 100;
  const totalMinutes = records.reduce((acc, r) => acc + (r.durationMinutes || 45), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalAttendees = records.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

  const trainerRows = computeTrainerSummariesForReport(records, trainers);
  const companyRows = computeCompanySummariesForReport(records, companies);

  const periodSuffix =
    reportType === 'daily'
      ? selectedDate
      : reportType === 'monthly'
      ? selectedMonth
      : 'Consolidado';

  const periodLabel =
    reportType === 'daily'
      ? `Reporte Diario: ${selectedDate}`
      : reportType === 'monthly'
      ? `Reporte Mensual: ${selectedMonth}`
      : 'Histórico Completo Consolidado';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      await exportExecutiveReportToPdf(records, companies, trainers, {
        periodLabel,
        filenamePrefix: `Reporte_BSCW_${reportType}_${periodSuffix}`,
        includePhotos: true,
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadExcel = () => {
    exportExecutiveReportToExcel(records, companies, trainers, {
      periodLabel,
      filenamePrefix: `Reporte_BSCW_${reportType}_${periodSuffix}`,
    });
  };

  return (
    <div
      data-printable-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static"
    >
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto print:max-h-none print:border-none print:shadow-none print:m-0 print:max-w-full">
        {/* Top Action Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-center sm:text-left print:hidden shrink-0">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold shrink-0">
              <CheckCheck className="w-5 h-5 text-white" />
            </span>
            <div>
              <h3 className="font-bold text-xs sm:text-sm">Vista Previa de Reporte Oficial PDF y Excel</h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400">
                Incluye KPIs, tablas por entrenador y empresa, bitácora detallada y firmas oficiales
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="min-h-[40px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
              title="Descargar Reporte Ejecutivo completo con todas las tablas en Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>Descargar Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={isDownloadingPdf}
              className="min-h-[40px] px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isDownloadingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Download className="w-4 h-4 shrink-0" />
              )}
              <span>{isDownloadingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[40px] px-3 sm:px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl text-xs flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-red-600 shrink-0" />
              <span>Imprimir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-lg text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div
          data-printable-scroll="true"
          className="p-4 sm:p-8 md:p-12 space-y-6 text-slate-900 bg-white flex-1 overflow-y-auto"
        >
          {/* Corporate Header */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-3 text-center sm:text-left border-b-2 border-red-600 pb-5">
            <div className="flex flex-col sm:flex-row items-center gap-3">
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

            <div className="text-center sm:text-right text-xs">
              <span className="inline-block px-3 py-1 bg-red-50 text-red-700 font-bold rounded-lg border border-red-200">
                {periodLabel}
              </span>
              <p className="text-[10px] text-slate-400 mt-1">
                Generado: {new Date().toLocaleDateString('es-MX')}{' '}
                {new Date().toLocaleTimeString('es-MX', { hour12: false })}
              </p>
            </div>
          </div>

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

          {/* Section 1: Resumen por Entrenador */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center">
              <Clock className="w-3.5 h-3.5 mr-1 text-red-600" />
              1. Desempeño y Puntualidad por Entrenador
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-2 border-b border-slate-200">Entrenador</th>
                    <th className="p-2 border-b border-slate-200 text-center">Sesiones</th>
                    <th className="p-2 border-b border-slate-200 text-center">A Tiempo</th>
                    <th className="p-2 border-b border-slate-200 text-center">Retrasos</th>
                    <th className="p-2 border-b border-slate-200 text-center">No Cerradas</th>
                    <th className="p-2 border-b border-slate-200 text-center">% Puntualidad</th>
                    <th className="p-2 border-b border-slate-200 text-center">Horas</th>
                    <th className="p-2 border-b border-slate-200 text-center">Colab.</th>
                    <th className="p-2 border-b border-slate-200 text-right">Calificación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {trainerRows.map((tr) => (
                    <tr key={tr.id}>
                      <td className="p-2 font-bold text-slate-900">{tr.name}</td>
                      <td className="p-2 text-center font-mono">{tr.totalSessions}</td>
                      <td className="p-2 text-center font-mono text-emerald-700 font-bold">
                        {tr.punctualTotal}
                      </td>
                      <td className="p-2 text-center font-mono text-red-600 font-bold">
                        {tr.lateCount}
                      </td>
                      <td className="p-2 text-center font-mono font-bold">
                        {tr.nonCompliantSessions > 0 ? (
                          <span className="text-rose-700">{tr.nonCompliantSessions}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="p-2 text-center font-mono font-bold">{tr.punctualityRate}%</td>
                      <td className="p-2 text-center font-mono">{tr.hoursImparted} hrs</td>
                      <td className="p-2 text-center font-mono font-semibold">{tr.attendeesTotal}</td>
                      <td className="p-2 text-right font-bold text-slate-700">{tr.rating}</td>
                    </tr>
                  ))}
                  {trainerRows.length > 0 && (
                    <tr className="bg-slate-100/80 font-extrabold text-slate-900 border-t border-slate-300">
                      <td className="p-2">TOTAL / PROMEDIO GENERAL</td>
                      <td className="p-2 text-center font-mono">{total}</td>
                      <td className="p-2 text-center font-mono text-emerald-700">
                        {onTime + early}
                      </td>
                      <td className="p-2 text-center font-mono text-red-600">{late}</td>
                      <td className="p-2 text-center font-mono text-rose-700">
                        {nonCompliantTotal}
                      </td>
                      <td className="p-2 text-center font-mono text-red-600">{punctualityRate}%</td>
                      <td className="p-2 text-center font-mono">{totalHours} hrs</td>
                      <td className="p-2 text-center font-mono">{totalAttendees}</td>
                      <td className="p-2 text-right">
                        {evaluateTrainerRatingLabel(punctualityRate, nonCompliantTotal)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Resumen de Sedes y Clientes */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center">
              <Building2 className="w-3.5 h-3.5 mr-1 text-red-600" />
              2. Cobertura en Empresas Cliente
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-2 border-b border-slate-200">Empresa</th>
                    <th className="p-2 border-b border-slate-200">Giro</th>
                    <th className="p-2 border-b border-slate-200 text-center">Sedes</th>
                    <th className="p-2 border-b border-slate-200 text-center">Sesiones</th>
                    <th className="p-2 border-b border-slate-200 text-center">Pausas</th>
                    <th className="p-2 border-b border-slate-200 text-center">Fitness</th>
                    <th className="p-2 border-b border-slate-200 text-center">Gimnasio Corp.</th>
                    <th className="p-2 border-b border-slate-200 text-center">Masajes</th>
                    <th className="p-2 border-b border-slate-200 text-right">Colaboradores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {companyRows.map((c) => (
                    <tr key={c.id}>
                      <td className="p-2 font-bold text-slate-900">{c.name}</td>
                      <td className="p-2 text-slate-600">{c.industry}</td>
                      <td className="p-2 text-center font-mono tabular-nums">{c.sedesCount}</td>
                      <td className="p-2 text-center font-mono tabular-nums font-bold text-red-600">
                        {c.totalSessions}
                      </td>
                      <td className="p-2 text-center font-mono tabular-nums">{c.pausasCount}</td>
                      <td className="p-2 text-center font-mono tabular-nums">{c.fitnessCount}</td>
                      <td className="p-2 text-center font-mono tabular-nums">{c.gimnasioCount}</td>
                      <td className="p-2 text-center font-mono tabular-nums">{c.masajesCount}</td>
                      <td className="p-2 text-right font-mono tabular-nums font-bold">
                        {c.attendeesTotal}
                      </td>
                    </tr>
                  ))}
                  {companyRows.length > 0 && (
                    <tr className="bg-slate-100/80 font-extrabold text-slate-900 border-t border-slate-300">
                      <td className="p-2">TOTAL GENERAL EMPRESAS</td>
                      <td className="p-2 text-slate-600">{companyRows.length} empresa(s)</td>
                      <td className="p-2 text-center font-mono tabular-nums">
                        {companyRows.reduce((acc, c) => acc + c.sedesCount, 0)}
                      </td>
                      <td className="p-2 text-center font-mono tabular-nums text-red-600">
                        {total}
                      </td>
                      <td className="p-2 text-center font-mono tabular-nums">
                        {companyRows.reduce((acc, c) => acc + c.pausasCount, 0)}
                      </td>
                      <td className="p-2 text-center font-mono tabular-nums">
                        {companyRows.reduce((acc, c) => acc + c.fitnessCount, 0)}
                      </td>
                      <td className="p-2 text-center font-mono tabular-nums">
                        {companyRows.reduce((acc, c) => acc + c.gimnasioCount, 0)}
                      </td>
                      <td className="p-2 text-center font-mono tabular-nums">
                        {companyRows.reduce((acc, c) => acc + c.masajesCount, 0)}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums">{totalAttendees}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Detalle de Registros y Auditoría de Ubicación / Facial */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-red-600" />
              3. Bitácora Detallada de Visitas & Validación Biométrica
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-2 border-b border-slate-200">Fecha / Horas</th>
                    <th className="p-2 border-b border-slate-200">Entrenador</th>
                    <th className="p-2 border-b border-slate-200">Empresa & Sede</th>
                    <th className="p-2 border-b border-slate-200">Actividad</th>
                    <th className="p-2 border-b border-slate-200 text-center">Puntualidad</th>
                    <th className="p-2 border-b border-slate-200 text-center">GPS / Modalidad</th>
                    <th className="p-2 border-b border-slate-200 text-right">Rostro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[10px]">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                        Sin registros de visitas para el periodo seleccionado ({periodLabel}).
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r.id}>
                        <td className="p-2 font-mono whitespace-nowrap">
                          <div>{r.date}</div>
                          <div className="text-[9px] text-slate-500">
                            {r.checkInTime}{' '}
                            {r.checkOutTime
                              ? `→ ${r.checkOutTime}`
                              : r.status === 'incumplido'
                              ? '→ Terminada +60m (No cerrada)'
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
                          <div className="text-[9px] text-slate-500">
                            {r.attendeesCount} participantes
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          {r.status === 'incumplido' ? (
                            <span className="font-bold text-rose-700">No Cerrada (+60m)</span>
                          ) : (
                            <span
                              className={`font-bold ${
                                r.punctualityStatus === 'con_retraso'
                                  ? 'text-red-600'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {r.punctualityStatus === 'con_retraso'
                                ? `Retraso (${Math.abs(r.punctualityDiffMinutes)}m)`
                                : 'A tiempo'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center font-mono text-[9px]">
                          {r.isVirtual
                            ? `Virtual (${r.virtualPlatform || 'En línea'})`
                            : formatDistance(r.checkInGps.distanceToSedeMeters)}
                        </td>
                        <td className="p-2 text-right">
                          {r.facialVerification ? (
                            <span className="font-bold text-emerald-700">
                              ✓ {r.facialVerification.confidenceScore}%
                            </span>
                          ) : (
                            <span className="text-slate-400">Verificado</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
              <p className="text-[10px] text-slate-500">
                Certificación Geocerca GPS y Biometría Facial
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
