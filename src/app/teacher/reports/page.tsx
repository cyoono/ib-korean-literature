'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TeacherHeader from '@/app/components/TeacherHeader';

type Student = { id: string; name: string; email: string };
type Lesson = { id: string; lesson_number: number; title: string };
type Asg = { id: string; lesson_id: string; order_index: number; max_score: number };
type Sub = { user_id: string; assignment_id: string; final_score: number | null; published_to_student: boolean };

const NAVY = '#1F3A6E';
const MONTH_NAMES = ['9월', '10월', '11월', '12월', '1월', '2월', '3월', '4월', '5월', '6월'];

// 회차번호(1~20) → 월 인덱스(0~9). 2강당 1개월.
function monthIndexOf(lessonNumber: number) {
  return Math.floor((lessonNumber - 1) / 2);
}

export default function TeacherReportsPage() {
  const [teacherName, setTeacherName] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [asgs, setAsgs] = useState<Asg[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  /* 인쇄물에 찍을 출력일. 서버에서 미리 그린 화면과 어긋나지 않도록
     브라우저에 뜬 뒤에 채운다. */
  const [printedAt, setPrintedAt] = useState('');

  useEffect(() => {
    setPrintedAt(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }
      const { data: me } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
      if (!me || me.role !== 'teacher') { window.location.href = '/home'; return; }
      setTeacherName(me.name);

      const [profRes, lessonRes, asgRes, subRes] = await Promise.all([
        supabase.from('profiles').select('id, name, email').eq('role', 'student'),
        supabase.from('lessons').select('id, lesson_number, title').order('lesson_number', { ascending: true }),
        supabase.from('assignments').select('id, lesson_id, order_index, max_score'),
        supabase.from('submissions').select('user_id, assignment_id, final_score, published_to_student'),
      ]);
      setStudents((profRes.data as Student[]) || []);
      setLessons((lessonRes.data as Lesson[]) || []);
      setAsgs((asgRes.data as Asg[]) || []);
      setSubs((subRes.data as Sub[]) || []);
      setLoading(false);
    }
    init();
  }, []);

  // 특정 학생/과제의 발송된 점수 찾기 (없으면 null)
  function scoreOf(studentId: string, assignmentId: string): number | null {
    const s = subs.find(
      (x) => x.user_id === studentId && x.assignment_id === assignmentId && x.published_to_student
    );
    return s && s.final_score != null ? s.final_score : null;
  }

  // 한 회차의 과제들(order_index 순)
  function asgsOfLesson(lessonId: string): Asg[] {
    return asgs
      .filter((a) => a.lesson_id === lessonId)
      .sort((a, b) => a.order_index - b.order_index);
  }
  // 회차별 합계와 만점
  function lessonTotal(studentId: string, lessonId: string) {
    const la = asgsOfLesson(lessonId);
    let got = 0;
    let max = 0;
    let hasAny = false;
    for (const a of la) {
      max += a.max_score || 7;
      const sc = scoreOf(studentId, a.id);
      if (sc != null) { got += sc; hasAny = true; }
    }
    return { got, max, hasAny };
  }

  // 연간 총점
  function yearTotal(studentId: string) {
    let got = 0;
    let max = 0;
    for (const l of lessons) {
      const t = lessonTotal(studentId, l.id);
      got += t.got;
      max += t.max;
    }
    return { got, max };
  }

  // 월별로 회차 묶기 (9월~6월)
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
  const yt = selectedId ? yearTotal(selectedId) : null;
  const selectedStudent = students.find((s) => s.id === selectedId);

  const cellStyle: React.CSSProperties = { border: '1px solid #ddd', padding: '8px 10px', fontSize: 14, textAlign: 'center' };
  const headStyle: React.CSSProperties = { ...cellStyle, background: NAVY, color: '#fff', fontWeight: 600 };

  return (
    <>
      <TeacherHeader teacherName={teacherName} />

      <div className="container report-print">
        <h1 className="no-print" style={{ color: NAVY, fontSize: 22, marginBottom: 16 }}>연간 리포트 카드</h1>

        <div className="no-print" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14, fontWeight: 600 }}>학생 선택</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', minWidth: 240 }}
          >
            <option value="">— 학생을 선택하세요 —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
            ))}
          </select>
          {selectedId && (
            <button
              onClick={() => window.print()}
              style={{ background: NAVY, color: '#fff', border: 'none', padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              인쇄 / PDF 저장
            </button>
          )}
        </div>

        {!selectedId ? (
          <div className="empty-note">학생을 선택하면 연간 성적표가 표시됩니다.</div>
        ) : (
          <>
            {/* 인쇄할 때만 나오는 머리글 */}
            <div className="print-head">
              <div className="print-brand">SATUS · 세터스 어학원</div>
              <div className="print-title">IB 글로컬 K-문학 · 연간 리포트 카드</div>
              <div className="print-meta">
                <span><strong>{selectedStudent ? selectedStudent.name : ''}</strong></span>
                <span>{selectedStudent ? selectedStudent.email : ''}</span>
                <span>출력일 {printedAt}</span>
              </div>
            </div>

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
                {groups.map((monthLessons, mi) => {
                  if (monthLessons.length === 0) return null;
                  return monthLessons.map((l, idx) => {
                    const la = asgsOfLesson(l.id);
                    const t = lessonTotal(selectedId, l.id);
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
                          const sc = scoreOf(selectedId, a.id);
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
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...headStyle, textAlign: 'right' }} colSpan={5}>연간 총점</td>
                  <td style={headStyle}>{yt ? yt.got + ' / ' + yt.max : ''}</td>
                </tr>
              </tfoot>
            </table>
            <p style={{ fontSize: 13, color: '#888', marginTop: 12 }}>
              ※ 선생님이 발송한 점수만 반영됩니다. 미제출·미발송 과제는 –로 표시됩니다.
            </p>
            <div className="print-sign">
              <div className="print-sign-line">담당 강사 {teacherName}</div>
              <div className="print-sign-rule" />
            </div>
          </>
        )}
      </div>
    </>
  );
}
