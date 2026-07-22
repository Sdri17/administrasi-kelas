import { store, Student, Grade, Attendance, Settings, AppUser, pauseNotifications, resumeNotifications, pauseSyncQueue, resumeSyncQueue } from './store';
import toast from 'react-hot-toast';

export async function validateStudentDataExport(studentsToPush: any[]): Promise<boolean> {
  let hasErrors = false;
  const missingData: string[] = [];
  
  for (const s of studentsToPush) {
    if (!s.nisn || !s.kelas || !s.jenis_kelamin) {
      hasErrors = true;
      missingData.push(s.nama || s.id);
      console.warn(`[Sync Validation] Missing critical data for student ${s.nama || s.id}:`, {
        nisn: s.nisn,
        kelas: s.kelas,
        jenis_kelamin: s.jenis_kelamin,
        raw_data: s
      });
    }
  }

  if (hasErrors) {
    const errorMsg = `Sinkronisasi Dibatalkan: Data Siswa tidak lengkap (NISN, Kelas, Jenis Kelamin wajib diisi) pada: ${missingData.slice(0, 3).join(', ')}${missingData.length > 3 ? ` dan ${missingData.length - 3} lainnya` : ''}`;
    toast.error(errorMsg, { duration: 6000 });
  }
  
  return !hasErrors;
}

export async function addSyncLog(type: 'push' | 'pull' | 'delta', status: 'success' | 'failure', message: string, itemsCount: number) {
  try {
    const id = Math.random().toString(36).substring(2, 11) + Date.now().toString();
    const log = {
      id,
      timestamp: new Date().toISOString(),
      type,
      status,
      message,
      itemsCount
    };
    await store.syncLogs.setItem(id, log);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sync-log-changed'));
    }
  } catch (e) {
    console.error('Failed to add sync log', e);
  }
}

export async function getSyncStats() {
  try {
    const [studentCount, gradeCount, attendanceCount, rosterCount, piketCount, raporCapaianCount, queueKeys] = await Promise.all([
      store.students.length(),
      store.grades.length(),
      store.attendance.length(),
      store.roster.length(),
      store.piket.length(),
      store.raporCapaian.length(),
      store.syncQueue.keys()
    ]);
    const totalItems = studentCount + gradeCount + attendanceCount + rosterCount + piketCount + raporCapaianCount;
    const unsyncedCount = queueKeys.length;
    
    // Get list of queue items for details in parallel
    const queueItems = await Promise.all(queueKeys.map(async (key) => {
      const parts = key.split('::');
      const val = await store.syncQueue.getItem<string>(key);
      return {
        store: parts[0] || 'Unknown',
        id: parts[1] || 'Unknown',
        action: typeof val === 'string' ? val : 'updated'
      };
    }));

    const syncedCount = Math.max(0, totalItems - unsyncedCount);
    const percentage = totalItems === 0 ? 100 : Math.round((syncedCount / totalItems) * 100);

    return {
      totalItems,
      unsyncedCount,
      syncedCount,
      percentage,
      queueItems
    };
  } catch (e) {
    return {
      totalItems: 0,
      unsyncedCount: 0,
      syncedCount: 0,
      percentage: 100,
      queueItems: []
    };
  }
}

export const SHEET_EXPORT_KEY_MAPPING: Record<string, string> = {
  id: 'ID',
  no: 'No',
  nama: 'Nama',
  nisn: 'NISN',
  nipd: 'NIPD',
  jenis_kelamin: 'Jenis Kelamin',
  tempat_lahir: 'Tempat Lahir',
  tanggal_lahir: 'Tanggal Lahir',
  kelas: 'Kelas',
  nama_ayah: 'Nama Ayah',
  nama_ibu: 'Nama Ibu',
  no_telp_ortu: 'No Telp Ortu',
  semester: 'Semester',
  nama_orang_tua: 'Nama Orang Tua'
};

export function inspectStudentBeforeSync(student: any): void {
  console.log(`[Diagnostic] Inspecting student: ${student.nama || 'Unnamed'} (ID: ${student.id || 'No ID'})`);
  
  const requiredFields = ['nisn', 'kelas', 'jenis_kelamin'];
  const missing: string[] = [];
  
  for (const field of requiredFields) {
    const val = student[field];
    if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '-') {
      missing.push(field);
    }
  }
  
  if (missing.length > 0) {
    console.warn(`[Diagnostic WARNING] Student ${student.nama || 'Unnamed'} is missing required fields: ${missing.join(', ')}. Detailed object:`, student);
  } else {
    console.log(`[Diagnostic Success] Student ${student.nama || 'Unnamed'} has all required fields. Value summary:`, {
      nisn: student.nisn,
      kelas: student.kelas,
      jenis_kelamin: student.jenis_kelamin
    });
  }
}

export async function validateStudentData(): Promise<boolean> {
  console.log('[Validation] Starting student data validation before manual sync...');
  const students: Student[] = [];
  await store.students.iterate<Student, void>((s) => {
    students.push(s);
  });

  const grades: Grade[] = [];
  await store.grades.iterate<Grade, void>((g) => {
    grades.push(g);
  });

  const invalidStudents: Array<{ name: string; reasons: string[] }> = [];

  for (const s of students) {
    const reasons: string[] = [];
    
    // NISN: Should exist, not empty, not '-'
    const nisnStr = String(s.nisn || '').trim();
    if (!nisnStr || nisnStr === '-') {
      reasons.push('NISN kosong atau tidak valid');
    }

    // Kelas: Should exist, not empty, not '-'
    const kelasStr = String(s.kelas || '').trim();
    if (!kelasStr || kelasStr === '-') {
      reasons.push('Kelas kosong atau tidak valid');
    }

    // Jenis Kelamin: Must be Laki-laki or Perempuan
    const jkStr = String(s.jenis_kelamin || '').trim();
    if (!jkStr || (jkStr !== 'Laki-laki' && jkStr !== 'Perempuan')) {
      reasons.push('Jenis Kelamin tidak valid (harus Laki-laki atau Perempuan)');
    }

    // Nama Orang Tua: Should exist, not empty, not '-'
    const parentName = String(s.nama_orang_tua || s.nama_ayah || s.nama_ibu || '').trim();
    if (!parentName || parentName === '-') {
      reasons.push('Nama Orang Tua kosong atau tidak valid');
    }

    // Nilai validation (associated with this student)
    const studentGrades = grades.filter(g => g.id_siswa === s.id);
    for (const g of studentGrades) {
      if (g.nilai === undefined || g.nilai === null || isNaN(g.nilai) || g.nilai < 0 || g.nilai > 100) {
        reasons.push(`Nilai untuk mapel ${g.mata_pelajaran || 'Umum'} (${g.nama_kolom}) tidak valid: ${g.nilai}`);
      }
    }

    if (reasons.length > 0) {
      invalidStudents.push({
        name: s.nama || 'Siswa Tanpa Nama',
        reasons
      });
    }
  }

  if (invalidStudents.length > 0) {
    const detailList = invalidStudents
      .slice(0, 3)
      .map(item => `• ${item.name}: ${item.reasons.join(', ')}`)
      .join('\n');
    
    const countText = invalidStudents.length > 3 ? `\ndan ${invalidStudents.length - 3} siswa lainnya.` : '';
    
    toast.error(
      `Validasi Sinkronisasi Gagal!\n\nBeberapa data siswa tidak lengkap atau format salah:\n${detailList}${countText}`,
      { duration: 10000, position: 'top-center' }
    );
    return false;
  }

  console.log('[Validation] All critical student data is complete and formatted correctly!');
  return true;
}

