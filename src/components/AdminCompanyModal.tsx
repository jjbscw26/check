import React, { useState, useEffect } from 'react';
import { Company } from '../types';
import { Building2 } from 'lucide-react';

interface AdminCompanyModalProps {
  company: Company | null; // null if creating a new one
  isOpen: boolean;
  onClose: () => void;
  onSave: (company: Company) => void;
}

export const AdminCompanyModal: React.FC<AdminCompanyModalProps> = ({
  company,
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [industry, setIndustry] = useState('');
  const [logoText, setLogoText] = useState('');

  useEffect(() => {
    if (company) {
      setName(company.name);
      setTaxId(company.taxId || '');
      setIndustry(company.industry || '');
      setLogoText(company.logoText || '');
    } else {
      setName('');
      setTaxId('');
      setIndustry('Servicios Corporativos');
      setLogoText('');
    }
  }, [company, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const initials = name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');

    const savedCompany: Company = {
      id: company ? company.id : `comp_${Date.now()}`,
      name: name.trim(),
      taxId: taxId.trim() || `RFC-${Math.floor(100000 + Math.random() * 900000)}`,
      industry: industry.trim() || 'Servicios Corporativos',
      logoText: (logoText.trim() || initials || 'CP').substring(0, 3).toUpperCase(),
      sedes: company ? company.sedes : [],
    };

    onSave(savedCompany);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-md max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner shrink-0">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                {company ? 'Editar Empresa Cliente' : 'Registrar Nueva Empresa'}
              </h3>
              <p className="text-xs text-red-100">
                Directorio corporativo y convenios de bienestar BSCW
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
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Razón Social o Nombre de la Empresa *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Grupo Financiero Banorte"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                RFC o NIT de la Empresa
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="GFB850101-A12"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Siglas o Badge Corto
              </label>
              <input
                type="text"
                maxLength={3}
                value={logoText}
                onChange={(e) => setLogoText(e.target.value)}
                placeholder="GB"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono uppercase focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Giro o Industria
            </label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Ej: Servicios Financieros / Manufactura / Farmacéutica"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
            />
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
              {company ? 'Guardar Cambios' : 'Registrar Empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
