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
    if (!type) { const ans = (fields['정답']||'').trim(); if (content.some(l => /^[1-4]\)/.test(l))) type = 'multiple_choice'; else if (ans === 'O' || ans === 'X') type = 'ox'; else if (content.some(l => l.includes('='))) type = 'matching'; else type = 'short_answer' }
    const q = { type, category: fields['카테고리']||'일반', question: fields['문제']||'', explanation: fields['해설']||'' }
    if (type === 'multiple_choice') { q.options = content.filter(l => /^[1-4]\)/.test(l)).map(l => l.replace(/^[1-4]\)\s*/, '')); q.answer = parseInt(fields['정답']||'1', 10) - 1 }
    else if (type === 'ox') { q.answer = (fields['정답']||'O').trim().toUpperCase() === 'O' }
    else if (type === 'short_answer') { q.answer = (fields['정답']||'').split(',').map(s => s.trim()).filter(Boolean) }
    else if (type === 'matching') { q.pairs = content.filter(l => l.includes('=')).map(l => { const p = l.split('='); return { left: p[0]?.trim(), right: p[1]?.trim() }}) }
    return q.question ? q : null
  }).filter(Boolean)
}

/* ═══════════════════ STYLES ═══════════════════════════ */
const C = { bg:'#0f172a', card:'#1e293b', input:'#334155', t1:'#f1f5f9', t2:'#94a3b8', blue:'#3b82f6', green:'#10b981', red:'#ef4444', yellow:'#f59e0b', purple:'#8b5cf6' }
const S = {
  page: { minHeight:'100vh', background:C.bg, padding:'20px 16px' },
  container: { maxWidth:960, margin:'0 auto' },
  card: { background:C.card, borderRadius:16, padding:24, marginBottom:16, border:'1px solid rgba(148,163,184,0.1)' },
  btn: (c=C.blue) => ({ background:c, color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }),
  btnSm: (c=C.blue) => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }),
  btnSec: { background:'rgba(148,163,184,0.1)', color:C.t2, border:'1px solid rgba(148,163,184,0.2)', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 },
  input: { width:'100%', padding:'10px 14px', fontSize:14, background:C.input, border:'1px solid rgba(148,163,184,0.2)', borderRadius:10, color:C.t1, outline:'none', boxSizing:'border-box' },
  tag: (c) => ({ display:'inline-block', background:`${c}22`, color:c, borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:600 }),
  th: { padding:'8px 10px', textAlign:'left', fontSize:12, fontWeight:700, color:C.t2, borderBottom:'1px solid rgba(148,163,184,0.1)' },
  td: { padding:'7px 10px', fontSize:13, color:C.t1, borderBottom:'1px solid rgba(148,163,184,0.05)' },
  cb: { width:16, height:16, accentColor:C.blue, cursor:'pointer' },
  modal: { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
}
const TYPE_L = { multiple_choice:'4지선다', ox:'O/X', short_answer:'단답형', matching:'선잇기' }
const TYPE_C = { multiple_choice:C.blue, ox:C.purple, short_answer:C.yellow, matching:C.green }
const statusColor = (s) => s==='제출완료'?C.green:s==='응시중'?C.blue:s==='응시종료'?C.yellow:C.t2

/* ═══════════════════ SHUFFLE ENGINE ═══════════════════ */
function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0 } return Math.abs(h) }

function seededRNG(seed) {
  let s = seed | 0
  return () => { s = (s * 1664525 + 1013904223) | 0; return (s >>> 0) / 4294967296 }
}

function seededShuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

function applyShuffles(questions, examOpts, studentId) {
  const seed = examOpts.shuffle_per_student !== false ? hashCode(studentId + ':' + (examOpts.id || '')) : hashCode('fixed:' + (examOpts.id || ''))
  let qs = [...questions]

  // 1. 문제 순서 셔플
  if (examOpts.shuffle_by_type) {
    const order = ['multiple_choice','ox','short_answer','matching']
    const groups = {}; order.forEach(t => groups[t] = [])
    qs.forEach(q => { if (groups[q.type]) groups[q.type].push(q); else { if (!groups[q.type]) groups[q.type] = []; groups[q.type].push(q) } })
    qs = []; order.forEach(t => { if (groups[t]?.length) qs.push(...seededShuffle(groups[t], seededRNG(seed + hashCode(t)))) })
  } else if (examOpts.shuffle_questions) {
    qs = seededShuffle(qs, seededRNG(seed))
  }

  // 2. 객관식 보기 셔플
  if (examOpts.shuffle_options) {
    qs = qs.map(q => {
      if (q.type !== 'multiple_choice' || !q.options?.length) return q
      const rng = seededRNG(seed + q.id)
      const indices = q.options.map((_, i) => i)
      const shuffled = seededShuffle(indices, rng)
      const origAnswer = typeof q.answer === 'number' ? q.answer : parseInt(q.answer, 10)
      return { ...q, options: shuffled.map(i => q.options[i]), answer: shuffled.indexOf(origAnswer) }
    })
  }
  return qs
}

/* ═══════════════════ SESSION STORAGE ══════════════════ */
const SS = {
  save: (key, val) => { try { sessionStorage.setItem(key, JSON.stringify(val)) } catch(e) {} },
  load: (key) => { try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null } catch(e) { return null } },
  remove: (key) => { try { sessionStorage.removeItem(key) } catch(e) {} },
}

/* ═══════════════════ MINI BAR CHART ═══════════════════ */
function MiniBarChart({ scores, height = 100, width = 280 }) {
  if (!scores || scores.length === 0) return <span style={{ color:C.t2, fontSize:12 }}>응시 이력 없음</span>
  const barW = Math.min(32, (width - 20) / scores.length - 4)
  return <svg width={width} height={height + 20} style={{ display:'block' }}>
    <line x1={0} y1={height} x2={width} y2={height} stroke="rgba(148,163,184,0.2)" strokeWidth={1} />
    <line x1={0} y1={height * 0.4} x2={width} y2={height * 0.4} stroke="rgba(239,68,68,0.15)" strokeWidth={1} strokeDasharray="4" />
    <text x={width - 2} y={height * 0.4 - 3} fill={C.red} fontSize={9} textAnchor="end">60점</text>
    {scores.map((s, i) => { const h = (s / 100) * height, x = 10 + i * (barW + 4), cl = s >= 60 ? C.green : C.red; return <g key={i}><rect x={x} y={height - h} width={barW} height={h} rx={3} fill={cl} opacity={0.8} /><text x={x + barW / 2} y={height - h - 4} fill={C.t1} fontSize={10} textAnchor="middle" fontWeight={700}>{s}</text><text x={x + barW / 2} y={height + 14} fill={C.t2} fontSize={9} textAnchor="middle">#{i + 1}</text></g> })}
  </svg>
}

/* ═══════════════════ ROLE SELECT ══════════════════════ */
function RoleSelect({ onRole }) {
  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ textAlign:'center' }}>
    <div style={{ fontSize:48, marginBottom:16 }}>📝</div>
    <h1 style={{ color:C.t1, fontSize:28, fontWeight:800, marginBottom:8 }}>일학습병행 CBT</h1>
    <p style={{ color:C.t2, marginBottom:32 }}>지필고사 연습 프로그램</p>
    <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
      <button onClick={() => onRole('admin')} style={{ ...S.btn(C.purple), padding:'20px 40px', fontSize:17 }}>🔧 관리자</button>
      <button onClick={() => onRole('student')} style={{ ...S.btn(C.blue), padding:'20px 40px', fontSize:17 }}>🎓 학생</button>
    </div>
  </div></div>
}

/* ═══════════════════ ADMIN LOGIN ══════════════════════ */
function AdminLogin({ onLogin, onBack }) {
  const [pw, setPw] = useState(''), [err, setErr] = useState(''), [ld, setLd] = useState(false)
  const login = async () => { setLd(true); setErr(''); const { data } = await supabase.from('admin_config').select('value').eq('key','admin_password').single(); if (data?.value === pw) onLogin(); else { setErr('비밀번호가 틀렸습니다.'); setLd(false) } }
  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ ...S.card, width:380, textAlign:'center' }}>
    <h2 style={{ color:C.t1, marginBottom:20 }}>🔧 관리자 로그인</h2>
    <input type="password" placeholder="관리자 비밀번호" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key==='Enter'&&login()} style={{ ...S.input, marginBottom:12 }} />
    {err && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</p>}
    <button onClick={login} disabled={ld} style={{ ...S.btn(), width:'100%', justifyContent:'center' }}>{ld?'확인 중...':'로그인'}</button>
    <button onClick={onBack} style={{ ...S.btnSec, width:'100%', justifyContent:'center', marginTop:8 }}>뒤로</button>
  </div></div>
}

