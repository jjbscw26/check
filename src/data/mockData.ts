import {
  ActivityCatalogItem,
  ActivityType,
  AttendanceRecord,
  ClassAssignment,
  Company,
  normalizeActivityType,
  Trainer,
} from '../types';

export const INITIAL_TRAINERS: Trainer[] = [
  {
    id: 'tr_1',
    name: 'Carlos Mendoza',
    email: 'carlos.mendoza@bscw.corp',
    phone: '+52 55 4123 8901',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    specialties: ['Pausas Activas', 'Entrenamiento Funcional', 'Ergonomía Laboral'],
    active: true,
  },
  {
    id: 'tr_2',
    name: 'Valentina Ríos',
    email: 'valentina.rios@bscw.corp',
    phone: '+52 55 8921 4455',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    specialties: ['Yoga Corporativo', 'Pilates Mat', 'Mindfulness y Respiración'],
    active: true,
  },
  {
    id: 'tr_3',
    name: 'Andrés Silva',
    email: 'andres.silva@bscw.corp',
    phone: '+52 55 3344 7788',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    specialties: ['HIIT & Cardio', 'Zumba / Ritmos Latinos', 'Pausas Activas'],
    active: true,
  },
  {
    id: 'tr_4',
    name: 'Mariana Gómez',
    email: 'mariana.gomez@bscw.corp',
    phone: '+52 55 6677 8899',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    specialties: ['Movilidad Articular', 'Tonificación con Bandas', 'Gimnasia Cerebral'],
    active: true,
  },
];

export const INITIAL_COMPANIES: Company[] = [
  {
    id: 'comp_1',
    name: 'Banco Santander Corporativo',
    taxId: 'SAN891024-K92',
    industry: 'Servicios Financieros',
    logoText: 'BS',
    sedes: [
      {
        id: 'sede_1_1',
        companyId: 'comp_1',
        companyName: 'Banco Santander Corporativo',
        name: 'Torre Corporativa Reforma',
        address: 'Paseo de la Reforma 500, Cuauhtémoc, CDMX',
        city: 'Ciudad de México',
        lat: 19.42694,
        lng: -99.16782,
        geofenceRadiusMeters: 180,
        contactPerson: 'Lic. Laura Peñaloza',
        contactRole: 'Gerente de Bienestar y SST',
        contactPhone: '+52 55 5100 1122',
        colorTag: 'bg-red-500',
      },
      {
        id: 'sede_1_2',
        companyId: 'comp_1',
        companyName: 'Banco Santander Corporativo',
        name: 'Centro Operativo Santa Fe',
        address: 'Av. Vasco de Quiroga 3900, Santa Fe, CDMX',
        city: 'Ciudad de México',
        lat: 19.36015,
        lng: -99.26123,
        geofenceRadiusMeters: 200,
        contactPerson: 'Ing. Rodrigo Cárdenas',
        contactRole: 'Coordinador de Salud Ocupacional',
        contactPhone: '+52 55 5100 3344',
        colorTag: 'bg-red-600',
      },
    ],
  },
  {
    id: 'comp_2',
    name: 'Nestlé México',
    taxId: 'NES770512-AB1',
    industry: 'Alimentos y Bebidas',
    logoText: 'NM',
    sedes: [
      {
        id: 'sede_2_1',
        companyId: 'comp_2',
        companyName: 'Nestlé México',
        name: 'Sede Central Polanco',
        address: 'Av. Ejército Nacional 453, Granada, Miguel Hidalgo',
        city: 'Ciudad de México',
        lat: 19.43982,
        lng: -99.18341,
        geofenceRadiusMeters: 150,
        contactPerson: 'Dra. Carmen Morales',
        contactRole: 'Médico Laboral y Salud Integral',
        contactPhone: '+52 55 4567 1234',
        colorTag: 'bg-blue-600',
      },
      {
        id: 'sede_2_2',
        companyId: 'comp_2',
        companyName: 'Nestlé México',
        name: 'Centro de Distribución Tlalnepantla',
        address: 'Vía Gustavo Baz 120, Tlalnepantla, Edomex',
        city: 'Estado de México',
        lat: 19.53912,
        lng: -99.20145,
        geofenceRadiusMeters: 250,
        contactPerson: 'Jorge Salgado',
        contactRole: 'Supervisor de Seguridad Industrial',
        contactPhone: '+52 55 8901 2345',
        colorTag: 'bg-blue-700',
      },
    ],
  },
  {
    id: 'comp_3',
    name: 'TechHub Latin America',
    taxId: 'THL190304-T77',
    industry: 'Tecnología & Software',
    logoText: 'TH',
    sedes: [
      {
        id: 'sede_3_1',
        companyId: 'comp_3',
        companyName: 'TechHub Latin America',
        name: 'Campus Insurgentes Sur',
        address: 'Av. Insurgentes Sur 1602, Crédito Constructor, Benito Juárez',
        city: 'Ciudad de México',
        lat: 19.36225,
        lng: -99.18102,
        geofenceRadiusMeters: 120,
        contactPerson: 'Lic. Sofía Duarte',
        contactRole: 'People Operations Lead',
        contactPhone: '+52 55 7788 9900',
        colorTag: 'bg-emerald-600',
      },
    ],
  },
  {
    id: 'comp_4',
    name: 'Consultoría Deloitte Global',
    taxId: 'DEL990115-ZX3',
    industry: 'Consultoría y Auditoría',
    logoText: 'DG',
    sedes: [
      {
        id: 'sede_4_1',
        companyId: 'comp_4',
        companyName: 'Consultoría Deloitte Global',
        name: 'Torre Diana Reforma',
        address: 'Río Lerma 232, Cuauhtémoc, CDMX',
        city: 'Ciudad de México',
        lat: 19.42411,
        lng: -99.17245,
        geofenceRadiusMeters: 140,
        contactPerson: 'Mateo Villanueva',
        contactRole: 'Gerente de Clima Laboral',
        contactPhone: '+52 55 1122 3344',
        colorTag: 'bg-amber-600',
      },
    ],
  },
];

