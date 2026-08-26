const BASE = "https://graph.facebook.com";

function ver() {
  return process.env.META_GRAPH_VERSION || "v21.0";
}

// El campo paging.next/previous que devuelve la Graph API incluye el access_token
// en la propia URL (para poder seguir el cursor sin credenciales aparte). Como esa
// respuesta se reenvia tal cual al modelo, hay que quitarlo antes de devolverla.
function stripTokenFromPaging(data) {
  if (!data || !data.paging) return data;
  for (const key of ["next", "previous"]) {
    const link = data.paging[key];
    if (typeof link !== "string") continue;
    try {
      const u = new URL(link);
      u.searchParams.delete("access_token");
      data.paging[key] = u.toString();
    } catch {
      // URL no parseable: la dejamos como esta
    }
  }
  return data;
}

async function graphRequest(path, { method = "GET", params = {} } = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("Falta META_ACCESS_TOKEN en el entorno (.env)");

  const url = new URL(`${BASE}/${ver()}/${path}`);
  const qs = { ...params, access_token: token };
  Object.entries(qs).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), { method });
  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data?.error?.message || res.statusText;
    const code = data?.error?.code;
    throw new Error(`Graph API error (${path})${code ? ` [${code}]` : ""}: ${msg}`);
  }
  return stripTokenFromPaging(data);
}

// ---------- Publicacion: Facebook Page ----------

export async function publishFacebookPost({ pageId, message, imageUrl, videoUrl, linkUrl, media }) {
  if (media && media.length >= 2) {
    return publishFacebookCarousel({ pageId, message, media, linkUrl });
  }
  if (videoUrl) {
    return graphRequest(`${pageId}/videos`, {
      method: "POST",
      params: { file_url: videoUrl, description: message },
    });
  }
  if (imageUrl) {
    return graphRequest(`${pageId}/photos`, {
      method: "POST",
      params: { url: imageUrl, caption: message },
    });
  }
  return graphRequest(`${pageId}/feed`, {
    method: "POST",
    params: { message, link: linkUrl },
  });
}

// FB multi-foto/video: cada elemento se sube sin publicar y luego se referencia
// desde un post de feed via attached_media.
async function publishFacebookCarousel({ pageId, message, media, linkUrl }) {
  if (media.length < 2 || media.length > 10) {
    throw new Error("Un post multi-foto/video de Facebook admite entre 2 y 10 elementos");
  }
  const attachments = [];
  for (const item of media) {
    const isVideo = item.type === "video";
    const uploaded = await graphRequest(`${pageId}/${isVideo ? "videos" : "photos"}`, {
      method: "POST",
      params: isVideo
        ? { file_url: item.url, published: "false" }
        : { url: item.url, published: "false" },
    });
    attachments.push({ media_fbid: uploaded.id });
  }

  const params = { message, link: linkUrl };
  attachments.forEach((att, i) => {
    params[`attached_media[${i}]`] = JSON.stringify(att);
  });

  return graphRequest(`${pageId}/feed`, { method: "POST", params });
}

// ---------- Publicacion: Instagram (cuenta profesional) ----------

export async function publishInstagramPost({ igBusinessId, imageUrl, videoUrl, caption, media }) {
  if (media && media.length >= 2) {
    return publishInstagramCarousel({ igBusinessId, caption, media });
  }
  if (!imageUrl && !videoUrl) {
    throw new Error("Instagram requiere imageUrl o videoUrl (contenido accesible por URL publica)");
  }
  const mediaParams = videoUrl
    ? { video_url: videoUrl, media_type: "REELS", caption: caption || "" }
    : { image_url: imageUrl, caption: caption || "" };

  // 1. Crear contenedor de media
  const container = await graphRequest(`${igBusinessId}/media`, {
    method: "POST",
    params: mediaParams,
  });

  // Los videos/reels necesitan tiempo de procesamiento antes de publicarse
  if (videoUrl) {
    await waitUntilContainerReady(container.id);
  }

  // 2. Publicar el contenedor
  return graphRequest(`${igBusinessId}/media_publish`, {
    method: "POST",
    params: { creation_id: container.id },
  });
}

// IG carrusel: cada elemento es un child container (is_carousel_item=true),
// se agrupan en un container padre de tipo CAROUSEL y se publica ese.
async function publishInstagramCarousel({ igBusinessId, caption, media }) {
  if (media.length < 2 || media.length > 10) {
    throw new Error("Un carrusel de Instagram admite entre 2 y 10 elementos");
  }

  const childIds = [];
  for (const item of media) {
    const isVideo = item.type === "video";
    const child = await graphRequest(`${igBusinessId}/media`, {
      method: "POST",
      params: isVideo
        ? { video_url: item.url, is_carousel_item: "true" }
        : { image_url: item.url, is_carousel_item: "true" },
    });
    if (isVideo) {
      await waitUntilContainerReady(child.id);
    }
    childIds.push(child.id);
  }

  const parent = await graphRequest(`${igBusinessId}/media`, {
    method: "POST",
    params: { media_type: "CAROUSEL", children: childIds.join(","), caption: caption || "" },
  });
  await waitUntilContainerReady(parent.id);

  return graphRequest(`${igBusinessId}/media_publish`, {
    method: "POST",
    params: { creation_id: parent.id },
  });
}

