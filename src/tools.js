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
} from "./graph.js";

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
        "Instagram exige imageUrl o videoUrl (no admite publicaciones de solo texto).",
      inputSchema: {
        platform: z.enum(["facebook", "instagram", "both"]),
        message: z.string().describe("Texto del post o caption"),
        imageUrl: z.string().url().optional().describe("URL publica de una imagen"),
        videoUrl: z.string().url().optional().describe("URL publica de un video (IG lo publica como Reel)"),
        linkUrl: z.string().url().optional().describe("Solo Facebook: enlace a incluir en un post de texto"),
      },
    },
    async ({ platform, message, imageUrl, videoUrl, linkUrl }) => {
      try {
        const results = {};
        if (platform === "facebook" || platform === "both") {
          results.facebook = await publishFacebookPost({
            pageId: requirePageId(),
            message,
            imageUrl,
            videoUrl,
            linkUrl,
          });
        }
        if (platform === "instagram" || platform === "both") {
          results.instagram = await publishInstagramPost({
            igBusinessId: requireIgId(),
            imageUrl,
            videoUrl,
            caption: message,
          });
        }
        return text(results);
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
}
