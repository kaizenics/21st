import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/types/supabase"
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"

const BUCKET_NAME = "components-code"

export async function purgeComponentCache(
  supabase: SupabaseClient<Database>,
  r2Client: S3Client,
  identifier: { userId: string; componentSlug: string } | { componentId: number }
) {
  try {
    // Get component data
    const { data: component, error } = await supabase
      .from("components")
      .select("id, code, demo_code, tailwind_config_extension, global_css_extension")
      .match(
        "componentId" in identifier
          ? { id: identifier.componentId }
          : { user_id: identifier.userId, component_slug: identifier.componentSlug }
      )
      .single()

    if (error || !component) {
      throw new Error(`Failed to fetch component: ${error?.message || "Component not found"}`)
    }

    // Collect all file paths that need to be purged
    const filesToPurge = [
      component.code,
      component.demo_code,
      component.tailwind_config_extension,
      component.global_css_extension,
    ].filter(Boolean) // Remove null/undefined values

    // Delete files from R2
    const deletePromises = filesToPurge.map(async (filePath) => {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: filePath,
          })
        )
      } catch (error) {
        console.error(`Failed to delete file ${filePath}:`, error)
        // Continue with other deletions even if one fails
      }
    })

    // Wait for all deletions to complete
    await Promise.all(deletePromises)

    // Reset compiled_css to null
    const { error: updateError } = await supabase
      .from("components")
      .update({ compiled_css: null })
      .eq("id", component.id)

    if (updateError) {
      throw new Error(`Failed to update component: ${updateError.message}`)
    }

    return { success: true, componentId: component.id }
  } catch (error) {
    console.error("Error in purgeComponentCache:", error)
    throw error
  }
} 