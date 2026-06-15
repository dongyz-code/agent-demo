import { run } from "@repo/utils-node";
import { buildAndDeployFronend } from "./lib.js";

import type { DeployParams } from "./type.js";

run(async ({ logger }) => {
  const params = JSON.parse(process.argv[2]) as DeployParams;
  await buildAndDeployFronend({
    ...params,
    logger
  });
});