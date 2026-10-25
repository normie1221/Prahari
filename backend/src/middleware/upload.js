/**
 * Secure file upload for incident media.
 * Dev/local storage on disk under /uploads (served statically, see
 * server.js). In production, swap `diskStorage` for an S3 (or similar)
 * multer storage engine — the rest of the app only depends on the
 * resulting URL, so no other code needs to change.
 */
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/incidents"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG, or WEBP images are allowed."));
  }
  cb(null, true);
}

export const uploadIncidentMedia = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES, files: 5 },
});
