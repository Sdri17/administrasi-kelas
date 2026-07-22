import React, { useState } from 'react';
import { BookOpen, Users, FileSpreadsheet, Settings, Copy, Check, ClipboardList, AlertCircle } from 'lucide-react';

const GOOGLE_APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Cache students once for fast retrieval in both actions
    const studentMap = getStudentMap(ss);

    // 1. DELTA SYNC ACTION (Super fast, incremental changes only)
    if (payload.action === 'delta') {
      const changes = payload.changes;
      if (changes && Array.isArray(changes)) {
        // Build a temporary student map from incoming students in payload changes
        const tempStudentMap = {};
        changes.forEach(change => {
          if (change.store === 'students' && change.action === 'update' && change.data) {
            tempStudentMap[change.id] = change.data;
          }
        });

        // Store sheet ID maps to avoid searching repeatedly
        const sheetIdMaps = {};

        changes.forEach(change => {
          const { store: storeName, id, action, data } = change;
          
          if (storeName === 'students') {
            const isAlumni = data && data.kelas && data.kelas.toLowerCase() === 'alumni';
            const activeSheet = ss.getSheetByName('Siswa') || ensureSheet(ss, 'Siswa');
            const alumniSheet = ss.getSheetByName('Alumni') || ensureSheet(ss, 'Alumni');
            
            // Delete from both first to prevent duplicate entries
            const rowInActive = findRowById(activeSheet, id);
            if (rowInActive !== -1) activeSheet.deleteRow(rowInActive);
            
            const rowInAlumni = findRowById(alumniSheet, id);
            if (rowInAlumni !== -1) alumniSheet.deleteRow(rowInAlumni);
            
            if (action === 'update' && data) {
              const targetSheet = isAlumni ? alumniSheet : activeSheet;
              
              // Ensure we have standard headers
              const settings = readSettings(ss);
              const customCols = (settings && settings.custom_student_columns) ? settings.custom_student_columns : [];
        const baseHeaders = ['ID', 'No', 'Nama', 'NISN', 'NIPD', 'Jenis Kelamin', 'Tempat Lahir', 'Tanggal Lahir', 'Kelas', 'Nama Ayah', 'Nama Ibu', 'No Telp Ortu', 'Semester'].concat(customCols);
              if (targetSheet.getLastRow() === 0) {
                targetSheet.appendRow(baseHeaders);
              }
              
              const rowValues = [
                data.id || '',
                data.no || '',
                data.nama || '',
                data.nisn || '',
                data.nipd || '',
                data.jenis_kelamin || data.jk || '',
                data.tempat_lahir || '',
                data.tanggal_lahir || '',
                data.kelas || '',
                data.nama_ayah || '',
                data.nama_ibu || '',
                data.no_telp_ortu || '',
                data.semester || ''
              ];
              
              // Handle custom dynamic columns automatically
              const knownKeys = ['id', 'no', 'nama', 'nisn', 'nipd', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir', 'kelas', 'nama_ayah', 'nama_ibu', 'nama_orang_tua', 'no_telp_ortu', 'semester', 'tanggal_lulus', 'tahun_ajaran_lulus'];
              Object.keys(data).forEach(key => {
                if (!knownKeys.includes(key) && key.trim() !== '') {
                  const colIdx = ensureHeader(targetSheet, key);
                  rowValues[colIdx - 1] = data[key] || '';
                }
              });
              
              targetSheet.appendRow(rowValues);
            }
          } 
          
          else if (storeName === 'grades') {
            if (action === 'delete') {
              const sheets = ss.getSheets();
              sheets.forEach(sheet => {
                if (sheet.getName().indexOf('Nilai - ') === 0) {
                  const rowIdx = findRowById(sheet, id);
                  if (rowIdx !== -1) sheet.deleteRow(rowIdx);
                }
              });
            } else if (action === 'update' && data) {
              const mapel = data.mata_pelajaran || 'Umum';
              const sheetName = 'Nilai - ' + mapel;
              const sheet = ss.getSheetByName(sheetName) || ensureSheet(ss, sheetName);
              
              if (sheet.getLastRow() === 0) {
                sheet.appendRow(['ID', 'ID Siswa', 'NISN', 'Nama', 'Jenis Nilai', 'Nama Kolom', 'Nilai', 'Semester', 'Mata Pelajaran']);
              }
              
              const sInfo = getStudentInfo(studentMap, data.id_siswa, tempStudentMap);
              const rowIdx = findRowById(sheet, id);
              const rowValues = [
                data.id || '',
                data.id_siswa || '',
                sInfo.nisn || '',
                sInfo.nama || '',
                data.jenis_nilai || '',
                data.nama_kolom || '',
                data.nilai || 0,
                data.semester || '',
                data.mata_pelajaran || ''
              ];
              
              if (rowIdx !== -1) {
                sheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
              } else {
                sheet.appendRow(rowValues);
              }
            }
          } 
          
          else if (storeName === 'attendance') {
            const sheet = ss.getSheetByName('Absensi') || ensureSheet(ss, 'Absensi');
            if (sheet.getLastRow() === 0) {
              sheet.appendRow(['ID', 'ID Siswa', 'NISN', 'Nama', 'Tanggal', 'Status', 'Semester', 'Mata Pelajaran']);
            }
            
            // Use cached row mapping for high performance
            if (!sheetIdMaps['Absensi']) {
              sheetIdMaps['Absensi'] = getSheetIdMap(sheet);
            }
            const idMap = sheetIdMaps['Absensi'];
            const rowIdx = idMap[id] || -1;
            
            if (action === 'delete') {
              if (rowIdx !== -1) {
                sheet.deleteRow(rowIdx);
                // Invalidate cache to handle shift
                sheetIdMaps['Absensi'] = getSheetIdMap(sheet);
              }
            } else if (action === 'update' && data) {
              const sInfo = getStudentInfo(studentMap, data.id_siswa, tempStudentMap);
              const rowValues = [
                data.id || '',
                data.id_siswa || '',
                sInfo.nisn || '',
                sInfo.nama || '',
                data.tanggal || '',
                data.status || '',
                data.semester || '',
                data.mata_pelajaran || ''
              ];
              if (rowIdx !== -1) {
                sheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
              } else {
                sheet.appendRow(rowValues);
                // Update map dynamically
                idMap[id] = sheet.getLastRow();
              }
            }
          }
          
          else if (storeName === 'roster') {
            const sheet = ss.getSheetByName('Roster') || ensureSheet(ss, 'Roster');
            if (sheet.getLastRow() === 0) {
              sheet.appendRow(['ID', 'Hari', 'Jam Mulai', 'Jam Selesai', 'Mata Pelajaran', 'Guru', 'Kelas', 'Semester']);
            }
            
            const rowIdx = findRowById(sheet, id);
            if (action === 'delete') {
              if (rowIdx !== -1) sheet.deleteRow(rowIdx);
            } else if (action === 'update' && data) {
              const rowValues = [
                data.id || '',
                data.hari || '',
                data.jam_mulai || '',
                data.jam_selesai || '',
                data.mata_pelajaran || '',
                data.guru || '',
                data.kelas || '',
                data.semester || ''
              ];
              if (rowIdx !== -1) {
                sheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
              } else {
                sheet.appendRow(rowValues);
              }
            }
          }
          
          else if (storeName === 'piket') {
            const sheet = ss.getSheetByName('Piket') || ensureSheet(ss, 'Piket');
            if (sheet.getLastRow() === 0) {
              sheet.appendRow(['ID', 'Hari', 'ID Siswa', 'NISN', 'Nama', 'Kelas', 'Semester']);
            }
            
            const rowIdx = findRowById(sheet, id);
            if (action === 'delete') {
              if (rowIdx !== -1) sheet.deleteRow(rowIdx);
            } else if (action === 'update' && data) {
              const sInfo = getStudentInfo(studentMap, data.id_siswa, tempStudentMap);
              const rowValues = [
                data.id || '',
                data.hari || '',
                data.id_siswa || '',
                sInfo.nisn || '',
                sInfo.nama || '',
                data.kelas || '',
                data.semester || ''
              ];
              if (rowIdx !== -1) {
                sheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
              } else {
                sheet.appendRow(rowValues);
              }
            }
          }

          else if (storeName === 'raporCapaian') {
            const sheet = ss.getSheetByName('Rapor Capaian') || ensureSheet(ss, 'Rapor Capaian');
            if (sheet.getLastRow() === 0) {
              sheet.appendRow(['ID', 'ID Siswa', 'Semester', 'Capaian Kompetensi', 'Catatan Wali Kelas', 'Saran Orang Tua', 'Tinggi Badan', 'Berat Badan', 'Pendengaran', 'Penglihatan', 'Gigi']);
            }
            
            const rowIdx = findRowById(sheet, id);
            if (action === 'delete') {
              if (rowIdx !== -1) sheet.deleteRow(rowIdx);
            } else if (action === 'update' && data) {
              const rowValues = [
                data.id || '',
                data.id_siswa || '',
                data.semester || '',
                data.capaian_kompetensi || '',
                data.catatan_wali_kelas || '',
                data.saran_orang_tua || '',
                data.tinggi_badan || '',
                data.berat_badan || '',
                data.pendengaran || '',
                data.penglihatan || '',
                data.gigi || ''
              ];
              if (rowIdx !== -1) {
                sheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
              } else {
                sheet.appendRow(rowValues);
              }
            }
          }
        });
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    } 

    // 2. FULL PUSH ACTION (Batch-based high-speed overwrite)
    else if (payload.action === 'push') {
        const { students, grades, attendance, roster, piket, raporCapaian, users, settings } = payload.data;
      
      ensureSheet(ss, 'Siswa');
      ensureSheet(ss, 'Absensi');
      ensureSheet(ss, 'Pengguna');
      ensureSheet(ss, 'Settings');
      ensureSheet(ss, 'Alumni');
      ensureSheet(ss, 'Roster');
      ensureSheet(ss, 'Piket');
      ensureSheet(ss, 'Rapor Capaian');

      // Siswa
      if (students && Array.isArray(students)) {
        const siswaSheet = ss.getSheetByName('Siswa');
        const alumniSheet = ss.getSheetByName('Alumni');
        
        siswaSheet.clear();
        alumniSheet.clear();
        
        const customCols = (settings && settings.custom_student_columns) ? settings.custom_student_columns : [];
        const baseHeaders = ['ID', 'No', 'Nama', 'NISN', 'NIPD', 'Jenis Kelamin', 'Tempat Lahir', 'Tanggal Lahir', 'Kelas', 'Nama Ayah', 'Nama Ibu', 'No Telp Ortu', 'Semester'].concat(customCols);
        
        const siswaRows = [baseHeaders];
        const alumniRows = [baseHeaders];
        
        students.forEach(s => {
          const row = [
            s.id || '',
            s.no || '',
            s.nama || '',
            s.nisn || '',
            s.nipd || '',
            s.jenis_kelamin || s.jk || '',
            s.tempat_lahir || '',
            s.tanggal_lahir || '',
            s.kelas || '',
            s.nama_ayah || '',
            s.nama_ibu || '',
            s.no_telp_ortu || '',
            s.semester || ''
          ];
          customCols.forEach(col => {
            const normCol = col.toLowerCase().replace(/\s+/g, '_');
            row.push(s[normCol] || s[col] || '');
          });
          if (s.kelas && s.kelas.toLowerCase() === 'alumni') {
            alumniRows.push(row);
          } else {
            siswaRows.push(row);
          }
        });
        
        if (siswaRows.length > 1) {
          siswaSheet.getRange(1, 1, siswaRows.length, baseHeaders.length).setValues(siswaRows);
        } else {
          siswaSheet.appendRow(baseHeaders);
        }
        
        if (alumniRows.length > 1) {
          alumniSheet.getRange(1, 1, alumniRows.length, baseHeaders.length).setValues(alumniRows);
        } else {
          alumniSheet.appendRow(baseHeaders);
        }
      }

      // Absensi
      if (attendance && Array.isArray(attendance)) {
        const attSheet = ss.getSheetByName('Absensi');
        attSheet.clear();
        const headers = ['ID', 'ID Siswa', 'NISN', 'Nama', 'Tanggal', 'Status', 'Semester', 'Mata Pelajaran'];
        const rows = [headers];
        
        attendance.forEach(a => {
          const s = studentMap[a.id_siswa] || {};
          rows.push([
            a.id || '',
            a.id_siswa || '',
            s.nisn || '',
            s.nama || '',
            a.tanggal || '',
            a.status || '',
            a.semester || '',
            a.mata_pelajaran || ''
          ]);
        });
        
        if (rows.length > 1) {
          attSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
        } else {
          attSheet.appendRow(headers);
        }
      }

      // Roster
      if (roster && Array.isArray(roster)) {
        const rosterSheet = ss.getSheetByName('Roster');
        rosterSheet.clear();
        const headers = ['ID', 'Hari', 'Jam Mulai', 'Jam Selesai', 'Mata Pelajaran', 'Guru', 'Kelas', 'Semester'];
        const rows = [headers];
        
        roster.forEach(r => {
          rows.push([
            r.id || '',
            r.hari || '',
            r.jam_mulai || '',
            r.jam_selesai || '',
            r.mata_pelajaran || '',
            r.guru || '',
            r.kelas || '',
            r.semester || ''
          ]);
        });
        
        if (rows.length > 1) {
          rosterSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
        } else {
          rosterSheet.appendRow(headers);
        }
      }

      // Piket
      if (piket && Array.isArray(piket)) {
        const piketSheet = ss.getSheetByName('Piket');
        piketSheet.clear();
        const headers = ['ID', 'Hari', 'ID Siswa', 'NISN', 'Nama', 'Kelas', 'Semester'];
        const rows = [headers];
        
        piket.forEach(p => {
          const s = studentMap[p.id_siswa] || {};
          rows.push([
            p.id || '',
            p.hari || '',
            p.id_siswa || '',
            s.nisn || '',
            s.nama || '',
            p.kelas || '',
            p.semester || ''
          ]);
        });
        
        if (rows.length > 1) {
          piketSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
        } else {
          piketSheet.appendRow(headers);
        }
      }

      // Rapor Capaian
      if (raporCapaian && Array.isArray(raporCapaian)) {
        const rcSheet = ss.getSheetByName('Rapor Capaian');
        rcSheet.clear();
        const headers = ['ID', 'ID Siswa', 'Semester', 'Capaian Kompetensi', 'Catatan Wali Kelas', 'Saran Orang Tua', 'Tinggi Badan', 'Berat Badan', 'Pendengaran', 'Penglihatan', 'Gigi'];
        const rows = [headers];
        
        raporCapaian.forEach(rc => {
          rows.push([
            rc.id || '',
            rc.id_siswa || '',
            rc.semester || '',
            rc.capaian_kompetensi || '',
            rc.catatan_wali_kelas || '',
            rc.saran_orang_tua || '',
            rc.tinggi_badan || '',
            rc.berat_badan || '',
            rc.pendengaran || '',
            rc.penglihatan || '',
            rc.gigi || ''
          ]);
        });
        
        if (rows.length > 1) {
          rcSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
        } else {
          rcSheet.appendRow(headers);
        }
      }

      // Pengguna
      if (users && Array.isArray(users)) {
        const userSheet = ss.getSheetByName('Pengguna');
        userSheet.clear();
        const headers = ['ID', 'Username', 'Nama', 'Role'];
        const rows = [headers];
        
        users.forEach(u => {
          rows.push([u.id || '', u.username || '', u.name || '', u.role || '']);
        });
        
        if (rows.length > 1) {
          userSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
        } else {
          userSheet.appendRow(headers);
        }
      }

      // Settings & Grades
      if (settings) {
        const setSheet = ss.getSheetByName('Settings');
        setSheet.clear();
        const headers = ['Key', 'Value'];
        const rows = [headers];
        
        Object.keys(settings).forEach(key => {
          const val = settings[key];
          rows.push([key, Array.isArray(val) ? JSON.stringify(val) : (val !== null && val !== undefined ? val : '')]);
        });
        
        if (rows.length > 1) {
          setSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
        } else {
          setSheet.appendRow(headers);
        }
        
        if (settings.mata_pelajaran && Array.isArray(settings.mata_pelajaran)) {
          settings.mata_pelajaran.forEach(mapel => {
            const sheetName = 'Nilai - ' + mapel;
            ensureSheet(ss, sheetName);
            const sheet = ss.getSheetByName(sheetName);
            sheet.clear();
            
            const gradeHeaders = ['ID', 'ID Siswa', 'NISN', 'Nama', 'Jenis Nilai', 'Nama Kolom', 'Nilai', 'Semester', 'Mata Pelajaran'];
            const gradeRows = [gradeHeaders];
            
            if (grades && Array.isArray(grades)) {
              const mapelGrades = grades.filter(g => (g.mata_pelajaran || 'Umum') === mapel);
              mapelGrades.forEach(g => {
                const s = studentMap[g.id_siswa] || {};
                gradeRows.push([
                  g.id || '',
                  g.id_siswa || '',
                  s.nisn || '',
                  s.nama || '',
                  g.jenis_nilai || '',
                  g.nama_kolom || '',
                  g.nilai !== undefined ? g.nilai : 0,
                  g.semester || '',
                  g.mata_pelajaran || ''
                ]);
              });
            }
            
            if (gradeRows.length > 1) {
              sheet.getRange(1, 1, gradeRows.length, gradeHeaders.length).setValues(gradeRows);
            } else {
              sheet.appendRow(gradeHeaders);
            }
          });
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    } 
    
    // 3. FULL PULL ACTION (Load everything to local)
    else if (payload.action === 'pull') {
      const findSheet = function(ss, names) {
        for (var i = 0; i < names.length; i++) {
          var s = ss.getSheetByName(names[i]);
          if (s) return s.getName();
        }
        return names[0]; // fallback
      };

      const siswaName = findSheet(ss, ['Siswa', 'Data Siswa', 'Murid', 'Data Murid']);
      const alumniName = findSheet(ss, ['Alumni', 'Data Alumni', 'Lulusan']);
      const absensiName = findSheet(ss, ['Absensi', 'Presensi', 'Kehadiran', 'Data Absensi']);
      const penggunaName = findSheet(ss, ['Pengguna', 'Users', 'User', 'Data Pengguna']);
      const rosterName = findSheet(ss, ['Roster', 'Roster Pelajaran', 'Jadwal', 'Jadwal Pelajaran']);
      const piketName = findSheet(ss, ['Piket', 'Jadwal Piket', 'Piket Siswa']);
      const raporName = findSheet(ss, ['Rapor Capaian', 'Capaian Rapor', 'Catatan Rapor']);

      const data = {
        students: readSheetAsObjects(ss, siswaName),
        alumni: readSheetAsObjects(ss, alumniName),
        attendance: readSheetAsObjects(ss, absensiName),
        users: readSheetAsObjects(ss, penggunaName),
        roster: readSheetAsObjects(ss, rosterName),
        piket: readSheetAsObjects(ss, piketName),
        raporCapaian: readSheetAsObjects(ss, raporName),
        settings: readSettings(ss),
        grades: []
      };
      
      data.students = data.students.concat(data.alumni);
      delete data.alumni;
      
      // Build a map of students by Name and NISN to fill missing ID Siswa
      const studentLookupByName = {};
      const studentLookupByNisn = {};
      data.students.forEach(s => {
        if (s.nama) studentLookupByName[String(s.nama).toLowerCase()] = s.id;
        if (s.nisn) studentLookupByNisn[String(s.nisn).toLowerCase()] = s.id;
      });
      
      const resolveIdSiswa = (items) => {
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (!item.id_siswa) {
              if (item.nisn && studentLookupByNisn[String(item.nisn).toLowerCase()]) {
                item.id_siswa = studentLookupByNisn[String(item.nisn).toLowerCase()];
              } else if (item.nama && studentLookupByName[String(item.nama).toLowerCase()]) {
                item.id_siswa = studentLookupByName[String(item.nama).toLowerCase()];
              }
            }
          });
        }
      };
      
      resolveIdSiswa(data.attendance);
      resolveIdSiswa(data.raporCapaian);
      
      // Pull all Nilai sheets
      const sheets = ss.getSheets();
      sheets.forEach(sheet => {
        const sheetName = sheet.getName();
        const sheetLower = sheetName.toLowerCase();
        if (sheetName.indexOf('Nilai - ') === 0) {
          const mapel = sheetName.replace('Nilai - ', '').trim();
          const grades = readSheetAsObjects(ss, sheetName);
          grades.forEach(g => {
            if (!g.mata_pelajaran) g.mata_pelajaran = mapel;
          });
          resolveIdSiswa(grades);
          data.grades = data.grades.concat(grades);
        } else if (sheetLower === 'nilai' || sheetLower === 'daftar nilai' || sheetLower === 'nilai siswa' || sheetLower === 'rekap nilai' || sheetLower === 'data nilai') {
          const grades = readSheetAsObjects(ss, sheetName);
          resolveIdSiswa(grades);
          data.grades = data.grades.concat(grades);
        }
      });

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: data })).setMimeType(ContentService.MimeType.JSON);
    }
    
    throw new Error('Action tidak dikenal');
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getStudentMap(ss) {
  const studentMap = {};
  
  const activeSiswa = readSheetAsObjects(ss, 'Siswa');
  const alumniSiswa = readSheetAsObjects(ss, 'Alumni');
  const students = activeSiswa.concat(alumniSiswa);
  
  students.forEach(s => {
    if (s.id) {
      studentMap[s.id] = s;
    }
  });
  
  return studentMap;
}

