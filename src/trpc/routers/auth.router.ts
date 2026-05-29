import { router, publicProc } from '../trpc'
import { auth } from '@/lib/auth'
import { z } from 'zod'

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
      const result = await auth.api.signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          name: input.name ?? input.email.split('@')[0],
        },
        headers: ctx.req.headers as unknown as Headers,
        asResponse: false,
      })
      return result
    }),

  signIn: publicProc
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await auth.api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
        },
        headers: ctx.req.headers as unknown as Headers,
        asResponse: false,
      })
      return result
    }),

  signOut: publicProc.mutation(async ({ ctx }) => {
    await auth.api.signOut({
      headers: ctx.req.headers as unknown as Headers,
    })
    return { success: true }
  }),
})