// Helper to generate a sample gym/meeting room photo with watermark
export function generateSamplePresencePhoto(
  title: string,
  sede: string,
  trainer: string,
  time: string,
  gps: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#111827" />
      </linearGradient>
      <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(15,23,42,0)" />
        <stop offset="40%" stop-color="rgba(15,23,42,0.6)" />
        <stop offset="100%" stop-color="rgba(15,23,42,0.95)" />
      </linearGradient>
    </defs>
    <!-- Background representation of office/salon -->
    <rect width="600" height="400" fill="url(#bg)"/>
    <circle cx="300" cy="180" r="140" fill="#0284c7" opacity="0.15" />
    <polygon points="120,280 240,120 360,280" fill="#3b82f6" opacity="0.1" />
    <circle cx="450" cy="120" r="60" fill="#10b981" opacity="0.1" />
    
    <!-- Presence graphic -->
    <g transform="translate(240, 100)">
      <circle cx="60" cy="40" r="30" fill="#38bdf8" opacity="0.8"/>
      <path d="M 20 120 C 20 80, 100 80, 100 120 Z" fill="#38bdf8" opacity="0.8"/>
      <circle cx="60" cy="40" r="14" fill="#0f172a"/>
    </g>
    <text x="300" y="240" font-family="sans-serif" font-size="14" font-weight="600" fill="#94a3b8" text-anchor="middle">SALÓN / ÁREA CORPORATIVA ACTIVADA</text>

    <!-- Stamp badge -->
    <rect x="20" y="20" width="220" height="32" rx="6" fill="#0f172a" stroke="#10b981" stroke-width="1.5" />
    <circle cx="36" cy="36" r="5" fill="#10b981" />
    <text x="50" y="41" font-family="sans-serif" font-size="12" font-weight="bold" fill="#10b981">EVIDENCIA EN TIEMPO REAL</text>

    <!-- Watermark Banner -->
    <rect x="0" y="270" width="600" height="130" fill="url(#overlay)"/>
    <text x="24" y="306" font-family="sans-serif" font-size="15" font-weight="bold" fill="#ffffff">📍 ${sede}</text>
    <text x="24" y="330" font-family="sans-serif" font-size="12" fill="#e2e8f0">👤 Entrenador(a): ${trainer}  |  ⚡ ${title}</text>
    <text x="24" y="352" font-family="monospace" font-size="12" font-weight="bold" fill="#38bdf8">🕒 ${time}</text>
    <text x="24" y="374" font-family="monospace" font-size="12" fill="#a7f3d0">🌐 ${gps}</text>
    <text x="24" y="390" font-family="monospace" font-size="9" fill="#94a3b8">CERTIFICADO OFICIAL BSCW CHECK • SELLO AUTÉNTICO VERIFICADO</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Helper to generate a sample face photo with biometric stamp
export function generateSampleFacePhoto(name: string, score: number = 98.4): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#f1f5f9"/>
    <ellipse cx="200" cy="180" rx="95" ry="125" fill="none" stroke="#dc2626" stroke-width="3" stroke-dasharray="8,5"/>
    <circle cx="200" cy="160" r="55" fill="#e2e8f0"/>
    <circle cx="180" cy="150" r="6" fill="#475569"/>
    <circle cx="220" cy="150" r="6" fill="#475569"/>
    <path d="M 185 185 Q 200 200, 215 185" stroke="#475569" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="0" y="300" width="400" height="100" fill="#0f172a"/>
    <text x="20" y="335" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff">👤 ${name}</text>
    <text x="20" y="360" font-family="sans-serif" font-size="12" font-weight="bold" fill="#4ade80">✓ ROSTRO VERIFICADO • ${score}%</text>
    <text x="20" y="380" font-family="monospace" font-size="10" fill="#94a3b8">SELLO BIOMÉTRICO BSCW • VIVACIDAD OK</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatLocalDateYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Prepopulate realistic records for daily & monthly reports
export function getInitialRecords(): AttendanceRecord[] {
  const today = new Date();
  const formatYMD = formatLocalDateYMD;

  const d0 = formatYMD(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const d1 = formatYMD(yesterday);
  const d2Date = new Date(today);
  d2Date.setDate(d2Date.getDate() - 2);
  const d2 = formatYMD(d2Date);
  const d3Date = new Date(today);
  d3Date.setDate(d3Date.getDate() - 5);
  const d3 = formatYMD(d3Date);
  const d4Date = new Date(today);
  d4Date.setDate(d4Date.getDate() - 12);
  const d4 = formatYMD(d4Date);

  return [
    // Today records
    {
      id: 'rec_101',
      assignmentId: 'asg_carlos_cerrada_hoy',
      trainerId: 'tr_1',
      trainerName: 'Carlos Mendoza',
      companyId: 'comp_1',
      companyName: 'Banco Santander Corporativo',
      sedeId: 'sede_1_1',
      sedeName: 'Torre Corporativa Reforma',
      sedeAddress: 'Paseo de la Reforma 500, Cuauhtémoc, CDMX',
      date: d0,
      scheduledTime: '08:30',
      checkInTime: '08:28:14',
      checkInIso: `${d0}T08:28:14.000Z`,
      checkOutTime: '09:20:05',
      checkOutIso: `${d0}T09:20:05.000Z`,
      status: 'completado',
      punctualityStatus: 'a_tiempo',
      punctualityDiffMinutes: 2, // 2 minutes early
      activityType: 'pausa_activa',
      activityName: 'Pausa Activa: Ergonomía y Estiramientos',
      attendeesCount: 24,
      locationArea: 'Piso 12 - Área Financiera y Tesorería',
      observations: 'Excelente participación del equipo de tesorería. Se enfocó en descompresión cervical y muñecas.',
      checkInGps: {
        lat: 19.42698,
        lng: -99.16779,
        accuracy: 8,
        distanceToSedeMeters: 14,
        isWithinGeofence: true,
        capturedAt: `${d0} 08:28:14`,
      },
      checkOutGps: {
        lat: 19.42697,
        lng: -99.16781,
        accuracy: 9,
        distanceToSedeMeters: 12,
        isWithinGeofence: true,
        capturedAt: `${d0} 09:20:05`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Pausa Activa: Ergonomía y Estiramientos',
        'Torre Corporativa Reforma',
        'Carlos Mendoza',
        `${d0} 08:28:14`,
        'GPS: 19.426980, -99.167790 (±8m)'
      ),
      facialVerification: {
        verified: true,
        confidenceScore: 98.7,
        facePhotoUrl: generateSampleFacePhoto('Carlos Mendoza', 98.7),
        capturedAt: '08:28:10',
        biometricId: 'BSCW-FACE-CM01',
        livenessPassed: true,
        trainerName: 'Carlos Mendoza',
      },
      durationMinutes: 52,
      adminVerified: true,
      adminNotes: 'Validado conforme por SST.',
    },
    {
      id: 'rec_102',
      assignmentId: 'asg_valentina_cerrada_hoy',
      trainerId: 'tr_2',
      trainerName: 'Valentina Ríos',
      companyId: 'comp_3',
      companyName: 'TechHub Latin America',
      sedeId: 'sede_3_1',
      sedeName: 'Campus Insurgentes Sur',
      sedeAddress: 'Av. Insurgentes Sur 1602, Crédito Constructor, CDMX',
      date: d0,
      scheduledTime: '10:00',
      checkInTime: '09:55:40',
      checkInIso: `${d0}T09:55:40.000Z`,
      checkOutTime: '11:00:15',
      checkOutIso: `${d0}T11:00:15.000Z`,
      status: 'completado',
      punctualityStatus: 'a_tiempo',
      punctualityDiffMinutes: 4,
      activityType: 'clase_fitness',
      activityName: 'Clase Fitness: Yoga Corporativo',
      attendeesCount: 18,
      locationArea: 'Terraza Principal - Piso 4',
      observations: 'Clase de Yoga Restaurativo anti-estrés para ingenieros de desarrollo. Asistencia completa.',
      checkInGps: {
        lat: 19.36228,
        lng: -99.18105,
        accuracy: 6,
        distanceToSedeMeters: 18,
        isWithinGeofence: true,
        capturedAt: `${d0} 09:55:40`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Clase Fitness: Yoga Corporativo',
        'Campus Insurgentes Sur',
        'Valentina Ríos',
        `${d0} 09:55:40`,
        'GPS: 19.362280, -99.181050 (±6m)'
      ),
      facialVerification: {
        verified: true,
        confidenceScore: 99.1,
        facePhotoUrl: generateSampleFacePhoto('Valentina Ríos', 99.1),
        capturedAt: '09:55:30',
        biometricId: 'BSCW-FACE-VR02',
        livenessPassed: true,
        trainerName: 'Valentina Ríos',
      },
      durationMinutes: 65,
      adminVerified: true,
      adminNotes: 'Excelente retroalimentación de la empresa.',
    },
    {
      id: 'rec_103',
      assignmentId: 'asg_andres_hoy',
      trainerId: 'tr_3',
      trainerName: 'Andrés Silva',
      companyId: 'comp_2',
      companyName: 'Nestlé México',
      sedeId: 'sede_2_1',
      sedeName: 'Sede Central Polanco',
      sedeAddress: 'Av. Ejército Nacional 453, Granada',
      date: d0,
      scheduledTime: '11:30',
      checkInTime: '11:42:10',
      checkInIso: `${d0}T11:42:10.000Z`,
      checkOutTime: null,
      status: 'en_curso',
      punctualityStatus: 'con_retraso',
      punctualityDiffMinutes: -12, // 12 min delayed
      activityType: 'clase_fitness',
      activityName: 'Clase Fitness: Entrenamiento Funcional',
      attendeesCount: 22,
      locationArea: 'Gimnasio Corporativo - Sótano 1',
      observations: 'Demora de 12 minutos por protocolo de acceso vehicular en caseta.',
      checkInGps: {
        lat: 19.43989,
        lng: -99.18335,
        accuracy: 10,
        distanceToSedeMeters: 22,
        isWithinGeofence: true,
        capturedAt: `${d0} 11:42:10`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Clase Fitness: Entrenamiento Funcional',
        'Sede Central Polanco',
        'Andrés Silva',
        `${d0} 11:42:10`,
        'GPS: 19.439890, -99.183350 (±10m)'
      ),
      plannedDurationMinutes: 50,
      alarmEnabled: true,
      alarmSnoozedUntilIso: null,
      adminVerified: false,
    },
    // Yesterday records
    {
      id: 'rec_104',
      assignmentId: 'asg_mariana_cerrada_ayer',
      trainerId: 'tr_4',
      trainerName: 'Mariana Gómez',
      companyId: 'comp_4',
      companyName: 'Consultoría Deloitte Global',
      sedeId: 'sede_4_1',
      sedeName: 'Torre Diana Reforma',
      sedeAddress: 'Río Lerma 232, Cuauhtémoc, CDMX',
      date: d1,
      scheduledTime: '09:00',
      checkInTime: '08:52:15',
      checkInIso: `${d1}T08:52:15.000Z`,
      checkOutTime: '09:40:00',
      checkOutIso: `${d1}T09:40:00.000Z`,
      status: 'completado',
      punctualityStatus: 'adelantado',
      punctualityDiffMinutes: 8,
      activityType: 'pausa_activa',
      activityName: 'Pausa Activa: Movilidad Articular y Postura',
      attendeesCount: 31,
      locationArea: 'Piso 18 - Open Space Auditoría',
      observations: 'Se recorrieron 3 islas de trabajo. Gran receptividad.',
      checkInGps: {
        lat: 19.42415,
        lng: -99.17240,
        accuracy: 5,
        distanceToSedeMeters: 10,
        isWithinGeofence: true,
        capturedAt: `${d1} 08:52:15`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Pausa Activa: Movilidad Articular',
        'Torre Diana Reforma',
        'Mariana Gómez',
        `${d1} 08:52:15`,
        'GPS: 19.424150, -99.172400 (±5m)'
      ),
      durationMinutes: 48,
      adminVerified: true,
      adminNotes: 'Acreditado y revisado.',
    },
    {
      id: 'rec_105',
      assignmentId: 'asg_carlos_tlalnepantla_ayer',
      trainerId: 'tr_1',
      trainerName: 'Carlos Mendoza',
      companyId: 'comp_2',
      companyName: 'Nestlé México',
      sedeId: 'sede_2_2',
      sedeName: 'Centro de Distribución Tlalnepantla',
      sedeAddress: 'Vía Gustavo Baz 120, Edomex',
      date: d1,
      scheduledTime: '14:00',
      checkInTime: '13:58:20',
      checkInIso: `${d1}T13:58:20.000Z`,
      checkOutTime: '14:50:10',
      checkOutIso: `${d1}T14:50:10.000Z`,
      status: 'completado',
      punctualityStatus: 'a_tiempo',
      punctualityDiffMinutes: 2,
      activityType: 'pausa_activa',
      activityName: 'Pausa Activa: Ergonomía y Estiramientos',
      attendeesCount: 28,
      locationArea: 'Nave Logística y Almacén Central',
      observations: 'Pausa activa para personal operativo de almacén con énfasis lumbar.',
      checkInGps: {
        lat: 19.53920,
        lng: -99.20140,
        accuracy: 12,
        distanceToSedeMeters: 30,
        isWithinGeofence: true,
        capturedAt: `${d1} 13:58:20`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Pausa Activa: Almacén Logístico',
        'Centro de Distribución Tlalnepantla',
        'Carlos Mendoza',
        `${d1} 13:58:20`,
        'GPS: 19.539200, -99.201400 (±12m)'
      ),
      durationMinutes: 52,
      adminVerified: true,
    },
    // Past days records for monthly reports
    {
      id: 'rec_106',
      assignmentId: 'asg_valentina_santafe_d2',
      trainerId: 'tr_2',
      trainerName: 'Valentina Ríos',
      companyId: 'comp_1',
      companyName: 'Banco Santander Corporativo',
      sedeId: 'sede_1_2',
      sedeName: 'Centro Operativo Santa Fe',
      sedeAddress: 'Av. Vasco de Quiroga 3900',
      date: d2,
      scheduledTime: '16:00',
      checkInTime: '16:01:10',
      checkInIso: `${d2}T16:01:10.000Z`,
      checkOutTime: '17:05:00',
      checkOutIso: `${d2}T17:05:00.000Z`,
      status: 'completado',
      punctualityStatus: 'a_tiempo',
      punctualityDiffMinutes: -1,
      activityType: 'clase_fitness',
      activityName: 'Clase Fitness: Pilates Mat',
      attendeesCount: 19,
      locationArea: 'Sala de Bienestar - Piso 2',
      observations: 'Sesión de pilates mat para fortalecimiento de core.',
      checkInGps: {
        lat: 19.36020,
        lng: -99.26120,
        accuracy: 7,
        distanceToSedeMeters: 15,
        isWithinGeofence: true,
        capturedAt: `${d2} 16:01:10`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Clase Fitness: Pilates Mat',
        'Centro Operativo Santa Fe',
        'Valentina Ríos',
        `${d2} 16:01:10`,
        'GPS: 19.360200, -99.261200 (±7m)'
      ),
      durationMinutes: 64,
      adminVerified: true,
    },
    {
      id: 'rec_107',
      assignmentId: 'asg_andres_techhub_d3',
      trainerId: 'tr_3',
      trainerName: 'Andrés Silva',
      companyId: 'comp_3',
      companyName: 'TechHub Latin America',
      sedeId: 'sede_3_1',
      sedeName: 'Campus Insurgentes Sur',
      sedeAddress: 'Av. Insurgentes Sur 1602',
      date: d3,
      scheduledTime: '17:30',
      checkInTime: '17:48:00',
      checkInIso: `${d3}T17:48:00.000Z`,
      checkOutTime: '18:45:00',
      checkOutIso: `${d3}T18:45:00.000Z`,
      status: 'completado',
      punctualityStatus: 'con_retraso',
      punctualityDiffMinutes: -18,
      activityType: 'clase_fitness',
      activityName: 'Clase Fitness: Zumba y Ritmos Latinos',
      attendeesCount: 26,
      locationArea: 'Terraza Principal - Piso 4',
      observations: 'Retraso de 18 min por tormenta y tráfico en Insurgentes.',
      checkInGps: {
        lat: 19.36230,
        lng: -99.18110,
        accuracy: 9,
        distanceToSedeMeters: 25,
        isWithinGeofence: true,
        capturedAt: `${d3} 17:48:00`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Clase Fitness: Zumba y Ritmos Latinos',
        'Campus Insurgentes Sur',
        'Andrés Silva',
        `${d3} 17:48:00`,
        'GPS: 19.362300, -99.181100 (±9m)'
      ),
      durationMinutes: 57,
      adminVerified: true,
      adminNotes: 'Retraso justificado por clima adverso.',
    },
    {
      id: 'rec_108',
      assignmentId: 'asg_mariana_reforma_d4',
      trainerId: 'tr_4',
      trainerName: 'Mariana Gómez',
      companyId: 'comp_1',
      companyName: 'Banco Santander Corporativo',
      sedeId: 'sede_1_1',
      sedeName: 'Torre Corporativa Reforma',
      sedeAddress: 'Paseo de la Reforma 500, CDMX',
      date: d4,
      scheduledTime: '10:00',
      checkInTime: '09:56:10',
      checkInIso: `${d4}T09:56:10.000Z`,
      checkOutTime: '10:45:00',
      checkOutIso: `${d4}T10:45:00.000Z`,
      status: 'completado',
      punctualityStatus: 'a_tiempo',
      punctualityDiffMinutes: 4,
      activityType: 'pausa_activa',
      activityName: 'Pausa Activa: Gimnasia Cerebral y Respiración',
      attendeesCount: 29,
      locationArea: 'Piso 15 - Torre Reforma',
      observations: 'Dinámicas neuro-motoras para agilidad mental en finanzas.',
      checkInGps: {
        lat: 19.42695,
        lng: -99.16780,
        accuracy: 7,
        distanceToSedeMeters: 8,
        isWithinGeofence: true,
        capturedAt: `${d4} 09:56:10`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Pausa Activa: Gimnasia Cerebral',
        'Torre Corporativa Reforma',
        'Mariana Gómez',
        `${d4} 09:56:10`,
        'GPS: 19.426950, -99.167800 (±7m)'
      ),
      durationMinutes: 49,
      adminVerified: true,
    },
    {
      id: 'rec_109',
      assignmentId: 'asg_carlos_sin_cierre_hoy',
      trainerId: 'tr_1',
      trainerName: 'Carlos Mendoza',
      companyId: 'comp_3',
      companyName: 'TechHub Latin America',
      sedeId: 'sede_3_1',
      sedeName: 'Campus Insurgentes Sur',
      sedeAddress: 'Av. Insurgentes Sur 1602, Crédito Constructor, CDMX',
      date: d1,
      scheduledTime: '17:00',
      checkInTime: '17:02:15',
      checkInIso: `${d1}T17:02:15`,
      checkOutTime: null,
      status: 'incumplido',
      nonComplianceReason: 'sin_cierre_30m',
      markedNonCompliantAt: '18:20:00',
      punctualityStatus: 'a_tiempo',
      punctualityDiffMinutes: -2,
      activityType: 'pausa_activa',
      activityName: 'Pausa Activa: Respiración y Anti-estrés',
      attendeesCount: 0,
      locationArea: 'Piso 3 - Open Space Ingeniería',
      observations:
        'Entrada registrada en sede. [Sistema BSCW] Salida pendiente dada por TERMINADA a los 60 min después de la hora de término (18:20 hrs) y calificada como NO CERRADA.',
      checkInGps: {
        lat: 19.36229,
        lng: -99.18106,
        accuracy: 8,
        distanceToSedeMeters: 16,
        isWithinGeofence: true,
        capturedAt: `${d1} 17:02:15`,
      },
      photoUrl: generateSamplePresencePhoto(
        'Pausa Activa: Respiración y Anti-estrés',
        'Campus Insurgentes Sur',
        'Carlos Mendoza',
        `${d1} 17:02:15`,
        'GPS: 19.362290, -99.181060 (±8m)'
      ),
      plannedDurationMinutes: 20,
      alarmEnabled: false,
      alarmSnoozedUntilIso: null,
      adminVerified: false,
      adminNotes: 'Salida pendiente dada por terminada a los 60 minutos de la hora de término y calificada como No Cerrada.',
    },
  ];
}

const _seedNow = new Date();
const _seedTodayYMD = formatLocalDateYMD(_seedNow);
const _seedYesterday = new Date(_seedNow);
_seedYesterday.setDate(_seedYesterday.getDate() - 1);
const _seedYesterdayYMD = formatLocalDateYMD(_seedYesterday);
const _seedD2 = new Date(_seedNow);
_seedD2.setDate(_seedD2.getDate() - 2);
const _seedD2YMD = formatLocalDateYMD(_seedD2);
const _seedD3 = new Date(_seedNow);
_seedD3.setDate(_seedD3.getDate() - 5);
const _seedD3YMD = formatLocalDateYMD(_seedD3);
const _seedD4 = new Date(_seedNow);
_seedD4.setDate(_seedD4.getDate() - 12);
const _seedD4YMD = formatLocalDateYMD(_seedD4);
const _futureHour = Math.min(23, Math.max(19, _seedNow.getHours() + 2));
const _upcomingTodayTime = `${String(_futureHour).padStart(2, '0')}:30`;
const _expiredTodayOrYesterdayDate = _seedNow.getHours() >= 8 ? _seedTodayYMD : _seedYesterdayYMD;
const _expiredScheduleTime = _seedNow.getHours() >= 8 ? '07:15' : '18:30';

export const INITIAL_ASSIGNMENTS: ClassAssignment[] = [
  {
    id: 'asg_1',
    trainerId: 'tr_1',
    trainerName: 'Carlos Mendoza',
    companyId: 'comp_1',
    companyName: 'Banco Santander Corporativo',
    sedeId: 'sede_1_1',
    sedeName: 'Torre Corporativa Reforma',
    sedeAddress: 'Paseo de la Reforma 500, Cuauhtémoc, CDMX',
    frequency: 'semanal',
    dayOfWeek: 1, // Lunes
    time: '08:30',
    durationMinutes: 20,
    activityType: 'pausa_activa',
    activityName: 'Pausa Activa: Ergonomía y Estiramientos',
    locationArea: 'Piso 12 - Área Financiera y Tesorería',
    expectedAttendees: 25,
    notes: 'Priorizar estiramientos cervicales y de muñeca.',
    active: true,
  },
  {
    id: 'asg_carlos_hoy',
    trainerId: 'tr_1',
    trainerName: 'Carlos Mendoza',
    companyId: 'comp_4',
    companyName: 'Consultoría Deloitte Global',
    sedeId: 'sede_4_1',
    sedeName: 'Torre Diana Reforma',
    sedeAddress: 'Río Lerma 232, Cuauhtémoc, CDMX',
    frequency: 'fecha_unica',
    date: _seedTodayYMD, // Asignación vigente para hoy
    time: _upcomingTodayTime,
    durationMinutes: 50,
    activityType: 'clase_fitness',
    activityName: 'Clase Fitness: Tonificación y Fuerza con Bandas',
    locationArea: 'Piso 15 - Salón Polivalente Auditoría',
    expectedAttendees: 18,
    notes: 'Sesión especial de bienestar corporal programada por la administración.',
    active: true,
  },
  {
    id: 'asg_carlos_fuera_horario_hoy',
    trainerId: 'tr_1',
    trainerName: 'Carlos Mendoza',
    companyId: 'comp_2',
    companyName: 'Nestlé México',
    sedeId: 'sede_2_1',
    sedeName: 'Sede Central Polanco',
    sedeAddress: 'Av. Ejército Nacional 453, Granada',
    frequency: 'fecha_unica',
    date: _expiredTodayOrYesterdayDate,
    time: _expiredScheduleTime,
    durationMinutes: 20,
    activityType: 'pausa_activa',
    activityName: 'Pausa Activa: Movilidad Articular y Postura',
    locationArea: 'Piso 6 - Dirección Comercial',
    expectedAttendees: 20,
    notes: 'Pausa matutina programada por administración.',
    active: true,
    nonCompliant: true,
    nonCompliantReason: 'fuera_de_horario',
    nonCompliantAt: `${_expiredTodayOrYesterdayDate} 07:36:00`,
    missedDates: [_expiredTodayOrYesterdayDate],
  },
  {
    id: 'asg_carlos_sin_cierre_hoy',
    trainerId: 'tr_1',
    trainerName: 'Carlos Mendoza',
    companyId: 'comp_3',
    companyName: 'TechHub Latin America',
    sedeId: 'sede_3_1',
    sedeName: 'Campus Insurgentes Sur',
    sedeAddress: 'Av. Insurgentes Sur 1602, Crédito Constructor, CDMX',
    frequency: 'fecha_unica',
    date: _seedYesterdayYMD,
    time: '17:00',
    durationMinutes: 20,
    activityType: 'pausa_activa',
    activityName: 'Pausa Activa: Respiración y Anti-estrés',
    locationArea: 'Piso 3 - Open Space Ingeniería',
    expectedAttendees: 18,
    notes: 'Sesión vespertina de descompresión.',
    active: true,
    nonCompliant: true,
    nonCompliantReason: 'sin_cierre_30m',
    nonCompliantAt: `${_seedYesterdayYMD} 17:52:15`,
    missedDates: [_seedYesterdayYMD],
  },
  {
    id: 'asg_2',
    trainerId: 'tr_1',
    trainerName: 'Carlos Mendoza',
    companyId: 'comp_2',
    companyName: 'Nestlé México',
    sedeId: 'sede_2_2',
    sedeName: 'Centro de Distribución Tlalnepantla',
    sedeAddress: 'Vía Gustavo Baz 120, Tlalnepantla',
    frequency: 'semanal',
    dayOfWeek: 3, // Miércoles
    time: '14:00',
    durationMinutes: 20,
    activityType: 'pausa_activa',
    activityName: 'Pausa Activa: Ergonomía y Estiramientos',
    locationArea: 'Nave Logística y Almacén Central',
    expectedAttendees: 30,
    notes: 'Personal de almacén. Énfasis en espalda baja.',
    active: true,
  },
  {
    id: 'asg_3',
    trainerId: 'tr_2',
    trainerName: 'Valentina Ríos',
    companyId: 'comp_3',
    companyName: 'TechHub Latin America',
    sedeId: 'sede_3_1',
    sedeName: 'Campus Insurgentes Sur',
    sedeAddress: 'Av. Insurgentes Sur 1602, CDMX',
    frequency: 'semanal',
    dayOfWeek: 2, // Martes
    time: '10:00',
    durationMinutes: 55,
    activityType: 'clase_fitness',
    activityName: 'Clase Fitness: Yoga Corporativo',
    locationArea: 'Terraza Principal - Piso 4',
    expectedAttendees: 20,
    notes: 'Llevar tapetes adicionales para el equipo de desarrollo.',
    active: true,
  },
  {
    id: 'asg_4',
    trainerId: 'tr_2',
    trainerName: 'Valentina Ríos',
    companyId: 'comp_1',
    companyName: 'Banco Santander Corporativo',
    sedeId: 'sede_1_2',
    sedeName: 'Centro Operativo Santa Fe',
    sedeAddress: 'Av. Vasco de Quiroga 3900',
    frequency: 'mensual',
    dayOfMonth: 15, // Día 15 de cada mes
    time: '16:00',
    durationMinutes: 50,
    activityType: 'clase_fitness',
    activityName: 'Clase Fitness: Pilates Mat',
    locationArea: 'Sala de Bienestar - Piso 2',
    expectedAttendees: 22,
    notes: 'Sesión mensual intensiva de postura.',
    active: true,
  },
  {
    id: 'asg_carlos_cerrada_hoy',
    trainerId: 'tr_1',
    trainerName: 'Carlos Mendoza',
    companyId: 'comp_1',
    companyName: 'Banco Santander Corporativo',
    sedeId: 'sede_1_1',
    sedeName: 'Torre Corporativa Reforma',
    sedeAddress: 'Paseo de la Reforma 500, Cuauhtémoc, CDMX',
    frequency: 'fecha_unica',
    date: _seedTodayYMD,
    time: '08:30',
    durationMinutes: 50,
    activityType: 'pausa_activa',
    activityName: 'Pausa Activa: Ergonomía y Estiramientos',
    locationArea: 'Piso 12 - Área Financiera y Tesorería',
    expectedAttendees: 25,
    notes: 'Sesión matutina de ergonomía completada y cerrada.',
    active: true,
    closed: true,
    closedAt: '09:20:05',
    completedDates: [_seedTodayYMD],
  },
  {
    id: 'asg_valentina_cerrada_hoy',
    trainerId: 'tr_2',
    trainerName: 'Valentina Ríos',
    companyId: 'comp_3',
    companyName: 'TechHub Latin America',
    sedeId: 'sede_3_1',
    sedeName: 'Campus Insurgentes Sur',
    sedeAddress: 'Av. Insurgentes Sur 1602, Crédito Constructor, CDMX',
    frequency: 'fecha_unica',
    date: _seedTodayYMD,
    time: '10:00',
    durationMinutes: 60,
    activityType: 'clase_fitness',
    activityName: 'Clase Fitness: Yoga Corporativo',
    locationArea: 'Terraza Principal - Piso 4',
    expectedAttendees: 20,
    notes: 'Yoga restaurativo anti-estrés para desarrollo.',
    active: true,
    closed: true,
    closedAt: '11:00:15',
    completedDates: [_seedTodayYMD],
  },
  {
    id: 'asg_andres_hoy',
    trainerId: 'tr_3',
    trainerName: 'Andrés Silva',
    companyId: 'comp_2',
    companyName: 'Nestlé México',
    sedeId: 'sede_2_1',
    sedeName: 'Sede Central Polanco',
    sedeAddress: 'Av. Ejército Nacional 453, Granada',
    frequency: 'fecha_unica',
    date: _seedTodayYMD,
    time: '11:30',
    durationMinutes: 50,
    activityType: 'clase_fitness',
    activityName: 'Clase Fitness: Entrenamiento Funcional',
    locationArea: 'Gimnasio Corporativo - Sótano 1',
    expectedAttendees: 22,
    notes: 'Circuito funcional en curso.',
    active: true,
  },
  {
    id: 'asg_5',
    trainerId: 'tr_3',
    trainerName: 'Andrés Silva',
    companyId: 'comp_2',
    companyName: 'Nestlé México',
    sedeId: 'sede_2_1',
    sedeName: 'Sede Central Polanco',
    sedeAddress: 'Av. Ejército Nacional 453',
    frequency: 'semanal',
    dayOfWeek: 4, // Jueves
    time: '11:30',
    durationMinutes: 50,
    activityType: 'clase_fitness',
    activityName: 'Clase Fitness: Entrenamiento Funcional',
    locationArea: 'Gimnasio Corporativo - Sótano 1',
    expectedAttendees: 24,
    notes: 'Circuito funcional cardio-fuerza.',
    active: true,
  },
  {
    id: 'asg_mariana_cerrada_ayer',
    trainerId: 'tr_4',
    trainerName: 'Mariana Gómez',
    companyId: 'comp_4',
    companyName: 'Consultoría Deloitte Global',
    sedeId: 'sede_4_1',
    sedeName: 'Torre Diana Reforma',
    sedeAddress: 'Río Lerma 232, Cuauhtémoc, CDMX',
    frequency: 'fecha_unica',
    date: _seedYesterdayYMD,
    time: '09:00',
    durationMinutes: 48,
    activityType: 'pausa_activa',
    activityName: 'Pausa Activa: Movilidad Articular y Postura',
    locationArea: 'Piso 18 - Open Space Auditoría',
    expectedAttendees: 30,
    notes: 'Sesión completada y cerrada en islas de auditoría.',
    active: true,
    closed: true,
    closedAt: `${_seedYesterdayYMD} 09:40:00`,
    completedDates: [_seedYesterdayYMD],
  },
  {
    id: 'asg_carlos_tlalnepantla_ayer',
    trainerId: 'tr_1',
    trainerName: 'Carlos Mendoza',
    companyId: 'comp_2',
    companyName: 'Nestlé México',
    sedeId: 'sede_2_2',
    sedeName: 'Centro de Distribución Tlalnepantla',
    sedeAddress: 'Vía Gustavo Baz 120, Edomex',
    frequency: 'fecha_unica',
    date: _seedYesterdayYMD,
    time: '14:00',
    durationMinutes: 52,
    activityType: 'pausa_activa',
    activityName: 'Pausa Activa: Ergonomía y Estiramientos',
    locationArea: 'Nave Logística y Almacén Central',
    expectedAttendees: 28,
    notes: 'Pausa ergonómica completada y cerrada en almacén central.',
    active: true,
    closed: true,
    closedAt: `${_seedYesterdayYMD} 14:50:10`,
    completedDates: [_seedYesterdayYMD],
  },
  {
    id: 'asg_valentina_santafe_d2',
    trainerId: 'tr_2',
    trainerName: 'Valentina Ríos',
    companyId: 'comp_1',
    companyName: 'Banco Santander Corporativo',
    sedeId: 'sede_1_2',
    sedeName: 'Centro Operativo Santa Fe',
    sedeAddress: 'Av. Vasco de Quiroga 3900',
    frequency: 'fecha_unica',
    date: _seedD2YMD,
    time: '16:00',
    durationMinutes: 64,
    activityType: 'clase_fitness',
    activityName: 'Clase Fitness: Pilates Mat',
    locationArea: 'Sala de Bienestar - Piso 2',
    expectedAttendees: 20,
    notes: 'Sesión de Pilates Mat completada y cerrada.',
    active: true,
    closed: true,
    closedAt: `${_seedD2YMD} 17:05:00`,
    completedDates: [_seedD2YMD],
  },
  {
    id: 'asg_andres_techhub_d3',
    trainerId: 'tr_3',
    trainerName: 'Andrés Silva',
    companyId: 'comp_3',
    companyName: 'TechHub Latin America',
    sedeId: 'sede_3_1',
    sedeName: 'Campus Insurgentes Sur',
    sedeAddress: 'Av. Insurgentes Sur 1602',
    frequency: 'fecha_unica',
    date: _seedD3YMD,
    time: '17:30',
    durationMinutes: 57,
    activityType: 'clase_fitness',
    activityName: 'Clase Fitness: Zumba y Ritmos Latinos',
    locationArea: 'Terraza Principal - Piso 4',
    expectedAttendees: 25,
    notes: 'Sesión cardiovascular completada y cerrada.',
    active: true,
    closed: true,
    closedAt: `${_seedD3YMD} 18:45:00`,
    completedDates: [_seedD3YMD],
  },
  {
    id: 'asg_mariana_reforma_d4',
    trainerId: 'tr_4',
    trainerName: 'Mariana Gómez',
    companyId: 'comp_1',
    companyName: 'Banco Santander Corporativo',
    sedeId: 'sede_1_1',
    sedeName: 'Torre Corporativa Reforma',
    sedeAddress: 'Paseo de la Reforma 500, CDMX',
    frequency: 'fecha_unica',
    date: _seedD4YMD,
    time: '10:00',
    durationMinutes: 49,
    activityType: 'pausa_activa',
    activityName: 'Pausa Activa: Gimnasia Cerebral y Respiración',
    locationArea: 'Piso 15 - Torre Reforma',
    expectedAttendees: 28,
    notes: 'Dinámicas neuromotoras completadas y cerradas.',
    active: true,
    closed: true,
    closedAt: `${_seedD4YMD} 10:45:00`,
    completedDates: [_seedD4YMD],
  },
];

export const INITIAL_ACTIVITY_CATALOG: ActivityCatalogItem[] = [
  {
    id: 'cat_pa_1',
    name: 'Pausa Activa: Ergonomía y Estiramientos',
    activityType: 'pausa_activa',
    defaultDurationMinutes: 20,
    description: 'Descompresión cervical, espalda baja y túnel carpiano para oficinas.',
    active: true,
  },
  {
    id: 'cat_pa_2',
    name: 'Pausa Activa: Movilidad Articular y Postura',
    activityType: 'pausa_activa',
    defaultDurationMinutes: 20,
    description: 'Activación articular progresiva y corrección de higiene postural.',
    active: true,
  },
  {
    id: 'cat_pa_3',
    name: 'Pausa Activa: Respiración y Anti-estrés',
    activityType: 'pausa_activa',
    defaultDurationMinutes: 15,
    description: 'Técnicas de respiración diafragmática y relajación muscular guiada.',
    active: true,
  },
  {
    id: 'cat_pa_4',
    name: 'Pausa Activa: Coordinación y Gimnasia Cerebral',
    activityType: 'pausa_activa',
    defaultDurationMinutes: 20,
    description: 'Dinámicas neuromotoras para enfoque, energía y trabajo en equipo.',
    active: true,
  },
  {
    id: 'cat_cf_1',
    name: 'Clase Fitness: Entrenamiento Funcional',
    activityType: 'clase_fitness',
    defaultDurationMinutes: 50,
    description: 'Circuito integral de fuerza, resistencia y acondicionamiento físico.',
    active: true,
  },
  {
    id: 'cat_cf_2',
    name: 'Clase Fitness: Yoga Corporativo',
    activityType: 'clase_fitness',
    defaultDurationMinutes: 55,
    description: 'Secuencias de flexibilidad, equilibrio y reducción del estrés laboral.',
    active: true,
  },
  {
    id: 'cat_cf_3',
    name: 'Clase Fitness: Pilates Mat',
    activityType: 'clase_fitness',
    defaultDurationMinutes: 50,
    description: 'Fortalecimiento de core, estabilidad lumbar y control postural.',
    active: true,
  },
  {
    id: 'cat_cf_4',
    name: 'Clase Fitness: Zumba y Ritmos Latinos',
    activityType: 'clase_fitness',
    defaultDurationMinutes: 50,
    description: 'Sesión cardiovascular dinámica con coreografías grupales.',
    active: true,
  },
  {
    id: 'cat_cf_5',
    name: 'Clase Fitness: HIIT y Cardio Quema-grasa',
    activityType: 'clase_fitness',
    defaultDurationMinutes: 45,
    description: 'Intervalos de alta intensidad adaptados a todos los niveles.',
    active: true,
  },
  {
    id: 'cat_cf_6',
    name: 'Clase Fitness: Tonificación y Fuerza con Bandas',
    activityType: 'clase_fitness',
    defaultDurationMinutes: 50,
    description: 'Trabajo muscular localizado utilizando ligas y peso corporal.',
    active: true,
  },
  {
    id: 'cat_gc_1',
    name: 'Gimnasio Corporativo: Acondicionamiento y Pesas',
    activityType: 'gimnasio_corporativo',
    defaultDurationMinutes: 60,
    description: 'Sesión supervisada de fuerza, pesas y aparatos en gimnasio empresarial.',
    active: true,
  },
  {
    id: 'cat_gc_2',
    name: 'Gimnasio Corporativo: Circuito Funcional en Sala',
    activityType: 'gimnasio_corporativo',
    defaultDurationMinutes: 60,
    description: 'Entrenamiento integral por estaciones para colaboradores en gimnasio interno.',
    active: true,
  },
  {
    id: 'cat_ms_1',
    name: 'Masajes: Masaje Descontracturante en Silla',
    activityType: 'masajes',
    defaultDurationMinutes: 30,
    description: 'Terapia exprés en silla ergonómica para alivio de tensión cervical, hombros y espalda.',
    active: true,
  },
  {
    id: 'cat_ms_2',
    name: 'Masajes: Descarga Muscular y Relajación Cervical',
    activityType: 'masajes',
    defaultDurationMinutes: 20,
    description: 'Sesión focalizada de liberación miofascial y reducción de fatiga postural.',
    active: true,
  },
];

const STORAGE_KEYS = {
  RECORDS: 'bscw_records_v3',
  RECORDS_USER_EMPTIED: 'bscw_records_user_emptied_v1',
  TRAINERS: 'bscw_trainers_v3',
  COMPANIES: 'bscw_companies_v3',
  ASSIGNMENTS: 'bscw_assignments_v3',
  ASSIGNMENTS_USER_EMPTIED: 'bscw_assignments_user_emptied_v1',
  ACTIVITY_CATALOG: 'bscw_activity_catalog_v1',
  ACTIVE_TRAINER_ID: 'bscw_active_trainer_id',
};

export function getStoredActivityCatalog(): ActivityCatalogItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITY_CATALOG);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ACTIVITY_CATALOG, JSON.stringify(INITIAL_ACTIVITY_CATALOG));
      return INITIAL_ACTIVITY_CATALOG;
    }
    const parsed: ActivityCatalogItem[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(STORAGE_KEYS.ACTIVITY_CATALOG, JSON.stringify(INITIAL_ACTIVITY_CATALOG));
      return INITIAL_ACTIVITY_CATALOG;
    }
    const normalized = parsed.map((item) => ({
      ...item,
      activityType: normalizeActivityType(item.activityType),
    }));
    const requiredNewTypes: ActivityType[] = ['gimnasio_corporativo', 'masajes'];
    let upgraded = [...normalized];
    let didAppend = false;
    for (const reqType of requiredNewTypes) {
      const hasType = upgraded.some((item) => item.activityType === reqType);
      if (!hasType) {
        const missingDefaults = INITIAL_ACTIVITY_CATALOG.filter(
          (seedItem) =>
            seedItem.activityType === reqType &&
            !upgraded.some((existing) => existing.id === seedItem.id)
        );
        if (missingDefaults.length > 0) {
          upgraded = [...upgraded, ...missingDefaults];
          didAppend = true;
        }
      }
    }
    if (didAppend) {
      localStorage.setItem(STORAGE_KEYS.ACTIVITY_CATALOG, JSON.stringify(upgraded));
    }
    return upgraded;
  } catch {
    return INITIAL_ACTIVITY_CATALOG;
  }
}

