# SocialMCP

Servidor MCP **HTTP** para publicar y gestionar contenido propio en Facebook Pages e Instagram
(cuentas profesionales) usando la Graph API oficial de Meta.

Publica y responde en **tu propia página/cuenta**. No envía mensajes ni interactúa con cuentas de
terceros — eso lo prohíben las políticas de Meta y este servidor no lo hace.

## 1. Requisitos previos en Meta

- Una **Página de Facebook** de la que seas admin.
- Una **cuenta de Instagram profesional** (Business o Creator) **vinculada a esa página**.
- Una app en [developers.facebook.com/apps](https://developers.facebook.com/apps), tipo "Business", con los productos:
  - **Facebook Login for Business**
  - **Instagram Graph API**

## 2. Obtener el token de acceso

1. En el panel de tu app, ve a **Graph API Explorer**.
2. Selecciona tu app y en "Permisos" añade los que necesites (ver tabla de la sección 6).
3. Genera el token de acceso (será uno "corto", de ~1 hora).
4. Copia ese token, tu **App ID** y **App Secret** (Configuración > Básica de la app) a tu `.env`:

```bash
cp .env.example .env
# rellena META_ACCESS_TOKEN (el corto), META_APP_ID, META_APP_SECRET
```

5. Instala dependencias y convierte el token en uno de larga duración (60 días):

```bash
npm install
npm run extend-token
```

6. Copia el token resultante a `META_ACCESS_TOKEN` en tu `.env` (sobrescribe el corto).

## 3. Obtener Page ID, Instagram Business ID y token de pagina

```bash
npm run get-ids
```

Copia `META_PAGE_ID` y `META_IG_BUSINESS_ID` de tu pagina al `.env`. Este comando tambien imprime el
**Page Access Token** de cada pagina — sustituye `META_ACCESS_TOKEN` por ese valor (no el token de
usuario) para que `publish_post` y el resto de herramientas operen correctamente sobre la pagina.
Como sale de un token de usuario ya de larga duracion, el Page Access Token resultante no caduca
(mientras no cambies la contrasena de la cuenta ni revoques el token), asi que no hace falta
renovarlo aparte con `extend-token`.

## 4. Arrancar el servidor

```bash
npm start
```

Por defecto escucha en `http://127.0.0.1:3300/mcp` (configurable con `PORT`/`HOST` en `.env`).
El servidor es **stateless** (sin sesión persistente): cada petición JSON-RPC se atiende de forma
independiente, tal como recomienda el SDK para streamable HTTP sin estado.

Si defines `MCP_AUTH_TOKEN` en `.env`, todas las peticiones deberán incluir la cabecera
`Authorization: Bearer <ese valor>`.

## 5. Conectar el MCP a un cliente

Como es un servidor HTTP, se añade por URL en vez de por comando. Ejemplo (Claude Code):

```bash
claude mcp add --transport http socialmcp http://127.0.0.1:3300/mcp
```

## 6. Herramientas disponibles

| Herramienta | Qué hace | Endpoint(s) Graph API | Permisos necesarios |
|---|---|---|---|
| `publish_post` | Publica ya en Facebook y/o Instagram: texto, imagen, video, enlace, o un **carrusel** (2-10 elementos) via `media`. Instagram exige `imageUrl`/`videoUrl`/`media`. | `POST /{page-id}/feed`, `/photos`, `/videos` · `POST /{ig-id}/media` + `/media_publish` | `pages_manage_posts`, `pages_show_list`, `instagram_basic`, `instagram_content_publish` |
| `upload_media` | Sube un archivo local (base64) y devuelve una URL pública servida por este mismo servidor, para usarla en `publish_post`. | — (no llama a Graph API) | — |
| `list_posts` | Lee el histórico de publicaciones propias (FB o IG). | `GET /{page-id}/posts` · `GET /{ig-id}/media` | `pages_read_engagement`, `pages_show_list`, `instagram_basic` |
| `list_comments` | Lista comentarios de un post/media propio, o respuestas de un comentario. | `GET /{object-id}/comments` | `pages_read_engagement`, `pages_manage_engagement` (FB) · `instagram_basic`, `instagram_manage_comments` (IG) |
| `get_comment` | Lee el detalle de un comentario por ID. | `GET /{comment-id}` | igual que `list_comments` |
| `reply_comment` | Responde a un comentario propio. | `POST /{comment-id}/comments` (FB) · `POST /{comment-id}/replies` (IG) | `pages_manage_engagement` (FB) · `instagram_basic`, `instagram_manage_comments` (IG) |
| `get_post_insights` | Metricas de un post/media propio (impresiones, alcance, interacciones...). | `GET /{post-id}/insights` (FB) · `GET /{ig-media-id}/insights` (IG) | `read_insights` (FB) · `instagram_basic`, `instagram_manage_insights` (IG) |
| `get_account_insights` | Metricas agregadas de la propia Page/cuenta IG (alcance, seguidores...). | `GET /{page-id}/insights` (FB) · `GET /{ig-id}/insights` (IG) | `read_insights` (FB) · `instagram_basic`, `instagram_manage_insights` (IG) |

Todos los permisos anteriores requieren, además, `business_management` si la app opera sobre
activos gestionados desde Business Manager, y que la app haya pasado **App Review** de Meta para
usarlos fuera del modo de desarrollo/testers.

### Carrusel (varias imágenes/videos en un post)

Pasa `media: [{ url, type }, ...]` (2 a 10 elementos, `type` es `"image"` o `"video"`) en vez de
`imageUrl`/`videoUrl`. En Facebook cada elemento se sube sin publicar y se referencia desde el post
via `attached_media`; en Instagram se crean *child containers* (`is_carousel_item=true`) agrupados
en un container padre `media_type=CAROUSEL`.

### Subir contenido local (`upload_media`)

Meta exige que `imageUrl`/`videoUrl` sean URLs públicas — no vale una ruta local. `upload_media`
recibe el archivo codificado en base64, lo guarda en `MEDIA_DIR` y lo sirve en
`MEDIA_BASE_URL/media/<archivo>` (el mismo dominio público donde ya corre este MCP, sin necesidad
de un túnel aparte). El resultado se pasa directamente como `imageUrl`/`videoUrl`/`media[].url` a
`publish_post`. Los archivos se borran automáticamente pasados `MEDIA_RETENTION_DAYS` días (por
defecto 7), y el tamaño máximo por archivo es `MAX_UPLOAD_MB` MB (por defecto 50).

### Insights (`get_post_insights` / `get_account_insights`)

Meta renombra y deprecia metricas de insights entre versiones de la Graph API con cierta
frecuencia. Ambas herramientas usan un conjunto de metricas por defecto razonable, pero si Meta
responde con un error de metrica invalida hay que pasar `metrics` explicitamente con los nombres
vigentes para tu `META_GRAPH_VERSION` (ver la referencia de [Page Insights](https://developers.facebook.com/docs/graph-api/reference/page/insights)
e [Instagram Insights](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/insights)
en la documentacion de Meta). Si el error es de permisos (`#10`/`#200`), falta el scope
`read_insights` / `instagram_manage_insights` en el token — hay que volver a autorizar la app con
ese permiso añadido.

Dos comportamientos confirmados en la practica (Graph API v26.0) que conviene tener en cuenta:

- **`get_post_insights` en Facebook siempre manda `period` explicito (por defecto `lifetime`)**.
  Si se omite `period`, Meta puede aplicar internamente una ventana de fechas reciente y estrecha
  y devolver `data: []` para cualquier post fuera de ella, sin error — parece que no hay datos
  cuando en realidad falta el parametro. Nunca se manda `since`/`until` en insights de post: no
  tiene sentido combinarlos con `period=lifetime` (que ya es "desde que se publico").
- **La familia `post_impressions*` y `post_engaged_users` esta retirada** (error `#100`) en v26.0.
  El default actual usa `post_clicks`, `post_reactions_by_type_total`, `post_reactions_like_total`
  y `post_activity_by_action_type` (validas para cualquier tipo de post). Para posts de video/reel
  tambien estan disponibles `post_video_views`, `post_video_view_time`,
  `post_video_avg_time_watched` y `blue_reels_play_count` (fallan con `#100` en posts sin video,
  por eso no van en el default) — pasalas explicitamente en `metrics` cuando el post sea de video.

## 7. Limitaciones importantes

- **Instagram no admite publicaciones de solo texto**: siempre necesita `imageUrl`, `videoUrl` o
  `media`, accesibles por una **URL pública** (no vale una ruta local ni una URL que requiera login;
  usa `upload_media` para convertir un archivo local en una URL pública).
- Los videos/reels de Instagram (y los elementos de video en un carrusel) necesitan tiempo de
  procesamiento: `publish_post` espera automáticamente (hasta 60s por elemento) a que el contenedor
  esté listo antes de publicar.
- Instagram no tiene programación nativa de publicaciones ni este servidor la implementa;
  `publish_post` publica siempre de inmediato.

## 8. Notas de cumplimiento

Este servidor solo publica y responde en las páginas/cuentas que tú administras. No automatiza
mensajes directos, comentarios en cuentas ajenas, solicitudes de amistad/seguimiento, ni scraping —
ese tipo de automatización viola las políticas de Meta y queda fuera del alcance de esta herramienta.
