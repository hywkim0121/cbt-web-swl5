-- ═══════════════════════════════════════════════════════════
-- 일학습병행 CBT 시스템 - Supabase 데이터베이스 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 실행하세요
-- ═══════════════════════════════════════════════════════════

-- 1) 시험 세션 테이블
CREATE TABLE IF NOT EXISTS exams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '일학습병행 지필고사',
  time_limit_min INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- 2) 문제 테이블
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('multiple_choice','ox','short_answer','matching')),
  category TEXT NOT NULL DEFAULT '일반',
  question TEXT NOT NULL,
  options JSONB DEFAULT '[]',
  answer JSONB NOT NULL,          -- MC: number, OX: boolean, SA: ["답1","답2"], MT: pairs
  pairs JSONB DEFAULT '[]',       -- matching용: [{"left":"a","right":"b"},...]
  explanation TEXT DEFAULT '',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) 학생 테이블
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,       -- 학번
  name TEXT NOT NULL,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  status TEXT DEFAULT '대기' CHECK (status IN ('대기','응시중','제출완료')),
  current_question INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score NUMERIC(5,2),
  correct_count INT DEFAULT 0,
  total_questions INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, exam_id)
);

-- 4) 응답 테이블
CREATE TABLE IF NOT EXISTS answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  question_id INT REFERENCES questions(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  user_answer JSONB,
  is_correct BOOLEAN DEFAULT false,
  time_spent_ms BIGINT DEFAULT 0,    -- 해당 문제에 소요된 시간(밀리초)
  answered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, question_id)
);

-- 5) 관리자 비밀번호 테이블 (간단 인증)
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 기본 관리자 비밀번호 설정 (초기: admin1234)
INSERT INTO admin_config (key, value) VALUES ('admin_password', 'admin1234')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- 인덱스
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_students_exam ON students(exam_id);
CREATE INDEX IF NOT EXISTS idx_answers_student ON answers(student_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_exam ON answers(exam_id);

-- ═══════════════════════════════════════════════════════════
-- RLS (Row Level Security) - 모든 테이블 공개 접근 허용
-- (교육용 간소화 - 프로덕션에서는 Auth 연동 권장)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access exams" ON exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access questions" ON questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access students" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access answers" ON answers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access admin_config" ON admin_config FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- Realtime 활성화 (학생 현황 실시간 모니터링)
-- ═══════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE students;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;

-- ═══════════════════════════════════════════════════════════
-- 문제별 분석 뷰 (오답률, 평균 풀이시간)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW question_analytics AS
SELECT
  q.id AS question_id,
  q.exam_id,
  q.type,
  q.category,
  q.question,
  q.sort_order,
  COUNT(a.id) AS attempt_count,
  COUNT(CASE WHEN a.is_correct THEN 1 END) AS correct_count,
  CASE WHEN COUNT(a.id) > 0
    THEN ROUND(COUNT(CASE WHEN a.is_correct THEN 1 END)::NUMERIC / COUNT(a.id) * 100, 1)
    ELSE 0 END AS correct_rate,
  CASE WHEN COUNT(a.id) > 0
    THEN ROUND(AVG(a.time_spent_ms)::NUMERIC / 1000, 1)
    ELSE 0 END AS avg_time_sec,
  CASE
    WHEN COUNT(a.id) = 0 THEN '미응시'
    WHEN COUNT(CASE WHEN a.is_correct THEN 1 END)::NUMERIC / COUNT(a.id) >= 0.8 THEN '쉬움'
    WHEN COUNT(CASE WHEN a.is_correct THEN 1 END)::NUMERIC / COUNT(a.id) >= 0.5 THEN '보통'
    ELSE '어려움'
  END AS difficulty
FROM questions q
LEFT JOIN answers a ON a.question_id = q.id
GROUP BY q.id, q.exam_id, q.type, q.category, q.question, q.sort_order
ORDER BY q.sort_order;
