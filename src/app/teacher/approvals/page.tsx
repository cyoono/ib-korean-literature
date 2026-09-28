'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TeacherHeader from '@/app/components/TeacherHeader';
type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  created_at: string;
  phone_last4?: string | null;
};

type Filter = 'pending' | 'active' | 'rejected' | 'all';

const NAVY = '#1F3A6E';
const RED = '#B23A48';

export default function ApprovalsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(first = false) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, role, status, created_at, phone_last4')
      .order('created_at', { ascending: false });
    if (error) {
      setMsg('목록을 불러오지 못했습니다: ' + error.message);
    } else {
      const list = (data as Profile[]) || [];
      setProfiles(list);
      /* 처음 열 때 승인 대기가 없으면 활성 회원 목록을 바로 보여 준다 */
      if (first && !list.some((p) => p.status === 'pending')) setFilter('active');
    }
    setLoading(false);
  }

  useEffect(() => { load(true); }, []);

  async function setStatus(p: Profile, status: 'active' | 'rejected') {
    if (status === 'rejected' && !window.confirm((p.name || p.email) + ' 님의 가입을 거절할까요?')) return;
    setBusyId(p.id);
    setMsg('');
    const { error } = await supabase.from('profiles').update({ status }).eq('id', p.id);
    if (error) {
      setMsg('처리 실패: ' + error.message);
    } else {
      setMsg((p.name || p.email) + ' 님을 ' + (status === 'active' ? '승인' : '거절') + ' 처리했습니다.');
      await load();
    }
    setBusyId(null);
  }

  const shown = filter === 'all' ? profiles : profiles.filter((p) => p.status === filter);
  const count = (s: string) => profiles.filter((p) => p.status === s).length;

  function badge(s: string) {
    const map: Record<string, [string, string, string]> = {
      pending: ['승인 대기', '#8a6d1a', '#fdf6e3'],
      active: ['활성', '#1f6e3a', '#e8f5ec'],
      rejected: ['거절됨', RED, '#faecec'],
    };
    const item = map[s] || [s, '#555', '#eee'];
    return (
      <span style={{ color: item[1], background: item[2], padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
        {item[0]}
      </span>
    );
  }

  if (loading) return <div className="loading-note">불러오는 중...</div>;

  return (
    <>
      <TeacherHeader />

      <div className="container">
        <h1 style={{ color: NAVY, fontSize: 22, marginBottom: 16 }}>가입 승인 관리</h1>

        <div className="t-stats">
          <div className="t-stat" style={{ cursor: 'pointer' }} onClick={() => setFilter('pending')}><div className="num">{count('pending')}</div><div className="label">승인 대기</div></div>
          <div className="t-stat" style={{ cursor: 'pointer' }} onClick={() => setFilter('active')}><div className="num">{count('active')}</div><div className="label">활성 회원</div></div>
          <div className="t-stat" style={{ cursor: 'pointer' }} onClick={() => setFilter('rejected')}><div className="num">{count('rejected')}</div><div className="label">거절됨</div></div>
        </div>

        <div className="filter-row">
          <button className={filter === 'pending' ? 'f-btn on' : 'f-btn'} onClick={() => setFilter('pending')}>승인 대기 ({count('pending')})</button>
          <button className={filter === 'active' ? 'f-btn on' : 'f-btn'} onClick={() => setFilter('active')}>활성 회원 ({count('active')})</button>
          <button className={filter === 'rejected' ? 'f-btn on' : 'f-btn'} onClick={() => setFilter('rejected')}>거절됨 ({count('rejected')})</button>
          <button className={filter === 'all' ? 'f-btn on' : 'f-btn'} onClick={() => setFilter('all')}>전체 ({profiles.length})</button>
        </div>

        {msg && (
          <div style={{ background: '#fffbe8', border: '1px solid #e8d98a', padding: '10px 14px', margin: '12px 0', fontSize: 14 }}>
            {msg}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="empty-note">
            {filter === 'pending' ? '승인 대기 중인 가입 신청이 없습니다. 위의 "활성 회원"을 누르면 가입된 학생을 볼 수 있습니다.' : '해당하는 회원이 없습니다.'}
          </div>
        ) : (
          shown.map((p) => (
            <div className="sub-card" key={p.id}>
              <div className="sub-head" style={{ cursor: 'default' }}>
                <div>
                  <div className="sub-student">
                    {p.name || '(이름 없음)'} <span className="sub-email">{p.email}</span>
                  </div>
                  <div className="sub-meta">
                    {p.role === 'teacher' ? '선생님' : '학생'}
                    {p.phone_last4 ? ' · 연락처 끝 ' + p.phone_last4 : ''}
                    {' · 가입 신청 ' + new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {badge(p.status)}
                  {p.status === 'pending' && (
                    <>
                      <button
                        onClick={() => setStatus(p, 'active')}
                        disabled={busyId === p.id}
                        style={{ background: NAVY, color: '#fff', border: 'none', padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                      >
                        승인
                      </button>
                      <button
                        onClick={() => setStatus(p, 'rejected')}
                        disabled={busyId === p.id}
                        style={{ background: RED, color: '#fff', border: 'none', padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                      >
                        거절
                      </button>
                    </>
                  )}
                  {p.status === 'rejected' && (
                    <button
                      onClick={() => setStatus(p, 'active')}
                      disabled={busyId === p.id}
                      style={{ background: NAVY, color: '#fff', border: 'none', padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      다시 승인
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}