'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TeacherHeader from '@/app/components/TeacherHeader';

type Lesson = { id: string; lesson_number: number; title: string; passage: string | null };
type PreQ = { id: string; lesson_id: string; order_index: number; question: string; correct_answer: string };
type Ans = { user_id: string; prequestion_id: string; answer: string; is_correct: boolean; ai_feedback?: string | null };
type Person = { id: string; name: string | null; email: string; role: string };

const NAVY = '#1F3A6E';

export default function PrequestionAnswersPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [pqs, setPqs] = useState<PreQ[]>([]);
  const [answers, setAnswers] = useState<Ans[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [regrading, setRegrading] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }
      const { data: me } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
      if (!me || me.role !== 'teacher') { window.location.href = '/home'; return; }
      setTeacherName(me.name);

      const [lRes, qRes, aRes, pRes] = await Promise.all([
        supabase.from('lessons').select('id, lesson_number, title, passage').order('lesson_number'),
        supabase.from('prequestions').select('id, lesson_id, order_index, question, correct_answer').order('order_index'),
        supabase.from('prequestion_answers').select('*'),
        supabase.from('profiles').select('id, name, email, role'),
      ]);
      if (aRes.error) setMsg('학생 답을 불러오지 못했습니다: ' + aRes.error.message);
      const ls = (lRes.data as Lesson[]) || [];
      setLessons(ls);
      setPqs((qRes.data as PreQ[]) || []);
      setAnswers((aRes.data as Ans[]) || []);
      setPeople((pRes.data as Person[]) || []);
      if (ls.length > 0) setLessonId(ls[0].id);
      setLoading(false);
    }
    load();
  }, []);

  /* 선택한 회차의 모든 사전 질문 답을, 저장된 정답은 무시하고 질문과 본문만으로 새로 채점 */
  async function regradeAll() {
    const lesson = lessons.find((l) => l.id === lessonId);
    const qsHere = pqs.filter((q) => q.lesson_id === lessonId);
    const ids = new Set(qsHere.map((q) => q.id));
    const targets = answers.filter((a) => ids.has(a.prequestion_id));
    if (targets.length === 0) { setMsg('다시 채점할 답이 없습니다.'); return; }
    if (!window.confirm('제' + (lesson ? lesson.lesson_number : '') + '강 사전 질문 답 ' + targets.length + '개를 모두 새로 채점합니다. 기존 정오 판정과 피드백은 새 결과로 바뀝니다. 진행할까요?')) return;
    setRegrading(true);
    setMsg('');
    let done = 0;
    let failed = 0;
    const updated = [...answers];
    /* 한꺼번에 몰리지 않게 3개씩 */
    for (let i = 0; i < targets.length; i += 3) {
      await Promise.all(targets.slice(i, i + 3).map(async (a) => {
        const q = qsHere.find((x) => x.id === a.prequestion_id);
        if (!q) return;
        try {
          const res = await fetch('/api/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'prequestion',
              prompt: q.question,
              answer: a.answer,
              lessonTitle: lesson ? '제' + lesson.lesson_number + '강' : '',
              passage: lesson && lesson.passage ? lesson.passage : '',
            }),
          });
          const r = await res.json();
          if (typeof r.correct !== 'boolean') { failed++; return; }
          const fb = ((r.verdict ? '판정: ' + r.verdict + '\n\n' : '') + (r.feedback || '') + (r.modelAnswer ? '\n\n📘 모범 답안\n' + r.modelAnswer : '')).trim();
          const { error } = await supabase
            .from('prequestion_answers')
            .update({ is_correct: r.correct, ai_feedback: fb })
            .eq('user_id', a.user_id)
            .eq('prequestion_id', a.prequestion_id);
          if (error) { failed++; setMsg('저장 실패: ' + error.message); return; }
          const k = updated.findIndex((x) => x.user_id === a.user_id && x.prequestion_id === a.prequestion_id);
          if (k >= 0) updated[k] = { ...updated[k], is_correct: r.correct, ai_feedback: fb };
        } catch {
          failed++;
        } finally {
          done++;
          setProgress(done + ' / ' + targets.length);
        }
      }));
      setAnswers([...updated]);
    }
    setRegrading(false);
    setProgress('');
    setMsg('새로 채점 완료: ' + (done - failed) + '개' + (failed ? ' · 실패 ' + failed + '개 (다시 눌러 주세요)' : ''));
  }

  if (loading) return <div className="loading-note">불러오는 중...</div>;

  const qs = pqs.filter((q) => q.lesson_id === lessonId);
  const qIds = new Set(qs.map((q) => q.id));
  const lessonAnswers = answers.filter((a) => qIds.has(a.prequestion_id));
  const studentIds = Array.from(new Set(lessonAnswers.map((a) => a.user_id)));
  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? (p.name || p.email) + (p.role === 'teacher' ? ' (선생님 미리보기)' : '') : '(알 수 없음)';
  };

  return (
    <>
      <TeacherHeader teacherName={teacherName} />
      <div className="container">
        <h1 style={{ color: NAVY, fontSize: 22, marginBottom: 16 }}>사전 질문 답</h1>

        {msg && (
          <div style={{ background: '#fffbe8', border: '1px solid #e8d98a', padding: '10px 14px', margin: '12px 0', fontSize: 14 }}>{msg}</div>
        )}

        <div className="filter-row" style={{ flexWrap: 'wrap' }}>
          {lessons.map((l) => (
            <button key={l.id} className={l.id === lessonId ? 'f-btn on' : 'f-btn'} onClick={() => { setLessonId(l.id); setOpenStudent(null); }}>
              제{l.lesson_number}강
            </button>
          ))}
        </div>

        {qs.length > 0 && studentIds.length > 0 && (
          <div style={{ margin: '4px 0 16px' }}>
            <button
              onClick={regradeAll}
              disabled={regrading}
              className="next-btn"
              style={{ opacity: regrading ? 0.6 : 1 }}
            >
              {regrading ? '새로 채점 중... ' + progress : '↻ 이 회차 답 전부 새로 채점'}
            </button>
            <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
              예전에 입력한 정답은 쓰지 않고, 질문과 본문만 보고 AI가 다시 판정합니다.
            </div>
          </div>
        )}

        {qs.length === 0 ? (
          <div className="empty-note">이 회차에는 사전 질문이 없습니다.</div>
        ) : studentIds.length === 0 ? (
          <div className="empty-note">아직 이 회차의 사전 질문에 답한 학생이 없습니다.</div>
        ) : (
          studentIds.map((sid) => {
            const mine = qs.map((q) => ({ q, a: lessonAnswers.find((x) => x.user_id === sid && x.prequestion_id === q.id) }));
            const right = mine.filter((m) => m.a && m.a.is_correct).length;
            const open = openStudent === sid;
            return (
              <div className="sub-card" key={sid}>
                <div className="sub-head" onClick={() => setOpenStudent(open ? null : sid)}>
                  <div>
                    <div className="sub-student">{nameOf(sid)}</div>
                    <div className="sub-meta">정답 {right} / {qs.length}</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#2E5FAC', fontWeight: 600 }}>{open ? '▲ 접기' : '▼ 답 보기'}</div>
                </div>
                {open && (
                  <div className="sub-body">
                    {mine.map(({ q, a }) => (
                      <div key={q.id} style={{ borderTop: '1px solid #eee', padding: '12px 0' }}>
                        <div style={{ fontWeight: 600 }}>{q.order_index}. {q.question}</div>
                        {a ? (
                          <>
                            <div style={{ marginTop: 6 }}>
                              <span style={{ color: a.is_correct ? '#1f6e3a' : '#B23A48', fontWeight: 700 }}>{a.is_correct ? '✓ 정답' : '✗ 오답'}</span>
                              {' · 학생 답: '}{a.answer}
                            </div>
                            {a.ai_feedback && (
                              <div className="ai-fb" style={{ marginTop: 6, background: '#fafafa', border: '1px solid #eee', padding: '10px 12px' }}>{a.ai_feedback}</div>
                            )}
                          </>
                        ) : (
                          <div style={{ marginTop: 6, color: '#888' }}>답하지 않음</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