async function waitUntilContainerReady(containerId, { timeoutMs = 60000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await graphRequest(containerId, { params: { fields: "status_code" } });
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR") {
      throw new Error(`El contenedor de Instagram fallo al procesarse (${containerId})`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout esperando a que Instagram procese el contenedor (${containerId})`);
}

// ---------- Lectura de historico propio ----------

const FB_POST_FIELDS =
  "id,message,created_time,permalink_url,full_picture,attachments{media_type,url,media},status_type";

const IG_MEDIA_FIELDS =
  "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count";

export async function listFacebookPosts({ pageId, limit = 10, after }) {
  return graphRequest(`${pageId}/posts`, {
    params: { fields: FB_POST_FIELDS, limit, after },
  });
}

export async function listInstagramMedia({ igBusinessId, limit = 10, after }) {
  return graphRequest(`${igBusinessId}/media`, {
    params: { fields: IG_MEDIA_FIELDS, limit, after },
  });
}

// ---------- Comentarios ----------

const COMMENT_FIELDS = "id,message,from,created_time,like_count,comment_count";

export async function listComments({ objectId, limit = 25, after }) {
  return graphRequest(`${objectId}/comments`, {
    params: { fields: COMMENT_FIELDS, limit, after },
  });
}

export async function getComment({ commentId }) {
  return graphRequest(commentId, { params: { fields: COMMENT_FIELDS } });
}

// FB: una respuesta es un comentario anidado, se crea igual que un comentario normal
// sobre el comment-id padre (edge /comments).
export async function replyFacebookComment({ commentId, message }) {
  return graphRequest(`${commentId}/comments`, {
    method: "POST",
    params: { message },
  });
}

// IG: las respuestas usan un edge dedicado /replies sobre el ig-comment-id.
export async function replyInstagramComment({ commentId, message }) {
  return graphRequest(`${commentId}/replies`, {
    method: "POST",
    params: { message },
  });
}

// ---------- Insights ----------
//
// Meta deprecia y renombra metricas de insights entre versiones de la Graph API con
// cierta frecuencia, asi que estas listas son solo un valor por defecto razonable:
// si la API responde con error de metrica invalida, hay que pasar `metrics` explicito
// con las metricas vigentes para la version configurada (META_GRAPH_VERSION).

const DEFAULT_FB_POST_METRICS = ["post_impressions", "post_engaged_users", "post_clicks"];
const DEFAULT_IG_MEDIA_METRICS = ["reach", "likes", "comments", "saved", "shares", "total_interactions"];
const DEFAULT_FB_PAGE_METRICS = ["page_impressions", "page_engaged_users", "page_fans"];
const DEFAULT_IG_ACCOUNT_METRICS = ["reach", "profile_views", "follower_count"];

export async function getFacebookPostInsights({ postId, metrics, period }) {
  return graphRequest(`${postId}/insights`, {
    params: { metric: (metrics?.length ? metrics : DEFAULT_FB_POST_METRICS).join(","), period },
  });
}

export async function getInstagramMediaInsights({ mediaId, metrics }) {
  return graphRequest(`${mediaId}/insights`, {
    params: { metric: (metrics?.length ? metrics : DEFAULT_IG_MEDIA_METRICS).join(",") },
  });
}

export async function getFacebookPageInsights({ pageId, metrics, period, since, until }) {
  return graphRequest(`${pageId}/insights`, {
    params: {
      metric: (metrics?.length ? metrics : DEFAULT_FB_PAGE_METRICS).join(","),
      period,
      since,
      until,
    },
  });
}

export async function getInstagramAccountInsights({ igBusinessId, metrics, period, since, until }) {
  return graphRequest(`${igBusinessId}/insights`, {
    params: {
      metric: (metrics?.length ? metrics : DEFAULT_IG_ACCOUNT_METRICS).join(","),
      period,
      since,
      until,
    },
  });
}

// ---------- Utilidades de configuracion ----------

export async function getPageAndIgIds(userToken) {
  const accounts = await graphRequest("me/accounts", {
    params: { access_token: userToken },
  });
  const results = [];
  for (const page of accounts.data || []) {
    let igId = null;
    try {
      const ig = await graphRequest(page.id, {
        params: { fields: "instagram_business_account", access_token: userToken },
      });
      igId = ig.instagram_business_account?.id || null;
    } catch {
      igId = null;
    }
    results.push({ pageId: page.id, pageName: page.name, igBusinessId: igId });
  }
  return results;
}

export async function exchangeForLongLivedToken({ appId, appSecret, shortToken }) {
  return graphRequest("oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    },
  });
}
