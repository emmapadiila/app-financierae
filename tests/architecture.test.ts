import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const sourceFiles = filesUnder(resolve('src'));
describe('architecture boundaries', () => {
  it('keeps the entire core dependency graph independent of React and UI modules', () => {
    const queue = sourceFiles.filter(
      (path) => /[\\/](domain|infrastructure|services)[\\/]/.test(path) && path.endsWith('.ts'),
    );
    const visited = new Set<string>();
    while (queue.length) {
      const path = queue.pop()!;
      if (visited.has(path)) continue;
      visited.add(path);
      expect(path, `Core dependency: ${path}`).not.toMatch(
        /\.tsx$|[\\/](pages|components|providers|state)[\\/]/,
      );
      const source = ts.preProcessFile(readFileSync(path, 'utf8'), true);
      for (const imported of source.importedFiles) {
        expect(imported.fileName, `${path} imports ${imported.fileName}`).not.toMatch(
          /^react(?:-dom|-router-dom)?(?:\/|$)/,
        );
        if (!imported.fileName.startsWith('.') && !imported.fileName.startsWith('@/')) continue;
        const base = imported.fileName.startsWith('@/')
          ? resolve('src', imported.fileName.slice(2))
          : resolve(dirname(path), imported.fileName);
        const dependency = [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          join(base, 'index.ts'),
          join(base, 'index.tsx'),
        ].find((candidate) => existsSync(candidate) && /\.[jt]sx?$/.test(candidate));
        expect(dependency, `Unresolved dependency ${base}`).toBeDefined();
        if (dependency) queue.push(dependency);
      }
    }
    expect(visited.size).toBeGreaterThan(15);
  });

  it('prevents pages and components, including providers, from accessing database APIs', () => {
    for (const path of sourceFiles.filter((file) => file.endsWith('.tsx'))) {
      const text = readFileSync(path, 'utf8');
      const source = ts.preProcessFile(text, true);
      for (const imported of source.importedFiles)
        expect(imported.fileName, path).not.toMatch(/dexie|indexeddb|infrastructure\/storage/i);
      expect(text, path).not.toMatch(
        /\b(indexedDB|IDBDatabase|IDBTransaction|FinanceDatabase)\b|\.database\b|\.repositories\b/,
      );
    }
  });
});
