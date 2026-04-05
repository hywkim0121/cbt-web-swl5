import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from './supabase'

/* ═══════════════════ TXT PARSER ═══════════════════════ */
function parseTXT(text) {
  const typeMap = { '객관식':'multiple_choice','4지선다':'multiple_choice','OX':'ox','ox':'ox','O/X':'ox','진위형':'ox','단답형':'short_answer','주관식':'short_answer','선잇기':'matching','매칭':'matching','연결':'matching' }
  return text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map((block) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return null
    const tagM = lines[0].match(/^\[(.+?)\]/)
    let type = tagM ? typeMap[tagM[1].trim()] || null : null
    const fields = {}, content = []
    for (let i = tagM ? 1 : 0; i < lines.length; i++) {
      const fm = lines[i].match(/^(카테고리|문제|정답|해설)\s*[:：]\s*(.*)$/)
      if (fm) fields[fm[1]] = fm[2]; else content.push(lines[i])
    }
    if (!type) {
      const ans = (fields['정답']||'').trim()
      if (content.some(l => /^[1-4]\)/.test(l))) type = 'multiple_choice'
      else if (ans === 'O' || ans === 'X') type = 'ox'
      else if (content.some(l => l.includes('='))) type = 'matching'
      else type = 'short_answer'
    }
    const q = { type, category: fields['카테고리']||'일반', question: fields['문제']||'', explanation: fields['해설']||'' }
    if (type === 'multiple_choice') {
      q.options = content.filter(l => /^[1-4]\)/.test(l)).map(l => l.replace(/^[1-4]\)\s*/, ''))
      q.answer = parseInt(fields['정답']||'1', 10) - 1
    } else if (type === 'ox') {
      q.answer = (fields['정답']||'O').trim().toUpperCase() === 'O'
    } else if (type === 'short_answer') {
      q.answer = (fields['정답']||'').split(',').map(s => s.trim()).filter(Boolean)
    } else if (type === 'matching') {
      q.pairs = content.filter(l => l.includes('=')).map(l => { const p = l.split('='); return { left: p[0]?.trim(), right: p[1]?.trim() }})
    }
    return q.question ? q : null
  }).filter(Boolean)
}

/* ═══════════════════ STYLES ═══════════════════════════ */
const C = { bg:'#0f172a', card:'#1e293b', input:'#334155', t1:'#f1f5f9', t2:'#94a3b8', blue:'#3b82f6', green:'#10b981', red:'#ef4444', yellow:'#f59e0b', purple:'#8b5cf6' }
const S = {
  page: { minHeight:'100vh', background:C.bg, padding:'20px 16px' },
  container: { maxWidth:960, margin:'0 auto' },
  card: { background:C.card, borderRadius:16, padding:24, marginBottom:16, border:'1px solid rgba(148,163,184,0.1)' },
  btn: (color=C.blue) => ({ background:color, color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }),
  btnSm: (color=C.blue) => ({ background:color, color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }),
  btnSec: { background:'rgba(148,163,184,0.1)', color:C.t2, border:'1px solid rgba(148,163,184,0.2)', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 },
  input: { width:'100%', padding:'10px 14px', fontSize:14, background:C.input, border:'1px solid rgba(148,163,184,0.2)', borderRadius:10, color:C.t1, outline:'none', boxSizing:'border-box' },
  tag: (c) => ({ display:'inline-block', background:`${c}22`, color:c, borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:600 }),
  th: { padding:'8px 10px', textAlign:'left', fontSize:12, fontWeight:700, color:C.t2, borderBottom:'1px solid rgba(148,163,184,0.1)' },
  td: { padding:'7px 10px', fontSize:13, color:C.t1, borderBottom:'1px solid rgba(148,163,184,0.05)' },
  checkbox: { width:16, height:16, accentColor:C.blue, cursor:'pointer' },
  modal: { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
}
const TYPE_L = { multiple_choice:'4지선다', ox:'O/X', short_answer:'단답형', matching:'선잇기' }
const TYPE_C = { multiple_choice:C.blue, ox:C.purple, short_answer:C.yellow, matching:C.green }

/* ═══════════════════ MINI BAR CHART ═══════════════════ */
function MiniBarChart({ scores, height = 100, width = 280 }) {
  if (!scores || scores.length === 0) return <span style={{ color:C.t2, fontSize:12 }}>응시 이력 없음</span>
  const max = 100, barW = Math.min(32, (width - 20) / scores.length - 4)
  return <svg width={width} height={height + 20} style={{ display:'block' }}>
    <line x1={0} y1={height} x2={width} y2={height} stroke="rgba(148,163,184,0.2)" strokeWidth={1} />
    <line x1={0} y1={height * 0.4} x2={width} y2={height * 0.4} stroke="rgba(239,68,68,0.15)" strokeWidth={1} strokeDasharray="4" />
    <text x={width - 2} y={height * 0.4 - 3} fill={C.red} fontSize={9} textAnchor="end">60점</text>
    {scores.map((s, i) => {
      const h = (s / max) * height, x = 10 + i * (barW + 4), color = s >= 60 ? C.green : C.red
      return <g key={i}>
        <rect x={x} y={height - h} width={barW} height={h} rx={3} fill={color} opacity={0.8} />
        <text x={x + barW / 2} y={height - h - 4} fill={C.t1} fontSize={10} textAnchor="middle" fontWeight={700}>{s}</text>
        <text x={x + barW / 2} y={height + 14} fill={C.t2} fontSize={9} textAnchor="middle">#{i + 1}</text>
      </g>
    })}
  </svg>
}

/* ═══════════════════ ROLE SELECT ══════════════════════ */
function RoleSelect({ onRole }) {
  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>📝</div>
      <h1 style={{ color:C.t1, fontSize:28, fontWeight:800, marginBottom:8 }}>일학습병행 CBT</h1>
      <p style={{ color:C.t2, marginBottom:32 }}>지필고사 연습 프로그램</p>
      <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
        <button onClick={() => onRole('admin')} style={{ ...S.btn(C.purple), padding:'20px 40px', fontSize:17 }}>🔧 관리자</button>
        <button onClick={() => onRole('student')} style={{ ...S.btn(C.blue), padding:'20px 40px', fontSize:17 }}>🎓 학생</button>
      </div>
    </div>
  </div>
}

/* ═══════════════════ ADMIN LOGIN ══════════════════════ */
function AdminLogin({ onLogin, onBack }) {
  const [pw, setPw] = useState(''), [err, setErr] = useState(''), [loading, setLoading] = useState(false)
  const login = async () => {
    setLoading(true); setErr('')
    const { data } = await supabase.from('admin_config').select('value').eq('key','admin_password').single()
    if (data && data.value === pw) onLogin(); else { setErr('비밀번호가 틀렸습니다.'); setLoading(false) }
  }
  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ ...S.card, width:380, textAlign:'center' }}>
      <h2 style={{ color:C.t1, marginBottom:20 }}>🔧 관리자 로그인</h2>
      <input type="password" placeholder="관리자 비밀번호" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} style={{ ...S.input, marginBottom:12 }} />
      {err && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</p>}
      <button onClick={login} disabled={loading} style={{ ...S.btn(), width:'100%', justifyContent:'center' }}>{loading ? '확인 중...' : '로그인'}</button>
      <button onClick={onBack} style={{ ...S.btnSec, width:'100%', justifyContent:'center', marginTop:8 }}>뒤로</button>
    </div>
  </div>
}