/* ═══════════════════ ADMIN DASHBOARD ══════════════════ */
function AdminDashboard({ onBack }) {
  const [tab, setTab] = useState('roster')
  const [exam, setExam] = useState(null), [questions, setQuestions] = useState([]), [students, setStudents] = useState([]), [roster, setRoster] = useState([]), [analytics, setAnalytics] = useState([]), [examHistory, setExamHistory] = useState([])
  const [timeLimit, setTimeLimit] = useState(30), [title, setTitle] = useState('일학습병행 지필고사'), [log, setLog] = useState([])
  // 셔플 옵션
  const [shufQ, setShufQ] = useState(false), [shufType, setShufType] = useState(false), [shufOpt, setShufOpt] = useState(false), [shufStudent, setShufStudent] = useState(true)
  const fileRef = useRef(null), rosterFileRef = useRef(null)
  const [selQ, setSelQ] = useState(new Set()), [editQ, setEditQ] = useState(null)
  const [selR, setSelR] = useState(new Set()), [newSid, setNewSid] = useState(''), [newName, setNewName] = useState(''), [detailStudent, setDetailStudent] = useState(null)
  const addLog = (m) => setLog(p => [`[${new Date().toLocaleTimeString()}] ${m}`, ...p].slice(0, 100))

  useEffect(() => { loadActiveExam(); loadRoster(); const iv = setInterval(() => { if (exam) loadStudents() }, 3000); return () => clearInterval(iv) }, [exam?.id])
  useEffect(() => { if (!exam) return; const ch = supabase.channel('adm').on('postgres_changes', { event:'*', schema:'public', table:'students', filter:`exam_id=eq.${exam.id}` }, () => loadStudents()).subscribe(); return () => supabase.removeChannel(ch) }, [exam?.id])

  const loadActiveExam = async () => {
    let { data } = await supabase.from('exams').select('*').eq('is_active', true).order('created_at', { ascending:false }).limit(1)
    if (!data?.length) { const r = await supabase.from('exams').select('*').order('created_at', { ascending:false }).limit(1); data = r.data }
    if (data?.length) { const e = data[0]; setExam(e); setTitle(e.title); setTimeLimit(e.time_limit_min); setShufQ(!!e.shuffle_questions); setShufType(!!e.shuffle_by_type); setShufOpt(!!e.shuffle_options); setShufStudent(e.shuffle_per_student !== false); await loadQuestions(e.id); await loadStudents(e.id) }
  }
  const loadQuestions = async (eid) => { const id = eid||exam?.id; if (!id) return; const { data } = await supabase.from('questions').select('*').eq('exam_id', id).order('sort_order'); setQuestions(data||[]) }
  const loadStudents = async (eid) => { const id = eid||exam?.id; if (!id) return; const { data } = await supabase.from('students').select('*').eq('exam_id', id).order('created_at'); setStudents(data||[]) }
  const loadRoster = async () => { const { data } = await supabase.from('roster').select('*').order('student_id'); setRoster(data||[]) }
  const loadAnalytics = async () => { if (!exam) return; const { data } = await supabase.from('question_analytics').select('*').eq('exam_id', exam.id); setAnalytics(data||[]) }
  const loadExamHistory = async () => { const { data } = await supabase.from('student_exam_history').select('*'); setExamHistory(data||[]) }

  const createExam = async () => { await supabase.from('exams').update({ is_active:false }).eq('is_active', true); const { data } = await supabase.from('exams').insert({ title, time_limit_min:timeLimit, is_active:false, shuffle_questions:shufQ, shuffle_by_type:shufType, shuffle_options:shufOpt, shuffle_per_student:shufStudent }).select().single(); if (data) { setExam(data); addLog(`시험 생성: "${title}"`); setQuestions([]); setStudents([]) } }
  const startExam = async () => { if (!exam) return; const ic = questions.filter(q => q.is_included!==false).length; if (ic===0) { alert('포함된 문제가 없습니다!'); return }; await supabase.from('exams').update({ is_active:true, started_at:new Date().toISOString(), shuffle_questions:shufQ, shuffle_by_type:shufType, shuffle_options:shufOpt, shuffle_per_student:shufStudent }).eq('id', exam.id); setExam({ ...exam, is_active:true, shuffle_questions:shufQ, shuffle_by_type:shufType, shuffle_options:shufOpt, shuffle_per_student:shufStudent }); addLog(`═══ 시험 시작 (${ic}문제, ${timeLimit}분) ═══`) }
  const stopExam = async () => { if (!exam) return; await supabase.from('exams').update({ is_active:false, ended_at:new Date().toISOString() }).eq('id', exam.id); setExam({ ...exam, is_active:false }); addLog('═══ 시험 종료 ═══') }

  // Roster
  const uploadRoster = async (e) => { const f = e.target.files?.[0]; if (!f) return; const t = await f.text(); const entries = t.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const p = l.split(/[,\t]/).map(s=>s.trim()).filter(Boolean); return p.length>=2?{student_id:p[0],name:p[1]}:null }).filter(Boolean); if (!entries.length) { alert('파싱된 학생이 없습니다.'); return }; const { error } = await supabase.from('roster').upsert(entries, { onConflict:'student_id' }); if (error) addLog('오류: '+error.message); else { addLog(`명단 ${entries.length}명 업로드`); loadRoster() }; if (rosterFileRef.current) rosterFileRef.current.value='' }
  const addRS = async () => { if (!newSid.trim()||!newName.trim()) { alert('학번과 이름을 입력하세요'); return }; await supabase.from('roster').upsert({ student_id:newSid.trim(), name:newName.trim() }, { onConflict:'student_id' }); setNewSid(''); setNewName(''); loadRoster(); addLog(`학생 추가: ${newSid} ${newName}`) }
  const delSelR = async () => { if (selR.size===0||!confirm(`${selR.size}명 삭제?`)) return; await supabase.from('roster').delete().in('id', Array.from(selR)); setSelR(new Set()); loadRoster() }
  const togAllR = () => { selR.size===roster.length?setSelR(new Set()):setSelR(new Set(roster.map(r=>r.id))) }
  const togR = (id) => { const n=new Set(selR); n.has(id)?n.delete(id):n.add(id); setSelR(n) }

  // Questions
  const handleQF = async (e) => { const f=e.target.files?.[0]; if (!f||!exam) return; try { const t=await f.text(); const ext=f.name.split('.').pop().toLowerCase(); let p; if (ext==='json') { p=JSON.parse(t); if (!Array.isArray(p)) throw new Error('JSON은 배열') } else p=parseTXT(t); if (!p.length) { alert('문제 없음'); return }; const rows=p.map((q,i)=>({ exam_id:exam.id, type:q.type, category:q.category||'일반', question:q.question, options:q.options||[], answer:q.type==='multiple_choice'?q.answer:q.type==='ox'?q.answer:q.type==='short_answer'?q.answer:q.pairs||[], pairs:q.pairs||[], explanation:q.explanation||'', sort_order:i+1+questions.length, is_included:true })); await supabase.from('questions').insert(rows); addLog(`문제 ${p.length}개 업로드`); await loadQuestions() } catch(err) { alert('오류: '+err.message) }; if (fileRef.current) fileRef.current.value='' }
  const togAllQ = () => { selQ.size===questions.length?setSelQ(new Set()):setSelQ(new Set(questions.map(q=>q.id))) }
  const togQ = (id) => { const n=new Set(selQ); n.has(id)?n.delete(id):n.add(id); setSelQ(n) }
  const delSelQ = async () => { if (selQ.size===0||!confirm(`${selQ.size}문항 삭제?`)) return; await supabase.from('questions').delete().in('id', Array.from(selQ)); setSelQ(new Set()); loadQuestions() }
  const togInc = async (id, cur) => { await supabase.from('questions').update({ is_included:!cur }).eq('id', id); loadQuestions() }
  const bulkInc = async (v) => { if (selQ.size===0) return; await supabase.from('questions').update({ is_included:v }).in('id', Array.from(selQ)); loadQuestions() }
  const saveEQ = async () => { if (!editQ) return; await supabase.from('questions').update({ question:editQ.question, category:editQ.category, explanation:editQ.explanation, options:editQ.options, answer:editQ.answer, pairs:editQ.pairs }).eq('id', editQ.id); setEditQ(null); loadQuestions() }

  const incC = questions.filter(q => q.is_included!==false).length
  const tabBtn = (k, l) => <button key={k} onClick={() => { setTab(k); if (k==='analytics') loadAnalytics(); if (k==='roster') { loadRoster(); loadExamHistory() } }} style={{ padding:'9px 14px', fontSize:13, fontWeight:600, cursor:'pointer', background:tab===k?'rgba(59,130,246,0.15)':'transparent', color:tab===k?C.blue:C.t2, border:'none', borderBottom:tab===k?`2px solid ${C.blue}`:'2px solid transparent' }}>{l}</button>

  const ShufToggle = ({ checked, onChange, label }) => <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:C.t2 }}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={S.cb} />{label}</label>

  return <div style={S.page}><div style={S.container}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
      <div><h1 style={{ color:C.t1, fontSize:20, fontWeight:800, margin:0 }}>🔧 관리자 대시보드</h1>
        <p style={{ color:C.t2, fontSize:12, margin:'4px 0 0' }}>{exam?`"${exam.title}" | 문제: ${incC}/${questions.length} | 접속: ${students.length}명 | 명단: ${roster.length}명`:'시험을 생성하세요'}{exam?.is_active&&<span style={{ color:C.green, marginLeft:8 }}>● 진행중</span>}</p></div>
      <button onClick={onBack} style={S.btnSec}>← 나가기</button>
    </div>

    {/* 시험 제어 + 셔플 옵션 */}
    <div style={S.card}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap', marginBottom:16 }}>
        <div style={{ flex:1, minWidth:180 }}><label style={{ fontSize:11, color:C.t2, display:'block', marginBottom:3 }}>시험 제목</label><input value={title} onChange={e => setTitle(e.target.value)} style={S.input} /></div>
        <div style={{ width:90 }}><label style={{ fontSize:11, color:C.t2, display:'block', marginBottom:3 }}>시간(분)</label><input type="number" value={timeLimit} onChange={e => setTimeLimit(+e.target.value)} style={S.input} /></div>
        {!exam&&<button onClick={createExam} style={S.btn(C.blue)}>📋 시험 생성</button>}
        {exam&&!exam.is_active&&<button onClick={startExam} style={S.btn(C.green)}>🟢 시험 시작</button>}
        {exam?.is_active&&<button onClick={stopExam} style={S.btn(C.red)}>🔴 시험 종료</button>}
      </div>
      <div style={{ padding:'14px 16px', borderRadius:10, background:'rgba(148,163,184,0.04)', border:'1px solid rgba(148,163,184,0.08)' }}>
        <p style={{ color:C.t1, fontSize:13, fontWeight:700, margin:'0 0 10px' }}>🔀 출제 옵션</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <ShufToggle checked={shufQ} onChange={v => { setShufQ(v); if (v) setShufType(false) }} label="문제 순서 섞기 (전체 랜덤)" />
            <ShufToggle checked={shufType} onChange={v => { setShufType(v); if (v) setShufQ(false) }} label="유형별 묶어서 섞기" />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <ShufToggle checked={shufOpt} onChange={setShufOpt} label="보기 순서 섞기 (객관식)" />
            <ShufToggle checked={shufStudent} onChange={setShufStudent} label="학생별 다른 순서" />
          </div>
        </div>
        {shufType && <p style={{ color:C.t2, fontSize:11, margin:'8px 0 0' }}>유형 순서: 4지선다 → O/X → 단답형 → 선잇기 (유형 내 순서만 랜덤)</p>}
      </div>
    </div>

    <div style={{ display:'flex', borderBottom:'1px solid rgba(148,163,184,0.1)', marginBottom:14, flexWrap:'wrap' }}>{tabBtn('roster','👥 학생 명단')}{tabBtn('students','📋 응시 현황')}{tabBtn('questions','📝 문제 관리')}{tabBtn('analytics','📊 문제 분석')}{tabBtn('log','📜 로그')}</div>

    {/* 학생 명단 */}
    {tab==='roster'&&<>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}><input ref={rosterFileRef} type="file" accept=".txt,.csv" onChange={uploadRoster} style={{ display:'none' }} /><button onClick={() => rosterFileRef.current?.click()} style={S.btn(C.purple)}>📄 명단 업로드</button><span style={{ color:C.t2, fontSize:11 }}>학번,이름 또는 학번[탭]이름</span>{selR.size>0&&<button onClick={delSelR} style={{ ...S.btnSm(C.red), marginLeft:'auto' }}>🗑 삭제({selR.size})</button>}</div>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}><div style={{ width:140 }}><label style={{ fontSize:11, color:C.t2, display:'block', marginBottom:3 }}>학번</label><input value={newSid} onChange={e=>setNewSid(e.target.value)} placeholder="20241234" style={S.input} /></div><div style={{ width:120 }}><label style={{ fontSize:11, color:C.t2, display:'block', marginBottom:3 }}>이름</label><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="홍길동" onKeyDown={e=>e.key==='Enter'&&addRS()} style={S.input} /></div><button onClick={addRS} style={S.btn(C.green)}>➕ 추가</button></div>
      <div style={S.card}><h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 12px' }}>등록 명단 ({roster.length}명)</h3>
        {roster.length===0?<p style={{ color:C.t2, fontSize:13 }}>등록된 학생이 없습니다.</p>:
        <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr><th style={S.th}><input type="checkbox" checked={selR.size===roster.length&&roster.length>0} onChange={togAllR} style={S.cb} /></th><th style={S.th}>학번</th><th style={S.th}>이름</th><th style={S.th}>응시</th><th style={S.th}>최근</th><th style={S.th}>추이</th><th style={S.th}></th></tr></thead><tbody>{roster.map(r => { const sc = examHistory.filter(h=>h.student_id===r.student_id&&h.score!=null&&h.status==='제출완료').map(h=>h.score).reverse(); return <tr key={r.id} style={{ background:selR.has(r.id)?'rgba(59,130,246,0.06)':'transparent' }}><td style={S.td}><input type="checkbox" checked={selR.has(r.id)} onChange={()=>togR(r.id)} style={S.cb} /></td><td style={S.td}>{r.student_id}</td><td style={S.td}>{r.name}</td><td style={S.td}>{sc.length}회</td><td style={{ ...S.td, fontWeight:700, color:sc.length?sc[sc.length-1]>=60?C.green:C.red:C.t2 }}>{sc.length?`${sc[sc.length-1]}점`:'-'}</td><td style={S.td}><MiniBarChart scores={sc} height={36} width={Math.max(60,sc.length*28+20)} /></td><td style={S.td}><button onClick={()=>setDetailStudent(r)} style={S.btnSm(C.blue)}>📊</button></td></tr> })}</tbody></table></div>}
      </div>
      {detailStudent&&<div style={S.modal} onClick={()=>setDetailStudent(null)}><div style={{ ...S.card, width:520, maxHeight:'80vh', overflowY:'auto', margin:20 }} onClick={e=>e.stopPropagation()}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}><h3 style={{ color:C.t1, fontSize:18, fontWeight:700, margin:0 }}>📊 {detailStudent.name} ({detailStudent.student_id})</h3><button onClick={()=>setDetailStudent(null)} style={{ background:'none', border:'none', color:C.t2, fontSize:18, cursor:'pointer' }}>✕</button></div>{(()=>{ const sc=examHistory.filter(h=>h.student_id===detailStudent.student_id&&h.score!=null&&h.status==='제출완료').map(h=>h.score).reverse(); const hist=examHistory.filter(h=>h.student_id===detailStudent.student_id&&h.session_id); return <><p style={{ color:C.t2, fontSize:13, margin:'0 0 8px' }}>응시: <strong style={{ color:C.t1 }}>{sc.length}회</strong> | 평균: <strong style={{ color:(sc.reduce((a,b)=>a+b,0)/sc.length||0)>=60?C.green:C.red }}>{sc.length?(sc.reduce((a,b)=>a+b,0)/sc.length).toFixed(1):'-'}점</strong></p><MiniBarChart scores={sc} height={100} width={460} /><h4 style={{ color:C.t2, fontSize:13, fontWeight:700, margin:'16px 0 8px' }}>응시 이력</h4>{hist.length===0?<p style={{ color:C.t2, fontSize:13 }}>없음</p>:<table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>{['시험명','상태','점수','정답','제출시간'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{hist.map((h,i)=><tr key={i}><td style={S.td}>{h.exam_title||'-'}</td><td style={S.td}><span style={S.tag(statusColor(h.status))}>{h.status||'-'}</span></td><td style={{ ...S.td, fontWeight:700, color:h.score>=60?C.green:h.score!=null?C.red:C.t2 }}>{h.score!=null?`${h.score}점`:'-'}</td><td style={S.td}>{h.correct_count!=null?`${h.correct_count}/${h.total_questions}`:'-'}</td><td style={S.td}>{h.submitted_at?new Date(h.submitted_at).toLocaleString('ko-KR'):'-'}</td></tr>)}</tbody></table>}</> })()}</div></div>}
    </>}

    {/* 응시 현황 */}
    {tab==='students'&&<div style={S.card}><h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 12px' }}>현재 시험 ({students.length}명)</h3>{students.length===0?<p style={{ color:C.t2 }}>접속한 학생이 없습니다.</p>:<div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>{['학번','이름','상태','현재','정답','점수','시간'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{students.map(s=>{ const el=s.started_at?Math.floor(((s.submitted_at?new Date(s.submitted_at):new Date())-new Date(s.started_at))/1000):0; return <tr key={s.id}><td style={S.td}>{s.student_id}</td><td style={S.td}>{s.name}</td><td style={S.td}><span style={S.tag(statusColor(s.status))}>{s.status}</span></td><td style={S.td}>{s.total_questions>0?`${s.current_question}/${s.total_questions}`:'-'}</td><td style={S.td}>{s.correct_count||0}</td><td style={{ ...S.td, fontWeight:700, color:s.score>=60?C.green:s.score?C.red:C.t2 }}>{s.score!=null?`${s.score}점`:'-'}</td><td style={S.td}>{el>0?`${Math.floor(el/60)}분${el%60}초`:'-'}</td></tr> })}</tbody></table></div>}</div>}

    {/* 문제 관리 */}
    {tab==='questions'&&<><div style={{ ...S.card, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}><input ref={fileRef} type="file" accept=".json,.txt" onChange={handleQF} style={{ display:'none' }} /><button onClick={()=>fileRef.current?.click()} disabled={!exam} style={S.btn(C.purple)}>📄 업로드</button>{selQ.size>0&&<><button onClick={delSelQ} style={S.btnSm(C.red)}>🗑 삭제({selQ.size})</button><button onClick={()=>bulkInc(true)} style={S.btnSm(C.green)}>✅ 포함</button><button onClick={()=>bulkInc(false)} style={S.btnSm(C.yellow)}>⛔ 제외</button></>}<span style={{ color:C.t2, fontSize:11, marginLeft:'auto' }}>포함:{incC}/전체:{questions.length}</span></div>
      <div style={S.card}>{questions.length===0?<p style={{ color:C.t2 }}>문제를 업로드하세요.</p>:<div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr><th style={S.th}><input type="checkbox" checked={selQ.size===questions.length&&questions.length>0} onChange={togAllQ} style={S.cb} /></th><th style={S.th}>#</th><th style={S.th}>상태</th><th style={S.th}>유형</th><th style={S.th}>카테고리</th><th style={S.th}>문제</th><th style={S.th}></th></tr></thead><tbody>{questions.map((q,i)=>{ const inc=q.is_included!==false; return <tr key={q.id} style={{ opacity:inc?1:0.45, background:selQ.has(q.id)?'rgba(59,130,246,0.06)':'transparent' }}><td style={S.td}><input type="checkbox" checked={selQ.has(q.id)} onChange={()=>togQ(q.id)} style={S.cb} /></td><td style={S.td}>{i+1}</td><td style={S.td}><button onClick={()=>togInc(q.id,inc)} style={{ ...S.btnSm(inc?C.green:C.red), padding:'3px 8px', fontSize:11 }}>{inc?'포함':'제외'}</button></td><td style={S.td}><span style={S.tag(TYPE_C[q.type]||C.t2)}>{TYPE_L[q.type]||q.type}</span></td><td style={S.td}>{q.category}</td><td style={{ ...S.td, maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.question}</td><td style={S.td}><button onClick={()=>setEditQ({...q})} style={S.btnSm(C.blue)}>✏️</button></td></tr> })}</tbody></table></div>}</div>
      {editQ&&<div style={S.modal} onClick={()=>setEditQ(null)}><div style={{ ...S.card, width:560, maxHeight:'85vh', overflowY:'auto', margin:20 }} onClick={e=>e.stopPropagation()}><h3 style={{ color:C.t1, fontSize:17, fontWeight:700, margin:'0 0 16px' }}>✏️ 문제 수정</h3><div style={{ marginBottom:12 }}><label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>카테고리</label><input value={editQ.category} onChange={e=>setEditQ({...editQ,category:e.target.value})} style={S.input} /></div><div style={{ marginBottom:12 }}><label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>문제</label><textarea value={editQ.question} onChange={e=>setEditQ({...editQ,question:e.target.value})} rows={3} style={{ ...S.input, resize:'vertical' }} /></div>{editQ.type==='multiple_choice'&&<div style={{ marginBottom:12 }}><label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>보기</label>{(editQ.options||[]).map((o,i)=><div key={i} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'center' }}><span style={{ color:editQ.answer===i?C.green:C.t2, fontWeight:700, fontSize:12, width:20 }}>{i+1})</span><input value={o} onChange={e=>{ const ops=[...(editQ.options||[])]; ops[i]=e.target.value; setEditQ({...editQ,options:ops}) }} style={{ ...S.input, flex:1 }} /><input type="radio" name="mc" checked={editQ.answer===i} onChange={()=>setEditQ({...editQ,answer:i})} style={{ accentColor:C.green }} /></div>)}</div>}{editQ.type==='ox'&&<div style={{ marginBottom:12 }}><label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>정답</label><div style={{ display:'flex', gap:12 }}>{[{l:'O',v:true},{l:'X',v:false}].map(o=><label key={o.l} style={{ display:'flex', alignItems:'center', gap:6, color:C.t1, cursor:'pointer' }}><input type="radio" name="ox" checked={editQ.answer===o.v} onChange={()=>setEditQ({...editQ,answer:o.v})} style={{ accentColor:C.green }} /> {o.l}</label>)}</div></div>}{editQ.type==='short_answer'&&<div style={{ marginBottom:12 }}><label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>정답 (쉼표 구분)</label><input value={Array.isArray(editQ.answer)?editQ.answer.join(', '):editQ.answer} onChange={e=>setEditQ({...editQ,answer:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} style={S.input} /></div>}{editQ.type==='matching'&&<div style={{ marginBottom:12 }}><label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>매칭 쌍</label>{(editQ.pairs||[]).map((p,i)=><div key={i} style={{ display:'flex', gap:8, marginBottom:6 }}><input value={p.left||''} onChange={e=>{ const pp=[...(editQ.pairs||[])]; pp[i]={...pp[i],left:e.target.value}; setEditQ({...editQ,pairs:pp}) }} placeholder="왼쪽" style={{ ...S.input, flex:1 }} /><span style={{ color:C.blue, fontWeight:700, alignSelf:'center' }}>=</span><input value={p.right||''} onChange={e=>{ const pp=[...(editQ.pairs||[])]; pp[i]={...pp[i],right:e.target.value}; setEditQ({...editQ,pairs:pp}) }} placeholder="오른쪽" style={{ ...S.input, flex:1 }} /></div>)}</div>}<div style={{ marginBottom:16 }}><label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>해설</label><textarea value={editQ.explanation} onChange={e=>setEditQ({...editQ,explanation:e.target.value})} rows={2} style={{ ...S.input, resize:'vertical' }} /></div><div style={{ display:'flex', gap:8 }}><button onClick={saveEQ} style={S.btn(C.green)}>💾 저장</button><button onClick={()=>setEditQ(null)} style={S.btnSec}>취소</button></div></div></div>}
    </>}

    {/* 문제 분석 */}
    {tab==='analytics'&&<div style={S.card}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}><h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:0 }}>문제별 분석</h3><button onClick={loadAnalytics} style={S.btnSm(C.blue)}>🔄 새로고침</button></div>{analytics.length===0?<p style={{ color:C.t2 }}>데이터가 없습니다.</p>:<div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>{['#','상태','유형','카테고리','문제','응시','정답률','평균(초)','난이도'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{analytics.map(a=><tr key={a.question_id} style={{ opacity:a.is_included!==false?1:0.4 }}><td style={S.td}>{a.sort_order}</td><td style={S.td}><span style={S.tag(a.is_included!==false?C.green:C.red)}>{a.is_included!==false?'포함':'제외'}</span></td><td style={S.td}><span style={S.tag(TYPE_C[a.type]||C.t2)}>{TYPE_L[a.type]}</span></td><td style={S.td}>{a.category}</td><td style={{ ...S.td, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.question}</td><td style={S.td}>{a.attempt_count}</td><td style={{ ...S.td, fontWeight:700, color:a.correct_rate>=60?C.green:a.correct_rate>0?C.red:C.t2 }}>{a.correct_rate}%</td><td style={S.td}>{a.avg_time_sec}초</td><td style={S.td}><span style={S.tag(a.difficulty==='어려움'?C.red:a.difficulty==='보통'?C.yellow:a.difficulty==='쉬움'?C.green:C.t2)}>{a.difficulty}</span></td></tr>)}</tbody></table></div>}</div>}
    {tab==='log'&&<div style={{ ...S.card, maxHeight:500, overflowY:'auto' }}>{log.length===0?<p style={{ color:C.t2 }}>로그가 없습니다.</p>:log.map((l,i)=><div key={i} style={{ fontSize:12, color:C.t2, padding:'3px 0', borderBottom:'1px solid rgba(148,163,184,0.05)', fontFamily:'monospace' }}>{l}</div>)}</div>}
  </div></div>
}

/* ═══════════════════ STUDENT LOGIN ════════════════════ */
function StudentLogin({ onLogin, onBack }) {
  const [sid, setSid] = useState(''), [name, setName] = useState(''), [save, setSave] = useState(false), [err, setErr] = useState(''), [ld, setLd] = useState(false)
  useEffect(() => { try { const s = localStorage.getItem('cbt_student'); if (s) { const d = JSON.parse(s); setSid(d.sid||''); setName(d.name||''); setSave(true) } } catch(e) {} }, [])
  const login = async () => {
    if (!sid.trim()||!name.trim()) { setErr('학번과 이름을 모두 입력해주세요.'); return }
    setLd(true); setErr('')
    const { data: rm } = await supabase.from('roster').select('*').eq('student_id', sid.trim()).single()
    if (!rm) { setErr('등록되지 않은 학번입니다.'); setLd(false); return }
    if (rm.name!==name.trim()) { setErr('학번과 이름이 일치하지 않습니다.'); setLd(false); return }
    if (save) localStorage.setItem('cbt_student', JSON.stringify({ sid:sid.trim(), name:name.trim() })); else localStorage.removeItem('cbt_student')
    onLogin({ studentId: sid.trim(), studentName: name.trim() })
  }
  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ ...S.card, width:400, textAlign:'center' }}>
    <div style={{ fontSize:36, marginBottom:8 }}>🎓</div><h2 style={{ color:C.t1, marginBottom:4, fontSize:22 }}>CBT 시험 접속</h2><p style={{ color:C.t2, marginBottom:24, fontSize:13 }}>등록된 학번과 이름을 입력하세요</p>
    <div style={{ textAlign:'left', marginBottom:12 }}><label style={{ fontSize:12, color:C.t2, marginBottom:4, display:'block' }}>학번</label><input value={sid} onChange={e=>setSid(e.target.value)} placeholder="20241234" style={S.input} /></div>
    <div style={{ textAlign:'left', marginBottom:12 }}><label style={{ fontSize:12, color:C.t2, marginBottom:4, display:'block' }}>이름</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="홍길동" onKeyDown={e=>e.key==='Enter'&&login()} style={S.input} /></div>
    <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, cursor:'pointer' }}><input type="checkbox" checked={save} onChange={e=>setSave(e.target.checked)} style={S.cb} /><span style={{ fontSize:13, color:C.t2 }}>학번과 이름 저장</span></label>
    {err&&<p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</p>}
    <button onClick={login} disabled={ld} style={{ ...S.btn(), width:'100%', justifyContent:'center' }}>{ld?'접속 중...':'접속하기'}</button>
    <button onClick={onBack} style={{ ...S.btnSec, width:'100%', justifyContent:'center', marginTop:8 }}>뒤로</button>
  </div></div>
}

