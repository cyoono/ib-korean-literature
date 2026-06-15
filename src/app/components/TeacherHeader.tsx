'use client';

import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const MENU = [
  { href: '/teacher', label: '채점 관리' },
  { href: '/teacher/lessons', label: '회차 관리' },
  { href: '/teacher/approvals', label: '가입 승인' },
  { href: '/teacher/reports', label: '리포트' },
];

export default function TeacherHeader({ teacherName }: { teacherName?: string }) {
  const pathname = usePathname();

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const isActive = (href: string) => (href === '/teacher' ? pathname === '/teacher' : pathname.startsWith(href));

  const linkStyle = (active: boolean): React.CSSProperties => ({
    color: '#fff',
    fontSize: 14,
    marginRight: 16,
    textDecoration: active ? 'none' : 'underline',
    opacity: active ? 1 : 0.8,
    fontWeight: active ? 700 : 400,
  });

  return (
    <header className="app-header">
      <div className="logo">IB · 글로컬 K-문학<span>TEACHER</span></div>
      <div className="user-area">
        {MENU.map((m) => (
          <a key={m.href} href={m.href} style={linkStyle(isActive(m.href))}>{m.label}</a>
        ))}
        {teacherName ? <span style={{ marginRight: 12 }}>{teacherName} 선생님</span> : null}
        <button className="logout-btn" onClick={logout}>로그아웃</button>
      </div>
    </header>
  );
}