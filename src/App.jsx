import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from './supabase'

/* ═══════════════════ TXT PARSER ═══════════════════════ */
function parseTXT(text) {
  const typeMap = { '객관식':'multiple_choice','4지선다':'multiple_choice','OX':'ox','ox':'ox','O/X':'ox','진위형':'ox','단답형':'short_answer','주관식':'short_answer','선잇기':'matching','매칭':'matching','연결':'matching' }
  return text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map((block, idx) => {
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
  container: { maxWidth:900, margin:'0 auto' },
  card: { background:C.card, borderRadius:16, padding:24, marginBottom:16, border:'1px solid rgba(148,163,184,0.1)' },
  btn: (color=C.blue) => ({ background:color, color:'#fff', border:'none', borderRadius:10, padding:'12px 24px', fontSize:15, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }),
  btnSec: { background:'rgba(148,163,184,0.1)', color:C.t2, border:'1px solid rgba(148,163,184,0.2)', borderRadius:10, padding:'12px 24px', fontSize:15, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 },
  input: { width:'100%', padding:'12px 16px', fontSize:15, background:C.input, border:'1px solid rgba(148,163,184,0.2)', borderRadius:10, color:C.t1, outline:'none', boxSizing:'border-box' },
  tag: (c) => ({ display:'inline-block', background:`${c}22`, color:c, borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:600 }),
  th: { padding:'10px 12px', textAlign:'left', fontSize:12, fontWeight:700, color:C.t2, borderBottom:'1px solid rgba(148,163,184,0.1)' },
  td: { padding:'8px 12px', fontSize:13, color:C.t1, borderBottom:'1px solid rgba(148,163,184,0.05)' },
}
const TYPE_L = { multiple_choice:'4지선다', ox:'O/X', short_answer:'단답형', matching:'선잇기' }
const TYPE_C = { multiple_choice:C.blue, ox:C.purple, short_answer:C.yellow, matching:C.green }

/* ═══════════════════ ROLE SELECT ══════════════════════ */
function RoleSelect({ onRole }) {
  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>📝</div>
      <h1 style={{ color:C.t1, fontSize:28, fontWeight:800, marginBottom:8 }}>일학습병행 CBT</h1>
      <p style={{ color:C.t2, marginBottom:32 }}>지필고사 연습 프로그램</p>
      <div style={{ display:'flex', gap:16, justifyContent:'center' }}>
        <button onClick={() => onRole('admin')} style={{ ...S.btn(C.purple), padding:'20px 40px', fontSize:17 }}>🔧 관리자</button>
        <button onClick={() => onRole('student')} style={{ ...S.btn(C.blue), padding:'20px 40px', fontSize:17 }}>🎓 학생</button>
      </div>
    </div>
  </div>
}

/* ═══════════════════ ADMIN LOGIN ══════════════════════ */
function AdminLogin({ onLogin, onBack }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    setLoading(true); setErr('')
    const { data } = await supabase.from('admin_config').select('value').eq('key','admin_password').single()
    if (data && data.value === pw) onLogin()
    else { setErr('비밀번호가 틀렸습니다.'); setLoading(false) }
  }

  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ ...S.card, width:380, textAlign:'center' }}>
      <h2 style={{ color:C.t1, marginBottom:20 }}>🔧 관리자 로그인</h2>
      <input type="password" placeholder="관리자 비밀번호" value={pw} onChange={e => setPw(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && login()} style={{ ...S.input, marginBottom:12 }} />
      {err && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</p>}
      <button onClick={login} disabled={loading} style={{ ...S.btn(), width:'100%', justifyContent:'center' }}>
        {loading ? '확인 중...' : '로그인'}
      </button>
      <button onClick={onBack} style={{ ...S.btnSec, width:'100%', justifyContent:'center', marginTop:8 }}>뒤로</button>
    </div>
  </div>
}

