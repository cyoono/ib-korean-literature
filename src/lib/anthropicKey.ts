/* Anthropic 키 찾기.
   1) ANTHROPIC_API_KEY 가 진짜 키(sk-ant-)면 그대로
   2) 아니면 다른 이름의 환경변수 중 sk-ant- 로 시작하는 값을 찾아 사용 (예: ibkorean)
   3) 그래도 없으면 Netlify AI Gateway 가 넣어 준 임시 키 + ANTHROPIC_BASE_URL 로 호출 */
function clean(v: string | undefined) {
  return (v || '').trim().replace(/^["']|["']$/g, '').trim();
}

export function resolveAnthropic(): { key: string; source: string; baseUrl: string } {
  const primary = clean(process.env.ANTHROPIC_API_KEY);
  if (primary.startsWith('sk-ant-')) {
    return { key: primary, source: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com' };
  }
  const candidates = Object.entries(process.env)
    .filter(([name, v]) => name !== 'ANTHROPIC_API_KEY' && clean(v).startsWith('sk-ant-'))
    .sort(([a], [b]) => {
      const score = (n: string) => (/ibkorean/i.test(n) ? 0 : /anthropic|claude/i.test(n) ? 1 : 2);
      return score(a) - score(b);
    });
  if (candidates.length > 0) {
    const [name, v] = candidates[0];
    return { key: clean(v), source: name, baseUrl: 'https://api.anthropic.com' };
  }
  const gatewayBase = clean(process.env.ANTHROPIC_BASE_URL);
  if (primary && gatewayBase) {
    return { key: primary, source: 'Netlify AI Gateway', baseUrl: gatewayBase.replace(/\/+$/, '') };
  }
  return { key: primary, source: primary ? 'ANTHROPIC_API_KEY' : '', baseUrl: 'https://api.anthropic.com' };
}

/* 워크스페이스 ID(wrkspc_...) 찾기: ANTHROPIC_WORKSPACE_ID 값이 올바르면 그것,
   아니면 이름이나 값이 wrkspc_ 로 시작하는 환경변수에서 찾는다 (이름·값을 바꿔 넣은 경우 대비) */
export function resolveWorkspaceId(): string {
  const direct = clean(process.env.ANTHROPIC_WORKSPACE_ID);
  if (/^wrkspc_[A-Za-z0-9]+$/.test(direct)) return direct;
  for (const [name, v] of Object.entries(process.env)) {
    const val = clean(v);
    if (/^wrkspc_[A-Za-z0-9]+$/.test(val)) return val;
    if (/^wrkspc_[A-Za-z0-9]+$/.test(name)) return name;
  }
  return '';
}
