export function getRegistryHost(): string {
  return process.env.REGISTRY_HOST ?? '127.0.0.1:5000'
}

export function imageTag(deploymentId: string): string {
  return `${getRegistryHost()}/dep-${deploymentId}:latest`
}
