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

## 3. Obtener Page ID e Instagram Business ID

```bash
npm run get-ids
```

Copia los IDs correctos a `META_PAGE_ID` y `META_IG_BUSINESS_ID` en el `.env`.

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
| `publish_post` | Publica ya en Facebook y/o Instagram (texto, imagen, video o enlace). Instagram exige `imageUrl` o `videoUrl`. | `POST /{page-id}/feed`, `/photos`, `/videos` · `POST /{ig-id}/media` + `/media_publish` | `pages_manage_posts`, `pages_show_list`, `instagram_basic`, `instagram_content_publish` |
| `list_posts` | Lee el histórico de publicaciones propias (FB o IG). | `GET /{page-id}/posts` · `GET /{ig-id}/media` | `pages_read_engagement`, `pages_show_list`, `instagram_basic` |
| `list_comments` | Lista comentarios de un post/media propio, o respuestas de un comentario. | `GET /{object-id}/comments` | `pages_read_engagement`, `pages_manage_engagement` (FB) · `instagram_basic`, `instagram_manage_comments` (IG) |
| `get_comment` | Lee el detalle de un comentario por ID. | `GET /{comment-id}` | igual que `list_comments` |
| `reply_comment` | Responde a un comentario propio. | `POST /{comment-id}/comments` (FB) · `POST /{comment-id}/replies` (IG) | `pages_manage_engagement` (FB) · `instagram_basic`, `instagram_manage_comments` (IG) |

Todos los permisos anteriores requieren, además, `business_management` si la app opera sobre
activos gestionados desde Business Manager, y que la app haya pasado **App Review** de Meta para
usarlos fuera del modo de desarrollo/testers.

## 7. Limitaciones importantes

- **Instagram no admite publicaciones de solo texto**: siempre necesita `imageUrl` o `videoUrl`
  accesible por una **URL pública** (no vale una ruta local ni una URL que requiera login).
- Los videos/reels de Instagram necesitan tiempo de procesamiento: `publish_post` espera
  automáticamente (hasta 60s) a que el contenedor esté listo antes de publicar.
- Instagram no tiene programación nativa de publicaciones ni este servidor la implementa;
  `publish_post` publica siempre de inmediato.

## 8. Notas de cumplimiento

Este servidor solo publica y responde en las páginas/cuentas que tú administras. No automatiza
mensajes directos, comentarios en cuentas ajenas, solicitudes de amistad/seguimiento, ni scraping —
ese tipo de automatización viola las políticas de Meta y queda fuera del alcance de esta herramienta.
