import { createNextApiHandler } from '@trpc/server/adapters/next'
import { appRouter } from '@/trpc/routers/_app'
import { createContext } from '@/trpc/context'

export default createNextApiHandler({
  router: appRouter,
  createContext,
  onError: ({ error, path }) => {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      console.error(`tRPC error on ${path}:`, error)
    }
  },
})
