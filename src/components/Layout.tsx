import React, { useState, useEffect } from 'react';
import { Users, FileSpreadsheet, CheckSquare, Settings as SettingsIcon, LogOut, Cloud, LayoutDashboard, School, HelpCircle, Download, Menu, X, Sun, Moon, Calendar, ClipboardList, BookOpen, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import Dashboard from '../pages/Dashboard';
import DataSiswa from '../pages/DataSiswa';
import Nilai from '../pages/Nilai';
import Absensi from '../pages/Absensi';
import ManajemenTugas from '../pages/ManajemenTugas';
import RosterPiket from '../pages/RosterPiket';
import Pengaturan from '../pages/Pengaturan';
import IdentitasSekolah from '../pages/IdentitasSekolah';
import Panduan from '../pages/Panduan';
import EksporTerpadu from '../pages/EksporTerpadu';
import Rapor from '../pages/Rapor';
import Dokumentasi from '../pages/Dokumentasi';
import NotifikasiWA from '../pages/NotifikasiWA';
import { Settings, AppUser, store } from '../lib/store';
import toast from 'react-hot-toast';

interface LayoutProps {
  user: AppUser;
  role: 'guru' | 'kepsek';
  onLogout: () => void;
  syncData: () => Promise<void>;
  onFullBackup?: () => Promise<void>;
  onPullData?: () => Promise<void>;
  isSyncing: boolean;
  hasUnsyncedChanges?: boolean;
  settings: Settings | null;
  setSettings: (s: Settings | null) => void;
  syncStats?: {
    percentage: number;
    unsyncedCount: number;
    syncedCount: number;
    totalItems: number;
    queueItems: { store: string; id: string; action: string }[];
  };
  lastSynced?: Date | null;
}

export default function Layout({ 
  user, 
  role, 
  onLogout, 
  syncData, 
  onFullBackup,
  onPullData,
  isSyncing, 
  hasUnsyncedChanges, 
  settings, 
  setSettings, 
  syncStats,
  lastSynced
}: LayoutProps) {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLightMode, setIsLightMode] = useState(false);
  const [isAddingSemester, setIsAddingSemester] = useState(false);
  const [newSemesterName, setNewSemesterName] = useState('');
  const [isSyncDropdownOpen, setIsSyncDropdownOpen] = useState(false);
  const [isPengelolaanKelasExpanded, setIsPengelolaanKelasExpanded] = useState(true);

  const handleLocalBackup = async () => {
    try {
      const backupData: any = {
        app: 'EduSync',
        version: '1.0.0',
        backup_date: new Date().toISOString(),
        students: [],
        grades: [],
        attendance: [],
        users: []
      };

      await store.students.iterate((v) => { backupData.students.push(v); });
      await store.grades.iterate((v) => { backupData.grades.push(v); });
      await store.attendance.iterate((v) => { backupData.attendance.push(v); });
      await store.users.iterate((v) => { backupData.users.push(v); });
      backupData.settings = await store.settings.getItem('app_settings');

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.setAttribute("download", `Backup_DataMaster_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success('Backup data master (JSON) berhasil diunduh!');
    } catch (err: any) {
      toast.error('Gagal mengekspor data backup: ' + err.message);
    }
  };

  const handleConfirmAddSemester = async () => {
    if (!settings || !newSemesterName.trim()) return;
    const name = newSemesterName.trim();
    const list = settings.daftar_semester || ['Ganjil 2026', 'Genap 2026'];
    if (list.includes(name)) {
      toast.error('Semester sudah ada');
      return;
    }
    const newList = [...list, name];
    const newSettings = { ...settings, daftar_semester: newList, semester_aktif: name };
    setSettings(newSettings);
    await store.settings.setItem('app_settings', newSettings);
    toast.success(`Semester ${name} berhasil ditambahkan dan diaktifkan`);
    setIsAddingSemester(false);
  };

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [isLightMode]);

  const coreMenus = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const pengelolaanMenus = [
    { id: 'siswa', label: 'Data Siswa', icon: Users },
    { id: 'absensi', label: 'Absensi', icon: CheckSquare },
    { id: 'nilai', label: 'Nilai', icon: FileSpreadsheet },
    { id: 'tugas', label: 'Manajemen Tugas', icon: ClipboardList },
    { id: 'roster_piket', label: 'Roster & Piket', icon: Calendar },
    { id: 'notifikasi_wa', label: 'Notifikasi WA', icon: MessageSquare },
  ];

  const reportMenus = [
    { id: 'rapor', label: 'Rapor (PDF)', icon: Download },
    { id: 'ekspor', label: 'Ekspor Terpadu', icon: Download },
  ];

  const systemMenus = [
    ...(role === 'guru' ? [
      { id: 'identitas', label: 'Identitas Sekolah', icon: School },
      { id: 'pengaturan', label: 'Pengaturan', icon: SettingsIcon },
    ] : []),
    { id: 'dokumentasi', label: 'Dokumentasi', icon: BookOpen },
    ...(role === 'guru' ? [
      { id: 'panduan', label: 'Panduan', icon: HelpCircle },
    ] : []),
  ];

  const allMenus = [...coreMenus, ...pengelolaanMenus, ...reportMenus, ...systemMenus];

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans relative">
      {/* Subtle Grid Overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.05)_0%,transparent_100%)] z-0"></div>
      
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-0 opacity-0 overflow-hidden'} transition-all duration-300 ease-in-out bg-slate-800/50 backdrop-blur-xl border-r border-slate-700/50 flex flex-col justify-between z-10 relative shrink-0`}>
        <div className="w-64 flex flex-col h-[calc(100vh-120px)] overflow-hidden">
          <div className="p-6 shrink-0">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Cloud className="text-white w-5 h-5" />
              </div>
              <span className="tracking-tight">Administrasi Kelas</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 pl-10">{settings?.nama_sekolah || 'Nama Sekolah Belum Diatur'}</p>
          </div>
          
          <nav className="px-4 space-y-1.5 flex-1 overflow-y-auto custom-scrollbar pb-6">
            {/* Group 1: Utama */}
            {coreMenus.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveMenu(m.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-all cursor-pointer ${
                    activeMenu === m.id 
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium' 
                      : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-100 border border-transparent'
                  }`}
                >
                  <Icon size={16} className={activeMenu === m.id ? 'opacity-80' : 'opacity-60'} />
                  {m.label}
                </button>
              );
            })}

            {/* Group 2: Pengelolaan Kelas (Collapsible) */}
            <div className="pt-2">
              <button
                onClick={() => setIsPengelolaanKelasExpanded(!isPengelolaanKelasExpanded)}
                className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold text-indigo-400/80 hover:text-indigo-300 uppercase tracking-wider text-left transition-all cursor-pointer select-none"
              >
                <span>Pengelolaan Kelas</span>
                {isPengelolaanKelasExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              {isPengelolaanKelasExpanded && (
                <div className="pl-3 border-l border-slate-700/50 ml-3 space-y-1.5 mt-1 mb-2">
                  {pengelolaanMenus.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setActiveMenu(m.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                          activeMenu === m.id 
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium' 
                            : 'text-slate-400 hover:bg-slate-700/35 hover:text-slate-100 border border-transparent'
                        }`}
                      >
                        <Icon size={14} className={activeMenu === m.id ? 'opacity-80' : 'opacity-60'} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Group 3: Laporan & Cadangan */}
            <div className="pt-2">
              <div className="px-4 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                Laporan & Cadangan
              </div>
              <div className="space-y-1.5">
                {reportMenus.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setActiveMenu(m.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-all cursor-pointer ${
                        activeMenu === m.id 
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium' 
                          : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-100 border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={activeMenu === m.id ? 'opacity-80' : 'opacity-60'} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group 4: Sistem & Bantuan */}
            <div className="pt-2">
              <div className="px-4 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                Sistem & Bantuan
              </div>
              <div className="space-y-1.5">
                {systemMenus.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setActiveMenu(m.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-all cursor-pointer ${
                        activeMenu === m.id 
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium' 
                          : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-100 border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={activeMenu === m.id ? 'opacity-80' : 'opacity-60'} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>

        <div className="p-6 mt-auto space-y-3 w-64">
          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 uppercase">
              {user.name ? user.name.substring(0, 2) : user.username.substring(0, 2)}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-medium text-slate-200 truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{role === 'kepsek' ? 'Kepala Sekolah' : 'Guru Kelas'}</p>
            </div>
          </div>
          
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-rose-400 border border-transparent hover:border-rose-500/30 hover:bg-rose-500/10 rounded-lg text-xs transition-colors mt-2"
          >
            <LogOut size={14} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10 min-w-0">
        <header className="h-20 bg-slate-900/40 backdrop-blur-md border-b border-slate-700/50 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-3">
              {allMenus.find(m => m.id === activeMenu)?.label}
              {role === 'kepsek' && <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Mode Baca Saja</span>}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-medium tracking-wider uppercase">
              <span>Semester Aktif:</span>
              <select 
                value={settings?.semester_aktif || ''}
                onChange={async (e) => {
                  if (!settings) return;
                  if (e.target.value === 'ADD_NEW') {
                    setNewSemesterName('');
                    setIsAddingSemester(true);
                  } else {
                    const newSettings = { ...settings, semester_aktif: e.target.value };
                    setSettings(newSettings);
                    await store.settings.setItem('app_settings', newSettings);
                  }
                }}
                className="bg-transparent border-none text-indigo-400 focus:ring-0 outline-none cursor-pointer appearance-none px-0 font-bold"
              >
                {(settings?.daftar_semester || ['Ganjil 2026', 'Genap 2026']).map(sem => (
                  <option key={sem} value={sem} className="bg-slate-800 text-slate-200">{sem}</option>
                ))}
                <option value="ADD_NEW" className="bg-slate-800 text-emerald-400 font-bold">+ Tambah Semester...</option>
              </select>
              <span className="text-slate-600">•</span>
              <span>Kelas: {settings?.nama_kelas || '-'}</span>
            </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsLightMode(!isLightMode)}
              className="p-2 rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-600 transition-all flex items-center justify-center"
              title={isLightMode ? "Ubah ke Dark Mode" : "Ubah ke Light Mode"}
            >
              {isLightMode ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            {settings?.appsScriptUrl && (
              <div className="relative">
                {/* Trigger button */}
                <div 
                  onClick={() => setIsSyncDropdownOpen(!isSyncDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-full cursor-pointer transition-all select-none"
                  title="Detail Sinkronisasi & Backup"
                >
                  {syncStats && syncStats.unsyncedCount > 0 ? (
                    <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                      </span>
                      <span>{syncStats.unsyncedCount} Perubahan</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>{syncStats ? `${syncStats.percentage}%` : '100%'} Sinkron</span>
                    </div>
                  )}
                  
                  <span className="text-slate-600 text-xs">|</span>
                  
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full bg-indigo-400 ${isSyncing ? 'animate-ping' : ''}`}></span>
                    <span>{isSyncing ? 'Sinkronisasi...' : 'Menu Sync'}</span>
                  </div>
                </div>

                {/* Dropdown panel */}
                {isSyncDropdownOpen && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setIsSyncDropdownOpen(false)} />
                    
                    <div className="absolute right-0 mt-3 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-5 shadow-2xl z-50 text-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-700/60 pb-3 mb-4">
                        <div className="flex items-center gap-2">
                          <Cloud size={16} className="text-indigo-400" />
                          <span className="font-semibold text-sm">Status Sinkronisasi</span>
                        </div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                          Google Sheet
                        </span>
                      </div>

                      {/* Progress Bar & percentage */}
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-400">Kemajuan Sinkronisasi</span>
                          <span className="text-emerald-400">{syncStats ? `${syncStats.percentage}%` : '100%'}</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/40">
                          <div 
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${syncStats ? syncStats.percentage : 100}%` }} 
                          />
                        </div>
                      </div>

                      {/* Detailed Stats */}
                      <div className="bg-slate-800/40 border border-slate-800/80 rounded-xl p-3 space-y-2 mb-4 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Baris Data:</span>
                          <span className="font-semibold text-slate-200">{syncStats?.totalItems || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Data Tersinkron:</span>
                          <span className="font-semibold text-emerald-400">{syncStats?.syncedCount || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Antrean Perubahan:</span>
                          <span className={`font-semibold ${syncStats && syncStats.unsyncedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                            {syncStats?.unsyncedCount || 0} item
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800/80 pt-2 mt-1">
                          <span className="text-slate-400">Waktu Sinkron:</span>
                          <span className="font-medium text-indigo-300">
                            {lastSynced ? lastSynced.toLocaleTimeString('id-ID') : 'Belum sinkron'}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="space-y-2 text-xs">
                        <button
                          onClick={async () => {
                            await syncData();
                            setIsSyncDropdownOpen(false);
                          }}
                          disabled={isSyncing}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl text-left text-slate-200 font-medium transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                          </span>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-100">Sinkronisasi Delta</p>
                            <p className="text-[10px] text-slate-400">Hanya unggah perubahan terakhir</p>
                          </div>
                        </button>

                        {role === 'guru' && onFullBackup && (
                          <button
                            onClick={async () => {
                              await onFullBackup();
                              setIsSyncDropdownOpen(false);
                            }}
                            disabled={isSyncing}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded-xl text-left text-indigo-300 font-medium transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Cloud size={16} className="text-indigo-400" />
                            <div className="flex-1">
                              <p className="font-semibold text-indigo-200">Cadangkan Penuh ke Cloud</p>
                              <p className="text-[10px] text-indigo-400/80">Salin seluruh database ke Google Sheets</p>
                            </div>
                          </button>
                        )}

                        {role === 'guru' && onPullData && (
                          <button
                            onClick={async () => {
                              if (confirm('Apakah Anda yakin ingin mengambil seluruh data dari Google Sheets? Perubahan lokal yang belum sinkron akan tertimpa.')) {
                                await onPullData();
                                setIsSyncDropdownOpen(false);
                              }
                            }}
                            disabled={isSyncing}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 rounded-xl text-left text-emerald-300 font-medium transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Cloud size={16} className="text-emerald-400" />
                            <div className="flex-1">
                              <p className="font-semibold text-emerald-200">Ambil Data dari Cloud</p>
                              <p className="text-[10px] text-emerald-400/80">Pulihkan/timpa dari Google Sheets</p>
                            </div>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            handleLocalBackup();
                            setIsSyncDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/30 rounded-xl text-left text-slate-300 transition-all cursor-pointer"
                        >
                          <Download size={14} className="text-slate-400" />
                          <span className="font-medium text-[11px]">Unduh File Backup (JSON Lokal)</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <Cloud size={14} className={isSyncing ? 'animate-bounce' : ''} />
              <span>Offline-First</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto">
          <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 backdrop-blur-sm min-h-full overflow-hidden">
            {activeMenu === 'dashboard' && (
              <Dashboard 
                semester={settings?.semester_aktif || ''} 
                syncData={syncData} 
                onPullData={onPullData} 
                isSyncing={isSyncing} 
              />
            )}
            {activeMenu === 'siswa' && <DataSiswa role={role} settings={settings} setSettings={setSettings} semester={settings?.semester_aktif || ''} />}
            {activeMenu === 'notifikasi_wa' && <NotifikasiWA role={role} />}
            {activeMenu === 'nilai' && <Nilai role={role} semester={settings?.semester_aktif || ''} settings={settings} setSettings={setSettings} />}
            {activeMenu === 'absensi' && <Absensi role={role} semester={settings?.semester_aktif || ''} settings={settings} setSettings={setSettings} />}
            {activeMenu === 'tugas' && <ManajemenTugas role={role} semester={settings?.semester_aktif || ''} settings={settings} />}
            {activeMenu === 'roster_piket' && (
              <RosterPiket 
                role={role} 
                semester={settings?.semester_aktif || ''} 
                settings={settings} 
                syncData={syncData}
                isSyncing={isSyncing}
              />
            )}
            {activeMenu === 'rapor' && <Rapor role={role} settings={settings} setSettings={setSettings} semester={settings?.semester_aktif || ''} />}
            {activeMenu === 'ekspor' && <EksporTerpadu settings={settings} />}
            {activeMenu === 'identitas' && role === 'guru' && <IdentitasSekolah settings={settings} setSettings={setSettings} />}
            {activeMenu === 'pengaturan' && role === 'guru' && <Pengaturan role={role} settings={settings} setSettings={setSettings} currentUser={user} />}
            {activeMenu === 'dokumentasi' && <Dokumentasi />}
            {activeMenu === 'panduan' && role === 'guru' && <Panduan />}
          </div>
        </div>
      </main>

      {/* Modal Add Semester */}
      {isAddingSemester && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-medium text-slate-200 mb-4">Tambah Semester Baru</h3>
            <p className="text-sm text-slate-400 mb-4">Masukkan nama semester baru untuk ditambahkan dan diaktifkan:</p>
            <input 
              type="text"
              autoFocus
              value={newSemesterName}
              onChange={e => setNewSemesterName(e.target.value)}
              placeholder="Contoh: Ganjil 2027"
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all mb-6"
            />
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setIsAddingSemester(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleConfirmAddSemester}
                disabled={!newSemesterName.trim()}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-colors disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