/* ═══════════════════ ADMIN DASHBOARD ══════════════════ */
function AdminDashboard({ onBack }) {
  const [tab, setTab] = useState('roster')
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [students, setStudents] = useState([])
  const [roster, setRoster] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [examHistory, setExamHistory] = useState([])
  const [timeLimit, setTimeLimit] = useState(30)
  const [title, setTitle] = useState('일학습병행 지필고사')
  const [log, setLog] = useState([])
  const fileRef = useRef(null)
  const rosterFileRef = useRef(null)

  // question management
  const [selQ, setSelQ] = useState(new Set())
  const [editQ, setEditQ] = useState(null)  // question being edited

  // roster management
  const [selR, setSelR] = useState(new Set())
  const [newSid, setNewSid] = useState('')
  const [newName, setNewName] = useState('')
  const [detailStudent, setDetailStudent] = useState(null) // student detail modal

  const addLog = (msg) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100))

  useEffect(() => { loadActiveExam(); loadRoster(); const iv = setInterval(refreshData, 3000); return () => clearInterval(iv) }, [])
  useEffect(() => {
    if (!exam) return
    const ch = supabase.channel('admin-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `exam_id=eq.${exam.id}` }, () => loadStudents()).subscribe()
    return () => supabase.removeChannel(ch)
  }, [exam?.id])

  const loadActiveExam = async () => {
    const { data } = await supabase.from('exams').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
    if (data?.length) { setExam(data[0]); setTitle(data[0].title); setTimeLimit(data[0].time_limit_min); await loadQuestions(data[0].id); await loadStudents(data[0].id) }
    else { const { data: r } = await supabase.from('exams').select('*').order('created_at', { ascending: false }).limit(1); if (r?.length) { setExam(r[0]); setTitle(r[0].title); setTimeLimit(r[0].time_limit_min); await loadQuestions(r[0].id); await loadStudents(r[0].id) } }
  }
  const loadQuestions = async (eid) => { const id = eid || exam?.id; if (!id) return; const { data } = await supabase.from('questions').select('*').eq('exam_id', id).order('sort_order'); setQuestions(data || []) }
  const loadStudents = async (eid) => { const id = eid || exam?.id; if (!id) return; const { data } = await supabase.from('students').select('*').eq('exam_id', id).order('created_at'); setStudents(data || []) }
  const loadRoster = async () => { const { data } = await supabase.from('roster').select('*').order('student_id'); setRoster(data || []) }
  const loadAnalytics = async () => { if (!exam) return; const { data } = await supabase.from('question_analytics').select('*').eq('exam_id', exam.id); setAnalytics(data || []) }
  const loadExamHistory = async () => { const { data } = await supabase.from('student_exam_history').select('*'); setExamHistory(data || []) }
  const refreshData = () => { if (exam) { loadStudents(); if (tab === 'analytics') loadAnalytics() } }

  // Exam controls
  const createExam = async () => {
    await supabase.from('exams').update({ is_active: false }).eq('is_active', true)
    const { data } = await supabase.from('exams').insert({ title, time_limit_min: timeLimit, is_active: false }).select().single()
    if (data) { setExam(data); addLog(`시험 생성: "${title}"`); setQuestions([]); setStudents([]) }
  }
  const startExam = async () => {
    if (!exam) return; const incQ = questions.filter(q => q.is_included !== false).length
    if (incQ === 0) { alert('포함된 문제가 없습니다!'); return }
    await supabase.from('exams').update({ is_active: true, started_at: new Date().toISOString() }).eq('id', exam.id)
    setExam({ ...exam, is_active: true }); addLog(`═══ 시험 시작 (포함 문제 ${incQ}개, ${timeLimit}분) ═══`)
  }
  const stopExam = async () => {
    if (!exam) return; await supabase.from('exams').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', exam.id)
    setExam({ ...exam, is_active: false }); addLog('═══ 시험 종료 ═══')
  }

  // ─── Roster Management ─────────────────
  const uploadRoster = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const entries = lines.map(l => {
      const parts = l.split(/[,\t]/).map(p => p.trim()).filter(Boolean)
      if (parts.length >= 2) return { student_id: parts[0], name: parts[1] }
      return null
    }).filter(Boolean)
    if (!entries.length) { alert('파싱된 학생이 없습니다. (학번,이름 또는 학번[탭]이름 형식)'); return }
    const { error } = await supabase.from('roster').upsert(entries, { onConflict: 'student_id' })
    if (error) addLog('명단 업로드 오류: ' + error.message)
    else { addLog(`학생 명단 ${entries.length}명 업로드`); loadRoster() }
    if (rosterFileRef.current) rosterFileRef.current.value = ''
  }
  const addRosterStudent = async () => {
    if (!newSid.trim() || !newName.trim()) { alert('학번과 이름을 입력하세요'); return }
    const { error } = await supabase.from('roster').upsert({ student_id: newSid.trim(), name: newName.trim() }, { onConflict: 'student_id' })
    if (error) alert('추가 오류: ' + error.message)
    else { setNewSid(''); setNewName(''); loadRoster(); addLog(`학생 추가: ${newSid} ${newName}`) }
  }
  const deleteSelectedRoster = async () => {
    if (selR.size === 0) return
    if (!confirm(`선택한 ${selR.size}명을 삭제하시겠습니까?`)) return
    const ids = Array.from(selR)
    await supabase.from('roster').delete().in('id', ids)
    setSelR(new Set()); loadRoster(); addLog(`학생 ${ids.length}명 삭제`)
  }
  const toggleAllRoster = () => { if (selR.size === roster.length) setSelR(new Set()); else setSelR(new Set(roster.map(r => r.id))) }
  const toggleRoster = (id) => { const n = new Set(selR); n.has(id) ? n.delete(id) : n.add(id); setSelR(n) }

  // ─── Question Management ─────────────────
  const handleQFile = async (e) => {
    const file = e.target.files?.[0]; if (!file || !exam) return
    try {
      const text = await file.text(); const ext = file.name.split('.').pop().toLowerCase()
      let parsed; if (ext === 'json') { parsed = JSON.parse(text); if (!Array.isArray(parsed)) throw new Error('JSON은 배열이어야 합니다') } else parsed = parseTXT(text)
      if (!parsed.length) { alert('파싱된 문제가 없습니다'); return }
      const rows = parsed.map((q, i) => ({ exam_id: exam.id, type: q.type, category: q.category || '일반', question: q.question, options: q.options || [], answer: q.type === 'multiple_choice' ? q.answer : q.type === 'ox' ? q.answer : q.type === 'short_answer' ? q.answer : q.pairs || [], pairs: q.pairs || [], explanation: q.explanation || '', sort_order: i + 1 + questions.length, is_included: true }))
      const { error } = await supabase.from('questions').insert(rows)
      if (error) { addLog('업로드 오류: ' + error.message); return }
      addLog(`문제 ${parsed.length}개 업로드 (${file.name})`); await loadQuestions()
    } catch (err) { alert('파일 오류: ' + err.message) }
    if (fileRef.current) fileRef.current.value = ''
  }
  const toggleAllQ = () => { if (selQ.size === questions.length) setSelQ(new Set()); else setSelQ(new Set(questions.map(q => q.id))) }
  const toggleQ = (id) => { const n = new Set(selQ); n.has(id) ? n.delete(id) : n.add(id); setSelQ(n) }
  const deleteSelectedQ = async () => {
    if (selQ.size === 0) return; if (!confirm(`선택한 ${selQ.size}문항을 삭제하시겠습니까?`)) return
    await supabase.from('questions').delete().in('id', Array.from(selQ))
    setSelQ(new Set()); loadQuestions(); addLog(`${selQ.size}문항 삭제`)
  }
  const toggleInclude = async (id, current) => {
    await supabase.from('questions').update({ is_included: !current }).eq('id', id)
    loadQuestions()
  }
  const bulkToggleInclude = async (include) => {
    if (selQ.size === 0) return
    await supabase.from('questions').update({ is_included: include }).in('id', Array.from(selQ))
    loadQuestions(); addLog(`${selQ.size}문항 ${include ? '포함' : '제외'} 처리`)
  }
  const saveEditQ = async () => {
    if (!editQ) return
    const upd = { question: editQ.question, category: editQ.category, explanation: editQ.explanation, options: editQ.options, answer: editQ.answer, pairs: editQ.pairs }
    await supabase.from('questions').update(upd).eq('id', editQ.id)
    setEditQ(null); loadQuestions(); addLog(`문항 #${editQ.sort_order} 수정`)
  }

  const incCount = questions.filter(q => q.is_included !== false).length
  const tabBtn = (key, label) => <button key={key} onClick={() => { setTab(key); if (key === 'analytics') loadAnalytics(); if (key === 'roster') { loadRoster(); loadExamHistory() } }} style={{ padding:'9px 16px', fontSize:13, fontWeight:600, cursor:'pointer', background:tab===key?'rgba(59,130,246,0.15)':'transparent', color:tab===key?C.blue:C.t2, border:'none', borderBottom:tab===key?`2px solid ${C.blue}`:'2px solid transparent' }}>{label}</button>

  return <div style={S.page}><div style={S.container}>
    {/* 헤더 */}
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
      <div>
        <h1 style={{ color:C.t1, fontSize:20, fontWeight:800, margin:0 }}>🔧 관리자 대시보드</h1>
        <p style={{ color:C.t2, fontSize:12, margin:'4px 0 0' }}>
          {exam ? `시험: "${exam.title}" | 문제: ${incCount}/${questions.length}개(포함/전체) | 접속: ${students.length}명 | 명단: ${roster.length}명` : '시험을 생성하세요'}
          {exam?.is_active && <span style={{ color:C.green, marginLeft:8 }}>● 진행중</span>}
        </p>
      </div>
      <button onClick={onBack} style={S.btnSec}>← 나가기</button>
    </div>

    {/* 시험 제어 */}
    <div style={S.card}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:180 }}><label style={{ fontSize:11, color:C.t2, display:'block', marginBottom:3 }}>시험 제목</label><input value={title} onChange={e => setTitle(e.target.value)} style={S.input} /></div>
        <div style={{ width:90 }}><label style={{ fontSize:11, color:C.t2, display:'block', marginBottom:3 }}>시간(분)</label><input type="number" value={timeLimit} onChange={e => setTimeLimit(+e.target.value)} style={S.input} /></div>
        {!exam && <button onClick={createExam} style={S.btn(C.blue)}>📋 시험 생성</button>}
        {exam && !exam.is_active && <button onClick={startExam} style={S.btn(C.green)}>🟢 시험 시작</button>}
        {exam?.is_active && <button onClick={stopExam} style={S.btn(C.red)}>🔴 시험 종료</button>}
      </div>
    </div>

    {/* 탭 */}
    <div style={{ display:'flex', borderBottom:'1px solid rgba(148,163,184,0.1)', marginBottom:14, flexWrap:'wrap' }}>
      {tabBtn('roster','👥 학생 명단')}{tabBtn('students','📋 응시 현황')}{tabBtn('questions','📝 문제 관리')}{tabBtn('analytics','📊 문제 분석')}{tabBtn('log','📜 로그')}
    </div>

    {/* ═══ 학생 명단 관리 ═══ */}
    {tab === 'roster' && <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <input ref={rosterFileRef} type="file" accept=".txt,.csv" onChange={uploadRoster} style={{ display:'none' }} />
        <button onClick={() => rosterFileRef.current?.click()} style={S.btn(C.purple)}>📄 명단 업로드 (TXT/CSV)</button>
        <span style={{ color:C.t2, fontSize:11 }}>학번,이름 또는 학번[탭]이름 형식</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {selR.size > 0 && <button onClick={deleteSelectedRoster} style={S.btnSm(C.red)}>🗑 선택 삭제 ({selR.size})</button>}
        </div>
      </div>

      {/* 개별 추가 */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ width:140 }}><label style={{ fontSize:11, color:C.t2, display:'block', marginBottom:3 }}>학번</label><input value={newSid} onChange={e => setNewSid(e.target.value)} placeholder="20241234" style={S.input} /></div>
        <div style={{ width:120 }}><label style={{ fontSize:11, color:C.t2, display:'block', marginBottom:3 }}>이름</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="홍길동" onKeyDown={e => e.key==='Enter' && addRosterStudent()} style={S.input} /></div>
        <button onClick={addRosterStudent} style={S.btn(C.green)}>➕ 추가</button>
      </div>

      {/* 명단 테이블 */}
      <div style={S.card}>
        <h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 12px' }}>등록 명단 ({roster.length}명)</h3>
        {roster.length === 0 ? <p style={{ color:C.t2, fontSize:13 }}>등록된 학생이 없습니다. 명단을 업로드하거나 개별 추가하세요.</p> :
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <th style={S.th}><input type="checkbox" checked={selR.size === roster.length && roster.length > 0} onChange={toggleAllRoster} style={S.checkbox} /></th>
              <th style={S.th}>학번</th><th style={S.th}>이름</th><th style={S.th}>응시횟수</th><th style={S.th}>최근점수</th><th style={S.th}>성적 추이</th><th style={S.th}>상세</th>
            </tr></thead>
            <tbody>
              {roster.map(r => {
                const history = examHistory.filter(h => h.student_id === r.student_id && h.score != null)
                const scores = history.map(h => h.score)
                const lastScore = scores.length > 0 ? scores[0] : null
                return <tr key={r.id} style={{ background: selR.has(r.id) ? 'rgba(59,130,246,0.06)' : 'transparent' }}>
                  <td style={S.td}><input type="checkbox" checked={selR.has(r.id)} onChange={() => toggleRoster(r.id)} style={S.checkbox} /></td>
                  <td style={S.td}>{r.student_id}</td>
                  <td style={S.td}>{r.name}</td>
                  <td style={S.td}>{scores.length}회</td>
                  <td style={{ ...S.td, fontWeight:700, color: lastScore >= 60 ? C.green : lastScore != null ? C.red : C.t2 }}>{lastScore != null ? `${lastScore}점` : '-'}</td>
                  <td style={S.td}><MiniBarChart scores={scores.reverse()} height={40} width={Math.max(80, scores.length * 28 + 20)} /></td>
                  <td style={S.td}><button onClick={() => setDetailStudent(r)} style={S.btnSm(C.blue)}>📊</button></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>}
      </div>

      {/* 학생 상세 모달 */}
      {detailStudent && <div style={S.modal} onClick={() => setDetailStudent(null)}>
        <div style={{ ...S.card, width:520, maxHeight:'80vh', overflowY:'auto', margin:20 }} onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h3 style={{ color:C.t1, fontSize:18, fontWeight:700, margin:0 }}>📊 {detailStudent.name} ({detailStudent.student_id})</h3>
            <button onClick={() => setDetailStudent(null)} style={{ ...S.btnSm(C.t2), background:'transparent', border:'none', fontSize:18, cursor:'pointer', color:C.t2 }}>✕</button>
          </div>
          {(() => {
            const hist = examHistory.filter(h => h.student_id === detailStudent.student_id && h.session_id)
            const scores = hist.filter(h => h.score != null).map(h => h.score).reverse()
            return <>
              <div style={{ marginBottom:16 }}>
                <p style={{ color:C.t2, fontSize:13, margin:'0 0 8px' }}>총 응시: <strong style={{ color:C.t1 }}>{scores.length}회</strong> | 평균: <strong style={{ color: (scores.reduce((a,b)=>a+b,0)/scores.length||0) >= 60 ? C.green : C.red }}>{scores.length > 0 ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : '-'}점</strong></p>
                <MiniBarChart scores={scores} height={120} width={460} />
              </div>
              <h4 style={{ color:C.t2, fontSize:13, fontWeight:700, margin:'16px 0 8px' }}>응시 이력</h4>
              {hist.length === 0 ? <p style={{ color:C.t2, fontSize:13 }}>응시 이력이 없습니다.</p> :
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['시험명','상태','점수','정답','제출시간'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>{hist.map((h, i) => <tr key={i}>
                  <td style={S.td}>{h.exam_title || '-'}</td>
                  <td style={S.td}><span style={S.tag(h.status==='제출완료'?C.green:C.blue)}>{h.status || '-'}</span></td>
                  <td style={{ ...S.td, fontWeight:700, color: h.score >= 60 ? C.green : h.score != null ? C.red : C.t2 }}>{h.score != null ? `${h.score}점` : '-'}</td>
                  <td style={S.td}>{h.correct_count != null ? `${h.correct_count}/${h.total_questions}` : '-'}</td>
                  <td style={S.td}>{h.submitted_at ? new Date(h.submitted_at).toLocaleString('ko-KR') : '-'}</td>
                </tr>)}</tbody>
              </table>}
            </>
          })()}
        </div>
      </div>}
    </>}

    {/* ═══ 응시 현황 ═══ */}
    {tab === 'students' && <div style={S.card}>
      <h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 12px' }}>현재 시험 접속 학생 ({students.length}명)</h3>
      {students.length === 0 ? <p style={{ color:C.t2 }}>접속한 학생이 없습니다.</p> :
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>{['학번','이름','상태','현재문항','정답수','점수','소요시간'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{students.map(s => {
            const elapsed = s.started_at ? Math.floor(((s.submitted_at ? new Date(s.submitted_at) : new Date()) - new Date(s.started_at)) / 1000) : 0
            return <tr key={s.id}>
              <td style={S.td}>{s.student_id}</td><td style={S.td}>{s.name}</td>
              <td style={S.td}><span style={S.tag(s.status==='제출완료'?C.green:s.status==='응시중'?C.blue:C.t2)}>{s.status}</span></td>
              <td style={S.td}>{s.total_questions > 0 ? `${s.current_question}/${s.total_questions}` : '-'}</td>
              <td style={S.td}>{s.correct_count || 0}</td>
              <td style={{ ...S.td, fontWeight:700, color: s.score >= 60 ? C.green : s.score ? C.red : C.t2 }}>{s.score != null ? `${s.score}점` : '-'}</td>
              <td style={S.td}>{elapsed > 0 ? `${Math.floor(elapsed/60)}분 ${elapsed%60}초` : '-'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </div>}

    {/* ═══ 문제 관리 ═══ */}
    {tab === 'questions' && <>
      <div style={{ ...S.card, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
        <input ref={fileRef} type="file" accept=".json,.txt" onChange={handleQFile} style={{ display:'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={!exam} style={S.btn(C.purple)}>📄 문제 업로드</button>
        {selQ.size > 0 && <>
          <button onClick={deleteSelectedQ} style={S.btnSm(C.red)}>🗑 삭제 ({selQ.size})</button>
          <button onClick={() => bulkToggleInclude(true)} style={S.btnSm(C.green)}>✅ 포함</button>
          <button onClick={() => bulkToggleInclude(false)} style={S.btnSm(C.yellow)}>⛔ 제외</button>
        </>}
        <span style={{ color:C.t2, fontSize:11, marginLeft:'auto' }}>포함: {incCount} / 전체: {questions.length}</span>
      </div>
      <div style={S.card}>
        {questions.length === 0 ? <p style={{ color:C.t2 }}>문제를 업로드하세요.</p> :
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <th style={S.th}><input type="checkbox" checked={selQ.size === questions.length && questions.length > 0} onChange={toggleAllQ} style={S.checkbox} /></th>
              <th style={S.th}>#</th><th style={S.th}>상태</th><th style={S.th}>유형</th><th style={S.th}>카테고리</th><th style={S.th}>문제</th><th style={S.th}>관리</th>
            </tr></thead>
            <tbody>{questions.map((q, i) => {
              const inc = q.is_included !== false
              return <tr key={q.id} style={{ opacity: inc ? 1 : 0.45, background: selQ.has(q.id) ? 'rgba(59,130,246,0.06)' : 'transparent' }}>
                <td style={S.td}><input type="checkbox" checked={selQ.has(q.id)} onChange={() => toggleQ(q.id)} style={S.checkbox} /></td>
                <td style={S.td}>{i + 1}</td>
                <td style={S.td}>
                  <button onClick={() => toggleInclude(q.id, inc)} style={{ ...S.btnSm(inc ? C.green : C.red), padding:'3px 8px', fontSize:11 }}>{inc ? '포함' : '제외'}</button>
                </td>
                <td style={S.td}><span style={S.tag(TYPE_C[q.type]||C.t2)}>{TYPE_L[q.type]||q.type}</span></td>
                <td style={S.td}>{q.category}</td>
                <td style={{ ...S.td, maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.question}</td>
                <td style={S.td}><button onClick={() => setEditQ({...q})} style={S.btnSm(C.blue)}>✏️</button></td>
              </tr>
            })}</tbody>
          </table>
        </div>}
      </div>

      {/* 문제 수정 모달 */}
      {editQ && <div style={S.modal} onClick={() => setEditQ(null)}>
        <div style={{ ...S.card, width:560, maxHeight:'85vh', overflowY:'auto', margin:20 }} onClick={e => e.stopPropagation()}>
          <h3 style={{ color:C.t1, fontSize:17, fontWeight:700, margin:'0 0 16px' }}>✏️ 문제 수정 (#{editQ.sort_order})</h3>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>카테고리</label>
            <input value={editQ.category} onChange={e => setEditQ({...editQ, category: e.target.value})} style={S.input} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>문제</label>
            <textarea value={editQ.question} onChange={e => setEditQ({...editQ, question: e.target.value})} rows={3} style={{ ...S.input, resize:'vertical' }} />
          </div>
          {editQ.type === 'multiple_choice' && <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>보기 (4개)</label>
            {(editQ.options||[]).map((opt, i) => <div key={i} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'center' }}>
              <span style={{ color: editQ.answer === i ? C.green : C.t2, fontWeight:700, fontSize:12, width:20 }}>{i+1})</span>
              <input value={opt} onChange={e => { const o=[...(editQ.options||[])]; o[i]=e.target.value; setEditQ({...editQ, options:o}) }} style={{ ...S.input, flex:1 }} />
              <input type="radio" name="mc_answer" checked={editQ.answer === i} onChange={() => setEditQ({...editQ, answer: i})} style={{ accentColor:C.green }} />
            </div>)}
          </div>}
          {editQ.type === 'ox' && <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>정답</label>
            <div style={{ display:'flex', gap:12 }}>
              {[{l:'O',v:true},{l:'X',v:false}].map(o => <label key={o.l} style={{ display:'flex', alignItems:'center', gap:6, color:C.t1, cursor:'pointer' }}>
                <input type="radio" name="ox_answer" checked={editQ.answer === o.v} onChange={() => setEditQ({...editQ, answer: o.v})} style={{ accentColor:C.green }} /> {o.l}
              </label>)}
            </div>
          </div>}
          {editQ.type === 'short_answer' && <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>정답 (쉼표로 복수 정답)</label>
            <input value={Array.isArray(editQ.answer) ? editQ.answer.join(', ') : editQ.answer} onChange={e => setEditQ({...editQ, answer: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} style={S.input} />
          </div>}
          {editQ.type === 'matching' && <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>매칭 쌍</label>
            {(editQ.pairs||[]).map((p, i) => <div key={i} style={{ display:'flex', gap:8, marginBottom:6 }}>
              <input value={p.left||p[0]||''} onChange={e => { const pp=[...(editQ.pairs||[])]; pp[i]={...pp[i], left:e.target.value}; setEditQ({...editQ, pairs:pp}) }} placeholder="왼쪽" style={{ ...S.input, flex:1 }} />
              <span style={{ color:C.blue, fontWeight:700, alignSelf:'center' }}>=</span>
              <input value={p.right||p[1]||''} onChange={e => { const pp=[...(editQ.pairs||[])]; pp[i]={...pp[i], right:e.target.value}; setEditQ({...editQ, pairs:pp}) }} placeholder="오른쪽" style={{ ...S.input, flex:1 }} />
            </div>)}
          </div>}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>해설</label>
            <textarea value={editQ.explanation} onChange={e => setEditQ({...editQ, explanation: e.target.value})} rows={2} style={{ ...S.input, resize:'vertical' }} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={saveEditQ} style={S.btn(C.green)}>💾 저장</button>
            <button onClick={() => setEditQ(null)} style={S.btnSec}>취소</button>
          </div>
        </div>
      </div>}
    </>}

    {/* ═══ 문제 분석 ═══ */}
    {tab === 'analytics' && <div style={S.card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:0 }}>문제별 분석</h3>
        <button onClick={loadAnalytics} style={S.btnSm(C.blue)}>🔄 새로고침</button>
      </div>
      {analytics.length === 0 ? <p style={{ color:C.t2 }}>데이터가 없습니다.</p> :
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>{['#','상태','유형','카테고리','문제','응시','정답률(%)','평균(초)','난이도'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{analytics.map(a => <tr key={a.question_id} style={{ opacity: a.is_included !== false ? 1 : 0.4 }}>
            <td style={S.td}>{a.sort_order}</td>
            <td style={S.td}><span style={S.tag(a.is_included !== false ? C.green : C.red)}>{a.is_included !== false ? '포함' : '제외'}</span></td>
            <td style={S.td}><span style={S.tag(TYPE_C[a.type]||C.t2)}>{TYPE_L[a.type]}</span></td>
            <td style={S.td}>{a.category}</td>
            <td style={{ ...S.td, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.question}</td>
            <td style={S.td}>{a.attempt_count}</td>
            <td style={{ ...S.td, fontWeight:700, color: a.correct_rate >= 60 ? C.green : a.correct_rate > 0 ? C.red : C.t2 }}>{a.correct_rate}%</td>
            <td style={S.td}>{a.avg_time_sec}초</td>
            <td style={S.td}><span style={S.tag(a.difficulty==='어려움'?C.red:a.difficulty==='보통'?C.yellow:a.difficulty==='쉬움'?C.green:C.t2)}>{a.difficulty}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>}

    {/* ═══ 로그 ═══ */}
    {tab === 'log' && <div style={{ ...S.card, maxHeight:500, overflowY:'auto' }}>
      {log.length === 0 ? <p style={{ color:C.t2 }}>로그가 없습니다.</p> :
        log.map((l, i) => <div key={i} style={{ fontSize:12, color:C.t2, padding:'3px 0', borderBottom:'1px solid rgba(148,163,184,0.05)', fontFamily:'monospace' }}>{l}</div>)}
    </div>}
  </div></div>
}

/* ═══════════════════ STUDENT LOGIN ════════════════════ */
function StudentLogin({ onLogin, onBack }) {
  const [sid, setSid] = useState('')
  const [name, setName] = useState('')
  const [save, setSave] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  // localStorage 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cbt_student')
      if (saved) { const d = JSON.parse(saved); setSid(d.sid || ''); setName(d.name || ''); setSave(true) }
    } catch(e) {}
  }, [])

  const login = async () => {
    if (!sid.trim() || !name.trim()) { setErr('학번과 이름을 모두 입력해주세요.'); return }
    setLoading(true); setErr('')

    // 명단 검증
    const { data: rosterMatch } = await supabase.from('roster').select('*').eq('student_id', sid.trim()).single()
    if (!rosterMatch) { setErr('등록되지 않은 학번입니다. 관리자에게 문의하세요.'); setLoading(false); return }
    if (rosterMatch.name !== name.trim()) { setErr('학번과 이름이 일치하지 않습니다.'); setLoading(false); return }

    // localStorage 저장
    if (save) localStorage.setItem('cbt_student', JSON.stringify({ sid: sid.trim(), name: name.trim() }))
    else localStorage.removeItem('cbt_student')

    // 활성 시험 확인
    const { data: exams } = await supabase.from('exams').select('*').eq('is_active', true).limit(1)
    let examToUse = exams?.[0]
    if (!examToUse) {
      const { data: recent } = await supabase.from('exams').select('*').order('created_at', { ascending: false }).limit(1)
      examToUse = recent?.[0]
      if (!examToUse) { setErr('현재 시험이 없습니다. 관리자에게 문의하세요.'); setLoading(false); return }
    }

    const isActive = examToUse.is_active
    const { data: qCount } = await supabase.from('questions').select('id', { count: 'exact' }).eq('exam_id', examToUse.id).eq('is_included', true)
    const total = qCount?.length || 0

    const { data: student, error } = await supabase.from('students').upsert({
      student_id: sid.trim(), name: name.trim(), exam_id: examToUse.id,
      status: isActive ? '응시중' : '대기',
      started_at: isActive ? new Date().toISOString() : null,
      total_questions: total, current_question: isActive ? 1 : 0
    }, { onConflict: 'student_id,exam_id' }).select().single()

    if (error) { setErr('접속 오류: ' + error.message); setLoading(false); return }
    onLogin({ student, exam: examToUse })
  }

  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ ...S.card, width:400, textAlign:'center' }}>
      <div style={{ fontSize:36, marginBottom:8 }}>🎓</div>
      <h2 style={{ color:C.t1, marginBottom:4, fontSize:22 }}>CBT 시험 접속</h2>
      <p style={{ color:C.t2, marginBottom:24, fontSize:13 }}>등록된 학번과 이름을 입력하세요</p>
      <div style={{ textAlign:'left', marginBottom:12 }}>
        <label style={{ fontSize:12, color:C.t2, marginBottom:4, display:'block' }}>학번</label>
        <input value={sid} onChange={e => setSid(e.target.value)} placeholder="예: 20241234" style={S.input} />
      </div>
      <div style={{ textAlign:'left', marginBottom:12 }}>
        <label style={{ fontSize:12, color:C.t2, marginBottom:4, display:'block' }}>이름</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 홍길동" onKeyDown={e => e.key === 'Enter' && login()} style={S.input} />
      </div>
      <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, cursor:'pointer', justifyContent:'flex-start' }}>
        <input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} style={S.checkbox} />
        <span style={{ fontSize:13, color:C.t2 }}>학번과 이름 저장 (다음 접속 시 자동 입력)</span>
      </label>
      {err && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</p>}
      <button onClick={login} disabled={loading} style={{ ...S.btn(), width:'100%', justifyContent:'center' }}>{loading ? '접속 중...' : '접속하기'}</button>
      <button onClick={onBack} style={{ ...S.btnSec, width:'100%', justifyContent:'center', marginTop:8 }}>뒤로</button>
    </div>
  </div>
}

/* ═══════════════════ STUDENT EXAM ═════════════════════ */
function StudentExam({ student: initStudent, exam: initExam, onFinish }) {
  const [student, setStudent] = useState(initStudent)
  const [exam, setExam] = useState(initExam)
  const [questions, setQuestions] = useState([])
  const [ci, setCi] = useState(0)
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [waiting, setWaiting] = useState(!initExam.is_active)
  const [showNav, setShowNav] = useState(false)
  const qStartRef = useRef(Date.now())
  const timeSpent = useRef({})
  const timerRef = useRef(null)

  useEffect(() => { if (exam.is_active) loadQuestions() }, [exam.is_active])
  useEffect(() => {
    if (!waiting) return
    const poll = setInterval(async () => {
      const { data } = await supabase.from('exams').select('*').eq('id', exam.id).single()
      if (data?.is_active) { setExam(data); setWaiting(false); await supabase.from('students').update({ status:'응시중', started_at: new Date().toISOString() }).eq('id', student.id) }
    }, 3000)
    return () => clearInterval(poll)
  }, [waiting])

  const loadQuestions = async () => {
    const { data } = await supabase.from('questions').select('*').eq('exam_id', exam.id).eq('is_included', true).order('sort_order')
    if (data) { setQuestions(data); setTimeLeft(exam.time_limit_min * 60); await supabase.from('students').update({ total_questions: data.length, current_question: 1 }).eq('id', student.id) }
  }

  useEffect(() => {
    if (questions.length === 0 || submitted || waiting) return
    timerRef.current = setInterval(() => setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); submitExam(); return 0 } return t - 1 }), 1000)
    return () => clearInterval(timerRef.current)
  }, [questions.length, submitted, waiting])

  const recordTime = () => { if (!questions[ci]) return; const qid = questions[ci].id; timeSpent.current[qid] = (timeSpent.current[qid]||0) + Date.now() - qStartRef.current; qStartRef.current = Date.now() }
  const navigateTo = async (idx) => { if (idx < 0 || idx >= questions.length || submitted) return; recordTime(); setCi(idx); qStartRef.current = Date.now(); await supabase.from('students').update({ current_question: idx + 1 }).eq('id', student.id) }
  const handleAnswer = (qid, val) => setAnswers(prev => ({ ...prev, [qid]: val }))

  const submitExam = async () => {
    if (submitted) return; setSubmitted(true); clearInterval(timerRef.current); recordTime()
    let correctCount = 0
    for (const q of questions) {
      const ua = answers[q.id]; const correct = checkAnswer(q, ua); if (correct) correctCount++
      await supabase.from('answers').upsert({ student_id: student.id, question_id: q.id, exam_id: exam.id, user_answer: ua ?? null, is_correct: correct, time_spent_ms: timeSpent.current[q.id] || 0 }, { onConflict: 'student_id,question_id' })
    }
    const score = Math.round(correctCount / questions.length * 100 * 10) / 10
    await supabase.from('students').update({ status:'제출완료', submitted_at: new Date().toISOString(), score, correct_count: correctCount, total_questions: questions.length }).eq('id', student.id)
    onFinish({ questions, answers, timeSpent: timeSpent.current, score, correctCount })
  }

  if (waiting) return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ ...S.card, width:400, textAlign:'center' }}><div style={{ fontSize:48 }}>⏳</div><h2 style={{ color:C.t1, marginTop:12 }}>시험 대기 중...</h2><p style={{ color:C.t2, marginTop:8 }}>관리자가 시험을 시작하면 자동으로 문제가 표시됩니다.</p><p style={{ color:C.blue, fontSize:13, marginTop:16 }}>{student.name}님 ({student.student_id})</p></div></div>
  if (questions.length === 0) return <div style={S.page}><p style={{ color:C.t2, textAlign:'center', marginTop:40 }}>문제를 불러오는 중...</p></div>

  const q = questions[ci], progress = (ci + 1) / questions.length * 100
  const min = Math.floor(timeLeft / 60), sec = timeLeft % 60
  const answeredCount = Object.keys(answers).filter(k => answers[k] != null).length

  return <div style={S.page}><div style={S.container}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
      <div><h2 style={{ color:C.t1, fontSize:17, fontWeight:700, margin:0 }}>{exam.title}</h2><p style={{ color:C.t2, fontSize:12, margin:'3px 0 0' }}>{ci+1}/{questions.length} · {answeredCount}개 작성 · {student.name}</p></div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontWeight:700, fontSize:17, fontVariantNumeric:'tabular-nums', color: timeLeft<60?C.red:timeLeft<120?C.yellow:C.blue }}>⏱ {String(min).padStart(2,'0')}:{String(sec).padStart(2,'0')}</div>
        <button onClick={() => setShowNav(!showNav)} style={S.btnSec}>☰</button>
      </div>
    </div>
    <div style={{ width:'100%', height:4, background:'rgba(148,163,184,0.1)', borderRadius:2, marginBottom:14, overflow:'hidden' }}><div style={{ height:'100%', width:`${progress}%`, background:C.blue, borderRadius:2, transition:'width 0.3s' }} /></div>
    {showNav && <div style={{ ...S.card, padding:14 }}><div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>{questions.map((qq, i) => {
      const ans = answers[qq.id] != null, cur = i === ci
      return <button key={i} onClick={() => navigateTo(i)} style={{ width:32, height:32, borderRadius:7, border:'none', cursor:'pointer', fontWeight:700, fontSize:12, background:cur?C.blue:ans?'rgba(16,185,129,0.15)':'rgba(148,163,184,0.1)', color:cur?'#fff':ans?C.green:C.t2 }}>{i+1}</button>
    })}</div></div>}
    <div style={S.card}>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}><span style={S.tag(TYPE_C[q.type])}>{TYPE_L[q.type]}</span><span style={S.tag(C.t2)}>{q.category}</span></div>
      <h3 style={{ color:C.t1, fontSize:16, fontWeight:600, lineHeight:1.65, margin:'0 0 18px' }}><span style={{ color:C.blue }}>Q{ci+1}.</span> {q.question}</h3>
      {q.type === 'multiple_choice' && <MCQ q={q} value={answers[q.id]} onChange={v => handleAnswer(q.id, v)} />}
      {q.type === 'ox' && <OXQ q={q} value={answers[q.id]} onChange={v => handleAnswer(q.id, v)} />}
      {q.type === 'short_answer' && <SAQ q={q} value={answers[q.id]} onChange={v => handleAnswer(q.id, v)} />}
      {q.type === 'matching' && <MatchQ q={q} value={answers[q.id]} onChange={v => handleAnswer(q.id, v)} />}
    </div>
    <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, flexWrap:'wrap', gap:8 }}>
      <button onClick={() => navigateTo(ci-1)} disabled={ci===0} style={{ ...S.btnSec, opacity:ci===0?0.4:1 }}>◀ 이전</button>
      <div style={{ display:'flex', gap:8 }}>
        {ci < questions.length - 1
          ? <button onClick={() => navigateTo(ci+1)} style={S.btn()}>다음 ▶</button>
          : <button onClick={() => { if(confirm(`제출하시겠습니까?\n작성: ${answeredCount}/${questions.length}`)) submitExam() }} style={S.btn(C.green)}>✔ 제출</button>}
      </div>
    </div>
  </div></div>
}