export function mapStudentForPush(s: any): any {
  if (!s) return s;
  
  // Clone to avoid mutating local storage items
  const mapped: any = {};

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
  const nisn = getValue(['nisn', 'nisn_siswa', 'nomor_induk_siswa_nasional', 'nomor_induk', 'ni']) || s.nisn;
  const nipd = getValue(['nipd', 'nipd_siswa']) || s.nipd;
  const tempat_lahir = getValue(['tempat_lahir', 'tempat', 'tpt_lahir']) || s.tempat_lahir;
  const tanggal_lahir = getValue(['tanggal_lahir', 'tgl_lahir']) || s.tanggal_lahir;
  const kelas = getValue(['kelas', 'nama_kelas', 'rombel', 'ruang', 'rombongan_belajar']) || s.kelas;
  const nama_ayah = getValue(['nama_ayah', 'ayah']) || s.nama_ayah;
  const nama_ibu = getValue(['nama_ibu', 'ibu']) || s.nama_ibu;
  const no_telp_ortu = getValue(['no_telp_ortu', 'nomor_telepon', 'no_telp', 'nomor_hp', 'no_hp', 'telp', 'telepon', 'hp']) || s.no_telp_ortu;
  const semester = getValue(['semester', 'smstr']) || s.semester;
  
  let jenis_kelamin = getValue(['jenis_kelamin', 'jk', 'gender', 'sex', 'l_p', 'lp']) || s.jenis_kelamin;
  if (jenis_kelamin) {
    const jkLower = String(jenis_kelamin).trim().toLowerCase();
    if (jkLower === 'l' || jkLower.startsWith('laki') || jkLower === 'laki-laki' || jkLower === 'lakilaki') {
      jenis_kelamin = 'Laki-laki';
    } else if (jkLower === 'p' || jkLower.startsWith('perem') || jkLower.startsWith('wanita') || jkLower === 'perempuan') {
      jenis_kelamin = 'Perempuan';
    }
  }

  // Ensure these normalized lowercase properties are explicitly set
  mapped.id = id ? String(id).trim() : '';
  mapped.no = parseInt(no) || 0;
  mapped.nama = nama ? String(nama).trim() : '';
  mapped.nisn = nisn ? String(nisn).trim() : '';
  mapped.nipd = nipd ? String(nipd).trim() : '';
  mapped.tempat_lahir = tempat_lahir ? String(tempat_lahir).trim() : '';
  mapped.tanggal_lahir = tanggal_lahir ? String(tanggal_lahir).trim() : '';
  mapped.kelas = kelas ? String(kelas).trim() : '';
  mapped.nama_ayah = nama_ayah ? String(nama_ayah).trim() : '';
  mapped.nama_ibu = nama_ibu ? String(nama_ibu).trim() : '';
  mapped.no_telp_ortu = no_telp_ortu ? String(no_telp_ortu).trim() : '';
  mapped.nomor_telepon = mapped.no_telp_ortu;
  mapped.semester = semester ? String(semester).trim() : '';
  mapped.jenis_kelamin = jenis_kelamin ? String(jenis_kelamin).trim() : '';

  const parentName = getValue(['nama_orang_tua', 'nama_ortu', 'orang_tua', 'nama_wali', 'wali']) || s.nama_orang_tua;
  mapped.nama_orang_tua = parentName ? String(parentName).trim() : '';
  if (!mapped.nama_orang_tua && (mapped.nama_ayah || mapped.nama_ibu)) {
    mapped.nama_orang_tua = [mapped.nama_ayah, mapped.nama_ibu].filter(Boolean).join(' / ');
  }

  // Use the key-mapping dictionary to explicitly transform internal database keys into the exact string headers expected by the Google Sheet
  for (const [dbKey, sheetKey] of Object.entries(SHEET_EXPORT_KEY_MAPPING)) {
    if (mapped[dbKey] !== undefined) {
      mapped[sheetKey] = mapped[dbKey];
    }
  }

  // Double check that we export both formats (lowercase for doPost / getStudentInfo, and Sheet keys for sheet rendering)
  mapped['jenis_kelamin'] = mapped.jenis_kelamin;
  mapped['nama_orang_tua'] = mapped.nama_orang_tua;

  // Explicit diagnostic warning logging
  inspectStudentBeforeSync(mapped);

  return mapped;
}

