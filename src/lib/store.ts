import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

export interface Student {
  id: string;
  no: number;
  nama: string;
  nisn: string;
  nipd: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  kelas: string;
  nama_ayah: string;
  nama_ibu: string;
  no_telp_ortu: string;
  nama_orang_tua?: string; // Name of parent / guardian
  jenis_kelamin?: string;   // Gender
  nomor_telepon?: string;   // Phone number / contact
  semester?: string; // Filterable by selected semester ID
  tanggal_lulus?: string; // Graduation date
  tahun_ajaran_lulus?: string; // School year graduated
  [key: string]: any; // Support custom columns dynamically
}

export interface Grade {
  id: string;
  id_siswa: string;
  jenis_nilai: 'Harian' | 'Tugas' | 'Ujian';
  nama_kolom: string; // e.g., "Tugas 1", "UH 1"
  nilai: number;
  semester: string;
  mata_pelajaran?: string;
  tanggal?: string; // YYYY-MM-DD
}

export interface StudentTask {
  id: string;
  judul: string;
  mata_pelajaran: string;
  tanggal_diberikan: string; // YYYY-MM-DD
  tanggal_kumpul?: string; // YYYY-MM-DD
  semester: string;
  kelas: string;
  penyelesaian: Record<string, boolean>; // key: studentId, value: completed status
}

export interface Attendance {
  id: string;
  id_siswa: string;
  tanggal: string; // YYYY-MM-DD
  status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';
  semester: string;
  mata_pelajaran?: string;
}

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  role: 'guru' | 'kepsek';
  name: string;
  pertanyaan_keamanan?: string;
  jawaban_keamanan?: string;
  email_pemulihan?: string;
}

export interface CustomHoliday {
  id: string;
  nama: string;
  tanggal_mulai: string; // YYYY-MM-DD
  tanggal_selesai: string; // YYYY-MM-DD
  jenis: 'kolektif' | 'perhari';
}

export interface RosterItem {
  id: string;
  hari: string; // e.g. "Senin", "Selasa"
  jam_mulai: string; // e.g. "07:30"
  jam_selesai: string; // e.g. "08:10"
  mata_pelajaran: string;
  guru?: string;
  kelas: string;
  semester: string;
}

export interface PiketItem {
  id: string;
  hari: string; // e.g. "Senin", "Selasa"
  id_siswa: string;
  kelas: string;
  semester: string;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  type: 'push' | 'pull' | 'delta';
  status: 'success' | 'failure';
  message: string;
  itemsCount: number;
}

export interface RaporCapaian {
  id: string;
  id_siswa: string;
  semester: string;
  capaian_kompetensi: string;
  catatan_wali_kelas: string;
  saran_orang_tua?: string;
  tinggi_badan?: string;
  berat_badan?: string;
  pendengaran?: string;
  penglihatan?: string;
  gigi?: string;
  kokurikuler?: string;
  ekstra_nama_1?: string;
  ekstra_ket_1?: string;
  ekstra_nama_2?: string;
  ekstra_ket_2?: string;
  kenaikan_kelas?: string;
}

export interface Settings {
  nama_sekolah: string;
  npsn?: string;
  alamat?: string;
  email?: string;
  nama_kepala_sekolah?: string;
  nip_kepala_sekolah?: string;
  nama_kelas: string;
  nama_wali_kelas?: string;
  nip_wali_kelas?: string;
  semester_aktif: string;
  daftar_semester?: string[];
  mata_pelajaran: string[];
  urutan_mata_pelajaran_rapor?: string[];
  bobot_harian: number;
  bobot_tugas: number;
  bobot_ujian: number;
  bobot_harian_bulanan?: number;
  bobot_tugas_bulanan?: number;
  bobot_ujian_bulanan?: number;
  include_harian_bulanan?: boolean;
  include_tugas_bulanan?: boolean;
  include_ujian_bulanan?: boolean;
  include_harian?: boolean;
  include_tugas?: boolean;
  include_ujian?: boolean;
  spreadsheetId?: string;
  appsScriptUrl?: string;
  custom_student_columns?: string[]; // Dynamic custom columns
  holidays?: CustomHoliday[];
  kop_pemerintah?: string;
  kop_dinas?: string;
  kop_logo_type?: 'tutwuri' | 'custom' | 'none';
  kop_logo_base64?: string;
  catatan_wali_kelas_templates?: string[];
  capaian_kompetensi_templates?: string[];
  pilihan_mata_pelajaran?: string[];
  hari_sekolah?: 5 | 6;
  wa_group_links?: Record<string, string>;
}

