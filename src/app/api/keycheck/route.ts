import { NextResponse } from 'next/server';
import { resolveAnthropic, resolveWorkspaceId } from '@/lib/anthropicKey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* 진단용: 실제로 쓰는 키의 출처(변수 이름)와 앞뒤 몇 글자·길이만 보여 준다. 키 전체는 노출하지 않음 */
export async function GET() {
  const { key, source, baseUrl } = resolveAnthropic();
  const otherNames = Object.entries(process.env)
    .filter(([, v]) => (v || '').trim().startsWith('sk-ant-'))
    .map(([n]) => n);
  return NextResponse.json({
    using: source || '(없음)',
    starts: key ? key.slice(0, 16) + '...' : '',
    ends: key ? '...' + key.slice(-3) : '',
    length: key.length,
    viaGateway: baseUrl !== 'https://api.anthropic.com',
    varsWithRealKey: otherNames,
    workspaceId: resolveWorkspaceId() || '(없음)',
    workspaceVarRaw: process.env.ANTHROPIC_WORKSPACE_ID ? (process.env.ANTHROPIC_WORKSPACE_ID.trim().slice(0, 8) + '...') : '(없음)',
    ok: key.startsWith('sk-ant-') && key.length > 90,
  });
}
