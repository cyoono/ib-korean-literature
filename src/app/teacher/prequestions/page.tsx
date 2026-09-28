'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TeacherHeader from '@/app/components/TeacherHeader';

type Lesson = { id: string; lesson_number: number; title: string };
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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }
      const { data: me } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
      if (!me || me.role !== 'teacher') { window.location.href = '/home'; return; }
      setTeacherName(me.name);

      const [lRes, qRes, aRes, pRes] = await Promise.all([
        supabase.from('lessons').select('id, lesson_number, title').order('lesson_number'),
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
                        <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>참고 답안: {q.correct_answer}</div>
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