export function saveStoredActivityCatalog(items: ActivityCatalogItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVITY_CATALOG, JSON.stringify(items));
  } catch {
    // Ignore localStorage quota issues; Firestore holds primary state
  }
}

export function getStoredRecords(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (!raw) {
      const initial = getInitialRecords();
      saveStoredRecords(initial);
      return initial;
    }
    const parsed: AttendanceRecord[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const initial = getInitialRecords();
      saveStoredRecords(initial);
      return initial;
    }
    if (parsed.length === 0 && localStorage.getItem(STORAGE_KEYS.RECORDS_USER_EMPTIED) !== '1') {
      const initial = getInitialRecords();
      saveStoredRecords(initial);
      return initial;
    }
    return parsed;
  } catch {
    return getInitialRecords();
  }
}

export function markStoredRecordsUserEmptied(isEmptied: boolean): void {
  try {
    if (isEmptied) {
      localStorage.setItem(STORAGE_KEYS.RECORDS_USER_EMPTIED, '1');
    } else {
      localStorage.removeItem(STORAGE_KEYS.RECORDS_USER_EMPTIED);
    }
  } catch {
    // Ignore storage errors
  }
}

export function saveStoredRecords(records: AttendanceRecord[]): void {
  try {
    if (records.length > 0) {
      localStorage.removeItem(STORAGE_KEYS.RECORDS_USER_EMPTIED);
    }
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
  } catch {
    // If mobile localStorage hits quota due to multiple base64 photos, store compact cache for older entries
    try {
      const compact = records.map((rec, idx) => {
        if (idx < 12) return rec;
        return {
          ...rec,
          photoUrl:
            rec.photoUrl && rec.photoUrl.length > 8000
              ? generateSamplePresencePhoto(
                  rec.activityName,
                  rec.sedeName,
                  rec.trainerName,
                  `${rec.date} ${rec.checkInTime}`,
                  `GPS: ${rec.checkInGps.lat.toFixed(5)}, ${rec.checkInGps.lng.toFixed(5)}`
                )
              : rec.photoUrl,
          exitPhotoUrl:
            rec.exitPhotoUrl && rec.exitPhotoUrl.length > 8000 ? undefined : rec.exitPhotoUrl,
          facialVerification: rec.facialVerification
            ? {
                ...rec.facialVerification,
                facePhotoUrl:
                  rec.facialVerification.facePhotoUrl.length > 8000
                    ? generateSampleFacePhoto(
                        rec.trainerName,
                        rec.facialVerification.confidenceScore
                      )
                    : rec.facialVerification.facePhotoUrl,
              }
            : undefined,
        };
      });
      localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(compact));
    } catch {
      // Ignore if localStorage is completely unavailable (e.g. private browsing)
    }
  }
}