/* ═══════════════════ STUDENT LOBBY ════════════════════ */
function StudentLobby({ studentId, studentName, onStartExam, onBack }) {
  const [exam, setExam] = useState(null), [examReady, setExamReady] = useState(false), [qCount, setQCount] = useState(0)
  const [pastResults, setPastResults] = useState([]), [wrongQuestions, setWrongQuestions] = useState([]), [lobbyTab, setLobbyTab] = useState('info'), [loading, setLoading] = useState(true)

  useEffect(() => { loadData(); const iv = setInterval(pollExam, 3000); return () => clearInterval(iv) }, [])
  const loadData = async () => { setLoading(true); await pollExam(); await loadPast(); await loadWrong(); setLoading(false) }

  const pollExam = async () => {
    const { data } = await supabase.from('exams').select('*').eq('is_active', true).order('created_at', { ascending:false }).limit(1)
    if (data?.length) { setExam(data[0]); setExamReady(true); const { data:qs } = await supabase.from('questions').select('id', { count:'exact' }).eq('exam_id', data[0].id).eq('is_included', true); setQCount(qs?.length||0) }
    else { const { data:r } = await supabase.from('exams').select('*').order('created_at', { ascending:false }).limit(1); if (r?.length) { setExam(r[0]); setExamReady(false); const { data:qs } = await supabase.from('questions').select('id', { count:'exact' }).eq('exam_id', r[0].id).eq('is_included', true); setQCount(qs?.length||0) } else { setExam(null); setExamReady(false) } }
  }
  const loadPast = async () => { const { data } = await supabase.from('students').select('*, exams(title)').eq('student_id', studentId).order('created_at', { ascending:false }); setPastResults(data||[]) }
  const loadWrong = async () => {
    const { data: sess } = await supabase.from('students').select('id').eq('student_id', studentId).eq('status', '제출완료')
    if (!sess?.length) { setWrongQuestions([]); return }
    const { data: wa } = await supabase.from('answers').select('question_id, is_correct, questions(question, type, category, explanation)').in('student_id', sess.map(s=>s.id))
    if (!wa?.length) { setWrongQuestions([]); return }
    const qm = {}; wa.forEach(a => { const id=a.question_id; if (!qm[id]) qm[id]={...a.questions,question_id:id,wrongCount:0,totalCount:0}; qm[id].totalCount++; if (!a.is_correct) qm[id].wrongCount++ })
    setWrongQuestions(Object.values(qm).filter(q=>q.wrongCount>0).sort((a,b)=>b.wrongCount-a.wrongCount))
  }

  const handleStart = async () => {
    if (!exam) return
    const { data:student, error } = await supabase.from('students').upsert({ student_id:studentId, name:studentName, exam_id:exam.id, status:'응시중', started_at:new Date().toISOString(), total_questions:qCount, current_question:1 }, { onConflict:'student_id,exam_id' }).select().single()
    if (error) { alert('시험 시작 오류: '+error.message); return }
    onStartExam({ student, exam })
  }

  const pastScores = pastResults.filter(r=>r.score!=null&&r.status==='제출완료').map(r=>r.score).reverse()
  const tabS = (k) => ({ padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer', background:lobbyTab===k?'rgba(59,130,246,0.15)':'transparent', color:lobbyTab===k?C.blue:C.t2, border:'none', borderBottom:lobbyTab===k?`2px solid ${C.blue}`:'2px solid transparent' })

  if (loading) return <div style={S.page}><p style={{ color:C.t2, textAlign:'center', marginTop:60 }}>불러오는 중...</p></div>

  return <div style={S.page}><div style={{ ...S.container, maxWidth:700 }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}><div style={{ width:44, height:44, borderRadius:12, background:'rgba(59,130,246,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🎓</div><div><h2 style={{ color:C.t1, fontSize:18, fontWeight:700, margin:0 }}>{studentName}</h2><p style={{ color:C.t2, fontSize:12, margin:0 }}>학번: {studentId}</p></div></div>
      <button onClick={onBack} style={S.btnSec}>← 로그아웃</button>
    </div>

    <div style={{ ...S.card, textAlign:'center', padding:32, border:examReady?'1px solid rgba(16,185,129,0.2)':'1px solid rgba(148,163,184,0.1)' }}>
      {exam?<><h3 style={{ color:C.t1, fontSize:20, fontWeight:700, margin:'0 0 8px' }}>{exam.title}</h3><div style={{ display:'flex', justifyContent:'center', gap:24, marginBottom:20 }}><div><span style={{ color:C.t2, fontSize:12 }}>문항 수</span><p style={{ color:C.t1, fontSize:22, fontWeight:800, margin:'4px 0 0' }}>{qCount}문제</p></div><div><span style={{ color:C.t2, fontSize:12 }}>제한 시간</span><p style={{ color:C.t1, fontSize:22, fontWeight:800, margin:'4px 0 0' }}>{exam.time_limit_min}분</p></div></div>
        {examReady?<button onClick={handleStart} style={{ ...S.btn(C.green), padding:'16px 48px', fontSize:18, borderRadius:14, boxShadow:'0 4px 20px rgba(16,185,129,0.3)' }}>▶ 시험 응시 시작</button>:<div><div style={{ fontSize:36, marginBottom:8 }}>⏳</div><p style={{ color:C.yellow, fontSize:15, fontWeight:600, margin:'0 0 4px' }}>시험 대기 중</p><p style={{ color:C.t2, fontSize:13, margin:0 }}>관리자가 시험을 시작하면 버튼이 활성화됩니다</p></div>}
      </>:<p style={{ color:C.t2 }}>현재 등록된 시험이 없습니다.</p>}
    </div>

    <div style={{ display:'flex', borderBottom:'1px solid rgba(148,163,184,0.1)', marginBottom:14 }}><button onClick={()=>setLobbyTab('info')} style={tabS('info')}>📊 나의 성적</button><button onClick={()=>setLobbyTab('wrong')} style={tabS('wrong')}>❌ 자주 틀리는 문제</button></div>

    {lobbyTab==='info'&&<>{pastScores.length>0&&<div style={S.card}><h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 12px' }}>점수 추이</h3><MiniBarChart scores={pastScores} height={100} width={Math.min(600,Math.max(200,pastScores.length*50+30))} /><p style={{ color:C.t2, fontSize:12, marginTop:8 }}>평균: <strong style={{ color:C.t1 }}>{(pastScores.reduce((a,b)=>a+b,0)/pastScores.length).toFixed(1)}점</strong> | 최고: <strong style={{ color:C.green }}>{Math.max(...pastScores)}점</strong> | 최저: <strong style={{ color:C.red }}>{Math.min(...pastScores)}점</strong></p></div>}
      <div style={S.card}><h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 12px' }}>응시 이력 ({pastResults.length}회)</h3>{pastResults.length===0?<p style={{ color:C.t2, fontSize:13 }}>아직 응시 이력이 없습니다.</p>:<div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>{['시험명','상태','점수','정답','합격','제출시간'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{pastResults.map((r,i)=><tr key={i}><td style={S.td}>{r.exams?.title||'시험'}</td><td style={S.td}><span style={S.tag(statusColor(r.status))}>{r.status}</span></td><td style={{ ...S.td, fontWeight:700, color:r.score>=60?C.green:r.score!=null?C.red:C.t2 }}>{r.score!=null?`${r.score}점`:'-'}</td><td style={S.td}>{r.correct_count!=null?`${r.correct_count}/${r.total_questions}`:'-'}</td><td style={S.td}>{r.score!=null?<span style={S.tag(r.score>=60?C.green:C.red)}>{r.score>=60?'합격':'불합격'}</span>:'-'}</td><td style={S.td}>{r.submitted_at?new Date(r.submitted_at).toLocaleString('ko-KR'):'-'}</td></tr>)}</tbody></table></div>}</div></>}

    {lobbyTab==='wrong'&&<div style={S.card}><h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 4px' }}>자주 틀리는 문제</h3><p style={{ color:C.t2, fontSize:12, margin:'0 0 16px' }}>제출 완료된 시험에서 오답이 많은 순서로 표시됩니다.</p>
      {wrongQuestions.length===0?<p style={{ color:C.t2, fontSize:13 }}>오답 기록이 없습니다.</p>:wrongQuestions.map((wq,i)=>{ const wr=Math.round(wq.wrongCount/wq.totalCount*100); return <div key={wq.question_id} style={{ padding:14, borderRadius:12, marginBottom:10, background:wr>=80?'rgba(239,68,68,0.06)':wr>=50?'rgba(245,158,11,0.06)':'rgba(148,163,184,0.04)', border:`1px solid ${wr>=80?'rgba(239,68,68,0.15)':wr>=50?'rgba(245,158,11,0.12)':'rgba(148,163,184,0.08)'}` }}><div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}><span style={{ fontSize:14, fontWeight:800, color:wr>=80?C.red:wr>=50?C.yellow:C.t2 }}>#{i+1}</span><span style={S.tag(TYPE_C[wq.type]||C.t2)}>{TYPE_L[wq.type]||wq.type}</span><span style={S.tag(C.t2)}>{wq.category}</span><span style={{ marginLeft:'auto', fontSize:12, fontWeight:700, color:wr>=80?C.red:wr>=50?C.yellow:C.t2 }}>오답 {wq.wrongCount}/{wq.totalCount}회 ({wr}%)</span></div><div style={{ height:4, background:'rgba(148,163,184,0.1)', borderRadius:2, marginBottom:10 }}><div style={{ height:'100%', width:`${wr}%`, background:wr>=80?C.red:wr>=50?C.yellow:C.t2, borderRadius:2 }} /></div><p style={{ color:C.t1, fontSize:14, fontWeight:600, lineHeight:1.6, margin:'0 0 6px' }}>{wq.question}</p>{wq.explanation&&<p style={{ color:C.t2, fontSize:12, lineHeight:1.6, margin:0 }}>💡 {wq.explanation}</p>}</div> })}
    </div>}
  </div></div>
}

/* ═══════════════════ STUDENT EXAM (with sessionStorage) ═══ */
function StudentExam({ student: initStudent, exam: initExam, onFinish, onAbandon }) {
  const [student] = useState(initStudent), [exam] = useState(initExam)
  const [questions, setQuestions] = useState([])
  const [ci, setCi] = useState(0)
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [showNav, setShowNav] = useState(false)
  const [ready, setReady] = useState(false)
  const qStartRef = useRef(Date.now()), timeSpent = useRef({}), timerRef = useRef(null), submittedRef = useRef(false)
  const ssKey = `cbt_exam_${student.id}`

  // 시험 초기화 (셔플 + sessionStorage 복원)
  useEffect(() => { initExamState() }, [])

  const initExamState = async () => {
    // 1. DB에서 문제 로드
    const { data: rawQ } = await supabase.from('questions').select('*').eq('exam_id', exam.id).eq('is_included', true).order('sort_order')
    if (!rawQ?.length) return

    // 2. 셔플 적용
    const shuffled = applyShuffles(rawQ, exam, student.student_id)

    // 3. sessionStorage에서 기존 상태 복원 시도
    const saved = SS.load(ssKey)
    if (saved && saved.examId === exam.id && saved.studentId === student.id) {
      // 복원: 셔플 순서는 seed 기반이므로 동일하게 재현됨
      setQuestions(shuffled)
      setAnswers(saved.answers || {})
      setCi(saved.ci || 0)
      timeSpent.current = saved.timeSpent || {}
      // 남은 시간 재계산
      const elapsed = Math.floor((Date.now() - saved.examStartedAt) / 1000)
      const remaining = Math.max(0, exam.time_limit_min * 60 - elapsed)
      setTimeLeft(remaining)
      if (remaining <= 0) { submitExamWith(shuffled, saved.answers || {}); return }
    } else {
      // 새로 시작
      setQuestions(shuffled)
      setTimeLeft(exam.time_limit_min * 60)
      saveExamState(shuffled, {}, 0, Date.now())
      await supabase.from('students').update({ total_questions: shuffled.length, current_question: 1 }).eq('id', student.id)
    }
    setReady(true)
    qStartRef.current = Date.now()
  }

  // sessionStorage에 상태 저장
  const saveExamState = (qs, ans, idx, startedAt) => {
    SS.save(ssKey, { examId: exam.id, studentId: student.id, answers: ans, ci: idx, timeSpent: timeSpent.current, examStartedAt: startedAt || SS.load(ssKey)?.examStartedAt || Date.now() })
  }

  // 타이머
  useEffect(() => {
    if (!ready || submitted) return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); submitExamWith(questions, answers); return 0 } return t - 1 })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [ready, submitted])

  // 5초마다 sessionStorage 백업
  useEffect(() => {
    if (!ready || submitted) return
    const iv = setInterval(() => { recordTime(); saveExamState(questions, answers, ci) }, 5000)
    return () => clearInterval(iv)
  }, [ready, submitted, ci, answers])

  // beforeunload: 새로고침 시 상태 저장 (응시종료 안 함)
  useEffect(() => {
    const onBeforeUnload = () => { if (!submittedRef.current) { recordTime(); saveExamState(questions, answers, ci) } }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [answers, ci])

  const recordTime = () => { if (!questions[ci]) return; const qid = questions[ci].id; timeSpent.current[qid] = (timeSpent.current[qid]||0) + Date.now() - qStartRef.current; qStartRef.current = Date.now() }

  const navigateTo = async (idx) => {
    if (idx < 0 || idx >= questions.length || submitted) return
    recordTime(); setCi(idx); qStartRef.current = Date.now()
    saveExamState(questions, answers, idx)
    await supabase.from('students').update({ current_question: idx + 1 }).eq('id', student.id)
  }

  const handleAnswer = (qid, val) => {
    const next = { ...answers, [qid]: val }
    setAnswers(next)
    saveExamState(questions, next, ci)
  }

  const submitExamWith = async (qs, ans) => {
    if (submittedRef.current) return; submittedRef.current = true; setSubmitted(true); clearInterval(timerRef.current); recordTime()
    let cc = 0; const qList = qs || questions; const ansList = ans || answers
    for (const q of qList) { const ua = ansList[q.id]; const c = checkAnswer(q, ua); if (c) cc++; await supabase.from('answers').upsert({ student_id:student.id, question_id:q.id, exam_id:exam.id, user_answer:ua??null, is_correct:c, time_spent_ms:timeSpent.current[q.id]||0 }, { onConflict:'student_id,question_id' }) }
    const score = Math.round(cc / qList.length * 1000) / 10
    await supabase.from('students').update({ status:'제출완료', submitted_at:new Date().toISOString(), score, correct_count:cc, total_questions:qList.length }).eq('id', student.id)
    SS.remove(ssKey)
    onFinish({ questions: qList, answers: ansList, timeSpent: timeSpent.current, score, correctCount: cc })
  }

  const handleAbandon = async () => {
    submittedRef.current = true
    clearInterval(timerRef.current)
    await supabase.from('students').update({ status:'응시종료', submitted_at:new Date().toISOString() }).eq('id', student.id)
    SS.remove(ssKey)
    onAbandon()
  }

  if (!ready) return <div style={S.page}><p style={{ color:C.t2, textAlign:'center', marginTop:40 }}>문제를 불러오는 중...</p></div>
  const q = questions[ci], progress = (ci+1)/questions.length*100, min = Math.floor(timeLeft/60), sec = timeLeft%60, ac = Object.keys(answers).filter(k=>answers[k]!=null).length

  return <div style={S.page}><div style={S.container}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
      <div><h2 style={{ color:C.t1, fontSize:17, fontWeight:700, margin:0 }}>{exam.title}</h2><p style={{ color:C.t2, fontSize:12, margin:'3px 0 0' }}>{ci+1}/{questions.length} · {ac}개 작성 · {student.name}</p></div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontWeight:700, fontSize:17, fontVariantNumeric:'tabular-nums', color:timeLeft<60?C.red:timeLeft<120?C.yellow:C.blue }}>⏱ {String(min).padStart(2,'0')}:{String(sec).padStart(2,'0')}</div>
        <button onClick={()=>setShowNav(!showNav)} style={S.btnSec}>☰</button>
        <button onClick={() => { if(confirm('시험을 종료하시겠습니까?\n제출하지 않고 나가면 응시종료 처리됩니다.')) handleAbandon() }} style={S.btnSm(C.red)}>✕ 나가기</button>
      </div>
    </div>
    <div style={{ width:'100%', height:4, background:'rgba(148,163,184,0.1)', borderRadius:2, marginBottom:14, overflow:'hidden' }}><div style={{ height:'100%', width:`${progress}%`, background:C.blue, borderRadius:2, transition:'width 0.3s' }} /></div>
    {showNav&&<div style={{ ...S.card, padding:14 }}><div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>{questions.map((qq,i)=><button key={i} onClick={()=>navigateTo(i)} style={{ width:32, height:32, borderRadius:7, border:'none', cursor:'pointer', fontWeight:700, fontSize:12, background:i===ci?C.blue:answers[qq.id]!=null?'rgba(16,185,129,0.15)':'rgba(148,163,184,0.1)', color:i===ci?'#fff':answers[qq.id]!=null?C.green:C.t2 }}>{i+1}</button>)}</div></div>}
    <div style={S.card}>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}><span style={S.tag(TYPE_C[q.type])}>{TYPE_L[q.type]}</span><span style={S.tag(C.t2)}>{q.category}</span></div>
      <h3 style={{ color:C.t1, fontSize:16, fontWeight:600, lineHeight:1.65, margin:'0 0 18px' }}><span style={{ color:C.blue }}>Q{ci+1}.</span> {q.question}</h3>
      {q.type==='multiple_choice'&&<MCQ q={q} value={answers[q.id]} onChange={v=>handleAnswer(q.id,v)} />}
      {q.type==='ox'&&<OXQ q={q} value={answers[q.id]} onChange={v=>handleAnswer(q.id,v)} />}
      {q.type==='short_answer'&&<SAQ q={q} value={answers[q.id]} onChange={v=>handleAnswer(q.id,v)} />}
      {q.type==='matching'&&<MatchQ q={q} value={answers[q.id]} onChange={v=>handleAnswer(q.id,v)} />}
    </div>
    <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, flexWrap:'wrap', gap:8 }}>
      <button onClick={()=>navigateTo(ci-1)} disabled={ci===0} style={{ ...S.btnSec, opacity:ci===0?0.4:1 }}>◀ 이전</button>
      {ci<questions.length-1?<button onClick={()=>navigateTo(ci+1)} style={S.btn()}>다음 ▶</button>:<button onClick={()=>{ if(confirm(`제출하시겠습니까?\n작성: ${ac}/${questions.length}`)) submitExamWith() }} style={S.btn(C.green)}>✔ 제출</button>}
    </div>
  </div></div>
}

/* ─── Question Components ─── */
function MCQ({ q, value, onChange }) { const lb=['A','B','C','D']; return <div style={{ display:'flex', flexDirection:'column', gap:8 }}>{(q.options||[]).map((o,i)=>{ const s=value===i; return <button key={i} onClick={()=>onChange(i)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, background:s?'rgba(59,130,246,0.12)':'rgba(148,163,184,0.05)', border:s?'1px solid rgba(59,130,246,0.4)':'1px solid rgba(148,163,184,0.1)', color:C.t1, fontSize:14, cursor:'pointer', textAlign:'left' }}><span style={{ width:28, height:28, borderRadius:6, background:s?'rgba(59,130,246,0.25)':'rgba(148,163,184,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, color:s?C.blue:C.t2, flexShrink:0 }}>{lb[i]}</span>{o}</button> })}</div> }
function OXQ({ q, value, onChange }) { return <div style={{ display:'flex', gap:14, justifyContent:'center', padding:'8px 0' }}>{[{l:'O',v:true,c:C.blue},{l:'X',v:false,c:C.red}].map(o=>{ const s=value===o.v; return <button key={o.l} onClick={()=>onChange(o.v)} style={{ width:100, height:100, borderRadius:16, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, background:s?`${o.c}18`:'rgba(148,163,184,0.05)', border:`2px solid ${s?o.c:'rgba(148,163,184,0.15)'}`, fontSize:36, fontWeight:800, color:s?o.c:C.t2 }}>{o.l}<span style={{ fontSize:10, fontWeight:500, opacity:0.7 }}>{o.v?'맞다':'틀리다'}</span></button> })}</div> }
function SAQ({ q, value, onChange }) { return <input type="text" value={value||''} onChange={e=>onChange(e.target.value)} placeholder="정답을 입력하세요..." style={{ ...S.input, fontSize:15, padding:'13px 16px' }} /> }
function MatchQ({ q, value, onChange }) { const pairs=q.pairs||[]; const ri=useMemo(()=>pairs.map((p,i)=>({text:typeof p==='object'?(p.right||p[1]||''):'',origIdx:i})).sort(()=>Math.random()-0.5),[q.id]); const cur=value||{}; const opts=['-- 선택 --',...ri.map(r=>r.text)]; return <div><p style={{ fontSize:12, color:C.t2, marginBottom:10 }}>왼쪽에 맞는 오른쪽 항목을 선택하세요.</p>{pairs.map((p,i)=><div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, flexWrap:'wrap' }}><span style={{ fontSize:13, fontWeight:600, color:C.t1, minWidth:140 }}>{i+1}. {typeof p==='object'?(p.left||p[0]||''):''}</span><span style={{ color:C.blue, fontWeight:700 }}>→</span><select value={cur[i]!=null?ri.findIndex(r=>r.origIdx===cur[i])+1:0} onChange={e=>{const si=+e.target.value-1;const n={...cur};if(si>=0)n[i]=ri[si].origIdx;else delete n[i];onChange(n)}} style={{ ...S.input, width:'auto', minWidth:180 }}>{opts.map((o,j)=><option key={j} value={j}>{o}</option>)}</select></div>)}</div> }

/* ═══════════════════ STUDENT RESULT ═══════════════════ */
function StudentResult({ data, onHome }) {
  const { questions, answers, score, correctCount } = data; const passed=score>=60, mc=passed?C.green:C.red
  const byType={}, byCat={}; questions.forEach(q=>{ const c=checkAnswer(q,answers[q.id]); const t=q.type,k=q.category; if(!byType[t])byType[t]=[0,0]; byType[t][1]++; if(c)byType[t][0]++; if(!byCat[k])byCat[k]=[0,0]; byCat[k][1]++; if(c)byCat[k][0]++ })
  const wrongQs=questions.filter(q=>!checkAnswer(q,answers[q.id]))
  return <div style={S.page}><div style={S.container}>
    <div style={{ ...S.card, textAlign:'center', border:`2px solid ${mc}33`, padding:32 }}><div style={{ width:100, height:100, borderRadius:'50%', margin:'0 auto 14px', background:`${mc}15`, border:`3px solid ${mc}44`, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}><span style={{ fontSize:32, fontWeight:800, color:mc }}>{score}</span><span style={{ fontSize:12, color:C.t2 }}>점</span></div><h2 style={{ color:mc, fontSize:22, fontWeight:800, margin:'0 0 6px' }}>{passed?'합격':'불합격'}</h2><p style={{ color:C.t2, fontSize:14 }}>총 {questions.length}문항 중 {correctCount}문항 정답 (합격기준 60점)</p></div>
    <div style={S.card}><h3 style={{ color:C.t1, fontSize:14, fontWeight:700, margin:'0 0 12px' }}>유형별 성적</h3>{Object.entries(byType).map(([t,[c,total]])=>{ const p=Math.round(c/total*100); return <div key={t} style={{ marginBottom:10 }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={S.tag(TYPE_C[t])}>{TYPE_L[t]}</span><span style={{ fontSize:13, fontWeight:700, color:p>=60?C.green:C.red }}>{c}/{total} ({p}%)</span></div><div style={{ height:4, background:'rgba(148,163,184,0.1)', borderRadius:2 }}><div style={{ height:'100%', width:`${p}%`, background:p>=60?C.green:C.red, borderRadius:2 }} /></div></div> })}</div>
    <div style={S.card}><h3 style={{ color:C.t1, fontSize:14, fontWeight:700, margin:'0 0 12px' }}>카테고리별 성적</h3>{Object.entries(byCat).map(([cat,[c,total]])=>{ const p=Math.round(c/total*100); return <div key={cat} style={{ marginBottom:10 }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={{ fontSize:13, color:C.t1 }}>{cat}</span><span style={{ fontSize:13, fontWeight:700, color:p>=60?C.green:C.red }}>{c}/{total} ({p}%)</span></div><div style={{ height:4, background:'rgba(148,163,184,0.1)', borderRadius:2 }}><div style={{ height:'100%', width:`${p}%`, background:p>=60?C.green:C.red, borderRadius:2 }} /></div></div> })}</div>
    {wrongQs.length>0&&<div style={S.card}><h3 style={{ color:C.t1, fontSize:14, fontWeight:700, margin:'0 0 12px' }}>오답 노트 ({wrongQs.length}문항)</h3>{wrongQs.map(q=><div key={q.id} style={{ padding:12, borderRadius:10, marginBottom:8, background:'rgba(239,68,68,0.04)', border:'1px solid rgba(239,68,68,0.1)' }}><div style={{ display:'flex', gap:6, marginBottom:5 }}><span style={S.tag(TYPE_C[q.type])}>{TYPE_L[q.type]}</span><span style={{ fontSize:11, color:C.t2 }}>{q.category}</span></div><p style={{ color:C.t1, fontSize:13, fontWeight:600, lineHeight:1.6, margin:'0 0 5px' }}>{q.question}</p>{q.explanation&&<p style={{ color:C.t2, fontSize:12, lineHeight:1.6, margin:0 }}>💡 {q.explanation}</p>}</div>)}</div>}
    <div style={{ textAlign:'center', marginTop:8 }}><button onClick={onHome} style={S.btn()}>처음으로</button></div>
  </div></div>
}

/* ═══════════════════ ANSWER CHECK ═════════════════════ */
function checkAnswer(q, ua) {
  if (ua==null||ua==='') return false
  switch(q.type) {
    case 'multiple_choice': return ua===(typeof q.answer==='number'?q.answer:parseInt(q.answer,10))
    case 'ox': return ua===(typeof q.answer==='boolean'?q.answer:q.answer===true||q.answer==='true')
    case 'short_answer': { const aa=Array.isArray(q.answer)?q.answer:[String(q.answer)]; return aa.some(a=>String(a).trim().toLowerCase()===String(ua).trim().toLowerCase()) }
    case 'matching': { if (typeof ua!=='object') return false; return (q.pairs||[]).every((_,i)=>ua[i]===i) }
    default: return false
  }
}

/* ═══════════════════ MAIN APP (with sessionStorage) ═══ */
export default function App() {
  const [screen, setScreen] = useState('role')
  const [loginData, setLoginData] = useState(null)
  const [examData, setExamData] = useState(null)
  const [resultData, setResultData] = useState(null)
  const [restored, setRestored] = useState(false)

  // 마운트 시 sessionStorage 복원
  useEffect(() => {
    const saved = SS.load('cbt_app_state')
    if (saved) {
      if (saved.loginData) setLoginData(saved.loginData)
      if (saved.examData) setExamData(saved.examData)
      if (saved.screen && saved.screen !== 'role') {
        // 시험 결과 화면은 복원 안 함 (데이터 없으므로)
        if (saved.screen === 'studentResult') setScreen('studentLobby')
        else setScreen(saved.screen)
      }
    }
    setRestored(true)
  }, [])

  // 화면 전환 시 sessionStorage 업데이트
  useEffect(() => {
    if (!restored) return
    if (screen === 'role') { SS.remove('cbt_app_state'); return }
    SS.save('cbt_app_state', { screen, loginData, examData })
  }, [screen, loginData, examData, restored])

  const goRole = () => { SS.remove('cbt_app_state'); setScreen('role') }

  if (!restored) return null

  switch (screen) {
    case 'role': return <RoleSelect onRole={r => setScreen(r==='admin'?'adminLogin':'studentLogin')} />
    case 'adminLogin': return <AdminLogin onLogin={() => setScreen('admin')} onBack={goRole} />
    case 'admin': return <AdminDashboard onBack={goRole} />
    case 'studentLogin': return <StudentLogin onLogin={d => { setLoginData(d); setScreen('studentLobby') }} onBack={goRole} />
    case 'studentLobby': return <StudentLobby studentId={loginData.studentId} studentName={loginData.studentName} onStartExam={d => { setExamData(d); setScreen('studentExam') }} onBack={goRole} />
    case 'studentExam': return <StudentExam student={examData.student} exam={examData.exam} onFinish={d => { setResultData(d); setScreen('studentResult') }} onAbandon={() => setScreen('studentLobby')} />
    case 'studentResult': return <StudentResult data={resultData} onHome={() => setScreen('studentLobby')} />
    default: return <RoleSelect onRole={r => setScreen(r==='admin'?'adminLogin':'studentLogin')} />
  }
}
