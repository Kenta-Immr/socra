import { createClient } from '@/lib/supabase/server'

export async function DELETE(req: Request) {
  const { id } = await req.json() as { id: string }

  if (!id || typeof id !== 'string') {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = createClient()

  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Delete session error:', error)
    return Response.json({ error: error.message, code: error.code, details: error.details }, { status: 500 })
  }

  return Response.json({ success: true })
}