export function getStoredCompanies(): Company[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMPANIES);
    if (!raw) {
      saveStoredCompanies(INITIAL_COMPANIES);
      return INITIAL_COMPANIES;
    }
    const parsed: Company[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_COMPANIES;
  } catch {
    return INITIAL_COMPANIES;
  }
}

export function saveStoredCompanies(companies: Company[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
  } catch {
    // Ignore localStorage quota issues
  }
}

export function getStoredTrainers(): Trainer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRAINERS);
    if (!raw) {
      saveStoredTrainers(INITIAL_TRAINERS);
      return INITIAL_TRAINERS;
    }
    const parsed: Trainer[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_TRAINERS;
  } catch {
    return INITIAL_TRAINERS;
  }
}

export function saveStoredTrainers(trainers: Trainer[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TRAINERS, JSON.stringify(trainers));
  } catch {
    // Ignore localStorage quota issues
  }
}

export function getStoredAssignments(): ClassAssignment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
    if (!raw) {
      saveStoredAssignments(INITIAL_ASSIGNMENTS);
      return INITIAL_ASSIGNMENTS;
    }
    const parsed: ClassAssignment[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      saveStoredAssignments(INITIAL_ASSIGNMENTS);
      return INITIAL_ASSIGNMENTS;
    }
    if (
      parsed.length === 0 &&
      localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS_USER_EMPTIED) !== '1'
    ) {
      saveStoredAssignments(INITIAL_ASSIGNMENTS);
      return INITIAL_ASSIGNMENTS;
    }
    return parsed;
  } catch {
    return INITIAL_ASSIGNMENTS;
  }
}

