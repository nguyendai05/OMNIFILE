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
    if (out[0]) toast.success(`Created ${out.map((o) => o.name).join(", ")}`);
    return out;
  } catch (err) {
    toast.error(errorMessage(err));
    return [];
  }
}

export async function runRecipeUi(recipeId: string, fileIds: string[]): Promise<FileRecord[]> {
  const recipe = getRecipe(recipeId);
  toast.message(recipe ? `Running ${recipe.title}` : "Running recipe");
  try {
    const out = await runRecipe(recipeId, fileIds);
    toast.success(out[0] ? `Finished · ${out.map((o) => o.name).join(", ")}` : "Recipe finished");
    return out;
  } catch (err) {
    toast.error(errorMessage(err));
    return [];
  }
}

export async function runBatchUi(actionId: string, fileIds: string[]) {
  toast.message(`Batch · ${fileIds.length} files`);
  try {
    const results = await runBatch(actionId, fileIds);
    const failed = results.filter((r) => !r.ok).length;
    if (failed) toast.error(`${failed} of ${results.length} failed — inspect Jobs`);
    else toast.success(`Batch finished · ${results.length} files`);
    return results;
  } catch (err) {
    toast.error(errorMessage(err));
    return [];
  }
}
