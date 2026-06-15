'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Lesson = { id: string; lesson_number: number; title: string };
type Asg = { id: string; lesson_id: string; order_index: number; max_score: number };
type Sub = { assignment_id: string; final_score: number | null; final_feedback: string | null; published_to_student: boolean };

const NAVY = '#1F3A6E';
const MONTH_NAMES = ['9월', '10월', '11월', '12월', '1월', '2월', '3월', '4월', '5월', '6월'];

function monthIndexOf(lessonNumber: number) {
  return Math.floor((lessonNumber - 1) / 2);
}

export default function StudentReportsPage() {
  const [studentName, setStudentName] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [asgs, setAsgs] = useState<Asg[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }
      const { data: me } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
      if (!me) { window.location.href = '/'; return; }
      if (me.role === 'teacher') { window.location.href = '/teacher/reports'; return; }
      setStudentName(me.name);

      const [lessonRes, asgRes, subRes] = await Promise.all([
        supabase.from('lessons').select('id, lesson_number, title').eq('status', 'published').order('lesson_number', { ascending: true }),
        supabase.from('assignments').select('id, lesson_id, order_index, max_score'),
        supabase.from('submissions').select('assignment_id, final_score, final_feedback, published_to_student').eq('user_id', user.id),
      ]);
      setLessons((lessonRes.data as Lesson[]) || []);
      setAsgs((asgRes.data as Asg[]) || []);
      setSubs((subRes.data as Sub[]) || []);
      setLoading(false);
    }
    init();
  }, []);

  function scoreOf(assignmentId: string): number | null {
    const s = subs.find((x) => x.assignment_id === assignmentId && x.published_to_student);
    return s && s.final_score != null ? s.final_score : null;
  }

  function asgsOfLesson(lessonId: string): Asg[] {
    return asgs.filter((a) => a.lesson_id === lessonId).sort((a, b) => a.order_index - b.order_index);
  }

  function lessonTotal(lessonId: string) {
    const la = asgsOfLesson(lessonId);
    let got = 0, max = 0, hasAny = false;
    for (const a of la) {
      max += a.max_score || 7;
      const sc = scoreOf(a.id);
      if (sc != null) { got += sc; hasAny = true; }
    }
    return { got, max, hasAny };
  }

  function yearTotal() {
    let got = 0, max = 0;
    for (const l of lessons) {
      const t = lessonTotal(l.id);
      got += t.got;
      max += t.max;
    }
    return { got, max };
  }

  function lessonsByMonth() {
    const groups: Lesson[][] = MONTH_NAMES.map(() => []);
    for (const l of lessons) {
      const mi = monthIndexOf(l.lesson_number);
      if (mi >= 0 && mi < 10) groups[mi].push(l);
    }
    return groups;
  }
  if (loading) return <div className="loading-note">불러오는 중...</div>;

  const groups = lessonsByMonth();
  const yt = yearTotal();

  const cellStyle: React.CSSProperties = { border: '1px solid #ddd', padding: '8px 10px', fontSize: 14, textAlign: 'center' };
  const headStyle: React.CSSProperties = { ...cellStyle, background: NAVY, color: '#fff', fontWeight: 600 };

  return (
    <>
      <header className="app-header">
        <div className="logo">IB · 글로컬 K-문학</div>
        <div className="user-area">
          <a href="/home" style={{ color: '#fff', fontSize: 14, marginRight: 16, textDecoration: 'underline' }}>나의 강의실</a>
          <span style={{ marginRight: 12 }}>{studentName}</span>
          <button className="logout-btn" onClick={logout}>로그아웃</button>
        </div>
      </header>

      <div className="container">
        <h1 style={{ color: NAVY, fontSize: 22, marginBottom: 8 }}>나의 연간 리포트 카드</h1>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>{studentName} 님의 1년간 과제 성적입니다.</p>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead>
            <tr>
              <th style={headStyle}>월</th>
              <th style={{ ...headStyle, textAlign: 'left' }}>회차</th>
              <th style={headStyle}>과제 1</th>
              <th style={headStyle}>과제 2</th>
              <th style={headStyle}>과제 3</th>
              <th style={headStyle}>회차 합계</th>
            </tr>
          </thead>
          <tbody>
            {lessons.length === 0 ? (
              <tr>
                <td style={{ ...cellStyle, color: '#888' }} colSpan={6}>아직 공개된 강의가 없습니다.</td>
              </tr>
            ) : (
              groups.map((monthLessons, mi) => {
                if (monthLessons.length === 0) return null;
                return monthLessons.map((l, idx) => {
                  const la = asgsOfLesson(l.id);
                  const t = lessonTotal(l.id);
                  return (
                    <tr key={l.id}>
                      {idx === 0 && (
                        <td style={{ ...cellStyle, fontWeight: 700, background: '#f4f6fb' }} rowSpan={monthLessons.length}>
                          {MONTH_NAMES[mi]}
                        </td>
                      )}
                      <td style={{ ...cellStyle, textAlign: 'left' }}>제{l.lesson_number}강 · {l.title}</td>
                      {[0, 1, 2].map((col) => {
                        const a = la[col];
                        if (!a) return <td key={col} style={{ ...cellStyle, color: '#bbb' }}>–</td>;
                        const sc = scoreOf(a.id);
                        return (
                          <td key={col} style={cellStyle}>
                            {sc != null ? sc : <span style={{ color: '#bbb' }}>–</span>}
                          </td>
                        );
                      })}
                      <td style={{ ...cellStyle, fontWeight: 600 }}>
                        {t.hasAny ? t.got + ' / ' + t.max : <span style={{ color: '#bbb' }}>미제출</span>}
                      </td>
                    </tr>
                  );
                });
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...headStyle, textAlign: 'right' }} colSpan={5}>연간 총점</td>
              <td style={headStyle}>{yt.got} / {yt.max}</td>
            </tr>
          </tfoot>
        </table>
        <p style={{ fontSize: 13, color: '#888', marginTop: 12 }}>
          ※ 선생님이 발송한 점수만 반영됩니다. 채점 중이거나 미제출한 과제는 –로 표시됩니다.
        </p>
      </div>
    </>
  );
}