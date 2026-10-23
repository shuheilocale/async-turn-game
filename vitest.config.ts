import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .claude/ には作業用のリポジトリのコピー（git worktree）が置かれることがあるので対象外にする
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
