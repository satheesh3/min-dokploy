import type { NextApiRequest, NextApiResponse } from 'next'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import type { AuthSession } from '@/lib/auth'

export interface Context {
  req: NextApiRequest
  res: NextApiResponse
  session: AuthSession | null
  db: typeof db
}

export async function createContext({
  req,
  res,
}: {
  req: NextApiRequest
  res: NextApiResponse
}): Promise<Context> {
  const session = await auth.api
    .getSession({ headers: req.headers as unknown as Headers })
    .catch(() => null)
  return { req, res, session, db }
}