function getSheetIdMap(sheet) {
  const idMap = {};
  if (!sheet) return idMap;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      idMap[String(ids[i][0])] = i + 2;
    }
  }
  return idMap;
}

function ensureSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function findRowById(sheet, id) {
  if (!sheet || sheet.getLastRow() < 2) return -1;
  const data = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return i + 1;
    }
  }
  return -1;
}

function getStudentInfo(studentMap, id_siswa, tempStudentMap) {
  if (!id_siswa) return { nisn: '', nama: '' };
  if (tempStudentMap && tempStudentMap[id_siswa]) {
    const s = tempStudentMap[id_siswa];
    return { nisn: s.nisn || '', nama: s.nama || '' };
  }
  if (studentMap && studentMap[id_siswa]) {
    const s = studentMap[id_siswa];
    return { nisn: s.nisn || '', nama: s.nama || '' };
  }
  return { nisn: '', nama: '' };
}

function ensureHeader(sheet, keyName) {
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0] || [];
  const index = headers.map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_')).indexOf(keyName.toLowerCase());
  if (index !== -1) {
    return index + 1;
  }
  const colNum = sheet.getLastColumn() + 1;
  sheet.getRange(1, colNum).setValue(keyName);
  return colNum;
}

function readSheetAsObjects(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  
  // Dynamically detect header row using maximum indicators match to prevent title rows misidentification
  var headerRowIdx = 0;
  var bestRowIdx = 0;
  var maxMatchCount = 0;
  var keyIndicators = ['nama', 'nisn', 'kelas', 'id', 'jenis_nilai', 'status', 'hari', 'mata_pelajaran', 'nipd', 'jenis_kelamin', 'no_telp_ortu', 'nama_siswa', 'nama_lengkap', 'jk', 'mapel'];
  
  for (var i = 0; i < Math.min(data.length, 15); i++) {
    var row = data[i];
    if (Array.isArray(row)) {
      var matchCount = 0;
      for (var j = 0; j < row.length; j++) {
        var cellStr = String(row[j] || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        if (keyIndicators.indexOf(cellStr) !== -1 || cellStr.indexOf('nama') === 0 || cellStr.indexOf('nisn') === 0) {
          matchCount++;
        }
      }
      if (matchCount > maxMatchCount) {
        maxMatchCount = matchCount;
        bestRowIdx = i;
      }
    }
  }
  
  if (maxMatchCount >= 2) {
    headerRowIdx = bestRowIdx;
  }
  
  var headers = data[headerRowIdx];
  if (!headers || headers.length === 0) return [];
  
  const results = [];
  
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    // Check if the row is completely empty to skip it
    var isRowEmpty = true;
    for (var colIdx = 0; colIdx < row.length; colIdx++) {
      if (row[colIdx] !== null && row[colIdx] !== undefined && String(row[colIdx]).trim() !== '') {
        isRowEmpty = false;
        break;
      }
    }
    if (isRowEmpty) continue;
    
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) {
        // Strict key sanitization matching the frontend perfectly
        let key = String(h).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        let val = row[idx];
        if (typeof val === 'string') val = val.trim();
        obj[key] = val;
      }
    });
    
    // Auto-generate ID if missing
    if (!obj['id']) {
      obj['id'] = Utilities.getUuid();
    }
    
    results.push(obj);
  }
  return results;
}

