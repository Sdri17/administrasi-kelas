import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { store, Student, Settings } from '../lib/store';
import { v4 as uuidv4 } from 'uuid';
import { Download, Upload, Plus, Edit2, Trash2, Settings as SettingsIcon, X, User, LineChart, TrendingUp, Calendar, Award, Activity } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import Pagination from '../components/Pagination';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export default function DataSiswa({ semester, role, settings, setSettings }: { semester: string, role: 'guru' | 'kepsek', settings: Settings | null, setSettings?: (s: Settings | null) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Student>>({});
  
  const [searchName, setSearchName] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [isPromoting, setIsPromoting] = useState(false);
  const [targetClassName, setTargetClassName] = useState('');
  const [isGraduating, setIsGraduating] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [dbClasses, setDbClasses] = useState<string[]>([]);
  const [selectedTargetClass, setSelectedTargetClass] = useState('');
  const [customTargetClass, setCustomTargetClass] = useState('');
  const [isCustomClass, setIsCustomClass] = useState(false);

  const [grades, setGrades] = useState<any[]>([]);
  const [selectedProfileStudent, setSelectedProfileStudent] = useState<Student | null>(null);
  const [mapelFilter, setMapelFilter] = useState<string>('Semua');
  const [semesterFilter, setSemesterFilter] = useState<string>('Semua');
  const [jenisNilaiFilter, setJenisNilaiFilter] = useState<string>('Semua');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  // Dynamic columns state
  const [isManagingColumns, setIsManagingColumns] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchName, filterClass, semester]);

  useEffect(() => {
    loadStudents();
    cleanDummyData();
    loadDbClasses();
    loadGrades();
  }, [semester]);

  useEffect(() => {
    if (isPromoting) {
      loadDbClasses();
      setSelectedTargetClass('');
      setCustomTargetClass('');
      setIsCustomClass(false);
      setTargetClassName('');
    }
  }, [isPromoting]);

  const handleAddCustomColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    const colName = newColumnName.trim().toLowerCase();
    if (!colName) return;
    
    const standardProps = ['id', 'no', 'nama', 'nisn', 'nipd', 'tempat_lahir', 'tanggal_lahir', 'kelas', 'nama_ayah', 'nama_ibu', 'no_telp_ortu', 'semester', 'tanggal_lulus', 'tahun_ajaran_lulus'];
    if (standardProps.includes(colName)) {
      toast.error('Nama kolom bertabrakan dengan kolom standar bawaan!');
      return;
    }

    const currentCols = settings?.custom_student_columns || [];
    if (currentCols.includes(colName)) {
      toast.error('Kolom ini sudah ada!');
      return;
    }

    const updatedCols = [...currentCols, colName];
    const updatedSettings = {
      ...(settings || {}),
      custom_student_columns: updatedCols
    } as Settings;

    await store.settings.setItem('app_settings', updatedSettings);
    if (setSettings) {
      setSettings(updatedSettings);
    }
    setNewColumnName('');
    toast.success(`Kolom tambahan "${colName}" berhasil dibuat!`);
  };

  const handleDeleteCustomColumn = async (colName: string) => {
    const currentCols = settings?.custom_student_columns || [];
    const updatedCols = currentCols.filter(c => c !== colName);
    const updatedSettings = {
      ...(settings || {}),
      custom_student_columns: updatedCols
    } as Settings;

    await store.settings.setItem('app_settings', updatedSettings);
    if (setSettings) {
      setSettings(updatedSettings);
    }
    toast.success(`Kolom tambahan "${colName}" telah dihapus!`);
  };

  const loadDbClasses = async () => {
    const list: string[] = [];
    await store.students.iterate<Student, void>((val) => {
      if (val.kelas && !list.includes(val.kelas)) {
        list.push(val.kelas);
      }
    });
    setDbClasses(list.sort());
  };

  const cleanDummyData = async () => {
    const dummyNames = [
      'Budi Santoso', 'Siti Aminah', 'Andi Pratama', 'Rina Wijaya', 
      'Fajar Nugroho', 'Dewi Lestari', 'Eko Saputro', 'Ayu Maharani', 
      'Dedi Kurniawan', 'Sri Rahayu'
    ];
    let deletedCount = 0;
    const idsToDelete: string[] = [];
    await store.students.iterate<Student, void>((val) => {
      if (dummyNames.includes(val.nama)) {
        idsToDelete.push(val.id);
      }
    });
    for (const id of idsToDelete) {
      await store.students.removeItem(id);
      deletedCount++;
    }
    if (deletedCount > 0) {
      toast.success(`Berhasil membersihkan ${deletedCount} data siswa dummy dari sistem!`);
      loadStudents();
    }
  };

  const loadGrades = async () => {
    try {
      const list: any[] = [];
      await store.grades.iterate((g: any) => {
        list.push(g);
      });
      setGrades(list);
    } catch (err) {
      console.error("Error loading grades:", err);
    }
  };

  const loadStudents = async () => {
    const list: Student[] = [];
    await store.students.iterate<Student, void>((val) => {
      if (!val.semester || val.semester === semester) {
        list.push(val);
      }
    });
    setStudents(list.sort((a, b) => a.no - b.no));
  };

  const filteredStudents = students.filter(s => {
    const matchName = s.nama.toLowerCase().includes(searchName.toLowerCase());
    const matchClass = filterClass 
      ? s.kelas === filterClass 
      : (!s.kelas || s.kelas.toLowerCase() !== 'alumni');
    return matchName && matchClass;
  });

  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const uniqueClasses = Array.from(new Set(students.map(s => s.kelas))).filter(Boolean);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing === 'new') {
      const newStudent: Student = {
        ...(formData as Student),
        id: uuidv4(),
        semester: semester
      };
      await store.students.setItem(newStudent.id, newStudent);
      toast.success('Data siswa berhasil ditambahkan', { duration: 3000 });
    } else if (isEditing) {
      const updatedStudent: Student = {
        ...(formData as Student),
        semester: formData.semester || semester
      } as Student;
      await store.students.setItem(isEditing, updatedStudent);
      toast.success('Data siswa berhasil diedit', { duration: 3000 });
    }
    setIsEditing(null);
    setFormData({});
    loadStudents();
    window.dispatchEvent(new Event('trigger-immediate-sync'));
  };

  const handleDelete = async (id: string) => {
    await store.students.removeItem(id);
    loadStudents();
    toast.success('Data siswa berhasil dihapus', { duration: 3000 });
    setStudentToDelete(null);
    window.dispatchEvent(new Event('trigger-immediate-sync'));
  };

  const handleDeleteSelected = async () => {
    if (selectedStudents.length === 0) {
      toast.error('Silakan pilih siswa yang ingin dihapus terlebih dahulu');
      return;
    }
    
    try {
      for (const id of selectedStudents) {
        await store.students.removeItem(id);
      }
      toast.success(`Berhasil menghapus ${selectedStudents.length} siswa`);
      setSelectedStudents([]);
      loadStudents();
      setIsDeletingSelected(false);
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (e) {
      toast.error('Gagal menghapus siswa terpilih');
    }
  };

  const handleDeleteAll = async () => {
    try {
      await store.students.clear();
      toast.success('Seluruh data siswa berhasil dihapus');
      setSelectedStudents([]);
      loadStudents();
      setIsDeletingAll(false);
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (e) {
      toast.error('Gagal menghapus seluruh data siswa');
    }
  };

  const formatGraduationDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return format(d, 'dd MMMM yyyy', { locale: id });
    } catch (e) {
      return dateStr;
    }
  };

  const exportExcel = () => {
    const customCols = (settings?.custom_student_columns || []).filter(col => {
      const norm = col.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      return norm !== 'jenis_kelamin' && norm !== 'nama_orang_tua';
    });
    const dataForExport = filteredStudents.map((s, idx) => {
      const row: any = {
        'No': idx + 1,
        'Nama': s.nama,
        'NISN': s.nisn,
        'NIPD': s.nipd,
        'Jenis Kelamin': s.jenis_kelamin || '',
        'Kelas': s.kelas,
        'Tempat Lahir': s.tempat_lahir,
        'Tanggal Lahir': s.tanggal_lahir,
        'Nama Orang Tua': s.nama_orang_tua || [s.nama_ayah, s.nama_ibu].filter(Boolean).join(' / ') || '',
        'Nama Ayah': s.nama_ayah,
        'Nama Ibu': s.nama_ibu,
        'No Telp Ortu': s.no_telp_ortu,
      };
      if (filterClass === 'Alumni') {
        row['Tanggal Lulus'] = formatGraduationDate(s.tanggal_lulus);
        row['Tahun Ajaran Lulus'] = s.tahun_ajaran_lulus || '';
      }
      customCols.forEach(col => {
        const normCol = col.toLowerCase().replace(/\s+/g, '_');
        row[col.replace(/_/g, ' ').toUpperCase()] = s[normCol] || s[col] || '';
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Siswa");
    XLSX.writeFile(wb, `Data_Siswa_${semester}_${filterClass || 'Semua'}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Data Siswa - Semester ${semester}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Kelas: ${filterClass || 'Semua Kelas'}`, 14, 22);
    
    const customCols = (settings?.custom_student_columns || []).filter(col => {
      const norm = col.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      return norm !== 'jenis_kelamin' && norm !== 'nama_orang_tua';
    });
    const headers = ['No', 'Nama', 'NISN', 'Jenis Kelamin', 'Kelas'];
    if (filterClass === 'Alumni') {
      headers.push('Tgl Lulus', 'TA Lulus');
    }
    headers.push('Orang Tua/Wali', 'No Telp');
    customCols.forEach(col => {
      headers.push(col.replace(/_/g, ' '));
    });

    const body = filteredStudents.map((s, idx) => {
      const row: any[] = [
        idx + 1, 
        s.nama, 
        s.nisn || '-', 
        s.jenis_kelamin || '-', 
        s.kelas || '-'
      ];
      if (filterClass === 'Alumni') {
        row.push(formatGraduationDate(s.tanggal_lulus), s.tahun_ajaran_lulus || '');
      }
      row.push(
        s.nama_orang_tua || [s.nama_ayah, s.nama_ibu].filter(Boolean).join(' / ') || '-', 
        s.no_telp_ortu || '-'
      );
      customCols.forEach(col => {
        const normCol = col.toLowerCase().replace(/\s+/g, '_');
        row.push(s[normCol] || s[col] || '-');
      });
      return row;
    });

    autoTable(doc, {
      head: [headers],
      body: body,
      startY: 28
    });
    doc.save(`Data_Siswa_${semester}_${filterClass || 'Semua'}.pdf`);
  };

  const downloadTemplate = () => {
    const template = [{ 
      no: 1, 
      nama: 'Nama Siswa', 
      nisn: '12345', 
      nipd: '123', 
      jenis_kelamin: 'Laki-laki', 
      tempat_lahir: 'Jakarta', 
      tanggal_lahir: '2010-01-01', 
      kelas: '7A', 
      nama_ayah: 'Ayah', 
      nama_ibu: 'Ibu', 
      nama_orang_tua: 'Ayah / Ibu', 
      no_telp_ortu: '0812345' 
    }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Import_Siswa.xlsx");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          
          // Get raw rows first to detect header row dynamically (in case of leading title/empty rows)
          const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
          if (rawRows.length === 0) {
            toast.error('File Excel kosong!');
            return;
          }

          // Detect header row: first row that has at least 2 key student indicators
          let headerRowIdx = 0;
          const keyIndicators = ['nama', 'nisn', 'kelas', 'no', 'jenis kelamin', 'jk', 'nipd', 'ortu', 'wali'];
          for (let i = 0; i < Math.min(rawRows.length, 12); i++) {
            const row = rawRows[i];
            if (Array.isArray(row)) {
              const matchCount = row.filter(cell => {
                if (cell === null || cell === undefined) return false;
                const cellStr = String(cell).trim().toLowerCase();
                return keyIndicators.some(ind => cellStr.includes(ind));
              }).length;
              if (matchCount >= 2) {
                headerRowIdx = i;
                break;
              }
            }
          }

          console.log(`[Import Excel] Mendeteksi baris header pada indeks ke-${headerRowIdx}`);

          const rawHeaders = rawRows[headerRowIdx];
          const headers = Array.isArray(rawHeaders) ? rawHeaders.map(h => String(h || '').trim()) : [];
          const dataRows = rawRows.slice(headerRowIdx + 1);

          let importCount = 0;

          for (const row of dataRows) {
            if (!Array.isArray(row) || row.filter(item => item !== null && item !== undefined && String(item).trim() !== '').length === 0) continue;

            const cleanRow: any = {};
            headers.forEach((header, colIdx) => {
              if (header) {
                const cleanKey = header.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                cleanRow[cleanKey] = row[colIdx];
              }
            });

            // Skip rows that don't have a name
            const nama = String(cleanRow.nama || cleanRow.nama_lengkap || cleanRow.nama_siswa || '').trim();
            if (!nama) continue;

            // Apply fallbacks
            const nisn = String(cleanRow.nisn || cleanRow.nisn_siswa || cleanRow.nomor_induk_siswa_nasional || cleanRow.nomor_induk || cleanRow.ni || cleanRow.no_nisn || cleanRow.nomor_nisn || cleanRow.no_induk_nasional || cleanRow.nomor_induk_nasional || '').trim();
            const kelas = String(cleanRow.kelas || cleanRow.nama_kelas || cleanRow.rombel || cleanRow.ruang || cleanRow.rombongan_belajar || cleanRow.kelas_siswa || cleanRow.kelas_tingkat || cleanRow.tingkat || '').trim();
            const no_telp_ortu = String(cleanRow.no_telp_ortu || cleanRow.nomor_telepon || cleanRow.no_telp || cleanRow.nomor_hp || cleanRow.no_hp || cleanRow.telp || cleanRow.telepon || cleanRow.hp || '').trim();
            
            let nama_orang_tua = String(cleanRow.nama_orang_tua || cleanRow.nama_ortu || cleanRow.orang_tua || cleanRow.nama_wali || cleanRow.wali || cleanRow.ayah_ibu || '').trim();
            let nama_ayah = String(cleanRow.nama_ayah || '').trim();
            let nama_ibu = String(cleanRow.nama_ibu || '').trim();
            if (!nama_orang_tua && (nama_ayah || nama_ibu)) {
              nama_orang_tua = [nama_ayah, nama_ibu].filter(Boolean).join(' / ');
            }
            if (nama_orang_tua && !nama_ayah && !nama_ibu) {
              nama_ayah = nama_orang_tua;
            }

            let jenis_kelamin = String(cleanRow.jenis_kelamin || cleanRow.jk || cleanRow.gender || cleanRow.sex || cleanRow.l_p || cleanRow.lp || cleanRow.kelamin || '').trim();
            if (jenis_kelamin) {
              const jkLower = jenis_kelamin.toLowerCase();
              if (jkLower === 'l' || jkLower.startsWith('laki')) {
                jenis_kelamin = 'Laki-laki';
              } else if (jkLower === 'p' || jkLower.startsWith('perem') || jkLower.startsWith('wanita')) {
                jenis_kelamin = 'Perempuan';
              }
            }

            const student: Student = {
              id: uuidv4(),
              no: parseInt(cleanRow.no || cleanRow.no_urut || '0') || (importCount + 1),
              nama: nama,
              nisn: nisn,
              nipd: String(cleanRow.nipd || cleanRow.nipd_siswa || '').trim(),
              tempat_lahir: String(cleanRow.tempat_lahir || cleanRow.tempat || '').trim(),
              tanggal_lahir: String(cleanRow.tanggal_lahir || cleanRow.tgl_lahir || '').trim(),
              kelas: kelas,
              nama_ayah: nama_ayah,
              nama_ibu: nama_ibu,
              nama_orang_tua: nama_orang_tua,
              no_telp_ortu: no_telp_ortu,
              nomor_telepon: no_telp_ortu,
              jenis_kelamin: jenis_kelamin,
              semester: semester
            };
            
            // Store any extra columns as custom attributes on the student
            const knownKeys = ['id', 'no', 'nama', 'nisn', 'nipd', 'tempat_lahir', 'tanggal_lahir', 'kelas', 'nama_ayah', 'nama_ibu', 'nama_orang_tua', 'no_telp_ortu', 'nomor_telepon', 'jenis_kelamin', 'semester'];
            Object.entries(cleanRow).forEach(([k, v]) => {
              if (!knownKeys.includes(k) && k.trim() !== '') {
                student[k] = v;
              }
            });

            await store.students.setItem(student.id, student);
            importCount++;
          }
          loadStudents();
          toast.success(`Berhasil mengimpor ${importCount} data siswa!`);
          window.dispatchEvent(new Event('trigger-immediate-sync'));
        } catch (err: any) {
          toast.error(`Gagal memproses file Excel: ${err.message}`);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-200">
      <div className="p-4 border-b border-slate-700/50 flex flex-wrap justify-between items-center bg-slate-900/40 gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {role === 'guru' && (
            <>
              <button onClick={() => { setIsEditing('new'); setFormData({ no: students.length + 1 }); }} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-indigo-500/20 font-medium transition-colors">
                <Plus size={16} /> Tambah Siswa
              </button>
              <button onClick={() => setIsManagingColumns(true)} className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors">
                <SettingsIcon size={16} /> Kelola Kolom Tambahan
              </button>
              {selectedStudents.length > 0 && (
                <button 
                  onClick={() => setIsDeletingSelected(true)} 
                  className="bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors animate-fade-in"
                  title="Hapus beberapa siswa terpilih"
                >
                  <Trash2 size={16} /> Hapus Terpilih ({selectedStudents.length})
                </button>
              )}
              {students.length > 0 && (
                <button 
                  onClick={() => setIsDeletingAll(true)} 
                  className="bg-rose-600/10 text-rose-500 border border-rose-500/20 hover:bg-rose-600/20 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
                  title="Hapus seluruh data siswa di database"
                >
                  <Trash2 size={16} /> Hapus Semua Siswa
                </button>
              )}
            </>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Cari nama siswa..." 
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all w-48"
          />
          <select 
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer"
          >
            <option value="">Semua Kelas</option>
            {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex gap-3">
          {role === 'guru' && (
            <>
              <button onClick={downloadTemplate} className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm hover:bg-slate-700 text-slate-300 font-medium transition-colors">
                <Download size={16} /> Template
              </button>
              <label className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm hover:bg-slate-700 cursor-pointer text-slate-300 font-medium transition-colors">
                <Upload size={16} /> Import
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImport} />
              </label>
              <div className="border-l border-slate-700 mx-1"></div>
              <button 
                onClick={() => {
                  const targetStudents = selectedStudents.length > 0 
                    ? filteredStudents.filter(s => selectedStudents.includes(s.id))
                    : filteredStudents;

                  if (targetStudents.length === 0) {
                    toast.error('Tidak ada siswa untuk dinaikkan kelas');
                    return;
                  }
                  setTargetClassName('');
                  setIsPromoting(true);
                }}
                className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-3 py-2 rounded-xl text-sm hover:bg-indigo-600/30 font-medium transition-colors"
                title="Naikkan kelas untuk siswa terpilih"
              >
                Naik Kelas {selectedStudents.length > 0 ? `(${selectedStudents.length})` : ''}
              </button>
              <button 
                onClick={() => {
                  const targetStudents = selectedStudents.length > 0 
                    ? filteredStudents.filter(s => selectedStudents.includes(s.id))
                    : filteredStudents;

                  if (targetStudents.length === 0) {
                    toast.error('Tidak ada siswa untuk diluluskan');
                    return;
                  }
                  setIsGraduating(true);
                }}
                className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-sm hover:bg-emerald-600/30 font-medium transition-colors"
                title="Jadikan Alumni untuk siswa terpilih"
              >
                Luluskan {selectedStudents.length > 0 ? `(${selectedStudents.length})` : ''}
              </button>
            </>
          )}
          <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg shadow-emerald-500/20 transition-colors">
            <Download size={16} /> Excel
          </button>
          <button onClick={exportPDF} className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg shadow-rose-500/20 transition-colors">
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 sticky top-0 backdrop-blur-sm z-10">
            <tr>
              {role === 'guru' && (
                <th className="px-6 py-4 w-12 text-center">
                  <input 
                    type="checkbox" 
                    className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                    checked={filteredStudents.length > 0 && selectedStudents.length === filteredStudents.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStudents(filteredStudents.map(s => s.id));
                      } else {
                        setSelectedStudents([]);
                      }
                    }}
                  />
                </th>
              )}
              <th className="px-6 py-4 font-medium">No</th>
              <th className="px-6 py-4 font-medium">Nama</th>
              <th className="px-6 py-4 font-medium">NISN</th>
              <th className="px-6 py-4 font-medium">Jenis Kelamin</th>
              <th className="px-6 py-4 font-medium">Kelas</th>
              {filterClass === 'Alumni' && (
                <>
                  <th className="px-6 py-4 font-medium">Tanggal Lulus</th>
                  <th className="px-6 py-4 font-medium">Tahun Ajaran Lulus</th>
                </>
              )}
              <th className="px-6 py-4 font-medium">Nama Orang Tua</th>
              <th className="px-6 py-4 font-medium">No Telp Ortu</th>
              {(settings?.custom_student_columns || [])
                .filter(col => {
                  const norm = col.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                  return norm !== 'jenis_kelamin' && norm !== 'nama_orang_tua';
                })
                .map(col => (
                  <th key={col} className="px-6 py-4 font-medium capitalize">{col.replace(/_/g, ' ')}</th>
                ))}
              <th className="px-6 py-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {paginatedStudents.length === 0 ? (
              <tr>
                <td 
                  colSpan={
                    ((role === 'guru' ? 1 : 0) + (filterClass === 'Alumni' ? 2 : 0) + 8) + 
                    (settings?.custom_student_columns || [])
                      .filter(col => {
                        const norm = col.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                        return norm !== 'jenis_kelamin' && norm !== 'nama_orang_tua';
                      }).length
                  } 
                  className="px-6 py-12 text-center text-slate-500"
                >
                  Belum ada data siswa. Silakan tambah atau import data.
                </td>
              </tr>
            ) : (
              paginatedStudents.map((student, index) => (
                <tr key={student.id} className={`transition-colors ${selectedStudents.includes(student.id) ? 'bg-indigo-500/10 hover:bg-indigo-500/20' : 'hover:bg-slate-700/30'}`}>
                  {role === 'guru' && (
                    <td className="px-6 py-4 text-center">
                      <input 
                         type="checkbox" 
                         className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                         checked={selectedStudents.includes(student.id)}
                         onChange={(e) => {
                           if (e.target.checked) {
                             setSelectedStudents([...selectedStudents, student.id]);
                           } else {
                             setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                           }
                         }}
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                  <td className="px-6 py-4 font-medium text-slate-200">{student.nama}</td>
                  <td className="px-6 py-4 text-slate-400">{student.nisn || '-'}</td>
                  <td className="px-6 py-4 text-slate-400">
                    {student.jenis_kelamin ? (
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${student.jenis_kelamin === 'Laki-laki' ? 'bg-blue-500/15 text-blue-400' : 'bg-pink-500/15 text-pink-400'}`}>
                        {student.jenis_kelamin}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    <span className="px-2.5 py-1 bg-slate-700 text-slate-300 rounded-lg text-xs">{student.kelas || '-'}</span>
                  </td>
                  {filterClass === 'Alumni' && (
                    <>
                      <td className="px-6 py-4 text-emerald-400 font-medium">
                        {formatGraduationDate(student.tanggal_lulus)}
                      </td>
                      <td className="px-6 py-4 text-indigo-400 font-mono">
                        {student.tahun_ajaran_lulus || '-'}
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 text-slate-400">
                    {student.nama_orang_tua || [student.nama_ayah, student.nama_ibu].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{student.no_telp_ortu || '-'}</td>
                  {(settings?.custom_student_columns || [])
                    .filter(col => {
                      const norm = col.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                      return norm !== 'jenis_kelamin' && norm !== 'nama_orang_tua';
                    })
                    .map(col => {
                      const normalizedCol = col.toLowerCase().replace(/\s+/g, '_');
                      return (
                        <td key={col} className="px-6 py-4 text-slate-300">{student[normalizedCol] || student[col] || '-'}</td>
                      );
                    })}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => setSelectedProfileStudent(student)} 
                        className="text-emerald-400 hover:text-emerald-300 p-1.5 hover:bg-emerald-500/10 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer" 
                        title="Buka Profil & Grafik Perkembangan Nilai"
                      >
                        <User size={15} />
                        <span>Profil</span>
                      </button>
                      
                      {role === 'guru' && (
                        student.kelas !== 'Alumni' ? (
                          <>
                            <button onClick={() => { setIsEditing(student.id); setFormData(student); }} className="text-indigo-400 hover:text-indigo-300 p-1.5 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer" title="Edit Siswa">
                              <Edit2 size={15} />
                            </button>
                            <button onClick={() => setStudentToDelete(student.id)} className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer" title="Hapus Siswa">
                              <Trash2 size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-slate-500 italic bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/50">Alumni</span>
                            <button onClick={() => setStudentToDelete(student.id)} className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer" title="Hapus Siswa">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={filteredStudents.length}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemName="siswa"
      />

      {/* Modal Hapus Siswa */}
      {studentToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-sm w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100">Hapus Data</h3>
              <button onClick={() => setStudentToDelete(null)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm">Apakah Anda yakin ingin menghapus data siswa ini?</p>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setStudentToDelete(null)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button onClick={() => handleDelete(studentToDelete)} className="px-5 py-2 text-sm font-medium bg-rose-500 text-white rounded-xl hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-colors">Hapus</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Edit / Tambah Siswa */}
      {isEditing && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100">{isEditing === 'new' ? 'Tambah Siswa' : 'Edit Siswa'}</h3>
              <button onClick={() => setIsEditing(null)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <form id="student-form" onSubmit={handleSave} className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">No Urut</label>
                  <input type="number" required value={formData.no ?? ''} onChange={e => setFormData({...formData, no: parseInt(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">NISN</label>
                  <input type="text" value={formData.nisn ?? ''} onChange={e => setFormData({...formData, nisn: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Lengkap</label>
                  <input type="text" required value={formData.nama ?? ''} onChange={e => setFormData({...formData, nama: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">NIPD</label>
                  <input type="text" value={formData.nipd ?? ''} onChange={e => setFormData({...formData, nipd: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Kelas</label>
                  <input type="text" required value={formData.kelas ?? ''} onChange={e => setFormData({...formData, kelas: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Jenis Kelamin</label>
                  <select 
                    value={formData.jenis_kelamin ?? ''} 
                    onChange={e => setFormData({...formData, jenis_kelamin: e.target.value})} 
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all [color-scheme:dark]"
                  >
                    <option value="">Pilih Jenis Kelamin</option>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Tempat Lahir</label>
                  <input type="text" value={formData.tempat_lahir ?? ''} onChange={e => setFormData({...formData, tempat_lahir: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Tanggal Lahir</label>
                  <input type="date" value={formData.tanggal_lahir ?? ''} onChange={e => setFormData({...formData, tanggal_lahir: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Ayah</label>
                  <input type="text" value={formData.nama_ayah ?? ''} onChange={e => setFormData({...formData, nama_ayah: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Ibu</label>
                  <input type="text" value={formData.nama_ibu ?? ''} onChange={e => setFormData({...formData, nama_ibu: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Orang Tua / Wali</label>
                  <input type="text" value={formData.nama_orang_tua ?? ''} onChange={e => setFormData({...formData, nama_orang_tua: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">No Telepon Ortu</label>
                  <input type="text" value={formData.no_telp_ortu ?? ''} onChange={e => setFormData({...formData, no_telp_ortu: e.target.value})} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" />
                </div>
                {(settings?.custom_student_columns || [])
                  .filter(col => {
                    const norm = col.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                    return norm !== 'jenis_kelamin' && norm !== 'nama_orang_tua';
                  })
                  .map(col => {
                    const normCol = col.toLowerCase().replace(/\s+/g, '_');
                    return (
                      <div key={col} className="col-span-2">
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider capitalize">{col.replace(/_/g, ' ')}</label>
                        <input 
                          type="text" 
                          value={formData[normCol] ?? formData[col] ?? ''} 
                          onChange={e => setFormData({...formData, [normCol]: e.target.value})} 
                          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                        />
                      </div>
                    );
                  })}
              </form>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsEditing(null)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button form="student-form" type="submit" className="px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 shadow-lg shadow-indigo-500/20 transition-colors">Simpan</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Naik Kelas Massal / Kolektif */}
      {isPromoting && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100">Kolektif Naik Kelas</h3>
              <button onClick={() => setIsPromoting(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-300 text-sm">
                Anda akan menaikkan kelas untuk{' '}
                <span className="font-bold text-indigo-400">
                  {selectedStudents.length > 0 
                    ? `${selectedStudents.length} siswa terpilih` 
                    : `${filteredStudents.length} siswa yang sedang ditampilkan`}
                </span>.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nama Kelas Tujuan</label>
                {dbClasses.length > 0 ? (
                  <div className="space-y-3">
                    <select
                      value={isCustomClass ? 'CUSTOM' : selectedTargetClass}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'CUSTOM') {
                          setIsCustomClass(true);
                          setSelectedTargetClass('CUSTOM');
                          setTargetClassName('');
                        } else {
                          setIsCustomClass(false);
                          setSelectedTargetClass(val);
                          setTargetClassName(val);
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all cursor-pointer"
                    >
                      <option value="" disabled>-- Pilih Kelas Tujuan --</option>
                      {dbClasses.map(c => (
                        <option key={c} value={c}>Kelas {c}</option>
                      ))}
                      <option value="CUSTOM">➕ Buat/Ketik Kelas Baru...</option>
                    </select>

                    {isCustomClass && (
                      <input 
                        type="text" 
                        value={customTargetClass} 
                        onChange={e => {
                          setCustomTargetClass(e.target.value);
                          setTargetClassName(e.target.value);
                        }} 
                        placeholder="Ketik nama kelas baru (misal: 4, 8B, 9A, dll.)" 
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                        required
                        autoFocus
                      />
                    )}
                  </div>
                ) : (
                  <input 
                    type="text" 
                    value={targetClassName} 
                    onChange={e => setTargetClassName(e.target.value)} 
                    placeholder="Contoh: kelas 4, 8B, 9A, dll." 
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all" 
                    required
                  />
                )}
              </div>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsPromoting(false)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button 
                onClick={async () => {
                  if (!targetClassName.trim()) {
                    toast.error('Masukkan nama kelas tujuan');
                    return;
                  }
                  const targetStudents = selectedStudents.length > 0 
                    ? filteredStudents.filter(s => selectedStudents.includes(s.id))
                    : filteredStudents;

                  for (const s of targetStudents) {
                    const updated = { ...s, kelas: targetClassName.trim() };
                    await store.students.setItem(updated.id, updated);
                  }
                  loadStudents();
                  setSelectedStudents([]);
                  setIsPromoting(false);
                  toast.success(`Berhasil menaikkan kelas ${targetStudents.length} siswa ke ${targetClassName.trim()}`);
                }}
                className="px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 shadow-lg shadow-indigo-500/20 transition-colors"
              >
                Proses Naik Kelas
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Luluskan Massal / Kolektif */}
      {isGraduating && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-sm w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100">Kolektif Kelulusan</h3>
              <button onClick={() => setIsGraduating(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm">
                Apakah Anda yakin ingin meluluskan{' '}
                <span className="font-bold text-emerald-400">
                  {selectedStudents.length > 0 
                    ? `${selectedStudents.length} siswa terpilih` 
                    : `${filteredStudents.length} siswa yang ditampilkan`}
                </span>{' '}
                ke daftar Alumni?
              </p>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                Aksi ini akan mengubah status kelas mereka menjadi <span className="font-semibold text-slate-300">"Alumni"</span> dan memindahkannya dari kelas aktif.
              </p>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsGraduating(false)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button 
                onClick={async () => {
                  const targetStudents = selectedStudents.length > 0 
                    ? filteredStudents.filter(s => selectedStudents.includes(s.id))
                    : filteredStudents;

                  for (const s of targetStudents) {
                    const updated = { 
                      ...s, 
                      kelas: 'Alumni',
                      tanggal_lulus: new Date().toISOString().split('T')[0],
                      tahun_ajaran_lulus: semester
                    };
                    await store.students.setItem(updated.id, updated);
                  }
                  loadStudents();
                  setSelectedStudents([]);
                  setIsGraduating(false);
                  toast.success(`Berhasil meluluskan ${targetStudents.length} siswa ke Alumni`);
                }}
                className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 transition-colors"
              >
                Luluskan Siswa
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Hapus Beberapa Siswa Terpilih */}
      {isDeletingSelected && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-sm w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100">Hapus Siswa Terpilih</h3>
              <button onClick={() => setIsDeletingSelected(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm">Apakah Anda yakin ingin menghapus <span className="font-bold text-rose-400">{selectedStudents.length} siswa</span> yang terpilih?</p>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">Aksi ini bersifat permanen dan tidak dapat dibatalkan.</p>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsDeletingSelected(false)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button onClick={handleDeleteSelected} className="px-5 py-2 text-sm font-medium bg-rose-500 text-white rounded-xl hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-colors">Hapus Terpilih</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Hapus Seluruh Data Siswa */}
      {isDeletingAll && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-sm w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-rose-400">Peringatan Kritis!</h3>
              <button onClick={() => setIsDeletingAll(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm">Apakah Anda benar-benar yakin ingin menghapus <span className="font-bold text-rose-400">SELURUH DATA SISWA ({students.length} siswa)</span> dari database?</p>
              <p className="text-rose-400/80 text-xs mt-3 leading-relaxed bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 font-medium">
                Peringatan: Seluruh data siswa akan terhapus secara permanen dari sistem. Pastikan Anda telah melakukan ekspor data (Excel/PDF) terlebih dahulu jika diperlukan.
              </p>
            </div>
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end gap-3">
              <button onClick={() => setIsDeletingAll(false)} className="px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
              <button onClick={handleDeleteAll} className="px-5 py-2 text-sm font-medium bg-rose-600 text-white rounded-xl hover:bg-rose-500 shadow-lg shadow-rose-500/20 transition-colors">Hapus Semua Data</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Kelola Kolom Tambahan */}
      {isManagingColumns && createPortal(
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <h3 className="font-semibold text-lg text-slate-100 flex items-center gap-2">
                <SettingsIcon size={18} className="text-indigo-400" />
                Kelola Kolom Tambahan
              </h3>
              <button onClick={() => setIsManagingColumns(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 p-1.5 rounded-lg transition-colors">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <form onSubmit={handleAddCustomColumn} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Tambah Kolom Baru</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Contoh: hobi, catatan, dll." 
                    value={newColumnName}
                    onChange={e => setNewColumnName(e.target.value)}
                    className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all"
                    required
                  />
                  <button type="submit" className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer">
                    Tambah
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Daftar Kolom Aktif</h4>
                <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl divide-y divide-slate-700/50 max-h-48 overflow-y-auto custom-scrollbar">
                  {(settings?.custom_student_columns || []).map(col => (
                    <div key={col} className="flex justify-between items-center p-3 text-sm">
                      <span className="text-slate-300 font-medium capitalize">{col.replace(/_/g, ' ')}</span>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteCustomColumn(col)}
                        className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Hapus Kolom"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {(settings?.custom_student_columns || []).length === 0 && (
                    <p className="text-xs text-slate-500 italic p-4 text-center">Belum ada kolom tambahan.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end">
              <button onClick={() => setIsManagingColumns(false)} className="px-5 py-2 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-colors cursor-pointer">Tutup</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Detail Profil Siswa & Grafik Perkembangan Nilai */}
      {selectedProfileStudent && createPortal(
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-slate-800 rounded-3xl border border-slate-700/60 shadow-2xl max-w-5xl w-full flex flex-col max-h-[92vh] overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-slate-100">{selectedProfileStudent.nama}</h3>
                  <p className="text-xs text-slate-400">ID Siswa: {selectedProfileStudent.id.substring(0, 8)}... | Kelas {selectedProfileStudent.kelas}</p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedProfileStudent(null); setMapelFilter('Semua'); setSemesterFilter('Semua'); setJenisNilaiFilter('Semua'); }} 
                className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 p-2 rounded-xl transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            {/* Content Area */}
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1 bg-slate-800/40">
              
              {/* Profile Details Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/40 border border-slate-700/40 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                    <Award size={12} className="text-indigo-400" />
                    NISN / NIPD
                  </span>
                  <p className="text-sm font-semibold text-slate-200 font-mono">
                    {selectedProfileStudent.nisn || '-'} / {selectedProfileStudent.nipd || '-'}
                  </p>
                </div>
                
                <div className="bg-slate-900/40 border border-slate-700/40 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                    <Calendar size={12} className="text-indigo-400" />
                    Tempat, Tanggal Lahir
                  </span>
                  <p className="text-sm font-semibold text-slate-200">
                    {selectedProfileStudent.tempat_lahir || '-'}, {selectedProfileStudent.tanggal_lahir || '-'}
                  </p>
                </div>

                <div className="bg-slate-900/40 border border-slate-700/40 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                    <User size={12} className="text-indigo-400" />
                    Orang Tua & Telepon
                  </span>
                  <p className="text-sm font-semibold text-slate-200">
                    {selectedProfileStudent.nama_ayah || selectedProfileStudent.nama_ibu || 'Orang Tua'} ({selectedProfileStudent.no_telp_ortu || '-'})
                  </p>
                </div>
              </div>

              {/* Data Extraction and Calculation */}
              {(() => {
                // Get all grades for this student
                const studentGrades = grades.filter(g => g.id_siswa === selectedProfileStudent.id);
                
                // Filter student grades based on all selected filters
                const filteredGrades = studentGrades.filter(g => {
                  const matchMapel = mapelFilter === 'Semua' || g.mata_pelajaran === mapelFilter;
                  const matchSemester = semesterFilter === 'Semua' || g.semester === semesterFilter;
                  const matchJenis = jenisNilaiFilter === 'Semua' || g.jenis_nilai === jenisNilaiFilter;
                  return matchMapel && matchSemester && matchJenis;
                });

                // Metrics
                const totalGradesCount = filteredGrades.length;
                const totalGradesSum = filteredGrades.reduce((sum, g) => sum + Number(g.nilai), 0);
                const averageGrade = totalGradesCount > 0 ? Math.round((totalGradesSum / totalGradesCount) * 10) / 10 : 0;
                
                const gradesValues = filteredGrades.map(g => Number(g.nilai));
                const highestGrade = gradesValues.length > 0 ? Math.max(...gradesValues) : 0;
                const lowestGrade = gradesValues.length > 0 ? Math.min(...gradesValues) : 0;

                // Group grades by month code ('01' to '12') for the chart
                const monthSum: Record<string, { sum: number, count: number }> = {};
                filteredGrades.forEach(g => {
                  if (!g.tanggal) return;
                  const parts = g.tanggal.split('-');
                  if (parts.length < 2) return;
                  const monthCode = parts[1];
                  if (!monthSum[monthCode]) {
                    monthSum[monthCode] = { sum: 0, count: 0 };
                  }
                  monthSum[monthCode].sum += Number(g.nilai);
                  monthSum[monthCode].count += 1;
                });
                
                const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                const chartData = monthNames.map((name, index) => {
                  const code = String(index + 1).padStart(2, '0');
                  const monthData = monthSum[code];
                  return {
                    name,
                    'Nilai': monthData ? Math.round((monthData.sum / monthData.count) * 10) / 10 : null
                  };
                }).filter(item => item.Nilai !== null);

                return (
                  <>
                    {/* Metrics Dashboard (Bento Grid) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Rata-rata */}
                      <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border border-indigo-500/20 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Rata-rata Nilai</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-indigo-400">{averageGrade || '-'}</span>
                          <span className="text-xs text-slate-500">/ 100</span>
                        </div>
                        <div className="absolute top-2 right-2 p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs font-bold">
                          Avg
                        </div>
                      </div>

                      {/* Tertinggi */}
                      <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Nilai Tertinggi</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-emerald-400">{highestGrade || '-'}</span>
                          <span className="text-xs text-slate-500">Max</span>
                        </div>
                        <div className="absolute top-2 right-2 p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold">
                          Max
                        </div>
                      </div>

                      {/* Terendah */}
                      <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/20 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Nilai Terendah</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-rose-400">{lowestGrade || '-'}</span>
                          <span className="text-xs text-slate-500">Min</span>
                        </div>
                        <div className="absolute top-2 right-2 p-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs font-bold">
                          Min
                        </div>
                      </div>

                      {/* Total */}
                      <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Jumlah Penilaian</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-cyan-400">{totalGradesCount}</span>
                          <span className="text-xs text-slate-500">Entri</span>
                        </div>
                        <div className="absolute top-2 right-2 p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg text-xs font-bold">
                          Qty
                        </div>
                      </div>
                    </div>

                    {/* Grafik Perkembangan Nilai Siswa */}
                    <div className="bg-slate-900/30 border border-slate-700/40 p-5 rounded-3xl space-y-4">
                      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/10">
                            <TrendingUp size={16} />
                          </div>
                          <h4 className="text-sm font-semibold text-slate-200">Grafik Tren Hasil Belajar Bulanan</h4>
                        </div>
                        
                        {/* Interactive Filters Container */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full lg:w-auto animate-fade-in">
                          {/* Filter Pelajaran */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Mata Pelajaran:</span>
                            <select
                              value={mapelFilter}
                              onChange={(e) => setMapelFilter(e.target.value)}
                              className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="Semua">Semua Pelajaran (Rata-rata)</option>
                              {(settings?.mata_pelajaran || []).map((mapel) => (
                                <option key={mapel} value={mapel}>{mapel}</option>
                              ))}
                            </select>
                          </div>

                          {/* Filter Semester */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Semester:</span>
                            <select
                              value={semesterFilter}
                              onChange={(e) => setSemesterFilter(e.target.value)}
                              className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="Semua">Semua Semester</option>
                              {(settings?.daftar_semester || ['Ganjil 2026', 'Genap 2026']).map((sem) => (
                                <option key={sem} value={sem}>{sem}</option>
                              ))}
                            </select>
                          </div>

                          {/* Filter Tipe Nilai */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Jenis Nilai:</span>
                            <select
                              value={jenisNilaiFilter}
                              onChange={(e) => setJenisNilaiFilter(e.target.value)}
                              className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="Semua">Semua Jenis Nilai</option>
                              <option value="Harian">Harian</option>
                              <option value="Tugas">Tugas</option>
                              <option value="Ujian">Ujian</option>
                            </select>
                          </div>

                          {/* Filter Jenis Grafik */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Bentuk Grafik:</span>
                            <select
                              value={chartType}
                              onChange={(e) => setChartType(e.target.value as any)}
                              className="text-xs bg-slate-800 border border-slate-700 text-indigo-400 font-semibold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="line">📈 Garis / Area</option>
                              <option value="bar">📊 Batang (Bar)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Recharts Area Chart */}
                      <div className="h-64 w-full pt-2">
                        {chartData.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 border border-dashed border-slate-700/60 rounded-2xl bg-slate-900/10">
                            <LineChart size={28} className="text-slate-600 animate-pulse" />
                            <p className="text-xs">Tidak ada data nilai yang sesuai dengan kombinasi filter saat ini.</p>
                            <p className="text-[10px] text-slate-600">Tip: Atur ulang filter atau pastikan tanggal telah diisi saat menginput nilai.</p>
                          </div>
                        ) : chartType === 'bar' ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                              <XAxis 
                                dataKey="name" 
                                stroke="#94a3b8" 
                                fontSize={10}
                                tickLine={false}
                              />
                              <YAxis 
                                stroke="#94a3b8" 
                                fontSize={10}
                                domain={[0, 100]}
                                tickLine={false}
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '12px' }}
                                labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}
                                itemStyle={{ color: '#f8fafc', fontSize: '12px' }}
                              />
                              <Bar 
                                dataKey="Nilai" 
                                fill="#6366f1"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={45}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorNilai" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                              <XAxis 
                                dataKey="name" 
                                stroke="#94a3b8" 
                                fontSize={10}
                                tickLine={false}
                              />
                              <YAxis 
                                stroke="#94a3b8" 
                                fontSize={10}
                                domain={[0, 100]}
                                tickLine={false}
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '12px' }}
                                labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}
                                itemStyle={{ color: '#f8fafc', fontSize: '12px' }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="Nilai" 
                                stroke="#6366f1" 
                                strokeWidth={3} 
                                fillOpacity={1} 
                                fill="url(#colorNilai)" 
                                activeDot={{ r: 6, stroke: '#818cf8', strokeWidth: 2 }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* Detailed Data List */}
                    <div className="bg-slate-900/30 border border-slate-700/40 p-5 rounded-3xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                            <Activity size={16} />
                          </div>
                          <h4 className="text-sm font-semibold text-slate-200">Riwayat Detail Penilaian Terfilter ({filteredGrades.length})</h4>
                        </div>
                      </div>

                      <div className="overflow-x-auto max-h-52 overflow-y-auto border border-slate-700/40 rounded-xl custom-scrollbar">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900/60 text-slate-400 sticky top-0 border-b border-slate-700/50 z-10 font-sans">
                            <tr>
                              <th className="px-4 py-3 font-semibold text-center w-12">No</th>
                              <th className="px-4 py-3 font-semibold">Mata Pelajaran</th>
                              <th className="px-4 py-3 font-semibold">Semester</th>
                              <th className="px-4 py-3 font-semibold text-center w-24">Tipe</th>
                              <th className="px-4 py-3 font-semibold">Nama Kolom / Ujian</th>
                              <th className="px-4 py-3 font-semibold">Tanggal</th>
                              <th className="px-4 py-3 font-semibold text-center w-20">Nilai</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/40 text-slate-300">
                            {filteredGrades.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 italic">Belum ada data nilai yang sesuai dengan filter di atas.</td>
                              </tr>
                            ) : (
                              filteredGrades.map((g, idx) => {
                                let gradeBadgeColor = 'bg-rose-500/15 text-rose-400 border border-rose-500/20';
                                if (g.nilai >= 80) {
                                  gradeBadgeColor = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
                                } else if (g.nilai >= 70) {
                                  gradeBadgeColor = 'bg-amber-500/15 text-amber-400 border border-amber-500/20';
                                }
                                
                                return (
                                  <tr key={g.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                                    <td className="px-4 py-2.5 font-medium text-slate-200">{g.mata_pelajaran || '-'}</td>
                                    <td className="px-4 py-2.5 text-[11px] text-slate-400">{g.semester}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                        g.jenis_nilai === 'Ujian' ? 'bg-indigo-500/10 text-indigo-400' :
                                        g.jenis_nilai === 'Tugas' ? 'bg-cyan-500/10 text-cyan-400' :
                                        'bg-amber-500/10 text-amber-400'
                                      }`}>
                                        {g.jenis_nilai}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-medium">{g.nama_kolom}</td>
                                    <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">{g.tanggal || '-'}</td>
                                    <td className="px-4 py-2.5 text-center font-bold">
                                      <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs ${gradeBadgeColor}`}>
                                        {g.nilai}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })()}

            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/80 flex justify-end">
              <button 
                onClick={() => { setSelectedProfileStudent(null); setMapelFilter('Semua'); setSemesterFilter('Semua'); setJenisNilaiFilter('Semua'); }} 
                className="px-5 py-2 text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Tutup Profil
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
