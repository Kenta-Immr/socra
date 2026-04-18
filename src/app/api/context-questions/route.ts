// Stage 0 対話型: 叡（Ei）がユーザーに3問の文脈質問を生成する
import { generateObject } from 'ai'
import { z } from 'zod'
import { anthropic } from '@ai-sdk/anthropic'
import { detectCrisis, getCrisisResponse } from '@/lib/safety'

export async function POST(req: Request) {
  const { question, locale } = await req.json()

  if (!question || typeof question !== 'string') {
    return Response.json({ error: 'question is required' }, { status: 400 })
  }

  // セーフティフィルター
  if (detectCrisis(question)) {
    return Response.json(getCrisisResponse(locale))
  }

  try {
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: z.object({
        questions: z.array(z.string()).max(3).describe('Up to 3 context questions'),
      }),
      prompt: `You are Ei (叡), the mentor of Socra — an AI decision-making team.

A user has asked: "${question}"

Before your team analyzes this, you need to understand the context better. Generate up to 3 short, focused questions that will help your team give better advice.

## Priority order for questions (ask the MOST important first):
1. **What should I call you?** — Ask HOW they'd like to be called, not just their name. Frame it naturally: "Before we dive in, what should I call you?" or "なんとお呼びすればいいですか？（ニックネームでもOKです）". This lets the user choose their preferred form (first name, nickname, Mr./Ms. + surname, etc.)
2. **What is your specific situation?** — Industry, role, company size, what you actually do. Without this, the team will guess and get it wrong.
3. **What matters most to you?** — The one thing that would make this decision a success or failure

## Rules
- The FIRST question must ALWAYS ask for their name/nickname. This is non-negotiable.
- Each question should reveal critical context that PREVENTS the team from guessing wrong
- Be warm but concise. You're a mentor, not an interrogator.
- If the question is already very specific and clear, generate fewer questions (even 2 is fine) — but always ask the name.
- Questions should be in the same language as the user's question
- Each question should be 1 sentence, direct and easy to answer

Example good questions:
- "なんとお呼びすればいいですか？（ニックネームでもOKです）"
- "あなたの事業や立場を教えていただけますか？"
- "この判断で最も重視していることは何ですか？"`,
    })

    return Response.json(object)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