export function markStoredAssignmentsUserEmptied(isEmptied: boolean): void {
  try {
    if (isEmptied) {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS_USER_EMPTIED, '1');
    } else {
      localStorage.removeItem(STORAGE_KEYS.ASSIGNMENTS_USER_EMPTIED);
    }
  } catch {
    // Ignore storage errors
  }
}

export function saveStoredAssignments(assignments: ClassAssignment[]): void {
  try {
    if (assignments.length > 0) {
      localStorage.removeItem(STORAGE_KEYS.ASSIGNMENTS_USER_EMPTIED);
    }
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
  } catch {
    // Ignore localStorage quota issues
  }
}

export function resetAllDataToDefault(): void {
  localStorage.removeItem(STORAGE_KEYS.RECORDS);
  localStorage.removeItem(STORAGE_KEYS.RECORDS_USER_EMPTIED);
  localStorage.removeItem(STORAGE_KEYS.TRAINERS);
  localStorage.removeItem(STORAGE_KEYS.COMPANIES);
  localStorage.removeItem(STORAGE_KEYS.ASSIGNMENTS);
  localStorage.removeItem(STORAGE_KEYS.ASSIGNMENTS_USER_EMPTIED);
  localStorage.removeItem(STORAGE_KEYS.ACTIVITY_CATALOG);
  getStoredCompanies();
  getStoredTrainers();
  getStoredRecords();
  getStoredAssignments();
  getStoredActivityCatalog();
}