/* ─── Question Components ─── */
function MCQ({ q, value, onChange }) {
  const labels = ['A','B','C','D']
  return <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
    {(q.options||[]).map((opt, i) => {
      const sel = value === i
      return <button key={i} onClick={() => onChange(i)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, background:sel?'rgba(59,130,246,0.12)':'rgba(148,163,184,0.05)', border:sel?'1px solid rgba(59,130,246,0.4)':'1px solid rgba(148,163,184,0.1)', color:C.t1, fontSize:14, cursor:'pointer', textAlign:'left' }}>
        <span style={{ width:28, height:28, borderRadius:6, background:sel?'rgba(59,130,246,0.25)':'rgba(148,163,184,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, color:sel?C.blue:C.t2, flexShrink:0 }}>{labels[i]}</span>{opt}
      </button>
    })}
  </div>
}
function OXQ({ q, value, onChange }) {
  return <div style={{ display:'flex', gap:14, justifyContent:'center', padding:'8px 0' }}>
    {[{l:'O',v:true,c:C.blue},{l:'X',v:false,c:C.red}].map(o => {
      const sel = value === o.v
      return <button key={o.l} onClick={() => onChange(o.v)} style={{ width:100, height:100, borderRadius:16, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, background:sel?`${o.c}18`:'rgba(148,163,184,0.05)', border:`2px solid ${sel?o.c:'rgba(148,163,184,0.15)'}`, fontSize:36, fontWeight:800, color:sel?o.c:C.t2 }}>{o.l}<span style={{ fontSize:10, fontWeight:500, opacity:0.7 }}>{o.v?'맞다':'틀리다'}</span></button>
    })}
  </div>
}
function SAQ({ q, value, onChange }) { return <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="정답을 입력하세요..." style={{ ...S.input, fontSize:15, padding:'13px 16px' }} /> }
function MatchQ({ q, value, onChange }) {
  const pairs = q.pairs || []; const rightItems = useMemo(() => pairs.map((p, i) => ({ text: typeof p==='object'?(p.right||p[1]||''):'', origIdx:i })).sort(() => Math.random()-0.5), [q.id])
  const cur = value || {}; const opts = ['-- 선택 --', ...rightItems.map(r => r.text)]
  return <div><p style={{ fontSize:12, color:C.t2, marginBottom:10 }}>왼쪽에 맞는 오른쪽 항목을 선택하세요.</p>
    {pairs.map((p, i) => <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, flexWrap:'wrap' }}>
      <span style={{ fontSize:13, fontWeight:600, color:C.t1, minWidth:140 }}>{i+1}. {typeof p==='object'?(p.left||p[0]||''):''}</span>
      <span style={{ color:C.blue, fontWeight:700 }}>→</span>
      <select value={cur[i]!=null?rightItems.findIndex(r=>r.origIdx===cur[i])+1:0} onChange={e => { const si=+e.target.value-1; const n={...cur}; if(si>=0) n[i]=rightItems[si].origIdx; else delete n[i]; onChange(n) }} style={{ ...S.input, width:'auto', minWidth:180 }}>
        {opts.map((o, j) => <option key={j} value={j}>{o}</option>)}
      </select>
    </div>)}
  </div>
}

