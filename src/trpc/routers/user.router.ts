import { router, protectedProc } from '../trpc'

export const userRouter = router({
  me: protectedProc.query(({ ctx }) => {
    const { id, email, name, createdAt } = ctx.session.user
    return { id, email, name, createdAt }
  }),
})
