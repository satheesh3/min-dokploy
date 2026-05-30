import { router, publicProc } from '../trpc'
import { TRPCError } from '@trpc/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'

// Forward every Set-Cookie header from a BetterAuth Response onto the
// Next.js ServerResponse so the browser actually receives the session cookie.
function forwardCookies(response: Response, res: import('http').ServerResponse) {
  const cookies = response.headers.getSetCookie?.() ?? []
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies)
  } else {
    const single = response.headers.get('set-cookie')
    if (single) res.setHeader('Set-Cookie', single)
  }
}

export const authRouter = router({
  getSession: publicProc.query(({ ctx }) => {
    return ctx.session
  }),

  signUp: publicProc
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const response = await auth.api.signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          name: input.name ?? input.email.split('@')[0],
        },
        headers: ctx.req.headers as unknown as Headers,
        asResponse: true,
      })

      forwardCookies(response, ctx.res)

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Sign-up failed' }))
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message ?? 'Sign-up failed' })
      }

      return response.json()
    }),

  signIn: publicProc
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const response = await auth.api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
        },
        headers: ctx.req.headers as unknown as Headers,
        asResponse: true,
      })

      forwardCookies(response, ctx.res)

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Invalid credentials' }))
        throw new TRPCError({ code: 'UNAUTHORIZED', message: err.message ?? 'Invalid credentials' })
      }

      return response.json()
    }),

  signOut: publicProc.mutation(async ({ ctx }) => {
    const response = await auth.api.signOut({
      headers: ctx.req.headers as unknown as Headers,
      asResponse: true,
    })

    forwardCookies(response, ctx.res)

    return { success: true }
  }),
})
