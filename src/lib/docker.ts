import Dockerode from 'dockerode'

export const docker = new Dockerode({ socketPath: '/var/run/docker.sock' })

export async function assertDockerConnected(): Promise<void> {
  await docker.ping()
  console.log('Docker connection verified')
}
