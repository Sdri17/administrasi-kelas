import React, { useEffect, useState, useRef } from 'react';
import { store, initializeStore, Settings, AppUser } from './lib/store';
import Layout from './components/Layout';
import Loading from './components/Loading';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { pushDataToSheets, pullDataFromSheets, getSyncStats, validateStudentData } from './lib/sync';

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<'guru' | 'kepsek' | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Login credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Forgot Password state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [foundRecoveryUser, setFoundRecoveryUser] = useState<AppUser | null>(null);
  const [recoveryMethod, setRecoveryMethod] = useState<'question' | 'email'>('question');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [enteredEmail, setEnteredEmail] = useState('');
  const [sentOtp, setSentOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpSentStatus, setOtpSentStatus] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'username' | 'verify' | 'reset'>('username');

  // Background/Manual Synchronization status
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const isSyncingRef = useRef(false);
  const [syncStats, setSyncStats] = useState({
    percentage: 100,
    unsyncedCount: 0,
    syncedCount: 0,
    totalItems: 0,
    queueItems: [] as { store: string; id: string; action: string }[]
  });

  const loadSyncStats = async () => {
    const statsObj = await getSyncStats();
    setSyncStats(statsObj);
  };

  useEffect(() => {
    loadSyncStats();
    window.addEventListener('data-changed', loadSyncStats);
    window.addEventListener('sync-status-changed', loadSyncStats);
    return () => {
      window.removeEventListener('data-changed', loadSyncStats);
      window.removeEventListener('sync-status-changed', loadSyncStats);
    };
  }, []);

  useEffect(() => {
    const handleDataChange = () => setHasUnsyncedChanges(true);
    window.addEventListener('data-changed', handleDataChange);
    return () => window.removeEventListener('data-changed', handleDataChange);
  }, []);

  const runBackgroundSync = async () => {
    if (isSyncingRef.current || !settings?.appsScriptUrl) return;
    isSyncingRef.current = true;
    try {
      await pushDataToSheets(settings.appsScriptUrl);
      setLastSynced(new Date());
      setHasUnsyncedChanges(false);
      console.log('Background Sync: Berhasil disinkronkan ke Google Sheet pada', new Date().toLocaleTimeString());
    } catch (err: any) {
      console.warn('Background Sync: Gagal melakukan sinkronisasi otomatis', err.message);
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Background Sync Engine (Offline-First to Sheet sync in background with 3-second debounce or immediate trigger)
  useEffect(() => {
    if (!user || !settings?.appsScriptUrl) return;

    let syncTimeout: NodeJS.Timeout;

    // Trigger sync automatically 3 seconds after the user stops making modifications
    if (hasUnsyncedChanges) {
      syncTimeout = setTimeout(() => {
        runBackgroundSync();
      }, 3000);
    }

    const handleOnline = () => {
      if (hasUnsyncedChanges) {
        runBackgroundSync();
      }
    };

    const handleImmediateSync = () => {
      runBackgroundSync();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('trigger-immediate-sync', handleImmediateSync);

    return () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('trigger-immediate-sync', handleImmediateSync);
    };
  }, [user, settings?.appsScriptUrl, hasUnsyncedChanges]);

  const handleManualSync = async () => {
    if (!settings?.appsScriptUrl) {
      toast.error('Atur URL Apps Script terlebih dahulu di menu Pengaturan');
      return;
    }
    if (isSyncingRef.current) {
      toast.error('Sinkronisasi sedang berjalan...');
      return;
    }

    // Run critical data validation before manual sync
    const isValid = await validateStudentData();
    if (!isValid) {
      return; // Abort operation on validation failure
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      await pushDataToSheets(settings.appsScriptUrl);
      setLastSynced(new Date());
      setHasUnsyncedChanges(false);
      toast.success('Sinkronisasi data ke Google Sheets berhasil!');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal melakukan sinkronisasi: ' + err.message);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  const handleFullBackupSheets = async () => {
    if (!settings?.appsScriptUrl) {
      toast.error('Atur URL Apps Script terlebih dahulu di menu Pengaturan');
      return;
    }
    if (isSyncingRef.current) {
      toast.error('Sinkronisasi sedang berjalan...');
      return;
    }

    // Run critical data validation before full backup
    const isValid = await validateStudentData();
    if (!isValid) {
      return; // Abort operation on validation failure
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      await pushDataToSheets(settings.appsScriptUrl, true);
      setLastSynced(new Date());
      setHasUnsyncedChanges(false);
      toast.success('Pencadangan penuh seluruh data ke Google Sheets berhasil!');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal melakukan pencadangan penuh: ' + err.message);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  const handlePullDataSheets = async () => {
    if (!settings?.appsScriptUrl) {
      toast.error('Atur URL Apps Script terlebih dahulu di menu Pengaturan');
      return;
    }
    if (isSyncingRef.current) {
      toast.error('Sinkronisasi sedang berjalan...');
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const syncResult = await pullDataFromSheets(settings.appsScriptUrl);
      
      // Load updated settings from store to refresh React state
      const currentSettings = await store.settings.getItem<Settings>('app_settings');
      if (currentSettings) {
        setSettings(currentSettings);
      }
      
      setLastSynced(new Date());
      setHasUnsyncedChanges(false);
      
      // Dispatch data-changed and sync-status-changed events so all UI pages refresh
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('sync-status-changed'));
      
      if (syncResult) {
        toast.success(
          `Berhasil mengambil & memulihkan data dari Google Sheets! ${syncResult.totalCount} item diunduh, ${syncResult.percentage}% data sukses disimpan ke IndexedDB.`,
          { duration: 6000 }
        );
      } else {
        toast.success('Berhasil mengambil & memulihkan data dari Google Sheets!');
      }
    } catch (err: any) {
      console.error('[App] Gagal mengambil data dari Google Sheets:', err);
      toast.error('Gagal mengambil data dari Google Sheets: ' + err.message);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    setIsInitializing(true);
    try {
      await initializeStore();
      
      // Ensure default guru admin exists with recovery settings
      let hasAdmin = false;
      await store.users.iterate((u: AppUser) => {
        if (u.username === 'admin') hasAdmin = true;
      });
      if (!hasAdmin) {
        await store.users.setItem('admin', { 
          id: 'admin', 
          username: 'admin', 
          password: 'admin', 
          role: 'guru', 
          name: 'Admin Guru',
          pertanyaan_keamanan: 'Nama SD Pertama Anda?',
          jawaban_keamanan: 'sd',
          email_pemulihan: 'admin@edusync.id'
        });
      }

      const currentSettings = await store.settings.getItem<Settings>('app_settings');
      setSettings(currentSettings);
      
      const savedUser = localStorage.getItem('app_user');
      if (savedUser) {
        const u = JSON.parse(savedUser) as AppUser;
        setUser(u);
        setRole(u.role);
      }
    } catch (e) {
      console.error('Initialization error:', e);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    let foundUser: AppUser | null = null;
    await store.users.iterate((u: AppUser) => {
      if (u.username === username && u.password === password) {
        foundUser = u;
      }
    });

    if (foundUser) {
      const u = foundUser as AppUser;
      setUser(u);
      setRole(u.role);
      localStorage.setItem('app_user', JSON.stringify(u));
      toast.success(`Selamat datang, ${u.name}`);
    } else {
      toast.error('Username atau password salah');
    }
  };

  // Find user for recovery
  const handleFindRecoveryUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      toast.error('Silakan masukkan username');
      return;
    }

    let found: AppUser | null = null;
    await store.users.iterate((u: AppUser) => {
      if (u.username.toLowerCase() === forgotUsername.toLowerCase()) {
        found = u;
      }
    });

    if (found) {
      const u = found as AppUser;
      setFoundRecoveryUser(u);
      setRecoveryStep('verify');
      setRecoveryMethod(u.pertanyaan_keamanan ? 'question' : 'email');
      setSecurityAnswer('');
      setEnteredEmail('');
      setSentOtp('');
      setEnteredOtp('');
      setOtpSentStatus(false);
    } else {
      toast.error('Username tidak ditemukan');
    }
  };

  // Simulate sending recovery email OTP
  const handleSendEmailOtp = () => {
    if (!foundRecoveryUser) return;
    const targetEmail = foundRecoveryUser.email_pemulihan || 'admin@edusync.id';
    
    // Validate if they enter their email for secure confirmation
    if (!enteredEmail.trim()) {
      toast.error('Silakan masukkan alamat email pemulihan terdaftar untuk konfirmasi');
      return;
    }

    if (enteredEmail.toLowerCase().trim() !== targetEmail.toLowerCase().trim()) {
      toast.error('Alamat email pemulihan tidak cocok!');
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setSentOtp(otp);
    setOtpSentStatus(true);
    
    // Show OTP in toaster realistically for simulated local environment
    toast.success(`OTP dikirim ke ${targetEmail}. Kode: ${otp}`, { duration: 10000 });
  };

  // Verify recovery credentials
  const handleVerifyRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundRecoveryUser) return;

    if (recoveryMethod === 'question') {
      const actualAnswer = foundRecoveryUser.jawaban_keamanan || 'sd';
      if (securityAnswer.toLowerCase().trim() === actualAnswer.toLowerCase().trim()) {
        setRecoveryStep('reset');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        toast.error('Jawaban pertanyaan keamanan salah!');
      }
    } else {
      if (!sentOtp) {
        toast.error('Silakan kirim kode OTP terlebih dahulu');
        return;
      }
      if (enteredOtp.trim() === sentOtp) {
        setRecoveryStep('reset');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        toast.error('Kode OTP salah atau tidak valid');
      }
    }
  };

  // Reset the password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundRecoveryUser) return;

    if (newPassword.length < 4) {
      toast.error('Password minimal 4 karakter');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error('Konfirmasi password tidak cocok');
      return;
    }

    const updatedUser: AppUser = {
      ...foundRecoveryUser,
      password: newPassword
    };

    await store.users.setItem(updatedUser.id, updatedUser);
    toast.success('Password berhasil diperbarui! Silakan masuk.');
    
    // Clean up recovery states and go back
    setIsForgotPassword(false);
    setFoundRecoveryUser(null);
    setRecoveryStep('username');
    setForgotUsername('');
    setUsername(updatedUser.username);
    setPassword('');
  };

  const logout = () => {
    setUser(null);
    setRole(null);
    localStorage.removeItem('app_user');
  };

  if (isInitializing) {
    return <Loading text="Memuat Aplikasi..." />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 relative font-sans">
        <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' } }} />
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.05)_0%,transparent_100%)]"></div>
        <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700/50 backdrop-blur-sm max-w-md w-full space-y-6 relative z-10 shadow-2xl">
          <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center">Selamat Datang</h1>
          <p className="text-slate-400 mb-8 text-sm text-center">Sistem Informasi Manajemen Kelas Terpadu</p>
          
          {!isForgotPassword ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => { setIsForgotPassword(true); setRecoveryStep('username'); }} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  Lupa Password?
                </button>
              </div>
              <button type="submit" className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/20 transition-colors mt-2">
                Masuk
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-700/50 pb-2">
                <h3 className="font-semibold text-slate-200 text-sm">Lupa Password</h3>
                <button onClick={() => setIsForgotPassword(false)} className="text-xs text-slate-400 hover:text-slate-200">Batal</button>
              </div>

              {recoveryStep === 'username' && (
                <form onSubmit={handleFindRecoveryUser} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Masukkan Username</label>
                    <input type="text" value={forgotUsername} onChange={e => setForgotUsername(e.target.value)} placeholder="Contoh: admin" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors">
                    Verifikasi Akun
                  </button>
                </form>
              )}

              {recoveryStep === 'verify' && foundRecoveryUser && (
                <form onSubmit={handleVerifyRecovery} className="space-y-4">
                  <div className="text-xs text-slate-400 mb-2">
                    Akun: <span className="font-semibold text-slate-200">{foundRecoveryUser.name} ({foundRecoveryUser.username})</span>
                  </div>

                  {foundRecoveryUser.pertanyaan_keamanan && foundRecoveryUser.email_pemulihan && (
                    <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-700/50 text-xs mb-3">
                      <button type="button" onClick={() => setRecoveryMethod('question')} className={`flex-1 py-1.5 rounded-lg text-center font-medium transition-all ${recoveryMethod === 'question' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                        Pertanyaan Keamanan
                      </button>
                      <button type="button" onClick={() => setRecoveryMethod('email')} className={`flex-1 py-1.5 rounded-lg text-center font-medium transition-all ${recoveryMethod === 'email' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                        Email Pemulihan
                      </button>
                    </div>
                  )}

                  {recoveryMethod === 'question' ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-slate-900/30 border border-slate-700/40 rounded-xl">
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Pertanyaan Keamanan:</p>
                        <p className="text-sm font-medium text-slate-200">{foundRecoveryUser.pertanyaan_keamanan || 'Nama SD Pertama Anda?'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Jawaban Anda</label>
                        <input type="text" value={securityAnswer} onChange={e => setSecurityAnswer(e.target.value)} placeholder="Masukkan jawaban" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-slate-900/30 border border-slate-700/40 rounded-xl text-xs">
                        <p className="text-slate-400 uppercase tracking-wider mb-1">Email Terdaftar:</p>
                        <p className="font-medium text-slate-200">
                          {(() => {
                            const email = foundRecoveryUser.email_pemulihan || 'admin@edusync.id';
                            const [userPart, domainPart] = email.split('@');
                            return `${userPart[0]}***${userPart[userPart.length - 1] || ''}@${domainPart}`;
                          })()}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Ketik Ulang Email Pemulihan Lengkap</label>
                        <div className="flex gap-2">
                          <input type="email" value={enteredEmail} onChange={e => setEnteredEmail(e.target.value)} placeholder="admin@edusync.id" className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required={recoveryMethod === 'email'} />
                          <button type="button" onClick={handleSendEmailOtp} className="px-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-xs font-semibold text-white transition-all whitespace-nowrap">
                            Kirim OTP
                          </button>
                        </div>
                      </div>

                      {otpSentStatus && (
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Kode OTP (6 Digit)</label>
                          <input type="text" maxLength={6} value={enteredOtp} onChange={e => setEnteredOtp(e.target.value)} placeholder="Masukkan kode OTP" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
                        </div>
                      )}
                    </div>
                  )}

                  <button type="submit" className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors">
                    Lanjutkan Reset
                  </button>
                </form>
              )}

              {recoveryStep === 'reset' && foundRecoveryUser && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Password Baru</label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Konfirmasi Password Baru</label>
                    <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" required />
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors">
                    Perbarui Password
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' } }} />
      <Layout 
        user={user as any} 
        role={role || 'guru'}
        onLogout={logout} 
        syncData={handleManualSync} 
        onFullBackup={handleFullBackupSheets}
        onPullData={handlePullDataSheets}
        isSyncing={isSyncing} 
        settings={settings}
        setSettings={setSettings}
        hasUnsyncedChanges={hasUnsyncedChanges}
        syncStats={syncStats}
        lastSynced={lastSynced}
      />
    </>
  );
}
