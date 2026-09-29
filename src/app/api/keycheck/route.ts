import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* 진단용: 서버가 읽는 API 키의 앞뒤 몇 글자와 길이만 보여 준다 (키 전체는 절대 노출하지 않음) */
export async function GET() {
  const raw = process.env.ANTHROPIC_API_KEY;
  if (!raw) return NextResponse.json({ found: false, note: 'ANTHROPIC_API_KEY 환경변수가 없습니다.' });
  const key = raw.trim().replace(/^["']|["']$/g, '').trim();
  return NextResponse.json({
    found: true,
    starts: key.slice(0, 16) + '...',
    ends: '...' + key.slice(-3),
    length: key.length,
    hadSpacesOrQuotes: raw !== key,
    note: '콘솔의 키 표시(sk-ant-api03-5IZ...qAA)와 앞뒤가 같은지 비교하세요. 정상 키 길이는 보통 108자입니다.',
  });
}
