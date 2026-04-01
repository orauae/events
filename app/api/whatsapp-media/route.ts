import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { createId } from "@paralleldrive/cuid2"
import { requireAuth } from "@/lib/auth-server"

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "whatsapp")
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]

// File magic bytes for image type validation
const FILE_SIGNATURES: Record<string, number[]> = {
  "image/jpeg": [0xFF, 0xD8, 0xFF],
  "image/png": [0x89, 0x50, 0x4E, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF header (WebP starts with RIFF....WEBP)
}

function validateFileSignature(buffer: Buffer, mimeType: string): boolean {
  const signature = FILE_SIGNATURES[mimeType]
  if (!signature) return false
  
  if (buffer.length < signature.length) return false
  
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false
  }
  
  // Additional WebP check: bytes 8-11 must be "WEBP"
  if (mimeType === "image/webp" && buffer.length >= 12) {
    const webpMagic = buffer.slice(8, 12).toString("ascii")
    if (webpMagic !== "WEBP") return false
  }
  
  return true
}

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth()
    
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, and WebP images are allowed" },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File size must be under 5MB" },
        { status: 400 }
      )
    }

    // Validate file extension against whitelist
    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Invalid file extension" },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Validate file magic bytes match the claimed MIME type
    if (!validateFileSignature(buffer, file.type)) {
      return NextResponse.json(
        { error: "File content does not match the declared type" },
        { status: 400 }
      )
    }

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true })

    const filename = `${createId()}.${ext}`
    const filepath = join(UPLOAD_DIR, filename)

    await writeFile(filepath, buffer)

    const publicUrl = `/uploads/whatsapp/${filename}`

    return NextResponse.json({ url: publicUrl, filename, size: file.size })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("WhatsApp media upload error:", error)
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    )
  }
}
