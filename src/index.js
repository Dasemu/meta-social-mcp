import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";
import { mediaDir } from "./media.js";

function buildServer() {
  const server = new McpServer({ name: "socialmcp", version: "1.0.0" });
  registerTools(server);
  return server;
}

const app = express();

const uploadLimitMb = (Number(process.env.MAX_UPLOAD_MB) || 50) + 5;
app.use(express.json({ limit: `${uploadLimitMb}mb` }));

// Sirve los archivos subidos via upload_media en /media/<archivo>, publicos
// para que Meta pueda leerlos al publicar.
app.use("/media", express.static(mediaDir()));

app.use((req, res, next) => {
  const requiredToken = process.env.MCP_AUTH_TOKEN;
  if (!requiredToken) return next();
  const header = req.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (provided !== requiredToken) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// Servidor stateless: cada peticion crea su propia instancia de McpServer/transport
// (patron recomendado por el SDK para streamable HTTP sin sesion).
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error manejando peticion MCP:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (req, res) => {
  res.status(405).json({ error: "Method not allowed. Este servidor es stateless (solo POST /mcp)." });
});

app.delete("/mcp", (req, res) => {
  res.status(405).json({ error: "Method not allowed. Este servidor es stateless (solo POST /mcp)." });
});

app.get("/health", (req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT) || 3300;
const host = process.env.HOST || "127.0.0.1";

app.listen(port, host, () => {
  console.log(`SocialMCP escuchando en http://${host}:${port}/mcp`);
});