function readSettings(ss) {
  const sheet = ss.getSheetByName('Settings');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};
  
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    let val = data[i][1];
    
    if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
      try { val = JSON.parse(val); } catch(e) {}
    }
    
    if (['bobot_harian', 'bobot_tugas', 'bobot_ujian'].includes(key)) {
      val = Number(val);
    }
    
    settings[key] = val;
  }
  return settings;
}
`;

export default function Panduan() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 text-slate-200 h-full overflow-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Panduan Penggunaan Aplikasi</h2>
          <p className="text-slate-400">Selamat datang di EduSync Pro. Berikut adalah panduan singkat untuk membantu Anda menggunakan aplikasi ini.</p>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-indigo-400 flex items-center gap-2">
              <Users size={20} /> Data Siswa
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Modul ini digunakan untuk mengelola data induk siswa.
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li>Untuk menambahkan siswa baru, isi formulir di sebelah kiri dan klik <strong>Tambah Siswa</strong>.</li>
              <li>Untuk mengedit siswa, klik tombol edit (ikon pensil) pada baris data siswa, ubah data pada formulir, lalu klik <strong>Update Siswa</strong>.</li>
              <li>Data yang ditambahkan akan otomatis tersimpan di penyimpanan lokal perangkat Anda.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-emerald-400 flex items-center gap-2">
              <FileSpreadsheet size={20} /> Nilai
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Modul ini digunakan untuk mencatat dan merekap nilai siswa (Harian, Tugas, Ujian).
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li>Pastikan Anda telah memilih <strong>Mata Pelajaran</strong>.</li>
              <li>Klik <strong>Kolom Baru</strong> untuk menambah kolom penilaian (Misal: "UH 1").</li>
              <li>Masukkan nilai langsung pada tabel. Nilai akan otomatis tersimpan saat Anda berpindah sel.</li>
              <li>Tab <strong>Nilai Akhir</strong> akan mengkalkulasi rata-rata dan nilai akhir berdasarkan bobot di menu Pengaturan.</li>
              <li>Gunakan tombol <strong>Excel</strong> atau <strong>PDF</strong> untuk mengunduh rekapitulasi.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-rose-400 flex items-center gap-2">
              <BookOpen size={20} /> Absensi
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Gunakan modul ini untuk mencatat kehadiran harian.
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li>Pada tab <strong>Harian</strong>, pilih tanggal dan mata pelajaran, lalu tandai kehadiran (Hadir, Sakit, Izin, Alpa).</li>
              <li>Klik <strong>Simpan</strong> untuk merekam data kehadiran.</li>
              <li>Pada tab <strong>Rekap</strong>, Anda dapat melihat akumulasi kehadiran berdasarkan filter (Hari Ini, Bulan Ini, Semester, Kustom).</li>
              <li><strong>Notifikasi Kehadiran Rendah:</strong> Anda dapat menyesuaikan persentase target kehadiran minimum (default 80%). Siswa yang kehadirannya di bawah target akan otomatis ditandai merah beserta peringatan bahwasanya perlu perhatian khusus wali kelas.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-indigo-400 flex items-center gap-2">
              <ClipboardList size={20} /> Manajemen Tugas Siswa
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Gunakan modul ini untuk mengelola pencatatan tugas mandiri/kelompok dan memantau status realisasi penyelesaian dari setiap siswa.
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li><strong>Buat Tugas Baru:</strong> Klik tombol <strong>Buat Tugas Baru</strong>, lalu tentukan Judul Tugas, Mata Pelajaran, Kelas, Tanggal Diberikan, dan Tanggal Tenggat Pengumpulan.</li>
              <li><strong>Realisasi Penyelesaian:</strong> Pilih tugas di bilah kiri, lalu Anda akan melihat seluruh daftar siswa di kelas tersebut. Cukup klik baris nama siswa untuk mengubah status dari "Belum Selesai" menjadi "Selesai" (atau sebaliknya) secara instan.</li>
              <li><strong>Status Masal:</strong> Gunakan tombol <strong>Selesai Semua</strong> atau <strong>Belum Semua</strong> untuk mengubah status penugasan seluruh siswa secara cepat.</li>
              <li><strong>Statistik Real-time:</strong> Sistem secara otomatis mengukur persentase dan jumlah siswa yang telah menyelesaikan tugas pada bar kemajuan di setiap item tugas.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-purple-400 flex items-center gap-2">
              <AlertCircle size={20} /> Pusat Perhatian Wali Kelas (Dashboard)
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Membantu wali kelas memantau kondisi belajar siswa secara proaktif melalui deteksi dini otomatis (early warning system).
            </p>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li><strong>Kriteria Peringatan Nilai:</strong> Menandai siswa dengan rata-rata nilai mata pelajaran di bawah KKM (75).</li>
              <li><strong>Kriteria Peringatan Kehadiran:</strong> Menandai siswa dengan persentase kehadiran mingguan/keseluruhan di bawah target minimal (80%).</li>
              <li><strong>Hubungi Orang Tua Instan:</strong> Klik tombol <strong>Hubungi Orang Tua</strong> pada kartu peringatan siswa untuk melihat nomor telepon wali serta nama Ayah/Ibu. Anda bisa mengklik tombol untuk langsung menelepon atau mengirim pesan WhatsApp secara otomatis.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-amber-400 flex items-center gap-2">
              <Settings size={20} /> Identitas Sekolah & Pengaturan
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
              <li><strong>Identitas Sekolah:</strong> Lengkapi data sekolah (NPSN, alamat, kepala sekolah) agar tercetak dengan benar pada laporan (PDF/Excel).</li>
              <li><strong>Pengaturan:</strong> Tambahkan mata pelajaran yang diampu, atur bobot persentase nilai akhir, dan (jika Anda admin) buat akun untuk Kepala Sekolah.</li>
            </ul>
          </div>

          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-medium text-cyan-400 flex items-center gap-2">
              <BookOpen size={20} /> Panduan Google Apps Script (Sinkronisasi Database)
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Untuk melakukan sinkronisasi database ke Google Sheet tanpa harus melakukan login OAuth, Anda bisa menggunakan Google Apps Script. Berikut langkah-langkahnya:
            </p>
            <ol className="list-decimal list-inside text-sm text-slate-400 space-y-2 ml-2">
              <li>Buka <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Google Sheet Baru</a> dan beri nama bebas.</li>
              <li>Klik menu <strong>Ekstensi &gt; Apps Script</strong>.</li>
              <li>Hapus semua kode di dalam editor yang terbuka, lalu tempelkan (paste) kode di bawah ini.</li>
              <li>Klik logo <strong>Simpan</strong> (ikon disket) atau tekan Ctrl+S.</li>
              <li>Klik tombol <strong>Terapkan (Deploy) &gt; Deployment baru</strong>.</li>
              <li>Pilih jenis deployment: <strong>Aplikasi Web (Web App)</strong>.</li>
              <li>Pada bagian <em>Akses:</em> pilih <strong>Siapa saja (Anyone)</strong>.</li>
              <li>Klik tombol <strong>Terapkan</strong> (Mungkin Anda akan diminta untuk <em>Izinkan Akses</em> / <em>Review Permissions</em>, ikuti saja langkahnya dan abaikan peringatan keamanan dengan klik Advanced &gt; Go to ...).</li>
              <li>Setelah berhasil, Anda akan mendapatkan <strong>URL Aplikasi Web (Web App URL)</strong>. Salin URL tersebut.</li>
              <li>Buka aplikasi ini, masuk ke menu <strong>Pengaturan</strong>, paste URL tersebut pada kolom "URL Web App Google Apps Script", dan klik Simpan.</li>
            </ol>
            
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kode Google Apps Script:</p>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-200 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition-all cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Salin Kode</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative bg-slate-900 rounded-xl p-4 overflow-x-auto border border-slate-700 text-xs text-slate-300 font-mono max-h-[400px] overflow-y-auto custom-scrollbar">
                <pre>{GOOGLE_APPS_SCRIPT_CODE}</pre>
              </div>
            </div>
        </div>
        </div>

        {/* --- FAQ DEVELOPER CONFIGURATION --- */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-4">
          <h3 className="text-lg font-semibold text-indigo-400 flex items-center gap-2">
            🛠️ Panduan Developer & Konfigurasi Kode Sumber
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Jika Anda ingin mengelola atau mengubah informasi penting aplikasi langsung dalam kodingan (seperti <strong>URL Web App Google Apps Script</strong> dan <strong>ID Google Spreadsheet</strong>), silakan ikuti petunjuk berikut:
          </p>
          
          <div className="space-y-4 mt-3">
            {/* Q1 */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-slate-200">
                1. Di file apa URL dan ID Google Apps Script / Spreadsheet disimpan?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Secara dinamis, URL dan ID ini disimpan di penyimpanan lokal browser (<strong>LocalForage database</strong>) pada kunci pengaturan <code className="text-indigo-300 font-mono">app_settings</code>. Struktur tipe datanya didefinisikan dalam file:
              </p>
              <div className="text-xs font-mono text-indigo-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                /src/lib/store.ts (Interface Settings)
              </div>
            </div>

            {/* Q2 */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-slate-200">
                2. Jika saya ingin memasukkan URL dan ID Google Apps Script langsung di file kodingan, file apa yang harus saya buka?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Untuk memasukkan nilai URL dan ID Google Apps Script secara langsung (hardcode) agar otomatis aktif tanpa perlu di-input dari halaman Pengaturan UI, Anda memiliki 2 opsi mudah:
              </p>
              
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-400">Opsi A: Mengatur sebagai nilai bawaan (Default) saat database pertama kali dibuat</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Buka file <code className="text-indigo-300 font-mono">/src/lib/store.ts</code> dan cari objek <code className="text-indigo-300 font-mono">defaultSettings</code> (mulai baris ke-102), lalu tambahkan URL Anda di sana:
                  </p>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 mt-1">
                    <pre>{`export const defaultSettings: Settings = {
  nama_sekolah: '',
  // ... pengaturan lainnya ...
  appsScriptUrl: 'MASUKKAN_URL_APP_SCRIPT_ANDA_DI_SINI',
  spreadsheetId: 'MASUKKAN_ID_SPREADSHEET_ANDA_DI_SINI',
};`}</pre>
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-xs font-semibold text-emerald-400">Opsi B: Mengatur sebagai Fallback langsung di mesin sinkronisasi</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Buka file <code className="text-indigo-300 font-mono">/src/lib/sync.ts</code>, di bagian awal fungsi <code className="text-indigo-300 font-mono">pushDataToSheets</code> dan <code className="text-indigo-300 font-mono">pullDataFromSheets</code>, Anda bisa menimpa variabel URL secara langsung:
                  </p>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 mt-1">
                    <pre>{`export async function pushDataToSheets(appsScriptUrl: string, forceFull = false) {
  // Baris tambahan untuk mematangkan URL hardcode:
  const targetUrl = appsScriptUrl || 'MASUKKAN_URL_APP_SCRIPT_ANDA_DI_SINI';
  // ... gunakan targetUrl untuk melakukan fetch ...
}`}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- MANUAL ROSTER & PIKET --- */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm space-y-4">
          <h3 className="text-lg font-semibold text-indigo-400 flex items-center gap-2">
            📅 Panduan Modul Roster Pelajaran & Piket Harian
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Modul baru ini dirancang untuk memudahkan pengaturan jadwal pelajaran mingguan dan tugas kebersihan harian siswa kelas Anda secara terintegrasi.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-indigo-300">📖 Roster Pelajaran</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Digunakan untuk membuat jadwal pelajaran mingguan (Senin sampai Sabtu).
              </p>
              <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1 pl-1">
                <li>Klik tombol <strong>Tambah Roster</strong> di bagian kanan atas.</li>
                <li>Pilih hari, masukkan jam mulai dan jam selesai, pilih mata pelajaran dari daftar, dan tentukan nama guru pengampunya.</li>
                <li>Klik <strong>Simpan</strong> untuk mencatat roster ke database lokal.</li>
                <li>Jadwal diurutkan berdasarkan hari dan urutan jam belajar secara otomatis.</li>
                <li>Ekspor jadwal ke format <strong>Excel</strong> atau cetak PDF rapi untuk ditempel di kelas.</li>
              </ul>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-emerald-300">🧹 Piket Harian Kelas</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Digunakan untuk mendistribusikan siswa pada jadwal piket kebersihan kelas harian.
              </p>
              <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1 pl-1">
                <li><strong>Tambah Manual:</strong> Pilih siswa dari dropdown untuk ditugaskan di hari tertentu.</li>
                <li><strong>Auto-Distribusi (Cerdas):</strong> Klik tombol <strong>Auto Distribusi Piket</strong> untuk membagikan tugas piket secara merata dan acak ke seluruh siswa aktif dalam hitungan detik.</li>
                <li>Sistem pintar akan memastikan jumlah petugas piket per hari seimbang.</li>
                <li>Daftar piket akan otomatis diperbarui apabila ada perubahan daftar siswa.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
