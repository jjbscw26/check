import React, { useState, useEffect } from 'react';
import { Company, Sede } from '../types';
import { MapPin, Compass, Navigation } from 'lucide-react';
import { getCurrentPositionAsync } from '../utils/geo';

interface AdminSedeModalProps {
  sede: Sede | null; // null if creating a new one
  companyId?: string; // preselected company if clicked from a specific company
  companies: Company[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (sede: Sede) => void;
}

export const AdminSedeModal: React.FC<AdminSedeModalProps> = ({
  sede,
  companyId,
  companies,
  isOpen,
  onClose,
  onSave,
}) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    sede ? sede.companyId : companyId || (companies[0]?.id || '')
  );
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Ciudad de México');
  const [lat, setLat] = useState<number>(19.4269);
  const [lng, setLng] = useState<number>(-99.1678);
  const [geofenceRadiusMeters, setGeofenceRadiusMeters] = useState<number>(150);
  const [contactPerson, setContactPerson] = useState('');
  const [contactRole, setContactRole] = useState('Coordinador de Salud en el Trabajo');
  const [contactPhone, setContactPhone] = useState('');
  const [colorTag, setColorTag] = useState('bg-red-600');
  const [gettingLocation, setGettingLocation] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  useEffect(() => {
    if (sede) {
      setSelectedCompanyId(sede.companyId);
      setName(sede.name);
      setAddress(sede.address);
      setCity(sede.city || 'Ciudad de México');
      setLat(sede.lat);
      setLng(sede.lng);
      setGeofenceRadiusMeters(sede.geofenceRadiusMeters || 150);
      setContactPerson(sede.contactPerson || '');
      setContactRole(sede.contactRole || 'Coordinador de Salud en el Trabajo');
      setContactPhone(sede.contactPhone || '');
      setColorTag(sede.colorTag || 'bg-red-600');
    } else {
      setSelectedCompanyId(companyId || (companies[0]?.id || ''));
      setName('');
      setAddress('');
      setCity('Ciudad de México');
      setLat(19.4269);
      setLng(-99.1678);
      setGeofenceRadiusMeters(150);
      setContactPerson('');
      setContactRole('Coordinador de Salud en el Trabajo');
      setContactPhone('');
      setColorTag('bg-red-600');
    }
    setGpsError(null);
  }, [sede, companyId, companies, isOpen]);

  if (!isOpen) return null;

  const handleGetCurrentGps = async () => {
    setGettingLocation(true);
    setGpsError(null);
    try {
      const pos = await getCurrentPositionAsync(8000);
      setLat(pos.lat);
      setLng(pos.lng);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de permisos';
      setGpsError('No se pudo obtener el GPS actual: ' + msg);
    } finally {
      setGettingLocation(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const company = companies.find((c) => c.id === selectedCompanyId) || companies[0];

    const savedSede: Sede = {
      id: sede ? sede.id : `sede_${Date.now()}`,
      companyId: company.id,
      companyName: company.name,
      name: name.trim(),
      address: address.trim() || 'Dirección Corporativa',
      city: city.trim() || 'Ciudad de México',
      lat: Number(lat),
      lng: Number(lng),
      geofenceRadiusMeters: Number(geofenceRadiusMeters) || 150,
      contactPerson: contactPerson.trim() || 'Encargado de Sede',
      contactRole: contactRole.trim() || 'Responsable SST',
      contactPhone: contactPhone.trim() || '+52 55 0000 0000',
      colorTag,
    };

    onSave(savedSede);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-lg max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner shrink-0">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                {sede ? 'Editar Sede / Sucursal' : 'Registrar Nueva Sede'}
              </h3>
              <p className="text-xs text-red-100">
                Ubicación oficial, geocerca GPS y contactos para validación
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
          {/* Company select */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Empresa a la que Pertenece *
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-red-500"
            >
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sede Name */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nombre de la Sede / Campus / Planta *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Torre Corporativa Reforma / Planta Toluca"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Address and City */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Dirección Completa *
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, Número, Colonia, Alcaldía/Municipio"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ciudad / Estado
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="CDMX"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Coordinates & Geofence */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center">
                <Compass className="w-4 h-4 mr-1 text-red-600" />
                Coordenadas GPS y Radio de Geocerca
              </span>
              <button
                type="button"
                onClick={handleGetCurrentGps}
                disabled={gettingLocation}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-red-600 border border-slate-300 rounded-lg text-[11px] font-semibold flex items-center shadow-xs"
              >
                <Navigation className="w-3 h-3 mr-1" />
                {gettingLocation ? 'Consultando...' : 'Tomar mi GPS Actual'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  Latitud
                </label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  Longitud
                </label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  Radio Geocerca (m)
                </label>
                <input
                  type="number"
                  min={30}
                  max={1000}
                  value={geofenceRadiusMeters}
                  onChange={(e) => setGeofenceRadiusMeters(parseInt(e.target.value) || 150)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
            {gpsError && (
              <p className="text-[11px] text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                {gpsError}
              </p>
            )}
            <p className="text-[10px] text-slate-500">
              Cualquier entrenador a una distancia menor a {geofenceRadiusMeters} metros será validado como presente dentro del perímetro.
            </p>
          </div>

          {/* Color Tag */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Etiqueta de Color Visual (`colorTag`)
            </label>
            <select
              value={colorTag}
              onChange={(e) => setColorTag(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
            >
              <option value="bg-red-600">Rojo BSCW (bg-red-600)</option>
              <option value="bg-red-500">Rojo Claro (bg-red-500)</option>
              <option value="bg-blue-600">Azul Corporativo (bg-blue-600)</option>
              <option value="bg-emerald-600">Verde Salud (bg-emerald-600)</option>
              <option value="bg-amber-600">Ámbar Operativo (bg-amber-600)</option>
              <option value="bg-slate-800">Pizarra Ejecutiva (bg-slate-800)</option>
            </select>
          </div>

          {/* Contact Person */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Contacto en Sede
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Lic. Laura Peñaloza"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Rol o Puesto
              </label>
              <input
                type="text"
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                placeholder="Gerente de Bienestar y SST"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Teléfono Directo
              </label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+52 55 5100 1122"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
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
              {sede ? 'Guardar Cambios' : 'Registrar Sede'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