/* ═══════════════════ STUDENT RESULT ═══════════════════ */
function StudentResult({ data, onHome }) {
  const { questions, answers, score, correctCount } = data
  const passed = score >= 60, mc = passed ? C.green : C.red
  const byType = {}, byCat = {}
  questions.forEach(q => { const c = checkAnswer(q, answers[q.id]); const t=q.type, k=q.category; if(!byType[t])byType[t]=[0,0]; byType[t][1]++; if(c)byType[t][0]++; if(!byCat[k])byCat[k]=[0,0]; byCat[k][1]++; if(c)byCat[k][0]++ })
  const wrongQs = questions.filter(q => !checkAnswer(q, answers[q.id]))

  return <div style={S.page}><div style={S.container}>
    <div style={{ ...S.card, textAlign:'center', border:`2px solid ${mc}33`, padding:32 }}>
      <div style={{ width:100, height:100, borderRadius:'50%', margin:'0 auto 14px', background:`${mc}15`, border:`3px solid ${mc}44`, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
        <span style={{ fontSize:32, fontWeight:800, color:mc }}>{score}</span><span style={{ fontSize:12, color:C.t2 }}>점</span>
      </div>
      <h2 style={{ color:mc, fontSize:22, fontWeight:800, margin:'0 0 6px' }}>{passed?'합격':'불합격'}</h2>
      <p style={{ color:C.t2, fontSize:14 }}>총 {questions.length}문항 중 {correctCount}문항 정답 (합격기준 60점)</p>
    </div>
    <div style={S.card}><h3 style={{ color:C.t1, fontSize:14, fontWeight:700, margin:'0 0 12px' }}>유형별 성적</h3>
      {Object.entries(byType).map(([t,[c,total]]) => { const p=Math.round(c/total*100); return <div key={t} style={{ marginBottom:10 }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={S.tag(TYPE_C[t])}>{TYPE_L[t]}</span><span style={{ fontSize:13, fontWeight:700, color:p>=60?C.green:C.red }}>{c}/{total} ({p}%)</span></div><div style={{ height:4, background:'rgba(148,163,184,0.1)', borderRadius:2 }}><div style={{ height:'100%', width:`${p}%`, background:p>=60?C.green:C.red, borderRadius:2 }} /></div></div> })}
    </div>
    <div style={S.card}><h3 style={{ color:C.t1, fontSize:14, fontWeight:700, margin:'0 0 12px' }}>카테고리별 성적</h3>
      {Object.entries(byCat).map(([cat,[c,total]]) => { const p=Math.round(c/total*100); return <div key={cat} style={{ marginBottom:10 }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={{ fontSize:13, color:C.t1 }}>{cat}</span><span style={{ fontSize:13, fontWeight:700, color:p>=60?C.green:C.red }}>{c}/{total} ({p}%)</span></div><div style={{ height:4, background:'rgba(148,163,184,0.1)', borderRadius:2 }}><div style={{ height:'100%', width:`${p}%`, background:p>=60?C.green:C.red, borderRadius:2 }} /></div></div> })}
    </div>
    {wrongQs.length > 0 && <div style={S.card}><h3 style={{ color:C.t1, fontSize:14, fontWeight:700, margin:'0 0 12px' }}>오답 노트 ({wrongQs.length}문항)</h3>
      {wrongQs.map(q => <div key={q.id} style={{ padding:12, borderRadius:10, marginBottom:8, background:'rgba(239,68,68,0.04)', border:'1px solid rgba(239,68,68,0.1)' }}>
        <div style={{ display:'flex', gap:6, marginBottom:5 }}><span style={S.tag(TYPE_C[q.type])}>{TYPE_L[q.type]}</span><span style={{ fontSize:11, color:C.t2 }}>{q.category}</span></div>
        <p style={{ color:C.t1, fontSize:13, fontWeight:600, lineHeight:1.6, margin:'0 0 5px' }}>{q.question}</p>
        {q.explanation && <p style={{ color:C.t2, fontSize:12, lineHeight:1.6, margin:0 }}>💡 {q.explanation}</p>}
      </div>)}
    </div>}
    <div style={{ textAlign:'center', marginTop:8 }}><button onClick={onHome} style={S.btn()}>처음으로</button></div>
  </div></div>
}

/* ═══════════════════ ANSWER CHECK ═════════════════════ */
function checkAnswer(q, userAnswer) {
  if (userAnswer == null || userAnswer === '') return false
  switch (q.type) {
    case 'multiple_choice': return userAnswer === (typeof q.answer==='number'?q.answer:parseInt(q.answer,10))
    case 'ox': return userAnswer === (typeof q.answer==='boolean'?q.answer:q.answer===true||q.answer==='true')
    case 'short_answer': { const aa = Array.isArray(q.answer)?q.answer:[String(q.answer)]; return aa.some(a => String(a).trim().toLowerCase()===String(userAnswer).trim().toLowerCase()) }
    case 'matching': { if (typeof userAnswer!=='object') return false; return (q.pairs||[]).every((_,i)=>userAnswer[i]===i) }
    default: return false
  }
}

/* ═══════════════════ MAIN APP ═════════════════════════ */
export default function App() {
  const [screen, setScreen] = useState('role')
  const [studentData, setStudentData] = useState(null)
  const [resultData, setResultData] = useState(null)
  switch (screen) {
    case 'role': return <RoleSelect onRole={r => setScreen(r==='admin'?'adminLogin':'studentLogin')} />
    case 'adminLogin': return <AdminLogin onLogin={() => setScreen('admin')} onBack={() => setScreen('role')} />
    case 'admin': return <AdminDashboard onBack={() => setScreen('role')} />
    case 'studentLogin': return <StudentLogin onLogin={d => { setStudentData(d); setScreen('studentExam') }} onBack={() => setScreen('role')} />
    case 'studentExam': return <StudentExam student={studentData.student} exam={studentData.exam} onFinish={d => { setResultData(d); setScreen('studentResult') }} />
    case 'studentResult': return <StudentResult data={resultData} onHome={() => setScreen('role')} />
    default: return <RoleSelect onRole={r => setScreen(r==='admin'?'adminLogin':'studentLogin')} />
  }
}
