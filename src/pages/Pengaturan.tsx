import React, { useState, useEffect } from 'react';
import { Settings as SettingsType, store, defaultSettings, AppUser, pauseNotifications, resumeNotifications } from '../lib/store';
import { Save, Plus, Trash2, UserPlus, ShieldAlert, Key, Pencil, X, Download, Upload, Database, ChevronUp, ChevronDown } from 'lucide-react';
import { googleSignIn } from '../lib/auth';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

export default function Pengaturan({ settings, setSettings, role, currentUser }: { settings: SettingsType | null, setSettings: (s: SettingsType | null) => void, role: 'guru' | 'kepsek', currentUser?: AppUser }) {
  const [formData, setFormData] = useState<SettingsType>(settings || defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    const url = formData.appsScriptUrl?.trim();
    if (!url) {
      toast.error('Silakan masukkan URL Google Apps Script terlebih dahulu.');
      return;
    }

    setIsTesting(true);
    const toastId = toast.loading('Menguji koneksi ke Google Apps Script...');
    try {
      let res: Response;
      let text = '';
      try {
        res = await fetch('/api/proxy-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appsScriptUrl: url,
            payload: { action: 'pull' }
          })
        });
        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          if (res.status === 404 || !contentType || !contentType.includes('application/json')) {
            throw new Error(`Proxy status ${res.status}`);
          }
        }
        text = await res.text();
      } catch (proxyErr) {
        console.warn('[Test Connection] Proxy failed or 404, trying direct browser connection...', proxyErr);
        res = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({ action: 'pull' }),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        text = await res.text();
      }

      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Respon dari server bukan format JSON yang valid.');
      }

      if (!res.ok || data.status === 'error') {
        const errMsg = data.message || `HTTP error! status: ${res.status}`;
        throw new Error(errMsg);
      }

      toast.success('Koneksi Berhasil! Google Apps Script merespons dengan sukses.', { id: toastId, duration: 5000 });
    } catch (err: any) {
      console.error('[Test Connection Error]', err);
      let details = err.message || String(err);
      
      if (details.includes('halaman HTML') || details.includes('<!DOCTYPE html') || details.includes('<html')) {
        details = 'Google Apps Script mengembalikan halaman HTML. Pastikan skrip dideploy sebagai Web App dengan akses "Anyone" (Siapa saja) dan dijalankan sebagai "Me" (Saya).';
      } else if (details.includes('Failed to fetch') || details.includes('fetch')) {
        details = 'Gagal terhubung. Periksa koneksi internet Anda atau pastikan URL Apps Script valid.';
      }
      
      toast.error(`Koneksi Gagal: ${details}`, { id: toastId, duration: 8000 });
    } finally {
      setIsTesting(false);
    }
  };

  // Recovery Questions for Active User
  const [userEmail, setUserEmail] = useState('');
  const [userQuestion, setUserQuestion] = useState('Nama SD Pertama Anda?');
  const [userAnswer, setUserAnswer] = useState('');
  const [isSavingRecovery, setIsSavingRecovery] = useState(false);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'guru' | 'kepsek'>('kepsek');
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

  // Editing User States
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'guru' | 'kepsek'>('kepsek');

  useEffect(() => {
    if (currentUser) {
      setUserEmail(currentUser.email_pemulihan || '');
      setUserQuestion(currentUser.pertanyaan_keamanan || 'Nama SD Pertama Anda?');
      setUserAnswer(currentUser.jawaban_keamanan || '');
    }
  }, [currentUser]);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const list: AppUser[] = [];
    await store.users.iterate((u: AppUser) => {
      list.push(u);
    });
    setUsers(list);
  };

  const exportMasterBackup = async () => {
    try {
      const backupData: any = {
        students: [],
        grades: [],
        attendance: [],
        raporCapaian: [],
        users: [],
        settings: null,
        backup_date: new Date().toISOString(),
      };

      await store.students.iterate((v) => { backupData.students.push(v); });
      await store.grades.iterate((v) => { backupData.grades.push(v); });
      await store.attendance.iterate((v) => { backupData.attendance.push(v); });
      await store.raporCapaian.iterate((v) => { backupData.raporCapaian.push(v); });
      await store.users.iterate((v) => { backupData.users.push(v); });
      backupData.settings = await store.settings.getItem('app_settings');

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      const dateStr = new Date().toISOString().slice(0,10);
      downloadAnchor.setAttribute("download", `Backup_DataMaster_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success('Pencadangan data master berhasil diunduh!');
    } catch (e: any) {
      toast.error('Gagal mencadangkan data master: ' + e.message);
    }
  };

  const importMasterBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (!json || (!json.students && !json.grades && !json.attendance)) {
          throw new Error('Format file backup tidak valid');
        }

        const confirmImport = window.confirm('Peringatan: Mengimpor data ini akan menggabungkan atau memperbarui database Anda saat ini. Lanjutkan?');
        if (!confirmImport) return;

        pauseNotifications();
        
        if (json.students && Array.isArray(json.students)) {
          for (const s of json.students) {
            await store.students.setItem(s.id, s);
          }
        }
        if (json.grades && Array.isArray(json.grades)) {
          for (const g of json.grades) {
            await store.grades.setItem(g.id, g);
          }
        }
        if (json.attendance && Array.isArray(json.attendance)) {
          for (const a of json.attendance) {
            await store.attendance.setItem(a.id, a);
          }
        }
        if (json.raporCapaian && Array.isArray(json.raporCapaian)) {
          for (const c of json.raporCapaian) {
            await store.raporCapaian.setItem(c.id, c);
          }
        }
        if (json.settings) {
          const current = await store.settings.getItem<SettingsType>('app_settings') || {} as SettingsType;
          const merged = { ...current, ...json.settings };
          await store.settings.setItem('app_settings', merged);
          setSettings(merged);
        }
        if (json.users && Array.isArray(json.users)) {
          for (const u of json.users) {
            if (u.username === 'admin') continue; // Don't override local admin
            await store.users.setItem(u.id, u);
          }
        }

        toast.success('Pencadangan data master berhasil dipulihkan!');
        window.dispatchEvent(new Event('data-changed'));
        
        setTimeout(() => {
          window.location.reload();
        }, 1500);

      } catch (err: any) {
        toast.error('Gagal mengimpor file backup: ' + err.message);
      } finally {
        resumeNotifications(true);
      }
    };
    reader.readAsText(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('bobot')) {
      let numVal = value.replace(/^0+(?=\d)/, '');
      let parsed = parseInt(numVal, 10);
      if (isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;
      if (parsed > 100) parsed = 100;
      setFormData(prev => ({ ...prev, [name]: parsed }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const addMapel = () => {
    setFormData(prev => ({
      ...prev,
      mata_pelajaran: [...(prev.mata_pelajaran || []), '']
    }));
  };

  const updateMapel = (index: number, value: string) => {
    setFormData(prev => {
      const newMapel = [...(prev.mata_pelajaran || [])];
      const oldValue = newMapel[index];
      newMapel[index] = value;
      let updatedPilihan = [...(prev.pilihan_mata_pelajaran || [])];
      if (oldValue && updatedPilihan.includes(oldValue)) {
        updatedPilihan = updatedPilihan.map(m => m === oldValue ? value : m);
      }
      return { ...prev, mata_pelajaran: newMapel, pilihan_mata_pelajaran: updatedPilihan };
    });
  };

  const removeMapel = (index: number) => {
    setFormData(prev => {
      const newMapel = [...(prev.mata_pelajaran || [])];
      const oldValue = newMapel[index];
      newMapel.splice(index, 1);
      let updatedPilihan = [...(prev.pilihan_mata_pelajaran || [])];
      if (oldValue) {
        updatedPilihan = updatedPilihan.filter(m => m !== oldValue);
      }
      return { ...prev, mata_pelajaran: newMapel, pilihan_mata_pelajaran: updatedPilihan };
    });
  };

  const moveMapel = (index: number, direction: 'up' | 'down') => {
    setFormData(prev => {
      const newMapel = [...(prev.mata_pelajaran || [])];
      if (direction === 'up' && index > 0) {
        const temp = newMapel[index];
        newMapel[index] = newMapel[index - 1];
        newMapel[index - 1] = temp;
      } else if (direction === 'down' && index < newMapel.length - 1) {
        const temp = newMapel[index];
        newMapel[index] = newMapel[index + 1];
        newMapel[index + 1] = temp;
      }
      return { ...prev, mata_pelajaran: newMapel };
    });
  };

  const handleAuthGoogle = async () => {
    try {
      const result = await googleSignIn();
      if (result?.accessToken) {
        toast.success('Berhasil terhubung ke Akun Google');
      } else {
        toast.error('Batal menghubungkan ke Akun Google');
      }
    } catch (e: any) {
      toast.error('Gagal menghubungkan: ' + e.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await store.settings.setItem('app_settings', formData);
      setSettings(formData);
      toast.success('Pengaturan berhasil disimpan.', { duration: 4000 });
    } catch (e) {
      console.error(e);
      toast.error('Gagal menyimpan pengaturan.', { duration: 3000 });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast.error('Gagal memverifikasi identitas Anda');
      return;
    }
    setIsSavingRecovery(true);
    try {
      const updated: AppUser = {
        ...currentUser,
        email_pemulihan: userEmail,
        pertanyaan_keamanan: userQuestion,
        jawaban_keamanan: userAnswer
      };
      await store.users.setItem(currentUser.id, updated);
      localStorage.setItem('app_user', JSON.stringify(updated));
      toast.success('Informasi keamanan & pemulihan akun Anda diperbarui');
    } catch (e) {
      console.error(e);
      toast.error('Gagal memperbarui informasi pemulihan');
    } finally {
      setIsSavingRecovery(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !newName) {
      toast.error('Semua kolom akun harus diisi');
      return;
    }

    let exists = false;
    await store.users.iterate((u: AppUser) => {
      if (u.username === newUsername) exists = true;
    });

    if (exists) {
      toast.error('Username sudah digunakan');
      return;
    }

    const newUser: AppUser = {
      id: uuidv4(),
      username: newUsername,
      password: newPassword,
      name: newName,
      role: newRole
    };

    await store.users.setItem(newUser.id, newUser);
    toast.success('Pengguna berhasil ditambahkan');
    setNewUsername('');
    setNewPassword('');
    setNewName('');
    loadUsers();
  };

  const handleDeleteUser = (id: string, username: string) => {
    if (username === 'admin') {
      toast.error('Akun admin tidak bisa dihapus');
      return;
    }
    const foundUser = users.find(u => u.id === id);
    if (foundUser) {
      setUserToDelete(foundUser);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    await store.users.removeItem(userToDelete.id);
    toast.success('Pengguna dihapus');
    setUserToDelete(null);
    loadUsers();
  };

  const startEditUser = (user: AppUser) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditPassword('');
    setEditRole(user.role);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const updatedUser = {
      ...editingUser,
      name: editName,
      role: editingUser.username === 'admin' ? 'guru' : editRole
    };

    if (editPassword) {
      updatedUser.password = editPassword;
    }

    await store.users.setItem(editingUser.id, updatedUser);
    toast.success('Informasi akun berhasil diperbarui');
    
    // If the edited user is the currently logged-in user, update localStorage too
    if (currentUser && currentUser.id === editingUser.id) {
      localStorage.setItem('app_user', JSON.stringify(updatedUser));
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }

    setEditingUser(null);
    loadUsers();
  };

  return (
    <div className="p-8 text-slate-200 h-full overflow-auto custom-scrollbar">
      <div className="space-y-8 max-w-4xl mx-auto">
        <form onSubmit={handleSave} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3 flex justify-between items-center">
                Mata Pelajaran
                {role === 'guru' && (
                  <button type="button" onClick={addMapel} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-sm bg-indigo-500/10 px-2 py-1 rounded">
                    <Plus size={14} /> Tambah Mapel
                  </button>
                )}
              </h3>
              
              <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                {(formData.mata_pelajaran || []).map((mapel, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      value={mapel} 
                      disabled={role !== 'guru'}
                      onChange={(e) => updateMapel(index, e.target.value)} 
                      placeholder="Nama Mata Pelajaran"
                      className="flex-1 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50" 
                      required 
                    />
                    <button
                      type="button"
                      disabled={role !== 'guru'}
                      onClick={() => {
                        const isPilihan = (formData.pilihan_mata_pelajaran || []).includes(mapel);
                        let updatedPilihan = [...(formData.pilihan_mata_pelajaran || [])];
                        if (isPilihan) {
                          updatedPilihan = updatedPilihan.filter(m => m !== mapel);
                        } else {
                          updatedPilihan.push(mapel);
                        }
                        setFormData(prev => ({ ...prev, pilihan_mata_pelajaran: updatedPilihan }));
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap min-w-[75px] text-center ${
                        (formData.pilihan_mata_pelajaran || []).includes(mapel)
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500/50'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50'
                      }`}
                    >
                      {(formData.pilihan_mata_pelajaran || []).includes(mapel) ? 'Pilihan' : 'Wajib'}
                    </button>
                    {role === 'guru' && (
                      <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => moveMapel(index, 'up')} disabled={index === 0} className="p-0.5 text-slate-400 hover:text-slate-200 disabled:opacity-30">
                          <ChevronUp size={14} />
                        </button>
                        <button type="button" onClick={() => moveMapel(index, 'down')} disabled={index === (formData.mata_pelajaran?.length || 0) - 1} className="p-0.5 text-slate-400 hover:text-slate-200 disabled:opacity-30">
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    )}
                    {role === 'guru' && (
                      <button type="button" onClick={() => removeMapel(index)} className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors self-center">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
                {(formData.mata_pelajaran || []).length === 0 && (
                  <p className="text-sm text-slate-500 italic">Belum ada mata pelajaran.</p>
                )}
              </div>
            </div>

            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3">Bobot Penilaian Akhir (%)</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Bobot Nilai Harian</label>
                <input type="number" disabled={role !== 'guru'} name="bobot_harian" value={formData.bobot_harian ?? ''} onChange={handleChange} min="1" max="100" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50" required />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Bobot Nilai Tugas</label>
                <input type="number" disabled={role !== 'guru'} name="bobot_tugas" value={formData.bobot_tugas ?? ''} onChange={handleChange} min="1" max="100" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50" required />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Bobot Nilai Ujian</label>
                <input type="number" disabled={role !== 'guru'} name="bobot_ujian" value={formData.bobot_ujian ?? ''} onChange={handleChange} min="1" max="100" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50" required />
              </div>

              <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl mt-6">
                <p className="text-sm text-indigo-300">
                  Total Bobot: <span className="font-bold text-indigo-200 text-lg ml-1">{formData.bobot_harian + formData.bobot_tugas + formData.bobot_ujian}%</span>
                </p>
                {formData.bobot_harian + formData.bobot_tugas + formData.bobot_ujian !== 100 && (
                  <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Total bobot harus 100%.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5 md:col-span-2">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                Sinkronisasi Database (Latar Belakang)
              </h3>
              <p className="text-sm text-slate-400">
                Data Anda selalu disimpan secara lokal terlebih dahulu (Offline-First) untuk menjaga performa yang sangat cepat. Anda dapat menghubungkan URL Web App Google Apps Script untuk melakukan pencadangan otomatis tanpa OAuth yang merepotkan.
              </p>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">URL Web App Google Apps Script</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input 
                    type="url" 
                    disabled={role !== 'guru'}
                    name="appsScriptUrl" 
                    value={formData.appsScriptUrl ?? ''} 
                    onChange={handleChange} 
                    placeholder="https://script.google.com/macros/s/AKfyc.../exec"
                    className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50" 
                  />
                  {formData.appsScriptUrl?.trim() && (
                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={handleTestConnection}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 active:bg-emerald-700 text-white font-medium text-sm rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-emerald-600/10 font-sans"
                    >
                      {isTesting ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Menguji...</span>
                        </>
                      ) : (
                        <span>Tes Koneksi</span>
                      )}
                    </button>
                  )}
                </div>

                {/* Realtime Warnings */}
                {(() => {
                  const url = formData.appsScriptUrl?.trim() || '';
                  if (!url) return null;
                  
                  const isSpreadsheetUrl = url.includes('docs.google.com/spreadsheets');
                  const isEditorUrl = url.includes('script.google.com') && !url.includes('/exec');
                  const isInvalidFormat = !url.includes('script.google.com/macros/s/') && !isSpreadsheetUrl && !isEditorUrl;
                  
                  if (isSpreadsheetUrl) {
                    return (
                      <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 space-y-1">
                        <p className="font-semibold flex items-center gap-1.5 text-rose-200">
                          <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Peringatan: Ini URL Google Spreadsheet, Bukan Web App!
                        </p>
                        <p className="text-slate-300 leading-relaxed">
                          Anda memasukkan URL halaman spreadsheet. Agar aplikasi bisa mensinkronkan data, Anda wajib membuat Google Apps Script (lihat menu <strong>Panduan</strong>), men-deploy-nya sebagai <strong>Aplikasi Web (Web App)</strong>, lalu memasukkan <strong>URL Web App</strong> yang berakhiran dengan <code>/exec</code> di sini.
                        </p>
                      </div>
                    );
                  }
                  
                  if (isEditorUrl) {
                    return (
                      <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 space-y-1">
                        <p className="font-semibold flex items-center gap-1.5 text-amber-200">
                          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Peringatan: Ini URL Editor Skrip, Bukan Web App!
                        </p>
                        <p className="text-slate-300 leading-relaxed">
                          URL yang Anda masukkan menuju ke halaman edit kode. Anda harus melakukan deployment terlebih dahulu dengan mengeklik tombol <strong>Terapkan (Deploy) &gt; Deployment Baru</strong> di Google Apps Script, pilih jenis <strong>Aplikasi Web</strong>, atur akses ke <strong>Siapa saja (Anyone)</strong>, lalu klik Terapkan dan salin URL Web App hasil deployment yang berakhiran <code>/exec</code>.
                        </p>
                      </div>
                    );
                  }
                  
                  if (isInvalidFormat) {
                    return (
                      <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 space-y-1">
                        <p className="font-semibold flex items-center gap-1.5 text-rose-200">
                          <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Peringatan: Format URL Web App Tidak Sesuai!
                        </p>
                        <p className="text-slate-300 leading-relaxed">
                          Format URL Web App Google Apps Script yang valid harus berformat seperti berikut:
                        </p>
                        <code className="block p-2 bg-slate-950/80 text-emerald-400 font-mono text-[11px] rounded-lg border border-slate-800 break-all select-all">
                          https://script.google.com/macros/s/AKfyc.../exec
                        </code>
                      </div>
                    );
                  }
                  
                  return null;
                })()}

                <p className="text-[10px] text-slate-500 mt-2">Biarkan kosong jika hanya ingin menggunakan database lokal. Panduan pembuatan Apps Script dapat dilihat di menu Panduan.</p>
              </div>
            </div>

            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-5 md:col-span-2">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                Pencadangan & Pemulihan Manual (Data Master)
              </h3>
              <p className="text-sm text-slate-400">
                Antisipasi kehilangan data dengan mengunduh berkas cadangan (backup) data master secara instan dan realtime ke komputer Anda. Anda dapat memulihkan (import) berkas cadangan kapan saja untuk mengembalikan seluruh data siswa, nilai, dan absensi.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button
                  type="button"
                  onClick={exportMasterBackup}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl font-medium shadow-lg shadow-indigo-600/10 transition-all cursor-pointer"
                >
                  <Download size={18} />
                  Cadangkan (Export JSON)
                </button>
                
                <div className="flex-1 relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={importMasterBackup}
                    id="import-backup-file"
                    className="hidden"
                  />
                  <label
                    htmlFor="import-backup-file"
                    className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 px-5 py-3 rounded-xl font-medium border border-slate-600 cursor-pointer text-center transition-all"
                  >
                    <Upload size={18} />
                    Pulihkan (Import JSON)
                  </label>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                * Catatan: Proses pemulihan data akan memperbarui database lokal Anda saat ini. Pastikan berkas cadangan berasal dari aplikasi ini.
              </p>
            </div>
          </div>

          {role === 'guru' && (
            <div className="pt-6 border-t border-slate-700/50 flex justify-end">
              <button 
                type="submit" 
                disabled={isSaving || (formData.bobot_harian + formData.bobot_tugas + formData.bobot_ujian !== 100)}
                className="flex items-center gap-2 bg-indigo-500 text-white px-6 py-3 rounded-xl hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 font-medium transition-all"
              >
                <Save size={18} />
                Simpan Pengaturan
              </button>
            </div>
          )}
        </form>

        {currentUser && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-6 mt-8 animate-fade-in">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              Informasi Pemulihan Akun Anda
            </h3>
            <p className="text-xs text-slate-400">
              Konfigurasikan email pemulihan dan pertanyaan keamanan Anda di bawah ini agar Anda dapat mereset kata sandi dengan aman jika lupa kredensial login Anda.
            </p>
            <form onSubmit={handleSaveRecovery} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Email Pemulihan</label>
                <input 
                  type="email" 
                  value={userEmail} 
                  onChange={e => setUserEmail(e.target.value)} 
                  placeholder="Contoh: admin@sekolah.sch.id"
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Pertanyaan Keamanan</label>
                <select 
                  value={userQuestion} 
                  onChange={e => setUserQuestion(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all"
                >
                  <option value="Nama SD Pertama Anda?">Nama SD Pertama Anda?</option>
                  <option value="Nama Ibu Kandung Anda?">Nama Ibu Kandung Anda?</option>
                  <option value="Nama Hewan Peliharaan Pertama Anda?">Nama Hewan Peliharaan Pertama Anda?</option>
                  <option value="Kota Kelahiran Anda?">Kota Kelahiran Anda?</option>
                  <option value="Makanan Favorit Anda?">Makanan Favorit Anda?</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Jawaban Keamanan</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={userAnswer} 
                    onChange={e => setUserAnswer(e.target.value)} 
                    placeholder="Masukkan Jawaban Anda"
                    className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                    required
                  />
                  <button 
                    type="submit" 
                    disabled={isSavingRecovery}
                    className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-white font-medium text-sm transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <Save size={16} />
                    Simpan
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {role === 'guru' && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-6 mt-8">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700/50 pb-3">Manajemen Pengguna</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 space-y-4">
                <form onSubmit={handleAddUser} className="space-y-4 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                  <h4 className="text-sm font-medium text-slate-300">Tambah Pengguna</h4>
                  <div>
                    <input type="text" placeholder="Nama Lengkap" value={newName} onChange={e => setNewName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none" required />
                  </div>
                  <div>
                    <input type="text" placeholder="Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none" required />
                  </div>
                  <div>
                    <input type="password" placeholder="Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none" required />
                  </div>
                  <div>
                    <select value={newRole} onChange={e => setNewRole(e.target.value as any)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none">
                      <option value="kepsek">Kepala Sekolah</option>
                      <option value="guru">Guru</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                    <UserPlus size={16} /> Tambah Akun
                  </button>
                </form>
              </div>

              <div className="md:col-span-2">
                <div className="overflow-hidden rounded-xl border border-slate-700">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900/80 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Nama</th>
                        <th className="px-4 py-3 font-medium">Username</th>
                        <th className="px-4 py-3 font-medium">Peran</th>
                        <th className="px-4 py-3 font-medium text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-3 text-slate-200">{u.name}</td>
                          <td className="px-4 py-3 text-slate-400">{u.username}</td>
                          <td className="px-4 py-3 text-slate-400 capitalize">{u.role}</td>
                          <td className="px-4 py-3 text-center flex items-center justify-center gap-1.5">
                            <button 
                              type="button"
                              onClick={() => startEditUser(u)} 
                              className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
                              title="Ubah Pengguna"
                            >
                              <Pencil size={15} />
                            </button>
                            {u.username !== 'admin' && (
                              <button 
                                type="button"
                                onClick={() => handleDeleteUser(u.id, u.username)} 
                                className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
                                title="Hapus Pengguna"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal Confirm Delete User */}
        {userToDelete && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-medium text-slate-200 mb-4">Hapus Pengguna</h3>
              <p className="text-sm text-slate-300 mb-4">
                Apakah Anda yakin ingin menghapus pengguna <span className="font-bold text-rose-400">{userToDelete.name}</span>? 
                Aksi ini tidak dapat dibatalkan.
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setUserToDelete(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleConfirmDeleteUser}
                  className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-rose-500/20 transition-colors"
                >
                  Hapus Pengguna
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Modal Edit User */}
        {editingUser && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form onSubmit={handleSaveEditUser} className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-700/50 pb-3">
                <h3 className="text-lg font-medium text-slate-200">Ubah Akun: @{editingUser.username}</h3>
                <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Nama Lengkap</label>
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                    required 
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Password Baru (kosongkan jika tidak diubah)</label>
                  <input 
                    type="password" 
                    value={editPassword} 
                    onChange={e => setEditPassword(e.target.value)} 
                    placeholder="Masukkan sandi baru jika ingin diubah"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                  />
                </div>

                {editingUser.username !== 'admin' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Peran (Role)</label>
                    <select 
                      value={editRole} 
                      onChange={e => setEditRole(e.target.value as any)} 
                      className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="kepsek">Kepala Sekolah</option>
                      <option value="guru">Guru (Admin)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-700/50">
                <button 
                  type="button" 
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Save size={16} />
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
