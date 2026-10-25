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
} from 'lucide-react';
import { Trainer } from '../types';

interface HeaderProps {
  currentView: 'trainer' | 'personnel' | 'admin';
  onViewChange: (view: 'trainer' | 'personnel' | 'admin') => void;
  trainers: Trainer[];
  selectedTrainerId: string;
  onTrainerChange: (trainerId: string) => void;
  activeSessionCount: number;
  overdueSessionCount?: number;
  isMobileOrTablet?: boolean;
  isDirectoryAuthenticated?: boolean;
  directoryUserEmail?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  trainers,
  selectedTrainerId,
  onTrainerChange,
  activeSessionCount,
  overdueSessionCount = 0,
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
    <header className="bg-white border-b border-slate-200/90 text-slate-900 sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2 sm:gap-4">
          {/* Logo & Brand in Red */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-red-600 via-red-500 to-rose-600 flex items-center justify-center shadow-md shadow-red-500/25 text-white font-black text-lg">
              <CheckCheck className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900">
                  BSCW <span className="text-red-600 font-extrabold">Check</span>
                </span>
                <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200/80">
                  <ShieldCheck className="w-3 h-3 mr-1 text-red-600" /> GPS & Facial
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block font-medium">
                Control de Entrada, Salida y Sedes Corporativas
              </p>
            </div>
          </div>

          {/* Center: Live Clock & Date */}
          <div
            className={`${
              isMobileOrTablet ? 'hidden md:flex' : 'hidden xl:flex'
            } items-center space-x-4 bg-slate-100/90 px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-inner`}
          >
            <div className="flex items-center text-xs text-slate-600 font-medium">
              <Clock className="w-3.5 h-3.5 mr-1.5 text-red-600" />
              <span className="capitalize">{currentDate}</span>
            </div>
            <div className="h-4 w-px bg-slate-300" />
            <div className="font-mono text-sm font-bold text-red-600 tracking-wider">
              {currentTime || '--:--:--'}
            </div>
          </div>

          {/* Right: Desktop View Switcher (hidden on phones & tablets) and Trainer Profile */}
          <div className="flex items-center space-x-1.5 sm:space-x-3">
            {!isMobileOrTablet && (
              <div className="hidden lg:flex bg-slate-100 p-1 rounded-xl border border-slate-200 items-center text-xs sm:text-sm font-medium">
                <button
                  type="button"
                  onClick={() => onViewChange('trainer')}
                  className={`flex items-center px-3 sm:px-3.5 py-1.5 rounded-lg transition-all ${
                    currentView === 'trainer'
                      ? 'bg-red-600 text-white shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
                  <span>Entrenador</span>
                  {activeSessionCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.2 bg-white text-red-700 text-[10px] rounded-md font-bold animate-pulse shadow-sm">
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
                  className={`flex items-center px-3 sm:px-3.5 py-1.5 rounded-lg transition-all ${
                    currentView === 'personnel'
                      ? 'bg-red-600 text-white shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
                  <span>Directorio</span>
                  {isDirectoryAuthenticated ? (
                    <LockOpen
                      className={`w-3 h-3 ml-1.5 ${
                        currentView === 'personnel' ? 'text-emerald-200' : 'text-emerald-600'
                      }`}
                    />
                  ) : (
                    <Lock
                      className={`w-3 h-3 ml-1.5 ${
                        currentView === 'personnel' ? 'text-white/85' : 'text-slate-400'
                      }`}
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('admin')}
                  className={`flex items-center px-3 sm:px-3.5 py-1.5 rounded-lg transition-all ${
                    currentView === 'admin'
                      ? 'bg-slate-900 text-white shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
                  <span>Panel Admin</span>
                </button>
              </div>
            )}

            {/* Overdue Session Alert Badge if any session finished without check-out */}
            {overdueSessionCount > 0 && (
              <div
                className="flex items-center px-2.5 py-1.5 bg-amber-100 border border-amber-300 rounded-xl text-amber-950 text-[11px] font-bold shadow-xs animate-pulse"
                title="Hay sesiones finalizadas pendientes de registrar salida"
              >
                <BellRing className="w-3.5 h-3.5 text-red-600 mr-1.5 shrink-0" />
                <span className="hidden sm:inline">Salida Pendiente ({overdueSessionCount})</span>
                <span className="sm:hidden">{overdueSessionCount}</span>
              </div>
            )}

            {/* Active Session Badge on phones & tablets when clocked in */}
            {activeSessionCount > 0 && overdueSessionCount === 0 && currentView === 'trainer' && (
              <div
                className={`${
                  isMobileOrTablet ? 'flex' : 'lg:hidden flex'
                } items-center px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[11px] font-bold`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 mr-1.5 animate-ping" />
                <span>En Sede ({activeSessionCount})</span>
              </div>
            )}

            {/* Trainer Selector (always visible on phones/tablets and in Trainer/Admin views) */}
            <div
              className={`relative ${
                !isMobileOrTablet && currentView === 'personnel' ? 'hidden xl:block' : ''
              }`}
            >
              <select
                value={selectedTrainerId}
                onChange={(e) => onTrainerChange(e.target.value)}
                className="bg-white text-slate-800 text-xs sm:text-sm rounded-lg border border-slate-300 pl-2.5 pr-7 sm:pr-8 py-1.5 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 cursor-pointer appearance-none truncate max-w-[140px] sm:max-w-[200px] md:max-w-[230px] shadow-sm font-semibold"
                title="Seleccionar entrenador activo"
              >
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 text-[10px]">
                ▼
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

