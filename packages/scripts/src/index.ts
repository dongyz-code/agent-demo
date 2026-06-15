import { arrUnique, fse, run } from '@repo/utils-node';
import { join } from 'node:path';
import { parse } from 'yaml';
import { projectDir } from './config.js';

type Version = {
  version: string;
};

type Lock = {
  /** 定义在 package.json 里的 */
  importers: {
    [key in string]: {
      [key2 in string]: {
        [Pkg in string]: Version;
      };
    };
  };
  /** 所有 pkg */
  packages: Record<string, unknown>;
};

run(async () => {
  const file = join(projectDir, 'pnpm-lock.yaml');
  const data: Lock = await parse(await fse.readFile(file, 'utf-8'));

  const getJsonPkg = () => {
    const allJsonPkg: Record<string, string[]> = {};

    Object.values(data.importers).forEach((items) => {
      Object.values(items).forEach((items2) => {
        Object.keys(items2).forEach((pkg) => {
          const { version } = items2[pkg];
          if (!allJsonPkg[pkg]) {
            allJsonPkg[pkg] = [];
          }
          allJsonPkg[pkg].push(version);
        });
      });
    });

    const pkgsArr = Object.keys(allJsonPkg)
      .sort()
      .map((key) => {
        return {
          name: key,
          versions: arrUnique(allJsonPkg[key]),
        };
      });

    const multVersion = pkgsArr.filter(
      (x) => x.versions.length > 1 && !x.name.startsWith('@repo/'),
    );

    console.log(multVersion);
  };

  const getAllPkg = () => {
    const pkgs: Record<string, string[]> = {};
    Object.keys(data.packages).forEach((key) => {
      const items = key.split('@');
      const name = items.slice(0, items.length - 1).join('@');
      const version = items[items.length - 1];

      if (!pkgs[name]) {
        pkgs[name] = [];
      }
      pkgs[name].push(version);
    });
    const pkgsArr = Object.keys(pkgs)
      .sort()
      .map((key) => {
        return {
          name: key,
          versions: pkgs[key],
        };
      });
    const multVersion = pkgsArr.filter((x) => x.versions.length > 1);

    console.log(multVersion);
  };

  getAllPkg();
  getJsonPkg();
});
