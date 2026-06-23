import { resolve } from 'node:path';

export type EnvConfig = {
  dataRoot: string;
  useFileStorage: boolean;
};

const DEFAULT_DATA_ROOT = './data';

export const loadEnvConfig = (env: NodeJS.ProcessEnv = process.env): EnvConfig => {
  const dataRootRaw = env.DATA_ROOT?.trim();
  const dataRoot = resolve(dataRootRaw && dataRootRaw.length > 0 ? dataRootRaw : DEFAULT_DATA_ROOT);
  const useFileStorage = env.USE_FILE_STORAGE === 'true';

  return { dataRoot, useFileStorage };
};
