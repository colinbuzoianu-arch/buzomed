import { NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'api_key_missing' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const {
    companyName,
    year,
    totalExams,
    signed,
    apt,
    apt_conditionat,
    inapt_temporar,
    inapt,
    workers,
    workplaces,
    topHazards,
    locale,
  } = body as {
    companyName: string
    year: number
    totalExams: number
    signed: number
    apt: number
    apt_conditionat: number
    inapt_temporar: number
    inapt: number
    workers: number
    workplaces: number
    topHazards: string[]
    locale: string
  }

  const isRo = locale !== 'en'

  const systemPrompt = isRo
    ? `Ești un medic de medicina muncii care redactează raportul anual de activitate pentru un cabinet medical. Scrie formal, clar, concis. Evita repetițiile. Folosește diacritice românești corecte. Maxim 300 de cuvinte.`
    : `You are an occupational medicine physician writing an annual activity report for a medical practice. Write formally, clearly, concisely. Maximum 300 words.`

  const userPrompt = isRo
    ? `Redactează secțiunea narativă a raportului anual de activitate pentru compania "${companyName}", pentru anul ${year}.

Date statistice:
- Total examinări efectuate: ${totalExams}
- Fișe de aptitudine semnate: ${signed} (${totalExams > 0 ? Math.round((signed / totalExams) * 100) : 0}%)
- Angajați examinați: ${workers}
- Locuri de muncă: ${workplaces}
- Apți: ${apt}
- Apți condiționat: ${apt_conditionat}
- Inapți temporar: ${inapt_temporar}
- Inapți: ${inapt}
${topHazards.length > 0 ? `- Principalii factori de risc: ${topHazards.join(', ')}` : ''}

Scrie un paragraf narativ de sinteză care include: activitatea desfășurată, principalele constatări medicale, distribuția verdictelor și orice observații relevante privind starea de sănătate a angajaților examinați.`
    : `Write the narrative summary section of the annual activity report for company "${companyName}" for year ${year}.

Statistical data:
- Total examinations: ${totalExams}
- Signed fitness certificates: ${signed} (${totalExams > 0 ? Math.round((signed / totalExams) * 100) : 0}%)
- Workers examined: ${workers}
- Workplaces: ${workplaces}
- Fit: ${apt}
- Conditionally fit: ${apt_conditionat}
- Temporarily unfit: ${inapt_temporar}
- Unfit: ${inapt}
${topHazards.length > 0 ? `- Main risk factors: ${topHazards.join(', ')}` : ''}

Write a narrative summary paragraph covering: activities performed, main medical findings, verdict distribution, and any relevant observations about the health status of examined employees.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const text =
      message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({ prose: text })
  } catch {
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 })
  }
}
