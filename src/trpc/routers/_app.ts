import { router } from '../trpc'
import { authRouter } from './auth.router'
import { deploymentRouter } from './deployment.router'
import { userRouter } from './user.router'

export const appRouter = router({
  auth: authRouter,
  deployment: deploymentRouter,
  user: userRouter,
})

export type AppRouter = typeof appRouter
