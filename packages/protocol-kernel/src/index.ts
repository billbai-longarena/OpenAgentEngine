export interface KernelHeartbeat {
  timestamp: string;
  caste: string;
  branch: string;
}

export function createHeartbeat(caste: string, branch: string): KernelHeartbeat {
  return {
    timestamp: new Date().toISOString(),
    caste,
    branch
  };
}
