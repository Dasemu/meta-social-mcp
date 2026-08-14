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
  console.log(`  META_IG_BUSINESS_ID=${r.igBusinessId || "(sin cuenta IG vinculada)"}\n`);
}
console.log("Copia los valores que correspondan a tu pagina en el archivo .env");