export const defaultSettings: Settings = {
  nama_sekolah: '',
  npsn: '',
  alamat: '',
  email: '',
  nama_kepala_sekolah: '',
  nip_kepala_sekolah: '',
  nama_kelas: '',
  nama_wali_kelas: '',
  nip_wali_kelas: '',
  semester_aktif: 'Ganjil 2026',
  daftar_semester: ['Ganjil 2026', 'Genap 2026'],
  mata_pelajaran: ['Tematik', 'Matematika', 'Bahasa Indonesia'],
  pilihan_mata_pelajaran: [],
  hari_sekolah: 5,
  bobot_harian: 30,
  bobot_tugas: 30,
  bobot_ujian: 40,
  bobot_harian_bulanan: 50,
  bobot_tugas_bulanan: 50,
  bobot_ujian_bulanan: 0,
  include_harian: true,
  include_tugas: true,
  include_ujian: true,
  include_harian_bulanan: true,
  include_tugas_bulanan: true,
  include_ujian_bulanan: false,
  custom_student_columns: [],
  holidays: [],
  kop_pemerintah: 'PEMERINTAH KOTA / KABUPATEN',
  kop_dinas: 'DINAS PENDIDIKAN DAN KEBUDAYAAN',
  kop_logo_type: 'tutwuri',
  kop_logo_base64: '',
  catatan_wali_kelas_templates: [
    "Sangat bangga dengan prestasimu! Pertahankan nilai yang luar biasa ini dan teruslah menjadi inspirasi bagi teman-temanmu.",
    "Prestasi yang cukup bagus. Tingkatkan kembali kedisiplinan, fokus belajar di kelas, dan kurangi hal-hal yang dapat mengalihkan konsentrasimu.",
    "Tingkatkan terus motivasi belajarmu, jangan mudah menyerah. Lakukan bimbingan belajar tambahan dan tingkatkan kehadiranmu di kelas.",
    "Ananda menunjukkan sikap yang sangat baik dan aktif dalam setiap pembelajaran. Pertahankan semangat ini di semester berikutnya!",
    "Terus asah bakat dan minatmu, baik akademik maupun non-akademik. Semangat belajar harus tetap menyala demi masa depan yang gemilang!"
  ],
  capaian_kompetensi_templates: [
    "Menunjukkan penguasaan kompetensi yang sangat baik dalam memahami konsep-konsep materi serta mampu menerapkannya dalam tugas-tugas harian dengan mandiri.",
    "Perlu bimbingan dan pendampingan yang lebih tekun terutama dalam menganalisis soal cerita dan menerapkan teori ke dalam praktik pembelajaran.",
    "Memiliki kemauan belajar yang tinggi, sangat baik dalam berdiskusi kelompok, serta aktif berpartisipasi menyampaikan ide-ide kreatif di kelas.",
    "Menunjukkan pemahaman yang stabil di semua mata pelajaran, dengan kemampuan berpikir kritis yang terus berkembang dari waktu ke waktu.",
    "Secara umum telah mencapai kriteria ketuntasan minimal, namun masih memerlukan latihan tambahan untuk memperkuat pemahaman konsep dasar yang esensial."
  ]
};

let isNotificationPaused = false;
let isSyncQueuePaused = false;

export const pauseNotifications = () => {
  isNotificationPaused = true;
};

export const resumeNotifications = (triggerNow = true) => {
  isNotificationPaused = false;
  if (triggerNow && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('data-changed'));
    window.dispatchEvent(new Event('sync-status-changed'));
  }
};

export const pauseSyncQueue = () => {
  isSyncQueuePaused = true;
};

export const resumeSyncQueue = () => {
  isSyncQueuePaused = false;
};

