import { z } from "zod";
import {
  publishFacebookPost,
  publishInstagramPost,
  listFacebookPosts,
  listInstagramMedia,
  listComments,
  getComment,
  replyFacebookComment,
  replyInstagramComment,
  getFacebookPostInsights,
  getInstagramMediaInsights,
  getFacebookPageInsights,
  getInstagramAccountInsights,
} from "./graph.js";
import { saveMedia } from "./media.js";

function text(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorText(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

function requirePageId() {
  const pageId = process.env.META_PAGE_ID;
  if (!pageId) throw new Error("Falta META_PAGE_ID en el entorno (.env)");
  return pageId;
}

function requireIgId() {
  const igId = process.env.META_IG_BUSINESS_ID;
  if (!igId) throw new Error("Falta META_IG_BUSINESS_ID en el entorno (.env)");
  return igId;
}

export function registerTools(server) {
  server.registerTool(
    "publish_post",
    {
      title: "Publicar en Facebook/Instagram",
      description:
        "Publica contenido propio en la Facebook Page y/o cuenta profesional de Instagram configuradas. " +
        "Instagram exige imageUrl/videoUrl o media (no admite publicaciones de solo texto). " +
        "Para publicar un carrusel (varias imagenes/videos deslizables en un mismo post) usa `media` " +
        "con 2 a 10 elementos en vez de imageUrl/videoUrl.",
      inputSchema: {
        platform: z.enum(["facebook", "instagram", "both"]),
        message: z.string().describe("Texto del post o caption"),
        imageUrl: z.string().url().optional().describe("URL publica de una imagen (post de un solo elemento)"),
        videoUrl: z.string().url().optional().describe("URL publica de un video (IG lo publica como Reel)"),
        linkUrl: z.string().url().optional().describe("Solo Facebook: enlace a incluir en un post de texto"),
        media: z
          .array(
            z.object({
              url: z.string().url(),
              type: z.enum(["image", "video"]).default("image"),
            })
          )
          .min(2)
          .max(10)
          .optional()
          .describe(
            "Lista de 2 a 10 elementos para publicar un carrusel. Sustituye a imageUrl/videoUrl."
          ),
      },
    },
    async ({ platform, message, imageUrl, videoUrl, linkUrl, media }) => {
      try {
        const results = {};
        if (platform === "facebook" || platform === "both") {
          results.facebook = await publishFacebookPost({
            pageId: requirePageId(),
            message,
            imageUrl,
            videoUrl,
            linkUrl,
            media,
          });
        }
        if (platform === "instagram" || platform === "both") {
          results.instagram = await publishInstagramPost({
            igBusinessId: requireIgId(),
            imageUrl,
            videoUrl,
            caption: message,
            media,
          });
        }
        return text(results);
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.registerTool(
    "upload_media",
    {
      title: "Subir imagen/video local",
      description:
        "Sube un archivo local (imagen o video) codificado en base64 y lo publica en una URL publica " +
        "servida por este mismo servidor, para poder usarla luego en publish_post (imageUrl/videoUrl/media). " +
        "Los archivos se borran automaticamente tras unos dias (retencion configurable).",
      inputSchema: {
        filename: z.string().describe("Nombre de archivo original, ej. foto.jpg"),
        mimeType: z.string().describe("Tipo MIME, ej. image/jpeg o video/mp4"),
        dataBase64: z.string().describe("Contenido del archivo codificado en base64"),
      },
    },
    async ({ filename, mimeType, dataBase64 }) => {
      try {
        const result = saveMedia({ filename, mimeType, dataBase64 });
        return text(result);
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.registerTool(
    "list_posts",
    {
      title: "Listar historico de publicaciones propias",
      description:
        "Lee el historico de publicaciones de la propia Facebook Page o de la propia cuenta de Instagram configuradas.",
      inputSchema: {
        platform: z.enum(["facebook", "instagram"]),
        limit: z.number().int().min(1).max(100).default(10),
        after: z.string().optional().describe("Cursor de paginacion (paging.cursors.after de la respuesta anterior)"),
      },
    },
    async ({ platform, limit, after }) => {
      try {
        const data =
          platform === "facebook"
            ? await listFacebookPosts({ pageId: requirePageId(), limit, after })
            : await listInstagramMedia({ igBusinessId: requireIgId(), limit, after });
        return text(data);
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.registerTool(
    "list_comments",
    {
      title: "Listar comentarios",
      description:
        "Lista los comentarios de una publicacion propia (post de Facebook o media de Instagram), " +
        "o las respuestas anidadas de un comentario si se pasa un comment-id.",
      inputSchema: {
        objectId: z.string().describe("ID del post, media o comentario del que listar comentarios/respuestas"),
        limit: z.number().int().min(1).max(100).default(25),
        after: z.string().optional().describe("Cursor de paginacion"),
      },
    },
    async ({ objectId, limit, after }) => {
      try {
        const data = await listComments({ objectId, limit, after });
        return text(data);
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.registerTool(
    "get_comment",
    {
      title: "Leer un comentario",
      description: "Obtiene el detalle de un comentario concreto por su ID (valido para FB e IG).",
      inputSchema: {
        commentId: z.string(),
      },
    },
    async ({ commentId }) => {
      try {
        const data = await getComment({ commentId });
        return text(data);
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.registerTool(
    "reply_comment",
    {
      title: "Responder a un comentario",
      description:
        "Responde a un comentario existente en una publicacion propia. " +
        "En Facebook crea un comentario anidado; en Instagram usa el edge de respuestas.",
      inputSchema: {
        platform: z.enum(["facebook", "instagram"]),
        commentId: z.string(),
        message: z.string(),
      },
    },
    async ({ platform, commentId, message }) => {
      try {
        const data =
          platform === "facebook"
            ? await replyFacebookComment({ commentId, message })
            : await replyInstagramComment({ commentId, message });
        return text(data);
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.registerTool(
    "get_post_insights",
    {
      title: "Metricas de una publicacion",
      description:
        "Obtiene metricas (impresiones, alcance, interacciones...) de un post propio de Facebook " +
        "o media propia de Instagram. Requiere el permiso read_insights (FB) / instagram_manage_insights " +
        "(IG) en el token. Si Meta responde con error de metrica invalida (metricas obsoletas o renombradas " +
        "segun la version de la Graph API), pasa `metrics` con los nombres vigentes para tu version.",
      inputSchema: {
        platform: z.enum(["facebook", "instagram"]),
        objectId: z.string().describe("ID del post (Facebook) o de la media (Instagram)"),
        metrics: z
          .array(z.string())
          .optional()
          .describe("Metricas a pedir. Si se omite se usa un conjunto por defecto razonable."),
        period: z
          .enum(["day", "week", "days_28", "lifetime"])
          .optional()
          .describe("Solo Facebook: periodo de agregacion de las metricas"),
      },
    },
    async ({ platform, objectId, metrics, period }) => {
      try {
        const data =
          platform === "facebook"
            ? await getFacebookPostInsights({ postId: objectId, metrics, period })
            : await getInstagramMediaInsights({ mediaId: objectId, metrics });
        return text(data);
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.registerTool(
    "get_account_insights",
    {
      title: "Metricas de la Pagina/cuenta",
      description:
        "Obtiene metricas agregadas de la propia Facebook Page o cuenta de Instagram configuradas " +
        "(alcance, impresiones, seguidores...). Requiere el permiso read_insights (FB) / " +
        "instagram_manage_insights (IG) en el token.",
      inputSchema: {
        platform: z.enum(["facebook", "instagram"]),
        metrics: z
          .array(z.string())
          .optional()
          .describe("Metricas a pedir. Si se omite se usa un conjunto por defecto razonable."),
        period: z
          .enum(["day", "week", "days_28"])
          .optional()
          .describe("Periodo de agregacion de las metricas"),
        since: z.string().optional().describe("Fecha/timestamp de inicio del rango"),
        until: z.string().optional().describe("Fecha/timestamp de fin del rango"),
      },
    },
    async ({ platform, metrics, period, since, until }) => {
      try {
        const data =
          platform === "facebook"
            ? await getFacebookPageInsights({ pageId: requirePageId(), metrics, period, since, until })
            : await getInstagramAccountInsights({ igBusinessId: requireIgId(), metrics, period, since, until });
        return text(data);
      } catch (err) {
        return errorText(err);
      }
    }
  );
}
