/** スマホなら共有シート（LINE などに送れる）、PC ならクリップボードにコピー */
export async function shareLink(url: string, text: string): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ url, text });
      return "shared";
    } catch {
      // キャンセルされたらコピーにフォールバック
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