/* ═══════════════════ ADMIN DASHBOARD ══════════════════ */
function AdminDashboard({ onBack }) {
  const [tab, setTab] = useState('students')
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [students, setStudents] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [timeLimit, setTimeLimit] = useState(30)
  const [title, setTitle] = useState('일학습병행 지필고사')
  const [log, setLog] = useState([])
  const fileRef = useRef(null)

  const addLog = (msg) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100))

  // 활성 시험 로드
  useEffect(() => {
    loadActiveExam()
    const interval = setInterval(refreshData, 3000)
    return () => clearInterval(interval)
  }, [])

  // 실시간 학생 변화 구독
  useEffect(() => {
    if (!exam) return
    const channel = supabase.channel('students-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `exam_id=eq.${exam.id}` }, () => loadStudents())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [exam?.id])

  const loadActiveExam = async () => {
    const { data } = await supabase.from('exams').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
    if (data?.length) {
      setExam(data[0]); setTitle(data[0].title); setTimeLimit(data[0].time_limit_min)
      await loadQuestions(data[0].id)
      await loadStudents(data[0].id)
    }
  }

  const loadQuestions = async (eid) => {
    const id = eid || exam?.id; if (!id) return
    const { data } = await supabase.from('questions').select('*').eq('exam_id', id).order('sort_order')
    setQuestions(data || [])
  }

  const loadStudents = async (eid) => {
    const id = eid || exam?.id; if (!id) return
    const { data } = await supabase.from('students').select('*').eq('exam_id', id).order('created_at')
    setStudents(data || [])
  }

  const loadAnalytics = async () => {
    if (!exam) return
    const { data } = await supabase.from('question_analytics').select('*').eq('exam_id', exam.id)
    setAnalytics(data || [])
  }

  const refreshData = () => { if (exam) { loadStudents(); if (tab === 'analytics') loadAnalytics() } }

  // 시험 생성
  const createExam = async () => {
    // 기존 활성 시험 비활성화
    await supabase.from('exams').update({ is_active: false }).eq('is_active', true)
    const { data, error } = await supabase.from('exams').insert({ title, time_limit_min: timeLimit, is_active: false }).select().single()
    if (data) { setExam(data); addLog(`시험 생성: "${title}" (${timeLimit}분)`); setQuestions([]) }
    if (error) addLog('시험 생성 오류: ' + error.message)
  }

  // 시험 시작
  const startExam = async () => {
    if (!exam || questions.length === 0) { alert('문제를 먼저 업로드하세요!'); return }
    await supabase.from('exams').update({ is_active: true, started_at: new Date().toISOString() }).eq('id', exam.id)
    setExam({ ...exam, is_active: true, started_at: new Date().toISOString() })
    addLog(`═══ 시험 시작! (문제 ${questions.length}개, ${timeLimit}분) ═══`)
  }

  // 시험 종료
  const stopExam = async () => {
    if (!exam) return
    await supabase.from('exams').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', exam.id)
    setExam({ ...exam, is_active: false })
    addLog('═══ 시험 종료 ═══')
  }

  // 문제 업로드
  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file || !exam) return
    try {
      const text = await file.text()
      const ext = file.name.split('.').pop().toLowerCase()
      let parsed
      if (ext === 'json') {
        parsed = JSON.parse(text)
        if (!Array.isArray(parsed)) throw new Error('JSON은 배열이어야 합니다')
      } else {
        parsed = parseTXT(text)
      }
      if (!parsed.length) { alert('파싱된 문제가 없습니다'); return }

      // DB에 삽입
      const rows = parsed.map((q, i) => ({
        exam_id: exam.id,
        type: q.type,
        category: q.category || '일반',
        question: q.question,
        options: q.options || [],
        answer: q.type === 'multiple_choice' ? q.answer : q.type === 'ox' ? q.answer : q.type === 'short_answer' ? q.answer : q.pairs || [],
        pairs: q.pairs || [],
        explanation: q.explanation || '',
        sort_order: i + 1 + questions.length,
      }))

      const { error } = await supabase.from('questions').insert(rows)
      if (error) { addLog('업로드 오류: ' + error.message); return }
      addLog(`문제 ${parsed.length}개 업로드 완료 (${file.name})`)
      await loadQuestions()
    } catch (err) { alert('파일 오류: ' + err.message) }
    if (fileRef.current) fileRef.current.value = ''
  }

  const deleteAllQuestions = async () => {
    if (!exam || !confirm('모든 문제를 삭제하시겠습니까?')) return
    await supabase.from('questions').delete().eq('exam_id', exam.id)
    setQuestions([]); addLog('문제 전체 삭제')
  }

  const tabBtn = (key, label) => (
    <button key={key} onClick={() => { setTab(key); if (key === 'analytics') loadAnalytics() }}
      style={{ padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer', background:tab===key?'rgba(59,130,246,0.15)':'transparent', color:tab===key?C.blue:C.t2, border:'none', borderBottom:tab===key?`2px solid ${C.blue}`:'2px solid transparent' }}>
      {label}
    </button>
  )

  return <div style={S.page}><div style={S.container}>
    {/* 헤더 */}
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12 }}>
      <div>
        <h1 style={{ color:C.t1, fontSize:22, fontWeight:800, margin:0 }}>🔧 관리자 대시보드</h1>
        <p style={{ color:C.t2, fontSize:13, margin:'4px 0 0' }}>
          {exam ? `시험: "${exam.title}" | 문제: ${questions.length}개 | 접속: ${students.length}명` : '시험을 생성하세요'}
          {exam?.is_active && <span style={{ color:C.green, marginLeft:8 }}>● 진행중</span>}
        </p>
      </div>
      <button onClick={onBack} style={S.btnSec}>← 나가기</button>
    </div>

    {/* 시험 생성/제어 */}
    <div style={S.card}>
      <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:200 }}>
          <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>시험 제목</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={S.input} />
        </div>
        <div style={{ width:100 }}>
          <label style={{ fontSize:12, color:C.t2, display:'block', marginBottom:4 }}>시간(분)</label>
          <input type="number" value={timeLimit} onChange={e => setTimeLimit(+e.target.value)} style={S.input} />
        </div>
        {!exam && <button onClick={createExam} style={S.btn(C.blue)}>📋 시험 생성</button>}
        {exam && !exam.is_active && <button onClick={startExam} style={S.btn(C.green)}>🟢 시험 시작</button>}
        {exam?.is_active && <button onClick={stopExam} style={S.btn(C.red)}>🔴 시험 종료</button>}
      </div>
    </div>

    {/* 탭 */}
    <div style={{ display:'flex', borderBottom:'1px solid rgba(148,163,184,0.1)', marginBottom:16 }}>
      {tabBtn('students','📋 학생 현황')}
      {tabBtn('questions','📝 문제 관리')}
      {tabBtn('analytics','📊 문제 분석')}
      {tabBtn('log','📜 로그')}
    </div>

    {/* 학생 현황 */}
    {tab === 'students' && <div style={S.card}>
      <h3 style={{ color:C.t1, fontSize:16, fontWeight:700, margin:'0 0 16px' }}>접속 학생 ({students.length}명)</h3>
      {students.length === 0 ? <p style={{ color:C.t2 }}>접속한 학생이 없습니다.</p> :
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            {['학번','이름','상태','현재문항','정답수','점수','소요시간'].map(h => <th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {students.map(s => {
              const elapsed = s.started_at ? Math.floor(((s.submitted_at ? new Date(s.submitted_at) : new Date()) - new Date(s.started_at)) / 1000) : 0
              const statusColor = s.status === '제출완료' ? C.green : s.status === '응시중' ? C.blue : C.t2
              return <tr key={s.id}>
                <td style={S.td}>{s.student_id}</td>
                <td style={S.td}>{s.name}</td>
                <td style={S.td}><span style={S.tag(statusColor)}>{s.status}</span></td>
                <td style={S.td}>{s.total_questions > 0 ? `${s.current_question}/${s.total_questions}` : '-'}</td>
                <td style={S.td}>{s.correct_count || 0}</td>
                <td style={{ ...S.td, fontWeight:700, color: s.score >= 60 ? C.green : s.score ? C.red : C.t2 }}>
                  {s.score != null ? `${s.score}점` : '-'}
                </td>
                <td style={S.td}>{elapsed > 0 ? `${Math.floor(elapsed/60)}분 ${elapsed%60}초` : '-'}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>}
    </div>}

    {/* 문제 관리 */}
    {tab === 'questions' && <div>
      <div style={{ ...S.card, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <input ref={fileRef} type="file" accept=".json,.txt" onChange={handleFile} style={{ display:'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={!exam} style={S.btn(C.purple)}>📄 파일 업로드 (TXT/JSON)</button>
        <button onClick={deleteAllQuestions} disabled={!exam} style={S.btn(C.red)}>🗑 전체 삭제</button>
        <span style={{ color:C.t2, fontSize:12 }}>| 문제 {questions.length}개</span>
      </div>
      <div style={S.card}>
        {questions.length === 0 ? <p style={{ color:C.t2 }}>문제를 업로드하세요.</p> :
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              {['#','유형','카테고리','문제','해설'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {questions.map((q, i) => <tr key={q.id}>
                <td style={S.td}>{i + 1}</td>
                <td style={S.td}><span style={S.tag(TYPE_C[q.type]||C.t2)}>{TYPE_L[q.type]||q.type}</span></td>
                <td style={S.td}>{q.category}</td>
                <td style={{ ...S.td, maxWidth:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.question}</td>
                <td style={{ ...S.td, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:C.t2 }}>{q.explanation}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </div>
    </div>}

    {/* 문제 분석 */}
    {tab === 'analytics' && <div style={S.card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h3 style={{ color:C.t1, fontSize:16, fontWeight:700, margin:0 }}>문제별 분석</h3>
        <button onClick={loadAnalytics} style={S.btn(C.blue)}>🔄 새로고침</button>
      </div>
      {analytics.length === 0 ? <p style={{ color:C.t2 }}>데이터가 없습니다.</p> :
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            {['#','유형','카테고리','문제','응시','정답률(%)','평균시간(초)','난이도'].map(h => <th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {analytics.map(a => <tr key={a.question_id}>
              <td style={S.td}>{a.sort_order}</td>
              <td style={S.td}><span style={S.tag(TYPE_C[a.type]||C.t2)}>{TYPE_L[a.type]}</span></td>
              <td style={S.td}>{a.category}</td>
              <td style={{ ...S.td, maxWidth:250, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.question}</td>
              <td style={S.td}>{a.attempt_count}</td>
              <td style={{ ...S.td, fontWeight:700, color: a.correct_rate >= 60 ? C.green : a.correct_rate > 0 ? C.red : C.t2 }}>{a.correct_rate}%</td>
              <td style={S.td}>{a.avg_time_sec}초</td>
              <td style={S.td}><span style={S.tag(a.difficulty==='어려움'?C.red:a.difficulty==='보통'?C.yellow:a.difficulty==='쉬움'?C.green:C.t2)}>{a.difficulty}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </div>}

    {/* 로그 */}
    {tab === 'log' && <div style={{ ...S.card, maxHeight:500, overflowY:'auto' }}>
      {log.length === 0 ? <p style={{ color:C.t2 }}>로그가 없습니다.</p> :
        log.map((l, i) => <div key={i} style={{ fontSize:12, color:C.t2, padding:'4px 0', borderBottom:'1px solid rgba(148,163,184,0.05)', fontFamily:'monospace' }}>{l}</div>)
      }
    </div>}
  </div></div>
}

/* ═══════════════════ STUDENT LOGIN ════════════════════ */
function StudentLogin({ onLogin, onBack }) {
  const [sid, setSid] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    if (!sid.trim() || !name.trim()) { setErr('학번과 이름을 모두 입력해주세요.'); return }
    setLoading(true); setErr('')

    // 활성 시험 확인
    const { data: exams } = await supabase.from('exams').select('*').eq('is_active', true).limit(1)
    const activeExam = exams?.[0]

    if (!activeExam) {
      // 시험 대기 - 가장 최근 시험 찾기
      const { data: recent } = await supabase.from('exams').select('*').order('created_at', { ascending: false }).limit(1)
      const examToUse = recent?.[0]
      if (!examToUse) { setErr('현재 시험이 없습니다. 관리자에게 문의하세요.'); setLoading(false); return }

      // 학생 등록
      const { data: student, error } = await supabase.from('students')
        .upsert({ student_id: sid.trim(), name: name.trim(), exam_id: examToUse.id, status: '대기' }, { onConflict: 'student_id,exam_id' })
        .select().single()
      if (error) { setErr('접속 오류: ' + error.message); setLoading(false); return }
      onLogin({ student, exam: examToUse })
    } else {
      // 학생 등록 + 바로 시험
      const { data: qCount } = await supabase.from('questions').select('id', { count: 'exact' }).eq('exam_id', activeExam.id)
      const total = qCount?.length || 0

      const { data: student, error } = await supabase.from('students')
        .upsert({
          student_id: sid.trim(), name: name.trim(), exam_id: activeExam.id,
          status: '응시중', started_at: new Date().toISOString(), total_questions: total, current_question: 1
        }, { onConflict: 'student_id,exam_id' })
        .select().single()
      if (error) { setErr('접속 오류: ' + error.message); setLoading(false); return }
      onLogin({ student, exam: activeExam })
    }
  }

  return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ ...S.card, width:400, textAlign:'center' }}>
      <div style={{ fontSize:36, marginBottom:8 }}>🎓</div>
      <h2 style={{ color:C.t1, marginBottom:4, fontSize:22 }}>CBT 시험 접속</h2>
      <p style={{ color:C.t2, marginBottom:24, fontSize:13 }}>학번과 이름을 입력하세요</p>
      <div style={{ textAlign:'left', marginBottom:12 }}>
        <label style={{ fontSize:12, color:C.t2, marginBottom:4, display:'block' }}>학번</label>
        <input value={sid} onChange={e => setSid(e.target.value)} placeholder="예: 20241234" style={S.input} />
      </div>
      <div style={{ textAlign:'left', marginBottom:16 }}>
        <label style={{ fontSize:12, color:C.t2, marginBottom:4, display:'block' }}>이름</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 홍길동"
          onKeyDown={e => e.key === 'Enter' && login()} style={S.input} />
      </div>
      {err && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</p>}
      <button onClick={login} disabled={loading} style={{ ...S.btn(), width:'100%', justifyContent:'center' }}>
        {loading ? '접속 중...' : '접속하기'}
      </button>
      <button onClick={onBack} style={{ ...S.btnSec, width:'100%', justifyContent:'center', marginTop:8 }}>뒤로</button>
    </div>
  </div>
}

/* ═══════════════════ STUDENT EXAM ═════════════════════ */
function StudentExam({ student: initStudent, exam: initExam, onFinish }) {
  const [student, setStudent] = useState(initStudent)
  const [exam, setExam] = useState(initExam)
  const [questions, setQuestions] = useState([])
  const [ci, setCi] = useState(0)        // current index
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [waiting, setWaiting] = useState(!initExam.is_active)
  const [showNav, setShowNav] = useState(false)
  const qStartRef = useRef(Date.now())
  const timeSpent = useRef({})
  const timerRef = useRef(null)

  // 문제 로드
  useEffect(() => {
    if (exam.is_active) loadQuestions()
  }, [exam.is_active])

  // 시험 활성화 대기 (폴링)
  useEffect(() => {
    if (!waiting) return
    const poll = setInterval(async () => {
      const { data } = await supabase.from('exams').select('*').eq('id', exam.id).single()
      if (data?.is_active) {
        setExam(data); setWaiting(false)
        // 학생 상태 업데이트
        await supabase.from('students').update({
          status: '응시중', started_at: new Date().toISOString()
        }).eq('id', student.id)
      }
    }, 3000)
    return () => clearInterval(poll)
  }, [waiting])

  const loadQuestions = async () => {
    const { data } = await supabase.from('questions').select('*').eq('exam_id', exam.id).order('sort_order')
    if (data) {
      setQuestions(data)
      setTimeLeft(exam.time_limit_min * 60)
      // 학생 total_questions 업데이트
      await supabase.from('students').update({ total_questions: data.length, current_question: 1 }).eq('id', student.id)
    }
  }

  // 타이머
  useEffect(() => {
    if (questions.length === 0 || submitted || waiting) return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); submitExam(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [questions.length, submitted, waiting])

  const recordTime = () => {
    if (!questions[ci]) return
    const qid = questions[ci].id
    const elapsed = Date.now() - qStartRef.current
    timeSpent.current[qid] = (timeSpent.current[qid] || 0) + elapsed
    qStartRef.current = Date.now()
  }

  const navigateTo = async (idx) => {
    if (idx < 0 || idx >= questions.length || submitted) return
    recordTime()
    setCi(idx)
    qStartRef.current = Date.now()
    // 서버에 현재 문항 알림
    await supabase.from('students').update({ current_question: idx + 1 }).eq('id', student.id)
  }

  const handleAnswer = (qid, val) => {
    setAnswers(prev => ({ ...prev, [qid]: val }))
  }

  const submitExam = async () => {
    if (submitted) return
    setSubmitted(true)
    clearInterval(timerRef.current)
    recordTime()

    // 모든 응답 서버에 저장
    let correctCount = 0
    for (const q of questions) {
      const ua = answers[q.id]
      const correct = checkAnswer(q, ua)
      if (correct) correctCount++

      await supabase.from('answers').upsert({
        student_id: student.id, question_id: q.id, exam_id: exam.id,
        user_answer: ua ?? null, is_correct: correct,
        time_spent_ms: timeSpent.current[q.id] || 0
      }, { onConflict: 'student_id,question_id' })
    }

    const score = Math.round(correctCount / questions.length * 100 * 10) / 10

    await supabase.from('students').update({
      status: '제출완료', submitted_at: new Date().toISOString(),
      score, correct_count: correctCount, total_questions: questions.length
    }).eq('id', student.id)

    onFinish({ questions, answers, timeSpent: timeSpent.current, score, correctCount })
  }

  if (waiting) {
    return <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ ...S.card, width:400, textAlign:'center' }}>
        <div style={{ fontSize:48 }}>⏳</div>
        <h2 style={{ color:C.t1, marginTop:12 }}>시험 대기 중...</h2>
        <p style={{ color:C.t2, marginTop:8 }}>관리자가 시험을 시작하면 자동으로 문제가 표시됩니다.</p>
        <p style={{ color:C.blue, fontSize:13, marginTop:16 }}>{student.name}님 ({student.student_id})</p>
      </div>
    </div>
  }

  if (questions.length === 0) return <div style={S.page}><p style={{ color:C.t2, textAlign:'center', marginTop:40 }}>문제를 불러오는 중...</p></div>

  const q = questions[ci]
  const progress = (ci + 1) / questions.length * 100
  const min = Math.floor(timeLeft / 60), sec = timeLeft % 60
  const answeredCount = Object.keys(answers).filter(k => answers[k] != null).length

  return <div style={S.page}><div style={S.container}>
    {/* 헤더 */}
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
      <div>
        <h2 style={{ color:C.t1, fontSize:18, fontWeight:700, margin:0 }}>{exam.title}</h2>
        <p style={{ color:C.t2, fontSize:13, margin:'4px 0 0' }}>{ci + 1}/{questions.length}문항 · {answeredCount}개 작성 · {student.name}</p>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontWeight:700, fontSize:18, fontVariantNumeric:'tabular-nums', color: timeLeft < 60 ? C.red : timeLeft < 120 ? C.yellow : C.blue, animation: timeLeft < 60 ? 'pulse 1s infinite' : 'none' }}>
          ⏱ {String(min).padStart(2,'0')}:{String(sec).padStart(2,'0')}
        </div>
        <button onClick={() => setShowNav(!showNav)} style={S.btnSec}>☰</button>
      </div>
    </div>

    {/* 진행바 */}
    <div style={{ width:'100%', height:5, background:'rgba(148,163,184,0.1)', borderRadius:3, marginBottom:16, overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${progress}%`, background:C.blue, borderRadius:3, transition:'width 0.3s' }} />
    </div>

    {/* 네비게이션 */}
    {showNav && <div style={{ ...S.card, padding:16 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
        {questions.map((qq, i) => {
          const ans = answers[qq.id] != null
          const cur = i === ci
          return <button key={i} onClick={() => navigateTo(i)} style={{
            width:34, height:34, borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:12,
            background: cur ? C.blue : ans ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.1)',
            color: cur ? '#fff' : ans ? C.green : C.t2
          }}>{i + 1}</button>
        })}
      </div>
    </div>}

    {/* 문제 카드 */}
    <div style={S.card}>
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <span style={S.tag(TYPE_C[q.type])}>{TYPE_L[q.type]}</span>
        <span style={S.tag(C.t2)}>{q.category}</span>
      </div>
      <h3 style={{ color:C.t1, fontSize:17, fontWeight:600, lineHeight:1.65, margin:'0 0 20px' }}>
        <span style={{ color:C.blue }}>Q{ci + 1}.</span> {q.question}
      </h3>

      {/* 유형별 컴포넌트 */}
      {q.type === 'multiple_choice' && <MCQuestion q={q} value={answers[q.id]} onChange={v => handleAnswer(q.id, v)} />}
      {q.type === 'ox' && <OXQuestion q={q} value={answers[q.id]} onChange={v => handleAnswer(q.id, v)} />}
      {q.type === 'short_answer' && <SAQuestion q={q} value={answers[q.id]} onChange={v => handleAnswer(q.id, v)} />}
      {q.type === 'matching' && <MatchQuestion q={q} value={answers[q.id]} onChange={v => handleAnswer(q.id, v)} />}
    </div>

    {/* 하단 버튼 */}
    <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, flexWrap:'wrap', gap:8 }}>
      <button onClick={() => navigateTo(ci - 1)} disabled={ci === 0} style={{ ...S.btnSec, opacity: ci === 0 ? 0.4 : 1 }}>◀ 이전</button>
      <div style={{ display:'flex', gap:8 }}>
        {ci < questions.length - 1
          ? <button onClick={() => navigateTo(ci + 1)} style={S.btn()}>다음 ▶</button>
          : <button onClick={() => { if(confirm(`시험을 제출하시겠습니까?\n작성: ${answeredCount}/${questions.length}문항`)) submitExam() }} style={S.btn(C.green)}>✔ 제출하기</button>
        }
      </div>
    </div>
  </div>
  <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
  </div>
}

/* ─── 객관식 ─── */
function MCQuestion({ q, value, onChange }) {
  const labels = ['A','B','C','D']
  return <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
    {(q.options||[]).map((opt, i) => {
      const sel = value === i
      return <button key={i} onClick={() => onChange(i)} style={{
        display:'flex', alignItems:'center', gap:12, padding:'13px 16px', borderRadius:10,
        background: sel ? 'rgba(59,130,246,0.12)' : 'rgba(148,163,184,0.05)',
        border: sel ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(148,163,184,0.1)',
        color:C.t1, fontSize:15, cursor:'pointer', textAlign:'left', transition:'all 0.2s'
      }}>
        <span style={{ width:30, height:30, borderRadius:7, background: sel ? 'rgba(59,130,246,0.25)' : 'rgba(148,163,184,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color: sel ? C.blue : C.t2, flexShrink:0 }}>{labels[i]}</span>
        {opt}
      </button>
    })}
  </div>
}

/* ─── O/X ─── */
function OXQuestion({ q, value, onChange }) {
  return <div style={{ display:'flex', gap:16, justifyContent:'center', padding:'10px 0' }}>
    {[{l:'O',v:true,c:C.blue},{l:'X',v:false,c:C.red}].map(o => {
      const sel = value === o.v
      return <button key={o.l} onClick={() => onChange(o.v)} style={{
        width:110, height:110, borderRadius:18, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4,
        background: sel ? `${o.c}18` : 'rgba(148,163,184,0.05)', border: `2px solid ${sel ? o.c : 'rgba(148,163,184,0.15)'}`,
        fontSize:38, fontWeight:800, color: sel ? o.c : C.t2, transition:'all 0.2s'
      }}>{o.l}<span style={{ fontSize:11, fontWeight:500, opacity:0.7 }}>{o.v?'맞다':'틀리다'}</span></button>
    })}
  </div>
}

/* ─── 단답형 ─── */
function SAQuestion({ q, value, onChange }) {
  return <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="정답을 입력하세요..."
    style={{ ...S.input, fontSize:16, padding:'14px 18px' }} />
}

/* ─── 선잇기 ─── */
function MatchQuestion({ q, value, onChange }) {
  const pairs = q.pairs || []
  const rightItems = useMemo(() => {
    const items = pairs.map((p, i) => ({ text: typeof p === 'object' ? (p.right || p[1] || '') : '', origIdx: i }))
    return items.sort(() => Math.random() - 0.5)
  }, [q.id])

  const currentMatch = value || {}
  const rightOptions = ['-- 선택 --', ...rightItems.map(r => r.text)]

  return <div>
    <p style={{ fontSize:12, color:C.t2, marginBottom:12 }}>왼쪽에 맞는 오른쪽 항목을 선택하세요.</p>
    {pairs.map((p, i) => {
      const leftText = typeof p === 'object' ? (p.left || p[0] || '') : ''
      return <div key={i} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:14, fontWeight:600, color:C.t1, minWidth:150 }}>{i + 1}. {leftText}</span>
        <span style={{ color:C.blue, fontWeight:700 }}>→</span>
        <select value={currentMatch[i] != null ? rightItems.findIndex(r => r.origIdx === currentMatch[i]) + 1 : 0}
          onChange={e => {
            const selIdx = +e.target.value - 1
            const next = { ...currentMatch }
            if (selIdx >= 0) next[i] = rightItems[selIdx].origIdx; else delete next[i]
            onChange(next)
          }}
          style={{ ...S.input, width:'auto', minWidth:200 }}>
          {rightOptions.map((o, j) => <option key={j} value={j}>{o}</option>)}
        </select>
      </div>
    })}
  </div>
}

/* ═══════════════════ STUDENT RESULT ═══════════════════ */
function StudentResult({ data, onHome }) {
  const { questions, answers, timeSpent, score, correctCount } = data
  const passed = score >= 60
  const mc = passed ? C.green : C.red

  // 유형별 통계
  const byType = {}, byCat = {}
  questions.forEach(q => {
    const correct = checkAnswer(q, answers[q.id])
    const tKey = q.type, cKey = q.category
    if (!byType[tKey]) byType[tKey] = [0, 0]
    byType[tKey][1]++; if (correct) byType[tKey][0]++
    if (!byCat[cKey]) byCat[cKey] = [0, 0]
    byCat[cKey][1]++; if (correct) byCat[cKey][0]++
  })

  const wrongQs = questions.filter(q => !checkAnswer(q, answers[q.id]))

  return <div style={S.page}><div style={S.container}>
    {/* 점수 */}
    <div style={{ ...S.card, textAlign:'center', border:`2px solid ${mc}33`, padding:36 }}>
      <div style={{ width:110, height:110, borderRadius:'50%', margin:'0 auto 16px', background:`${mc}15`, border:`3px solid ${mc}44`, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
        <span style={{ fontSize:34, fontWeight:800, color:mc }}>{score}</span>
        <span style={{ fontSize:12, color:C.t2 }}>점</span>
      </div>
      <h2 style={{ color:mc, fontSize:24, fontWeight:800, margin:'0 0 6px' }}>{passed ? '합격' : '불합격'}</h2>
      <p style={{ color:C.t2 }}>총 {questions.length}문항 중 {correctCount}문항 정답 (합격기준 60점)</p>
    </div>

    {/* 유형별 */}
    <div style={S.card}>
      <h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 14px' }}>유형별 성적</h3>
      {Object.entries(byType).map(([t, [c, total]]) => {
        const pct = Math.round(c / total * 100)
        return <div key={t} style={{ marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={S.tag(TYPE_C[t])}>{TYPE_L[t]}</span>
            <span style={{ fontSize:13, fontWeight:700, color: pct >= 60 ? C.green : C.red }}>{c}/{total} ({pct}%)</span>
          </div>
          <div style={{ height:5, background:'rgba(148,163,184,0.1)', borderRadius:3 }}>
            <div style={{ height:'100%', width:`${pct}%`, background: pct >= 60 ? C.green : C.red, borderRadius:3, transition:'width 0.5s' }} />
          </div>
        </div>
      })}
    </div>

    {/* 카테고리별 */}
    <div style={S.card}>
      <h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 14px' }}>카테고리별 성적</h3>
      {Object.entries(byCat).map(([cat, [c, total]]) => {
        const pct = Math.round(c / total * 100)
        return <div key={cat} style={{ marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ fontSize:13, color:C.t1 }}>{cat}</span>
            <span style={{ fontSize:13, fontWeight:700, color: pct >= 60 ? C.green : C.red }}>{c}/{total} ({pct}%)</span>
          </div>
          <div style={{ height:5, background:'rgba(148,163,184,0.1)', borderRadius:3 }}>
            <div style={{ height:'100%', width:`${pct}%`, background: pct >= 60 ? C.green : C.red, borderRadius:3 }} />
          </div>
        </div>
      })}
    </div>

    {/* 오답노트 */}
    {wrongQs.length > 0 && <div style={S.card}>
      <h3 style={{ color:C.t1, fontSize:15, fontWeight:700, margin:'0 0 14px' }}>오답 노트 ({wrongQs.length}문항)</h3>
      {wrongQs.map(q => <div key={q.id} style={{ padding:14, borderRadius:10, marginBottom:10, background:'rgba(239,68,68,0.04)', border:'1px solid rgba(239,68,68,0.1)' }}>
        <div style={{ display:'flex', gap:8, marginBottom:6 }}>
          <span style={S.tag(TYPE_C[q.type])}>{TYPE_L[q.type]}</span>
          <span style={{ fontSize:11, color:C.t2 }}>{q.category}</span>
        </div>
        <p style={{ color:C.t1, fontSize:14, fontWeight:600, lineHeight:1.6, margin:'0 0 6px' }}>{q.question}</p>
        {q.explanation && <p style={{ color:C.t2, fontSize:13, lineHeight:1.6, margin:0 }}>💡 {q.explanation}</p>}
      </div>)}
    </div>}

    <div style={{ textAlign:'center', marginTop:8 }}>
      <button onClick={onHome} style={S.btn()}>처음으로 돌아가기</button>
    </div>
  </div></div>
}

/* ═══════════════════ ANSWER CHECK ═════════════════════ */
function checkAnswer(q, userAnswer) {
  if (userAnswer == null || userAnswer === '') return false
  switch (q.type) {
    case 'multiple_choice': {
      const correctIdx = typeof q.answer === 'number' ? q.answer : parseInt(q.answer, 10)
      return userAnswer === correctIdx
    }
    case 'ox': {
      const correctBool = typeof q.answer === 'boolean' ? q.answer : q.answer === true || q.answer === 'true'
      return userAnswer === correctBool
    }
    case 'short_answer': {
      const acceptedAnswers = Array.isArray(q.answer) ? q.answer : [String(q.answer)]
      const ua = String(userAnswer).trim().toLowerCase()
      return acceptedAnswers.some(a => String(a).trim().toLowerCase() === ua)
    }
    case 'matching': {
      if (typeof userAnswer !== 'object') return false
      const pairs = q.pairs || []
      return pairs.every((_, i) => userAnswer[i] === i)
    }
    default: return false
  }
}

/* ═══════════════════ MAIN APP ═════════════════════════ */
export default function App() {
  const [screen, setScreen] = useState('role')  // role | adminLogin | admin | studentLogin | studentExam | studentResult
  const [studentData, setStudentData] = useState(null)
  const [resultData, setResultData] = useState(null)

  switch (screen) {
    case 'role':
      return <RoleSelect onRole={r => setScreen(r === 'admin' ? 'adminLogin' : 'studentLogin')} />
    case 'adminLogin':
      return <AdminLogin onLogin={() => setScreen('admin')} onBack={() => setScreen('role')} />
    case 'admin':
      return <AdminDashboard onBack={() => setScreen('role')} />
    case 'studentLogin':
      return <StudentLogin onLogin={d => { setStudentData(d); setScreen('studentExam') }} onBack={() => setScreen('role')} />
    case 'studentExam':
      return <StudentExam student={studentData.student} exam={studentData.exam}
        onFinish={d => { setResultData(d); setScreen('studentResult') }} />
    case 'studentResult':
      return <StudentResult data={resultData} onHome={() => setScreen('role')} />
    default:
      return <RoleSelect onRole={r => setScreen(r === 'admin' ? 'adminLogin' : 'studentLogin')} />
  }
}
