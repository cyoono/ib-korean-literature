'use client';
import TeacherHeader from '@/app/components/TeacherHeader';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Sub = {
  id: string;
  user_id: string;
  assignment_id: string;
  content: string;
  submitted_at: string;
  ai_score: number | null;
  ai_feedback: string | null;
  published_to_student: boolean;
};
type Asg = { id: string; lesson_id: string; order_index: number; title: string; prompt: string; max_score: number };
type LessonLite = { id: string; lesson_number: number; title: string };
type ProfileLite = { id: string; name: string; email: string };

export default function TeacherPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [asgs, setAsgs] = useState<Asg[]>([]);
  const [lessons, setLessons] = useState<LessonLite[]>([]);
  const [students, setStudents] = useState<ProfileLite[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState<Record<string, string>>({});
  const [fbInput, setFbInput] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'sent' | 'all'>('pending');
  const [teacherName, setTeacherName] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }
      const { data: me } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
      if (!me || me.role !== 'teacher') { window.location.href = '/home'; return; }
      setTeacherName(me.name);

      const [subRes, asgRes, lessonRes, profRes] = await Promise.all([
        supabase.from('submissions').select('*').order('submitted_at', { ascending: false }),
        supabase.from('assignments').select('id, lesson_id, order_index, title, prompt, max_score'),
        supabase.from('lessons').select('id, lesson_number, title'),
        supabase.from('profiles').select('id, name, email'),
      ]);
      setSubs((subRes.data as Sub[]) || []);
      setAsgs(asgRes.data || []);
      setLessons(lessonRes.data || []);
      setStudents(profRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  function asgOf(s: Sub) { return asgs.find((a) => a.id === s.assignment_id); }
  function lessonOf(s: Sub) { const a = asgOf(s); return a ? lessons.find((l) => l.id === a.lesson_id) : undefined; }
  function studentOf(s: Sub) { return students.find((p) => p.id === s.user_id); }

  async function publish(s: Sub) {
    const a = asgOf(s);
    const max = a ? a.max_score : 7;
    const sc = parseInt(scoreInput[s.id] !== undefined ? scoreInput[s.id] : (s.final_score !== null ? String(s.final_score) : (s.ai_score !== null ? String(s.ai_score) : '')), 10);
    if (isNaN(sc) || sc < 0 || sc > max) {
      alert('0~' + max + ' 사이의 점수를 입력해 주세요');
      return;
    }
    const fb = fbInput[s.id] !== undefined ? fbInput[s.id] : (s.final_feedback || s.ai_feedback || '');
    const { error } = await supabase.from('submissions').update({
      final_score: sc,
      final_feedback: fb,
      teacher_edited: true,
      published_to_student: true,
      published_at: new Date().toISOString(),
    }).eq('id', s.id);
    if (error) {
      alert('발송 실패: ' + error.message);
      return;
    }
    setSubs(subs.map((x) => (x.id === s.id ? { ...x, final_score: sc, final_feedback: fb, published_to_student: true } : x)));
    setOpenId(null);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const filtered = subs.filter((s) => (filter === 'all' ? true : filter === 'pending' ? !s.published_to_student : s.published_to_student));
  const pendingCount = subs.filter((s) => !s.published_to_student).length;

  if (loading) return <div className="loading-note">불러오는 중...</div>;

  return (
    <>
     <TeacherHeader teacherName={teacherName} />
  

      <div className="container">
        <div className="t-stats">
          <div className="t-stat"><div className="num">{pendingCount}</div><div className="label">채점 대기</div></div>
          <div className="t-stat"><div className="num">{subs.length - pendingCount}</div><div className="label">발송 완료</div></div>
          <div className="t-stat"><div className="num">{subs.length}</div><div className="label">전체 제출</div></div>
        </div>

        <div className="filter-row">
          <button className={filter === 'pending' ? 'f-btn on' : 'f-btn'} onClick={() => setFilter('pending')}>채점 대기</button>
          <button className={filter === 'sent' ? 'f-btn on' : 'f-btn'} onClick={() => setFilter('sent')}>발송 완료</button>
          <button className={filter === 'all' ? 'f-btn on' : 'f-btn'} onClick={() => setFilter('all')}>전체</button>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-note">표시할 제출물이 없습니다.</div>
        ) : (
          filtered.map((s) => {
            const a = asgOf(s);
            const l = lessonOf(s);
            const st = studentOf(s);
            const open = openId === s.id;
            return (
              <div className="sub-card" key={s.id}>
                <div className="sub-head" onClick={() => setOpenId(open ? null : s.id)}>
                  <div>
                    <div className="sub-student">{st ? st.name : '?'} <span className="sub-email">{st ? st.email : ''}</span></div>
                    <div className="sub-meta">제{l ? l.lesson_number : '?'}강 · 과제 {a ? a.order_index : '?'}. {a ? a.title : ''}</div>
                  </div>
                  <div className={'sub-badge ' + (s.published_to_student ? 'sent' : 'pending')}>
                    {s.published_to_student ? '✓ 발송됨 ' + s.final_score + '점' : '채점 대기'}
                  </div>
                </div>
                {open && (
                  <div className="sub-body">
                    <div className="sub-prompt">{a ? a.prompt : ''}</div>
                    <div className="my-answer">{s.content}</div>
                    <div className="grade-row">
                      <label>점수 (0~{a ? a.max_score : 7})</label>
                      <input
                        type="number"
                        min={0}
                        max={a ? a.max_score : 7}
                        value={scoreInput[s.id] !== undefined ? scoreInput[s.id] : (s.final_score !== null ? String(s.final_score) : '')}
                        onChange={(e) => setScoreInput({ ...scoreInput, [s.id]: e.target.value })}
                      />
                    </div>
                    <label className="fb-label">피드백</label>
                    <textarea
                      value={fbInput[s.id] !== undefined ? fbInput[s.id] : (s.final_feedback || '')}
                      onChange={(e) => setFbInput({ ...fbInput, [s.id]: e.target.value })}
                      placeholder="학생에게 보낼 피드백을 작성하세요"
                    />
                    <button className="next-btn" onClick={() => publish(s)}>
                      {s.published_to_student ? '수정해서 다시 발송' : '점수 발송 → 학생에게 공개'}
                    </button>
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