import React, { useState, useEffect } from 'react';
import {
  Clock,
  ShieldCheck,
  UserCheck,
  BarChart3,
  CheckCheck,
  BellRing,
  Database,
  Lock,
  LockOpen,
  LogOut,
  ScanFace,
} from 'lucide-react';
import { Trainer, TrainerBiometricSession } from '../types';

interface HeaderProps {
  currentView: 'trainer' | 'personnel' | 'admin';
  onViewChange: (view: 'trainer' | 'personnel' | 'admin') => void;
  authenticatedTrainer: Trainer | null;
  trainerSession: TrainerBiometricSession | null;
  onLogoutTrainerSession?: () => void;
  activeSessionCount: number;
  overdueSessionCount?: number;
  unreadAdminAlertCount?: number;
  latestAdminAlertTrainer?: string | null;
  isMobileOrTablet?: boolean;
  isDirectoryAuthenticated?: boolean;
  directoryUserEmail?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  authenticatedTrainer,
  trainerSession,
  onLogoutTrainerSession,
  activeSessionCount,
  overdueSessionCount = 0,
  unreadAdminAlertCount = 0,
  latestAdminAlertTrainer = null,
  isMobileOrTablet = false,
  isDirectoryAuthenticated = false,
  directoryUserEmail = null,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
      setCurrentDate(
        now.toLocaleDateString('es-MX', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 text-slate-900 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] sm:flex items-center sm:justify-between h-14 sm:h-20 gap-1.5 sm:gap-4">
          {/* Mobile Left Slot: Compact Status / Avatar */}
          <div className="flex sm:hidden items-center justify-start min-w-0">
            {overdueSessionCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 text-[11px] font-bold tabular-nums whitespace-nowrap"
                title="Salida pendiente"
              >
                <BellRing className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span>Salida ({overdueSessionCount})</span>
              </span>
            ) : activeSessionCount > 0 && currentView === 'trainer' ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold tabular-nums whitespace-nowrap">
                <span>En Sede ({activeSessionCount})</span>
              </span>
            ) : authenticatedTrainer && trainerSession ? (
              <div className="inline-flex items-center gap-1.5 min-w-0">
                <img
                  src={authenticatedTrainer.avatar}
                  alt={authenticatedTrainer.name}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-xl object-cover border border-emerald-500 shrink-0"
                />
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                <ShieldCheck className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span>GPS</span>
              </span>
            )}
          </div>

          {/* Center on Mobile / Left on Desktop: Brand Wordmark */}
          <div className="justify-self-center sm:justify-self-auto flex items-center justify-center sm:justify-start gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-red-600 via-red-500 to-rose-600 flex items-center justify-center shadow-sm shadow-red-500/20 text-white font-black shrink-0">
              <CheckCheck className="w-4 h-4 sm:w-6 sm:h-6 stroke-[2.5]" />
            </div>
            <div className="text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-base sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">
                  BSCW <span className="text-red-600 font-extrabold">Check</span>
                </span>
                <span className="hidden md:inline-flex items-center text-xs font-semibold text-red-700">
                  · <ShieldCheck className="w-3.5 h-3.5 mx-1 text-red-600" /> GPS & Facial
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block font-medium">
                Control de Entrada, Salida y Sedes Corporativas
              </p>
            </div>
          </div>

          {/* Center on Desktop: Live Clock & Date */}
          <div
            className={`${
              isMobileOrTablet ? 'hidden md:flex' : 'hidden xl:flex'
            } items-center space-x-3.5 bg-slate-100/90 px-3.5 py-1.5 rounded-xl border border-slate-200`}
          >
            <div className="flex items-center text-xs text-slate-600 font-medium whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 mr-1.5 text-red-600 shrink-0" />
              <span className="capitalize">{currentDate}</span>
            </div>
            <div className="h-4 w-px bg-slate-300" />
            <div className="font-mono tabular-nums text-sm font-bold text-red-600 tracking-wider whitespace-nowrap">
              {currentTime || '--:--:--'}
            </div>
          </div>

          {/* Right: Desktop View Switcher & Biometric Session Action */}
          <div className="justify-self-end flex items-center justify-end gap-1.5 sm:gap-3">
            {!isMobileOrTablet && (
              <div className="hidden lg:flex bg-slate-100 p-1 rounded-xl border border-slate-200 items-center text-xs sm:text-sm font-medium">
                <button
                  type="button"
                  onClick={() => onViewChange('trainer')}
                  className={`flex items-center px-3 sm:px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    currentView === 'trainer'
                      ? 'bg-red-600 text-white shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 shrink-0" />
                  <span>Entrenador</span>
                  {activeSessionCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-white text-red-700 text-[10px] rounded-md font-bold font-mono tabular-nums">
                      {activeSessionCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('personnel')}
                  title={
                    isDirectoryAuthenticated
                      ? `Directorio autenticado${directoryUserEmail ? ` (${directoryUserEmail})` : ''}`
                      : 'Directorio (Requiere autenticación)'
                  }
                  className={`flex items-center px-3 sm:px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    currentView === 'personnel'
                      ? 'bg-red-600 text-white shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 shrink-0" />
                  <span>Directorio</span>
                  {isDirectoryAuthenticated ? (
                    <LockOpen
                      className={`w-3 h-3 ml-1.5 shrink-0 ${
                        currentView === 'personnel' ? 'text-emerald-200' : 'text-emerald-600'
                      }`}
                    />
                  ) : (
                    <Lock
                      className={`w-3 h-3 ml-1.5 shrink-0 ${
                        currentView === 'personnel' ? 'text-white/85' : 'text-slate-400'
                      }`}
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('admin')}
                  className={`flex items-center px-3 sm:px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    currentView === 'admin'
                      ? 'bg-slate-900 text-white shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 shrink-0" />
                  <span>Panel Admin</span>
                  {unreadAdminAlertCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] rounded-md font-bold font-mono tabular-nums">
                      {unreadAdminAlertCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Real-Time Trainer Start Alert Chip for Desktop Admin */}
            {!isMobileOrTablet && unreadAdminAlertCount > 0 && currentView !== 'admin' && (
              <button
                type="button"
                onClick={() => onViewChange('admin')}
                className="hidden lg:inline-flex items-center px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-950 text-[11px] font-bold shadow-xs whitespace-nowrap shrink-0 tabular-nums transition"
                title="Un entrenador acaba de dar inicio a su asignación — clic para abrir Panel Admin"
              >
                <BellRing className="w-3.5 h-3.5 text-emerald-600 mr-1.5 shrink-0" />
                <span>
                  {latestAdminAlertTrainer
                    ? `Inicio: ${latestAdminAlertTrainer}`
                    : `Inicios Nuevos (${unreadAdminAlertCount})`}
                </span>
              </button>
            )}

            {/* Overdue Session Alert Badge (Tablet/Desktop) */}
            {overdueSessionCount > 0 && (
              <div
                className="hidden sm:flex items-center px-2.5 py-1.5 bg-amber-100 border border-amber-300 rounded-xl text-amber-950 text-[11px] font-bold shadow-xs whitespace-nowrap shrink-0 tabular-nums"
                title="Hay sesiones finalizadas pendientes de registrar salida"
              >
                <BellRing className="w-3.5 h-3.5 text-red-600 mr-1.5 shrink-0" />
                <span>Salida Pendiente ({overdueSessionCount})</span>
              </div>
            )}

            {/* Active Session Badge on tablets when clocked in */}
            {activeSessionCount > 0 && overdueSessionCount === 0 && currentView === 'trainer' && (
              <div
                className={`hidden ${
                  isMobileOrTablet ? 'sm:flex' : 'sm:flex lg:hidden'
                } items-center px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[11px] font-bold whitespace-nowrap shrink-0 tabular-nums`}
              >
                <span>En Sede ({activeSessionCount})</span>
              </div>
            )}

            {/* Individual Trainer Biometric Session Chip / Logout */}
            {(isMobileOrTablet || currentView === 'trainer') && (
              authenticatedTrainer && trainerSession ? (
                <div className="flex items-center sm:space-x-2 sm:bg-slate-50 sm:border sm:border-slate-200 rounded-xl sm:pl-2 sm:pr-1.5 sm:py-1">
                  <img
                    src={authenticatedTrainer.avatar}
                    alt={authenticatedTrainer.name}
                    referrerPolicy="no-referrer"
                    className="hidden sm:block w-7 h-7 rounded-lg object-cover border border-emerald-500 shrink-0"
                  />
                  <div className="hidden sm:block leading-tight max-w-[140px]">
                    <span className="text-xs font-bold text-slate-900 block truncate">
                      {authenticatedTrainer.name}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 block truncate tabular-nums">
                      Facial {trainerSession.confidenceScore}%
                    </span>
                  </div>
                  {onLogoutTrainerSession && (
                    <button
                      type="button"
                      onClick={onLogoutTrainerSession}
                      className="inline-flex items-center justify-center gap-1 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 text-xs font-semibold transition whitespace-nowrap shrink-0"
                      title="Cerrar sesión individual del entrenador"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>Salir</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] sm:text-xs font-semibold text-slate-600 whitespace-nowrap shrink-0">
                  <ScanFace className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span className="hidden sm:inline">Acceso Facial Requerido</span>
                  <span className="sm:hidden">Facial</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