export function normalizeStudentHelper(s: any): Student {
  if (!s) return s;
  const student = { ...s };

  // Helper to extract value from any case/variation of a key
  const getValue = (keys: string[]): any => {
    for (const key of keys) {
      if (s[key] !== undefined && s[key] !== null && s[key] !== '') {
        return s[key];
      }
      // Try variations (lowercase, trimmed, underscores)
      const normKey = key.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      for (const [k, v] of Object.entries(s)) {
        const normK = k.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        if (normK === normKey && v !== undefined && v !== null && v !== '') {
          return v;
        }
      }
    }
    return undefined;
  };

  // Explicit mappings with fallbacks
  const id = getValue(['id', 'id_siswa', 'uuid']) || s.id;
  const no = getValue(['no', 'no_urut', 'nomor']) || s.no;
  const nama = getValue(['nama', 'nama_lengkap', 'nama_siswa']) || s.nama;
  const nisn = getValue(['nisn', 'nisn_siswa', 'nomor_induk_siswa_nasional', 'nomor_induk', 'ni', 'no_nisn', 'nomor_nisn', 'no_induk_nasional', 'nomor_induk_nasional']) || s.nisn;
  const nipd = getValue(['nipd', 'nipd_siswa']) || s.nipd;
  const tempat_lahir = getValue(['tempat_lahir', 'tempat', 'tpt_lahir']) || s.tempat_lahir;
  const tanggal_lahir = getValue(['tanggal_lahir', 'tgl_lahir']) || s.tanggal_lahir;
  const kelas = getValue(['kelas', 'nama_kelas', 'rombel', 'ruang', 'rombongan_belajar', 'kelas_siswa', 'kelas_tingkat', 'tingkat']) || s.kelas;
  const nama_ayah = getValue(['nama_ayah', 'ayah']) || s.nama_ayah;
  const nama_ibu = getValue(['nama_ibu', 'ibu']) || s.nama_ibu;
  const no_telp_ortu = getValue(['no_telp_ortu', 'nomor_telepon', 'no_telp', 'nomor_hp', 'no_hp', 'telp', 'telepon', 'hp']) || s.no_telp_ortu;
  const semester = getValue(['semester', 'smstr']) || s.semester;
  
  let jenis_kelamin = getValue(['jenis_kelamin', 'jk', 'gender', 'sex', 'l_p', 'lp', 'kelamin']) || s.jenis_kelamin;
  if (jenis_kelamin) {
    const jkLower = String(jenis_kelamin).trim().toLowerCase();
    if (jkLower === 'l' || jkLower.startsWith('laki') || jkLower === 'laki-laki' || jkLower === 'lakilaki') {
      jenis_kelamin = 'Laki-laki';
    } else if (jkLower === 'p' || jkLower.startsWith('perem') || jkLower.startsWith('wanita') || jkLower === 'perempuan') {
      jenis_kelamin = 'Perempuan';
    }
  }

  let nama_orang_tua = getValue(['nama_orang_tua', 'nama_ortu', 'orang_tua', 'nama_wali', 'wali', 'ayah_ibu']) || s.nama_orang_tua;
  if (!nama_orang_tua && (nama_ayah || nama_ibu)) {
    nama_orang_tua = [nama_ayah, nama_ibu].filter(Boolean).join(' / ');
  }
  if (nama_orang_tua && !nama_ayah && !nama_ibu) {
    const parts = String(nama_orang_tua).split('/');
    if (parts.length >= 1) {
      student.nama_ayah = parts[0].trim();
      if (parts.length >= 2) student.nama_ibu = parts[1].trim();
    }
  }

  // Ensure standard keys exist and are cleaned
  student.id = id ? String(id).trim() : '';
  student.no = parseInt(no) || 0;
  student.nama = nama ? String(nama).trim() : '';
  student.nisn = nisn ? String(nisn).trim() : '';
  student.nipd = nipd ? String(nipd).trim() : '';
  student.tempat_lahir = tempat_lahir ? String(tempat_lahir).trim() : '';
  student.tanggal_lahir = tanggal_lahir ? String(tanggal_lahir).trim() : '';
  student.kelas = kelas ? String(kelas).trim() : '';
  student.nama_ayah = nama_ayah ? String(student.nama_ayah || nama_ayah).trim() : '';
  student.nama_ibu = nama_ibu ? String(student.nama_ibu || nama_ibu).trim() : '';
  student.no_telp_ortu = no_telp_ortu ? String(no_telp_ortu).trim() : '';
  student.nomor_telepon = student.no_telp_ortu;
  student.semester = semester ? String(semester).trim() : '';
  student.jenis_kelamin = jenis_kelamin ? String(jenis_kelamin).trim() : '';
  student.nama_orang_tua = nama_orang_tua ? String(nama_orang_tua).trim() : '';

  // Keep capital keys for complete backward and forward compatibility
  student.ID = student.id;
  student.No = student.no;
  student.Nama = student.nama;
  student.NISN = student.nisn;
  student.NIPD = student.nipd;
  student.Kelas = student.kelas;
  student.Semester = student.semester;
  student['Tempat Lahir'] = student.tempat_lahir;
  student['Tanggal Lahir'] = student.tanggal_lahir;
  student['Nama Ayah'] = student.nama_ayah;
  student['Nama Ibu'] = student.nama_ibu;
  student['No Telp Ortu'] = student.no_telp_ortu;
  student['Jenis Kelamin'] = student.jenis_kelamin;
  student['jenis_kelamin'] = student.jenis_kelamin;
  student['nama_orang_tua'] = student.nama_orang_tua;

  return student;
}

