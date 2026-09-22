import { t as tr } from "@/lib/locale";
import { toast } from "sonner";
import { errorMessage } from "@/core/errors";
import { runAction, runBatch, runRecipe } from "@/core/engine";
import { getRecipe } from "@/core/recipes";
import type { FileRecord } from "@/core/types";

export async function runActionUi(
  actionId: string,
  fileIds: string[],
  config: Record<string, unknown> = {},
): Promise<FileRecord[]> {
  try {
    if (actionId.startsWith("recipe:")) {
      return await runRecipeUi(actionId.slice("recipe:".length), fileIds);
    }
    const out = await runAction(actionId, fileIds, config);
    if (out[0]) toast.success(tr(`Đã tạo ${out.map((o) => o.name).join(", ")}`));
    return out;
  } catch (err) {
    toast.error(tr(errorMessage(err)));
    return [];
  }
}

export async function runRecipeUi(recipeId: string, fileIds: string[]): Promise<FileRecord[]> {
  const recipe = getRecipe(recipeId);
  toast.message(tr(recipe ? `Đang chạy ${recipe.title}` : "Đang chạy quy trình mẫu"));
  try {
    const out = await runRecipe(recipeId, fileIds);
    toast.success(tr(out[0] ? `Hoàn tất · ${out.map((o) => o.name).join(", ")}` : "Đã hoàn tất quy trình mẫu"));
    return out;
  } catch (err) {
    toast.error(tr(errorMessage(err)));
    return [];
  }
}

export async function runBatchUi(actionId: string, fileIds: string[]) {
  toast.message(tr(`Xử lý hàng loạt · ${fileIds.length} tệp`));
  try {
    const results = await runBatch(actionId, fileIds);
    const failed = results.filter((r) => !r.ok).length;
    if (failed) toast.error(tr(`${failed}/${results.length} tác vụ thất bại — xem bảng Tác vụ`));
    else toast.success(tr(`Đã xử lý hàng loạt · ${results.length} tệp`));
    return results;
  } catch (err) {
    toast.error(tr(errorMessage(err)));
    return [];
  }
}
