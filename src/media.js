import fs from "fs";
import path from "path";
import crypto from "crypto";

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export function mediaDir() {
  const dir = process.env.MEDIA_DIR || path.join(process.cwd(), "media");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extensionFor(mimeType, filename) {
  const fromName = path.extname(filename || "").replace(".", "").toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return MIME_EXT[mimeType] || "bin";
}

function publicBaseUrl() {
  const base = process.env.MEDIA_BASE_URL;
  if (!base) throw new Error("Falta MEDIA_BASE_URL en el entorno (.env)");
  return base.replace(/\/+$/, "");
}

export function saveMedia({ filename, mimeType, dataBase64 }) {
  if (!mimeType || !(mimeType.startsWith("image/") || mimeType.startsWith("video/"))) {
    throw new Error("mimeType debe ser image/* o video/*");
  }
  if (!dataBase64) throw new Error("Falta dataBase64");

  const buffer = Buffer.from(dataBase64, "base64");
  const maxBytes = (Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024;
  if (buffer.length === 0) throw new Error("El contenido decodificado esta vacio");
  if (buffer.length > maxBytes) {
    throw new Error(`El archivo supera el limite de ${maxBytes / (1024 * 1024)}MB`);
  }

  const ext = extensionFor(mimeType, filename);
  const id = crypto.randomUUID();
  const storedName = `${id}.${ext}`;
  fs.writeFileSync(path.join(mediaDir(), storedName), buffer);

  cleanupOldMedia();

  return {
    url: `${publicBaseUrl()}/media/${storedName}`,
    storedName,
    sizeBytes: buffer.length,
  };
}

function cleanupOldMedia() {
  const retentionDays = Number(process.env.MEDIA_RETENTION_DAYS) || 7;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const dir = mediaDir();
  for (const name of fs.readdirSync(dir)) {
    const filePath = path.join(dir, name);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
    } catch {
      // ignora errores de limpieza puntuales, no deben afectar la subida actual
    }
  }
}
