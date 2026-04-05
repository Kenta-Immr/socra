import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { buildSystemPrompt, type FacilitationContext } from '@/lib/facilitation'

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages, context } = await req.json()

  const facilitationContext: FacilitationContext = {
    topic: context?.topic ?? null,
    messageCount: messages.filter((m: { role: string }) => m.role === 'user').length,
    lastQuestionDepth: context?.depth ?? 0,
  }

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: buildSystemPrompt(facilitationContext),
    messages,
  })

  return result.toDataStreamResponse()
}