export async function pushDataToSheets(appsScriptUrl: string, forceFull = false) {
  const queueKeys = await store.syncQueue.keys();
  const count = forceFull 
    ? (await store.students.length() + await store.grades.length() + await store.attendance.length() + await store.roster.length() + await store.piket.length() + await store.raporCapaian.length())
    : queueKeys.length;

  try {
    if (!forceFull && queueKeys.length > 0) {
      // Perform Delta Sync (super fast, only changed items in parallel)
      const changes = await Promise.all(queueKeys.map(async (key) => {
        const parts = key.split('::');
        const storeName = parts[0];
        const recordId = parts[1];
        const action = await store.syncQueue.getItem<string>(key);

        if (storeName && recordId) {
          let data: any = null;
          if (action !== 'deleted') {
            if (storeName === 'students') {
              const rawData = await store.students.getItem(recordId);
              data = mapStudentForPush(rawData);
            } else if (storeName === 'grades') {
              data = await store.grades.getItem(recordId);
            } else if (storeName === 'attendance') {
              data = await store.attendance.getItem(recordId);
            } else if (storeName === 'roster') {
              data = await store.roster.getItem(recordId);
            } else if (storeName === 'piket') {
              data = await store.piket.getItem(recordId);
            } else if (storeName === 'raporCapaian') {
              data = await store.raporCapaian.getItem(recordId);
            }
          }
          return {
            store: storeName,
            id: recordId,
            action: action === 'deleted' ? 'delete' : 'update',
            data
          };
        }
        return null;
      }));

      const validChanges = changes.filter((c): c is NonNullable<typeof c> => c !== null);

      const payload = {
        action: 'delta',
        changes: validChanges
      };

      const deltaStudents = validChanges.filter(c => c.store === 'students' && c.action !== 'delete').map(c => c.data);
      if (deltaStudents.length > 0) {
        // Verification step to confirm 'nisn', 'kelas', and 'jenis_kelamin' are not undefined before fetch call
        for (const s of deltaStudents) {
          if (!s || s.nisn === undefined || s.kelas === undefined || s.jenis_kelamin === undefined) {
            throw new Error(`Validasi Gagal: Properti kritis ('nisn', 'kelas', atau 'jenis_kelamin') bernilai undefined untuk siswa ${s?.nama || s?.id || 'tidak dikenal'}.`);
          }
        }

        const isValid = await validateStudentDataExport(deltaStudents);
        if (!isValid) {
          throw new Error('Validasi data siswa gagal sebelum dikirim.');
        }
      }

      // Explicitly log the entire object structure being sent to Google Apps Script
      console.log('[Sync Delta Payload Structure Log]:', JSON.stringify(payload, null, 2));

      let res: Response;
      try {
        res = await fetch('/api/proxy-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appsScriptUrl, payload })
        });
        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          if (res.status === 404 || !contentType || !contentType.includes('application/json')) {
            throw new Error(`Proxy error ${res.status}`);
          }
        }
      } catch (proxyErr) {
        console.warn('[Sync Delta] Proxy failed, trying direct browser connection...', proxyErr);
        try {
          console.log('[Sync Delta] Mengirim langsung dengan mode "cors"...');
          res = await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'cors',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (corsErr: any) {
          console.warn('[Sync Delta] Mode "cors" gagal atau ditolak pre-flight. Mencoba mode "no-cors" sebagai fallback...', corsErr);
          try {
            res = await fetch(appsScriptUrl, {
              method: 'POST',
              mode: 'no-cors',
              body: JSON.stringify(payload),
              headers: { 'Content-Type': 'application/json' }
            });
            // Opaque response handling for mode: "no-cors"
            if (res.type === 'opaque' || res.status === 0) {
              console.log('[Sync Delta] Respon no-cors diterima (opaque). Mengasumsikan transmisi data berhasil.');
              res = new Response(JSON.stringify({ status: 'success', message: 'Data sent via no-cors fallback' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          } catch (noCorsErr: any) {
            throw new Error(`Koneksi jaringan gagal setelah mencoba fallback "no-cors": ${noCorsErr.message}`);
          }
        }
      }

      if (!res.ok) {
        const errorText = await res.clone().text().catch(() => '');
        let cleanErrorMessage = 'Gagal mengirim sinkronisasi delta ke Apps Script';
        try {
          const errJson = JSON.parse(errorText);
          if (errJson && errJson.message) {
            cleanErrorMessage = errJson.message;
          }
        } catch (e) {}
        throw new Error(cleanErrorMessage);
      }

      const result = await res.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Error dari Apps Script');
      }

      // Clear the specific keys that were synced in parallel
      await Promise.all(queueKeys.map(key => store.syncQueue.removeItem(key)));
      await addSyncLog('delta', 'success', 'Sinkronisasi delta berhasil', count);
    } else if (forceFull) {
      // Full Backup Push (load all stores in parallel)
      const [students, grades, attendance, roster, piket, raporCapaian, users, settings] = await Promise.all([
        (async () => {
          const arr: Student[] = [];
          await store.students.iterate<Student, void>((v) => { arr.push(mapStudentForPush(v)); });
          return arr;
        })(),
        (async () => {
          const arr: Grade[] = [];
          await store.grades.iterate<Grade, void>((v) => { arr.push(v); });
          return arr;
        })(),
        (async () => {
          const arr: Attendance[] = [];
          await store.attendance.iterate<Attendance, void>((v) => { arr.push(v); });
          return arr;
        })(),
        (async () => {
          const arr: any[] = [];
          await store.roster.iterate<any, void>((v) => { arr.push(v); });
          return arr;
        })(),
        (async () => {
          const arr: any[] = [];
          await store.piket.iterate<any, void>((v) => { arr.push(v); });
          return arr;
        })(),
        (async () => {
          const arr: any[] = [];
          await store.raporCapaian.iterate<any, void>((v) => { arr.push(v); });
          return arr;
        })(),
        (async () => {
          const arr: AppUser[] = [];
          await store.users.iterate<AppUser, void>((v) => { arr.push(v); });
          return arr;
        })(),
        store.settings.getItem<Settings>('app_settings')
      ]);

      const payload = {
        action: 'push',
        data: {
          students,
          grades,
          attendance,
          roster,
          piket,
          raporCapaian,
          users,
          settings
        }
      };

      if (students.length > 0) {
        // Verification step to confirm 'nisn', 'kelas', and 'jenis_kelamin' are not undefined before fetch call
        for (const s of students) {
          if (!s || s.nisn === undefined || s.kelas === undefined || s.jenis_kelamin === undefined) {
            throw new Error(`Validasi Gagal: Properti kritis ('nisn', 'kelas', atau 'jenis_kelamin') bernilai undefined untuk siswa ${s?.nama || s?.id || 'tidak dikenal'}.`);
          }
        }

        const isValid = await validateStudentDataExport(students);
        if (!isValid) {
          throw new Error('Validasi data siswa gagal sebelum dikirim.');
        }
      }

      // Explicitly log the entire object structure being sent to Google Apps Script
      console.log('[Sync Push Payload Structure Log]:', JSON.stringify(payload, null, 2));

      let res: Response;
      try {
        res = await fetch('/api/proxy-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appsScriptUrl, payload })
        });
        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          if (res.status === 404 || !contentType || !contentType.includes('application/json')) {
            throw new Error(`Proxy error ${res.status}`);
          }
        }
      } catch (proxyErr) {
        console.warn('[Sync Push] Proxy failed, trying direct browser connection...', proxyErr);
        try {
          console.log('[Sync Push] Mengirim langsung dengan mode "cors"...');
          res = await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'cors',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (corsErr: any) {
          console.warn('[Sync Push] Mode "cors" gagal atau ditolak pre-flight. Mencoba mode "no-cors" sebagai fallback...', corsErr);
          try {
            res = await fetch(appsScriptUrl, {
              method: 'POST',
              mode: 'no-cors',
              body: JSON.stringify(payload),
              headers: { 'Content-Type': 'application/json' }
            });
            // Opaque response handling for mode: "no-cors"
            if (res.type === 'opaque' || res.status === 0) {
              console.log('[Sync Push] Respon no-cors diterima (opaque). Mengasumsikan transmisi data berhasil.');
              res = new Response(JSON.stringify({ status: 'success', message: 'Data sent via no-cors fallback' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          } catch (noCorsErr: any) {
            throw new Error(`Koneksi jaringan gagal setelah mencoba fallback "no-cors": ${noCorsErr.message}`);
          }
        }
      }

      if (!res.ok) {
        const errorText = await res.clone().text().catch(() => '');
        let cleanErrorMessage = 'Gagal menyimpan backup penuh ke Apps Script';
        try {
          const errJson = JSON.parse(errorText);
          if (errJson && errJson.message) {
            cleanErrorMessage = errJson.message;
          }
        } catch (e) {}
        throw new Error(cleanErrorMessage);
      }

      const result = await res.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Error dari Apps Script');
      }

      await store.syncQueue.clear();
      await addSyncLog('push', 'success', 'Pencadangan penuh berhasil', count);
    }
  } catch (err: any) {
    await addSyncLog(forceFull ? 'push' : 'delta', 'failure', err.message || 'Koneksi gagal atau URL salah', count);
    throw err;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sync-status-changed'));
  }
}

export async function pullDataFromSheets(appsScriptUrl: string) {
  const cleanUrl = (appsScriptUrl || '').trim();
  console.log('[Sync Pull] Memulai pengambilan data dari Google Sheets...');
  console.log('[Sync Pull] URL Apps Script:', cleanUrl);

  if (!cleanUrl) {
    console.error('[Sync Pull] Gagal: URL Apps Script kosong.');
    throw new Error('URL Google Apps Script kosong atau tidak valid.');
  }

  // Basic URL validation
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    console.error('[Sync Pull] Gagal: URL tidak diawali dengan http:// atau https://');
    throw new Error('URL Google Apps Script harus diawali dengan http:// atau https://');
  }

  let count = 0;
  try {
    const payload = { action: 'pull' };
    console.log('[Sync Pull] Mengirim payload:', JSON.stringify(payload));
    
    let res: Response;
    try {
      res = await fetch('/api/proxy-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appsScriptUrl: cleanUrl, payload })
      });
      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        if (res.status === 404 || !contentType || !contentType.includes('application/json')) {
          throw new Error(`Proxy error ${res.status}`);
        }
      }
    } catch (proxyErr) {
      console.warn('[Sync Pull] Proxy gagal atau tidak tersedia, mencoba koneksi langsung...', proxyErr);
      try {
        res = await fetch(cleanUrl, {
          method: 'POST',
          mode: 'cors',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
          redirect: 'follow'
        });
      } catch (fetchErr: any) {
        console.error('[Sync Pull] Gagal melakukan request fetch ke Apps Script:', fetchErr);
        throw new Error(`Koneksi internet terputus atau URL Apps Script tidak valid/terblokir oleh CORS. Detail: ${fetchErr.message}`);
      }
    }

    console.log('[Sync Pull] HTTP Status:', res.status, res.statusText);
    
    if (!res.ok) {
      const errorText = await res.clone().text().catch(() => '');
      let cleanErrorMessage = `Gagal mengambil data dari Apps Script. HTTP Status: ${res.status}`;
      try {
        const errJson = JSON.parse(errorText);
        if (errJson && errJson.message) {
          cleanErrorMessage = errJson.message;
        }
      } catch (e) {}
      console.error('[Sync Pull] Server merespon dengan status tidak OK:', res.status, errorText);
      throw new Error(cleanErrorMessage);
    }

    const rawText = await res.text();
    console.log('[Sync Pull] Panjang data respon mentah:', rawText.length, 'karakter');
    
    // Check if the response seems to be HTML (like Google login page or error page)
    if (rawText.trim().startsWith('<!DOCTYPE html') || rawText.trim().startsWith('<html')) {
      console.error('[Sync Pull] ERROR: Apps Script mengembalikan halaman HTML, bukan JSON. 200 karakter pertama:', rawText.trim().substring(0, 200));
      throw new Error('Google Apps Script mengembalikan halaman HTML (Login/Error). Pastikan skrip sudah dideploy sebagai Web App dengan akses "Anyone" (Siapa saja) dan dijalankan sebagai "Me" (Saya).');
    }

    let result: any;
    try {
      result = JSON.parse(rawText);
    } catch (jsonErr: any) {
      console.error('[Sync Pull] ERROR: Gagal mem-parse respon JSON:', jsonErr);
      console.error('[Sync Pull] Konten respon mentah (500 karakter pertama):', rawText.substring(0, 500));
      throw new Error(`Format data dari Google Apps Script tidak valid (Bukan JSON). Detail: ${jsonErr.message}`);
    }

    console.log('[Sync Pull] Respon JSON berhasil di-parse. Status:', result.status);

    if (result.status !== 'success' || !result.data) {
      console.error('[Sync Pull] ERROR: Status dari Apps Script bukan "success" atau data kosong:', result);
      throw new Error(result.message || 'Error dari Apps Script (status tidak success atau data kosong)');
    }

    let { 
      students = [], 
      grades = [], 
      attendance = [], 
      roster = [], 
      piket = [], 
      raporCapaian = [], 
      users = [], 
      settings 
    } = result.data;

    // --- SELF-HEAL HELPERS TO RECOVER COLUMNS FROM SHEETS WITH TITLE ROWS ---
    const selfHealObjects = (rawList: any[], type: string): any[] => {
      if (!Array.isArray(rawList) || rawList.length === 0) return rawList;

      // Check if the objects already contain standard properties as keys.
      // If they do, Google Apps Script already successfully parsed the sheet headers, 
      // so we absolutely must bypass self-healing to avoid false positive header detections 
      // and data loss/corruption.
      const firstItem = rawList[0];
      if (firstItem && typeof firstItem === 'object') {
        const itemKeys = Object.keys(firstItem);
        const standardFields = ['nama', 'nisn', 'kelas', 'jenis_kelamin', 'nilai', 'mata_pelajaran', 'hari'];
        if (itemKeys.some(k => standardFields.includes(k))) {
          console.log(`[Self-Heal] Data '${type}' already parsed with standard keys. Bypassing self-heal. Keys present:`, itemKeys);
          return rawList;
        }
      }

      let headerRowIndex = -1;
      let headerMappings: Record<string, string> = {};

      let indicatorsMap: Record<string, string[]> = {};
      if (type === 'students') {
        indicatorsMap = {
          nama: ['nama', 'nama_lengkap', 'nama_siswa', 'student_name', 'full_name'],
          nisn: ['nisn', 'nisn_siswa', 'nomor_induk_siswa_nasional', 'no_nisn', 'nomor_nisn', 'no_induk_nasional', 'nomor_induk_nasional'],
          kelas: ['kelas', 'nama_kelas', 'rombel', 'ruang', 'rombongan_belajar', 'kelas_siswa', 'kelas_tingkat', 'tingkat', 'class'],
          jenis_kelamin: ['jenis_kelamin', 'jk', 'gender', 'sex', 'l_p', 'lp', 'kelamin', 'jenis_kelam'],
          nipd: ['nipd', 'nipd_siswa', 'no_induk', 'nomor_induk'],
          tempat_lahir: ['tempat_lahir', 'tempat', 'tpt_lahir', 'tempat_lh'],
          tanggal_lahir: ['tanggal_lahir', 'tgl_lahir', 'tanggal_lh'],
          nama_ayah: ['nama_ayah', 'ayah', 'father'],
          nama_ibu: ['nama_ibu', 'ibu', 'mother'],
          no_telp_ortu: ['no_telp_ortu', 'nomor_telepon', 'no_telp', 'nomor_hp', 'no_hp', 'telp', 'telepon', 'hp', 'phone']
        };
      } else if (type === 'grades') {
        indicatorsMap = {
          nama: ['nama', 'nama_lengkap', 'nama_siswa', 'student_name', 'full_name'],
          nisn: ['nisn', 'nisn_siswa', 'nomor_induk_siswa_nasional', 'no_nisn', 'nomor_nisn', 'no_induk_nasional', 'nomor_induk_nasional'],
          jenis_nilai: ['jenis_nilai', 'jenis', 'kategori', 'tipe_nilai', 'jenis_aspek', 'aspek'],
          nama_kolom: ['nama_kolom', 'kolom', 'nama_nilai', 'keterangan', 'tugas', 'ulangan', 'uh', 'uts', 'uas', 'aspek_penilaian'],
          nilai: ['nilai', 'score', 'point', 'angka', 'hasil', 'jumlah'],
          mata_pelajaran: ['mata_pelajaran', 'mapel', 'pelajaran', 'subjek', 'subject']
        };
      } else if (type === 'attendance') {
        indicatorsMap = {
          nama: ['nama', 'nama_lengkap', 'nama_siswa', 'student_name', 'full_name'],
          nisn: ['nisn', 'nisn_siswa', 'nomor_induk_siswa_nasional', 'no_nisn', 'nomor_nisn', 'no_induk_nasional', 'nomor_induk_nasional'],
          tanggal: ['tanggal', 'tgl', 'date', 'hari_tanggal'],
          status: ['status', 'keterangan', 'kehadiran', 'presensi', 'absensi']
        };
      } else if (type === 'roster') {
        indicatorsMap = {
          hari: ['hari', 'day'],
          jam_mulai: ['jam_mulai', 'mulai', 'start', 'waktu_mulai'],
          jam_selesai: ['jam_selesai', 'selesai', 'end', 'waktu_selesai'],
          mata_pelajaran: ['mata_pelajaran', 'mapel', 'pelajaran', 'subjek', 'subject'],
          guru: ['guru', 'nama_guru', 'teacher'],
          kelas: ['kelas', 'nama_kelas', 'class']
        };
      } else if (type === 'piket') {
        indicatorsMap = {
          hari: ['hari', 'day'],
          nama: ['nama', 'nama_lengkap', 'nama_siswa', 'student_name', 'full_name'],
          kelas: ['kelas', 'nama_kelas', 'class']
        };
      }

      for (let i = 0; i < Math.min(rawList.length, 15); i++) {
        const obj = rawList[i];
        if (!obj || typeof obj !== 'object') continue;

        const matches: Record<string, string> = {};
        let matchCount = 0;

        for (const [key, value] of Object.entries(obj)) {
          if (value === undefined || value === null) continue;
          const valStr = String(value).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
          
          for (const [stdKey, indicators] of Object.entries(indicatorsMap)) {
            if (indicators.includes(valStr)) {
              if (!matches[key]) {
                matches[key] = stdKey;
                matchCount++;
              }
            }
          }
        }

        const hasRequiredMatch = type === 'roster' || type === 'piket'
          ? Object.keys(matches).length >= 2
          : Object.values(matches).includes('nama') || Object.values(matches).includes('nisn');

        if (matchCount >= 2 && hasRequiredMatch) {
          headerRowIndex = i;
          headerMappings = matches;
          break;
        }
      }

      if (headerRowIndex !== -1) {
        console.log(`[Self-Heal] Detected header row for '${type}' at index:`, headerRowIndex, 'with mappings:', headerMappings);
        const healedList: any[] = [];
        
        for (let i = headerRowIndex + 1; i < rawList.length; i++) {
          const obj = rawList[i];
          if (!obj || typeof obj !== 'object') continue;

          const values = Object.values(obj).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
          if (values.length === 0) continue;

          // Skip if duplicate of header values
          let isHeaderDuplicate = true;
          for (const [rawKey, stdKey] of Object.entries(headerMappings)) {
            const valStr = String(obj[rawKey] || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
            const indicators = indicatorsMap[stdKey] || [];
            if (!indicators.includes(valStr) && !indicators.some(ind => valStr.includes(ind))) {
              isHeaderDuplicate = false;
              break;
            }
          }
          if (isHeaderDuplicate) continue;

          const newObj = { ...obj };
          for (const [rawKey, stdKey] of Object.entries(headerMappings)) {
            if (obj[rawKey] !== undefined && obj[rawKey] !== null) {
              newObj[stdKey] = String(obj[rawKey]).trim();
            }
          }
          healedList.push(newObj);
        }
        return healedList;
      }
      return rawList;
    };

    students = selfHealObjects(students, 'students');
    grades = selfHealObjects(grades, 'grades');
    attendance = selfHealObjects(attendance, 'attendance');
    roster = selfHealObjects(roster, 'roster');
    piket = selfHealObjects(piket, 'piket');

    // --- NORMALIZATION HELPER TO FIX BAD HEADERS AND DATA ---
    const normalizeObject = (obj: any) => {
      const newObj: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Strip trailing/leading spaces or weird characters from key, ensure lowercase and snake_case
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        let val = value;
        if (typeof val === 'string') val = val.trim();
        newObj[cleanKey] = val;

        // Also keep the simple lowercase key without replacing spaces/special characters for backward compatibility
        const simpleKey = key.replace(/^_+|_+$/g, '').trim().toLowerCase();
        if (simpleKey !== cleanKey) {
          newObj[simpleKey] = val;
        }
      }
      if (!newObj.id) {
        newObj.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
      return newObj;
    };

    const normalizeStudent = (s: any) => {
      const student = normalizeObject(s);
      
      // Fallbacks for 'nisn'
      if (!student.nisn) {
        student.nisn = student.nisn_siswa || student.nomor_induk_siswa_nasional || student.nomor_induk || student.ni || student.no_nisn || student.nomor_nisn || student.no_induk_nasional || student.nomor_induk_nasional || '';
      }
      student.nisn = String(student.nisn || '').trim();

      // Fallbacks for 'kelas'
      if (!student.kelas) {
        student.kelas = student.nama_kelas || student.rombel || student.ruang || student.rombongan_belajar || student.kelas_siswa || student.kelas_tingkat || student.tingkat || '';
      }
      student.kelas = String(student.kelas || '').trim();

      // Fallbacks for 'no_telp_ortu' and 'nomor_telepon'
      if (!student.no_telp_ortu) {
        student.no_telp_ortu = student.nomor_telepon || student.no_telp || student.nomor_hp || student.no_hp || student.telp || student.telepon || student.hp || '';
      }
      student.no_telp_ortu = String(student.no_telp_ortu || '').trim();
      student.nomor_telepon = student.no_telp_ortu; // Keep both in sync for schema

      // Fallbacks for 'nama_orang_tua' / 'nama_ayah' / 'nama_ibu'
      if (!student.nama_orang_tua) {
        student.nama_orang_tua = student.nama_ortu || student.orang_tua || student.nama_wali || student.wali || student.ayah_ibu || '';
      }
      if (!student.nama_orang_tua && (student.nama_ayah || student.nama_ibu)) {
        student.nama_orang_tua = [student.nama_ayah, student.nama_ibu].filter(Boolean).join(' / ');
      }
      if (student.nama_orang_tua && !student.nama_ayah && !student.nama_ibu) {
        student.nama_ayah = student.nama_orang_tua;
      }

      // Fallbacks for 'jenis_kelamin'
      if (!student.jenis_kelamin) {
        student.jenis_kelamin = student.jk || student.gender || student.sex || student.l_p || student.lp || student.kelamin || '';
      }
      if (student.jenis_kelamin) {
        const jkLower = String(student.jenis_kelamin).trim().toLowerCase();
        if (jkLower === 'l' || jkLower.startsWith('laki')) {
          student.jenis_kelamin = 'Laki-laki';
        } else if (jkLower === 'p' || jkLower.startsWith('perem') || jkLower.startsWith('wanita')) {
          student.jenis_kelamin = 'Perempuan';
        }
      }

      // Ensure standard keys exist
      student.nama = String(student.nama || '').trim();
      student.nipd = String(student.nipd || '').trim();
      student.tempat_lahir = String(student.tempat_lahir || '').trim();
      student.tanggal_lahir = String(student.tanggal_lahir || '').trim();
      student.nama_ayah = String(student.nama_ayah || '').trim();
      student.nama_ibu = String(student.nama_ibu || '').trim();
      
      return student;
    };

    const normalizeRoster = (r: any) => {
      const rosterItem = normalizeObject(r);
      // Fallbacks for 'hari'
      if (!rosterItem.hari) rosterItem.hari = rosterItem.day || '';
      // Fallbacks for 'mata_pelajaran'
      if (!rosterItem.mata_pelajaran) rosterItem.mata_pelajaran = rosterItem.mapel || rosterItem.subjek || rosterItem.subject || '';
      // Fallbacks for 'guru'
      if (!rosterItem.guru) rosterItem.guru = rosterItem.nama_guru || rosterItem.teacher || '';
      // Fallbacks for 'kelas'
      if (!rosterItem.kelas) rosterItem.kelas = rosterItem.nama_kelas || rosterItem.class || '';
      // Fallbacks for 'semester'
      if (!rosterItem.semester) rosterItem.semester = rosterItem.smstr || '';
      // Jam Mulai / Selesai split if only single 'jam' or 'waktu' column exists
      if (!rosterItem.jam_mulai && (rosterItem.jam || rosterItem.waktu || rosterItem.pukul)) {
        const fullTime = String(rosterItem.jam || rosterItem.waktu || rosterItem.pukul || '').trim();
        const parts = fullTime.split(/[-–—]/); // split by dash
        if (parts.length >= 2) {
          rosterItem.jam_mulai = parts[0].trim();
          rosterItem.jam_selesai = parts[1].trim();
        } else {
          rosterItem.jam_mulai = fullTime;
          rosterItem.jam_selesai = fullTime;
        }
      }
      return rosterItem;
    };

    const normalizeGrade = (g: any) => {
      const grade = normalizeObject(g);
      
      // Fallbacks for nisn and nama
      if (!grade.nisn) {
        grade.nisn = grade.nisn_siswa || grade.nomor_induk_siswa_nasional || grade.nomor_induk || grade.ni || '';
      }
      if (!grade.nama) {
        grade.nama = grade.nama_lengkap || grade.nama_siswa || '';
      }
      if (!grade.mata_pelajaran) {
        grade.mata_pelajaran = grade.mapel || grade.pelajaran || '';
      }
      
      if (!grade.jenis_nilai) {
        grade.jenis_nilai = grade.jenis || grade.kategori || 'Harian';
      }
      // Standardize jenis_nilai
      if (grade.jenis_nilai) {
        const jLower = String(grade.jenis_nilai).trim().toLowerCase();
        if (jLower.includes('hari') || jLower.includes('uh') || jLower === 'harian') {
          grade.jenis_nilai = 'Harian';
        } else if (jLower.includes('tugas') || jLower.includes('pr') || jLower === 'tugas') {
          grade.jenis_nilai = 'Tugas';
        } else if (jLower.includes('ujian') || jLower.includes('uts') || jLower.includes('uas') || jLower.includes('ukk') || jLower === 'ujian') {
          grade.jenis_nilai = 'Ujian';
        }
      }
      if (!grade.nama_kolom) {
        grade.nama_kolom = grade.kolom || grade.nama_nilai || grade.keterangan || 'Nilai';
      }
      if (!grade.semester) {
        grade.semester = grade.smstr || settings?.semester_aktif || 'Ganjil 2026';
      }
      if (grade.nilai !== undefined && grade.nilai !== null) {
        let valStr = String(grade.nilai).trim().replace(',', '.');
        grade.nilai = Number(valStr) || 0;
      } else {
        grade.nilai = 0;
      }
      return grade;
    };
    
    students = students.map(normalizeStudent);

    // Split wide-format grades (where each subject has its own column) into separate narrow grade records
    let finalGrades: any[] = [];
    if (Array.isArray(grades)) {
      grades.forEach((g: any) => {
        const excludedKeys = [
          'id', 'id_siswa', 'nama', 'nisn', 'kelas', 'semester', 'jenis_nilai', 'nama_kolom', 'nilai', 'mata_pelajaran',
          'no', 'nipd', 'tempat_lahir', 'tanggal_lahir', 'nama_ayah', 'nama_ibu', 'no_telp_ortu', 'nama_orang_tua', 'jenis_kelamin', 'nomor_telepon'
        ];
        
        let hasSubjectKeys = false;
        const subjectGrades: any[] = [];
        const activeSem = settings?.semester_aktif || 'Ganjil 2026';
        
        for (const [key, val] of Object.entries(g)) {
          const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
          if (!excludedKeys.includes(cleanKey) && val !== null && val !== undefined && val !== '') {
            const numVal = Number(String(val).replace(',', '.'));
            if (!isNaN(numVal) && numVal >= 0 && numVal <= 100) {
              let mapelName = key;
              if (settings && Array.isArray(settings.mata_pelajaran)) {
                const matched = settings.mata_pelajaran.find((m: string) => m.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') === cleanKey);
                if (matched) mapelName = matched;
              }
              
              hasSubjectKeys = true;
              subjectGrades.push({
                id: `${g.id || Math.random().toString(36).substring(2)}_${cleanKey}`,
                id_siswa: g.id_siswa || '',
                nama: g.nama || g.nama_lengkap || g.nama_siswa || '',
                nisn: g.nisn || '',
                mata_pelajaran: mapelName,
                jenis_nilai: g.jenis_nilai || 'Harian',
                nama_kolom: g.nama_kolom || 'Nilai',
                nilai: numVal,
                semester: g.semester || activeSem
              });
            }
          }
        }
        
        if (hasSubjectKeys) {
          finalGrades = finalGrades.concat(subjectGrades);
        } else {
          finalGrades.push(g);
        }
      });
      grades = finalGrades;
    }

    grades = grades.map(normalizeGrade);
    attendance = attendance.map(normalizeObject);
    roster = roster.map(normalizeRoster);
    piket = piket.map(normalizeObject);
    raporCapaian = raporCapaian.map(normalizeObject);
    users = users.map(normalizeObject);

    // Resolve id_siswa based on nama or nisn if missing
    const studentLookupByName: Record<string, string> = {};
    const studentLookupByNisn: Record<string, string> = {};
    students.forEach((s: any) => {
      if (s.nama) studentLookupByName[String(s.nama).toLowerCase().trim()] = s.id;
      if (s.nisn) studentLookupByNisn[String(s.nisn).toLowerCase().trim()] = s.id;
    });

    const resolveIdSiswa = (items: any[]) => {
      items.forEach(item => {
        if (!item.id_siswa) {
          const nisnKey = String(item.nisn || '').trim().toLowerCase();
          const nameKey = String(item.nama || item.nama_siswa || item.nama_lengkap || '').trim().toLowerCase();
          
          if (nisnKey && studentLookupByNisn[nisnKey]) {
            item.id_siswa = studentLookupByNisn[nisnKey];
          } else if (nameKey && studentLookupByName[nameKey]) {
            item.id_siswa = studentLookupByName[nameKey];
          } else if (nameKey) {
            // Fuzzy match: check if student name equals, contains, or is contained by the nameKey
            const foundId = students.find((s: any) => {
              const sName = String(s.nama || '').trim().toLowerCase();
              return sName && (sName === nameKey || sName.includes(nameKey) || nameKey.includes(sName));
            })?.id;
            if (foundId) {
              item.id_siswa = foundId;
            }
          }
        }
      });
    };
    resolveIdSiswa(grades);
    resolveIdSiswa(attendance);
    resolveIdSiswa(raporCapaian);
    resolveIdSiswa(piket);
    // --------------------------------------------------------

    console.log('[Sync Pull] Data yang diterima dari cloud:');
    console.log(` - Siswa: ${students.length} item`);
    console.log(` - Nilai: ${grades.length} item`);
    console.log(` - Absensi: ${attendance.length} item`);
    console.log(` - Roster: ${roster.length} item`);
    console.log(` - Piket: ${piket.length} item`);
    console.log(` - Rapor Capaian: ${raporCapaian.length} item`);
    console.log(` - Pengguna: ${users.length} item`);
    console.log(` - Pengaturan: ${settings ? 'Ada' : 'Tidak ada'}`);

    count = students.length + grades.length + attendance.length + roster.length + piket.length + raporCapaian.length;

    // Pause notifications and sync queue to prevent bulk render overhead & infinite push-pull loops
    pauseNotifications();
    pauseSyncQueue();

    const operations: { promise: () => Promise<any>; storeName: string; key: string; action: 'set' | 'remove' }[] = [];

    try {
      // Smart Sync for Students (differential updates)
      const localStudentsMap = new Map<string, Student>();
      await store.students.iterate<Student, void>((v, k) => {
        localStudentsMap.set(k, v);
      });

      if (Array.isArray(students)) {
        const remoteIds = new Set(students.filter(s => s.id).map(s => s.id));
        for (const s of students) {
          if (!s.id) continue;
          const local = localStudentsMap.get(s.id);
          
          // Defensive Merger! If remote student field is empty but local is set, preserve the local value
          if (local) {
            s.no = s.no || local.no;
            s.nama = s.nama || local.nama;
            s.nisn = s.nisn || local.nisn;
            s.nipd = s.nipd || local.nipd;
            s.tempat_lahir = s.tempat_lahir || local.tempat_lahir;
            s.tanggal_lahir = s.tanggal_lahir || local.tanggal_lahir;
            s.kelas = s.kelas || local.kelas;
            s.nama_ayah = s.nama_ayah || local.nama_ayah;
            s.nama_ibu = s.nama_ibu || local.nama_ibu;
            s.no_telp_ortu = s.no_telp_ortu || local.no_telp_ortu;
            s.nomor_telepon = s.nomor_telepon || local.nomor_telepon;
            s.semester = s.semester || local.semester;
            s.jenis_kelamin = s.jenis_kelamin || local.jenis_kelamin;
            
            // Custom student columns
            for (const [k, v] of Object.entries(local)) {
              if (s[k] === undefined || s[k] === null || s[k] === '') {
                s[k] = v;
              }
            }
          }

          const hasChanges = !local || JSON.stringify(local) !== JSON.stringify(s);
          if (hasChanges) {
            operations.push({
              promise: () => store.students.setItem(s.id, s),
              storeName: 'students',
              key: s.id,
              action: 'set'
            });
          }
        }
        for (const [id] of localStudentsMap.entries()) {
          if (!remoteIds.has(id)) {
            operations.push({
              promise: () => store.students.removeItem(id),
              storeName: 'students',
              key: id,
              action: 'remove'
            });
          }
        }
      }

      // Smart Sync for Grades (differential updates)
      const localGradesMap = new Map<string, Grade>();
      await store.grades.iterate<Grade, void>((v, k) => {
        localGradesMap.set(k, v);
      });

      if (Array.isArray(grades)) {
        const remoteIds = new Set(grades.filter(g => g.id).map(g => g.id));
        for (const g of grades) {
          if (!g.id) continue;
          const local = localGradesMap.get(g.id);
          const hasChanges = !local || JSON.stringify(local) !== JSON.stringify(g);
          if (hasChanges) {
            operations.push({
              promise: () => store.grades.setItem(g.id, g),
              storeName: 'grades',
              key: g.id,
              action: 'set'
            });
          }
        }
        for (const [id] of localGradesMap.entries()) {
          if (!remoteIds.has(id)) {
            operations.push({
              promise: () => store.grades.removeItem(id),
              storeName: 'grades',
              key: id,
              action: 'remove'
            });
          }
        }
      }

      // Smart Sync for Attendance (differential updates)
      const localAttendanceMap = new Map<string, Attendance>();
      await store.attendance.iterate<Attendance, void>((v, k) => {
        localAttendanceMap.set(k, v);
      });

      if (Array.isArray(attendance)) {
        const remoteIds = new Set(attendance.filter(a => a.id).map(a => a.id));
        for (const a of attendance) {
          if (!a.id) continue;
          const local = localAttendanceMap.get(a.id);
          const hasChanges = !local || JSON.stringify(local) !== JSON.stringify(a);
          if (hasChanges) {
            operations.push({
              promise: () => store.attendance.setItem(a.id, a),
              storeName: 'attendance',
              key: a.id,
              action: 'set'
            });
          }
        }
        for (const [id] of localAttendanceMap.entries()) {
          if (!remoteIds.has(id)) {
            operations.push({
              promise: () => store.attendance.removeItem(id),
              storeName: 'attendance',
              key: id,
              action: 'remove'
            });
          }
        }
      }

      // Smart Sync for Roster (differential updates)
      const localRosterMap = new Map<string, any>();
      await store.roster.iterate<any, void>((v, k) => {
        localRosterMap.set(k, v);
      });

      if (Array.isArray(roster)) {
        const remoteIds = new Set(roster.filter(r => r.id).map(r => r.id));
        for (const r of roster) {
          if (!r.id) continue;
          const local = localRosterMap.get(r.id);
          const hasChanges = !local || JSON.stringify(local) !== JSON.stringify(r);
          if (hasChanges) {
            operations.push({
              promise: () => store.roster.setItem(r.id, r),
              storeName: 'roster',
              key: r.id,
              action: 'set'
            });
          }
        }
        for (const [id] of localRosterMap.entries()) {
          if (!remoteIds.has(id)) {
            operations.push({
              promise: () => store.roster.removeItem(id),
              storeName: 'roster',
              key: id,
              action: 'remove'
            });
          }
        }
      }

      // Smart Sync for Piket (differential updates)
      const localPiketMap = new Map<string, any>();
      await store.piket.iterate<any, void>((v, k) => {
        localPiketMap.set(k, v);
      });

      if (Array.isArray(piket)) {
        const remoteIds = new Set(piket.filter(p => p.id).map(p => p.id));
        for (const p of piket) {
          if (!p.id) continue;
          const local = localPiketMap.get(p.id);
          const hasChanges = !local || JSON.stringify(local) !== JSON.stringify(p);
          if (hasChanges) {
            operations.push({
              promise: () => store.piket.setItem(p.id, p),
              storeName: 'piket',
              key: p.id,
              action: 'set'
            });
          }
        }
        for (const [id] of localPiketMap.entries()) {
          if (!remoteIds.has(id)) {
            operations.push({
              promise: () => store.piket.removeItem(id),
              storeName: 'piket',
              key: id,
              action: 'remove'
            });
          }
        }
      }

      // Smart Sync for Settings (differential updates)
      const existingSettings = await store.settings.getItem<Settings>('app_settings') || {} as Settings;
      
      // Extract all unique subjects (mata_pelajaran) from the pulled grades and roster to prevent them from being hidden
      const pulledSubjects = new Set<string>();
      if (existingSettings && Array.isArray(existingSettings.mata_pelajaran)) {
        existingSettings.mata_pelajaran.forEach(m => { if (m) pulledSubjects.add(String(m).trim()); });
      }
      if (settings && Array.isArray(settings.mata_pelajaran)) {
        settings.mata_pelajaran.forEach(m => { if (m) pulledSubjects.add(String(m).trim()); });
      }
      if (Array.isArray(grades)) {
        grades.forEach((g: any) => {
          if (g.mata_pelajaran) pulledSubjects.add(String(g.mata_pelajaran).trim());
        });
      }
      if (Array.isArray(roster)) {
        roster.forEach((r: any) => {
          if (r.mata_pelajaran) pulledSubjects.add(String(r.mata_pelajaran).trim());
        });
      }
      
      const mergedMataPelajaran = Array.from(pulledSubjects).filter(Boolean);
      
      const baseSettings = settings || existingSettings || {};
      const newSettings = { 
        ...existingSettings, 
        ...baseSettings,
        mata_pelajaran: mergedMataPelajaran 
      };
      
      if (JSON.stringify(existingSettings) !== JSON.stringify(newSettings)) {
        operations.push({
          promise: () => store.settings.setItem('app_settings', newSettings),
          storeName: 'settings',
          key: 'app_settings',
          action: 'set'
        });
      }

      // Smart Sync for Rapor Capaian (differential updates)
      const localCapaianMap = new Map<string, any>();
      await store.raporCapaian.iterate<any, void>((v, k) => {
        localCapaianMap.set(k, v);
      });

      if (Array.isArray(raporCapaian)) {
        const remoteIds = new Set(raporCapaian.filter((c: any) => c.id).map((c: any) => c.id));
        for (const c of raporCapaian) {
          if (!c.id) continue;
          const local = localCapaianMap.get(c.id);
          const hasChanges = !local || JSON.stringify(local) !== JSON.stringify(c);
          if (hasChanges) {
            operations.push({
              promise: () => store.raporCapaian.setItem(c.id, c),
              storeName: 'raporCapaian',
              key: c.id,
              action: 'set'
            });
          }
        }
        for (const [id] of localCapaianMap.entries()) {
          if (!remoteIds.has(id)) {
            operations.push({
              promise: () => store.raporCapaian.removeItem(id),
              storeName: 'raporCapaian',
              key: id,
              action: 'remove'
            });
          }
        }
      }

      // Smart Sync for Users (differential updates, preserving admin password)
      const localUsersMap = new Map<string, AppUser>();
      await store.users.iterate<AppUser, void>((v, k) => {
        localUsersMap.set(k, v);
      });

      if (Array.isArray(users)) {
        const remoteIds = new Set(users.map(u => u.id));
        for (const u of users) {
          if (u.username === 'admin') continue; // Don't override local admin
          const local = localUsersMap.get(u.id);
          const hasChanges = !local || JSON.stringify(local) !== JSON.stringify(u);
          if (hasChanges) {
            operations.push({
              promise: () => store.users.setItem(u.id, u),
              storeName: 'users',
              key: u.id,
              action: 'set'
            });
          }
        }
        for (const [id, local] of localUsersMap.entries()) {
          if (local.username === 'admin') continue;
          if (!remoteIds.has(id)) {
            operations.push({
              promise: () => store.users.removeItem(id),
              storeName: 'users',
              key: id,
              action: 'remove'
            });
          }
        }
      }

      console.log(`[Sync Pull] Memulai eksekusi ${operations.length} operasi tulis/hapus ke IndexedDB...`);

      // Run operations using Promise.allSettled to track percentages of success
      const results = await Promise.allSettled(operations.map(op => op.promise()));
      
      let successfulWrites = 0;
      let failedWrites = 0;

      results.forEach((res, index) => {
        if (res.status === 'fulfilled') {
          successfulWrites++;
        } else {
          failedWrites++;
          const op = operations[index];
          console.error(`[Sync Pull] GAGAL menulis ke IndexedDB pada store "${op.storeName}" dengan key "${op.key}":`, res.reason);
        }
      });

      const totalOperations = operations.length;
      const percentage = totalOperations === 0 ? 100 : Math.round((successfulWrites / totalOperations) * 100);

      console.log(`[Sync Pull] Selesai menulis ke IndexedDB.`);
      console.log(` - Total Operasi: ${totalOperations}`);
      console.log(` - Sukses: ${successfulWrites} (${percentage}%)`);
      console.log(` - Gagal: ${failedWrites}`);

      // Clear sync queue since local state is now fully synced with Sheets
      await store.syncQueue.clear();
      console.log('[Sync Pull] Sync queue dibersihkan.');

      await addSyncLog('pull', 'success', `Pengambilan data cloud berhasil (${percentage}% operasi sukses)`, count);

      return {
        success: true,
        totalCount: count,
        processedCount: totalOperations,
        successfulWrites,
        failedWrites,
        percentage
      };

    } finally {
      resumeSyncQueue();
      resumeNotifications(true);
    }
  } catch (err: any) {
    console.error('[Sync Pull] Terjadi error saat memproses pengambilan data dari cloud:', err);
    await addSyncLog('pull', 'failure', err.message || 'Gagal mengambil data dari cloud', count);
    throw err;
  }
}

