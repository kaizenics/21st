import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { Database } from "@/types/supabase"
import dotenv from "dotenv"

// Load environment variables
dotenv.config({ path: ".env.local" })

const BUCKET_NAME = "components-code"
const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
]

// Check for required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`)
    process.exit(1)
  }
}

// Initialize clients
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.NEXT_PUBLIC_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

async function purgeComponentCache(
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
    ].filter((path): path is string => typeof path === "string") // Type guard to ensure only strings

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

async function main() {
  const identifier = process.argv[2]

  if (!identifier) {
    console.error("Please provide a component identifier in format: userId/componentSlug")
    process.exit(1)
  }

  const [userId, componentSlug] = identifier.split("/")

  if (!userId || !componentSlug) {
    console.error("Invalid identifier format. Expected: userId/componentSlug")
    process.exit(1)
  }

  try {
    console.log(`Purging cache for component: ${userId}/${componentSlug}`)
    const result = await purgeComponentCache(supabase, r2Client, {
      userId,
      componentSlug,
    })
    console.log("Cache purged successfully!", result)
  } catch (error) {
    console.error("Failed to purge cache:", error)
    process.exit(1)
  }
}

main() 