const wrapInstance = (instance: LocalForage, storeName: string) => {
  const notify = () => {
    if (!isNotificationPaused && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
    }
  };
  return {
    getItem: async (key: string) => {
      const val = await instance.getItem(key);
      if (storeName === 'students' && val) {
        return normalizeStudentHelper(val);
      }
      return val;
    },
    setItem: async <T>(key: string, value: T) => {
      let valToSet = value;
      if (storeName === 'students' && value) {
        valToSet = normalizeStudentHelper(value) as any;
      }
      const res = await instance.setItem(key, valToSet);
      if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket', 'tasks'].includes(storeName)) {
        await store.syncQueue.setItem(`${storeName}::${key}`, true).catch(() => {});
      }
      notify();
      return res;
    },
    removeItem: async (key: string) => {
      await instance.removeItem(key);
      if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket', 'tasks'].includes(storeName)) {
        await store.syncQueue.setItem(`${storeName}::${key}`, 'deleted').catch(() => {});
      }
      notify();
    },
    clear: async () => {
      await instance.clear();
      if (!isSyncQueuePaused && ['students', 'grades', 'attendance', 'roster', 'piket'].includes(storeName)) {
        try {
          const keys = await store.syncQueue.keys();
          for (const k of keys) {
            if (k.startsWith(`${storeName}::`)) {
              await store.syncQueue.removeItem(k);
            }
          }
        } catch (e) {}
      }
      notify();
    },
    iterate: async <T, U>(iterator: (value: T, key: string, iterationNumber: number) => U) => {
      return instance.iterate<any, any>((value, key, iterationNumber) => {
        let valToPass = value;
        if (storeName === 'students' && value) {
          valToPass = normalizeStudentHelper(value);
        }
        return iterator(valToPass, key, iterationNumber);
      });
    },
    length: instance.length.bind(instance),
    key: instance.key.bind(instance),
    keys: instance.keys.bind(instance),
    dropInstance: instance.dropInstance.bind(instance),
  } as LocalForage;
};

export const store = {
  students: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'students' }), 'students'),
  grades: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'grades' }), 'grades'),
  attendance: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'attendance' }), 'attendance'),
  tasks: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'tasks' }), 'tasks'),
  settings: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'settings' }), 'settings'),
  users: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'users' }), 'users'),
  roster: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'roster' }), 'roster'),
  piket: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'piket' }), 'piket'),
  raporCapaian: wrapInstance(localforage.createInstance({ name: 'ClassApp', storeName: 'raporCapaian' }), 'raporCapaian'),
  syncQueue: localforage.createInstance({ name: 'ClassApp', storeName: 'syncQueue' }),
  syncLogs: localforage.createInstance({ name: 'ClassApp', storeName: 'syncLogs' }),
};

// Initializer
export const initializeStore = async () => {
  const currentSettings = await store.settings.getItem<Settings>('app_settings');
  if (!currentSettings) {
    await store.settings.setItem('app_settings', defaultSettings);
  } else {
    let updated = false;
    if (!currentSettings.catatan_wali_kelas_templates || currentSettings.catatan_wali_kelas_templates.length === 0) {
      currentSettings.catatan_wali_kelas_templates = defaultSettings.catatan_wali_kelas_templates;
      updated = true;
    }
    if (!currentSettings.capaian_kompetensi_templates || currentSettings.capaian_kompetensi_templates.length === 0) {
      currentSettings.capaian_kompetensi_templates = defaultSettings.capaian_kompetensi_templates;
      updated = true;
    }
    if (updated) {
      await store.settings.setItem('app_settings', currentSettings);
    }
  }
};
