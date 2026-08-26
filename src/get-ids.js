import "dotenv/config";
import { getPageAndIgIds } from "./graph.js";

const token = process.env.META_ACCESS_TOKEN;
if (!token) {
  console.error("Pon META_ACCESS_TOKEN en tu .env antes de ejecutar esto.");
  process.exit(1);
}

const results = await getPageAndIgIds(token);
console.log("\nPaginas encontradas y sus cuentas de Instagram vinculadas:\n");
for (const r of results) {
  console.log(`- Pagina: ${r.pageName}`);
  console.log(`  META_PAGE_ID=${r.pageId}`);
  console.log(`  META_IG_BUSINESS_ID=${r.igBusinessId || "(sin cuenta IG vinculada)"}`);
  console.log(`  Page Access Token: ${r.pageAccessToken}\n`);
}
console.log(
  "Copia META_PAGE_ID / META_IG_BUSINESS_ID que correspondan a tu pagina en el .env, y sustituye " +
    "META_ACCESS_TOKEN por el Page Access Token de esa pagina (si el token de usuario del que sale " +
    "es de larga duracion, este tambien lo es y no necesita renovarse aparte)."
);
