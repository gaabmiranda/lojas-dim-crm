import { db } from '@/db/client'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return NextResponse.json({ status: 'ok', db: 'ok' })
  } catch {
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 })
  }
}
