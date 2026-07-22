import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Users, User, CheckSquare, FileSpreadsheet, 
  ClipboardList, Send, Copy, Save, Phone, Info, Search, Share2, Settings as SettingsIcon,
  ExternalLink, Sliders, RefreshCw, AlertCircle
} from 'lucide-react';
import { store, Student, Grade, Attendance, StudentTask, Settings } from '../lib/store';
import { 
  WhatsAppSenderService, 
  DEFAULT_TEMPLATES, 
  INDIVIDUAL_PLACEHOLDERS, 
  GROUP_PLACEHOLDERS 
} from '../lib/WhatsAppSender';
import toast from 'react-hot-toast';

export default function NotifikasiWA({ role = 'guru' }: { role?: 'guru' | 'kepsek' }) {
  const [activeTab, setActiveTab] = useState<'individual' | 'group'>('individual');
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);

  // Selection states
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  // Individual Template states
  const [individualTemplate, setIndividualTemplate] = useState<'nilai' | 'absen' | 'tugas' | 'pr_tugas' | 'kustom'>('nilai');
  const [individualCustomText, setIndividualCustomText] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTaskForIndividual, setSelectedTaskForIndividual] = useState<string>('');
  
  // Group Template states
  const [selectedGroupClass, setSelectedGroupClass] = useState('');
  const [groupTemplate, setGroupTemplate] = useState<'rekap_absen' | 'tugas_pending' | 'pr_tugas' | 'pengumuman'>('rekap_absen');
  const [groupCustomTitle, setGroupCustomTitle] = useState('PEMBERITAHUAN');
  const [groupCustomText, setGroupCustomText] = useState('');
  const [selectedTaskForGroup, setSelectedTaskForGroup] = useState<string>('');
  const [groupDate, setGroupDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [savedGroupLinks, setSavedGroupLinks] = useState<Record<string, string>>({});
  const [newGroupLinkInput, setNewGroupLinkInput] = useState('');

  // Advanced Dynamic Template states
  const [individualTemplateText, setIndividualTemplateText] = useState('');
  const [groupTemplateText, setGroupTemplateText] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showPlaceholderGuide, setShowPlaceholderGuide] = useState(false);

  // Textarea references for caret insertion
  const indTextareaRef = useRef<HTMLTextAreaElement>(null);
  const grpTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Generated Messages
  const [generatedMessage, setGeneratedMessage] = useState('');

  // Initial Load
  useEffect(() => {
    loadData();
    // Watch for changes
    const handleDataChange = () => loadData();
    window.addEventListener('data-changed', handleDataChange);
    return () => window.removeEventListener('data-changed', handleDataChange);
  }, []);

  const loadData = async () => {
    // Load students
    const sList: Student[] = [];
    await store.students.iterate<Student, void>((s) => {
      sList.push(s);
    });
    setStudents(sList.sort((a, b) => a.nama.localeCompare(b.nama)));

    // Extract unique classes
    const classes = Array.from(new Set(sList.map(s => s.kelas).filter(Boolean))) as string[];
    setUniqueClasses(classes.sort());

    // Load grades
    const gList: Grade[] = [];
    await store.grades.iterate<Grade, void>((g) => {
      gList.push(g);
    });
    setGrades(gList);

    // Load attendance
    const aList: Attendance[] = [];
    await store.attendance.iterate<Attendance, void>((a) => {
      aList.push(a);
    });
    setAttendance(aList);

    // Load tasks
    const tList: StudentTask[] = [];
    await store.tasks.iterate<StudentTask, void>((t) => {
      tList.push(t);
    });
    setTasks(tList);

    // Load settings
    const currentSettings = await store.settings.getItem<Settings>('app_settings');
    if (currentSettings) {
      setSettings(currentSettings);
      if (currentSettings.nama_kelas && !selectedClass) {
        setSelectedClass(currentSettings.nama_kelas);
        setSelectedGroupClass(currentSettings.nama_kelas);
      }
      if (currentSettings.wa_group_links) {
        setSavedGroupLinks(currentSettings.wa_group_links as Record<string, string>);
      }
    }
  };

  // Set defaults when selecting student
  useEffect(() => {
    if (selectedStudent) {
      setEditedPhone(selectedStudent.no_telp_ortu || selectedStudent.nomor_telepon || '');
      if (settings?.mata_pelajaran && settings.mata_pelajaran.length > 0 && !selectedSubject) {
        setSelectedSubject(settings.mata_pelajaran[0]);
      }
    }
  }, [selectedStudent]);

  // Synchronize individual template selector to textarea
  useEffect(() => {
    let templateId = '';
    if (individualTemplate === 'nilai') templateId = 'ind_nilai';
    else if (individualTemplate === 'absen') templateId = 'ind_absen';
    else if (individualTemplate === 'tugas') templateId = 'ind_tugas';
    else if (individualTemplate === 'pr_tugas') templateId = 'ind_pr_tugas';
    else templateId = 'ind_kustom';

    const found = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    if (found) {
      setIndividualTemplateText(found.content);
    }
  }, [individualTemplate]);

  // Synchronize group template selector to textarea
  useEffect(() => {
    let templateId = '';
    if (groupTemplate === 'rekap_absen') templateId = 'grp_absen';
    else if (groupTemplate === 'tugas_pending') templateId = 'grp_tugas';
    else if (groupTemplate === 'pr_tugas') templateId = 'grp_pr_tugas';
    else templateId = 'grp_pengumuman';

    const found = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    if (found) {
      setGroupTemplateText(found.content);
    }
  }, [groupTemplate]);

  // Helper to insert placeholders at the cursor position
  const insertPlaceholder = (tag: string) => {
    const isInd = activeTab === 'individual';
    const textarea = isInd ? indTextareaRef.current : grpTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = isInd ? individualTemplateText : groupTemplateText;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    if (isInd) {
      setIndividualTemplateText(before + tag + after);
    } else {
      setGroupTemplateText(before + tag + after);
    }

    // Refocus after insertion
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  // Generate Message Hook
  useEffect(() => {
    generateMessage();
  }, [
    activeTab, selectedStudent, individualTemplate, individualTemplateText, selectedSubject, 
    selectedTaskForIndividual, selectedGroupClass, groupTemplate, groupTemplateText, selectedTaskForGroup, 
    groupDate, students, grades, attendance, tasks, settings, groupCustomTitle, groupCustomText
  ]);

  const formatWhatsAppNumber = (phone: string): string => {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('620')) {
      cleaned = '62' + cleaned.slice(3);
    }
    if (cleaned.startsWith('08')) {
      cleaned = '62' + cleaned.slice(1);
    } else if (cleaned.startsWith('8') && cleaned.length >= 9 && cleaned.length <= 13) {
      cleaned = '62' + cleaned;
    }
    return cleaned;
  };

  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[date.getDay()];
  };

  const formatDateIndo = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  // Save specific class group link to settings
  const handleSaveGroupLink = async () => {
    if (role !== 'guru') {
      toast.error('Anda tidak memiliki akses (Mode Baca Saja)');
      return;
    }
    if (!selectedGroupClass) {
      toast.error('Pilih kelas terlebih dahulu');
      return;
    }
    if (!newGroupLinkInput.trim()) {
      toast.error('Masukkan tautan grup WhatsApp yang valid');
      return;
    }

    try {
      const updatedLinks = { ...savedGroupLinks, [selectedGroupClass]: newGroupLinkInput.trim() };
      setSavedGroupLinks(updatedLinks);

      if (settings) {
        const updatedSettings = { ...settings, wa_group_links: updatedLinks };
        setSettings(updatedSettings);
        await store.settings.setItem('app_settings', updatedSettings);
        toast.success(`Tautan WhatsApp Grup Kelas ${selectedGroupClass} berhasil disimpan!`);
        setNewGroupLinkInput('');
      } else {
        toast.error('Settings tidak ditemukan. Jalankan inisialisasi.');
      }
    } catch (e: any) {
      toast.error('Gagal menyimpan tautan: ' + e.message);
    }
  };

  // Generate Message Logic
  const generateMessage = () => {
    const teacherName = settings?.nama_wali_kelas || 'Wali Kelas';
    const schoolName = settings?.nama_sekolah || 'Sekolah';
    const semesterActive = settings?.semester_aktif || 'Ganjil 2026';

    if (activeTab === 'individual') {
      if (!selectedStudent) {
        setGeneratedMessage('Silakan pilih siswa terlebih dahulu untuk membuat pesan.');
        return;
      }

      // Compile the dynamic individual template using WhatsAppSenderService
      const compiled = WhatsAppSenderService.compile(individualTemplateText, {
        student: selectedStudent,
        grades,
        attendance,
        tasks,
        settings,
        selectedSubject,
        selectedTaskId: (individualTemplate === 'pr_tugas' || individualTemplate === 'tugas') ? selectedTaskForIndividual : undefined,
        selectedDate: groupDate,
      });

      setGeneratedMessage(compiled);
    } else {
      // GROUP TEMPLATE
      if (!selectedGroupClass) {
        setGeneratedMessage('Silakan pilih kelas terlebih dahulu untuk membuat pesan grup.');
        return;
      }

      const classStudents = students.filter(s => s.kelas === selectedGroupClass);
      
      // Calculate {{rekap_absen}}
      const dayName = getDayName(groupDate);
      const dateFormatted = formatDateIndo(groupDate);
      const dayAtt = attendance.filter(a => a.tanggal === groupDate && a.semester === semesterActive);
      
      const sakitList: string[] = [];
      const izinList: string[] = [];
      const alpaList: string[] = [];

      classStudents.forEach(s => {
        const att = dayAtt.find(a => a.id_siswa === s.id);
        if (att) {
          if (att.status === 'Sakit') sakitList.push(s.nama);
          else if (att.status === 'Izin') izinList.push(s.nama);
          else if (att.status === 'Alpa') alpaList.push(s.nama);
        }
      });

      const sakitText = sakitList.length > 0 ? sakitList.join(', ') : 'Tidak ada';
      const izinText = izinList.length > 0 ? izinList.join(', ') : 'Tidak ada';
      const alpaText = alpaList.length > 0 ? alpaList.join(', ') : 'Tidak ada';
      const rekapAbsenStr = `🤒 *Sakit:* ${sakitText}\n✉️ *Izin:* ${izinText}\n🚫 *Alpa:* ${alpaText}`;

      // Calculate {{tugas_belum_grup}}
      const classTasks = tasks.filter(t => t.kelas === selectedGroupClass && t.semester === semesterActive);
      const currentTask = classTasks.find(t => t.id === selectedTaskForGroup);
      let tugasBelumGrupStr = '';
      if (currentTask) {
        const incompleteStudents: string[] = [];
        classStudents.forEach(s => {
          const completed = currentTask.penyelesaian && currentTask.penyelesaian[s.id] === true;
          if (!completed) {
            incompleteStudents.push(s.nama);
          }
        });
        tugasBelumGrupStr = incompleteStudents.length > 0 
          ? incompleteStudents.map((name, idx) => `${idx + 1}. *${name}*`).join('\n')
          : 'Sempurna! Semua siswa telah mengumpulkan tugas ini. 🎉';
      } else {
        tugasBelumGrupStr = '[Silakan pilih tugas kelas yang ingin diperiksa daftar pengumpulannya di kolom sebelah kiri]';
      }

      // Compile using service first
      let compiled = WhatsAppSenderService.compile(groupTemplateText, {
        settings,
        tasks,
        selectedTaskId: selectedTaskForGroup,
        selectedDate: groupDate,
      });

      // Handle the custom input for "Pengumuman Kelas" if the placeholder or custom marker is present
      if (groupTemplate === 'pengumuman') {
        const titleUpper = groupCustomTitle.toUpperCase();
        const textBody = groupCustomText || '[Tulis isi pengumuman kelas Anda di sini]';
        compiled = compiled.replace(/📢 PENGUMUMAN KELAS/g, `📢 ${titleUpper}`);
        compiled = compiled.replace(/\[Tulis pesan pengumuman atau kegiatan belajar di sini\]/g, textBody);
      }

      // Final replacement of calculated fields
      compiled = compiled.replace(/\{\{kelas\}\}/g, selectedGroupClass);
      compiled = compiled.replace(/\{\{rekap_absen\}\}/g, rekapAbsenStr);
      compiled = compiled.replace(/\{\{tugas_belum_grup\}\}/g, tugasBelumGrupStr);

      setGeneratedMessage(compiled);
    }
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(generatedMessage);
    toast.success('Pesan WhatsApp berhasil disalin ke clipboard!');
  };

  const handleSendWhatsApp = () => {
    if (activeTab === 'individual') {
      if (!selectedStudent) return;
      const cleanPhone = formatWhatsAppNumber(editedPhone);
      if (!cleanPhone) {
        toast.error('Nomor WhatsApp orang tua tidak ditemukan atau tidak valid.');
        return;
      }
      // Open direct link
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(generatedMessage)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Membuka chat WhatsApp Orang Tua...');
    } else {
      if (!selectedGroupClass) return;
      
      // Auto-copy message to clipboard first for the group context
      navigator.clipboard.writeText(generatedMessage);
      
      // Open the Group Link Instructions Alert Modal
      setShowGroupModal(true);
    }
  };

  const handleRedirectToGroup = () => {
    const savedLink = savedGroupLinks[selectedGroupClass];
    if (savedLink) {
      window.open(savedLink, '_blank', 'noopener,noreferrer');
      toast.success('Membuka tautan WhatsApp Grup Kelas...');
    } else {
      // Use generic share
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(generatedMessage)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Membuka share WhatsApp...');
    }
    setShowGroupModal(false);
  };

  // Filter students based on search and class selector
  const filteredStudents = students.filter(s => {
    const matchSearch = s.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (s.nisn && s.nisn.includes(searchTerm));
    const matchClass = selectedClass ? s.kelas === selectedClass : true;
    return matchSearch && matchClass;
  });

  // Filter tasks based on group class
  const filteredTasksForGroup = tasks.filter(t => t.kelas === selectedGroupClass);

  return (
    <div className="p-8 h-full flex flex-col gap-6 text-slate-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <MessageSquare className="text-indigo-400" size={26} />
            Pusat Notifikasi Orang Tua & Grup Kelas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Kirim rekap absensi, hasil nilai tugas, evaluasi belajar secara instan via WhatsApp.
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex bg-slate-800/40 border border-slate-700/50 p-1.5 rounded-2xl max-w-sm">
          <button 
            onClick={() => { setActiveTab('individual'); setSelectedStudent(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${activeTab === 'individual' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <User size={15} />
            Individu (Orang Tua)
          </button>
          <button 
            onClick={() => setActiveTab('group')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${activeTab === 'group' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Users size={15} />
            Grup WhatsApp Kelas
          </button>
        </div>
      </div>

      {role === 'kepsek' && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm text-sm text-rose-300">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-rose-200">Mode Baca Saja (Kepala Sekolah)</h3>
            <p className="text-rose-400/90 text-xs mt-0.5 leading-relaxed">
              Anda masuk dengan hak akses Kepala Sekolah. Fitur edit template, simpan tautan kelas, dan pengiriman notifikasi dinonaktifkan.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Control Panel (Columns 1-5) */}
        <div className="lg:col-span-5 space-y-6">
          
          {activeTab === 'individual' ? (
            /* INDIVIDUAL PANEL */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Search size={16} className="text-slate-500" />
                Langkah 1: Pilih Siswa & Ortu
              </h2>

              {/* Student Filtering Controls */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Kelas</label>
                  <select 
                    value={selectedClass || ''} 
                    onChange={e => { setSelectedClass(e.target.value); setSelectedStudent(null); }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Semua Kelas</option>
                    {uniqueClasses.map(c => (
                      <option key={c} value={c}>Kelas {c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Cari Nama / NISN</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: Raifan"
                    value={searchTerm || ''}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Scrollable Student List */}
              <div className="border border-slate-800/80 bg-slate-950/40 rounded-xl max-h-[160px] overflow-y-auto custom-scrollbar p-1">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStudent(s)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex justify-between items-center transition-all ${selectedStudent?.id === s.id ? 'bg-indigo-600/20 text-indigo-300 font-semibold border-l-2 border-indigo-500' : 'hover:bg-slate-800 text-slate-400'}`}
                    >
                      <span>{s.nama}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">Kelas {s.kelas}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-center text-xs text-slate-500 py-4 italic">Siswa tidak ditemukan</p>
                )}
              </div>

              {selectedStudent && (
                <>
                  {/* Step 2: Edit Phone Info */}
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kontak Orang Tua</p>
                    <div className="flex gap-2 text-xs">
                      <div className="flex-1 space-y-1">
                        <span className="text-slate-500">Ayah:</span> <span className="text-slate-300">{selectedStudent.nama_ayah || '-'}</span>
                      </div>
                      <div className="flex-1 space-y-1">
                        <span className="text-slate-500">Ibu:</span> <span className="text-slate-300">{selectedStudent.nama_ibu || '-'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="bg-slate-800 p-1.5 rounded-lg text-slate-400">
                        <Phone size={14} />
                      </div>
                      <input 
                        type="text" 
                        placeholder="Masukkan nomor WA, contoh: 0812345678"
                        value={editedPhone || ''}
                        disabled={role !== 'guru'}
                        onChange={e => setEditedPhone(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-slate-200 border-b border-slate-800 py-1 focus:border-indigo-500 focus:outline-none font-mono disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Step 3: Choose Template */}
                  <div className="space-y-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <ClipboardList size={16} className="text-slate-500" />
                      Langkah 2: Pilih & Kustomisasi Template
                    </h2>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button 
                        onClick={() => setIndividualTemplate('nilai')}
                        className={`py-2 px-3 rounded-xl border text-left transition-all cursor-pointer ${individualTemplate === 'nilai' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        <FileSpreadsheet className="inline-block mr-1.5" size={14} />
                        Laporan Nilai
                      </button>
                      <button 
                        onClick={() => setIndividualTemplate('absen')}
                        className={`py-2 px-3 rounded-xl border text-left transition-all cursor-pointer ${individualTemplate === 'absen' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        <CheckSquare className="inline-block mr-1.5" size={14} />
                        Laporan Absensi
                      </button>
                      <button 
                        onClick={() => setIndividualTemplate('tugas')}
                        className={`py-2 px-3 rounded-xl border text-left transition-all cursor-pointer ${individualTemplate === 'tugas' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        <ClipboardList className="inline-block mr-1.5" size={14} />
                        Tugas Tertinggal
                      </button>
                      <button 
                        onClick={() => setIndividualTemplate('pr_tugas')}
                        className={`py-2 px-3 rounded-xl border text-left transition-all cursor-pointer ${individualTemplate === 'pr_tugas' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        <Send className="inline-block mr-1.5" size={14} />
                        Kirim PR / Tugas
                      </button>
                      <button 
                        onClick={() => setIndividualTemplate('kustom')}
                        className={`py-2 px-3 rounded-xl border text-left col-span-2 transition-all cursor-pointer ${individualTemplate === 'kustom' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        <MessageSquare className="inline-block mr-1.5" size={14} />
                        Kirim Kustom
                      </button>
                    </div>

                    {/* Template Specific Options */}
                    {individualTemplate === 'nilai' && settings?.mata_pelajaran && (
                      <div className="p-3 bg-slate-950 border border-slate-800/60 rounded-xl space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mata Pelajaran (Opsional)</label>
                        <select 
                          value={selectedSubject || ''} 
                          onChange={e => setSelectedSubject(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800/80 rounded-lg text-xs text-slate-300 outline-none"
                        >
                          <option value="">-- Ringkasan Semua Nilai --</option>
                          {settings.mata_pelajaran.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    )}

                     {(individualTemplate === 'pr_tugas' || individualTemplate === 'tugas') && (
                      <div className="p-3 bg-slate-950 border border-slate-800/60 rounded-xl space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pilih Tugas / PR Kelas</label>
                        <select 
                          value={selectedTaskForIndividual || ''} 
                          onChange={e => setSelectedTaskForIndividual(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800/80 rounded-lg text-xs text-slate-300 outline-none"
                        >
                          <option value="">-- Pilih Tugas / PR --</option>
                          {tasks.filter(t => t.kelas === selectedStudent.kelas && t.semester === (settings?.semester_aktif || 'Ganjil 2026')).map(t => (
                            <option key={t.id} value={t.id}>{t.judul} ({t.mata_pelajaran})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Template Editor Box */}
                    <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Editor Template</span>
                        <button 
                          type="button"
                          onClick={() => setShowPlaceholderGuide(!showPlaceholderGuide)}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer transition-colors"
                        >
                          {showPlaceholderGuide ? 'Sembunyikan Tag' : 'Tampilkan Tag Variabel'}
                        </button>
                      </div>

                      {showPlaceholderGuide && (
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-[10px] text-slate-400 space-y-1.5">
                          <p className="font-bold text-slate-300">Variabel Siswa (Klik untuk menyisipkan):</p>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {INDIVIDUAL_PLACEHOLDERS.map(p => (
                              <button
                                key={p.tag}
                                type="button"
                                onClick={() => insertPlaceholder(p.tag)}
                                title={p.description}
                                className="px-2 py-0.5 bg-slate-900 border border-slate-800/80 hover:bg-indigo-600/20 hover:border-indigo-500/50 rounded text-slate-300 font-mono text-[9px] cursor-pointer transition-colors"
                              >
                                {p.tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <textarea 
                        ref={indTextareaRef}
                        rows={7}
                        value={individualTemplateText || ''}
                        disabled={role !== 'guru'}
                        onChange={e => setIndividualTemplateText(e.target.value)}
                        placeholder="Tulis format template pesan menggunakan placeholder..."
                        className="w-full p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none resize-none font-sans leading-relaxed custom-scrollbar disabled:opacity-60"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* GROUP PANEL */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Users size={16} className="text-slate-500" />
                Langkah 1: Pilih Grup Kelas
              </h2>

              {/* Class selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Target Kelas</label>
                <select 
                  value={selectedGroupClass || ''} 
                  onChange={e => { setSelectedGroupClass(e.target.value); setSelectedTaskForGroup(''); }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Pilih Kelas...</option>
                  {uniqueClasses.map(c => (
                    <option key={c} value={c}>Kelas {c}</option>
                  ))}
                </select>
              </div>

              {selectedGroupClass && (
                <>
                  {/* Saved Group Link Info */}
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                      <span>WhatsApp Group Link</span>
                      {savedGroupLinks[selectedGroupClass] ? (
                        <span className="text-emerald-400 font-bold">Terhubung</span>
                      ) : (
                        <span className="text-amber-400">Belum diatur</span>
                      )}
                    </p>
                    
                    {savedGroupLinks[selectedGroupClass] ? (
                      <p className="text-[10px] font-mono text-slate-400 truncate bg-slate-900 p-1.5 rounded-lg border border-slate-800/40">
                        {savedGroupLinks[selectedGroupClass]}
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-500">Anda dapat menyimpan tautan WhatsApp grup kelas ini agar saat kirim pesan langsung meluncur ke grup!</p>
                    )}

                     <div className="flex gap-1.5 mt-1">
                      <input 
                        type="text" 
                        placeholder="https://chat.whatsapp.com/..."
                        value={newGroupLinkInput || ''}
                        disabled={role !== 'guru'}
                        onChange={e => setNewGroupLinkInput(e.target.value)}
                        className="flex-1 bg-slate-900 px-2 py-1.5 rounded-lg border border-slate-800 text-[10px] focus:outline-none text-slate-300 disabled:opacity-50"
                      />
                      <button 
                        onClick={handleSaveGroupLink}
                        disabled={role !== 'guru'}
                        className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600"
                      >
                        <Save size={12} />
                        Simpan Link
                      </button>
                    </div>
                  </div>

                  {/* Step 2: Choose Template */}
                  <div className="space-y-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <ClipboardList size={16} className="text-slate-500" />
                      Langkah 2: Pilih & Kustomisasi Template Grup
                    </h2>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <button 
                        onClick={() => setGroupTemplate('rekap_absen')}
                        className={`py-2 px-1 text-center rounded-lg border transition-all cursor-pointer ${groupTemplate === 'rekap_absen' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        Rekap Absensi
                      </button>
                      <button 
                        onClick={() => setGroupTemplate('tugas_pending')}
                        className={`py-2 px-1 text-center rounded-lg border transition-all cursor-pointer ${groupTemplate === 'tugas_pending' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        Siswa Belum Kumpul
                      </button>
                      <button 
                        onClick={() => setGroupTemplate('pr_tugas')}
                        className={`py-2 px-1 text-center rounded-lg border transition-all cursor-pointer ${groupTemplate === 'pr_tugas' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        Kirim PR / Tugas
                      </button>
                      <button 
                        onClick={() => setGroupTemplate('pengumuman')}
                        className={`py-2 px-1 text-center rounded-lg border transition-all cursor-pointer ${groupTemplate === 'pengumuman' ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800'}`}
                      >
                        Pengumuman Kelas
                      </button>
                    </div>

                    {/* Group Options */}
                    {groupTemplate === 'rekap_absen' && (
                      <div className="p-3 bg-slate-950 border border-slate-800/60 rounded-xl space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pilih Tanggal Absensi</label>
                        <input 
                          type="date"
                          value={groupDate || ''}
                          onChange={e => setGroupDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}

                    {groupTemplate === 'tugas_pending' && (
                      <div className="p-3 bg-slate-950 border border-slate-800/60 rounded-xl space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pilih Tugas Kelas</label>
                        {filteredTasksForGroup.length > 0 ? (
                          <select 
                            value={selectedTaskForGroup || ''} 
                            onChange={e => setSelectedTaskForGroup(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 outline-none focus:border-indigo-500"
                          >
                            <option value="">-- Pilih Tugas --</option>
                            {filteredTasksForGroup.map(t => (
                              <option key={t.id} value={t.id}>{t.judul} ({t.mata_pelajaran})</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-[10px] text-slate-500 italic">Belum ada tugas dibuat untuk Kelas {selectedGroupClass} semester ini.</p>
                        )}
                      </div>
                    )}

                    {groupTemplate === 'pr_tugas' && (
                      <div className="p-3 bg-slate-950 border border-slate-800/60 rounded-xl space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pilih Tugas / PR Kelas</label>
                        {filteredTasksForGroup.length > 0 ? (
                          <select 
                            value={selectedTaskForGroup || ''} 
                            onChange={e => setSelectedTaskForGroup(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 outline-none focus:border-indigo-500"
                          >
                            <option value="">-- Pilih Tugas / PR --</option>
                            {filteredTasksForGroup.map(t => (
                              <option key={t.id} value={t.id}>{t.judul} ({t.mata_pelajaran})</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-[10px] text-slate-500 italic">Belum ada tugas dibuat untuk Kelas {selectedGroupClass} semester ini.</p>
                        )}
                      </div>
                    )}

                     {groupTemplate === 'pengumuman' && (
                      <div className="p-3 bg-slate-950 border border-slate-800/65 rounded-xl space-y-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Judul Pengumuman</label>
                          <input 
                            type="text"
                            placeholder="PEMBERITAHUAN KEGIATAN / rapat"
                            value={groupCustomTitle || ''}
                            disabled={role !== 'guru'}
                            onChange={e => setGroupCustomTitle(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 outline-none focus:border-indigo-500 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Isi Pengumuman</label>
                          <textarea 
                            rows={3}
                            value={groupCustomText || ''}
                            disabled={role !== 'guru'}
                            onChange={e => setGroupCustomText(e.target.value)}
                            placeholder="Sampaikan pesan kegiatan kelas besok secara terperinci..."
                            className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500 resize-none custom-scrollbar disabled:opacity-50"
                          />
                        </div>
                      </div>
                    )}

                    {/* Group Template Editor Box */}
                    <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Editor Template Grup</span>
                        <button 
                          type="button"
                          onClick={() => setShowPlaceholderGuide(!showPlaceholderGuide)}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer transition-colors"
                        >
                          {showPlaceholderGuide ? 'Sembunyikan Tag' : 'Tampilkan Tag Variabel'}
                        </button>
                      </div>

                      {showPlaceholderGuide && (
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-[10px] text-slate-400 space-y-1.5">
                          <p className="font-bold text-slate-300">Variabel Grup (Klik untuk menyisipkan):</p>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {GROUP_PLACEHOLDERS.map(p => (
                              <button
                                key={p.tag}
                                type="button"
                                onClick={() => insertPlaceholder(p.tag)}
                                title={p.description}
                                className="px-2 py-0.5 bg-slate-900 border border-slate-800/80 hover:bg-indigo-600/20 hover:border-indigo-500/50 rounded text-slate-300 font-mono text-[9px] cursor-pointer transition-colors"
                              >
                                {p.tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <textarea 
                        ref={grpTextareaRef}
                        rows={7}
                        value={groupTemplateText || ''}
                        disabled={role !== 'guru'}
                        onChange={e => setGroupTemplateText(e.target.value)}
                        placeholder="Tulis format template pesan grup menggunakan placeholder..."
                        className="w-full p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none resize-none font-sans leading-relaxed custom-scrollbar disabled:opacity-60"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Preview Box (Columns 6-12) */}
        <div className="lg:col-span-7">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col min-h-[460px] relative">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <Share2 size={16} className="text-slate-500" />
              Langkah 3: Tinjauan Pesan & Kirim
            </h2>

            {/* WA Mockup Canvas */}
            <div className="flex-1 bg-[#0b141a] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-blend-multiply rounded-2xl border border-slate-800/80 p-4 flex flex-col relative overflow-hidden min-h-[350px] mb-5 shadow-inner">
              {/* WA Chat Header */}
              <div className="absolute top-0 inset-x-0 bg-[#1f2c34] border-b border-slate-800/60 px-4 py-2.5 flex items-center justify-between shrink-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#005c4b]/30 text-emerald-400 flex items-center justify-center font-bold text-sm">
                    {activeTab === 'individual' ? <User size={16} /> : <Users size={16} />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">
                      {activeTab === 'individual' 
                        ? (selectedStudent ? `Wali Murid - ${selectedStudent.nama}` : 'Pilih Siswa')
                        : (selectedGroupClass ? `WhatsApp Grup - Kelas ${selectedGroupClass}` : 'Pilih Kelas')
                      }
                    </h4>
                    <p className="text-[9px] text-[#8696a0]">
                      {activeTab === 'individual' 
                        ? (editedPhone ? formatWhatsAppNumber(editedPhone) : 'Nomor HP Wali')
                        : 'Bagikan informasi kelas secara masal'
                      }
                    </p>
                  </div>
                </div>
                <div className="text-[10px] text-emerald-400 font-bold bg-[#005c4b]/20 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Pra-tinjau
                </div>
              </div>

              {/* WA Chat Message Bubble Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pt-14 pb-2 flex flex-col justify-end">
                <div className="bg-[#005c4b] text-white rounded-2xl rounded-tr-none px-4 py-3.5 max-w-[85%] self-end shadow-md text-xs whitespace-pre-wrap leading-relaxed relative border border-emerald-600/20 font-sans">
                  {generatedMessage}
                  <span className="absolute bottom-1 right-2.5 text-[9px] text-[#8696a0] font-medium font-mono select-none">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Panel */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80 shrink-0">
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <Info size={14} className="text-indigo-400" />
                <span>Format tebal (*teks*) dan baris baru dipertahankan di WhatsApp.</span>
              </div>
              
               <div className="flex gap-2">
                <button 
                  onClick={handleCopyMessage}
                  disabled={activeTab === 'individual' ? !selectedStudent : !selectedGroupClass}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 disabled:opacity-50 disabled:hover:bg-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy size={14} />
                  Salin Pesan
                </button>
                <button 
                  onClick={handleSendWhatsApp}
                  disabled={role !== 'guru' || (activeTab === 'individual' ? !selectedStudent : !selectedGroupClass)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-600/10 cursor-pointer"
                >
                  <Send size={14} />
                  {activeTab === 'individual' ? 'Kirim via WhatsApp' : 'Kirim ke Grup Kelas'}
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Group Instructions Modal Popup */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative space-y-5">
            {/* Close button */}
            <button 
              onClick={() => setShowGroupModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <span className="sr-only">Tutup</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header / Icon */}
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                <Users size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Kirim ke Grup WhatsApp Kelas {selectedGroupClass}</h3>
                <p className="text-xs text-slate-400">Panduan pengiriman pesan rekap grup kelas</p>
              </div>
            </div>

            {/* Warning & Clipboard success block */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <span className="text-lg">📋</span>
                <div>
                  <p className="text-xs font-bold text-emerald-400">Pesan Berhasil Disalin ke Clipboard!</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    WhatsApp memiliki batasan keamanan yang mencegah pengisian pesan otomatis di kolom chat saat menggunakan tautan undangan grup.
                  </p>
                </div>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Langkah Pengiriman:</p>
              <div className="space-y-2 text-xs">
                <div className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 flex items-center justify-center shrink-0 mt-0.5">1</div>
                  <p className="text-slate-400 leading-relaxed">
                    Klik tombol <strong className="text-indigo-400">"Buka & Tempel di Grup"</strong> di bawah untuk membuka halaman WhatsApp Grup Kelas.
                  </p>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 flex items-center justify-center shrink-0 mt-0.5">2</div>
                  <p className="text-slate-400 leading-relaxed">
                    Setelah diarahkan masuk ke ruang chat grup, klik atau posisikan kursor Anda pada kolom ketik pesan.
                  </p>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 flex items-center justify-center shrink-0 mt-0.5">3</div>
                  <p className="text-slate-400 leading-relaxed">
                    Tekan tombol <strong className="text-emerald-400">Ctrl + V</strong> (atau klik kanan lalu pilih <strong className="text-emerald-400">Paste / Tempel</strong>) untuk menampilkan pesan yang sudah disalin.
                  </p>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 flex items-center justify-center shrink-0 mt-0.5">4</div>
                  <p className="text-slate-400 leading-relaxed">
                    Tekan <strong className="text-slate-200">Kirim / Send</strong>. Selesai!
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/60">
              <button
                onClick={() => setShowGroupModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Kembali
              </button>
              <button
                onClick={handleRedirectToGroup}
                className="px-5 py-2.5 bg-[#005c4b] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-600/10 cursor-pointer"
              >
                <span>Buka & Tempel di Grup</span>
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
